"""Publish only validated unit aggregates from the newest dated joins workbooks."""
import argparse
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

import openpyxl

DEFAULT_SOURCE = Path('/Users/petersargent/Library/CloudStorage/GoogleDrive-petersargent@capitolareascouting.org/Shared drives/CAC-Published-Reports')
KINDS = {'cubs': ('Cub_Pack', 'Pack', 'Pack joins'), 'scouts-bsa': ('Scout_Troop', 'Troop', 'Troop joins')}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def count(value):
    require(type(value) in (int, float) and value >= 0 and int(value) == value, f'Invalid count: {value!r}')
    return int(value)


def newest(folder, kind):
    pattern = re.compile(r'CAC_All_' + KINDS[kind][0] + r'_Joins_Sept1_2026_to_(\d{4}-\d{2}-\d{2})\.xlsx')
    candidates = [(date.fromisoformat(m[1]), p) for p in folder.iterdir() if (m := pattern.fullmatch(p.name))]
    require(candidates, f'Missing {kind} joins workbook in source folder')
    return max(candidates)


def read_report(path, report_date, kind):
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    _, unit_type, main_sheet = KINDS[kind]
    require(main_sheet in workbook.sheetnames, f'Missing {main_sheet}')

    def parse(sheet):
        rows = list(sheet.values)
        require(len(rows) >= 8, 'Incomplete joins sheet')
        expected_period = f'September 1, 2026–{report_date.strftime("%B")} {report_date.day}, {report_date.year}. New youth only. Transfers and re-registrations excluded.'
        require(rows[2][0] == expected_period, 'Workbook period does not match filename')
        header = list(rows[7])
        require(header[:6] == ['Rank' if sheet.title == main_sheet else 'Council rank', unit_type, 'District', 'New joins', 'Unit ID', 'Chartered organization'], 'Unexpected unit schema')
        ages = header[6:15]
        require(ages == [f'Age {n}' for n in (range(4, 12) if kind == 'cubs' else range(10, 18))] + ['Age unavailable'], 'Unexpected age schema')
        require(header[15] == 'Review status', 'Unexpected review schema')
        units = []
        for row in rows[8:]:
            if not any(v is not None for v in row[:6]):
                continue
            require(len(row) >= 16, 'Incomplete unit row')
            rank, unit, district, joins, unit_id, organization = row[:6]
            require(isinstance(unit, str) and unit.startswith(unit_type + ' '), 'Invalid unit label')
            require(isinstance(district, str) and district.strip(), 'Missing district')
            require(str(unit_id).isdigit() or (unit_id is None and bool(row[15])), 'Invalid unit identity')
            age_counts = [count(v) for v in row[6:15]]
            require(sum(age_counts) == count(joins), f'Age totals do not reconcile for {unit_id}')
            require(row[15] is None or isinstance(row[15], str), 'Invalid review status')
            units.append(dict(rank=count(rank), unit=unit, district=district, joins=count(joins), unit_id=str(unit_id) if unit_id is not None else None, organization=organization, ages=age_counts, review=row[15] or ''))
        ids = [u['unit_id'] for u in units if u['unit_id'] is not None]
        require(len(set(ids)) == len(ids), 'Duplicate unit IDs')
        require(len({(u['district'], u['unit']) for u in units}) == len(units), 'Duplicate unit labels')
        require(len(units) == count(rows[4][1]), 'Unit count does not reconcile')
        require(sum(u['joins'] for u in units) == count(rows[5][1]), 'Join total does not reconcile')
        require([sum(u['ages'][i] for u in units) for i in range(9)] == [count(v) for v in rows[5][6:15]], 'Summary ages do not reconcile')
        review = re.match(r'(\d+) unit\(s\) need review', rows[3][0] or '')
        require(review and int(review[1]) == sum(bool(u['review']) for u in units), 'Review coverage does not reconcile')
        return units, ages

    units, ages = parse(workbook[main_sheet])
    districts = {u['district'] for u in units}
    require(set(workbook.sheetnames) == districts | {main_sheet}, 'District sheet coverage does not reconcile')
    for district in districts:
        detail, detail_ages = parse(workbook[district])
        require(detail_ages == ages and detail == [u for u in units if u['district'] == district], f'District detail differs: {district}')
    workbook.close()
    require(before == hashlib.sha256(path.read_bytes()).hexdigest(), 'Workbook changed while reading')
    return dict(program=kind, report_date=report_date.isoformat(), period_start='2026-09-01', source_name=path.name, source_sha256=before, age_labels=ages, units=units)


def build(folder, output, expected_date):
    selected = {kind: newest(folder, kind) for kind in KINDS}
    require(all(day == expected_date for day, _ in selected.values()), 'Both newest joins workbooks must match the run date')
    reports = {kind: read_report(path, day, kind) for kind, (day, path) in selected.items()}
    # Validate the complete pair before replacing the single public bundle.
    for kind, (_, path) in selected.items():
        require(hashlib.sha256(path.read_bytes()).hexdigest() == reports[kind]['source_sha256'], 'Source changed across pair read')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text('window.CAC_JOINS = ' + json.dumps(reports, ensure_ascii=False) + ';\n')
    temporary.replace(output)
    print(json.dumps({k: {'units': len(v['units']), 'joins': sum(u['joins'] for u in v['units']), 'source': v['source_name']} for k, v in reports.items()}))


def validate_public_bundle(path):
    text = Path(path).read_text()
    require(text.startswith('window.CAC_JOINS = ') and text.endswith(';\n'), 'Invalid joins bundle wrapper')
    reports = json.loads(text[len('window.CAC_JOINS = '):-2])
    require(set(reports) == set(KINDS), 'Incomplete joins program pair')
    require(len({r['report_date'] for r in reports.values()}) == 1, 'Mismatched joins dates')
    fields = {'rank','unit','district','joins','unit_id','organization','ages','review'}
    for kind, report in reports.items():
        require(set(report) == {'program','report_date','period_start','source_name','source_sha256','age_labels','units'}, 'Unexpected public report field')
        require(report['program'] == kind and report['units'], 'Missing joins population')
        date.fromisoformat(report['report_date'])
        require(len(report['age_labels']) == 9, 'Missing age buckets')
        for unit in report['units']:
            require(set(unit) == fields, 'Unexpected public unit field')
            require(len(unit['ages']) == 9 and sum(count(n) for n in unit['ages']) == count(unit['joins']), 'Invalid public joins counts')
    return reports


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--date', type=date.fromisoformat, default=datetime.now(ZoneInfo('America/Chicago')).date())
    args = parser.parse_args()
    build(args.source_dir, args.output, args.date)

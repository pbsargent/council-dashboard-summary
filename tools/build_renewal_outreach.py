"""Validate daily Movo aggregates and publish an atomic, aggregate-only browser bundle."""
from __future__ import annotations

import argparse
import calendar
from datetime import date, datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo('America/Chicago')
PREFIX = 'window.CAC_RENEWAL_OUTREACH = '
COUNTS = {'Members due': 'due', 'Adults due': 'adults_due', 'Youth due': 'youth_due',
          'Renewed': 'renewed', 'Adults renewed': 'adults_renewed', 'Youth renewed': 'youth_renewed',
          'Said no': 'said_no', 'Undecided': 'undecided', 'Not reached': 'not_reached',
          'Messaged by Movo': 'messaged', 'Replied': 'replied'}
BASE = ('due', 'adults_due', 'youth_due', 'renewed', 'said_no', 'undecided', 'not_reached')
OPTIONAL = ('adults_renewed', 'youth_renewed', 'messaged', 'replied')
OUTREACH = {'Members in outreach': 'due', 'Messaged by Movo': 'messaged',
            'Not yet messaged': 'not_messaged', 'Replied': 'replied', 'Renewed': 'renewed',
            "Renewed after Movo's first message": 'after_message',
            "Renewed before Movo's first message": 'before_message'}
REASONS = {'Said no': 'said_no', 'Adults said no': 'adults_said_no', 'Youth said no': 'youth_said_no',
           'Cost': 'cost', 'Lost interest': 'lost_interest', 'Aged out': 'aged_out', 'Moved': 'moved',
           'Unit problem': 'unit_problem', 'Other': 'other', 'No reason given': 'no_reason'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def timestamp(value):
    require(isinstance(value, str), 'Missing source timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'Source timestamp must include timezone')
    return parsed


def integer(value):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0 and int(value) == value,
            'Counts must be nonnegative integers, not blanks or text')
    return int(value)


def records(values):
    require(isinstance(values, list) and len(values) >= 2, 'Missing Movo table')
    headers = values[0]
    require(all(isinstance(x, str) and x.strip() == x and x for x in headers), 'Invalid headers')
    require(len(set(headers)) == len(headers), 'Duplicate headers')
    result = []
    for values in values[1:]:
        if not any(x is not None and x != '' for x in values):
            continue
        require(len(values) <= len(headers), 'Unexpected source columns')
        result.append(dict(zip(headers, list(values) + [None] * (len(headers) - len(values)))))
    require(result, 'Empty Movo table')
    return result


def mapped(row, fields, required):
    output = {target: integer(row[key]) if key in row else None for key, target in fields.items()}
    require(all(output[key] is not None for key in required), 'Missing required count columns')
    return output


def check_rate(row, name, numerator, denominator):
    if name not in row:
        return
    value = row[name]
    if denominator == 0:
        require(value in (None, ''), 'Zero denominator must have an undefined rate')
    else:
        require(type(value) in (int, float) and math.isfinite(value) and abs(value - 100 * numerator / denominator) <= .051,
                'Source rate differs from counts')


def cohort_identity(row):
    cohort = row.get('Cohort')
    require(isinstance(cohort, str) and re.fullmatch(r'\d{4}-\d{2}', cohort), 'Invalid cohort')
    year, month = map(int, cohort.split('-'))
    expected = date(year, month, calendar.monthrange(year, month)[1]).isoformat()
    require(row.get('Due date') == expected, 'Cohort and due date disagree')
    return cohort, expected


def district(row):
    value = row.get('District')
    require(isinstance(value, str) and 0 < len(value.strip()) <= 80, 'Missing district')
    require(not any(c in value for c in '<>@\n\r'), 'Unsafe district label')
    return value.strip()


def reconcile(rows, total, fields):
    for key in fields:
        if total.get(key) is not None:
            require(all(row.get(key) is not None for row in rows), 'Partial source count coverage')
            require(sum(row[key] for row in rows) == total[key], 'Council and district counts differ: ' + key)


def parse_source(source):
    require(set(source) == {'source_name', 'source_updated_at', 'captured_at', 'tabs'}, 'Unexpected source fields')
    updated, captured = timestamp(source['source_updated_at']), timestamp(source['captured_at'])
    require(updated <= captured, 'Source timestamp follows capture')
    require(isinstance(source['source_name'], str) and 0 < len(source['source_name']) <= 200, 'Invalid source name')
    require(set(source['tabs']) == {'Nov by district', 'Dec by district', 'Council totals', 'Outreach replies', 'Said-no reasons'}, 'Unexpected or missing source tabs')
    rows, totals, cohorts = [], {}, set()
    for tab in ('Nov by district', 'Dec by district'):
        table_rows, table_totals, table_cohorts = [], [], set()
        for raw in records(source['tabs'][tab]):
            label = district(raw)
            cohort, due_date = cohort_identity(raw)
            row = dict(district=label, cohort=cohort, due_date=due_date, **mapped(raw, COUNTS, BASE))
            require(row['adults_due'] + row['youth_due'] == row['due'], 'Adult/youth due counts disagree')
            require(sum(row[k] for k in ('renewed', 'said_no', 'undecided', 'not_reached')) == row['due'], 'Renewal states do not partition cohort')
            for key in OPTIONAL:
                if row[key] is not None:
                    require(row[key] <= row['due'], 'Optional count exceeds cohort')
            age_counts = (row['adults_renewed'], row['youth_renewed'])
            require(all(v is None for v in age_counts) or all(v is not None for v in age_counts), 'Partial age-renewal coverage')
            if age_counts[0] is not None:
                require(sum(age_counts) == row['renewed'] and row['adults_renewed'] <= row['adults_due'] and row['youth_renewed'] <= row['youth_due'], 'Age renewal counts disagree')
                check_rate(raw, 'Adult renewal rate (%)', row['adults_renewed'], row['adults_due'])
                check_rate(raw, 'Youth renewal rate (%)', row['youth_renewed'], row['youth_due'])
            check_rate(raw, 'Renewal rate (%)', row['renewed'], row['due'])
            table_cohorts.add(cohort)
            (table_totals if label == 'Council total' else table_rows).append(row)
        require(len(table_cohorts) == 1 and len(table_totals) == 1, 'Each cohort needs exactly one council total')
        cohort = next(iter(table_cohorts))
        require(cohort not in cohorts, 'Duplicated cohort')
        require(len({r['district'] for r in table_rows}) == len(table_rows), 'Duplicate district/cohort')
        reconcile(table_rows, table_totals[0], BASE + OPTIONAL)
        cohorts.add(cohort)
        totals[cohort] = table_totals[0]
        rows.extend(table_rows)
    council, combined = {}, []
    for raw in records(source['tabs']['Council totals']):
        row = mapped(raw, COUNTS, BASE + ('messaged', 'replied'))
        check_rate(raw, 'Renewal rate (%)', row['renewed'], row['due'])
        if raw.get('Cohort') == 'Both cohorts':
            combined.append(row)
        else:
            cohort, _ = cohort_identity(raw)
            require(cohort in cohorts and cohort not in council, 'Unknown or duplicate council cohort')
            for key in BASE + OPTIONAL:
                if row[key] is not None and totals[cohort][key] is not None:
                    require(row[key] == totals[cohort][key], 'Council summary and cohort sheet differ')
            council[cohort] = row
    require(set(council) == cohorts and len(combined) == 1, 'Council cohort coverage differs')
    reconcile(list(council.values()), combined[0], BASE + ('messaged', 'replied'))
    outreach, outreach_total = [], []
    expected_districts = {r['district'] for r in rows}
    for raw in records(source['tabs']['Outreach replies']):
        row = dict(district=district(raw), **mapped(raw, OUTREACH, tuple(OUTREACH.values())))
        require(row['messaged'] + row['not_messaged'] == row['due'], 'Outreach coverage differs')
        require(row['replied'] <= row['messaged'] and row['before_message'] + row['after_message'] == row['renewed'] <= row['due'], 'Outreach counts disagree')
        check_rate(raw, 'Reply rate (%)', row['replied'], row['messaged'])
        (outreach_total if row['district'] == 'Council total' else outreach).append(row)
    require(len(outreach_total) == 1 and len(outreach) == len({r['district'] for r in outreach}) and {r['district'] for r in outreach} == expected_districts, 'Outreach district coverage differs')
    reconcile(outreach, outreach_total[0], tuple(OUTREACH.values()))
    for key in ('due', 'renewed', 'messaged', 'replied'):
        require(outreach_total[0][key] == combined[0][key], 'Outreach and council totals disagree')
    for row in outreach:
        matching = [r for r in rows if r['district'] == row['district']]
        require(all(row[k] == sum(r[k] for r in matching) for k in ('due', 'renewed')), 'Outreach district and cohort counts differ')
    reasons, reason_totals = [], {}
    for raw in records(source['tabs']['Said-no reasons']):
        cohort = raw.get('Cohort')
        require(cohort in cohorts, 'Unknown reasons cohort')
        row = dict(district=district(raw), cohort=cohort, **mapped(raw, REASONS, tuple(REASONS.values())))
        require(row['adults_said_no'] + row['youth_said_no'] == row['said_no'], 'Decline age counts differ')
        require(sum(row[k] for k in ('cost', 'lost_interest', 'aged_out', 'moved', 'unit_problem', 'other', 'no_reason')) == row['said_no'], 'Decline reason counts differ')
        if row['district'] == 'Council total':
            require(cohort not in reason_totals, 'Duplicate reasons total')
            reason_totals[cohort] = row
        else:
            require(not any((r['cohort'], r['district']) == (cohort, row['district']) for r in reasons), 'Duplicate reasons row')
            match = [r for r in rows if r['cohort'] == cohort and r['district'] == row['district']]
            require(len(match) == 1 and match[0]['said_no'] == row['said_no'], 'Reasons differ from cohort')
            reasons.append(row)
    require(set(reason_totals) == {r['cohort'] for r in reasons}, 'Missing reasons council total')
    for cohort, total in reason_totals.items():
        selected = [r for r in reasons if r['cohort'] == cohort]
        require({r['district'] for r in selected} == {r['district'] for r in rows if r['cohort'] == cohort}, 'Partial reasons coverage')
        reconcile(selected, total, tuple(REASONS.values()))
        require(total['said_no'] == totals[cohort]['said_no'], 'Reasons total differs from cohort')
    return {'source_updated_at': source['source_updated_at'], 'rows': rows, 'outreach': outreach,
            'reasons': reasons, 'council': council}


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    candidate = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as handle:
            candidate = Path(handle.name)
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(candidate, path)
    finally:
        if candidate is not None:
            candidate.unlink(missing_ok=True)


def build(source_path, output, history_dir, today=None):
    today = today or datetime.now(CENTRAL).date()
    raw = Path(source_path).read_bytes()
    source = json.loads(raw)
    current = parse_source(source)
    require(timestamp(source['source_updated_at']).astimezone(CENTRAL).date() == today, 'Movo source was not updated today; prior publication preserved')
    require(timestamp(source['captured_at']).astimezone(CENTRAL).date() == today, 'Movo source was not captured today')
    require(timestamp(source['captured_at']) <= datetime.now(CENTRAL), 'Capture timestamp is in the future')
    history_dir = Path(history_dir)
    history = []
    for path in sorted(history_dir.glob('*.json')):
        old = json.loads(path.read_text())
        validated = parse_source(old)
        require(timestamp(old['source_updated_at']) <= timestamp(source['source_updated_at']), 'Current source is older than stored history')
        history.append(validated)
    history.append(current)
    daily = {}
    for snapshot in sorted(history, key=lambda x: timestamp(x['source_updated_at'])):
        daily[timestamp(snapshot['source_updated_at']).astimezone(CENTRAL).date().isoformat()] = snapshot
    bundle = {'version': 1, 'source_name': source['source_name'], 'captured_at': source['captured_at'],
              'snapshots': list(daily.values())[-90:]}
    require(Path(source_path).read_bytes() == raw, 'Source changed during build')
    # Immutable, private source snapshots; validated data is the only public output.
    history_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(history_dir, 0o700)
    name = today.isoformat() + '-' + hashlib.sha256(raw).hexdigest() + '.json'
    archive = history_dir / name
    if not archive.exists():
        atomic_write(archive, raw.decode())
        os.chmod(archive, 0o600)
    script = PREFIX + json.dumps(bundle, ensure_ascii=True, separators=(',', ':')) + ';\n'
    validate_bundle(script)
    atomic_write(output, script)
    return bundle


def validate_bundle(script):
    require(script.startswith(PREFIX) and script.endswith(';\n'), 'Invalid browser bundle')
    payload = json.loads(script[len(PREFIX):-2])
    require(set(payload) == {'version', 'source_name', 'captured_at', 'snapshots'} and payload['version'] == 1, 'Invalid public bundle schema')
    timestamp(payload['captured_at'])
    require(isinstance(payload['snapshots'], list) and 0 < len(payload['snapshots']) <= 90, 'Missing snapshot history')
    seen = set()
    previous = None
    for snapshot in payload['snapshots']:
        require(set(snapshot) == {'source_updated_at', 'rows', 'outreach', 'reasons', 'council'}, 'Invalid snapshot fields')
        stamp = timestamp(snapshot['source_updated_at'])
        require(previous is None or stamp > previous, 'History is not in chronological order')
        require(stamp <= timestamp(payload['captured_at']), 'Snapshot follows bundle capture')
        previous = stamp
        key = stamp.astimezone(CENTRAL).date()
        require(key not in seen, 'Duplicate source date')
        seen.add(key)
        for name, fields in (('rows', {'district', 'cohort', 'due_date', *BASE, *OPTIONAL}),
                             ('outreach', {'district', *OUTREACH.values()}),
                             ('reasons', {'district', 'cohort', *REASONS.values()})):
            require(isinstance(snapshot[name], list), 'Invalid public rows')
            for row in snapshot[name]:
                require(isinstance(row, dict) and set(row) == fields, 'Unapproved public fields')
                district({'District': row['district']})
                for field in fields - {'district', 'cohort', 'due_date'}:
                    if row[field] is None:
                        require(field in OPTIONAL, 'Missing required public count')
                    else:
                        integer(row[field])
                if name == 'rows':
                    cohort_identity({'Cohort': row['cohort'], 'Due date': row['due_date']})
        require(set(snapshot['council']) == {r['cohort'] for r in snapshot['rows']}, 'Invalid public council coverage')
        require(len({(r['district'], r['cohort']) for r in snapshot['rows']}) == len(snapshot['rows']), 'Duplicate public cohort identity')
        for row in snapshot['rows']:
            require(row['adults_due'] + row['youth_due'] == row['due'] and sum(row[k] for k in ('renewed', 'said_no', 'undecided', 'not_reached')) == row['due'], 'Public cohort counts disagree')
            require(all(row[k] is None or row[k] <= row['due'] for k in OPTIONAL), 'Optional public count exceeds cohort')
            require((row['adults_renewed'] is None) == (row['youth_renewed'] is None), 'Partial public age coverage')
            if row['adults_renewed'] is not None:
                require(row['adults_renewed'] + row['youth_renewed'] == row['renewed'] and row['adults_renewed'] <= row['adults_due'] and row['youth_renewed'] <= row['youth_due'], 'Public age renewal counts disagree')
        for cohort, row in snapshot['council'].items():
            reconcile([r for r in snapshot['rows'] if r['cohort'] == cohort], row, BASE)
        for row in snapshot['council'].values():
            require(set(row) == set(BASE + OPTIONAL), 'Unapproved council fields')
            for field, value in row.items():
                if value is not None:
                    integer(value)
        require(len({r['district'] for r in snapshot['outreach']}) == len(snapshot['outreach']) and {r['district'] for r in snapshot['outreach']} == {r['district'] for r in snapshot['rows']}, 'Invalid public outreach coverage')
        for row in snapshot['outreach']:
            matching = [r for r in snapshot['rows'] if r['district'] == row['district']]
            require(row['due'] == sum(r['due'] for r in matching) and row['renewed'] == sum(r['renewed'] for r in matching), 'Public outreach cohort counts disagree')
            require(row['messaged'] + row['not_messaged'] == row['due'] and row['replied'] <= row['messaged'] and row['before_message'] + row['after_message'] == row['renewed'], 'Public outreach counts disagree')
        for key in ('due', 'renewed', 'messaged', 'replied'):
            require(sum(r[key] for r in snapshot['outreach']) == sum(r[key] for r in snapshot['council'].values()), 'Public council outreach totals disagree')
        require(len({(r['district'],r['cohort']) for r in snapshot['reasons']}) == len(snapshot['reasons']), 'Duplicate public reasons')
        for row in snapshot['reasons']:
            matches=[r for r in snapshot['rows'] if (r['district'],r['cohort']) == (row['district'],row['cohort'])]
            require(len(matches)==1 and matches[0]['said_no']==row['said_no'], 'Public reasons cohort mismatch')
            require(row['adults_said_no']+row['youth_said_no']==row['said_no'] and sum(row[k] for k in ('cost','lost_interest','aged_out','moved','unit_problem','other','no_reason'))==row['said_no'], 'Public reasons counts disagree')
        for cohort in {r['cohort'] for r in snapshot['reasons']}:
            require({r['district'] for r in snapshot['reasons'] if r['cohort']==cohort} == {r['district'] for r in snapshot['rows'] if r['cohort']==cohort}, 'Partial public reason coverage')
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--history-dir', type=Path)
    parser.add_argument('--check', type=Path)
    args = parser.parse_args()
    if args.check:
        validate_bundle(args.check.read_text())
    else:
        require(all((args.source, args.output, args.history_dir)), 'Source, output and history are required')
        build(args.source, args.output, args.history_dir)
    print('Renewal Outreach: validated aggregate-only Movo cohorts, totals, rates, outreach and reason coverage.')

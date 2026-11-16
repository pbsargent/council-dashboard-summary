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
# Movo stopped sending 'Not yet messaged' on 2026-11-16. Per Peter (Mon Nov 16
# 2026, 10:08 AM CST) it is then DERIVED as Members in outreach - Messaged by
# Movo; if Messaged is unavailable it stays unavailable (None), never zero-filled.
OUTREACH_OPTIONAL = ('not_messaged',)
OUTREACH_REQUIRED = tuple(v for v in OUTREACH.values() if v not in OUTREACH_OPTIONAL)
# Movo stopped sending 'Messaged by Movo' and 'Replied' in Council totals on
# 2026-11-16. Per Peter (Mon Nov 16 2026, 10:08 AM CST) each cohort's values are
# then DERIVED from that cohort's 'Council total' row in Outreach replies (only
# when Outreach replies has per-cohort blocks); otherwise they stay None.
COUNCIL_REQUIRED = BASE
# Source notes for derived values. The public bundle schema has no per-value
# source field, so parse_source(source, provenance=[...]) reports derivations to
# callers that ask; the public snapshot itself is unchanged.
DERIVED = {
    'outreach.not_messaged': "derived: Members in outreach - Messaged by Movo (Movo did not send 'Not yet messaged')",
    'council.messaged': "derived: Outreach replies per-cohort 'Council total' Messaged by Movo (Council totals did not send it)",
    'council.replied': "derived: Outreach replies per-cohort 'Council total' Replied (Council totals did not send it)",
}
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


def as_table(values):
    """Accept a 2D array or Movo's row-object tables; return a 2D array.

    Row objects are mapped by header name: the header row is the first object's
    key order and every object must carry exactly the same keys.
    """
    require(isinstance(values, list), 'Missing Movo table')
    if all(isinstance(row, list) for row in values):
        return values
    require(all(isinstance(row, dict) for row in values), 'Invalid Movo table rows')
    headers = list(values[0])
    require(headers and all(isinstance(key, str) for key in headers), 'Invalid headers')
    require(all(len(row) == len(headers) and set(row) == set(headers) for row in values), 'Inconsistent Movo row keys')
    return [headers] + [[row[key] for key in headers] for row in values]


def records(values):
    values = as_table(values)
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


def parse_source(source, provenance=None):
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
        row = mapped(raw, COUNTS, COUNCIL_REQUIRED)
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
    derived_not_messaged, derived_council = False, set()
    outreach_records = records(source['tabs']['Outreach replies'])
    by_cohort = 'Cohort' in outreach_records[0]
    blocks = {}
    for raw in outreach_records:
        row = dict(district=district(raw), **mapped(raw, OUTREACH, OUTREACH_REQUIRED))
        if row['not_messaged'] is not None:
            require(row['messaged'] + row['not_messaged'] == row['due'], 'Outreach coverage differs')
        if row['messaged'] is not None:
            require(row['messaged'] <= row['due'], 'Outreach coverage differs')
            if row['not_messaged'] is None:
                row['not_messaged'] = row['due'] - row['messaged']  # see DERIVED['outreach.not_messaged']
                derived_not_messaged = True
        require(row['replied'] <= row['messaged'] and row['before_message'] + row['after_message'] == row['renewed'] <= row['due'], 'Outreach counts disagree')
        check_rate(raw, 'Reply rate (%)', row['replied'], row['messaged'])
        cohort = raw.get('Cohort') if by_cohort else None
        if by_cohort:
            require(cohort in cohorts, 'Unknown outreach cohort')
        block = blocks.setdefault(cohort, ([], []))
        (block[1] if row['district'] == 'Council total' else block[0]).append(row)
    if by_cohort:
        # Since 2026-11-16 Movo sends one row block per cohort, each with its own
        # Council total. Check each block against its cohort sheet, then sum the
        # reported counts per district so the public outreach rows keep their
        # combined, both-cohort meaning. A count missing in any block stays None.
        require(set(blocks) == cohorts, 'Outreach cohort coverage differs')
        for cohort, (block_rows, block_total) in blocks.items():
            cohort_rows = [r for r in rows if r['cohort'] == cohort]
            require(len(block_total) == 1 and len(block_rows) == len({r['district'] for r in block_rows})
                    and {r['district'] for r in block_rows} == {r['district'] for r in cohort_rows}, 'Outreach district coverage differs')
            reconcile(block_rows, block_total[0], tuple(OUTREACH.values()))
            for row in block_rows:
                match = [r for r in cohort_rows if r['district'] == row['district']]
                require(len(match) == 1 and all(row[k] == match[0][k] for k in ('due', 'renewed')), 'Outreach district and cohort counts differ')
            require(all(block_total[0][k] == totals[cohort][k] for k in ('due', 'renewed')), 'Outreach and cohort totals disagree')
            for key in ('messaged', 'replied'):
                value = block_total[0][key]
                if council[cohort][key] is None:
                    if value is not None:
                        require(totals[cohort][key] is None or totals[cohort][key] == value, 'Council summary and cohort sheet differ')
                        council[cohort][key] = value  # see DERIVED['council.' + key]
                        derived_council.add(key)
                else:
                    require(value is None or council[cohort][key] == value, 'Council and outreach cohort totals disagree')
        def combine(parts):
            return {k: (sum(p[k] for p in parts) if all(p[k] is not None for p in parts) else None) for k in OUTREACH.values()}
        for label in sorted({r['district'] for block_rows, _ in blocks.values() for r in block_rows}):
            outreach.append(dict(district=label, **combine([r for block_rows, _ in blocks.values() for r in block_rows if r['district'] == label])))
        outreach_total.append(dict(district='Council total', **combine([block_total[0] for _, block_total in blocks.values()])))
    else:
        outreach, outreach_total = blocks.get(None, ([], []))
    require(len(outreach_total) == 1 and len(outreach) == len({r['district'] for r in outreach}) and {r['district'] for r in outreach} == expected_districts, 'Outreach district coverage differs')
    reconcile(outreach, outreach_total[0], tuple(OUTREACH.values()))
    for key in ('due', 'renewed', 'messaged', 'replied'):
        if combined[0][key] is not None:
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
    if provenance is not None:
        fields = (['outreach.not_messaged'] if derived_not_messaged else []) + ['council.' + k for k in sorted(derived_council)]
        provenance.extend({'field': field, 'source': DERIVED[field]} for field in fields)
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


def build(source_path, output, history_dir, today=None, verification_receipt=None):
    today = today or datetime.now(CENTRAL).date()
    raw = Path(source_path).read_bytes()
    source = json.loads(raw)
    current = parse_source(source)
    verification = None
    receipt_bytes = None
    if verification_receipt is not None:
        from movo_verification import verify_receipt
        receipt_bytes = Path(verification_receipt).read_bytes()
        verification = verify_receipt(verification_receipt, source, today=today)
    else:
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
    if verification is not None:
        bundle['verification'] = verification
    require(Path(source_path).read_bytes() == raw, 'Source changed during build')
    if verification_receipt is not None:
        require(Path(verification_receipt).read_bytes() == receipt_bytes, 'Movo receipt changed during build')
        require(verify_receipt(verification_receipt, source, today=today) == verification, 'Movo evidence changed during build')
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
    require(Path(source_path).read_bytes() == raw, 'Source changed before publication')
    if verification_receipt is not None:
        require(Path(verification_receipt).read_bytes() == receipt_bytes, 'Movo receipt changed before publication')
        require(verify_receipt(verification_receipt, source, today=today) == verification, 'Movo evidence changed before publication')
    atomic_write(output, script)
    return bundle


def validate_bundle(script):
    require(script.startswith(PREFIX) and script.endswith(';\n'), 'Invalid browser bundle')
    payload = json.loads(script[len(PREFIX):-2])
    require(set(payload) in ({'version', 'source_name', 'captured_at', 'snapshots'}, {'version', 'source_name', 'captured_at', 'snapshots', 'verification'}) and payload['version'] == 1, 'Invalid public bundle schema')
    timestamp(payload['captured_at'])
    if 'verification' in payload:
        verification = payload['verification']
        require(isinstance(verification, dict) and set(verification) == {'verified_at', 'data_through'}, 'Invalid public verification fields')
        verified = timestamp(verification['verified_at'])
        require(verified <= timestamp(payload['captured_at']), 'Verification follows capture')
        if verification['data_through'] is not None:
            require(date.fromisoformat(verification['data_through']) <= verified.astimezone(CENTRAL).date(), 'Data-through date follows verification')
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
        for name, fields, optional in (('rows', {'district', 'cohort', 'due_date', *BASE, *OPTIONAL}, OPTIONAL),
                                       ('outreach', {'district', *OUTREACH.values()}, OUTREACH_OPTIONAL),
                                       ('reasons', {'district', 'cohort', *REASONS.values()}, ())):
            require(isinstance(snapshot[name], list), 'Invalid public rows')
            for row in snapshot[name]:
                require(isinstance(row, dict) and set(row) == fields, 'Unapproved public fields')
                district({'District': row['district']})
                for field in fields - {'district', 'cohort', 'due_date'}:
                    if row[field] is None:
                        require(field in optional, 'Missing required public count')
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
            require((row['not_messaged'] is None or row['messaged'] + row['not_messaged'] == row['due']) and row['messaged'] <= row['due'] and row['replied'] <= row['messaged'] and row['before_message'] + row['after_message'] == row['renewed'], 'Public outreach counts disagree')
        for key in ('due', 'renewed', 'messaged', 'replied'):
            if all(r[key] is not None for r in snapshot['council'].values()):
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
    parser.add_argument('--verification-receipt', type=Path)
    args = parser.parse_args()
    if args.check:
        validate_bundle(args.check.read_text())
    else:
        require(all((args.source, args.output, args.history_dir)), 'Source, output and history are required')
        build(args.source, args.output, args.history_dir, verification_receipt=args.verification_receipt)
    print('Renewal Outreach: validated aggregate-only Movo cohorts, totals, rates, outreach and reason coverage.')

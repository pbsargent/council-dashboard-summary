#!/usr/bin/env python3
"""Add privacy-safe IH coverage to a private candidate council snapshot."""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile

from sanitize_public_person_names import format_person_name


def calendar(value):
    text = str(value or '').strip()
    for pattern in ('%m/%d/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            pass
    return None


def enrich(payload, source: Path):
    dashboard = payload['dashboard']
    as_of = date.fromisoformat(dashboard['report_date'])
    if source.name != f'CouncilRoster-{as_of.isoformat()}.csv':
        raise ValueError('IH roster must be the dated dashboard-day council roster')
    raw = source.read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    required = {'MemberID', 'UnitID', 'PositionID', 'unitPosition', 'EffectiveDT',
                'ExpiryDT', 'FirstName', 'LastName', 'IsYouth', 'IsDelete', 'isDeceased'}
    if not required <= set(reader.fieldnames or []):
        raise ValueError('IH roster is missing required columns')
    holders = {}
    seen = set()
    count = 0
    for row in reader:
        count += 1
        if row['PositionID'].strip() != '328':
            continue
        if row['unitPosition'].strip() != 'Executive Officer' or row['IsYouth'].strip() != '0':
            raise ValueError('IH position code/label/adult mismatch')
        if row['IsDelete'].strip() not in ('', '0') or row['isDeceased'].strip() not in ('', '0'):
            continue
        start, end = calendar(row['EffectiveDT']), calendar(row['ExpiryDT'])
        if start is None or end is None or start > end:
            raise ValueError('IH registration has unusable dates')
        if not start <= as_of <= end:
            continue
        identity = (row['UnitID'].strip(), row['MemberID'].strip())
        if not all(identity) or not row['FirstName'].strip() or not row['LastName'].strip():
            raise ValueError('IH registration has incomplete identity')
        if identity in seen:
            continue  # Multiple source rows are not multiple holders.
        seen.add(identity)
        holders.setdefault(identity[0], []).append({
            'name': format_person_name(f"{row['FirstName']} {row['LastName']}"),
            'position': 'Executive Officer',
        })
    if not count:
        raise ValueError('IH council roster is empty')
    unit_ids = set()
    for unit in dashboard['unit_key3_statuses']:
        unit_id = str(unit['unit_id']).strip()
        if not unit_id or unit_id in unit_ids:
            raise ValueError('IH coverage requires unique authoritative unit IDs')
        unit_ids.add(unit_id)
        unit['executive_officers'] = sorted(holders.get(unit_id, []), key=lambda h: h['name'])
        missing = list(unit['missing_roles'])
        if not unit['executive_officers']:
            missing.append('IH / Executive Officer')
        unit['key4_missing_roles'] = missing
        unit['key4_status'] = 'Complete' if not missing else f'Missing {len(missing)}'
    if source.read_bytes() != raw:
        raise ValueError('IH roster changed during read')
    dashboard['unit_key4_source'] = {
        'report_date': as_of.isoformat(), 'source_name': source.name,
        'sha256': hashlib.sha256(raw).hexdigest(),
    }
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--roster-dir', type=Path, default=Path(os.environ.get(
        'CAC_MYSCOUTING_MEMBERSHIP_SOURCE_DIR',
        '/Volumes/MacProData/Capitol Area Council Dashboard/Capitol Area Council')))
    args = parser.parse_args()
    payload = json.loads(args.snapshot.read_text())
    report_date = payload['dashboard']['report_date']
    if os.environ.get('CAC_FROZEN_BUNDLE'):
        expected = Path(os.environ['CAC_FROZEN_BUNDLE']) / 'inputs/myscouting'
        if args.roster_dir.resolve() != expected.resolve():
            raise ValueError('Frozen IH coverage must use the captured roster')
    payload = enrich(payload, args.roster_dir / f'CouncilRoster-{report_date}.csv')
    fd, temp = tempfile.mkstemp(dir=args.snapshot.parent, prefix='.key4-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(payload, stream, indent=2)
            stream.write('\n')
        os.replace(temp, args.snapshot)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


if __name__ == '__main__':
    main()

"""Privacy-safe current campaign sales, aggregated across product rows."""
import csv
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SALES_FIELD = 'Unit App Sales $ + Online Sales $'

def identity(name, district):
    match = re.fullmatch(r'(Pack|Troop|Crew|Ship|Post)\s*0*(\d+)', str(name).strip(), re.I)
    return (match[1].lower(), int(match[2]), str(district).strip().casefold()) if match else None

def load_sales(path, report_date):
    path = Path(path)
    receipt = json.loads(path.with_suffix('.receipt.json').read_text())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    observed = datetime.fromisoformat(receipt['downloaded_at'])
    if observed.tzinfo is None or observed.astimezone(ZoneInfo('America/Chicago')).date().isoformat() != report_date:
        raise ValueError('Sales download must be timezone-aware and from the report date')
    if receipt.get('campaign') != '2026 Selling Campaign' or receipt.get('sha256') != digest:
        raise ValueError('Sales campaign or receipt hash mismatch')
    if b'<html' in path.read_bytes()[:4096].lower():
        raise ValueError('Sales source contains HTML')
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        required = {'Unit_Name', 'District_Name', 'Unit Key', 'SKU Name', 'Traditional App Sales $', 'Online Sales $', SALES_FIELD}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Sales source missing required columns')
        totals, keys, seen = {}, {}, set()
        count = 0
        for row in reader:
            if not any(row.values()):
                continue
            count += 1
            key = str(row['Unit Key']).strip()
            product = str(row['SKU Name']).strip()
            if not key or not product or (key, product) in seen:
                raise ValueError('Missing unit/product identity or duplicate sales product row')
            seen.add((key, product))
            amount = float(row[SALES_FIELD])
            channels = [float(row[field]) for field in ('Traditional App Sales $', 'Online Sales $')]
            if not math.isfinite(amount) or any(not math.isfinite(value) for value in channels):
                raise ValueError('Nonfinite sales amount')
            if abs(sum(channels) - amount) > .011:
                raise ValueError('Sales channel totals do not reconcile')
            unit = identity(row['Unit_Name'], row['District_Name'])
            if unit is None:  # Administrative records never become public unit rows.
                continue
            if unit in keys and keys[unit] != key:
                raise ValueError('Ambiguous sales unit identity')
            keys[unit] = key
            totals[unit] = totals.get(unit, 0) + amount
    if not count or not totals:
        raise ValueError('Sales source has no usable unit rows')
    return {k: round(v, 2) for k, v in totals.items()}, {
        'report_date': report_date, 'downloaded_at': receipt['downloaded_at'],
        'campaign': receipt['campaign'], 'sha256': digest, 'product_rows': count,
        'source_units': len(totals), 'measure': 'Traditional app sales plus online sales',
    }

def enrich_popcorn(board, path, report_date):
    totals, metadata = load_sales(path, report_date)
    counts = Counter(identity(r['name'], r['district']) for r in board['rows'])
    matched = 0
    for row in board['rows']:
        key = identity(row['name'], row['district'])
        # Duplicate board identities cannot safely share one unit's sales.
        value = totals.get(key) if key and counts[key] == 1 else None
        row['sales_2026_to_date'] = value
        matched += value is not None
    metadata['matched_units'] = matched
    metadata['unavailable_units'] = len(board['rows']) - matched
    board['sales_2026_source'] = metadata

def validate_public_sales(board, report_date):
    meta = board.get('sales_2026_source', {})
    if meta.get('report_date') != report_date or meta.get('campaign') != '2026 Selling Campaign':
        raise ValueError('Public sales provenance missing or stale')
    timestamp = datetime.fromisoformat(meta['downloaded_at'])
    if timestamp.tzinfo is None or timestamp.astimezone(ZoneInfo('America/Chicago')).date().isoformat() != report_date:
        raise ValueError('Public sales timestamp missing or stale')
    matched = 0
    for row in board['rows']:
        if 'sales_2026_to_date' not in row:
            raise ValueError('Missing sales availability field')
        value = row['sales_2026_to_date']
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError('Invalid public sales amount')
            matched += 1
    if meta.get('matched_units') != matched or meta.get('unavailable_units') != len(board['rows']) - matched:
        raise ValueError('Public sales coverage does not reconcile')

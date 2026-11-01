"""Private, hash-bound evidence for a same-day Movo observation and Sheet readback."""
from datetime import date, datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import os
import tempfile
import re
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo('America/Chicago')
SHEET_ID = '1eG28huQbcTwdU-f_cp49pHcYsOJQ5__WaIbgcapTf9I'
PARENT_ID = '0AH5Jzb9zP4U8Uk9PVA'
TABS = {'Nov by district', 'Dec by district', 'Council totals', 'Outreach replies', 'Said-no reasons'}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def stamp(value):
    require(isinstance(value, str), 'Missing verification timestamp')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(result.tzinfo is not None, 'Verification timestamp requires timezone')
    return result

def table_hashes(tabs):
    require(isinstance(tabs, dict) and set(tabs) == TABS, 'Verification requires exactly five tables')
    result = {}
    for name, rows in tabs.items():
        require(isinstance(rows, list) and len(rows) >= 2, 'Empty verification table')
        normalized = []
        for row in rows:
            require(isinstance(row, list), 'Invalid verification row')
            cells = []
            for value in row:
                require(value is None or type(value) in (str, int, float), 'Invalid verification cell')
                text = '' if value is None else str(value)
                if re.fullmatch(r'-?\d+(?:\.\d+)?', text):
                    number = Decimal(text)
                    require(number.is_finite(), 'Nonfinite verification number')
                    text = format(number.normalize(), 'f')
                    if number == 0:
                        text = '0'
                cells.append(text)
            while cells and cells[-1] == '':
                cells.pop()
            if cells:
                normalized.append(cells)
        require(len(normalized) >= 2, 'Empty verification table')
        result[name] = hashlib.sha256(json.dumps(normalized, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    return result

def read_evidence(folder, record):
    require(isinstance(record, dict) and set(record) == {'name', 'sha256'}, 'Invalid evidence record')
    name = record['name']
    require(isinstance(name, str) and name not in ('', '.', '..') and Path(name).name == name, 'Evidence must be in receipt directory')
    path = folder / name
    require(not path.is_symlink() and path.is_file() and 0 < path.stat().st_size <= 2_000_000, 'Missing or oversized verification evidence')
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == record['sha256'], 'Verification evidence hash mismatch')
    return raw

def verify_receipt(path, source, today=None, now=None):
    now = now or datetime.now(CENTRAL)
    today = today or now.date()
    path = Path(path)
    raw = path.read_bytes()
    receipt = json.loads(raw)
    fields = {'version', 'producer', 'sheet_id', 'parent_id', 'observed_at', 'verified_at', 'data_through', 'tables_sha256', 'evidence'}
    require(isinstance(receipt, dict) and set(receipt) == fields and receipt['version'] == 1, 'Invalid Movo verification receipt')
    require(receipt['producer'] == 'Tracker Movo daily refresh' and receipt['sheet_id'] == SHEET_ID and receipt['parent_id'] == PARENT_ID, 'Wrong Movo verification identity')
    observed, verified = stamp(receipt['observed_at']), stamp(receipt['verified_at'])
    require(observed.astimezone(CENTRAL).date() == today and verified.astimezone(CENTRAL).date() == today, 'Movo verification is not from today')
    require(observed <= verified <= now and verified <= stamp(source['captured_at']), 'Invalid Movo verification chronology')
    if receipt['data_through'] is not None:
        through = date.fromisoformat(receipt['data_through'])
        require(through.isoformat() == receipt['data_through'] and through <= observed.astimezone(CENTRAL).date(), 'Invalid Movo data-through date')
    evidence = receipt['evidence']
    require(isinstance(evidence, dict) and set(evidence) == {'observation', 'raw', 'sheet'}, 'Incomplete Movo evidence')
    require(len({r['name'] for r in evidence.values()}) == 3, 'Evidence files must be distinct')
    observation = json.loads(read_evidence(path.parent, evidence['observation']))
    read_evidence(path.parent, evidence['raw'])
    sheet = json.loads(read_evidence(path.parent, evidence['sheet']))
    require(sheet.get('sheet_id') == SHEET_ID and sheet.get('parent_id') == PARENT_ID, 'Wrong Sheet evidence identity')
    require(set(observation) == {'captured_at', 'data_through', 'tabs'}, 'Invalid Movo observation')
    require(observation['captured_at'] == receipt['observed_at'] and observation['data_through'] == receipt['data_through'], 'Movo observation dates differ')
    require(observed <= stamp(sheet['captured_at']) <= verified, 'Sheet readback predates Movo observation')
    require(stamp(sheet['source_updated_at']) <= stamp(source['source_updated_at']), 'Sheet readback is newer than current source')
    hashes = table_hashes(observation['tabs'])
    require(hashes == receipt['tables_sha256'] == table_hashes(sheet['tabs']) == table_hashes(source['tabs']), 'Movo observation, receipt and Sheet tables differ')
    require(path.read_bytes() == raw, 'Movo receipt changed during validation')
    # Evidence paths and hashes stay private; only these two dates may be public.
    return {'verified_at': receipt['verified_at'], 'data_through': receipt['data_through']}

def create_receipt(observation_path, raw_path, sheet_path, output):
    """Record an actual observation; never synthesize one from a Sheet capture."""
    output = Path(output)
    now = datetime.now(CENTRAL)
    observation = json.loads(Path(observation_path).read_text())
    sheet = json.loads(Path(sheet_path).read_text())
    # The same reconciliation as publication also rejects malformed counts/tables.
    from build_renewal_outreach import parse_source
    require(sheet.get('sheet_id') == SHEET_ID and sheet.get('parent_id') == PARENT_ID, 'Wrong Sheet evidence identity')
    source = {key: sheet[key] for key in ('source_name', 'source_updated_at', 'captured_at', 'tabs')}
    parse_source(source)
    parse_source(dict(source, tabs=observation['tabs']))
    receipt = dict(version=1, producer='Tracker Movo daily refresh', sheet_id=SHEET_ID,
                   parent_id=PARENT_ID, observed_at=observation['captured_at'],
                   verified_at=now.isoformat(), data_through=observation['data_through'],
                   tables_sha256=table_hashes(observation['tabs']), evidence={})
    require(receipt['tables_sha256'] == table_hashes(sheet['tabs']), 'Movo and Sheet readback do not match')
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    for kind, source in [('observation', observation_path), ('raw', raw_path), ('sheet', sheet_path)]:
        raw = Path(source).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        name = kind + '-' + digest + ('.txt' if kind == 'raw' else '.json')
        target = output.parent / name
        if target.exists():
            require(target.read_bytes() == raw, 'Existing evidence differs')
        else:
            with target.open('xb') as handle:
                handle.write(raw)
            target.chmod(0o600)
        receipt['evidence'][kind] = {'name': name, 'sha256': digest}
    candidate = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=output.parent, delete=False) as handle:
            candidate = Path(handle.name)
            json.dump(receipt, handle, ensure_ascii=False, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        candidate.chmod(0o600)
        verify_receipt(candidate, dict(sheet, captured_at=now.isoformat()), now=now)
        if output.exists():
            old = output.read_bytes()
            archive = output.parent / ('prior-receipt-' + hashlib.sha256(old).hexdigest() + '.json')
            if not archive.exists():
                archive.write_bytes(old)
                archive.chmod(0o600)
        os.replace(candidate, output)
        candidate = None
    finally:
        if candidate is not None:
            candidate.unlink(missing_ok=True)
    return receipt

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--observation', required=True, type=Path)
    parser.add_argument('--raw', required=True, type=Path)
    parser.add_argument('--sheet', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = create_receipt(args.observation, args.raw, args.sheet, args.output)
    print(json.dumps({'verified_at': result['verified_at'], 'data_through': result['data_through'], 'receipt': str(args.output)}))

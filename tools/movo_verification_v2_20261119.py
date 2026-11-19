"""Private, hash-bound evidence for a same-day Movo observation and Sheet readback.

Version 2 copy (2026-11-19) of movo_verification.py (SHA-256
1386a535de79e2653c69394f3b1f0b3de2331f4dc95c4043896bb7fecf6c4d4e, unchanged).
It uses build_renewal_outreach_v2_20261119, which accepts Movo's Said-no reasons
table without 'Adults said no' / 'Youth said no' (dropped by Movo 2026-11-17;
update approved by Peter Thu Nov 19 2026, 7:58 AM CST). With --age-split (a
counts-only split derived from Movo's said-no members list; no names), it writes
a version-3 receipt that binds the split file as evidence and lists every
derived field under "derived". Version-2 receipts still validate unchanged.
"""
from datetime import date, datetime
from decimal import Decimal
import fcntl
from contextlib import contextmanager
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

def as_table(rows):
    """Return a table as a 2D array.

    Movo's structured JSON may send each table either as a 2D array (header
    row first) or, since 2026-11-16, as a list of row objects keyed by header.
    Row objects become [headers] + rows in the first object's key order, so an
    object table and the same table read back from the Sheet hash identically.
    Every object must carry exactly the same header keys; mixed shapes fail.
    """
    require(isinstance(rows, list), 'Empty verification table')
    if all(isinstance(row, list) for row in rows):
        return rows
    require(all(isinstance(row, dict) for row in rows), 'Invalid verification row')
    headers = list(rows[0])
    require(headers and all(isinstance(key, str) for key in headers), 'Invalid verification header')
    require(all(len(row) == len(headers) and set(row) == set(headers) for row in rows), 'Inconsistent verification row keys')
    return [headers] + [[row[key] for key in headers] for row in rows]

def table_hashes(tabs):
    require(isinstance(tabs, dict) and set(tabs) == TABS, 'Verification requires exactly five tables')
    result = {}
    for name, rows in tabs.items():
        rows = as_table(rows)
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

@contextmanager
def receipt_lock(folder, exclusive=False):
    # Keep the inode: deleting a lock file would permit competing independent locks.
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (folder / '.movo-verification.lock').open('a') as handle:
        try:
            fcntl.flock(handle, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError('Movo receipt writer is active') from exc
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)

def validate_raw(raw, observation):
    """Validate captured structured response, not an unrelated attachment.

    Capture provenance still depends on the authorized observer. This is no
    cryptographic proof of Movo origin; retain the original transport evidence.
    """
    captured = json.loads(raw)
    require(isinstance(captured, dict) and set(captured) == {'source_url', 'captured_at', 'data_through', 'tabs'}, 'Invalid structured Movo response')
    require(captured['source_url'] == 'https://app.trymovo.ai', 'Wrong Movo response origin')
    require(captured['captured_at'] == observation['captured_at'] and captured['data_through'] == observation['data_through'], 'Raw response clocks differ from observation')
    require(table_hashes(captured['tabs']) == table_hashes(observation['tabs']), 'Raw response tables differ from observation')

def verify_receipt(path, source, today=None, now=None):
    with receipt_lock(Path(path).parent):
        return _verify_receipt(path, source, today, now)

def _verify_receipt(path, source, today=None, now=None):
    now = now or datetime.now(CENTRAL)
    today = today or now.date()
    path = Path(path)
    raw = path.read_bytes()
    receipt = json.loads(raw)
    fields = {'version', 'producer', 'sheet_id', 'parent_id', 'observed_at', 'verified_at', 'data_through', 'tables_sha256', 'evidence'}
    require(isinstance(receipt, dict) and receipt.get('version') in (1, 2, 3), 'Invalid Movo verification receipt')
    require(set(receipt) == (fields | {'derived'} if receipt['version'] == 3 else fields), 'Invalid Movo verification receipt')
    require(receipt['producer'] == 'Tracker Movo daily refresh' and receipt['sheet_id'] == SHEET_ID and receipt['parent_id'] == PARENT_ID, 'Wrong Movo verification identity')
    require(receipt['version'] in (2, 3) or today <= date(2026, 11, 1), 'Legacy Movo receipt is historical only')
    if receipt['version'] == 1:
        require(hashlib.sha256(raw).hexdigest() == '9479b07ee5f6ae9389fcd1423fd0ae9bd53cb892a7f05b43c6d8880b74116dae', 'Unrecognized historical Movo receipt')
    observed, verified = stamp(receipt['observed_at']), stamp(receipt['verified_at'])
    require(observed.astimezone(CENTRAL).date() == today and verified.astimezone(CENTRAL).date() == today, 'Movo verification is not from today')
    require(observed <= verified <= now and verified <= stamp(source['captured_at']), 'Invalid Movo verification chronology')
    if receipt['data_through'] is not None:
        through = date.fromisoformat(receipt['data_through'])
        require(through.isoformat() == receipt['data_through'] and through <= observed.astimezone(CENTRAL).date(), 'Invalid Movo data-through date')
    evidence = receipt['evidence']
    kinds = {'observation', 'raw', 'sheet'} | ({'age_split'} if receipt['version'] == 3 else set())
    require(isinstance(evidence, dict) and set(evidence) == kinds, 'Incomplete Movo evidence')
    require(len({r['name'] for r in evidence.values()}) == len(kinds), 'Evidence files must be distinct')
    observation = json.loads(read_evidence(path.parent, evidence['observation']))
    raw_response = read_evidence(path.parent, evidence['raw'])
    if receipt['version'] in (2, 3):
        validate_raw(raw_response, observation)
    sheet = json.loads(read_evidence(path.parent, evidence['sheet']))
    require(sheet.get('sheet_id') == SHEET_ID and sheet.get('parent_id') == PARENT_ID, 'Wrong Sheet evidence identity')
    require(set(observation) == {'captured_at', 'data_through', 'tabs'}, 'Invalid Movo observation')
    require(observation['captured_at'] == receipt['observed_at'] and observation['data_through'] == receipt['data_through'], 'Movo observation dates differ')
    require(observed <= stamp(sheet['captured_at']) <= verified, 'Sheet readback predates Movo observation')
    require(sheet['source_name'] == source['source_name'], 'Sheet source identity changed')
    saved_update, current_update = stamp(sheet['source_updated_at']), stamp(source['source_updated_at'])
    # Preserve the original semantics only for the exact audited historical receipt.
    require(saved_update == current_update or (receipt['version'] == 1 and saved_update <= current_update), 'Sheet source update clock changed')
    hashes = table_hashes(observation['tabs'])
    require(hashes == receipt['tables_sha256'] == table_hashes(sheet['tabs']) == table_hashes(source['tabs']), 'Movo observation, receipt and Sheet tables differ')
    if receipt['version'] == 3:
        from build_renewal_outreach_v2_20261119 import parse_source, validate_age_split
        age_split = json.loads(read_evidence(path.parent, evidence['age_split']))
        validate_age_split(age_split)
        derived = []
        parse_source({k: source[k] for k in ('source_name', 'source_updated_at', 'captured_at', 'tabs')}, age_split=age_split)
        parse_source(dict(source_name=sheet['source_name'], source_updated_at=sheet['source_updated_at'], captured_at=sheet['captured_at'], tabs=observation['tabs']), provenance=derived, age_split=age_split)
        require(receipt['derived'] == derived and any(d['field'].startswith('reasons.') for d in derived), 'Derived fields differ from evidence')
    require(path.read_bytes() == raw, 'Movo receipt changed during validation')
    # Evidence paths and hashes stay private; only these two dates may be public.
    return {'verified_at': receipt['verified_at'], 'data_through': receipt['data_through']}

def create_receipt(observation_path, raw_path, sheet_path, output, age_split_path=None):
    with receipt_lock(Path(output).parent, exclusive=True):
        return _create_receipt(observation_path, raw_path, sheet_path, output, age_split_path)

def _create_receipt(observation_path, raw_path, sheet_path, output, age_split_path=None):
    """Record an actual observation; never synthesize one from a Sheet capture."""
    output = Path(output)
    now = datetime.now(CENTRAL)
    observation = json.loads(Path(observation_path).read_text())
    sheet = json.loads(Path(sheet_path).read_text())
    validate_raw(Path(raw_path).read_bytes(), observation)
    # The same reconciliation as publication also rejects malformed counts/tables.
    from build_renewal_outreach_v2_20261119 import parse_source, validate_age_split
    require(sheet.get('sheet_id') == SHEET_ID and sheet.get('parent_id') == PARENT_ID, 'Wrong Sheet evidence identity')
    source = {key: sheet[key] for key in ('source_name', 'source_updated_at', 'captured_at', 'tabs')}
    age_split = None
    if age_split_path is not None:
        age_split = json.loads(Path(age_split_path).read_text())
        validate_age_split(age_split)
    derived = []
    parse_source(source, age_split=age_split)
    parse_source(dict(source, tabs=observation['tabs']), provenance=derived, age_split=age_split)
    if age_split is not None:
        require(any(d['field'].startswith('reasons.') for d in derived), 'Age split given but Movo sent the adult/youth said-no columns')
    receipt = dict(version=3 if age_split is not None else 2, producer='Tracker Movo daily refresh', sheet_id=SHEET_ID,
                   parent_id=PARENT_ID, observed_at=observation['captured_at'],
                   verified_at=now.isoformat(), data_through=observation['data_through'],
                   tables_sha256=table_hashes(observation['tabs']), evidence={})
    if age_split is not None:
        receipt['derived'] = derived
    require(receipt['tables_sha256'] == table_hashes(sheet['tabs']), 'Movo and Sheet readback do not match')
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    kinds = [('observation', observation_path), ('raw', raw_path), ('sheet', sheet_path)] + ([('age_split', age_split_path)] if age_split is not None else [])
    for kind, source in kinds:
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
        _verify_receipt(candidate, dict(sheet, captured_at=now.isoformat()), now=now)
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
    parser.add_argument('--age-split', type=Path, help='counts-only adult/youth said-no split; writes a version-3 receipt')
    args = parser.parse_args()
    result = create_receipt(args.observation, args.raw, args.sheet, args.output, args.age_split)
    print(json.dumps({'verified_at': result['verified_at'], 'data_through': result['data_through'], 'receipt': str(args.output)}))

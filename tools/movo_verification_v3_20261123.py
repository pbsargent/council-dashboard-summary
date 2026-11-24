"""Private, hash-bound evidence for a same-day Movo observation and Sheet readback.

DRAFT v3 (2026-11-23, Scout, for Peter's review; NOT INSTALLED): a NEW copy of
movo_verification_v2_20261119.py (SHA-256
67abcfb5ea350ee2ee4370137fd66b6253924c633454c86e43f73831936ef7bd, unchanged).
It adds an explicit source_type:
  * 'ask_json' (default): the structured Ask Movo JSON path. Every rule, receipt
    version (1, 2, 3) and the build_renewal_outreach_v2_20261119 reconciliation
    are unchanged.
  * 'movo_file_xlsx': the five tables were built by Tracker from Movo's posted
    daily extended performance xlsx (files-primary-procedure-2026-11-23-r2.md
    4c). The raw evidence is a names-free binding of that posted file:
    {source_type, filename, posted_at, sha256, bytes, data_as_of}. The helper
    hashes the posted file's bytes itself (it never parses cells, so no member
    names are read) and checks the zip lists the Renewals, Not yet messaged and
    Said-no by district sheets. The posted xlsx is kept beside the receipt as
    evidence 'posted_file' (it contains names; Evidence is a permitted place).
    Reconciliation uses build_renewal_outreach_v3_20261123 with
    source_type='movo_file_xlsx': only there may 'Not yet messaged' and the
    per-district reason columns be "not stated"; checks needing them are
    "not checkable"; both are listed in the receipt's "gaps". Version-4
    receipts are written only for this source type.
 (2026-11-19) of movo_verification.py (SHA-256
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
import zipfile
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo('America/Chicago')
SHEET_ID = '1eG28huQbcTwdU-f_cp49pHcYsOJQ5__WaIbgcapTf9I'
PARENT_ID = '0AH5Jzb9zP4U8Uk9PVA'
TABS = {'Nov by district', 'Dec by district', 'Council totals', 'Outreach replies', 'Said-no reasons'}
SOURCE_TYPES = ('ask_json', 'movo_file_xlsx')
FILE_NAME = re.compile(r'Capitol_Area_Council_Movo_performance_(\d{4}-\d{2}-\d{2})_extended(?: \(\d+\))?\.xlsx')
FILE_SOURCE_TABS = ('Renewals', 'Not yet messaged', 'Said-no by district')
FILE_MAX_BYTES = 20_000_000
BINDING_FIELDS = {'source_type', 'filename', 'posted_at', 'sha256', 'bytes', 'data_as_of'}

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

def read_evidence(folder, record, limit=2_000_000):
    require(isinstance(record, dict) and set(record) == {'name', 'sha256'}, 'Invalid evidence record')
    name = record['name']
    require(isinstance(name, str) and name not in ('', '.', '..') and Path(name).name == name, 'Evidence must be in receipt directory')
    path = folder / name
    require(not path.is_symlink() and path.is_file() and 0 < path.stat().st_size <= limit, 'Missing or oversized verification evidence')
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

def workbook_sheet_names(posted):
    """Sheet names from xl/workbook.xml only; no cell is read."""
    import io
    try:
        with zipfile.ZipFile(io.BytesIO(posted)) as book:
            listing = book.read('xl/workbook.xml').decode('utf-8')
    except (zipfile.BadZipFile, KeyError, UnicodeDecodeError) as exc:
        raise ValueError('Posted Movo file is not an xlsx workbook') from exc
    return re.findall(r'<(?:\w+:)?sheet\b[^>]*\bname="([^"]*)"', listing)


def file_binding(posted, filename, posted_at, data_as_of):
    """The raw evidence for movo_file_xlsx: the posted bytes' sha256 plus the post time."""
    return {'source_type': 'movo_file_xlsx', 'filename': filename, 'posted_at': posted_at,
            'sha256': hashlib.sha256(posted).hexdigest(), 'bytes': len(posted), 'data_as_of': data_as_of}


def validate_file_raw(raw, observation, posted):
    binding = json.loads(raw)
    require(isinstance(binding, dict) and set(binding) == BINDING_FIELDS and binding['source_type'] == 'movo_file_xlsx', 'Invalid Movo file binding')
    match = FILE_NAME.fullmatch(binding['filename']) if isinstance(binding['filename'], str) else None
    require(match is not None, 'Not a Movo daily performance file name')
    posted_at, data_as_of = stamp(binding['posted_at']), stamp(binding['data_as_of'])
    require(posted_at.astimezone(CENTRAL).date().isoformat() == match.group(1), 'Movo file name date differs from its post date')
    require(binding['data_as_of'] == observation['captured_at'] and observation['data_through'] is None, 'Movo file clocks differ from observation')
    require(data_as_of <= posted_at, 'Movo file data-as-of is after its post time')
    require(hashlib.sha256(posted).hexdigest() == binding['sha256'] and len(posted) == binding['bytes'], 'Posted Movo file differs from its binding')
    names = workbook_sheet_names(posted)
    require(all(tab in names for tab in FILE_SOURCE_TABS), 'Posted Movo file lacks the source tabs')
    return binding


def verify_receipt(path, source, today=None, now=None):
    with receipt_lock(Path(path).parent):
        return _verify_receipt(path, source, today, now)

def _verify_receipt(path, source, today=None, now=None):
    now = now or datetime.now(CENTRAL)
    today = today or now.date()
    path = Path(path)
    raw = path.read_bytes()
    receipt = json.loads(raw)
    if isinstance(receipt, dict) and receipt.get('version') == 4:
        return _verify_file_receipt(path, raw, receipt, source, today, now)
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

FILE_FIELDS = {'version', 'producer', 'sheet_id', 'parent_id', 'observed_at', 'verified_at', 'data_through',
               'tables_sha256', 'evidence', 'source_type', 'raw_binding', 'gaps', 'derived'}


def _file_reconcile(source, sheet, observation):
    from build_renewal_outreach_v3_20261123 import parse_source
    gaps, derived = [], []
    parse_source({k: source[k] for k in ('source_name', 'source_updated_at', 'captured_at', 'tabs')}, source_type='movo_file_xlsx')
    parse_source(dict(source_name=sheet['source_name'], source_updated_at=sheet['source_updated_at'], captured_at=sheet['captured_at'],
                      tabs=observation['tabs']), provenance=derived, source_type='movo_file_xlsx', gaps=gaps)
    return gaps, derived


def _verify_file_receipt(path, raw, receipt, source, today=None, now=None):
    now = now or datetime.now(CENTRAL)
    today = today or now.date()
    require(set(receipt) == FILE_FIELDS and receipt['source_type'] == 'movo_file_xlsx', 'Invalid Movo file verification receipt')
    require(receipt['producer'] == 'Tracker Movo daily refresh' and receipt['sheet_id'] == SHEET_ID and receipt['parent_id'] == PARENT_ID, 'Wrong Movo verification identity')
    observed, verified = stamp(receipt['observed_at']), stamp(receipt['verified_at'])
    require(observed.astimezone(CENTRAL).date() == today and verified.astimezone(CENTRAL).date() == today, 'Movo verification is not from today')
    require(receipt['data_through'] is None, 'Movo file states no data-through date')
    evidence = receipt['evidence']
    kinds = {'observation', 'raw', 'sheet', 'posted_file'}
    require(isinstance(evidence, dict) and set(evidence) == kinds, 'Incomplete Movo evidence')
    require(len({r['name'] for r in evidence.values()}) == len(kinds), 'Evidence files must be distinct')
    observation = json.loads(read_evidence(path.parent, evidence['observation']))
    require(set(observation) == {'captured_at', 'data_through', 'tabs'}, 'Invalid Movo observation')
    require(observation['captured_at'] == receipt['observed_at'], 'Movo observation dates differ')
    binding = validate_file_raw(read_evidence(path.parent, evidence['raw']), observation,
                                read_evidence(path.parent, evidence['posted_file'], FILE_MAX_BYTES))
    require(receipt['raw_binding'] == binding, 'Receipt binding differs from raw evidence')
    posted = stamp(binding['posted_at'])
    require(posted.astimezone(CENTRAL).date() == today, 'Movo file was not posted today')
    require(observed <= posted <= verified <= now and verified <= stamp(source['captured_at']), 'Invalid Movo verification chronology')
    sheet = json.loads(read_evidence(path.parent, evidence['sheet']))
    require(sheet.get('sheet_id') == SHEET_ID and sheet.get('parent_id') == PARENT_ID, 'Wrong Sheet evidence identity')
    require(observed <= stamp(sheet['captured_at']) <= verified, 'Sheet readback predates Movo observation')
    require(sheet['source_name'] == source['source_name'], 'Sheet source identity changed')
    require(stamp(sheet['source_updated_at']) == stamp(source['source_updated_at']), 'Sheet source update clock changed')
    hashes = table_hashes(observation['tabs'])
    require(hashes == receipt['tables_sha256'] == table_hashes(sheet['tabs']) == table_hashes(source['tabs']), 'Movo observation, receipt and Sheet tables differ')
    gaps, derived = _file_reconcile(source, sheet, observation)
    require(receipt['gaps'] == gaps and receipt['derived'] == derived, 'Recorded gaps or derived fields differ from evidence')
    require(path.read_bytes() == raw, 'Movo receipt changed during validation')
    return {'verified_at': receipt['verified_at'], 'data_through': receipt['data_through']}


def create_receipt(observation_path, raw_path, sheet_path, output, age_split_path=None,
                   source_type='ask_json', posted_file_path=None, posted_filename=None, posted_at=None):
    require(source_type in SOURCE_TYPES, 'Unknown Movo source type')
    with receipt_lock(Path(output).parent, exclusive=True):
        if source_type == 'ask_json':
            require(posted_file_path is None and posted_filename is None and posted_at is None, 'Posted-file options are for movo_file_xlsx only')
            return _create_receipt(observation_path, raw_path, sheet_path, output, age_split_path)
        require(raw_path is None and age_split_path is None, 'movo_file_xlsx binds the posted file; no raw JSON or age split')
        return _create_file_receipt(observation_path, sheet_path, output, posted_file_path, posted_filename, posted_at)


def _write_evidence(output, receipt, kinds):
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    for kind, raw, suffix in kinds:
        digest = hashlib.sha256(raw).hexdigest()
        name = kind + '-' + digest + suffix
        target = output.parent / name
        if target.exists():
            require(target.read_bytes() == raw, 'Existing evidence differs')
        else:
            with target.open('xb') as handle:
                handle.write(raw)
            target.chmod(0o600)
        receipt['evidence'][kind] = {'name': name, 'sha256': digest}


def _create_file_receipt(observation_path, sheet_path, output, posted_file_path, posted_filename, posted_at):
    """Record a posted Movo file; never synthesize one from a Sheet capture."""
    output = Path(output)
    now = datetime.now(CENTRAL)
    observation = json.loads(Path(observation_path).read_text())
    sheet = json.loads(Path(sheet_path).read_text())
    posted = Path(posted_file_path).read_bytes()
    require(0 < len(posted) <= FILE_MAX_BYTES, 'Missing or oversized posted Movo file')
    raw = json.dumps(file_binding(posted, posted_filename, posted_at, observation.get('captured_at')), sort_keys=True).encode()
    binding = validate_file_raw(raw, observation, posted)
    require(stamp(posted_at).astimezone(CENTRAL).date() == now.date() and stamp(posted_at) <= now, 'Movo file was not posted today')
    require(sheet.get('sheet_id') == SHEET_ID and sheet.get('parent_id') == PARENT_ID, 'Wrong Sheet evidence identity')
    source = {key: sheet[key] for key in ('source_name', 'source_updated_at', 'captured_at', 'tabs')}
    gaps, derived = _file_reconcile(source, sheet, observation)
    receipt = dict(version=4, producer='Tracker Movo daily refresh', sheet_id=SHEET_ID, parent_id=PARENT_ID,
                   observed_at=observation['captured_at'], verified_at=now.isoformat(), data_through=None,
                   tables_sha256=table_hashes(observation['tabs']), evidence={}, source_type='movo_file_xlsx',
                   raw_binding=binding, gaps=gaps, derived=derived)
    require(receipt['tables_sha256'] == table_hashes(sheet['tabs']), 'Movo and Sheet readback do not match')
    _write_evidence(output, receipt, [('observation', Path(observation_path).read_bytes(), '.json'), ('raw', raw, '.json'),
                                      ('sheet', Path(sheet_path).read_bytes(), '.json'), ('posted_file', posted, '.xlsx')])
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
    parser.add_argument('--raw', type=Path, help='ask_json only: the structured Ask Movo JSON response')
    parser.add_argument('--sheet', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--age-split', type=Path, help='counts-only adult/youth said-no split; writes a version-3 receipt')
    parser.add_argument('--source-type', choices=SOURCE_TYPES, default='ask_json')
    parser.add_argument('--posted-file', type=Path, help='movo_file_xlsx only: the posted xlsx exactly as downloaded')
    parser.add_argument('--posted-filename', help='movo_file_xlsx only: the file name as posted in the Ask Movo thread')
    parser.add_argument('--posted-at', help='movo_file_xlsx only: the post time, ISO 8601 with offset')
    args = parser.parse_args()
    if args.source_type == 'ask_json' and args.raw is None:
        parser.error('--raw is required for ask_json')
    result = create_receipt(args.observation, args.raw, args.sheet, args.output, args.age_split,
                            args.source_type, args.posted_file, args.posted_filename, args.posted_at)
    print(json.dumps({'verified_at': result['verified_at'], 'data_through': result['data_through'], 'receipt': str(args.output)}))

"""Verify public unit listing URLs without publishing private PIN source fields."""
from __future__ import annotations
import csv
import hashlib
import html
import io
import re
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

URL_PATTERN = r'https://beascout\.scouting\.org/units/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
SOURCE_FIELDS = {'unitid', 'unitname', 'councilname', 'districtname', 'zipcode'}
REQUEST_SECONDS = 25
RUN_SECONDS = 300


class ResolutionFailure(ValueError):
    def __init__(self, message, audit):
        super().__init__(message)
        self.audit = audit


def identity(name):
    match = re.match(r'\s*(Pack|Troop|Crew|Ship|Post)\s*0*(\d+)\b', name, re.I)
    if not match:
        raise ValueError('Unusable unit program/number')
    return match[1].lower(), int(match[2])


def district(value):
    return re.sub(r'\s+\d+$', '', str(value).strip()).casefold()


def fingerprint(path):
    stat = Path(path).stat()
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def read_source(path, report_date):
    path = Path(path)
    before = fingerprint(path)
    # This export has no generation footer: mtime is only an intake-date gate,
    # not proof of report generation. Reconcile its IDs to the workbook PINs.
    if datetime.fromtimestamp(path.stat().st_mtime, ZoneInfo('America/Chicago')).date().isoformat() != report_date:
        raise ValueError('BeAScout link lookup requires the same-day PIN intake copy')
    raw = path.read_bytes()
    if fingerprint(path) != before:
        raise ValueError('PIN link source changed while being read')
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    reader = csv.DictReader(io.StringIO(text), strict=True)
    fields = reader.fieldnames or []
    if not SOURCE_FIELDS <= set(fields) or len(fields) != len(set(fields)):
        raise ValueError('PIN link source schema is incomplete or duplicated')
    rows = {}
    for record in reader:
        if None in record or any(value is None for value in record.values()):
            raise ValueError('Malformed PIN link source row')
        row = {key: record[key].strip() for key in SOURCE_FIELDS}
        uid = row['unitid']
        if not re.fullmatch(r'[0-9]+', uid) or int(uid) <= 0 or int(uid) in rows:
            raise ValueError('Invalid or duplicate PIN link source unit ID')
        row['unitid'] = str(int(uid))
        if row['councilname'] != 'Capitol Area Council 564':
            raise ValueError('Unexpected council in PIN link source')
        rows[int(uid)] = row
    if not rows:
        raise ValueError('Empty PIN link source')
    return rows, hashlib.sha256(raw).hexdigest()


def verify_page(url, content, row):
    if not re.fullmatch(URL_PATTERN, url):
        raise ValueError('Resolver did not return a canonical unit page')
    title = re.search(r'<h1\b[^>]*>(.*?)</h1>', content, re.I | re.S)
    title = html.unescape(re.sub('<[^>]+>', '', title[1])) if title else ''
    if identity(title) != identity(row['unitname']):
        raise ValueError('Resolved page has a different unit identity')
    headings = re.findall(r'<h2\b[^>]*>(.*?)</h2>', content, re.I | re.S)
    if not any(html.unescape(re.sub('<[^>]+>', '', value)).strip() == 'Capitol Area Council 564' for value in headings):
        raise ValueError('Resolved page council was not confirmed')
    source_gender = re.search(r'\(([BGF])\)\s*$', row['unitname'])
    if source_gender:
        expected = {'B': 'Boys', 'G': 'Girls', 'F': 'Boys/Girls'}[source_gender[1]]
        genders = re.findall(r'>\s*(Boys/Girls|Boys|Girls)\s*<', content)
        if genders and expected not in genders:
            raise ValueError('Resolved page gender differs')
    return url


def resolve(row):
    zipcode = re.fullmatch(r'([0-9]{5})(?:-[0-9]{4})?', row['zipcode'])
    if not zipcode:
        raise ValueError('No usable source ZIP code')
    url = f"https://beascout.scouting.org/list/?zip={zipcode[1]}&unitID={row['unitid']}"
    # curl's total deadline also bounds slow response bodies and redirects;
    # a socket inactivity timeout alone does not bound a complete request.
    with tempfile.TemporaryDirectory(prefix='beascout-') as folder:
        body = Path(folder) / 'page.html'
        result = subprocess.run([
            '/usr/bin/curl', '--silent', '--show-error', '--fail', '--location',
            '--proto', '=https', '--proto-redir', '=https', '--max-redirs', '5',
            '--max-time', str(REQUEST_SECONDS), '--max-filesize', '2000000',
            '--output', str(body), '--write-out', '%{url_effective}\n%{http_code}', url,
        ], capture_output=True, timeout=REQUEST_SECONDS + 2, check=True)
        final, status = result.stdout.decode('utf-8').rsplit('\n', 1)
        if status != '200' or body.stat().st_size > 2_000_000:
            raise ValueError('Unsuccessful or oversized unit page response')
        return verify_page(final, body.read_text(encoding='utf-8'), row)


def expected_source_ids(units, council):
    """Bind source coverage to existing authoritative workbook PIN matches."""
    pins = council.get('dashboard', {}).get('unit_pin_statuses')
    if not isinstance(pins, list) or not pins:
        raise ValueError('Missing authoritative workbook PIN population')
    lookup = {}
    for unit in units:
        name = ' '.join(str(value).strip() for value in
                        (unit.get('unit_type'), unit.get('number'), unit.get('gender'))
                        if value not in (None, '')) or unit['name']
        key = district(unit['district']), name
        if key in lookup:
            raise ValueError('Ambiguous authoritative unit identity')
        lookup[key] = unit['unit_id']
    expected = set()
    for pin in pins:
        uid = lookup.get((district(pin['district']), pin['unit']))
        if uid is None or uid in expected:
            raise ValueError('Duplicate or unmatched authoritative PIN identity')
        expected.add(uid)
    return expected


def enrich(units, source, report_date, resolver=resolve, expected_ids=None, budget_seconds=RUN_SECONDS):
    before = fingerprint(source)
    rows, digest = read_source(source, report_date)
    deadline = time.monotonic() + budget_seconds
    audit, urls, pending, seen = {}, {}, [], set()
    for unit in units:
        uid = unit['unit_id']
        if type(uid) is not int or uid <= 0 or uid in seen:
            raise ValueError('Invalid or duplicate destination unit ID')
        seen.add(uid)
        row = rows.get(uid)
        if row is None:
            audit[uid] = {'unit_id': uid, 'result': 'No matched PIN source'}
        elif identity(unit['name']) != identity(row['unitname']) or district(unit['district']) != district(row['districtname']):
            raise ValueError(f'PIN link source identity mismatch for unit {uid}')
        else:
            source_gender = re.search(r'\(([BGF])\)\s*$', row['unitname'])
            if source_gender and unit.get('gender') and source_gender[1] != unit['gender']:
                raise ValueError(f'PIN link source gender mismatch for unit {uid}')
            pending.append(uid)
    matched = set(pending)
    if expected_ids is not None and matched != set(expected_ids):
        raise ResolutionFailure('Raw PIN link coverage differs from authoritative workbook PIN matches', list(audit.values()))
    for workers in (3, 1):
        def attempt(uid):
            if time.monotonic() + REQUEST_SECONDS + 2 > deadline:
                return uid, None, 'Run deadline reached'
            try:
                url = resolver(rows[uid])
                if not re.fullmatch(URL_PATTERN, url):
                    raise ValueError('Invalid canonical URL')
                return uid, url, 'Verified'
            except Exception as exc:
                # Never store exception text: server responses or future
                # libraries may put private source data into their messages.
                return uid, None, 'Verification failed: ' + type(exc).__name__
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(attempt, pending))
        pending = []
        for uid, url, result in results:
            audit[uid] = {'unit_id': uid, 'url': url, 'result': result}
            if url is None:
                pending.append(uid)
            else:
                urls[uid] = url
    if hashlib.sha256(Path(source).read_bytes()).hexdigest() != digest or fingerprint(source) != before:
        raise ResolutionFailure('PIN link source changed during resolution', list(audit.values()))
    if pending or not urls:
        raise ResolutionFailure(f'{len(pending)} matched BeAScout listings unresolved; publication blocked', list(audit.values()))
    if len(set(urls.values())) != len(urls):
        raise ResolutionFailure('Different unit IDs resolved to the same BeAScout listing', list(audit.values()))
    # Commit enrichment only after every matched listing and source check pass.
    for unit in units:
        unit['beascout_url'] = urls.get(unit['unit_id'])
    return {'version': 1, 'verified': len(urls), 'unavailable': len(units) - len(urls),
            'matched_source_units': len(matched),
            'verified_at': datetime.now(ZoneInfo('America/Chicago')).isoformat(timespec='seconds'),
            'source_sha256': digest}, list(audit.values())

"""Resolve public unit listing URLs; never publish private PIN CSV fields."""
from __future__ import annotations
import csv
import hashlib
import html
import io
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen
from zoneinfo import ZoneInfo

URL_PATTERN = r'https://beascout\.scouting\.org/units/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'


def identity(name):
    match = re.match(r'\s*(Pack|Troop|Crew|Ship|Post)\s*0*(\d+)\b', name, re.I)
    if not match:
        raise ValueError('Unusable unit program/number')
    return match[1].lower(), int(match[2])


def district(value):
    return re.sub(r'\s+\d+$', '', str(value).strip()).casefold()


def read_source(path, report_date):
    path = Path(path)
    # This CSV has no report-generation footer. Require today's intake copy and
    # record its digest; the workbook remains authoritative for PIN measures.
    if datetime.fromtimestamp(path.stat().st_mtime, ZoneInfo('America/Chicago')).date().isoformat() != report_date:
        raise ValueError('BeAScout link lookup requires the same-day PIN report')
    raw = path.read_bytes()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    reader = csv.DictReader(io.StringIO(text))
    if not {'unitid', 'unitname', 'councilname', 'districtname', 'zipcode'} <= set(reader.fieldnames or []):
        raise ValueError('PIN link source schema is incomplete')
    rows = {}
    for row in reader:
        uid = row['unitid'].strip()
        if not uid.isdigit() or uid in rows:
            raise ValueError('Invalid or duplicate PIN link source unit ID')
        if row['councilname'].strip() != 'Capitol Area Council 564':
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
    if not any(re.sub('<[^>]+>', '', value).strip() == 'Capitol Area Council 564' for value in headings):
        raise ValueError('Resolved page council was not confirmed')
    # Corroborate gender when both source and page explicitly identify it.
    source_gender = re.search(r'\(([BGF])\)\s*$', row['unitname'])
    if source_gender:
        expected = {'B': 'Boys', 'G': 'Girls', 'F': 'Boys/Girls'}[source_gender[1]]
        genders = re.findall(r'>(Boys/Girls|Boys|Girls)<', content)
        if genders and expected not in genders:
            raise ValueError('Resolved page gender differs')
    return url


def resolve(row):
    zipcode = re.match(r'\d{5}', row['zipcode'].strip())
    if not zipcode:
        raise ValueError('No usable source ZIP code')
    url = f"https://beascout.scouting.org/list/?zip={zipcode[0]}&unitID={row['unitid']}"
    with urlopen(url, timeout=25) as response:
        if response.status != 200:
            raise ValueError('Unsuccessful unit page response')
        content = response.read(2_000_001)
        if len(content) > 2_000_000:
            raise ValueError('Unit page exceeds expected size')
        return verify_page(response.url, content.decode('utf-8'), row)


def enrich(units, source, report_date, resolver=resolve):
    rows, digest = read_source(source, report_date)
    audit = {}
    pending = []
    seen = set()
    for unit in units:
        uid = unit['unit_id']
        if uid in seen:
            raise ValueError('Duplicate destination unit ID')
        seen.add(uid)
        unit['beascout_url'] = None
        row = rows.get(uid)
        if row is None:
            audit[uid] = {'unit_id': uid, 'result': 'No matched PIN source'}
        elif identity(unit['name']) != identity(row['unitname']) or district(unit['district']) != district(row['districtname']):
            raise ValueError(f'PIN link source identity mismatch for unit {uid}')
        else:
            pending.append(unit)
    # Retry non-unit responses once, at reduced concurrency. Never substitute
    # a search page or an application link for the public information page.
    for workers in (3, 1):
        def attempt(unit):
            uid = unit['unit_id']
            try:
                url = resolver(rows[uid])
                if not re.fullmatch(URL_PATTERN, url):
                    raise ValueError('Invalid canonical URL')
                return uid, url, 'Verified'
            except Exception as exc:
                return uid, None, type(exc).__name__ + ': ' + str(exc)[:180]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(attempt, pending))
        by_id = {unit['unit_id']: unit for unit in pending}
        pending = []
        for uid, url, result in results:
            by_id[uid]['beascout_url'] = url
            audit[uid] = {'unit_id': uid, 'url': url, 'result': result}
            if url is None:
                pending.append(by_id[uid])
    if hashlib.sha256(Path(source).read_bytes()).hexdigest() != digest:
        raise ValueError('PIN link source changed during resolution')
    urls = [unit['beascout_url'] for unit in units if unit['beascout_url']]
    if len(urls) != len(set(urls)):
        raise ValueError('Different unit IDs resolved to the same BeAScout listing')
    verified = len(urls)
    if not verified:
        raise ValueError('No BeAScout unit links could be verified; publication blocked')
    return {'verified': verified, 'unavailable': len(units) - verified,
            'verified_at': datetime.now(ZoneInfo('America/Chicago')).isoformat(timespec='seconds'),
            'source_sha256': digest}, list(audit.values())

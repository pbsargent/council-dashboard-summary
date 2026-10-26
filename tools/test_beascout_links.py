"""Offline regression coverage for link identity, outages and publication gates."""
import copy
import csv
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo
from beascout_links import enrich, verify_page, read_source, resolve, expected_source_ids, ResolutionFailure
from validate_site_structure import validate_beascout_bundle

URL = 'https://beascout.scouting.org/units/5d8f6736-4bd3-47ec-8d81-095707dc2dc2'
ROW = {'unitid': '25921', 'unitname': 'Pack 0002, Example', 'councilname': 'Capitol Area Council 564', 'districtname': 'North Shore 11', 'zipcode': '78731'}
PAGE = '<h1>Pack 0002 Example</h1><h2>Capitol Area Council 564</h2>'


class Links(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'pin.csv'
        self.today = datetime.now(ZoneInfo('America/Chicago')).date().isoformat()
        self.units = [{'unit_id': 25921, 'name': 'Pack 2', 'unit_type': 'Pack', 'number': 2, 'district': 'North Shore'},
                      {'unit_id': 99, 'name': 'Pack 99', 'unit_type': 'Pack', 'number': 99, 'district': 'North Shore'}]
        self.council = {'dashboard': {'unit_pin_statuses': [{'district': 'North Shore', 'unit': 'Pack 2'}]}}
        self.write([ROW])

    def write(self, rows):
        with self.path.open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=rows[0].keys() if rows else ROW.keys())
            writer.writeheader(); writer.writerows(rows)

    def test_identity_council_gender_and_canonical_url(self):
        self.assertEqual(verify_page(URL, PAGE, ROW), URL)
        cases = [(URL, PAGE.replace('0002', '0003')), (URL, PAGE.replace('564', '999')),
                 ('https://evil.example/units/x', PAGE), ('http://beascout.scouting.org/units/x', PAGE),
                 ('https://beascout.scouting.org/search', PAGE), (URL + '?x=1', PAGE)]
        for url, page in cases:
            with self.subTest(url=url, page=page), self.assertRaises(ValueError): verify_page(url, page, ROW)
        with self.assertRaises(ValueError): verify_page(URL, PAGE + '<li> Boys </li>', dict(ROW, unitname='Pack 0002 (G)'))

    def test_duplicate_numeric_ids_including_zero_padding(self):
        for second in ['25921', '025921']:
            self.write([ROW, dict(ROW, unitid=second)])
            with self.assertRaisesRegex(ValueError, 'duplicate'): read_source(self.path, self.today)

    def test_malformed_stale_empty_and_wrong_council(self):
        for text in ['unitid,unitid\n1,1\n', ','.join(ROW) + '\n1,2\n', ','.join(ROW) + '\n']:
            self.path.write_text(text)
            with self.assertRaises(ValueError): read_source(self.path, self.today)
        self.write([dict(ROW, councilname='Other Council')])
        with self.assertRaisesRegex(ValueError, 'council'): read_source(self.path, self.today)
        self.write([ROW])
        with self.assertRaisesRegex(ValueError, 'same-day'): read_source(self.path, '2000-01-01')

    def test_private_fields_are_not_passed_to_resolver(self):
        self.write([dict(ROW, private_contact='Do not publish')])
        seen = []
        def resolver(row): seen.append(row); return URL
        summary, audit = enrich(self.units, self.path, self.today, resolver, expected_ids={25921})
        self.assertNotIn('private_contact', seen[0])
        self.assertNotIn('Do not publish', json.dumps(audit))
        self.assertEqual((summary['verified'], summary['unavailable']), (1, 1))
        self.assertIsNone(self.units[1]['beascout_url'])

    def test_transient_failure_retries_and_succeeds(self):
        calls = []
        def resolver(row):
            calls.append(1)
            if len(calls) == 1: raise ValueError('Transient')
            return URL
        enrich(self.units, self.path, self.today, resolver)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.units[0]['beascout_url'], URL)

    def test_partial_outage_preserves_destination_and_redacts_failure_audit(self):
        self.write([ROW, dict(ROW, unitid='99', unitname='Pack 99')])
        self.units[0]['beascout_url'] = URL
        before = copy.deepcopy(self.units)
        def resolver(row):
            if row['unitid'] == '99': raise RuntimeError('PRIVATE CONTACT OR SERVER BODY')
            return URL
        with self.assertRaises(ResolutionFailure) as caught:
            enrich(self.units, self.path, self.today, resolver)
        self.assertEqual(self.units, before)
        self.assertNotIn('PRIVATE', json.dumps(caught.exception.audit))

    def test_population_mismatch_and_duplicate_destination(self):
        with self.assertRaises(ResolutionFailure): enrich(self.units, self.path, self.today, lambda row: URL, expected_ids={25921, 99})
        with self.assertRaises(ValueError): enrich(self.units + [self.units[0]], self.path, self.today, lambda row: URL)
        self.units[0]['name'] = 'Troop 2'
        with self.assertRaises(ValueError): enrich(self.units, self.path, self.today, lambda row: URL)

    def test_different_ids_cannot_share_a_listing(self):
        self.write([ROW, dict(ROW, unitid='99', unitname='Pack 99')])
        before = copy.deepcopy(self.units)
        with self.assertRaisesRegex(ResolutionFailure, 'same BeAScout'): enrich(self.units, self.path, self.today, lambda row: URL)
        self.assertEqual(before, self.units)

    def test_deadline_exhaustion_does_not_start_requests(self):
        with patch('beascout_links.time.monotonic', side_effect=[0, 1000, 1000]):
            with self.assertRaises(ResolutionFailure): enrich(self.units, self.path, self.today, lambda row: self.fail('Request started after deadline'))
        self.assertNotIn('beascout_url', self.units[0])

    def test_changed_and_restored_source_is_rejected(self):
        before = copy.deepcopy(self.units)
        def resolver(row):
            stat = self.path.stat()
            os.utime(self.path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1000000))
            return URL
        with self.assertRaisesRegex(ResolutionFailure, 'changed during'): enrich(self.units, self.path, self.today, resolver)
        self.assertEqual(before, self.units)

    def test_curl_request_is_bounded_and_https_only(self):
        def run(command, **kwargs):
            self.assertEqual(kwargs['timeout'], 27)
            for flag in ['--max-time', '--max-redirs', '--max-filesize', '--proto-redir']:
                self.assertIn(flag, command)
            Path(command[command.index('--output') + 1]).write_text(PAGE)
            return subprocess.CompletedProcess(command, 0, (URL + '\n200').encode(), b'')
        with patch('beascout_links.subprocess.run', side_effect=run): self.assertEqual(resolve(ROW), URL)
        for zipcode in ['78731evil', '787310', '']:
            with self.assertRaises(ValueError): resolve(dict(ROW, zipcode=zipcode))

    def test_failed_cli_preserves_both_existing_bundles(self):
        from openpyxl import Workbook
        folder = Path(self.temp.name)
        workbook = Workbook(); workbook.remove(workbook.active)
        for name, headers in [('Units', ['UnitID']), ('MembersDueToRenew', ['UnitID']),
                              ('Unit_Metrics', ['Unit_ID', 'Unit Metric', 'District', 'Unit', '#'])]:
            workbook.create_sheet(name).append(headers)
        workbook['Unit_Metrics'].append([25921, 3, 'North Shore', 'Pack', 2])
        source = folder / (self.today + '_CAC - Unit Metric Scorecard.xlsx')
        workbook.save(source); workbook.close()
        council = copy.deepcopy(self.council)
        council['dashboard'].update(report_date=self.today, membership_operations={'units': [
            {'unit_id': '25921', 'district': 'North Shore', 'unit': 'Pack 2', 'unit_type': 'Pack', 'youth': 1}]})
        council_path = folder / 'council.json'; council_path.write_text(json.dumps(council))
        self.write([dict(ROW, zipcode='')])  # Invalid before any network request.
        output, script, audit = [folder / name for name in ('unit.json', 'unit.js', 'audit.json')]
        output.write_text('prior JSON'); script.write_text('prior JS')
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('build_unit_level_dashboard.py')),
            str(source), '--council-snapshot', str(council_path), '--beascout-pin-report', str(self.path),
            '--beascout-audit', str(audit), '--output', str(output), '--js-output', str(script)],
            capture_output=True, text=True, timeout=20)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(output.read_text(), 'prior JSON')
        self.assertEqual(script.read_text(), 'prior JS')
        self.assertTrue(json.loads(audit.read_text()))

    def test_daily_refresh_requires_lookup_and_private_audit(self):
        root = Path(__file__).resolve().parents[1]
        script = (root / 'update_daily.zsh').read_text()
        build = script.split('"$PYTHON" "$UNIT_LEVEL_BUILDER" "$UNIT_LEVEL_SOURCE"', 1)[1].split('UNIT_LEVEL_STATUS=', 1)[0]
        self.assertIn('--beascout-pin-report', build)
        self.assertIn('--beascout-audit "${BUILD_DIR}/beascout-link-audit.json"', build)
        self.assertIn('BEASCOUT_COVERAGE', build)

    def test_browser_bundle_and_verification_metadata(self):
        expected = expected_source_ids(self.units, self.council)
        summary, _ = enrich(self.units, self.path, self.today, lambda row: URL, expected_ids=expected)
        payload = {'units': self.units, 'data_date': self.today, 'source': {'beascout_links': summary}}
        script = 'window.UNIT_LEVEL_DATA = ' + json.dumps(payload) + ';\n'
        self.assertEqual(validate_beascout_bundle(self.council, payload, script), [])
        self.assertTrue(validate_beascout_bundle(self.council, payload, 'window.UNIT_LEVEL_DATA = {};'))
        for key, value in [('version', True), ('verified', True), ('unavailable', 10), ('source_sha256', 'bad'), ('verified_at', '2000-01-01T00:00:00+00:00')]:
            bad = copy.deepcopy(payload); bad['source']['beascout_links'][key] = value
            self.assertTrue(validate_beascout_bundle(self.council, bad, script), key)
        bad = copy.deepcopy(payload); del bad['source']['beascout_links']
        self.assertTrue(validate_beascout_bundle(self.council, bad, script))


if __name__ == '__main__': unittest.main()

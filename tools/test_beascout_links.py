import csv
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from beascout_links import enrich, verify_page

URL = 'https://beascout.scouting.org/units/5d8f6736-4bd3-47ec-8d81-095707dc2dc2'
ROW = {'unitid': '25921', 'unitname': 'Pack 0002, Example', 'councilname': 'Capitol Area Council 564', 'districtname': 'North Shore 11', 'zipcode': '78731'}
PAGE = '<h1>Pack 0002 Example</h1><h2>Capitol Area Council 564</h2>'

class Links(unittest.TestCase):
    def test_identity_and_url(self):
        self.assertEqual(verify_page(URL, PAGE, ROW), URL)
        for url, page in [(URL, PAGE.replace('0002', '0003')), (URL, PAGE.replace('564', '999')), ('https://evil.example/units/x', PAGE), ('https://beascout.scouting.org/search', PAGE)]:
            with self.assertRaises(ValueError):
                verify_page(url, page, ROW)

    def test_gender_mismatch(self):
        row = dict(ROW, unitname='Pack 0002, Example (G)')
        with self.assertRaises(ValueError):
            verify_page(URL, PAGE + '<li>Boys</li>', row)

    def test_join_retry_and_private_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pin.csv'
            with path.open('w') as handle:
                writer = csv.DictWriter(handle, fieldnames=ROW.keys()); writer.writeheader(); writer.writerow(ROW)
            today = datetime.now(ZoneInfo('America/Chicago')).date().isoformat()
            units = [{'unit_id': 25921, 'name': 'Pack 2', 'district': 'North Shore'}, {'unit_id': 99, 'name': 'Pack 99', 'district': 'North Shore'}]
            calls = []
            def resolver(row):
                calls.append(1)
                if len(calls) == 1:
                    raise ValueError('Transient search response')
                return URL
            summary, audit = enrich(units, path, today, resolver)
            self.assertEqual((summary['verified'], summary['unavailable']), (1, 1))
            self.assertEqual(len(calls), 2)
            self.assertEqual(units[0]['beascout_url'], URL)
            self.assertIsNone(units[1]['beascout_url'])
            self.assertNotIn('zipcode', str(audit))
            with self.assertRaises(ValueError): enrich(units + [units[0]], path, today, resolver)
            def unavailable(row): raise ValueError('Unavailable')
            with self.assertRaises(ValueError): enrich(units, path, today, unavailable)
            units[0]['name'] = 'Troop 2'
            with self.assertRaises(ValueError): enrich(units, path, today, resolver)
            with self.assertRaises(ValueError): enrich([], path, '2000-01-01', resolver)

if __name__ == '__main__': unittest.main()

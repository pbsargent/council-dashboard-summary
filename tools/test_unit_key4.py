import copy
import csv
import tempfile
import unittest
from pathlib import Path

from enrich_unit_key4 import enrich


class Key4Test(unittest.TestCase):
    def test_coverage_dates_identity_privacy_and_failure(self):
        payload = {'dashboard': {'report_date': '2026-11-04', 'unit_key3_statuses': [
            {'unit_id': '100', 'status': 'Complete', 'missing_roles': []},
            {'unit_id': '101', 'status': 'Missing 1', 'missing_roles': ['Unit Leader']},
        ]}}
        fields = ['MemberID', 'UnitID', 'PositionID', 'unitPosition', 'EffectiveDT',
                  'ExpiryDT', 'FirstName', 'LastName', 'IsYouth', 'IsDelete', 'isDeceased']
        holder = ['1', '100', '328', 'Executive Officer', '01/01/2026', '12/31/2026',
                  'Morgan', 'Example', '0', '', '']
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'CouncilRoster-2026-11-04.csv'
            def write(rows):
                with source.open('w', newline='') as stream:
                    writer = csv.writer(stream)
                    writer.writerow(fields)
                    writer.writerows(rows)
            expired = holder.copy(); expired[1] = '101'; expired[5] = '11/03/2026'
            future = holder.copy(); future[1] = '101'; future[4] = '11/05/2026'
            write([holder, holder, expired, future])
            rows = enrich(copy.deepcopy(payload), source)['dashboard']['unit_key3_statuses']
            self.assertEqual(rows[0]['executive_officers'], [{'name': 'Morgan E.', 'position': 'Executive Officer'}])
            self.assertEqual(rows[0]['key4_status'], 'Complete')
            self.assertEqual(rows[1]['key4_status'], 'Missing 2')
            self.assertEqual(rows[1]['status'], 'Missing 1')
            self.assertEqual(rows[1]['executive_officers'], [])
            invalid = holder.copy(); invalid[5] = ''
            write([invalid])
            with self.assertRaisesRegex(ValueError, 'dates'):
                enrich(copy.deepcopy(payload), source)
            write([])
            with self.assertRaisesRegex(ValueError, 'empty'):
                enrich(copy.deepcopy(payload), source)
            with self.assertRaisesRegex(ValueError, 'dated'):
                enrich(copy.deepcopy(payload), source.with_name('CouncilRoster.csv'))


if __name__ == '__main__':
    unittest.main()

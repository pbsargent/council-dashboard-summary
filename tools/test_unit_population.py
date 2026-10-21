"""Complete source identities must stay in the same district filter population."""
import unittest
from build_unit_level_dashboard import complete_unit_population

class UnitPopulationTest(unittest.TestCase):
    def snapshot(self):
        return {'dashboard': {'report_date': '2026-10-21', 'membership_operations': {'units': [
            {'unit_id': '1', 'district': 'North Shore', 'unit': 'Pack 1 F', 'unit_type': 'Pack', 'youth': 4},
            {'unit_id': '2', 'district': 'North Shore', 'unit': 'Pack 2 F', 'unit_type': 'Pack', 'youth': 0}]}}}
    def test_canonical_district_and_unknown_metric(self):
        units = complete_unit_population([{'unit_id': 1, 'district': 'North Shore 11', 'metric': 4}], self.snapshot(), '2026-10-21', {}, {})
        self.assertEqual({row['district'] for row in units}, {'North Shore'})
        self.assertEqual(len(units), 2)
        self.assertIsNone(units[1]['metric'])
        self.assertTrue(all(value is None for value in units[1]['drivers'].values()))
    def test_reject_date_duplicate_and_unmatched_identity(self):
        with self.assertRaises(ValueError): complete_unit_population([], self.snapshot(), '2026-10-20', {}, {})
        duplicate = self.snapshot(); duplicate['dashboard']['membership_operations']['units'] *= 2
        with self.assertRaises(ValueError): complete_unit_population([], duplicate, '2026-10-21', {}, {})
        with self.assertRaises(ValueError): complete_unit_population([{'unit_id': 3}], self.snapshot(), '2026-10-21', {}, {})

if __name__ == '__main__': unittest.main()

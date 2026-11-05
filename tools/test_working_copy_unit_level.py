"""Exercise native working-copy columns and exact joins without member data."""
import unittest
from types import SimpleNamespace
from build_unit_level_dashboard import working_copy_rows

class Sheet:
    def __init__(self, rows): self.rows = rows
    def __getitem__(self, n): return [SimpleNamespace(value=x) for x in self.rows[n-1]]
    def iter_rows(self, min_row=1, values_only=False): return iter(self.rows[min_row-1:])

class Book(dict):
    @property
    def sheetnames(self): return list(self)

class WorkingCopyTests(unittest.TestCase):
    def book(self):
        return Book({'Units': Sheet([['Unit_ID','Unique_ID','Baloo Trained','SYT\n0-30','Direct Contact Trained'],[123,'KEY',2,3,.75]]),
          'Unit Metrics': Sheet([['note'],['Unit_ID','Retention','Youth Prev_Yr','Connect Date','Chartered_Organization','Exceed_Small Unit_Threshold'],[123,44,20,'11/04/2026','Org','Yes']]),
          'MembersDueToRenew': Sheet([['District','Unit','#','Gender','Renewal','Name','Position','memberid','Youth','Opt_Out','Key','Unit Name','padding','Renewal'],
              ['District','Pack',1,'F','SOURCE_DATE','Example X.','Youth',99,'Yes','No','KEY','Pack 1',None,'WRONG_CALCULATED_DATE'],
              ['District','Pack',2,'F','DATE','Example Y.','Youth',100,'Yes','No','UNMATCHED','Pack 2']])})
    def test_all_shared_fields_use_working_generation_and_source_date(self):
        training,metrics,due,unmatched=working_copy_rows(self.book())
        self.assertEqual(training[0]['UnitID'],123)
        self.assertEqual(training[0]['BALOO Trained'],2)
        self.assertEqual(training[0]['SYT 0-30'],3)
        self.assertEqual(metrics[0]['Retention'],44)
        self.assertEqual(metrics[0]['Youth Prev Yr'],20)
        self.assertEqual(metrics[0]['Exceed Small Unit Threshold'],'Yes')
        self.assertEqual(due[0]['Renewal'],'SOURCE_DATE')
        self.assertEqual(due[0]['UnitID'],123)
        self.assertEqual(unmatched,1)
    def test_ambiguous_key_or_unit_id_stops(self):
        b=self.book();b['Units'].rows.append([124,'KEY',0,0,.1])
        with self.assertRaises(ValueError): working_copy_rows(b)
        b=self.book();b['Units'].rows.append([123,'OTHER',0,0,.1])
        with self.assertRaises(ValueError): working_copy_rows(b)
    def test_zero_and_missing_source_values_remain_distinct(self):
        b=self.book();b['Unit Metrics'].rows[2][1]=None
        self.assertIsNone(working_copy_rows(b)[1][0]['Retention'])
        b['Unit Metrics'].rows[2][1]=0
        self.assertEqual(working_copy_rows(b)[1][0]['Retention'],0)

if __name__=='__main__':unittest.main()

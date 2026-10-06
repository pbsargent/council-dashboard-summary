import csv, hashlib, json, tempfile, unittest
from pathlib import Path
from popcorn_sales import enrich_popcorn, load_sales, validate_public_sales, SALES_FIELD

class SalesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/'sales.csv'
        self.rows = [{'Unit_Name':'Pack 0082','District_Name':'Waterloo','Unit Key':'u82','SKU Name':sku,'Traditional App Sales $':amount,'Online Sales $':'0',SALES_FIELD:amount} for sku,amount in [('A','100'),('B','50')]]
        self.write()
    def write(self, campaign='2026 Selling Campaign', date='2026-10-05T12:00:00-05:00'):
        with self.path.open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(self.rows[0]));w.writeheader();w.writerows(self.rows)
        self.path.with_suffix('.receipt.json').write_text(json.dumps({'campaign':campaign,'downloaded_at':date,'sha256':hashlib.sha256(self.path.read_bytes()).hexdigest()}))
    def test_product_sum_and_missing_unit(self):
        board={'rows':[{'name':'Pack 82','district':'Waterloo'},{'name':'Troop 1','district':'Waterloo'}]}
        enrich_popcorn(board,self.path,'2026-10-05');self.assertEqual(board['rows'][0]['sales_2026_to_date'],150);self.assertIsNone(board['rows'][1]['sales_2026_to_date']);validate_public_sales(board,'2026-10-05')
    def test_stale_and_wrong_campaign(self):
        for campaign,date in [('2025 Selling Campaign','2026-10-05T12:00:00-05:00'),('2026 Selling Campaign','2026-10-04T12:00:00-05:00')]:
            self.write(campaign,date)
            with self.assertRaises(ValueError):load_sales(self.path,'2026-10-05')
    def test_duplicate_product(self):
        self.rows.append(self.rows[0]);self.write()
        with self.assertRaises(ValueError):load_sales(self.path,'2026-10-05')
    def test_ambiguous_unit_key(self):
        self.rows[1]['Unit Key']='other';self.write()
        with self.assertRaises(ValueError):load_sales(self.path,'2026-10-05')
    def test_nonfinite(self):
        self.rows[0][SALES_FIELD]='nan';self.write()
        with self.assertRaises(ValueError):load_sales(self.path,'2026-10-05')
    def test_tampered_hash(self):
        with self.path.open('a') as f:f.write('\n')
        with self.assertRaises(ValueError):load_sales(self.path,'2026-10-05')
    def test_duplicate_board_unit_unavailable(self):
        board={'rows':[{'name':'Pack 82','district':'Waterloo'}]*2};enrich_popcorn(board,self.path,'2026-10-05');self.assertTrue(all(r['sales_2026_to_date'] is None for r in board['rows']))
if __name__=='__main__':unittest.main()

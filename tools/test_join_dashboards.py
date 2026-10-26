"""Regressions for newest-file selection, coverage and fail-closed publication."""
from datetime import date
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from build_join_dashboards import build, newest, read_report, service_area_mapping
import json


class Sheet:
    title = 'Pack joins'
    def __init__(self, rows): self.values = rows


class Workbook:
    sheetnames = ['Pack joins', 'North Shore 11']
    def __init__(self, rows): self.rows = rows
    def __getitem__(self, name):
        rows = [list(r) for r in self.rows]
        if name != 'Pack joins': rows[7][0] = 'Council rank'
        sheet = Sheet(rows)
        sheet.title = name
        return sheet
    def close(self): pass


class JoinsTests(unittest.TestCase):
    def rows(self):
        return [[], ['Council'], ['September 1, 2026–October 26, 2026. New youth only. Transfers and re-registrations excluded.'],
                ['1 unit(s) need review'], ['Packs', 1], ['Joins', 2, None, None, None, None, 0,0,0,0,0,0,0,0,2], [],
                ['Rank','Pack','District','New joins','Unit ID','Chartered organization', *[f'Age {i}' for i in range(4,12)],'Age unavailable','Review status','Sources and method'],
                [1,'Pack 0198','North Shore 11',2,None,None,0,0,0,0,0,0,0,0,2,'Review — missing from current unit report']]

    def parse(self, rows):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.xlsx'
            path.write_bytes(b'fixture')
            with patch('build_join_dashboards.openpyxl.load_workbook', return_value=Workbook(rows)):
                return read_report(path, date(2026,10,26), 'cubs')

    def test_retains_unmatched_unit_and_unavailable_age(self):
        result = self.parse(self.rows())
        self.assertIsNone(result['units'][0]['unit_id'])
        self.assertEqual(result['units'][0]['joins'], 2)
        self.assertEqual(result['units'][0]['ages'][-1], 2)
        self.assertNotIn('Sources and method', result['units'][0])

    def test_malformed_counts_and_period_fail(self):
        for row, column, value in [(8,3,3), (8,6,-1), (2,0,'Stale period'), (8,4,'bad id'), (8,15,None)]:
            with self.subTest(value=value):
                rows=self.rows(); rows[row][column]=value
                with self.assertRaises(ValueError): self.parse(rows)

    def adult_rows(self):
        rows = self.rows()
        rows[2][0] = 'September 1, 2026–October 26, 2026. Youth: New only. Adults: distinct people, new to unit / reported New to Scouting.'
        rows[4] = ['Packs',1,None,'New youth joins','New adults to unit','New to Scouting (reported)']
        rows[5] = rows[5][:3] + [2,3,2,None,None] + rows[5][6:]
        rows[7][3] = 'New youth joins'
        rows[7][4:4] = ['New adults to unit','New to Scouting (reported)']
        rows[8][4:4] = [3,2]
        return rows

    def test_adult_people_counts_and_summary_reconciliation(self):
        report = self.parse(self.adult_rows())
        self.assertEqual(report['units'][0]['adults_new_to_unit'],3)
        self.assertEqual(report['units'][0]['adults_new_to_scouting_reported'],2)
        for row,column,value in ((8,4,-1),(8,5,1),(5,4,4)):
            rows=self.adult_rows(); rows[row][column]=value
            with self.assertRaises(ValueError): self.parse(rows)
        legacy=self.parse(self.rows())
        self.assertIsNone(legacy['units'][0]['adults_new_to_unit'])

    def test_timestamped_generation_takes_precedence_over_date_only(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            prefix='CAC_All_Cub_Pack_Joins_Sept1_2026_to_2026-10-26'
            for suffix in ('.xlsx','_110000_CDT.xlsx','_165231_CDT.xlsx'):
                (folder/(prefix+suffix)).write_bytes(b'fixture')
            self.assertEqual(newest(folder,'cubs')[1].name,prefix+'_165231_CDT.xlsx')

    def test_newest_dated_name_and_no_stale_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            for day in ('2026-10-25','2026-10-26'):
                for kind in ('Cub_Pack','Scout_Troop'):
                    (folder / f'CAC_All_{kind}_Joins_Sept1_2026_to_{day}.xlsx').write_bytes(b'invalid')
            self.assertEqual(newest(folder,'cubs')[0],date(2026,10,26))
            output=folder/'public.js'; output.write_text('previous verified data')
            with self.assertRaises(ValueError): build(folder,output,date(2026,10,27))
            self.assertEqual(output.read_text(),'previous verified data')
            with self.assertRaises(Exception): build(folder,output,date(2026,10,26))
            self.assertEqual(output.read_text(),'previous verified data')

    def test_authoritative_service_areas_require_complete_unambiguous_same_day_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'council.json'
            reports = {'cubs': {'units': [{'district': 'North Shore 11'}]}}
            base = {'report_date': '2026-10-26', 'districts': [{'district': 'North Shore', 'service_area': 'Northern Service Area'}]}
            path.write_text(json.dumps({'dashboard': base}))
            self.assertEqual(service_area_mapping(path, reports, date(2026,10,26)), {'North Shore 11':'Northern Service Area'})
            for rows, day in [([], '2026-10-26'), (base['districts'] * 2, '2026-10-26'), (base['districts'], '2026-10-25')]:
                path.write_text(json.dumps({'dashboard': {'report_date':day,'districts':rows}}))
                with self.assertRaises(ValueError): service_area_mapping(path,reports,date(2026,10,26))


if __name__ == '__main__': unittest.main()

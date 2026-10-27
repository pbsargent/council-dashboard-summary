"""Regressions for newest-file selection, coverage and fail-closed publication."""
from datetime import date
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from build_join_dashboards import build, newest, read_report, service_area_mapping, validate_public_bundle
import copy
import hashlib
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
    def public_reports(self):
        reports = {}
        for kind, token, unit_type in [('cubs','Cub_Pack','Pack'),('scouts-bsa','Scout_Troop','Troop')]:
            report = self.parse(self.adult_rows())
            report.update(program=kind, source_name=f'CAC_All_{token}_Joins_Sept1_2026_to_2026-10-26.xlsx', source_sha256=hashlib.sha256(b'fixture').hexdigest(), district_service_areas={'North Shore 11':'Northern Service Area'})
            report['units'][0]['unit'] = unit_type + ' 0198'
            report['age_labels'] = [f'Age {i}' for i in (range(4,12) if kind == 'cubs' else range(10,18))] + ['Age unavailable']
            reports[kind] = report
        return reports

    def test_public_bundle_rejects_corruption_and_private_fields(self):
        base = self.public_reports()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'joins.js'
            def check(payload):
                path.write_text('window.CAC_JOINS = '+json.dumps(payload)+';\n')
                return validate_public_bundle(path)
            check(base)
            for field, value in [('period_start','2026-01-01'),('source_sha256','bad'),('source_name','../private.xlsx'),('age_labels',['Age 4']*9)]:
                payload=copy.deepcopy(base); payload['cubs'][field]=value
                with self.subTest(field=field), self.assertRaises(ValueError):check(payload)
            for field, value in [('adults_new_to_unit',None),('adults_new_to_scouting_reported',True),('review','private person detail'),('member_name','Private Name')]:
                payload=copy.deepcopy(base); payload['cubs']['units'][0][field]=value
                with self.subTest(field=field), self.assertRaises(ValueError):check(payload)
            payload=copy.deepcopy(base);payload['cubs']['units']*=2
            with self.assertRaises(ValueError):check(payload)

    def test_build_preserves_previous_bundle_on_generation_race_and_failed_candidate(self):
        reports=self.public_reports()
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            for report in reports.values():(folder/report['source_name']).write_bytes(b'fixture')
            snapshot=folder/'council.json';snapshot.write_text(json.dumps({'dashboard':{'report_date':'2026-10-26','districts':[{'district':'North Shore','service_area':'Northern Service Area'}]}}))
            output=folder/'joins.js';output.write_text('previous verified bundle')
            selected=[(date(2026,10,26),folder/r['source_name']) for r in reports.values()]
            later=(date(2026,10,26),folder/'newer-generation.xlsx')
            with patch('build_join_dashboards.read_report',side_effect=lambda p,d,k:copy.deepcopy(reports[k])), patch('build_join_dashboards.newest',side_effect=[*selected,later]):
                with self.assertRaisesRegex(ValueError,'newer joins generation'):build(folder,output,date(2026,10,26),snapshot)
            self.assertEqual(output.read_text(),'previous verified bundle')
            with patch('build_join_dashboards.read_report',side_effect=lambda p,d,k:copy.deepcopy(reports[k])), patch('build_join_dashboards.validate_public_bundle',side_effect=ValueError('invalid candidate')):
                with self.assertRaisesRegex(ValueError,'invalid candidate'):build(folder,output,date(2026,10,26),snapshot)
            self.assertEqual(output.read_text(),'previous verified bundle')
            self.assertEqual(list(folder.glob('.joins-*.js')),[])
            with patch('build_join_dashboards.read_report',side_effect=lambda p,d,k:copy.deepcopy(reports[k])):
                build(folder,output,date(2026,10,26),snapshot)
            self.assertEqual(validate_public_bundle(output),reports)
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

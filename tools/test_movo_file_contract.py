"""Offline guards for the approved Movo file model; synthetic aggregate rows only."""
from copy import deepcopy
from datetime import datetime
import io
import json
import unittest
import zipfile

import build_renewal_outreach_v3_20261123 as parser
import movo_verification_v3_20261123 as verifier
from test_renewal_outreach import source_fixture


class FileContractTests(unittest.TestCase):
    def test_missing_stays_missing_and_ask_mode_still_refuses_text(self):
        source = source_fixture()
        for row in source['tabs']['Outreach replies'][1:]:
            row[3] = 'not stated'
        gaps = []
        result = parser.parse_source(source, source_type='movo_file_xlsx', gaps=gaps)
        self.assertIn({'field': 'outreach.not_messaged', 'status': 'not stated'}, gaps)
        self.assertIn('not checkable', json.dumps(gaps))
        self.assertIn('null', json.dumps(result))
        with self.assertRaises(ValueError):
            parser.parse_source(source)

    def test_printed_zero_is_checked_and_not_a_missing_value(self):
        source = source_fixture()
        for row in source['tabs']['Outreach replies'][1:]:
            row[2], row[3] = 15, 0
        source['tabs']['Council totals'][1][9] = 10
        source['tabs']['Council totals'][3][9] = 15
        gaps = []
        parser.parse_source(source, source_type='movo_file_xlsx', gaps=gaps)
        self.assertEqual(gaps, [])
        source['tabs']['Outreach replies'][1][3] = 1
        with self.assertRaisesRegex(ValueError, 'coverage'):
            parser.parse_source(source, source_type='movo_file_xlsx')

    def test_file_mode_does_not_relax_required_counts_or_reconciliation(self):
        source = source_fixture()
        source['tabs']['Nov by district'][1][6] = 'not stated'
        with self.assertRaises(ValueError):
            parser.parse_source(source, source_type='movo_file_xlsx')
        source = source_fixture()
        source['tabs']['Nov by district'][1][3] += 1
        with self.assertRaises(ValueError):
            parser.parse_source(source, source_type='movo_file_xlsx')

    @staticmethod
    def workbook(tabs=None):
        tabs = verifier.FILE_SOURCE_TABS if tabs is None else tabs
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as book:
            book.writestr('xl/workbook.xml', '<workbook><sheets>' + ''.join(
                f'<sheet name="{name}" sheetId="{i}"/>' for i, name in enumerate(tabs, 1)
            ) + '</sheets></workbook>')
        return out.getvalue()

    def binding_fixture(self):
        posted = self.workbook()
        observed = '2026-11-23T06:00:00-06:00'
        binding = verifier.file_binding(posted,
            'Capitol_Area_Council_Movo_performance_2026-11-23_extended.xlsx',
            '2026-11-23T06:02:00-06:00', observed)
        return posted, binding, {'captured_at': observed, 'data_through': None}

    def test_posted_bytes_clock_name_and_required_tabs_are_bound(self):
        posted, binding, observation = self.binding_fixture()
        self.assertEqual(verifier.validate_file_raw(json.dumps(binding), observation, posted), binding)
        for key, value in [('sha256', '0' * 64), ('bytes', len(posted) + 1),
                           ('filename', 'wrong.xlsx'), ('posted_at', '2026-11-23T05:59:00-06:00')]:
            bad = dict(binding, **{key: value})
            with self.subTest(key=key), self.assertRaises(ValueError):
                verifier.validate_file_raw(json.dumps(bad), observation, posted)
        other = self.workbook(('Renewals',))
        bad = verifier.file_binding(other, binding['filename'], binding['posted_at'], binding['data_as_of'])
        with self.assertRaisesRegex(ValueError, 'source tabs'):
            verifier.validate_file_raw(json.dumps(bad), observation, other)

    def test_unknown_source_type_is_not_a_fallback(self):
        with self.assertRaisesRegex(ValueError, 'source type'):
            parser.parse_source(source_fixture(), source_type='anything')




class PerformanceFileTests(unittest.TestCase):
    def fixture(self, file_mode=False):
        import build_movo_performance as reader
        rows = [('Nov 30', 10, 2, 6, 1, 4, 1), ('Dec 31', 5, 0, 4, 0, 1, 0), ('All', 15, 2, 10, 1, 5, 1)]
        header = ['View', 'Program', 'Audience', 'Youth %', 'Youth renewed', 'Youth of', 'Adult %', 'Adult renewed', 'Adult of', 'All %', 'All renewed']
        tables = {'About': [['Field', 'Value'], ['Capture date', 'Monday, Nov 23, 2026'], ['Council', 'Capitol Area Council, Scouting America (Round Rock, TX)'], ['Source', reader.PAGE_URL], ['Capture window (CST)', '6:00–6:02 AM CST'], ['Note: data through', 'Movo shows no "data through" date.']],
                  'Summary': [['View', 'Total due', 'Renewed']], 'By program': [header],
                  'Districts': [['View', 'District', 'In outreach', 'Renewed']],
                  'Daily history': [['History'], ['Date', 'Days left', 'Renewed %', 'Renewed', '+Day', '+7 days', 'Note', None, 'Date', 'Days left', 'Renewed %', 'Renewed', '+Day', '+7 days', 'Note'], ['2026-11-23', 7, .2, 2, 1, 1, '', None, '2026-11-23', 38, 0, 0, 0, 0, '']],
                  'Outreach status': [['View'], ['Nov 30', 10, .2, None, None, None, None, None, None, None, None], ['Dec 31', 5, 0, None, None, None, None, None, None, None, None]],
                  'Pin data': [['Metric', 'Count'], ['Reachable units', 50], ['Units contacted', 40], ['Updated their pin', 30], ['Unused A', 0], ['Unused B', 0]],
                  'Joining': [['Scope'], ['National', 10, .5, .4, .6, .5], ['Council', 2, .5, .4, .6, .5]]}
        for label, total, renewed, youth, yr, adult, ar in rows:
            tables['Summary'].append(['All deadlines' if label == 'All' else label, total, renewed])
            for program in ('Example', 'All programs'):
                row = [label, program, total, yr/youth, yr, youth, ar/adult, ar, adult, renewed/total, renewed]
                if file_mode:
                    row[3:9] = ['not stated'] * 6
                    if label == 'All': row[2:] = ['not stated'] * 9
                tables['By program'].append(row)
            for district in ('Example', 'All districts'):
                tables['Districts'].append([label, district, total, renewed, renewed/total, .5, 0])
        if file_mode:
            tables['About'][3][1] = 'Movo daily performance file (Ask Movo thread): Capitol_Area_Council_Movo_performance_2026-11-23_extended.xlsx, posted 6:05 AM CST'
            tables['About'][4][1] = 'MOVO FILE data as of 6:00–6:02 AM CST; posted 6:05 AM CST'
            for row in tables['Joining'][1:]: row[3] = row[5] = 'not stated'
        return tables

    def build(self, tables):
        import build_movo_performance as reader
        from unittest.mock import patch
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                now = cls(2026, 11, 23, 8, 0, tzinfo=reader.CENTRAL)
                return now if tz is None else now.astimezone(tz)
        with patch.object(reader, 'datetime', Clock):
            payload = reader.build(tables)
            reader.validate_asset_text(reader.render_asset(payload))
        return payload

    def test_page_and_file_models_keep_separate_clock_and_missing_semantics(self):
        page = self.build(self.fixture())
        self.assertNotIn('source_kind', page)
        file = self.build(self.fixture(True))
        self.assertEqual(file['source_kind'], 'movo_file')
        self.assertEqual(file['cohorts'][0]['programs'][0][3:], [None] * 4)
        self.assertEqual(file['joining'][0][3], None)
        self.assertIn('All By program view', file['not_stated'])
        self.assertIn('Joining all-councils comparisons', file['not_stated'])

    def test_invalid_name_clock_and_printed_district_count_refuse(self):
        for case in ('name', 'future', 'count'):
            tables = self.fixture(True)
            if case == 'name': tables['About'][3][1] = tables['About'][3][1].replace('2026-11-23', '2026-11-22')
            if case == 'future': tables['About'][4][1] = tables['About'][4][1].replace('6:00–6:02', '9:00–9:02')
            if case == 'count': tables['Districts'][1][2] += 1
            with self.subTest(case=case), self.assertRaises(ValueError): self.build(tables)

    def test_approved_previous_day_history_is_explicit_but_older_refuses(self):
        tables = self.fixture(True)
        tables['Daily history'][2] = ['2026-11-22', 8, .1, 1, 0, 0, '', None, '2026-11-22', 39, 0, 0, 0, 0, '']
        self.assertTrue(any('trend endpoint' in x for x in self.build(tables)['not_checkable']))
        tables['Daily history'][2] = ['2026-11-21', 9, .1, 1, 0, 0, '', None, '2026-11-21', 40, 0, 0, 0, 0, '']
        with self.assertRaises(ValueError): self.build(tables)


if __name__ == '__main__':
    unittest.main()

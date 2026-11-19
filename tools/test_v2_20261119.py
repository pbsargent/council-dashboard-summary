"""Tests for build_renewal_outreach_v2_20261119 / movo_verification_v2_20261119 (2026-11-19).
Run from a folder holding both v2 modules. Inputs via env: TODAY_DIR (observation.json,
raw-structured.txt, sheet-helper-input.json), AGE_SPLIT, PRIOR_DIR (Nov 16 observation.json,
sheet-helper-input.json). No network, no production writes (temp folders only)."""
from copy import deepcopy
import json, os, shutil, tempfile, unittest
from pathlib import Path
import build_renewal_outreach_v2_20261119 as P
import movo_verification_v2_20261119 as H

TODAY = Path(os.environ['TODAY_DIR']); PRIOR = Path(os.environ['PRIOR_DIR']); SPLIT = Path(os.environ['AGE_SPLIT'])
load = lambda p: json.loads(Path(p).read_text())
def src(sheet, tabs=None):
    return {k: sheet[k] for k in ('source_name', 'source_updated_at', 'captured_at')} | {'tabs': deepcopy(tabs if tabs is not None else sheet['tabs'])}

class V2(unittest.TestCase):
    def setUp(self):
        self.sheet = load(TODAY / 'sheet-helper-input.json'); self.obs = load(TODAY / 'observation.json'); self.split = load(SPLIT)
    def test_today_passes_without_split_age_stays_none(self):
        out = P.parse_source(src(self.sheet))
        self.assertTrue(all(r['adults_said_no'] is None and r['youth_said_no'] is None for r in out['reasons']))
    def test_today_passes_with_split_marked_derived(self):
        prov = []; out = P.parse_source(src(self.sheet, self.obs['tabs']), provenance=prov, age_split=self.split)
        self.assertIn('reasons.adults_said_no', [d['field'] for d in prov]); self.assertIn('reasons.youth_said_no', [d['field'] for d in prov])
        a = {(r['district'], r['cohort']): (r['adults_said_no'], r['youth_said_no']) for r in out['reasons']}
        self.assertEqual(a[('Armadillo', '2026-11')], (1, 3)); self.assertEqual(a[('Thunderbird', '2026-11')], (3, 1))
        self.assertTrue(all(x + y == r['said_no'] for r in out['reasons'] for x, y in [(r['adults_said_no'], r['youth_said_no'])]))
    def mutate(self, fn, split=None, msg=None):
        tabs = deepcopy(self.sheet['tabs']); fn(tabs)
        with self.assertRaises(ValueError) as cm:
            P.parse_source(src(self.sheet, tabs), age_split=split)
        if msg: self.assertIn(msg, str(cm.exception))
    def test_rejects_missing_district(self):
        self.mutate(lambda t: t['Said-no reasons'].pop(1), msg='Partial reasons coverage')
    def test_rejects_blank_district(self):
        def f(t): t['Said-no reasons'][1][0] = ''
        self.mutate(f, msg='Missing district')
    def test_rejects_reason_sum_mismatch(self):
        def f(t): t['Said-no reasons'][1][4] += 1   # Armadillo Nov 'Cost' +1
        self.mutate(f, msg='Decline reason counts differ')
    def test_rejects_said_no_vs_cohort_mismatch(self):
        def f(t): t['Said-no reasons'][1][2] += 1; t['Said-no reasons'][1][9] += 1
        self.mutate(f, msg='Reasons differ from cohort')
    def test_rejects_partial_age_columns(self):
        def f(t):
            t['Said-no reasons'][0].append('Adults said no')
            for r in t['Said-no reasons'][1:]: r.append(0)
        self.mutate(f, msg='Partial decline age coverage')
    def test_rejects_still_strict_elsewhere(self):
        def f(t): t['Nov by district'][1][3] += 1
        self.mutate(f)
        def g(t): t['Outreach replies'][1][4] = t['Outreach replies'][1][3] + 1
        self.mutate(g)
    def test_rejects_bad_split(self):
        s = deepcopy(self.split); s['counts']['Armadillo|2026-11']['adults_said_no'] += 1
        self.mutate(lambda t: None, split=s, msg='Age split counts disagree')
        s = deepcopy(self.split); e = s['counts']['Armadillo|2026-11']; e['adults_said_no'] += 1; e['youth_said_no'] -= 1
        self.mutate(lambda t: None, split=s, msg='Council and district counts differ')
        s = deepcopy(self.split); s['counts']['Armadillo|2026-11']['other'] -= 1; s['counts']['Armadillo|2026-11']['cost'] += 1
        self.mutate(lambda t: None, split=s, msg='Age split differs from reasons table')
        s = deepcopy(self.split); s['counts']['Nowhere|2026-11'] = dict(s['counts']['Armadillo|2026-11'])
        self.mutate(lambda t: None, split=s, msg='Age split has rows outside the reasons table')
        s = deepcopy(self.split); s['counts']['Armadillo|2026-11']['Member name'] = 0
        self.mutate(lambda t: None, split=s, msg='Invalid age split fields')
    def test_members_split_accepts_both_unit_headers_and_no_names(self):
        rows = [{'Member name': 'Zqx Testname', 'Adult or Youth': 'Youth', 'Unit (type and number)': 'Pack 1', 'District': 'Armadillo', 'Said-no reason': 'Moved', 'Member comment': '', 'Cohort': '2026-11'}]
        old = [{('Unit' if k.startswith('Unit') else k): v for k, v in rows[0].items()}]
        for r in (rows, old):
            s = P.age_split_from_members(r)
            self.assertEqual(s['counts']['Armadillo|2026-11']['youth_said_no'], 1)
            self.assertNotIn('Zqx', json.dumps(s)); self.assertNotIn('Pack 1', json.dumps(s))
        both = [dict(rows[0], Unit='x')]
        with self.assertRaises(ValueError): P.age_split_from_members(both)
        with self.assertRaises(ValueError): P.age_split_from_members([dict(rows[0], **{'Adult or Youth': 'Leader'})])
    def test_prior_day_nov16_passes_same_as_v1(self):
        import importlib.util
        sheet = load(PRIOR / 'sheet-helper-input.json'); obs = load(PRIOR / 'observation.json')
        out2 = P.parse_source(src(sheet)); P.parse_source(src(sheet, obs['tabs']))
        self.assertTrue(all(r['adults_said_no'] is not None for r in out2['reasons']))
        v1 = os.environ.get('V1_PARSER')
        if v1:
            spec = importlib.util.spec_from_file_location('v1parser', v1); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
            self.assertEqual(m.parse_source(src(sheet)), out2)
        # a split never overrides Movo-reported columns; reported values win and nothing is marked derived
        prov = []; out3 = P.parse_source(src(sheet), provenance=prov, age_split={'counts': {}})
        self.assertEqual(out3, out2); self.assertFalse([d for d in prov if d['field'].startswith('reasons.')])
    def test_receipt_v3_end_to_end_and_tamper(self):
        d = Path(tempfile.mkdtemp())
        try:
            for n in ('observation.json', 'raw-structured.txt', 'sheet-helper-input.json'): shutil.copy(TODAY / n, d / n)
            shutil.copy(SPLIT, d / 'age-split.json')
            out = d / 'r' / 'verification-receipt.json'
            rec = H.create_receipt(d / 'observation.json', d / 'raw-structured.txt', d / 'sheet-helper-input.json', out, d / 'age-split.json')
            self.assertEqual(rec['version'], 3); self.assertEqual({x['field'] for x in rec['derived']} >= {'reasons.adults_said_no', 'reasons.youth_said_no'}, True)
            self.assertEqual(set(rec['evidence']), {'observation', 'raw', 'sheet', 'age_split'})
            H.verify_receipt(out, src(self.sheet) | {'captured_at': rec['verified_at']})
            # tamper: derived list edited
            bad = json.loads(out.read_text()); bad['derived'] = bad['derived'][:1]; out.write_text(json.dumps(bad))
            with self.assertRaises(ValueError): H.verify_receipt(out, src(self.sheet) | {'captured_at': rec['verified_at']})
            # tamper: age split evidence edited
            out.write_text(json.dumps(rec, sort_keys=True)); ev = out.parent / rec['evidence']['age_split']['name']
            ev.chmod(0o600); ev.write_text(ev.read_text().replace('"youth_said_no": 3', '"youth_said_no": 4', 1))
            with self.assertRaises(ValueError): H.verify_receipt(out, src(self.sheet) | {'captured_at': rec['verified_at']})
            # without split: version 2, no derived reasons
            out2 = d / 'r2' / 'verification-receipt.json'
            rec2 = H.create_receipt(d / 'observation.json', d / 'raw-structured.txt', d / 'sheet-helper-input.json', out2)
            self.assertEqual(rec2['version'], 2); self.assertNotIn('derived', rec2)
        finally:
            shutil.rmtree(d)
    def test_bundle_with_split_passes_and_carries_counts_only(self):
        d = Path(tempfile.mkdtemp())
        try:
            for n in ('observation.json', 'raw-structured.txt', 'sheet-helper-input.json'): shutil.copy(TODAY / n, d / n)
            shutil.copy(SPLIT, d / 'age-split.json')
            out = d / 'r' / 'verification-receipt.json'
            H.create_receipt(d / 'observation.json', d / 'raw-structured.txt', d / 'sheet-helper-input.json', out, d / 'age-split.json')
            s = src(self.sheet); s['captured_at'] = json.loads(out.read_text())['verified_at']
            (d / 'source.json').write_text(json.dumps(s))
            b = P.build(d / 'source.json', d / 'bundle.js', d / 'hist', verification_receipt=out, age_split_path=d / 'age-split.json')
            P.validate_bundle((d / 'bundle.js').read_text())
            self.assertTrue(all(r['adults_said_no'] is not None for r in b['snapshots'][-1]['reasons']))
            self.assertNotIn('Member name', (d / 'bundle.js').read_text())
        finally:
            shutil.rmtree(d)

if __name__ == '__main__':
    unittest.main(verbosity=2)

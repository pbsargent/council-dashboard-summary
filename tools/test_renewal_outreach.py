"""Regression checks for Movo aggregates, privacy, freshness and atomic publication."""
from copy import deepcopy
from datetime import datetime, timedelta
import json
from pathlib import Path
import tempfile
import unittest

from build_renewal_outreach import BASE, CENTRAL, build, parse_source, validate_bundle
from movo_verification import SHEET_ID, PARENT_ID, create_receipt, table_hashes, verify_receipt


def source_fixture():
    now = datetime.now(CENTRAL)
    headers = ['District','Cohort','Due date','Members due','Adults due','Youth due','Renewed','Said no','Undecided','Not reached']
    nov = ['Example','2026-11','2026-11-30',10,4,6,2,1,6,1]
    dec = ['Example','2026-12','2026-12-31',5,1,4,0,0,5,0]
    council = ['Cohort','Due date','Members due','Adults due','Youth due','Renewed','Said no','Undecided','Not reached','Messaged by Movo','Replied']
    outreach = ['District','Members in outreach','Messaged by Movo','Not yet messaged','Replied','Renewed',"Renewed after Movo's first message","Renewed before Movo's first message"]
    reasons = ['District','Cohort','Said no','Adults said no','Youth said no','Cost','Lost interest','Aged out','Moved','Unit problem','Other','No reason given']
    return {'source_name':'Synthetic Movo source','source_updated_at':(now-timedelta(minutes=1)).isoformat(), 'captured_at':now.isoformat(),
            'tabs':{'Nov by district':[headers,nov,['Council total']+nov[1:]],
                    'Dec by district':[headers,dec,['Council total']+dec[1:]],
                    'Council totals':[council,nov[1:]+[9,3],dec[1:]+[5,1],['Both cohorts',None,15,5,10,2,1,11,1,14,4]],
                    'Outreach replies':[outreach,['Example',15,14,1,4,2,1,1],['Council total',15,14,1,4,2,1,1]],
                    'Said-no reasons':[reasons,['Example','2026-11',1,0,1,0,0,0,0,0,0,1],['Council total','2026-11',1,0,1,0,0,0,0,0,0,1]]}}


class MovoTests(unittest.TestCase):
    def receipt_fixture(self, root):
        source = source_fixture()
        source['source_updated_at'] = (datetime.now(CENTRAL)-timedelta(days=1)).isoformat()
        observed = (datetime.now(CENTRAL)-timedelta(seconds=3)).isoformat()
        sheet = dict(source, captured_at=(datetime.now(CENTRAL)-timedelta(seconds=2)).isoformat(), sheet_id=SHEET_ID, parent_id=PARENT_ID)
        (root/'observation.json').write_text(json.dumps(dict(captured_at=observed, data_through='2026-10-30', tabs=source['tabs'])))
        (root/'raw.txt').write_text('Synthetic complete five-table Movo response')
        (root/'sheet.json').write_text(json.dumps(sheet))
        receipt = root/'receipt.json'
        create_receipt(root/'observation.json',root/'raw.txt',root/'sheet.json',receipt)
        source['captured_at'] = datetime.now(CENTRAL).isoformat()
        (root/'source.json').write_text(json.dumps(source))
        return source, receipt

    def test_same_day_verified_no_change_with_old_sheet(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source,receipt=self.receipt_fixture(root)
            result=build(root/'source.json',root/'public.js',root/'history',verification_receipt=receipt)
            self.assertEqual(result['snapshots'][-1]['source_updated_at'],source['source_updated_at'])
            self.assertEqual(result['verification']['data_through'],'2026-10-30')
            self.assertNotIn('evidence',(root/'public.js').read_text())
            self.assertNotIn('sha256',(root/'public.js').read_text())
            original=(root/'public.js').read_bytes()
            with self.assertRaises(FileNotFoundError):
                build(root/'source.json',root/'public.js',root/'history',verification_receipt=root/'missing.json')
            self.assertEqual((root/'public.js').read_bytes(),original)

    def test_receipt_rejects_stale_future_identity_and_tampered_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source,path=self.receipt_fixture(root)
            original=path.read_bytes();receipt=json.loads(original)
            for key,value in [('verified_at',(datetime.now(CENTRAL)-timedelta(days=1)).isoformat()),
                              ('observed_at',(datetime.now(CENTRAL)+timedelta(days=1)).isoformat()),
                              ('sheet_id','wrong'),('parent_id','wrong'),('data_through','2099-01-01')]:
                changed=deepcopy(receipt);changed[key]=value;path.write_text(json.dumps(changed))
                with self.subTest(key=key),self.assertRaises(ValueError):verify_receipt(path,source)
            path.write_bytes(original)
            source['tabs']['Nov by district'][1][3]=11
            with self.assertRaisesRegex(ValueError,'tables differ'):verify_receipt(path,source)
            source,_=self.receipt_fixture(root)
            receipt=json.loads(path.read_text());raw=root/receipt['evidence']['raw']['name'];raw.write_text('changed')
            with self.assertRaisesRegex(ValueError,'hash mismatch'):verify_receipt(path,source)

    def test_numeric_format_normalization_and_incomplete_tables(self):
        s=source_fixture()['tabs'];other=deepcopy(s)
        other['Nov by district'][1][3]='10.0';other['Nov by district'][1].append(None)
        self.assertEqual(table_hashes(s),table_hashes(other))
        del other['Council totals']
        with self.assertRaisesRegex(ValueError,'five tables'):table_hashes(other)

    def test_missing_data_through_stays_explicitly_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source,receipt=self.receipt_fixture(root)
            observation=json.loads((root/'observation.json').read_text());observation['data_through']=None
            (root/'observation.json').write_text(json.dumps(observation))
            create_receipt(root/'observation.json',root/'raw.txt',root/'sheet.json',receipt)
            source['captured_at']=datetime.now(CENTRAL).isoformat();(root/'source.json').write_text(json.dumps(source))
            bundle=build(root/'source.json',root/'public.js',root/'history',verification_receipt=receipt)
            self.assertIsNone(bundle['verification']['data_through'])

    def test_reconciles_source_without_inventing_optional_counts(self):
        parsed = parse_source(source_fixture())
        self.assertEqual(sum(r['due'] for r in parsed['rows']),15)
        self.assertEqual(sum(r['renewed'] for r in parsed['rows']),2)
        self.assertIsNone(parsed['rows'][0]['adults_renewed'])
        self.assertIsNone(parsed['rows'][0]['messaged'])
        self.assertEqual(parsed['outreach'][0]['before_message'],1)

    def test_malformed_sources_fail_closed(self):
        mutations = [
            lambda s:s['tabs']['Nov by district'][1].__setitem__(3,11),
            lambda s:s['tabs']['Nov by district'].append(deepcopy(s['tabs']['Nov by district'][1])),
            lambda s:s['tabs']['Nov by district'][1].__setitem__(2,'2026-12-01'),
            lambda s:s['tabs']['Nov by district'][1].__setitem__(3,True),
            lambda s:s['tabs']['Outreach replies'][1].__setitem__(1,16),
            lambda s:s['tabs']['Outreach replies'][1].__setitem__(3,None),
            lambda s:s['tabs']['Said-no reasons'][1].__setitem__(11,0),
            lambda s:s['tabs']['Council totals'][1].__setitem__(3,5),
            lambda s:s.__setitem__('source_updated_at','2026-10-31'),
        ]
        for mutate in mutations:
            s=source_fixture(); mutate(s)
            with self.subTest(mutation=mutate), self.assertRaises((ValueError,TypeError)):
                parse_source(s)

    def test_bad_rate_and_zero_denominator(self):
        s=source_fixture()
        for row in s['tabs']['Nov by district']:
            row.append('Renewal rate (%)' if isinstance(row[0],str) and row[0]=='District' else 30)
        with self.assertRaisesRegex(ValueError,'rate differs'):
            parse_source(s)
        from build_renewal_outreach import check_rate
        check_rate({'rate':None},'rate',0,0)
        with self.assertRaises(ValueError):check_rate({'rate':0},'rate',0,0)

    def test_atomic_failure_preserves_prior_and_history_is_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source.json'; output=root/'public.js'; history=root/'history'
            s=source_fixture(); source.write_text(json.dumps(s))
            bundle=build(source,output,history)
            self.assertEqual(len(bundle['snapshots']),1)
            original=output.read_bytes()
            validate_bundle(original.decode())
            for path in history.glob('*.json'):
                self.assertEqual(path.stat().st_mode & 0o777,0o600)
            build(source,output,history)
            self.assertEqual(len(json.loads(output.read_text().split(' = ',1)[1][:-2])['snapshots']),1)
            s['source_updated_at']=(datetime.now(CENTRAL)-timedelta(days=1)).isoformat()
            source.write_text(json.dumps(s))
            with self.assertRaisesRegex(ValueError,'not updated today'):build(source,output,history)
            self.assertEqual(output.read_bytes(),original)

    def test_public_schema_excludes_person_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source.json';source.write_text(json.dumps(source_fixture()))
            build(source,root/'public.js',root/'history')
            text=(root/'public.js').read_text()
            bad=text.replace('"district":"Example"','"email":"private@example.invalid","district":"Example"',1)
            with self.assertRaisesRegex(ValueError,'Unapproved public fields'):validate_bundle(bad)


if __name__ == '__main__':unittest.main()

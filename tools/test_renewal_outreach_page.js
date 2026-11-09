const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../renewal-outreach.js'),'utf8');
function run(data) {
  const nodes={};
  const document={getElementById(id){return nodes[id] ||= {value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}};},createElement(){return {click(){}};}};
  let csv;
  vm.runInNewContext(code,{window:{CAC_RENEWAL_OUTREACH:data},document,Intl,Date,setTimeout:fn=>fn(),Blob:class{constructor(parts){csv=parts.join('');}},URL:{createObjectURL:()=>'',revokeObjectURL(){}}});
  return {nodes,csv:()=>csv};
}
const row=(district,cohort,due,renewed)=>({district,cohort,due_date:`${cohort}-${cohort.endsWith('11')?'30':'31'}`,due,renewed,adults_due:due/2,youth_due:due/2,adults_renewed:null,youth_renewed:null,said_no:0,undecided:due-renewed,not_reached:0});
const snapshot={source_updated_at:'2026-10-30T12:00:00Z',rows:[row('A','2026-11',10,2),row('B','2026-11',20,10),row('A','2026-12',4,0)],outreach:[{district:'A',due:14,messaged:12,not_messaged:2,replied:3,renewed:2,after_message:1,before_message:1},{district:'B',due:20,messaged:20,not_messaged:0,replied:4,renewed:10,after_message:5,before_message:5}],reasons:[{district:'A',cohort:'2026-11',said_no:0,cost:0,lost_interest:0,aged_out:0,moved:0,unit_problem:0,other:0,no_reason:0}]};
snapshot.rows[2].messaged=4;snapshot.rows[2].replied=1;
snapshot.council={'2026-11':{due:30,messaged:28,replied:6},'2026-12':{due:4,messaged:4,replied:1}};
const data={version:1,source_name:'Synthetic source',snapshots:[snapshot]};
const {nodes,csv}=run(data);
const verifiedRun=run({...data,verification:{verified_at:new Date().toISOString(),data_through:'2026-10-30'}});
assert.equal(verifiedRun.nodes.outreachFreshness.hidden,true);
assert.match(verifiedRun.nodes.outreachStatus.textContent,/Movo checked/);
assert.match(verifiedRun.nodes.outreachStatus.textContent,/Data through Oct 30, 2026/);
assert.match(verifiedRun.nodes.outreachStatus.textContent,/Sheet updated/);
assert.match(run({...data,verification:{verified_at:new Date().toISOString(),data_through:null}}).nodes.outreachStatus.textContent,/Data through not supplied/);
const staleVerification=run({...data,verification:{verified_at:'2026-10-29T12:00:00Z',data_through:'2026-10-28'}});
assert.equal(staleVerification.nodes.outreachFreshness.hidden,false);
assert.match(staleVerification.nodes.outreachFreshness.textContent,/Daily Movo check is stale/);
assert.match(nodes.outreachKpis.innerHTML,/35\.3%/); // 12 / 34: includes source Not yet messaged, never silently switch denominator
assert.match(nodes.outreachKpis.innerHTML,/Members due in Movo extract/);
assert.match(nodes.outreachKpis.innerHTML,/Renewal rate \(Movo\)/);
assert.match(nodes.outreachScope.textContent,/Movo outreach extract/);
assert.match(nodes.outreachAges.innerHTML,/Unavailable/);
assert.equal(nodes.outreachFreshness.hidden,false);
nodes.outreachCohort.value='2026-12';nodes.outreachCohort.handlers.change();
assert.match(nodes.outreachKpis.innerHTML,/0\.0%/);
assert.equal(nodes.outreachCount.textContent,'1 district/cohort rows');
assert.doesNotMatch(nodes.outreachCoverageRows.innerHTML,/>B</);
assert.match(nodes.outreachCoverageTitle.textContent,/2026-12/);
assert.match(nodes.outreachCombinedScope.textContent,/Cohort and District apply/);
assert.match(nodes.outreachCoverage.innerHTML,/Messaged<\/span><strong>4/);
assert.match(nodes.outreachCoverage.innerHTML,/Replied<\/span><strong>1/);
assert.match(nodes.outreachCoverageRows.innerHTML,/Unavailable/); // timing is not split by cohort
assert.match(nodes.outreachCombinedScope.textContent,/timing is unavailable for a single cohort/);
assert.match(nodes.outreachReasonsStatus.textContent,/No decline-reason breakdown/);
nodes.outreachDistrict.value='A';nodes.outreachDistrict.handlers.change();
assert.doesNotMatch(nodes.outreachCoverageRows.innerHTML,/>B</);
nodes.outreachExport.handlers.click();
assert.match(csv(),/Population scope/);assert.match(csv(),/Movo outreach extract; not the full council renewal population/);assert.match(csv(),/Members due \(Movo extract\)/);assert.match(csv(),/2026-12/);assert.doesNotMatch(csv(),/2026-11/);assert.doesNotMatch(csv(),/"B"/);
nodes.outreachDistrict.value='';nodes.outreachDistrict.handlers.change();
nodes.outreachCohort.value='2026-11';nodes.outreachCohort.handlers.change();
assert.match(nodes.outreachCoverage.innerHTML,/Messaged<\/span><strong>28/);
assert.match(nodes.outreachCoverage.innerHTML,/Replied<\/span><strong>6/);
assert.match(nodes.outreachCoverage.innerHTML,/Not yet messaged<\/span><strong>2/);
assert.match(nodes.outreachCoverageRows.innerHTML,/Unavailable/); // missing district columns stay missing
nodes.outreachDistrict.value='A';nodes.outreachDistrict.handlers.change();
assert.match(nodes.outreachCoverage.innerHTML,/Messaged<\/span><strong>Unavailable/);
assert.doesNotMatch(nodes.outreachCoverage.innerHTML,/Messaged<\/span><strong>28/);
nodes.outreachCohort.value='2026-12';nodes.outreachCohort.handlers.change();
nodes.outreachDistrict.value='B';nodes.outreachDistrict.handlers.change();
assert.equal(nodes.outreachEmpty.hidden,false);
assert.match(nodes.outreachCoverageRows.innerHTML,/No Movo outreach rows match/);
assert.match(nodes.outreachKpis.innerHTML,/Unavailable/);
nodes.outreachReset.handlers.click();
assert.equal(nodes.outreachEmpty.hidden,true);
assert.match(nodes.outreachKpis.innerHTML,/35\.3%/);
assert.match(nodes.outreachHistoryNote.textContent,/No earlier daily comparison/);
assert.match(nodes.outreachCoverageTitle.textContent,/both cohorts/);
assert.match(nodes.outreachCoverageRows.innerHTML,/>B</);
assert.doesNotMatch(nodes.outreachCoverageRows.innerHTML,/Unavailable/); // restores original combined timing
assert.match(nodes.outreachCoverage.innerHTML,/Messaged<\/span><strong>32/);
const missing=run(null).nodes;
assert.equal(missing.outreachExport.disabled,true);
assert.match(missing.outreachStatus.textContent,/unavailable/);
const zero=run({...data,snapshots:[{...snapshot,rows:[row('Zero','2026-11',0,0)],outreach:[],reasons:[]}]}).nodes;
assert.match(zero.outreachKpis.innerHTML,/Renewal rate \(Movo\)<\/span><strong>Unavailable/);
const injection=run({...data,snapshots:[{...snapshot,rows:[row('<img onerror=bad>','2026-11',10,2)]}]}).nodes;
assert.doesNotMatch(injection.outreachRows.innerHTML,/<img/);
assert.match(injection.outreachRows.innerHTML,/&lt;img/);
console.log('Renewal Outreach: weighted rates, cohort/district scope, all-panel cohort filtering and unavailable source breakdowns, CSV, missing/zero/stale states and escaping passed.');

// Council-wide totals follow cohorts but never inherit a district denominator.
const councilCode = fs.readFileSync(path.join(__dirname,'../movo-council-due.js'),'utf8');
function councilRun(data, outreach) {
  const nodes = {movoCouncilDueTable:{hidden:true}};
  const node = () => ({
    value:'', hidden:true, textContent:'', children:[], handlers:{},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; }
  });
  const document = {
    getElementById(id) { return nodes[id] ||= node(); },
    createElement: node
  };
  vm.runInNewContext(councilCode, {window:{CAC_MOVO_COUNCIL_DUE:data, CAC_RENEWAL_OUTREACH:outreach},document,Intl,Date});
  return nodes;
}
const councilData = {
  report_date:'2026-11-09', observed_at:'2026-11-09T07:40:00-06:00',
  cohorts:[{month:'2026-11',due:294,renewed:65},{month:'2026-12',due:4441,renewed:12}],
  combined:{due:4735,renewed:77}
};
const outreach = {snapshots:[{council:{
  '2026-11':{due:293,renewed:65}, '2026-12':{due:52,renewed:12}
}}]};
const council = councilRun(councilData, outreach);
const displayed = nodes => nodes.movoCouncilDueRows.children.map(row => row.children.map(cell => cell.textContent));
assert.deepEqual(displayed(council), [
  ['November 2026','22.2% (65 of 293)','22.1% (65 of 294)'],
  ['December 2026','23.1% (12 of 52)','0.3% (12 of 4,441)'],
  ['Both months','22.3% (77 of 345)','1.6% (77 of 4,735)']
]);
assert.match(council.movoCouncilDueStatus.textContent, /Council-wide totals observed/);
council.outreachCohort.value='2026-12';
council.outreachCohort.handlers.change();
assert.deepEqual(displayed(council), [['December 2026','23.1% (12 of 52)','0.3% (12 of 4,441)']]);
assert.equal(council.outreachDistrict, undefined);
council.outreachCohort.value='';
council.outreachReset.handlers.click();
assert.equal(displayed(council).length, 3);
assert.equal(displayed(councilRun(null, outreach))[0][2], 'Unavailable');
assert.equal(displayed(councilRun(councilData, null))[0][1], 'Unavailable');
assert.equal(councilRun(null, null).movoCouncilDueTable.hidden, true);
console.log('Movo comparison: separate denominators, cohort, reset and missing data passed.');

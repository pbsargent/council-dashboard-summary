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
const data={version:1,source_name:'Synthetic source',snapshots:[snapshot]};
const {nodes,csv}=run(data);
assert.match(nodes.outreachKpis.innerHTML,/35\.3%/); // 12 / 34, never average district rates
assert.match(nodes.outreachAges.innerHTML,/Unavailable/);
assert.equal(nodes.outreachFreshness.hidden,false);
nodes.outreachCohort.value='2026-12';nodes.outreachCohort.handlers.change();
assert.match(nodes.outreachKpis.innerHTML,/0\.0%/);
assert.equal(nodes.outreachCount.textContent,'1 district/cohort rows');
assert.match(nodes.outreachCoverageRows.innerHTML,/>B</); // clearly fixed to both cohorts
assert.match(nodes.outreachCombinedScope.textContent,/follows District only/);
assert.match(nodes.outreachReasonsStatus.textContent,/No decline-reason breakdown/);
nodes.outreachDistrict.value='A';nodes.outreachDistrict.handlers.change();
assert.doesNotMatch(nodes.outreachCoverageRows.innerHTML,/>B</);
nodes.outreachExport.handlers.click();
assert.match(csv(),/2026-12/);assert.doesNotMatch(csv(),/2026-11/);assert.doesNotMatch(csv(),/"B"/);
nodes.outreachDistrict.value='B';nodes.outreachDistrict.handlers.change();
assert.equal(nodes.outreachEmpty.hidden,false);
assert.match(nodes.outreachKpis.innerHTML,/Unavailable/);
nodes.outreachReset.handlers.click();
assert.equal(nodes.outreachEmpty.hidden,true);
assert.match(nodes.outreachKpis.innerHTML,/35\.3%/);
assert.match(nodes.outreachHistoryNote.textContent,/No earlier daily comparison/);
const missing=run(null).nodes;
assert.equal(missing.outreachExport.disabled,true);
assert.match(missing.outreachStatus.textContent,/unavailable/);
const zero=run({...data,snapshots:[{...snapshot,rows:[row('Zero','2026-11',0,0)],outreach:[],reasons:[]}]}).nodes;
assert.match(zero.outreachKpis.innerHTML,/Renewal rate<\/span><strong>Unavailable/);
const injection=run({...data,snapshots:[{...snapshot,rows:[row('<img onerror=bad>','2026-11',10,2)]}]}).nodes;
assert.doesNotMatch(injection.outreachRows.innerHTML,/<img/);
assert.match(injection.outreachRows.innerHTML,/&lt;img/);
console.log('Renewal Outreach: weighted rates, cohort/district scope, fixed outreach scope, CSV, missing/zero/stale states and escaping passed.');

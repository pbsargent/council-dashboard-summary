const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const nodes = {};
for (const id of ['joinStatus','joinSource','joinDistrict','joinSearch','joinCoverage','joinKpis','joinCount','joinEmpty','joinDistrictChart','joinAgeChart','joinHead','joinRows','joinReset','joinExport']) {
  nodes[id] = {value:'',innerHTML:'',textContent:'',hidden:false,handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}};
}
let blob, download;
const units = [
  {rank:1,unit:'Pack 0001',district:'North Shore 11',joins:3,unit_id:null,organization:null,ages:[3,0,0,0,0,0,0,0,0],review:'Review'},
  {rank:2,unit:'Pack 0002',district:'Bee Cave 01',joins:2,unit_id:'2',organization:'Example',ages:[2,0,0,0,0,0,0,0,0],review:''},
  {rank:3,unit:'Pack 0003',district:'Bee Cave 01',joins:0,unit_id:'3',organization:'Example',ages:[0,0,0,0,0,0,0,0,0],review:''},
];
const data={report_date:'2026-10-26',source_name:'source.xlsx',units,age_labels:['Age 4','Age 5','Age 6','Age 7','Age 8','Age 9','Age 10','Age 11','Age unavailable']};
const context = {Intl,Date,setTimeout:fn=>fn(),Blob:class{constructor(parts){blob=parts.join('');}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},window:{CAC_JOINS:{cubs:data}},document:{body:{dataset:{page:'cubs'}},getElementById:id=>nodes[id],createElement:()=>({click(){download=this.download;}})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../joins.js'),'utf8'),context);
assert.equal(nodes.joinCount.textContent,'3 units · 5 joins');
nodes.joinDistrict.value='North Shore 11'; nodes.joinDistrict.handlers.input();
assert.equal(nodes.joinCount.textContent,'1 units · 3 joins');
assert.match(nodes.joinRows.innerHTML,/Unavailable/);
nodes.joinExport.handlers.click(); assert.match(blob,/Pack 0001/); assert.doesNotMatch(blob,/Pack 0002/); assert.equal(download,'cubs-joins-2026-10-26.csv');
nodes.joinReset.handlers.click(); assert.equal(nodes.joinCount.textContent,'3 units · 5 joins');
nodes.joinCoverage.value='zero'; nodes.joinCoverage.handlers.input(); assert.equal(nodes.joinCount.textContent,'1 units · 0 joins');
assert.match(nodes.joinRows.innerHTML,/Pack 0003/); assert.doesNotMatch(nodes.joinRows.innerHTML,/Pack 0001/);
nodes.joinSearch.value='no match'; nodes.joinSearch.handlers.input(); assert.equal(nodes.joinEmpty.hidden,false);
nodes.joinReset.handlers.click(); assert.equal(nodes.joinEmpty.hidden,true);
nodes.joinCoverage.value='review'; nodes.joinCoverage.handlers.input(); assert.equal(nodes.joinCount.textContent,'1 units · 3 joins');
console.log('Joins page filter, reset, missing-detail, empty-state and CSV scope regressions passed.');

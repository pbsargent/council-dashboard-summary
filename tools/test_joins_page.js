const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
function verifyProgram(program) {
const page = fs.readFileSync(path.join(__dirname,`../${program}-joins.html`),'utf8');
for (const definition of ['distinct people per unit','additional positions in the same unit do not add a person','does not prove first-ever national membership','Age charts describe youth only']) {
  assert.ok(page.includes(definition),`${program}: missing definition ${definition}`);
}
const nodes = {};
for (const id of ['joinStatus','joinSource','joinArea','joinDistrict','joinSearch','joinCoverage','joinKpis','joinCount','joinEmpty','joinDistrictChart','joinAgeChart','joinRows','joinReset','joinExport','joinExpandAll','joinCollapseAll']) {
  nodes[id] = {value:'',innerHTML:'',textContent:'',hidden:false,handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}};
}
let groups = [];
Object.defineProperty(nodes.joinRows, 'innerHTML', {
  get(){ return this.html || ''; },
  set(html){ this.html=html; groups=[...html.matchAll(/<details[^>]+data-join-group="([^"]+)"([^>]*)>/g)].map(match => ({dataset:{joinGroup:match[1].replace(/&quot;/g,'"')},open:match[2].includes(' open'),addEventListener(event,fn){this[event]=fn;}})); }
});
nodes.joinRows.querySelectorAll=()=>groups;
let blob, download;
const units = [
  {rank:1,unit:'Pack 0001',district:'North Shore 11',joins:3,unit_id:null,organization:null,ages:[3,0,0,0,0,0,0,0,0],review:'Review'},
  {rank:2,unit:'Pack 0002',district:'Live Oak 09',joins:2,unit_id:'2',organization:'Example',ages:[2,0,0,0,0,0,0,0,0],review:''},
  {rank:3,unit:'Pack 0003',district:'Live Oak 09',joins:0,unit_id:'3',organization:'Example',ages:[0,0,0,0,0,0,0,0,0],review:''},
];
units.forEach((u,i) => { u.adults_new_to_unit=[2,3,0][i]; u.adults_new_to_scouting_reported=[1,2,0][i]; });
const data={report_date:'2026-10-26',source_name:'source.xlsx',units,district_service_areas:{'North Shore 11':'Northern Service Area','Live Oak 09':'Southern Service Area'},age_labels:['Age 4','Age 5','Age 6','Age 7','Age 8','Age 9','Age 10','Age 11','Age unavailable']};
const context = {Intl,Date,setTimeout:fn=>fn(),Blob:class{constructor(parts){blob=parts.join('');}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},window:{CAC_JOINS:{[program]:data}},document:{body:{dataset:{page:program}},getElementById:id=>nodes[id],createElement:()=>({click(){download=this.download;}})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../joins.js'),'utf8'),context);
assert.equal(nodes.joinCount.textContent,'3 units · 5 joins');
assert.doesNotMatch(nodes.joinRows.innerHTML, /<th scope="col">Council rank/);
assert.match(nodes.joinKpis.innerHTML, /New adults to unit<\/span><strong>5/);
assert.match(nodes.joinKpis.innerHTML, /Adults new to Scouting \(reported\)<\/span><strong>3/);
assert.equal(groups.length,4); assert.ok(groups.every(g=>!g.open));
assert.match(nodes.joinRows.innerHTML,/Southern Service Area<\/span><span class="join-group-totals">2 units · <strong>2 youth joins/);
assert.match(nodes.joinRows.innerHTML,/Live Oak 09<\/span><span class="join-group-totals">2 units · <strong>2 youth joins/);
nodes.joinExpandAll.handlers.click(); assert.ok(groups.every(g=>g.open));
nodes.joinCollapseAll.handlers.click(); assert.ok(groups.every(g=>!g.open));
nodes.joinDistrict.value='North Shore 11'; nodes.joinDistrict.handlers.input();
assert.equal(nodes.joinCount.textContent,'1 units · 3 joins');
assert.ok(groups.every(g=>g.open));
assert.match(nodes.joinRows.innerHTML,/Northern Service Area<\/span><span class="join-group-totals">1 unit · <strong>3 youth joins/);
assert.match(nodes.joinRows.innerHTML,/Unavailable/);
nodes.joinExport.handlers.click(); assert.match(blob,/Pack 0001/); assert.doesNotMatch(blob,/Pack 0002/); assert.equal(download,`${program}-joins-2026-10-26.csv`);
nodes.joinReset.handlers.click(); assert.equal(nodes.joinCount.textContent,'3 units · 5 joins');
nodes.joinCoverage.value='zero'; nodes.joinCoverage.handlers.input(); assert.equal(nodes.joinCount.textContent,'1 units · 0 joins');
assert.match(nodes.joinRows.innerHTML,/Pack 0003/); assert.doesNotMatch(nodes.joinRows.innerHTML,/Pack 0001/);
nodes.joinSearch.value='no match'; nodes.joinSearch.handlers.input(); assert.equal(nodes.joinEmpty.hidden,false);
nodes.joinReset.handlers.click(); assert.equal(nodes.joinEmpty.hidden,true);
nodes.joinCoverage.value='review'; nodes.joinCoverage.handlers.input(); assert.equal(nodes.joinCount.textContent,'1 units · 3 joins');
nodes.joinReset.handlers.click();
nodes.joinDistrict.value='North Shore 11'; nodes.joinDistrict.handlers.input();
nodes.joinArea.value='Southern Service Area'; nodes.joinArea.handlers.input();
assert.equal(nodes.joinDistrict.value,'');
assert.match(nodes.joinDistrict.innerHTML,/Live Oak 09/);
assert.doesNotMatch(nodes.joinDistrict.innerHTML,/North Shore/);
assert.equal(nodes.joinCount.textContent,'2 units · 2 joins');
assert.doesNotMatch(nodes.joinRows.innerHTML,/Pack 0001/);
assert.match(nodes.joinKpis.innerHTML,/New adults to unit<\/span><strong>3/);
assert.doesNotMatch(nodes.joinDistrictChart.innerHTML,/North Shore/);
assert.match(nodes.joinAgeChart.innerHTML,/<strong>2<\/strong>/);
nodes.joinExport.handlers.click(); assert.doesNotMatch(blob,/Pack 0001/); assert.match(blob,/Pack 0002/);
nodes.joinArea.value='Northern Service Area'; nodes.joinArea.handlers.input();
assert.equal(nodes.joinCount.textContent,'1 units · 3 joins');
nodes.joinDistrict.value='North Shore 11'; nodes.joinDistrict.handlers.input();
nodes.joinArea.value=''; nodes.joinArea.handlers.input();
assert.equal(nodes.joinDistrict.value,'North Shore 11');
assert.match(nodes.joinDistrict.innerHTML,/Live Oak 09/);
assert.equal(nodes.joinCount.textContent,'1 units · 3 joins');
nodes.joinReset.handlers.click();
assert.equal(nodes.joinArea.value,''); assert.equal(nodes.joinDistrict.value,'');
assert.equal(nodes.joinCount.textContent,'3 units · 5 joins');
assert.doesNotMatch(nodes.joinRows.innerHTML, /<th scope="col">(?:District|Unit ID|Council rank)</);
assert.match(nodes.joinStatus.textContent,/September 1, 2026/);
units[0].adults_new_to_unit=null; nodes.joinReset.handlers.click();
assert.match(nodes.joinKpis.innerHTML,/New adults to unit<\/span><strong>Unavailable/);
assert.match(nodes.joinRows.innerHTML,/Unavailable/);
}
verifyProgram('cubs');
verifyProgram('scouts-bsa');
console.log('Both joins pages: cascading filters, adult totals, hierarchy, missing-data states, table columns and CSV scope passed.');

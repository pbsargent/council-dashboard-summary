const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'help.js'), 'utf8');
(async () => {
  const nodes = Object.fromEntries(['helpFreshness','titleDataDate','guideFreshness'].map(id => [id, {textContent:''}]));
  const context = {Intl,Date,document:{getElementById:id=>nodes[id]},fetch:async url=>({ok:true,json:async()=>url.includes('monday')?{generated_at:'2026-10-21T14:00:00-05:00'}:{dashboard:{report_date:'2026-10-21',source_mtime:'2026-10-20T23:00:00-05:00'}}})};
  vm.runInNewContext(source, context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.titleDataDate.textContent,'Data refreshed October 21, 2026');
  assert.equal(nodes.guideFreshness.textContent,'Dashboard data refreshed October 21, 2026');
  console.log('Help report-date and timezone regression passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Offline aggregate-only fixture: missing file fields must never render as zeros.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function el() {
  return {children: [], textContent: '', value: '', hidden: true, handlers: {},
    append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; },
    setAttribute() {}, addEventListener(n, f) { this.handlers[n] = f; },
    createTHead() { const e = el(); this.children.push(e); return e; },
    createTBody() { const e = el(); this.children.push(e); return e; },
    insertRow() { const e = el(); this.children.push(e); return e; }};
}
const nodes = {};
const source = {source_kind: 'movo_file', observed_end: '2026-11-23T06:02:00-06:00', posted_at: '2026-11-23T06:05:00-06:00',
  not_stated: ['All By program view', 'Joining all-councils comparisons'], not_checkable: ['Nov 30 trend endpoint (no Daily history row for the capture date)'],
  cohorts: ['Nov 30', 'Dec 31', 'All'].map(label => ({label, audience: [10, 2], council: [20, 3],
    history: label === 'All' ? [] : [['2026-11-22', null]],
    districts: [['Example', 10, 2]], programs: label === 'All' ? [] : [['Example', 10, 2, null, null, null, null]]})),
  approximate_status: [['Nov 30', null, null, null], ['Dec 31', null, null, null]],
  pin: [50, 40, 30], joining: [['National', 10, .5, null, .6, null], ['Council', 2, .5, null, .6, null]]};
const context = {window: {MOVO_PERFORMANCE: source}, document: {getElementById: id => nodes[id] ||= el(), createElement: el},
  Intl, Date, Option: function(label, value) { return {label, value}; }};
context.document.getElementById('performance-cohort').value = 'All';
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../movo-performance.js'), 'utf8'), context);
const text = e => typeof e === 'string' ? e : (e.textContent || '') + (e.children || []).map(text).join(' ');
assert.match(nodes['performance-status'].textContent, /Movo file data as of.*posted/);
assert.match(nodes['performance-status'].textContent, /Not checkable/);
assert.match(text(nodes['performance-programs']), /Not stated/);
assert.match(text(nodes['performance-joining']), /not stated/);
assert.doesNotMatch(text(nodes['performance-joining']), /\(0\.0%\)/);
nodes['performance-cohort'].value = 'Nov 30'; nodes['performance-cohort'].handlers.change();
assert.match(text(nodes['performance-programs']), /Not stated/);
assert.match(text(nodes['performance-trend']), /Not stated.*Not checkable/);
assert.equal(nodes.performance.hidden, false);
console.log('Movo file missing-value rendering, distinct clocks, cohort switch and history disclosure passed.');

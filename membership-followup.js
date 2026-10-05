(() => {
  let payload;
  let unitIds = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = value => new Intl.NumberFormat('en-US').format(value);
  const link = row => unitIds.has(row.unit_id) ? `<a href="unit-level.html?unit=${encodeURIComponent(row.unit_id)}">${esc(row.unit)}</a>` : `${esc(row.unit)}<br><small>Not in Unit-Level source</small>`;
  const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}">No units match these filters.</td></tr>`}</tbody></table></div>`;
  function filterRows(units) {
    const area = document.getElementById('followupArea').value;
    const district = document.getElementById('followupDistrict').value;
    const search = document.getElementById('followupSearch').value.trim().toLowerCase();
    return units.filter(row => (window.ProgramFilter?.matchesUnitType(row.unit_type) ?? true)
      && (!area || row.service_area === area) && (!district || row.district === district)
      && `${row.unit} ${row.district}`.toLowerCase().includes(search));
  }
  function render() {
    const data = payload.dashboard.membership_operations;
    const units = filterRows(data.units);
    const readyById = new Map(data.readiness.map(row => [row.unit_id, row]));
    const key3 = units.filter(row => row.missing_key3);
    const zero = units.filter(row => row.youth === 0);
    const ready = units.filter(row => readyById.has(row.unit_id));
    const cards = [['Tracked units', units.length], ['Missing Key 3', key3.length], ['Zero total youth', zero.length], ['In Renewal Prep', ready.length]];
    document.getElementById('followupKpis').innerHTML = cards.map(([label, value]) => `<article class="kpi"><span>${label}</span><strong>${n(value)}</strong></article>`).join('');
    const basic = rows => rows.sort((a,b) => a.district.localeCompare(b.district) || a.unit.localeCompare(b.unit, undefined, {numeric:true})).map(row => `<tr><td>${esc(row.service_area)}</td><td>${esc(row.district)}</td><td>${link(row)}</td><td>${n(row.youth)}</td><td>${n(row.adults)}</td><td>${esc(row.renewal_date || 'Not recorded')}</td></tr>`);
    document.getElementById('missingKey3Rows').innerHTML = table(['Service Area','District','Unit','Total Youth','Total Adults','Unit renewal date'], basic(key3));
    document.getElementById('zeroYouthRows').innerHTML = table(['Service Area','District','Unit','Total Youth','Total Adults','Unit renewal date'], basic(zero));
    document.getElementById('readinessRows').innerHTML = table(['District','Unit','Unit renewal date','Source status','Issues to resolve','Workbook issue detail'], ready.sort((a,b) => readyById.get(b.unit_id).issue_count-readyById.get(a.unit_id).issue_count).map(row => {
      const r = readyById.get(row.unit_id);
      const issues = r.roles.flatMap(role => [role.missing_holder ? `${role.role}: missing holder` : '', role.registration_issue ? `${role.role}: registration issue` : '', role.syt_issue ? `${role.role}: SYT issue` : ''].filter(Boolean));
      if (r.youth_issue) issues.unshift('Youth requirement issue');
      const detail = `<details><summary>${issues.length ? 'Review issues' : 'No flagged issues'}</summary><p>${esc(issues.join('; ') || 'No issues flagged in the workbook. This is not an independent renewal approval.')}</p><p class="subtle">${r.roles.map(role => `${esc(role.role)}: ${role.missing_holder || role.registration_issue || role.syt_issue ? 'Review' : 'No source issue flagged'}`).join('<br>')}</p></details>`;
      return `<tr><td>${esc(row.district)}</td><td>${link(row)}</td><td>${esc(row.renewal_date || 'Not recorded')}</td><td>${esc(row.renewal_status || 'Not recorded')}</td><td>${n(r.issue_count)}</td><td>${detail}</td></tr>`;
    }));
    const cohorts = new Map();
    units.forEach(row => {const month = row.renewal_date?.slice(0,7) || 'Not recorded';cohorts.set(month, (cohorts.get(month)||0)+1);});
    document.getElementById('renewalCalendarRows').innerHTML = table(['Unit renewal month','Units'], [...cohorts].sort(([a],[b]) => a.localeCompare(b)).map(([month,count]) => `<tr><td>${esc(month)}</td><td>${n(count)}</td></tr>`));
    document.getElementById('cohortTotal').textContent = `All cohorts: ${n(units.length)} units`;
  }
  async function init() {
    const response = await fetch('data/latest.json', {cache:'no-store'});
    if (!response.ok) throw new Error('Source snapshot could not be loaded');
    payload = await response.json();
    const unitResponse = await fetch("data/unit-level-latest.json", {cache:"no-store"});
    if (!unitResponse.ok) throw new Error("Unit-Level source could not be loaded");
    const unitPayload = await unitResponse.json();
    if (unitPayload.data_date !== payload.dashboard.report_date) throw new Error("Source report dates differ");
    unitIds = new Set(unitPayload.units.map(row => String(row.unit_id)));
    if (!payload.dashboard?.membership_operations?.units?.length) throw new Error('Membership follow-up data is missing; refresh through the current workbook builder');
    document.getElementById('titleDataDate').textContent = payload.dashboard.report_date;
    document.getElementById('generatedDate').textContent = `Data: ${payload.dashboard.report_date}`;
    document.getElementById('readinessScope').textContent = payload.dashboard.membership_operations.readiness_scope;
    for (const [id,field] of [['followupArea','service_area'],['followupDistrict','district']]) {
      const select = document.getElementById(id);
      select.innerHTML = `<option value="">All ${field === 'district' ? 'districts' : 'Service Areas'}</option>` + [...new Set(payload.dashboard.membership_operations.units.map(row => row[field]).filter(Boolean))].sort().map(v => `<option>${esc(v)}</option>`).join('');
    }
    ['followupArea','followupDistrict','followupSearch'].forEach(id => document.getElementById(id).addEventListener('input',render));
    window.addEventListener('programfilterchange',render);
    render();
  }
  if (typeof module !== 'undefined') module.exports = {filterRows};
  if (typeof document !== 'undefined') init().catch(error => {document.getElementById('followupKpis').textContent = error.message;});
})();

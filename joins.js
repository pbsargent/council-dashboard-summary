(() => {
  'use strict';
  const program = document.body.dataset.page;
  const data = window.CAC_JOINS?.[program];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if (!data) { $('joinStatus').textContent = 'Joins data is unavailable. Please try again later.'; return; }
  const date = new Intl.DateTimeFormat('en-US', {dateStyle:'long', timeZone:'UTC'}).format(new Date(data.report_date + 'T12:00:00Z'));
  $('joinStatus').textContent = `September 1, 2026 – ${date}`;
  $('joinSource').textContent = data.source_name;
  const districts = [...new Set(data.units.map(u => u.district))].sort();
  const serviceAreas = [...new Set(districts.map(d => data.district_service_areas[d]))].sort();
  $('joinArea').innerHTML = '<option value="">All service areas</option>' + serviceAreas.map(area => `<option>${esc(area)}</option>`).join('');
  function updateDistrictOptions() {
    const current = $('joinDistrict').value;
    const available = districts.filter(d => !$('joinArea').value || data.district_service_areas[d] === $('joinArea').value);
    $('joinDistrict').innerHTML = '<option value="">All districts</option>' + available.map(d => `<option>${esc(d)}</option>`).join('');
    $('joinDistrict').value = available.includes(current) ? current : '';
  }
  updateDistrictOptions();
  let filtered = [];
  const openGroups = new Map();
  function unitTable(units) {
    const headings = ['Council rank','Unit','District','New joins','Unit ID','Chartered organization', ...data.age_labels,'Review status'];
    const rows = units.map(u => '<tr>' + [u.rank,u.unit,u.district,u.joins,u.unit_id ?? 'Unavailable',u.organization ?? 'Unavailable',...u.ages,u.review || '—'].map(v => `<td>${esc(v)}</td>`).join('') + '</tr>').join('');
    return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(units[0].district)} unit joins"><table><thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function groupSummary(label, units) {
    const total = units.reduce((sum, u) => sum + u.joins, 0);
    return `<span>${esc(label)}</span><span class="join-group-totals">${units.length} ${units.length === 1 ? 'unit' : 'units'} · <strong>${total.toLocaleString()} joins</strong></span>`;
  }
  function renderGroups() {
    const revealMatches = !!($('joinArea').value || $('joinDistrict').value || $('joinSearch').value.trim() || $('joinCoverage').value);
    const areas = [...new Set(filtered.map(u => data.district_service_areas[u.district]))].sort();
    const isOpen = key => revealMatches || openGroups.get(key);
    $('joinRows').innerHTML = areas.map(area => {
      const areaUnits = filtered.filter(u => data.district_service_areas[u.district] === area);
      const areaKey = JSON.stringify([area]);
      const districtGroups = [...new Set(areaUnits.map(u => u.district))].sort().map(district => {
        const units = areaUnits.filter(u => u.district === district);
        const key = JSON.stringify([area,district]);
        return `<details class="join-district" data-join-group="${esc(key)}"${isOpen(key) ? ' open' : ''}><summary>${groupSummary(district, units)}</summary>${unitTable(units)}</details>`;
      }).join('');
      return `<details class="join-service-area" data-join-group="${esc(areaKey)}"${isOpen(areaKey) ? ' open' : ''}><summary>${groupSummary(area, areaUnits)}</summary><div class="join-districts">${districtGroups}</div></details>`;
    }).join('');
    $('joinRows').querySelectorAll('details').forEach(group => group.addEventListener('toggle', () => openGroups.set(group.dataset.joinGroup, group.open)));
  }
  function bars(id, entries) {
    const max = Math.max(1, ...entries.map(e => e[1]));
    $(id).innerHTML = entries.map(([label, value]) => `<div class="join-bar"><span>${esc(label)}</span><div class="join-track"><span style="width:${value / max * 100}%"></span></div><strong>${value.toLocaleString()}</strong></div>`).join('');
  }
  function render() {
    const search = $('joinSearch').value.toLowerCase().trim();
    filtered = data.units.filter(u => (!$('joinArea').value || data.district_service_areas[u.district] === $('joinArea').value) &&
      (!$('joinDistrict').value || u.district === $('joinDistrict').value) &&
      (!search || [u.unit, u.district, u.unit_id, u.organization].some(v => String(v ?? '').toLowerCase().includes(search))) &&
      (!$('joinCoverage').value || ($('joinCoverage').value === 'review' ? !!u.review : u.joins === 0)));
    const total = filtered.reduce((s,u) => s + u.joins, 0);
    const stats = [[total, 'New youth joins'], [filtered.length, program === 'cubs' ? 'Packs reported' : 'Troops reported'], [filtered.filter(u => !u.joins).length, 'Units with zero joins'], [filtered.filter(u => u.review).length, 'Units needing coverage review']];
    $('joinKpis').innerHTML = stats.map(([v,label]) => `<article class="kpi"><span>${label}</span><strong>${v.toLocaleString()}</strong></article>`).join('');
    $('joinCount').textContent = `${filtered.length} units · ${total.toLocaleString()} joins`;
    $('joinEmpty').hidden = filtered.length > 0;
    bars('joinDistrictChart', districts.filter(d => filtered.some(u => u.district === d)).map(d => [d, filtered.filter(u => u.district === d).reduce((s,u) => s+u.joins,0)]).sort((a,b) => b[1]-a[1]));
    bars('joinAgeChart', data.age_labels.map((label,i) => [label, filtered.reduce((s,u) => s+u.ages[i],0)]));
    renderGroups();
  }
  ['joinDistrict','joinCoverage','joinSearch'].forEach(id => $(id).addEventListener('input',render));
  $('joinArea').addEventListener('input', () => { updateDistrictOptions(); render(); });
  $('joinReset').addEventListener('click',() => { ['joinArea','joinDistrict','joinCoverage','joinSearch'].forEach(id => $(id).value = ''); updateDistrictOptions(); render(); });
  for (const [id, open] of [['joinExpandAll', true], ['joinCollapseAll', false]]) {
    $(id).addEventListener('click', () => $('joinRows').querySelectorAll('details').forEach(group => {
      openGroups.set(group.dataset.joinGroup, open);
      group.open = open;
    }));
  }
  $('joinExport').addEventListener('click',() => {
    const rows = [['Council rank','Unit','District','New joins','Unit ID','Chartered organization',...data.age_labels,'Review status'], ...filtered.map(u => [u.rank,u.unit,u.district,u.joins,u.unit_id,u.organization,...u.ages,u.review])];
    const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/^[=+@-]/,'\'$&').replace(/"/g,'""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download=`${program}-joins-${data.report_date}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  render();
})();

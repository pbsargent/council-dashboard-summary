(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.CAC_RENEWAL_OUTREACH;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-US').format(value);
  const rate = (n, d) => d > 0 && n != null ? `${(100 * n / d).toFixed(1)}%` : 'Unavailable';
  const dateOnly = value => new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
  const stamp = value => new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'}).format(new Date(value));
  const centralDay = value => new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Chicago'}).format(new Date(value));
  const sum = (rows, key) => rows.length && rows.every(r => Number.isInteger(r[key])) ? rows.reduce((n,r) => n+r[key],0) : null;
  const metric = (label, value) => `<div><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
  if (!data || data.version !== 1 || !Array.isArray(data.snapshots) || !data.snapshots.length) {
    $('outreachStatus').textContent = 'Movo data is unavailable. The expected daily source could not be loaded.';
    $('outreachFreshness').hidden = false;
    $('outreachFreshness').textContent = 'No validated Movo snapshot is available. Counts are unavailable, not zero.';
    for (const id of ['outreachCohort','outreachDistrict','outreachReset','outreachExport']) $(id).disabled = true;
    return;
  }
  const snapshot = data.snapshots[data.snapshots.length - 1];
  const cohorts = [...new Set(snapshot.rows.map(r => r.cohort))].sort();
  const districts = [...new Set(snapshot.rows.map(r => r.district))].sort();
  $('outreachCohort').innerHTML = '<option value="">Both cohorts</option>' + cohorts.map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
  $('outreachDistrict').innerHTML = '<option value="">All districts</option>' + districts.map(d => `<option value="${escape(d)}">${escape(d)}</option>`).join('');
  $('outreachStatus').textContent = `Source updated ${stamp(snapshot.source_updated_at)}`;
  $('outreachSource').textContent = data.source_name;
  const stale = centralDay(snapshot.source_updated_at) !== centralDay(new Date());
  $('outreachFreshness').hidden = !stale;
  $('outreachFreshness').textContent = `Daily Movo source is stale. Last source update: ${stamp(snapshot.source_updated_at)}. These are the last validated counts.`;
  function selected(s = snapshot) {
    return s.rows.filter(r => (!$('outreachCohort').value || r.cohort === $('outreachCohort').value) && (!$('outreachDistrict').value || r.district === $('outreachDistrict').value));
  }
  function bar(label, n, denominator, text) {
    const width = denominator > 0 && n != null ? Math.max(0,Math.min(100,100*n/denominator)) : 0;
    return `<div class="outreach-bar"><span>${escape(label)}</span><div class="outreach-track" aria-hidden="true"><span style="width:${width}%"></span></div><strong>${escape(text)}</strong></div>`;
  }
  function render() {
    const rows = selected(), due = sum(rows,'due'), renewed = sum(rows,'renewed');
    const cohortLabel = $('outreachCohort').value || cohorts.join(' + ');
    const districtLabel = $('outreachDistrict').value || 'All districts';
    $('outreachScope').textContent = `${districtLabel} · ${cohortLabel} · due ${[...new Set(rows.map(r => r.due_date))].sort().map(dateOnly).join(' / ') || 'date unavailable'}`;
    $('outreachEmpty').hidden = rows.length > 0;
    $('outreachKpis').innerHTML = [['Members due',number(due)],['Renewed',number(renewed)],['Renewal rate',rate(renewed,due)],['Outstanding',number(due == null ? null : due-renewed)]].map(([label,value])=>`<article class="kpi">${metric(label,value)}</article>`).join('');
    const grouped = [...new Set(rows.map(r=>r.district))].map(district=>{
      const matches=rows.filter(r=>r.district===district);
      return {district,due:sum(matches,'due'),renewed:sum(matches,'renewed')};
    }).sort((a,b)=>(b.due-b.renewed)-(a.due-a.renewed)||a.district.localeCompare(b.district));
    $('outreachChart').innerHTML = grouped.map(r=>bar(r.district,r.renewed,r.due,`${number(r.renewed)} / ${number(r.due)} · ${rate(r.renewed,r.due)}`)).join('') || '<p>No reported cohort members.</p>';
    $('outreachAges').innerHTML = ['adults','youth'].map(key=>{
      const n=sum(rows,`${key}_renewed`), d=sum(rows,`${key}_due`);
      return `<p><strong>${key==='adults'?'Adults':'Youth'}:</strong> ${number(n)} renewed / ${number(d)} due · ${rate(n,d)}</p>`;
    }).join('');
    $('outreachFollowup').innerHTML = ['undecided','not_reached','said_no'].map(key=>metric(({undecided:'Undecided',not_reached:'Not reached',said_no:'Said no'})[key],number(sum(rows,key)))).join('');
    $('outreachRows').innerHTML = [...rows].sort((a,b)=>(b.due-b.renewed)-(a.due-a.renewed)||a.district.localeCompare(b.district)||a.cohort.localeCompare(b.cohort)).map(r=>`<tr><th scope="row">${escape(r.district)}</th><td>${escape(dateOnly(r.due_date))}</td><td>${number(r.due)}</td><td>${number(r.renewed)}</td><td>${rate(r.renewed,r.due)}</td><td>${number(r.due-r.renewed)}</td><td>${number(r.undecided)}</td><td>${number(r.not_reached)}</td><td>${number(r.said_no)}</td></tr>`).join('');
    $('outreachCount').textContent = `${rows.length} district/cohort rows`;
    const outreach=snapshot.outreach.filter(r=>!$('outreachDistrict').value||r.district===$('outreachDistrict').value);
    $('outreachCombinedScope').textContent = `${districtLabel} · ${cohorts.join(' + ')} combined. This section follows District only; cohort-specific message timing is not supplied.`;
    $('outreachCoverage').innerHTML = [['Messaged',number(sum(outreach,'messaged'))],['Not yet messaged',number(sum(outreach,'not_messaged'))],['Replied',number(sum(outreach,'replied'))],['Reply rate',rate(sum(outreach,'replied'),sum(outreach,'messaged'))]].map(([l,v])=>metric(l,v)).join('');
    $('outreachCoverageRows').innerHTML=outreach.map(r=>`<tr><th scope="row">${escape(r.district)}</th>${['due','messaged','not_messaged','replied'].map(k=>`<td>${number(r[k])}</td>`).join('')}<td>${rate(r.replied,r.messaged)}</td><td>${number(r.after_message)}</td><td>${number(r.before_message)}</td></tr>`).join('');
    const reasons=snapshot.reasons.filter(r=>(!$('outreachCohort').value||r.cohort===$('outreachCohort').value)&&(!$('outreachDistrict').value||r.district===$('outreachDistrict').value));
    const reasonCohorts=[...new Set(reasons.map(r=>r.cohort))];
    $('outreachReasonsStatus').textContent = reasonCohorts.length ? `Reported reason coverage: ${reasonCohorts.join(' + ')}. Other cohorts have no supplied breakdown.` : 'No decline-reason breakdown is supplied for this selection.';
    const reasonsDue=sum(reasons,'said_no');
    $('outreachReasons').innerHTML = reasons.length ? Object.entries({cost:'Cost',lost_interest:'Lost interest',aged_out:'Aged out (reported)',moved:'Moved (reported)',unit_problem:'Unit problem',other:'Other',no_reason:'No reason given'}).map(([key,label])=>bar(label,sum(reasons,key),reasonsDue,number(sum(reasons,key)))).join('') : '';
    $('outreachHistoryNote').textContent = data.snapshots.length===1 ? 'History begins with this validated source snapshot. No earlier daily comparison is available.' : 'Latest validated update per source day, up to 90 days. Cohort populations may change between updates; gaps are not interpolated.';
    $('outreachHistory').innerHTML = [...data.snapshots].reverse().map(s=>{
      const rs=selected(s), d=sum(rs,'due'), n=sum(rs,'renewed');
      return `<tr><th scope="row">${escape(stamp(s.source_updated_at))}</th><td>${number(d)}</td><td>${number(n)}</td><td>${rate(n,d)}</td></tr>`;
    }).join('');
  }
  $('outreachCohort').addEventListener('change',render);
  $('outreachDistrict').addEventListener('change',render);
  $('outreachReset').addEventListener('click',()=>{$('outreachCohort').value='';$('outreachDistrict').value='';render();});
  $('outreachExport').addEventListener('click',()=>{
    const quote=v=>{
      const text=String(v??'');
      const safe=typeof v==='string' && /^[=+\-@\t\r]/.test(text) ? "'"+text : text;
      return '"'+safe.replace(/"/g,'""')+'"';
    };
    const header=['Source updated','District','Cohort','Due date','Members due','Adults due','Youth due','Renewed','Renewal rate (%)','Outstanding','Undecided','Not reached','Said no'];
    const rows=selected().map(r=>[snapshot.source_updated_at,r.district,r.cohort,r.due_date,r.due,r.adults_due,r.youth_due,r.renewed,r.due>0?100*r.renewed/r.due:null,r.due-r.renewed,r.undecided,r.not_reached,r.said_no]);
    const blob=new Blob([[header,...rows].map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download='renewal-outreach.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  render();
})();

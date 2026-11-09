(() => {
  'use strict';
  const data = window.CAC_MOVO_COUNCIL_DUE;
  const message = document.getElementById('movoCouncilDueStatus');
  const table = document.getElementById('movoCouncilDueTable');
  const tbody = document.getElementById('movoCouncilDueRows');
  const cohort = document.getElementById('outreachCohort');
  const day = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago'});
  const count = new Intl.NumberFormat('en-US');
  const month = new Intl.DateTimeFormat('en-US', {month:'long',year:'numeric',timeZone:'UTC'});
  const stamp = new Intl.DateTimeFormat('en-US', {
    month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',
    timeZone:'America/Chicago',timeZoneName:'short'
  });
  if (!data || !Array.isArray(data.cohorts) || data.cohorts.length !== 2) return;
  const render = () => {
    const selected = cohort.value.match(/\d{4}-\d{2}/)?.[0];
    const rows = data.cohorts.filter(row => !selected || row.month === selected)
      .map(row => ({...row, label: month.format(new Date(row.month + '-15T12:00:00Z'))}));
    if (!selected) rows.push({...data.combined, label:'Both months'});
    const checked = new Date(data.observed_at);
    message.textContent = 'Movo Performance observed ' + stamp.format(checked) +
      (day.format(checked) === day.format(new Date()) ? '.' : '. These are the last published figures.');
    if (!rows.length) message.textContent += ' No council-wide totals are available for this cohort.';
    tbody.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = row.label;
      tr.append(heading);
      const percentage = row.due ? (100 * row.renewed / row.due).toFixed(1) + '%' : 'Unavailable';
      for (const value of [count.format(row.due), count.format(row.renewed), percentage]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.hidden = !rows.length;
  };
  cohort.addEventListener('change', render);
  document.getElementById('outreachReset').addEventListener('click', render);
  render();
})();

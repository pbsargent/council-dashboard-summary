(() => {
  'use strict';
  const councilData = window.CAC_MOVO_COUNCIL_DUE;
  const data = Array.isArray(councilData?.cohorts) && councilData.cohorts.length === 2 ? councilData : null;
  const outreach = window.CAC_RENEWAL_OUTREACH?.snapshots?.at(-1)?.council ?? {};
  const council = new Map(data?.cohorts?.map(row => [row.month, row]) ?? []);
  const months = [...new Set([...Object.keys(outreach), ...council.keys()])].sort();
  if (!months.length) return;
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
  const rate = row => {
    if (!Number.isInteger(row?.due) || row.due <= 0 || !Number.isInteger(row.renewed)) return 'Unavailable';
    const percentage = (100 * row.renewed / row.due).toFixed(1);
    return `${percentage}% (${count.format(row.renewed)} of ${count.format(row.due)})`;
  };
  const render = () => {
    const selected = cohort.value;
    const shown = months.filter(key => !selected || key === selected);
    const rows = shown.map(key => [
      month.format(new Date(key + '-15T12:00:00Z')), outreach[key], council.get(key)
    ]);
    if (!selected && months.length === 2) {
      const [first, second] = months.map(key => outreach[key]);
      const combined = first && second
        ? {due:first.due + second.due, renewed:first.renewed + second.renewed}
        : null;
      rows.push(['Both months', combined, data?.combined]);
    }
    if (council.size) {
      const checked = new Date(data.observed_at);
      message.textContent = 'Council-wide totals observed ' + stamp.format(checked) +
        (day.format(checked) === day.format(new Date()) ? '.' : '. These are the last published council-wide figures.');
    } else {
      message.textContent = 'Verified council-wide totals are unavailable for this report.';
    }
    if (!rows.length) message.textContent += ' No renewal figures are available for this cohort.';
    tbody.replaceChildren();
    for (const [label, outreachRow, councilRow] of rows) {
      const tr = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = label;
      tr.append(heading);
      for (const row of [outreachRow, councilRow]) {
        const td = document.createElement('td');
        td.textContent = rate(row);
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

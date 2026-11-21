(() => {
  'use strict';
  const node = id => document.getElementById(id);
  const source = window.MOVO_PERFORMANCE;
  if (!source) {
    node('performance-status').textContent = 'Movo Performance is currently unavailable.';
    return;
  }

  const number = new Intl.NumberFormat('en-US');
  const percent = new Intl.NumberFormat('en-US', {style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1});
  const clock = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', dateStyle: 'long', timeStyle: 'short'});
  const day = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'});
  const end = new Date(source.observed_end);
  const stale = day.format(end) !== day.format(new Date());
  node('performance-status').textContent = `Observed ${clock.format(end)} Central · Data through not supplied${stale ? ' · Last verified Performance snapshot' : ''}`;

  if (source.not_stated?.length) node('performance-status').textContent += ` · Not stated: ${source.not_stated.join('; ')}`;

  const label = value => ({'Nov 30': 'November 30', 'Dec 31': 'December 31', All: 'Both deadlines'})[value];
  const rate = (total, renewed) => total ? `${percent.format(renewed / total)} (${number.format(renewed)} of ${number.format(total)})` : 'Unavailable';
  function element(tag, value) {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function fillTable(body, rows) {
    body.replaceChildren(...rows.map(([title, ...values]) => {
      const tr = element('tr');
      const heading = element('th', title);
      heading.scope = 'row';
      tr.append(heading, ...values.map(value => {
        const td = element('td');
        if (typeof value === 'string') td.textContent = value;
        else td.append(value);
        return td;
      }));
      return tr;
    }));
  }
  function updateOptions(select, names, allLabel) {
    const prior = select.value;
    select.replaceChildren(new Option(allLabel, ''), ...names.map(name => new Option(name, name)));
    if (names.includes(prior)) select.value = prior;
  }
  function trend(cohort) {
    const group = element('div');
    const wrap = element('div');
    wrap.className = 'table-wrap';
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label', `${label(cohort.label)} council-wide trend`);
    const table = element('table');
    const row = table.createTHead().insertRow();
    row.append(...['Date', 'Council-wide renewed', 'Progress'].map(title => {
      const cell = element('th', title);
      cell.scope = 'col';
      return cell;
    }));
    fillTable(table.createTBody(), [...cohort.history].reverse().map(([date, renewed]) => {
      const total = cohort.council[0];
      if (renewed === null) return [date, 'Not stated', 'Not checkable'];
      const meter = element('meter');
      meter.max = total || 1;
      meter.value = renewed;
      meter.setAttribute('aria-label', rate(total, renewed));
      return [date, rate(total, renewed), meter];
    }));
    wrap.append(table);
    group.append(element('h4', label(cohort.label)), wrap);
    return group;
  }
  function renderBreakdowns(cohort) {
    const district = node('performance-district').value;
    const program = node('performance-program').value;
    fillTable(node('performance-districts'), cohort.districts.filter(row => !district || row[0] === district)
      .map(([name, total, renewed]) => [name, rate(total, renewed)]));
    fillTable(node('performance-programs'), cohort.programs.filter(row => !program || row[0] === program)
      .map(([name, total, renewed, youth, youthTotal, adult, adultTotal]) =>
        [name, rate(total, renewed), rate(youthTotal, youth), rate(adultTotal, adult)]));
  }
  function renderKpis({audience, council}) {
    const populations = [['Movo renewal audience', audience], ['Council-wide', council]];
    const measures = [
      ['Due', total => number.format(total)],
      ['Renewed', (total, renewed) => number.format(renewed)],
      ['Renewal rate', (total, renewed) => total ? percent.format(renewed / total) : 'Unavailable'],
      ['Outstanding', (total, renewed) => number.format(total - renewed)],
    ];
    node('performance-kpis').replaceChildren(...measures.map(([title, format]) => {
      const card = element('article');
      card.className = 'kpi performance-kpi';
      const values = element('dl');
      for (const [population, counts] of populations) {
        const column = element('div');
        column.append(element('dt', population), element('dd', format(...counts)));
        values.append(column);
      }
      card.append(element('h3', title), values);
      return card;
    }));
  }
  const select = node('performance-cohort');
  const selected = () => source.cohorts.find(cohort => cohort.label === select.value);
  function render() {
    const cohort = selected();
    renderKpis(cohort);
    fillTable(node('performance-summary'), source.cohorts
      .filter(row => cohort.label === 'All' || row === cohort)
      .map(row => [label(row.label), rate(...row.audience), rate(...row.council)]));
    node('performance-trend').replaceChildren(...source.cohorts
      .filter(row => row.history.length && (cohort.label === 'All' || row === cohort)).map(trend));
    updateOptions(node('performance-district'), cohort.districts.map(row => row[0]), 'All districts');
    updateOptions(node('performance-program'), cohort.programs.map(row => row[0]), 'All programs');
    renderBreakdowns(cohort);
    fillTable(node('performance-approximate'), source.approximate_status
      .filter(row => cohort.label === 'All' || row[0] === cohort.label)
      .map(([name, ...values]) => [label(name), ...values.map(value => value === null ? 'Not stated' : `≈${number.format(value)}`)]));
  }
  select.addEventListener('change', render);
  for (const id of ['performance-district', 'performance-program']) {
    node(id).addEventListener('change', () => renderBreakdowns(selected()));
  }
  const [reachable, contacted, updated] = source.pin.map(value => number.format(value));
  node('performance-pin').textContent = `${contacted} of ${reachable} reachable units were contacted. ${updated} units updated their PIN.`;
  fillTable(node('performance-joining'), source.joining.map(([name, count, registered, reference, replied, replyReference]) =>
    [name, number.format(count), `${percent.format(registered)} (${percent.format(reference)})`,
      `${percent.format(replied)} (${percent.format(replyReference)})`]));
  render();
  node('performance').hidden = false;
})();

const state = {
  data: null,
  sections: [],
  openServiceAreas: new Set(),
};

const fmt = new Intl.NumberFormat("en-US");
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const viewerTimestamp = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

function sourceTimestampDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(text);
  const utcGuess = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess)).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const centralAtGuess = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(utcGuess - (centralAtGuess - utcGuess));
}

function viewerTimestampLabel(value) {
  const date = sourceTimestampDate(value);
  return date && !Number.isNaN(date.getTime()) ? viewerTimestamp.format(date) : "n/a";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function n(value) {
  return value == null || Number.isNaN(value) ? "n/a" : fmt.format(value);
}

function metric(value) {
  return value == null || Number.isNaN(value) ? "n/a" : one.format(value);
}

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function allRows() {
  return state.sections.flatMap((section) => section.rows || []);
}

function serviceAreaGroups(rows) {
  const source = state.data.dashboard.service_areas || [];
  const sourceByName = new Map(source.map((area, index) => [area.service_area, { ...area, index }]));
  const groups = new Map();
  for (const row of rows) {
    const name = row.service_area || "Unassigned";
    if (!groups.has(name)) {
      const sourceRow = sourceByName.get(name) || {};
      groups.set(name, {
        name,
        fieldDirector: sourceRow.field_director || row.service_area_field_director || "",
        order: sourceRow.service_area_order ?? row.service_area_order ?? sourceRow.index ?? 99,
        rows: [],
      });
    }
    groups.get(name).rows.push(row);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function currentRows() {
  const section = document.getElementById("sectionSelect").value;
  const district = document.getElementById("districtSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  return allRows().filter((row) => {
    const haystack = [row.section, row.district].join(" ").toLowerCase();
    return (!section || row.section === section)
      && (!district || row.district === district)
      && (!q || haystack.includes(q));
  });
}

function sortedRows() {
  const rows = [...currentRows()];
  const sort = document.getElementById("sortSelect").value;
  const key = {
    risk: "metric_0_2_count",
    avg: "avg_metric",
    healthy: "metric_4_5_rate",
    trained: "ul_cc_trained_rate",
    outdoor: "outdoor_rate",
    retention: "retention_rate",
  }[sort] || "metric_0_2_count";
  rows.sort((a, b) => (b[key] || 0) - (a[key] || 0) || String(a.district || "").localeCompare(String(b.district || "")));
  return rows;
}

function renderMeta() {
  document.getElementById("generatedDate").textContent = viewerTimestampLabel(state.data.generated_at) || state.data.generated_date;
  const dataDate = new Date(`${state.data.generated_date}T00:00:00`);
  const dateLabel = Number.isNaN(dataDate.getTime())
    ? state.data.generated_date
    : dataDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  document.getElementById("titleDataDate").textContent = `Data current as of ${dateLabel}`;
}

function renderControls() {
  const sections = state.sections.map((section) => section.section).filter(Boolean);
  const districts = [...new Set(allRows().map((row) => row.district).filter(Boolean))]
    .filter((district) => district !== "Capitol Area Council")
    .sort((a, b) => a.localeCompare(b));

  document.getElementById("sectionSelect").innerHTML = sections.map((section, index) => (
    `<option value="${esc(section)}" ${index === 0 ? "selected" : ""}>${esc(section)}</option>`
  )).join("");
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${
    districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
}

function summarize(rows) {
  const units = rows.reduce((sum, row) => sum + (row.units || 0), 0);
  const risk = rows.reduce((sum, row) => sum + (row.metric_0_2_count || 0), 0);
  const neutral = rows.reduce((sum, row) => sum + (row.metric_3_count || 0), 0);
  const healthy = rows.reduce((sum, row) => sum + (row.metric_4_5_count || 0), 0);
  const weighted = (key) => {
    const totalWeight = rows.reduce((sum, row) => sum + ((row[key] == null ? 0 : row.units) || 0), 0);
    if (!totalWeight) return null;
    return rows.reduce((sum, row) => sum + ((row[key] || 0) * (row.units || 0)), 0) / totalWeight;
  };
  return {
    units,
    risk,
    neutral,
    healthy,
    avgMetric: weighted("avg_metric"),
    trainedRate: weighted("ul_cc_trained_rate"),
    outdoorRate: weighted("outdoor_rate"),
    retentionRate: weighted("retention_rate"),
  };
}

function forceOpenGroups() {
  return Boolean(document.getElementById("districtSelect").value || document.getElementById("searchInput").value.trim());
}

function renderKpis() {
  const summary = summarize(currentRows());
  const tiles = [
    ["Units", n(summary.units), "Units in selected section", "teal"],
    ["Avg Metric", metric(summary.avgMetric), "Weighted by units", "good"],
    ["0-2 Units", n(summary.risk), `${p(summary.risk / Math.max(1, summary.units))} at risk`, summary.risk ? "danger" : "good"],
    ["4-5 Units", n(summary.healthy), `${p(summary.healthy / Math.max(1, summary.units))} healthy`, "good"],
    ["UL & CC Trained", p(summary.trainedRate), "Leader training rate", "warning"],
    ["Retention", p(summary.retentionRate), "Workbook retention metric", "teal"],
  ];

  document.getElementById("metricKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function renderBars() {
  const rows = sortedRows().filter((row) => row.district !== "Capitol Area Council");
  const maxUnits = Math.max(...rows.map((row) => row.units || 0), 1);
  document.getElementById("compareCount").textContent = `${rows.length} rows`;
  document.getElementById("metricBars").innerHTML = serviceAreaGroups(rows).map((service) => {
    const summary = summarize(service.rows);
    const open = forceOpenGroups() || state.openServiceAreas.has(service.name);
    const serviceHtml = `
      <div class="bar-row service-bar-row">
        <div class="bar-label"><button class="service-toggle" type="button" data-service-area="${esc(service.name)}"><span class="disclosure">${open ? "-" : "+"}</span><strong>${esc(service.name)}</strong></button><span>${n(service.rows.length)} district rows · ${n(summary.units)} units · ${esc(service.fieldDirector || "No field director")}</span></div>
        <div class="meter"><div class="meter-fill risk" style="width:${Math.max(2, (summary.risk / Math.max(1, summary.units)) * 100)}%"></div></div>
        <div class="bar-value">${n(summary.risk)} / ${n(summary.healthy)}<div class="subtle">0-2 / 4-5</div></div>
      </div>
    `;
    const rowHtml = open ? service.rows.map((row) => {
    const riskWidth = row.units ? Math.max(2, ((row.metric_0_2_count || 0) / row.units) * 100) : 0;
    const healthyWidth = row.units ? Math.max(2, ((row.metric_4_5_count || 0) / row.units) * 100) : 0;
    const scaleWidth = Math.max(8, ((row.units || 0) / maxUnits) * 100);
    return `
      <div class="bar-row">
        <div class="bar-label">${esc(row.district)}<span>${esc(row.section)} · ${n(row.units)} units · avg ${metric(row.avg_metric)}</span></div>
        <div class="meter" aria-label="${esc(row.district)} metric distribution">
          <div class="meter-fill risk" style="width:${riskWidth}%"></div>
        </div>
        <div class="bar-value">${n(row.metric_0_2_count)} / ${n(row.metric_4_5_count)}<div class="subtle">0-2 / 4-5</div></div>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>Healthy share</span></div>
        <div class="meter" style="width:${scaleWidth}%"><div class="meter-fill good" style="width:${healthyWidth}%"></div></div>
        <div class="bar-value">${p(row.metric_4_5_rate)}</div>
      </div>
    `;
  }).join("") : "";
    return serviceHtml + rowHtml;
  }).join("") || '<div class="empty-state">No matching rows.</div>';
}

function renderSignals() {
  const rows = currentRows().filter((row) => row.district !== "Capitol Area Council");
  const weakest = [...rows].sort((a, b) => (b.metric_0_2_rate || 0) - (a.metric_0_2_rate || 0))[0];
  const strongest = [...rows].sort((a, b) => (b.metric_4_5_rate || 0) - (a.metric_4_5_rate || 0))[0];
  const lowTraining = [...rows].sort((a, b) => (a.ul_cc_trained_rate || 0) - (b.ul_cc_trained_rate || 0))[0];
  const lowOutdoor = [...rows].sort((a, b) => (a.outdoor_rate || 0) - (b.outdoor_rate || 0))[0];
  const cards = [
    weakest ? [`Highest 0-2 concentration`, `${weakest.district}: ${p(weakest.metric_0_2_rate)} of ${n(weakest.units)} ${weakest.section} units.`] : ["Highest 0-2 concentration", "No matching data."],
    strongest ? [`Strongest 4-5 concentration`, `${strongest.district}: ${p(strongest.metric_4_5_rate)} healthy units.`] : ["Strongest 4-5 concentration", "No matching data."],
    lowTraining ? [`Lowest UL & CC trained`, `${lowTraining.district}: ${p(lowTraining.ul_cc_trained_rate)}.`] : ["Lowest UL & CC trained", "No matching data."],
    lowOutdoor ? [`Lowest outdoor signal`, `${lowOutdoor.district}: ${p(lowOutdoor.outdoor_rate)}.`] : ["Lowest outdoor signal", "No matching data."],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderRows() {
  const rows = sortedRows();
  document.getElementById("rowCount").textContent = `${rows.length} rows`;
  document.getElementById("metricRows").innerHTML = serviceAreaGroups(rows).map((service) => {
    const summary = summarize(service.rows);
    const open = forceOpenGroups() || state.openServiceAreas.has(service.name);
    const serviceRow = `
    <tr class="service-area-row">
      <td colspan="2"><button class="service-toggle" type="button" data-service-area="${esc(service.name)}"><span class="disclosure">${open ? "-" : "+"}</span><strong>${esc(service.name)}</strong></button><div class="subtle">${n(service.rows.length)} district rows · ${esc(service.fieldDirector || "No field director")}</div></td>
      <td class="num">${n(summary.units)}</td>
      <td class="num">${metric(summary.avgMetric)}</td>
      <td class="num">${n(summary.risk)}</td>
      <td class="num">${n(summary.neutral)}</td>
      <td class="num">${n(summary.healthy)}</td>
      <td class="num">${p(summary.trainedRate)}</td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num">${p(summary.outdoorRate)}</td>
      <td class="num">${p(summary.retentionRate)}</td>
    </tr>`;
    const detailRows = open ? service.rows.map((row) => `
    <tr>
      <td>${esc(row.section)}</td>
      <td><strong>${esc(row.district)}</strong></td>
      <td class="num">${n(row.units)}</td>
      <td class="num">${metric(row.avg_metric)}</td>
      <td class="num">${n(row.metric_0_2_count)}<div class="subtle">${p(row.metric_0_2_rate)}</div></td>
      <td class="num">${n(row.metric_3_count)}<div class="subtle">${p(row.metric_3_rate)}</div></td>
      <td class="num">${n(row.metric_4_5_count)}<div class="subtle">${p(row.metric_4_5_rate)}</div></td>
      <td class="num">${p(row.ul_cc_trained_rate)}</td>
      <td class="num">${p(row.small_unit_rate)}</td>
      <td class="num">${p(row.membership_yoy_growth_rate)}</td>
      <td class="num">${p(row.rank_advancement_rate)}</td>
      <td class="num">${p(row.outdoor_rate)}</td>
      <td class="num">${p(row.retention_rate)}</td>
    </tr>
  `).join("") : "";
    return serviceRow + detailRows;
  }).join("") || '<tr><td colspan="13"><div class="empty-state">No matching rows.</div></td></tr>';
}

function renderAll() {
  renderKpis();
  renderBars();
  renderSignals();
  renderRows();
}

function bindEvents() {
  ["sectionSelect", "districtSelect", "sortSelect", "searchInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
  });
  ["metricBars", "metricRows"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (event) => {
      const button = event.target.closest(".service-toggle");
      if (!button) return;
      const name = button.dataset.serviceArea;
      if (state.openServiceAreas.has(name)) state.openServiceAreas.delete(name);
      else state.openServiceAreas.add(name);
      renderBars();
      renderRows();
    });
  });
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.sections = state.data.dashboard.unit_metric_compare || [];
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>Unit metric data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p>
    </section>
  `;
});

const state = {
  data: null,
  monday: null,
  chartMetric: "members",
};

const fmt = new Intl.NumberFormat("en-US");
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const signedPct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
const signedNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "always" });
const centralTimestamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

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

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function sp(value) {
  return value == null || Number.isNaN(value) ? "n/a" : signedPct.format(value);
}

function metric(value) {
  return value == null || Number.isNaN(value) ? "n/a" : one.format(value);
}

function formatCentralTimestamp(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return centralTimestamp.format(date);
}

function statusClass(status) {
  if (status === "On Track") return "good";
  if (status === "Monitor") return "warn";
  return "bad";
}

function currentDistricts() {
  const { data } = state;
  const district = document.getElementById("districtSelect").value;
  const status = document.getElementById("statusSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return data.dashboard.districts.filter((row) => {
    const haystack = [
      row.district,
      row.district_commissioner,
      row.field_exec,
    ].join(" ").toLowerCase();
    return (!district || row.district === district)
      && (!status || row.status === status)
      && (!q || haystack.includes(q));
  });
}

function matchingPriorityUnits() {
  const { data } = state;
  const district = document.getElementById("districtSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return data.dashboard.priority_units.filter((row) => {
    const haystack = [
      row.district,
      row.unit,
      ...(row.commissioners || []),
      row.pin_status,
    ].join(" ").toLowerCase();
    return (!district || row.district === district) && (!q || haystack.includes(q));
  });
}

function matchingCommissioners() {
  const { data } = state;
  const district = document.getElementById("districtSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return data.dashboard.commissioners.filter((row) => {
    const haystack = [
      row.district,
      row.name,
      row.position,
      row.assigned_units,
      row.unit_health,
    ].join(" ").toLowerCase();
    return (!district || row.district === district) && (!q || haystack.includes(q));
  });
}

function filterMondayList(rows) {
  const district = document.getElementById("districtSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  return (rows || []).filter((row) => {
    const label = String(row.label || "");
    const haystack = label.toLowerCase();
    return (!district || label === district || label === "Unassigned")
      && (!q || haystack.includes(q));
  });
}

function renderMeta() {
  const data = state.data;
  const generated = new Date(data.generated_at);
  document.getElementById("generatedDate").textContent = Number.isNaN(generated.getTime())
    ? data.generated_date
    : generated.toLocaleString();
  const dataDate = new Date(`${data.generated_date}T00:00:00`);
  const dateLabel = Number.isNaN(dataDate.getTime())
    ? data.generated_date
    : dataDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  document.getElementById("titleDataDate").textContent = `Data current as of ${dateLabel}`;
}

function renderControls() {
  const options = state.data.dashboard.districts
    .map((row) => `<option value="${esc(row.district)}">${esc(row.district)}</option>`)
    .join("");
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${options}`;
}

function renderKpis() {
  const c = state.data.dashboard.council;
  const cap = state.data.cst.capitol || {};
  const tiles = [
    ["Youth", n(c.members), `${signedNum.format(c.yoy_delta || 0)} YoY (${sp(c.yoy_pct)})`, c.yoy_delta >= 0 ? "good" : "warning"],
    ["Units", n(c.units), `${n(c.at_risk_units)} at-risk units`, "danger"],
    ["Avg Metric", metric(c.avg_metric), `${p(c.healthy_rate)} at metric 4-5`, "teal"],
    ["Assigned", p(c.assigned_pct), `${n(c.assigned_units)} assigned units`, "good"],
    ["Training", p(c.training_pct), "All scouter training", "warning"],
    ["CST7 Rank", cap.yoy_rank ? `#${metric(cap.yoy_rank)}` : "n/a", "CAC YoY rank in territory", "teal"],
  ];

  document.getElementById("kpiGrid").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function ratePanelRows(rows, key, lowFirst = true) {
  return [...rows]
    .sort((a, b) => lowFirst ? (a[key] || 0) - (b[key] || 0) : (b[key] || 0) - (a[key] || 0))
    .slice(0, 5);
}

function renderRatePanel(targetId, statusId, key, councilValue, threshold, label) {
  const rows = ratePanelRows(currentDistricts(), key);
  const below = state.data.dashboard.districts.filter((row) => (row[key] || 0) < threshold).length;
  document.getElementById(statusId).textContent = `${below} below ${p(threshold)}`;
  document.getElementById(targetId).innerHTML = `
    <div class="focus-metric">
      <strong>${p(councilValue)}</strong>
      <span>Council ${esc(label)}</span>
    </div>
    <div class="focus-bars">
      ${rows.map((row) => {
        const width = Math.max(2, Math.min(100, (row[key] || 0) * 100));
        const tone = (row[key] || 0) < threshold ? "risk" : "good";
        return `
          <div class="focus-row">
            <span>${esc(row.district)}</span>
            <div class="meter"><div class="meter-fill ${tone}" style="width:${width}%"></div></div>
            <strong>${p(row[key])}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTrainingPanel() {
  renderRatePanel(
    "trainingPanel",
    "trainingStatus",
    "training_pct",
    state.data.dashboard.council.training_pct,
    0.55,
    "training completion"
  );
}

function renderSytPanel() {
  renderRatePanel(
    "sytPanel",
    "sytStatus",
    "syt_pct",
    state.data.dashboard.council.syt_pct,
    0.8,
    "SYT completion"
  );
}

function mondayRate(count, total) {
  return total ? p(count / total) : "n/a";
}

function mondayCount(rows, label) {
  const hit = (rows || []).find((row) => row.label === label);
  return hit ? hit.count : 0;
}

function renderMondayBars(targetId, rows, total, limit = 8) {
  const displayRows = [...(rows || [])]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, limit);
  document.getElementById(targetId).innerHTML = displayRows.map((row) => {
    const width = total ? Math.max(3, Math.min(100, (row.count / total) * 100)) : 3;
    return `
      <div class="monday-row">
        <span>${esc(row.label)}</span>
        <div class="meter"><div class="meter-fill" style="width:${width}%"></div></div>
        <strong>${n(row.count)}</strong>
      </div>
    `;
  }).join("");
}

function renderMondayPanel() {
  const monday = state.monday;
  if (!monday) {
    document.getElementById("mondaySummary").innerHTML = `
      <article class="monday-stat"><strong>Monday data unavailable</strong><span>Refresh data/monday-latest.json to populate this panel.</span></article>
    `;
    return;
  }

  const { prospects, renewals, schools } = monday.boards;
  const qualified = mondayCount(prospects.status, "Qualified Prospect");
  const stuckProspects = mondayCount(prospects.status, "Stuck");
  const renewing = mondayCount(renewals.intent, "Renewing");
  const dropping = mondayCount(renewals.intent, "Dropping");
  const posted = mondayCount(renewals.posted, "Completed");
  const activeSchools = mondayCount(schools.status, "Active");
  const unlabeledSchools = mondayCount(schools.status, "Unlabeled");
  const unscheduledStarts = mondayCount(prospects.projected_start_months, "Unscheduled");

  const updatedDates = [prospects.updated_at, renewals.updated_at, schools.updated_at]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);
  document.getElementById("mondayUpdated").textContent = updatedDates[0]
    ? `Latest Monday board update ${formatCentralTimestamp(updatedDates[0])}`
    : "";

  document.getElementById("prospectLink").href = prospects.url;
  document.getElementById("renewalLink").href = renewals.url;
  document.getElementById("schoolLink").href = schools.url;

  const stats = [
    ["Hot prospects", n(prospects.items), `${n(qualified)} qualified, ${n(stuckProspects)} stuck`],
    ["Projected starts missing", n(unscheduledStarts), `${mondayRate(unscheduledStarts, prospects.items)} of prospects need a start month`],
    ["Renewing units", n(renewing), `${n(dropping)} marked dropping`],
    ["Renewal posted", p(posted / renewals.items), `${n(posted)} of ${n(renewals.items)} completed`],
    ["Active schools", n(activeSchools), `${n(unlabeledSchools)} school records unlabeled`],
  ];

  document.getElementById("mondaySummary").innerHTML = stats.map(([label, value, body]) => `
    <article class="monday-stat">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <p>${esc(body)}</p>
    </article>
  `).join("");

  renderMondayBars("mondayProspects", filterMondayList(prospects.districts), prospects.items);
  renderMondayBars("mondayRenewals", [
    ...renewals.intent,
    ...renewals.posted.map((row) => ({ label: `Posted: ${row.label}`, count: row.count })),
  ], renewals.items, 6);
  renderMondayBars("mondaySchools", filterMondayList(schools.districts), schools.items);
}

function renderDistrictChart() {
  const rows = [...currentDistricts()];
  const key = state.chartMetric;
  const max = Math.max(...rows.map((row) => row[key] || 0), key.includes("pct") || key.includes("rate") ? 1 : 0);
  const labels = {
    members: ["Youth", (v) => n(v)],
    at_risk_rate: ["At-risk rate", (v) => p(v)],
    assigned_pct: ["Assigned", (v) => p(v)],
    training_pct: ["Training", (v) => p(v)],
  };
  const formatter = labels[key][1];

  rows.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  document.getElementById("districtChart").innerHTML = rows.map((row) => {
    const value = row[key] || 0;
    const width = max ? Math.max(2, (value / max) * 100) : 2;
    const risk = key === "at_risk_rate" ? " risk" : "";
    return `
      <div class="bar-row">
        <div class="bar-label">${esc(row.district)}<span>${esc(row.status)}</span></div>
        <div class="meter" aria-label="${esc(row.district)} ${esc(labels[key][0])}">
          <div class="meter-fill${risk}" style="width: ${width}%"></div>
        </div>
        <div class="bar-value">${formatter(value)}</div>
      </div>
    `;
  }).join("");
}

function renderSignals() {
  const data = state.data;
  const c = data.dashboard.council;
  const worstRisk = [...data.dashboard.districts].sort((a, b) => (b.at_risk_rate || 0) - (a.at_risk_rate || 0))[0];
  const bestGrowth = [...data.dashboard.districts].sort((a, b) => (b.yoy_pct || 0) - (a.yoy_pct || 0))[0];
  const weakestTraining = [...data.dashboard.districts].sort((a, b) => (a.training_pct || 0) - (b.training_pct || 0))[0];
  const unassigned = Math.max(0, (c.units || 0) - (c.assigned_units || 0));
  const unitCommissioners = data.dashboard.commissioners.filter((row) => /unit commissioner/i.test(row.position || "")).length;

  const cards = [
    [`${n(unassigned)} units need assignment`, `${p(c.assigned_pct)} of units currently have commissioner assignment.`],
    [`${esc(worstRisk.district)} has highest risk`, `${p(worstRisk.at_risk_rate)} of units are in the 0-2 metric band.`],
    [`${esc(bestGrowth.district)} leads growth`, `${sp(bestGrowth.yoy_pct)} year over year, with ${n(bestGrowth.members)} youth.`],
    [`${n(unitCommissioners)} unit commissioners`, `${n(c.units)} units and ${n(data.dashboard.priority_units.length)} priority units in the commissioner work queue.`],
    [`Training gap: ${esc(weakestTraining.district)}`, `${p(weakestTraining.training_pct)} all-scouter training completion.`],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${title}</strong><p>${body}</p></article>
  `).join("");
}

function renderHealthFunnel() {
  const c = state.data.dashboard.council;
  const steps = [
    ["Total units", c.units, 1, "All units currently tracked in the membership dashboard."],
    ["Commissioner assigned", c.assigned_units, c.assigned_pct, "Units with named commissioner coverage."],
    ["Healthy units", c.healthy_units, c.healthy_rate, "Units in the 4-5 metric band."],
    ["At-risk units", c.at_risk_units, c.at_risk_rate, "Units in the 0-2 metric band requiring follow-up."],
  ];

  document.getElementById("healthFunnel").innerHTML = steps.map(([label, value, rate, note], index) => {
    const width = Math.max(12, Math.min(100, (rate || 0) * 100));
    const tone = index === 3 ? "risk" : index === 2 ? "good" : "";
    return `
      <article class="funnel-step">
        <div>
          <strong>${esc(label)}</strong>
          <p>${esc(note)}</p>
        </div>
        <div class="funnel-value">${n(value)}</div>
        <div class="funnel-bar"><span class="${tone}" style="width:${width}%"></span></div>
        <div class="subtle">${p(rate)}</div>
      </article>
    `;
  }).join("");
}

function renderQualityChecks() {
  const rows = state.data.dashboard.districts;
  const lowSyt = rows.filter((row) => (row.syt_pct || 0) < 0.8).length;
  const highRisk = rows.filter((row) => (row.at_risk_rate || 0) >= 0.55).length;
  const trainingGaps = rows.filter((row) => (row.training_pct || 0) < 0.55).length;
  const negativeGrowth = rows.filter((row) => (row.yoy_pct || 0) < 0).length;
  const checks = [
    ["SYT below 80%", lowSyt, "Districts below the watch threshold."],
    ["High unit risk", highRisk, "Districts with 55%+ units at metric 0-2."],
    ["Training below 55%", trainingGaps, "Districts with low all-scouter training."],
    ["Negative YoY growth", negativeGrowth, "Districts trailing same month last year."],
  ];

  document.getElementById("qualityChecks").innerHTML = checks.map(([label, value, note]) => `
    <article class="quality-item">
      <span>${esc(label)}</span>
      <strong>${n(value)}</strong>
      <p>${esc(note)}</p>
    </article>
  `).join("");
}

function miniMeter(value, tone = "") {
  const width = Math.max(0, Math.min(100, (value || 0) * 100));
  return `<span class="mini-meter"><span class="meter"><span class="meter-fill ${tone}" style="width:${width}%"></span></span><span class="subtle">${p(value)}</span></span>`;
}

function renderDistrictRows() {
  const rows = currentDistricts().sort((a, b) => (b.at_risk_rate || 0) - (a.at_risk_rate || 0));
  document.getElementById("districtRows").innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${esc(row.district)}</strong><div class="subtle">${n(row.units)} units</div></td>
      <td><span class="status ${statusClass(row.status)}">${esc(row.status)}</span></td>
      <td class="num">${n(row.members)}</td>
      <td class="num">${sp(row.yoy_pct)}</td>
      <td class="num">${metric(row.avg_metric)}</td>
      <td class="num">${miniMeter(row.at_risk_rate, "risk")}</td>
      <td class="num">${miniMeter(row.assigned_pct)}</td>
      <td class="num">${p(row.syt_pct)}</td>
      <td class="num">${p(row.training_pct)}</td>
      <td>${esc(row.district_commissioner || "TBA")}<div class="subtle">${esc(row.field_exec || "")}</div></td>
    </tr>
  `).join("");
}

function renderPriorityRows() {
  const rows = matchingPriorityUnits().sort((a, b) => (a.metric || 0) - (b.metric || 0));
  document.getElementById("priorityCount").textContent = `${rows.length} shown`;
  document.getElementById("priorityRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${esc(row.district)}</td>
      <td><strong>${esc(row.unit)}</strong><div class="subtle">${esc(row.unit_type || "")}</div></td>
      <td class="num">${metric(row.metric)}</td>
      <td class="num">${n(row.youth)}</td>
      <td>${esc((row.commissioners || []).join(", ") || "Unassigned")}</td>
      <td>${esc(row.pin_status || "n/a")}</td>
    </tr>
  `).join("");
}

function renderCoverage() {
  const data = state.data;
  const c = data.dashboard.council;
  const trained = data.dashboard.commissioners.filter((row) => row.trained).length;
  const withAssignments = data.dashboard.commissioners.filter((row) => row.assigned_units).length;
  const unitCommissioners = data.dashboard.commissioners.filter((row) => /unit commissioner/i.test(row.position || "")).length;
  const cards = [
    ["Registered commissioners", n(c.commissioners), "Total commissioner records in the dashboard extract."],
    ["Unit commissioners", n(unitCommissioners), `${n(c.units)} council units for coverage planning.`],
    ["Commissioners trained", p(trained / Math.max(1, data.dashboard.commissioners.length)), `${n(trained)} trained records.`],
    ["With assignments", p(withAssignments / Math.max(1, data.dashboard.commissioners.length)), `${n(withAssignments)} commissioners list assigned units.`],
  ];

  document.getElementById("coverage").innerHTML = cards.map(([label, value, body]) => `
    <article class="coverage-item"><strong>${esc(value)} ${esc(label)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderCommissionerRows() {
  const rows = matchingCommissioners().sort((a, b) => {
    const districtCompare = String(a.district || "").localeCompare(String(b.district || ""));
    return districtCompare || String(a.name || "").localeCompare(String(b.name || ""));
  });
  document.getElementById("commissionerCount").textContent = `${rows.length} shown`;
  document.getElementById("commissionerRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${esc(row.district || "")}</td>
      <td><strong>${esc(row.name || "")}</strong></td>
      <td>${esc(row.position || "")}</td>
      <td><span class="status ${row.trained ? "good" : "bad"}">${row.trained ? "Yes" : "No"}</span></td>
      <td>${row.syt_expires ? esc(new Date(row.syt_expires).toLocaleDateString()) : "n/a"}</td>
      <td>${esc(row.assigned_units || "None listed")}</td>
      <td>${esc(row.unit_health || "n/a")}</td>
    </tr>
  `).join("");
}

function renderTerritory() {
  const councils = state.data.cst.councils
    .filter((row) => row.council && row.members != null && !/^CST 7$/.test(row.council))
    .sort((a, b) => (b.members || 0) - (a.members || 0));

  document.getElementById("territoryGrid").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Council</th>
          <th class="num">Youth</th>
          <th class="num">Units</th>
          <th class="num">YoY</th>
          <th class="num">YoY Rank</th>
          <th class="num">Avg Metric</th>
        </tr>
      </thead>
      <tbody>
        ${councils.map((row) => `
          <tr>
            <td><strong>${esc(row.council.replace(" Council", ""))}</strong></td>
            <td class="num">${n(row.members)}</td>
            <td class="num">${n(row.units)}</td>
            <td class="num">${sp(row.yoy_pct)}</td>
            <td class="num">${row.yoy_rank ? n(row.yoy_rank) : "n/a"}</td>
            <td class="num">${metric(row.avg_metric)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSources() {
  const data = state.data;
  const sources = [
    ["Commissioner dashboard workbook", data.dashboard.source_name, data.dashboard.source_mtime, data.dashboard.source],
    ["CST7 metric workbook", data.cst.source_name, data.cst.source_mtime, data.cst.source],
  ];

  if (state.monday) {
    sources.push(["Monday.com boards", "Hot Prospects, 2026 Unit Renewal, Schools", state.monday.boards.prospects.updated_at, state.monday.generated_from]);
  }

  document.getElementById("sourcesGrid").innerHTML = sources.map(([label, name, mtime, path]) => `
    <article class="source-card">
      <strong>${esc(label)}</strong>
      <p>${esc(name || "n/a")}</p>
      <p>Updated ${esc(formatCentralTimestamp(mtime))}</p>
      <p class="subtle">${esc(path || "")}</p>
    </article>
  `).join("");
}

function renderAll() {
  renderKpis();
  renderTrainingPanel();
  renderSytPanel();
  renderMondayPanel();
  renderDistrictChart();
  renderSignals();
  renderHealthFunnel();
  renderQualityChecks();
  renderDistrictRows();
  renderPriorityRows();
  renderCoverage();
  renderCommissionerRows();
  renderTerritory();
}

function bindEvents() {
  ["districtSelect", "statusSelect", "searchInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
  });

  document.querySelectorAll("[data-chart-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-chart-metric]").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.chartMetric = button.dataset.chartMetric;
      renderDistrictChart();
    });
  });
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  try {
    const mondayResponse = await fetch("data/monday-latest.json", { cache: "no-store" });
    state.monday = mondayResponse.ok ? await mondayResponse.json() : null;
  } catch {
    state.monday = null;
  }
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>Dashboard data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this dashboard from a local web server or static host so it can read data/latest.json.</p>
    </section>
  `;
});

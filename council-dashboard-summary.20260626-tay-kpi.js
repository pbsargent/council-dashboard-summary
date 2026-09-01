const state = {
  data: null,
  monday: null,
  unitData: null,
  chartMetric: "members",
  openServiceAreas: new Set(),
};

const fmt = new Intl.NumberFormat("en-US");
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const pctWhole = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const signedPct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
const signedNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "always" });
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

function pWhole(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pctWhole.format(value);
}

function sp(value) {
  return value == null || Number.isNaN(value) ? "n/a" : signedPct.format(value);
}

function metric(value) {
  return value == null || Number.isNaN(value) ? "n/a" : one.format(value);
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function councilTaySummary() {
  const members = dashboardCouncil().members || 0;
  const schools = state.monday?.boards?.schools?.rows || [];
  const tay = schools.reduce((total, row) => total + (ProgramFilter.estimateSchoolTay(row).value || 0), 0);
  return {
    members,
    tay,
    pct: tay ? members / tay : null,
  };
}

function councilRetentionSummary() {
  const sectionName = ProgramFilter.isCouncil() ? "All Units" : ProgramFilter.getType();
  const sections = state.data?.dashboard?.unit_metric_compare || [];
  const rows = sections.find((section) => section.section === sectionName)?.rows || [];
  const measuredRows = rows.filter((row) => row.retention_rate != null && row.units);
  const units = measuredRows.reduce((sum, row) => sum + row.units, 0);
  const rate = units
    ? measuredRows.reduce((sum, row) => sum + (row.retention_rate * row.units), 0) / units
    : null;
  return { rate, units, sectionName };
}

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
  if (!value) return "n/a";
  const date = sourceTimestampDate(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return viewerTimestamp.format(date);
}

function formatCentralTimestamp(value) {
  return viewerTimestampLabel(value);
}

function statusClass(status) {
  if (status === "On Track") return "good";
  if (status === "Monitor") return "warn";
  return "bad";
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

function serviceAreaSummary(rows, key) {
  if (!rows.length) return null;
  if (key === "status") {
    const counts = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  if (key === "avg_metric") {
    const units = rows.reduce((total, row) => total + (row.units || 0), 0);
    return units ? rows.reduce((total, row) => total + (row.avg_metric || 0) * (row.units || 0), 0) / units : null;
  }
  if (key === "yoy_pct") {
    const lastYear = rows.reduce((total, row) => total + (row.last_year_members || 0), 0);
    const delta = rows.reduce((total, row) => total + (row.yoy_delta || 0), 0);
    return lastYear ? delta / lastYear : null;
  }
  if (key === "at_risk_rate") {
    const units = rows.reduce((total, row) => total + (row.units || 0), 0);
    const atRisk = rows.reduce((total, row) => total + (row.at_risk_units || 0), 0);
    return units ? atRisk / units : null;
  }
  if (key === "assigned_pct") {
    const units = rows.reduce((total, row) => total + (row.units || 0), 0);
    const assigned = rows.reduce((total, row) => total + (row.assigned_pct || 0) * (row.units || 0), 0);
    return units ? assigned / units : null;
  }
  if (key === "syt_pct" || key === "training_pct") {
    const members = rows.reduce((total, row) => total + (row.members || 0), 0);
    return members ? rows.reduce((total, row) => total + (row[key] || 0) * (row.members || 0), 0) / members : null;
  }
  if (key === "retention_rate") {
    const measuredRows = rows.filter((row) => row.retention_rate != null && row.units);
    const units = measuredRows.reduce((total, row) => total + row.units, 0);
    return units
      ? measuredRows.reduce((total, row) => total + row.retention_rate * row.units, 0) / units
      : null;
  }
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
}

function selectedDistrict() {
  return document.getElementById("districtSelect")?.value || "";
}

function searchQuery() {
  return document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
}

function selectedPriorityMetricBand() {
  return document.getElementById("priorityMetricSelect")?.value || "0-2";
}

function matchesPriorityMetricBand(value) {
  const metricValue = Number(value);
  if (!Number.isFinite(metricValue)) return false;
  const band = selectedPriorityMetricBand();
  if (band === "3") return metricValue === 3;
  if (band === "4-5") return metricValue >= 4 && metricValue <= 5;
  return metricValue >= 0 && metricValue <= 2;
}

function priorityUnitRows() {
  const existingRows = state.data?.dashboard?.priority_units || [];
  const pinRows = state.data?.dashboard?.unit_pin_statuses || [];
  if (!state.unitData?.units?.length) return existingRows;

  const rowKey = (district, unit) => `${ProgramFilter.cleanDistrict(district)}|${String(unit || "").trim()}`;
  const existingByUnit = new Map(existingRows.map((row) => [rowKey(row.district, row.unit), row]));
  const pinByUnit = new Map(pinRows.map((row) => [rowKey(row.district, row.unit), row.pin_status]));

  return state.unitData.units.map((unit) => {
    const district = ProgramFilter.cleanDistrict(unit.district);
    const unitName = [unit.unit_type, unit.number, unit.gender]
      .filter((part) => part != null && part !== "")
      .join(" ");
    const key = rowKey(district, unitName);
    const existing = existingByUnit.get(key);
    const baseRow = existing || {
      district,
      unit: unitName || unit.name,
      unit_type: unit.unit_type,
      metric: unit.metric,
      youth: unit.youth,
      commissioners: unit.commissioner ? [unit.commissioner] : [],
    };
    return {
      ...baseRow,
      pin_status: pinByUnit.get(key) ?? baseRow.pin_status ?? null,
    };
  });
}

function programUnits() {
  return (state.unitData?.units || []).filter((unit) => ProgramFilter.matchesUnitType(unit.unit_type));
}

function programDistrictRows() {
  if (ProgramFilter.isCouncil()) return state.data.dashboard.districts;
  const metadata = new Map(state.data.dashboard.districts.map((row) => [row.district, row]));
  const groups = new Map();
  programUnits().forEach((unit) => {
    const district = ProgramFilter.cleanDistrict(unit.district);
    if (!groups.has(district)) groups.set(district, []);
    groups.get(district).push(unit);
  });
  return [...groups.entries()].map(([district, units]) => {
    const meta = metadata.get(district) || {};
    const members = units.reduce((sum, unit) => sum + (Number(unit.youth) || 0), 0);
    const yoyDelta = units.reduce((sum, unit) => sum + (Number(unit.youth_change) || 0), 0);
    const lastYear = units.reduce((sum, unit) => sum + (Number(unit.youth_prior) || 0), 0);
    const atRisk = units.filter((unit) => unit.metric <= 2).length;
    const healthy = units.filter((unit) => unit.metric >= 4).length;
    const assigned = units.filter((unit) => unit.commissioner).length;
    const average = (getter) => {
      const values = units.map(getter).filter(Number.isFinite);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    const atRiskRate = atRisk / Math.max(1, units.length);
    const yoyPct = lastYear ? yoyDelta / lastYear : null;
    const trainingPct = average((unit) => unit.training?.all_leaders_trained_rate);
    const sytPct = average((unit) => unit.training?.syt_compliance_rate);
    const status = (yoyPct ?? 0) < -.10 || (sytPct ?? 1) < .80 || atRiskRate >= .55 ? "Needs Attention"
      : (trainingPct ?? 1) < .65 || atRiskRate >= .40 || (sytPct ?? 1) < .85 ? "Monitor" : "On Track";
    return {
      ...meta, district, units: units.length, members, last_year_members: lastYear, yoy_delta: yoyDelta,
      yoy_pct: yoyPct, at_risk_units: atRisk, healthy_units: healthy, at_risk_rate: atRiskRate,
      healthy_rate: healthy / Math.max(1, units.length), assigned_units: assigned,
      assigned_pct: assigned / Math.max(1, units.length), avg_metric: average((unit) => unit.metric),
      training_pct: trainingPct, syt_pct: sytPct, status,
    };
  });
}

function dashboardCouncil() {
  if (ProgramFilter.isCouncil()) return state.data.dashboard.council;
  const rows = programDistrictRows();
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  const members = rows.reduce((sum, row) => sum + row.members, 0);
  const lastYear = rows.reduce((sum, row) => sum + row.last_year_members, 0);
  const yoyDelta = rows.reduce((sum, row) => sum + row.yoy_delta, 0);
  const atRisk = rows.reduce((sum, row) => sum + row.at_risk_units, 0);
  const healthy = rows.reduce((sum, row) => sum + row.healthy_units, 0);
  const assigned = rows.reduce((sum, row) => sum + row.assigned_units, 0);
  const weighted = (key) => units ? rows.reduce((sum, row) => sum + (row[key] || 0) * row.units, 0) / units : null;
  return { units, members, last_year_members: lastYear, yoy_delta: yoyDelta, yoy_pct: lastYear ? yoyDelta / lastYear : null,
    at_risk_units: atRisk, healthy_units: healthy, at_risk_rate: atRisk / Math.max(1, units), healthy_rate: healthy / Math.max(1, units),
    assigned_units: assigned, assigned_pct: assigned / Math.max(1, units), avg_metric: weighted("avg_metric"),
    training_pct: weighted("training_pct"), syt_pct: weighted("syt_pct"), unit_commissioners: assigned };
}

function currentDistricts() {
  const { data } = state;
  const district = selectedDistrict();
  const status = document.getElementById("statusSelect")?.value || "";
  const q = searchQuery();

  return programDistrictRows().filter((row) => {
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
  const district = selectedDistrict();
  const q = searchQuery();

  return priorityUnitRows().filter((row) => {
    const haystack = [
      row.district,
      row.unit,
      ...(row.commissioners || []),
      row.pin_status,
    ].join(" ").toLowerCase();
    return ProgramFilter.matchesUnitType(row.unit_type)
      && matchesPriorityMetricBand(row.metric)
      && (!district || row.district === district) && (!q || haystack.includes(q));
  });
}

function matchingCommissioners() {
  const { data } = state;
  const district = selectedDistrict();
  const q = searchQuery();

  return data.dashboard.commissioners.filter((row) => {
    const haystack = [
      row.district,
      row.name,
      row.position,
      row.assigned_units,
      row.unit_health,
    ].join(" ").toLowerCase();
    const programMatch = ProgramFilter.isCouncil() || ProgramFilter.matchesUnitName(row.assigned_units)
      || new RegExp(`\\b${ProgramFilter.getType()}\\b`, "i").test(String(row.assigned_units || ""));
    return programMatch && (!district || row.district === district) && (!q || haystack.includes(q));
  });
}

function filterMondayList(rows) {
  const district = selectedDistrict();
  const q = searchQuery();
  return (rows || []).filter((row) => {
    const label = String(row.label || "");
    const haystack = label.toLowerCase();
    return (!district || label === district || label === "Unassigned")
      && (!q || haystack.includes(q));
  });
}

function renderMeta() {
  const data = state.data;
  const generatedDate = document.getElementById("generatedDate");
  if (generatedDate) generatedDate.textContent = viewerTimestampLabel(data.generated_at) || data.generated_date;
  const dataDate = new Date(`${data.generated_date}T00:00:00`);
  const dateLabel = Number.isNaN(dataDate.getTime())
    ? data.generated_date
    : dataDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const titleDataDate = document.getElementById("titleDataDate");
  if (titleDataDate) titleDataDate.textContent = `Data current as of ${dateLabel}`;
}

function renderControls() {
  const selected = document.getElementById("districtSelect")?.value || "";
  const options = programDistrictRows()
    .map((row) => `<option value="${esc(row.district)}">${esc(row.district)}</option>`)
    .join("");
  const districtSelect = document.getElementById("districtSelect");
  if (districtSelect) {
    districtSelect.innerHTML = `<option value="">All districts</option>${options}`;
    districtSelect.value = [...districtSelect.options].some((option) => option.value === selected) ? selected : "";
  }
}

function renderKpis() {
  const c = dashboardCouncil();
  const tay = councilTaySummary();
  const retention = councilRetentionSummary();
  const syt = sytReviewSummary();
  const sytFollowUp = syt.expired + syt.next30 + syt.next90;
  const tiles = [
    ["Primary Youth", n(c.members), `${signedNum.format(c.yoy_delta || 0)} YoY (${sp(c.yoy_pct)})`, c.yoy_delta >= 0 ? "good" : "warning"],
    ["Retention", p(retention.rate), `${retention.sectionName} workbook retention, weighted by ${n(retention.units)} units`, "teal"],
    ["Units", n(c.units), `${n(c.at_risk_units)} at-risk units`, "danger"],
    ["Avg Metric", metric(c.avg_metric), `${p(c.healthy_rate)} at metric 4-5`, "teal"],
    ["Assigned", p(c.assigned_pct), `${n(c.assigned_units)} assigned units`, "good"],
    ["Training", p(c.training_pct), "All scouter training", "warning"],
    ["Volunteers", n(state.data.dashboard.council.volunteers), "Councilwide unique Member IDs from the Training roster", "teal"],
    ["Current SYT", p(c.syt_pct), `${n(sytFollowUp)} expired or expiring within 90 days`, c.syt_pct >= 0.98 ? "good" : "warning"],
    [ProgramFilter.isCouncil() ? "Primary Youth / TAY" : "Primary Youth / Est. TAY", p(tay.pct), `${n(tay.members)} primary youth of ${n(Math.round(tay.tay))} ${ProgramFilter.isCouncil() ? "TAY" : "estimated TAY"}`, "teal"],
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

function sytReviewSummary() {
  const rows = (state.data?.dashboard?.syt_people || []).filter((row) => ProgramFilter.matchesUnitType(row.unit_type));
  const expired = rows.filter((row) => row.expired).length;
  const next30 = rows.filter((row) => row.expiring_0_30).length;
  const next90 = rows.filter((row) => row.expiring_31_90).length;
  const needsReview = expired + next30 + next90;
  const total = rows.length;
  return { rows, expired, next30, next90, needsReview, total, current: Math.max(0, total - needsReview) };
}

function renderTrainingPanel() {
  renderRatePanel(
    "trainingPanel",
    "trainingStatus",
    "training_pct",
    dashboardCouncil().training_pct,
    0.55,
    "training completion"
  );
}

function renderSytPanel() {
  const summary = sytReviewSummary();
  if (!summary.total) {
    renderRatePanel(
      "sytPanel",
      "sytStatus",
      "syt_pct",
      dashboardCouncil().syt_pct,
      0.8,
      "Official SYT"
    );
    return;
  }

  document.getElementById("sytStatus").textContent = `${n(summary.needsReview)} need review`;
  const byDistrict = new Map();
  for (const row of summary.rows) {
    const district = row.district || "Council";
    if (!byDistrict.has(district)) {
      byDistrict.set(district, { district, total: 0, expired: 0, next30: 0, next90: 0 });
    }
    const item = byDistrict.get(district);
    item.total += 1;
    if (row.expired) item.expired += 1;
    if (row.expiring_0_30) item.next30 += 1;
    if (row.expiring_31_90) item.next90 += 1;
  }
  const rows = [...byDistrict.values()]
    .map((row) => ({ ...row, needsReview: row.expired + row.next30 + row.next90 }))
    .filter((row) => row.needsReview)
    .sort((a, b) => b.needsReview - a.needsReview || a.district.localeCompare(b.district))
    .slice(0, 5);

  document.getElementById("sytPanel").innerHTML = `
    <div class="focus-metric">
      <strong>${p(dashboardCouncil().syt_pct)}</strong>
      <span>Official council SYT (${n(summary.needsReview)} expired or expiring within 90 days)</span>
    </div>
    <div class="focus-bars">
      ${rows.map((row) => {
        const width = Math.max(2, Math.min(100, (row.needsReview / Math.max(1, row.total)) * 100));
        return `
          <div class="focus-row">
            <span>${esc(row.district)}</span>
            <div class="meter"><div class="meter-fill risk" style="width:${width}%"></div></div>
            <strong>${n(row.needsReview)}</strong>
          </div>
        `;
      }).join("")}
    </div>
    <p class="subtle">${n(summary.expired)} expired · ${n(summary.next30)} 0-30 days · ${n(summary.next90)} 31-90 days</p>
  `;
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

  if (!ProgramFilter.isCouncil()) {
    const prospects = (monday.boards.prospects?.rows || []).filter((row) => ProgramFilter.matchesMondayRow(row, "prospects"));
    const renewals = (monday.boards.renewals?.rows || []).filter((row) => ProgramFilter.matchesMondayRow(row, "renewals"));
    const schools = (monday.boards.schools?.rows || []).filter((row) => ProgramFilter.matchesMondayRow(row, "schools"));
    const popcorn = (monday.boards.popcorn?.rows || []).filter((row) => ProgramFilter.matchesMondayRow(row, "popcorn"));
    const stats = [
      ["Hot prospects", n(prospects.length), `${n(prospects.filter((row) => row.status === "Stuck").length)} stuck`],
      ["Projected starts missing", n(prospects.filter((row) => !row.projected_start || row.projected_start === "Unscheduled").length), "Program identified from Potential Unit Type(s)"],
      ["Renewing units", n(renewals.filter((row) => row.intent === "Renewing").length), `${n(renewals.filter((row) => row.intent === "Dropping").length)} marked dropping`],
      ["Renewal posted", p(renewals.filter((row) => row.posted === "Completed").length / Math.max(1, renewals.length)), `${n(renewals.filter((row) => row.posted === "Completed").length)} of ${n(renewals.length)} completed`],
      ["Eligible-span schools", n(schools.length), "Published grade/age span overlaps the selected program"],
      ["Popcorn participation", ProgramFilter.getType() === "Post" ? "Not tracked" : p(popcorn.filter((row) => row.commitment === "Committed").length / Math.max(1, popcorn.length)), ProgramFilter.getType() === "Post" ? "Posts are excluded from the source population" : `${n(popcorn.filter((row) => row.commitment === "Committed").length)} of ${n(popcorn.length)} committed`],
    ];
    document.getElementById("mondaySummary").innerHTML = stats.map(([label, value, body]) => `<article class="monday-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><p>${esc(body)}</p></article>`).join("");
    const byDistrict = (rows) => Object.entries(rows.reduce((acc, row) => { const key = row.district || "Unassigned"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([label, count]) => ({ label, count }));
    renderMondayBars("mondayProspects", filterMondayList(byDistrict(prospects)), prospects.length);
    renderMondayBars("mondayRenewals", byDistrict(renewals), renewals.length);
    renderMondayBars("mondaySchools", byDistrict(schools.map((row) => ({ ...row, district: row.scouting_district }))), schools.length);
    renderMondayBars("mondayPopcorn", byDistrict(popcorn), popcorn.length);
    document.getElementById("mondayUpdated").textContent = `Filtered to ${ProgramFilter.get()}; school TAY is estimated from published grade/age spans`;
    return;
  }

  const { prospects, renewals, schools, popcorn } = monday.boards;
  const qualified = mondayCount(prospects.status, "Qualified Prospect");
  const stuckProspects = mondayCount(prospects.status, "Stuck");
  const renewing = mondayCount(renewals.intent, "Renewing");
  const dropping = mondayCount(renewals.intent, "Dropping");
  const posted = mondayCount(renewals.posted, "Completed");
  const activeSchools = mondayCount(schools.status, "Active");
  const unlabeledSchools = mondayCount(schools.status, "Unlabeled");
  const unscheduledStarts = mondayCount(prospects.projected_start_months, "Unscheduled");

  const updatedDates = [prospects.updated_at, renewals.updated_at, schools.updated_at, popcorn?.updated_at]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);
  document.getElementById("mondayUpdated").textContent = updatedDates[0]
    ? `Most recent monday.com board item timestamp ${formatCentralTimestamp(updatedDates[0])}`
    : "";

  document.getElementById("prospectLink").href = prospects.url;
  document.getElementById("renewalLink").href = renewals.url;
  document.getElementById("schoolLink").href = schools.url;
  if (popcorn) document.getElementById("popcornLink").href = popcorn.url;

  const stats = [
    ["Hot prospects", n(prospects.items), `${n(qualified)} qualified, ${n(stuckProspects)} stuck`],
    ["Projected starts missing", n(unscheduledStarts), `${mondayRate(unscheduledStarts, prospects.items)} of prospects need a start month`],
    ["Renewing units", n(renewing), `${n(dropping)} marked dropping`],
    ["Renewal posted", p(posted / renewals.items), `${n(posted)} of ${n(renewals.items)} completed`],
    ["Active schools", n(activeSchools), `${n(unlabeledSchools)} school records unlabeled`],
  ];
  if (popcorn) {
    stats.push([
      "Popcorn participation",
      p(popcorn.participation_rate),
      `${n(popcorn.committed)} of ${n(popcorn.items)} units committed`,
    ]);
  }

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
  if (popcorn) renderMondayBars("mondayPopcorn", popcorn.commitment_status, popcorn.items, 6);
}

function renderDistrictChart() {
  const rows = [...currentDistricts()];
  const key = state.chartMetric;
  const max = Math.max(...rows.map((row) => row[key] || 0), key.includes("pct") || key.includes("rate") ? 1 : 0);
  const labels = {
    members: ["Primary youth", (v) => n(v)],
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
  const c = dashboardCouncil();
  const sourceRows = programDistrictRows();
  const worstRisk = [...sourceRows].sort((a, b) => (b.at_risk_rate || 0) - (a.at_risk_rate || 0))[0] || {};
  const bestGrowth = [...sourceRows].sort((a, b) => (b.yoy_pct || 0) - (a.yoy_pct || 0))[0] || {};
  const weakestTraining = [...sourceRows].sort((a, b) => (a.training_pct || 0) - (b.training_pct || 0))[0] || {};
  const unassigned = Math.max(0, (c.units || 0) - (c.assigned_units || 0));
  const unitCommissioners = unitCommissionerSummary(data.dashboard.commissioners, c);

  const cards = [
    [`${n(unassigned)} units need assignment`, `${p(c.assigned_pct)} of units currently have commissioner assignment.`],
    [`${esc(worstRisk.district)} has highest risk`, `${p(worstRisk.at_risk_rate)} of units are in the 0-2 metric band.`],
    [`${esc(bestGrowth.district)} leads growth`, `${sp(bestGrowth.yoy_pct)} year over year, with ${n(bestGrowth.members)} youth.`],
    [`${n(c.assigned_units)} units with commissioner coverage`, `${n(matchingPriorityUnits().length)} priority units in the filtered work queue.`],
    [`Training gap: ${esc(weakestTraining.district)}`, `${p(weakestTraining.training_pct)} all-scouter training completion.`],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${title}</strong><p>${body}</p></article>
  `).join("");
}

function renderHealthFunnel() {
  const c = dashboardCouncil();
  const pinRows = (state.data?.dashboard?.unit_pin_statuses || [])
    .filter((row) => ProgramFilter.matchesUnitType(row.unit_type));
  const pinFollowup = pinRows.length
    ? pinRows.filter((row) => ["Inactive", "Stale"].includes(row.pin_status)).length
    : null;
  const pinFollowupRate = c.units && pinFollowup != null ? pinFollowup / c.units : null;
  const steps = [
    ["Total units", c.units, 1, "All units currently tracked in the membership dashboard.", ""],
    ["Commissioner assigned", c.assigned_units, c.assigned_pct, "Units with named commissioner coverage.", ""],
    ["Healthy units", c.healthy_units, c.healthy_rate, "Units in the 4-5 metric band.", "good"],
    ["At-risk units", c.at_risk_units, c.at_risk_rate, "Units in the 0-2 metric band requiring follow-up.", "risk"],
    ["Inactive + stale PINs", pinFollowup, pinFollowupRate, "Inactive PINs, plus PINs with more than 12 months since the last update or a missing update date.", "risk"],
  ];

  document.getElementById("healthFunnel").innerHTML = steps.map(([label, value, rate, note, tone]) => {
    const width = Math.max(12, Math.min(100, (rate || 0) * 100));
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
  const rows = programDistrictRows();
  const lowSyt = rows.filter((row) => (row.syt_pct || 0) < 0.8).length;
  const highRisk = rows.filter((row) => (row.at_risk_rate || 0) >= 0.55).length;
  const trainingGaps = rows.filter((row) => (row.training_pct || 0) < 0.55).length;
  const negativeGrowth = rows.filter((row) => (row.yoy_pct || 0) < 0).length;
  const checks = [
    ["Official SYT below 80%", lowSyt, "Districts below the watch threshold."],
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

function renderDistrictRows() {
  const rows = currentDistricts().sort((a, b) => (b.at_risk_rate || 0) - (a.at_risk_rate || 0));
  const forceOpen = Boolean(selectedDistrict() || searchQuery());
  document.getElementById("districtRows").innerHTML = serviceAreaGroups(rows).map((service) => {
    const open = forceOpen || state.openServiceAreas.has(service.name);
    const status = serviceAreaSummary(service.rows, "status");
    const atRiskUnits = serviceAreaSummary(service.rows, "at_risk_units");
    const units = serviceAreaSummary(service.rows, "units");
    const serviceRow = `
      <tr class="service-area-row" data-service-area="${esc(service.name)}" aria-expanded="${open ? "true" : "false"}">
        <td><button class="service-toggle" type="button" data-service-area="${esc(service.name)}"><span class="disclosure">${open ? "-" : "+"}</span><strong>${esc(service.name)}</strong></button><div class="subtle">${n(service.rows.length)} districts · ${esc(service.fieldDirector || "No field director")}</div></td>
        <td><span class="status ${statusClass(status)}">${esc(status)}</span></td>
        <td class="num">${n(serviceAreaSummary(service.rows, "members"))}</td>
        <td class="num">${sp(serviceAreaSummary(service.rows, "yoy_pct"))}</td>
        <td class="num">${metric(serviceAreaSummary(service.rows, "avg_metric"))}</td>
        <td class="num">${pWhole(serviceAreaSummary(service.rows, "retention_rate"))}</td>
        <td class="num">${p(serviceAreaSummary(service.rows, "at_risk_rate"))}<div class="subtle">${n(atRiskUnits)} / ${n(units)}</div></td>
        <td class="num">${p(serviceAreaSummary(service.rows, "assigned_pct"))}</td>
        <td class="num">${p(serviceAreaSummary(service.rows, "syt_pct"))}</td>
        <td class="num">${p(serviceAreaSummary(service.rows, "training_pct"))}</td>
        <td></td>
      </tr>
    `;
    const districtRows = open ? service.rows.map((row) => `
    <tr>
      <td><strong>${esc(row.district)}</strong><div class="subtle">${n(row.units)} units</div></td>
      <td><span class="status ${statusClass(row.status)}">${esc(row.status)}</span></td>
      <td class="num">${n(row.members)}</td>
      <td class="num">${sp(row.yoy_pct)}</td>
      <td class="num">${metric(row.avg_metric)}</td>
      <td class="num">${pWhole(row.retention_rate)}</td>
      <td class="num">${p(row.at_risk_rate)}</td>
      <td class="num">${p(row.assigned_pct)}</td>
      <td class="num">${p(row.syt_pct)}</td>
      <td class="num">${p(row.training_pct)}</td>
      <td>${esc(row.district_commissioner || "TBA")}<div class="subtle">${esc(row.field_exec || "")}</div></td>
    </tr>
  `).join("") : "";
    return serviceRow + districtRows;
  }).join("");
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

function unitCommissionerSummary(rows, council = {}) {
  const commissioners = new Map();
  rows.forEach((row) => {
    if (String(row.position || "").trim().toLowerCase() !== "unit commissioner") return;
    const name = String(row.name || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!name) return;
    const existing = commissioners.get(name) || { assigned: false };
    existing.assigned = existing.assigned || Boolean(String(row.assigned_units || "").trim());
    commissioners.set(name, existing);
  });
  return {
    total: council.unit_commissioners ?? commissioners.size,
    assigned: [...commissioners.values()].filter((row) => row.assigned).length,
  };
}

function renderCoverage() {
  const data = state.data;
  const c = data.dashboard.council;
  const trained = data.dashboard.commissioners.filter((row) => row.trained).length;
  const withAssignments = data.dashboard.commissioners.filter((row) => row.assigned_units).length;
  const unitCommissioners = unitCommissionerSummary(data.dashboard.commissioners, c);
  const cards = [
    ["Volunteers", n(c.volunteers), "Councilwide Membership-tab count of unique nonblank Member IDs in the Training roster."],
    ["Workbook commissioner records", n(c.commissioners), "Commissioners worksheet records; my.Scouting dashboard summary may apply a narrower role filter."],
    ["Unique Unit Commissioners", n(unitCommissioners.total), `${n(unitCommissioners.assigned)} have assigned units; duplicate Unit Commissioner role rows count once.`],
    ["Commissioners trained", p(trained / Math.max(1, data.dashboard.commissioners.length)), `${n(trained)} trained records.`],
    ["With assignments", p(withAssignments / Math.max(1, data.dashboard.commissioners.length)), `${n(withAssignments)} commissioners list assigned units.`],
  ];

  document.getElementById("coverage").innerHTML = cards.map(([label, value, body]) => `
    <article class="coverage-item"><strong>${esc(value)} ${esc(label)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderOutdoorReadinessOverview() {
  const target = document.getElementById("outdoorReadinessPanel");
  if (!target) return;
  const people = state.data.dashboard.training_people || [];
  const definitions = [
    ["Pack", "BALOO", "camping-readiness.html"],
    ["Troop", "IOLS-trained SM/ASM", "troop-camping-readiness.html"],
  ].filter(([unitType]) => ProgramFilter.isCouncil() || ProgramFilter.getType() === unitType);
  const cards = definitions.map(([unitType, qualification, href]) => {
    const units = CACOutdoorReadiness.buildUnits(people, unitType, state.data.generated_date);
    const zero = units.filter((unit) => unit.qualificationCount === 0).length;
    const one = units.filter((unit) => unit.qualificationCount === 1).length;
    const depth = units.filter((unit) => unit.qualificationCount >= 2).length;
    return `<article class="coverage-item">
      <strong>${esc(unitType)} ${esc(qualification)} depth</strong>
      <p><span class="status ${zero ? "bad" : "good"}">${n(zero)} gap</span> <span class="status ${one ? "warn" : "good"}">${n(one)} fragile</span> <span class="status good">${n(depth)} preferred</span></p>
      <p><a class="detail-link" href="${esc(href)}">Open ${esc(unitType)} action list</a></p>
    </article>`;
  });
  target.innerHTML = cards.join("") || '<div class="empty-state">BALOO and IOLS leadership depth apply to Packs and Troops.</div>';
  const attention = definitions.reduce((sum, [unitType]) => {
    const units = CACOutdoorReadiness.buildUnits(people, unitType, state.data.generated_date);
    return sum + units.filter((unit) => unit.qualificationCount < 2).length;
  }, 0);
  document.getElementById("outdoorReadinessStatus").textContent = `${n(attention)} need depth follow-up`;
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
  if (!ProgramFilter.isCouncil() && document.body.dataset.page !== "comparison") {
    document.getElementById("territoryGrid").innerHTML = `<div class="empty-state"><strong>CST comparison remains council-level.</strong><p>The CST workbook does not publish comparable youth, unit-health, and growth measures for ${esc(ProgramFilter.get())} across councils.</p></div>`;
    return;
  }
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
          <th class="num">Retention</th>
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
            <td class="num">${p(row.retention_rate)}</td>
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
    sources.push(["Monday.com boards", "Hot Prospects, 2026 Unit Renewal, Schools, Popcorn Commitments", state.monday.boards.prospects.updated_at, state.monday.generated_from]);
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
  if (document.getElementById("kpiGrid")) renderKpis();
  if (document.getElementById("trainingPanel")) renderTrainingPanel();
  if (document.getElementById("sytPanel")) renderSytPanel();
  if (document.getElementById("mondaySummary")) renderMondayPanel();
  if (document.getElementById("districtChart")) renderDistrictChart();
  if (document.getElementById("signals")) renderSignals();
  if (document.getElementById("healthFunnel")) renderHealthFunnel();
  if (document.getElementById("qualityChecks")) renderQualityChecks();
  if (document.getElementById("districtRows")) renderDistrictRows();
  if (document.getElementById("priorityRows")) renderPriorityRows();
  if (document.getElementById("coverage")) renderCoverage();
  if (document.getElementById("outdoorReadinessPanel")) renderOutdoorReadinessOverview();
  if (document.getElementById("commissionerRows")) renderCommissionerRows();
  if (document.getElementById("territoryGrid")) renderTerritory();
}

function bindEvents() {
  ["districtSelect", "statusSelect", "searchInput", "priorityMetricSelect"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderAll);
  });

  document.querySelectorAll("[data-chart-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-chart-metric]").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.chartMetric = button.dataset.chartMetric;
      renderDistrictChart();
    });
  });

  document.getElementById("districtRows")?.addEventListener("click", (event) => {
    const button = event.target.closest(".service-toggle");
    if (!button) return;
    const name = button.dataset.serviceArea;
    if (state.openServiceAreas.has(name)) state.openServiceAreas.delete(name);
    else state.openServiceAreas.add(name);
    renderDistrictRows();
  });
  window.addEventListener("programfilterchange", () => { renderControls(); renderAll(); });
}

async function init() {
  const [response, unitResponse] = await Promise.all([
    fetch("data/latest.json", { cache: "no-store" }),
    fetch("data/unit-level-latest.json", { cache: "no-store" }),
  ]);
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.unitData = unitResponse.ok ? await unitResponse.json() : { units: [] };
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

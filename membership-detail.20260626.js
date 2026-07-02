const state = {
  dashboard: null,
  monday: null,
  rows: [],
  openServiceAreas: new Set(),
};

const fmt = new Intl.NumberFormat("en-US");
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
const centralDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
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

function numeric(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function n(value) {
  return value == null || Number.isNaN(value) ? "n/a" : fmt.format(value);
}

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function signed(value, format = n) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${format(value)}`;
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

function dateLabel(value) {
  if (!value) return "n/a";
  const date = sourceTimestampDate(value);
  return !date || Number.isNaN(date.getTime()) ? String(value) : viewerTimestamp.format(date);
}

function shortDateLabel(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : centralDate.format(date);
}

function districtLabels(value) {
  const labels = String(value || "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  return labels.length ? labels : ["Unassigned"];
}

function officialDistricts() {
  return (state.dashboard?.dashboard?.districts || []).map((row) => row.district).filter(Boolean);
}

function officialDistrictSet() {
  return new Set(officialDistricts());
}

function serviceAreaGroups(rows) {
  const order = state.dashboard?.dashboard?.service_areas || [];
  const byName = new Map(order.map((service, index) => [service.service_area, {
    ...service,
    order: index,
    rows: [],
  }]));
  rows.forEach((row) => {
    const serviceName = row.service_area || "Unassigned Service Area";
    if (!byName.has(serviceName)) {
      byName.set(serviceName, {
        service_area: serviceName,
        field_director: row.service_area_director || "",
        order: order.length + byName.size,
        rows: [],
      });
    }
    byName.get(serviceName).rows.push(row);
  });
  return [...byName.values()]
    .filter((service) => service.rows.length)
    .sort((a, b) => a.order - b.order || a.service_area.localeCompare(b.service_area));
}

function serviceSummary(rows) {
  const members = rows.reduce((sum, row) => sum + numeric(row.members), 0);
  const yoyDelta = rows.reduce((sum, row) => sum + numeric(row.yoy_delta), 0);
  const lastYear = rows.reduce((sum, row) => sum + numeric(row.last_year_members), 0);
  const tay = rows.reduce((sum, row) => sum + numeric(row.tay), 0);
  const units = rows.reduce((sum, row) => sum + numeric(row.units), 0);
  const priority = rows.reduce((sum, row) => sum + numeric(row.priority_score), 0);
  return {
    members,
    yoy_delta: yoyDelta,
    yoy_pct: lastYear ? yoyDelta / lastYear : null,
    tay,
    membership_pct_tay: tay ? members / tay : null,
    units,
    priority_score: priority,
    schools: rows.reduce((sum, row) => sum + numeric(row.schools), 0),
    schools_without_unit: rows.reduce((sum, row) => sum + numeric(row.schools_without_unit), 0),
    at_risk_units: rows.reduce((sum, row) => sum + numeric(row.at_risk_units), 0),
    healthy_units: rows.reduce((sum, row) => sum + numeric(row.healthy_units), 0),
    prospects: rows.reduce((sum, row) => sum + numeric(row.prospects), 0),
    stuck_prospects: rows.reduce((sum, row) => sum + numeric(row.stuck_prospects), 0),
    unscheduled_prospects: rows.reduce((sum, row) => sum + numeric(row.unscheduled_prospects), 0),
    renewal_follow_up: rows.reduce((sum, row) => sum + numeric(row.renewal_follow_up), 0),
    dropping_renewals: rows.reduce((sum, row) => sum + numeric(row.dropping_renewals), 0),
    metric_0_2_rate: units ? rows.reduce((sum, row) => sum + numeric(row.at_risk_units), 0) / units : null,
    metric_4_5_rate: units ? rows.reduce((sum, row) => sum + numeric(row.healthy_units), 0) / units : null,
  };
}

function serviceIsOpen(name) {
  return state.openServiceAreas.has(name);
}

function forceOpenGroups() {
  return Boolean(document.getElementById("districtSelect")?.value || document.getElementById("searchInput")?.value.trim());
}

function addDistrictRollup(map, district) {
  if (!map.has(district)) {
    map.set(district, {
      district,
      schools: 0,
      tay: 0,
      schools_without_unit: 0,
      prospects: 0,
      stuck_prospects: 0,
      unscheduled_prospects: 0,
      renewals: 0,
      renewal_follow_up: 0,
      dropping_renewals: 0,
    });
  }
  return map.get(district);
}

function mondayRollups() {
  const official = officialDistrictSet();
  const rollups = new Map();
  official.forEach((district) => addDistrictRollup(rollups, district));

  for (const row of state.monday?.boards?.schools?.rows || []) {
    for (const label of districtLabels(row.scouting_district)) {
      if (!official.has(label)) continue;
      const item = addDistrictRollup(rollups, label);
      item.schools += 1;
      item.tay += numeric(row.tay);
      if (!row.unit_associated) item.schools_without_unit += 1;
    }
  }

  for (const row of state.monday?.boards?.prospects?.rows || []) {
    for (const label of districtLabels(row.district)) {
      if (!official.has(label)) continue;
      const item = addDistrictRollup(rollups, label);
      item.prospects += 1;
      if (row.status === "Stuck") item.stuck_prospects += 1;
      if (row.projected_start === "Unscheduled") item.unscheduled_prospects += 1;
    }
  }

  for (const row of state.monday?.boards?.renewals?.rows || []) {
    for (const label of districtLabels(row.district)) {
      if (!official.has(label)) continue;
      const item = addDistrictRollup(rollups, label);
      item.renewals += 1;
      if (row.posted !== "Completed") item.renewal_follow_up += 1;
      if (row.intent === "Dropping") item.dropping_renewals += 1;
    }
  }

  return rollups;
}

function signalFor(row) {
  if ((row.yoy_pct || 0) < 0 && (row.membership_pct_tay ?? 1) < .015) return "Decline + low TAY penetration";
  if ((row.metric_0_2_rate || 0) >= .48) return "Unit health risk";
  if ((row.stuck_prospects || 0) >= 5) return "Pipeline stuck";
  if ((row.renewal_follow_up || 0) >= 10) return "Renewal follow-up";
  if ((row.membership_pct_tay ?? 1) < .015) return "Low TAY penetration";
  if ((row.yoy_pct || 0) > .04) return "Growth momentum";
  return "Monitor";
}

function signalTone(signal) {
  if (signal.includes("Decline") || signal.includes("risk") || signal.includes("stuck")) return "bad";
  if (signal.includes("follow-up") || signal.includes("Low")) return "warn";
  if (signal.includes("Growth")) return "good";
  return "warn";
}

function priorityScore(row) {
  const lowTay = row.membership_pct_tay == null ? 0 : Math.max(0, .03 - row.membership_pct_tay) * 600;
  const decline = Math.max(0, -(row.yoy_pct || 0)) * 150;
  const health = (row.metric_0_2_rate || 0) * 30;
  const pipeline = Math.min(18, (row.stuck_prospects || 0) * 2 + (row.unscheduled_prospects || 0) * .4);
  const renewals = Math.min(18, (row.renewal_follow_up || 0) * .7 + (row.dropping_renewals || 0) * 2);
  return lowTay + decline + health + pipeline + renewals;
}

function buildRows() {
  const monday = mondayRollups();
  state.rows = (state.dashboard?.dashboard?.districts || []).map((row) => {
    const rollup = monday.get(row.district) || {};
    const membershipPctTay = rollup.tay ? numeric(row.members) / rollup.tay : null;
    const atRiskRate = row.units ? (row.at_risk_units || 0) / row.units : null;
    const enriched = {
      ...row,
      ...rollup,
      at_risk_rate: row.at_risk_rate ?? atRiskRate,
      membership_pct_tay: membershipPctTay,
    };
    enriched.signal = signalFor(enriched);
    enriched.priority_score = priorityScore(enriched);
    return enriched;
  });
}

function currentRows() {
  const district = document.getElementById("districtSelect").value;
  const status = document.getElementById("statusSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  return state.rows.filter((row) => {
    const haystack = [row.district, row.status, row.signal, row.field_exec, row.district_commissioner].join(" ").toLowerCase();
    return (!district || row.district === district)
      && (!status || row.status === status)
      && (!q || haystack.includes(q));
  });
}

function sortedRows() {
  const sort = document.getElementById("sortSelect").value;
  const rows = [...currentRows()];
  const comparers = {
    focus: (a, b) => b.priority_score - a.priority_score,
    members: (a, b) => (b.members || 0) - (a.members || 0),
    tay: (a, b) => (a.membership_pct_tay ?? 99) - (b.membership_pct_tay ?? 99),
    yoy: (a, b) => (a.yoy_pct || 0) - (b.yoy_pct || 0),
    risk: (a, b) => (b.metric_0_2_rate || 0) - (a.metric_0_2_rate || 0),
    pipeline: (a, b) => (b.prospects || 0) - (a.prospects || 0),
    renewal: (a, b) => (b.renewal_follow_up || 0) - (a.renewal_follow_up || 0),
  };
  rows.sort((comparers[sort] || comparers.focus));
  return rows;
}

function councilTaySummary() {
  const members = numeric(state.dashboard?.dashboard?.council?.members);
  const tay = (state.monday?.boards?.schools?.rows || []).reduce((total, row) => total + numeric(row.tay), 0);
  return { members, tay, pct: tay ? members / tay : null };
}

function renderMeta() {
  const generatedAt = state.dashboard?.generated_at || state.dashboard?.generated_date;
  document.getElementById("generatedDate").textContent = dateLabel(generatedAt);
  const dataDate = new Date(`${state.dashboard?.generated_date}T00:00:00`);
  const dataLabel = Number.isNaN(dataDate.getTime())
    ? state.dashboard?.generated_date
    : centralDate.format(dataDate);
  document.getElementById("titleDataDate").textContent = `Data current as of ${dataLabel}`;
}

function renderControls() {
  const selectedDistrict = document.getElementById("districtSelect").value;
  const selectedStatus = document.getElementById("statusSelect").value;
  const districts = officialDistricts().sort((a, b) => a.localeCompare(b));
  const statuses = [...new Set(state.rows.map((row) => row.status).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${
    districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
  document.getElementById("statusSelect").innerHTML = `<option value="">All statuses</option>${
    statuses.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join("")
  }`;
  document.getElementById("districtSelect").value = districts.includes(selectedDistrict) ? selectedDistrict : "";
  document.getElementById("statusSelect").value = statuses.includes(selectedStatus) ? selectedStatus : "";
}

function weighted(rows, key, weightKey = "units") {
  const total = rows.reduce((sum, row) => sum + (row[key] == null ? 0 : numeric(row[weightKey])), 0);
  if (!total) return null;
  return rows.reduce((sum, row) => sum + ((row[key] || 0) * numeric(row[weightKey])), 0) / total;
}

function renderKpis() {
  const rows = currentRows();
  const council = state.dashboard?.dashboard?.council || {};
  const tay = councilTaySummary();
  const members = rows.reduce((sum, row) => sum + numeric(row.members), 0);
  const yoyDelta = rows.reduce((sum, row) => sum + numeric(row.yoy_delta), 0);
  const atRisk = rows.reduce((sum, row) => sum + numeric(row.at_risk_units), 0);
  const units = rows.reduce((sum, row) => sum + numeric(row.units), 0);
  const prospects = rows.reduce((sum, row) => sum + numeric(row.prospects), 0);
  const stuck = rows.reduce((sum, row) => sum + numeric(row.stuck_prospects), 0);
  const renewalFollowUp = rows.reduce((sum, row) => sum + numeric(row.renewal_follow_up), 0);
  const declining = rows.filter((row) => (row.yoy_pct || 0) < 0).length;

  const tiles = [
    ["Youth", n(members), `${signed(yoyDelta)} versus last year`, yoyDelta < 0 ? "warning" : "good"],
    ["Youth / TAY", p(tay.pct), `${n(tay.members)} youth of ${n(tay.tay)} TAY`, "teal"],
    ["Declining Districts", n(declining), `${n(rows.length)} official districts in view`, declining ? "warning" : "good"],
    ["At-Risk Units", n(atRisk), `${p(atRisk / Math.max(1, units))} of ${n(units)} units`, atRisk ? "danger" : "good"],
    ["Hot Prospects", n(prospects), `${n(stuck)} stuck`, stuck ? "warning" : "good"],
    ["Renewal Follow-Up", n(renewalFollowUp), `${p(weighted(rows, "not_renewed_pct") || council.not_renewed_pct)} not renewed metric`, renewalFollowUp ? "warning" : "good"],
  ];

  document.getElementById("membershipKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function renderPriorityBars() {
  const rows = sortedRows();
  const groups = serviceAreaGroups(rows);
  const summaries = groups.map((service) => serviceSummary(service.rows));
  const max = Math.max(1, ...rows.map((row) => row.priority_score || 0), ...summaries.map((row) => row.priority_score || 0));
  document.getElementById("priorityCount").textContent = `${n(rows.length)} districts`;
  document.getElementById("priorityBars").innerHTML = groups.map((service) => {
    const open = forceOpenGroups() || serviceIsOpen(service.service_area);
    const summary = serviceSummary(service.rows);
    return `
      <div class="bar-row service-bar-row">
        <div class="bar-label">
          <button class="service-toggle" type="button" data-service-area="${esc(service.service_area)}" aria-expanded="${open}">
            <span class="disclosure">${open ? "-" : "+"}</span>
            <span><strong>${esc(service.service_area)}</strong><span>${n(service.rows.length)} districts · ${esc(service.field_director || "No field director")}</span></span>
          </button>
        </div>
        <div class="meter"><div class="meter-fill risk" style="width:${Math.min(100, Math.max(2, (summary.priority_score / max) * 100))}%"></div></div>
        <div class="bar-value">${p(summary.membership_pct_tay)}<div class="subtle">${n(summary.at_risk_units)} at risk</div></div>
      </div>
      ${open ? service.rows.map((row) => `
        <div class="bar-row">
          <div class="bar-label">${esc(row.district)}<span>${esc(row.signal)} · ${n(row.members)} youth · ${signed(row.yoy_pct, p)} YoY</span></div>
          <div class="meter"><div class="meter-fill risk" style="width:${Math.min(100, Math.max(2, (row.priority_score / max) * 100))}%"></div></div>
          <div class="bar-value">${p(row.membership_pct_tay)}<div class="subtle">${n(row.at_risk_units)} at risk</div></div>
        </div>
      `).join("") : ""}
    `;
  }).join("") || '<div class="empty-state">No matching districts.</div>';
}

function renderTayBars() {
  const rows = [...currentRows()].sort((a, b) => (a.membership_pct_tay ?? 99) - (b.membership_pct_tay ?? 99));
  const groups = serviceAreaGroups(rows);
  const summaries = groups.map((service) => serviceSummary(service.rows));
  const max = Math.max(.01, ...rows.map((row) => row.membership_pct_tay || 0), ...summaries.map((row) => row.membership_pct_tay || 0));
  document.getElementById("tayCount").textContent = `${n(rows.length)} districts`;
  document.getElementById("tayBars").innerHTML = groups.map((service) => {
    const open = forceOpenGroups() || serviceIsOpen(service.service_area);
    const summary = serviceSummary(service.rows);
    return `
      <div class="bar-row service-bar-row">
        <div class="bar-label">
          <button class="service-toggle" type="button" data-service-area="${esc(service.service_area)}" aria-expanded="${open}">
            <span class="disclosure">${open ? "-" : "+"}</span>
            <span><strong>${esc(service.service_area)}</strong><span>${n(summary.members)} youth from ${n(summary.tay)} attributed TAY · ${n(service.rows.length)} districts</span></span>
          </button>
        </div>
        <div class="meter"><div class="meter-fill good" style="width:${Math.min(100, Math.max(2, ((summary.membership_pct_tay || 0) / max) * 100))}%"></div></div>
        <div class="bar-value">${p(summary.membership_pct_tay)}</div>
      </div>
      ${open ? service.rows.map((row) => `
        <div class="bar-row">
          <div class="bar-label">${esc(row.district)}<span>${n(row.members)} youth from ${n(row.tay)} attributed TAY · ${n(row.schools)} schools</span></div>
          <div class="meter"><div class="meter-fill good" style="width:${Math.min(100, Math.max(2, ((row.membership_pct_tay || 0) / max) * 100))}%"></div></div>
          <div class="bar-value">${p(row.membership_pct_tay)}</div>
        </div>
      `).join("") : ""}
    `;
  }).join("") || '<div class="empty-state">No matching districts.</div>';
}

function renderSignals() {
  const rows = currentRows();
  const lowTay = [...rows].filter((row) => row.membership_pct_tay != null).sort((a, b) => a.membership_pct_tay - b.membership_pct_tay)[0];
  const decline = [...rows].sort((a, b) => (a.yoy_pct || 0) - (b.yoy_pct || 0))[0];
  const risk = [...rows].sort((a, b) => (b.metric_0_2_rate || 0) - (a.metric_0_2_rate || 0))[0];
  const schools = [...rows].sort((a, b) => (b.schools_without_unit || 0) - (a.schools_without_unit || 0))[0];
  const cards = [
    lowTay ? ["Lowest market penetration", `${lowTay.district}: ${p(lowTay.membership_pct_tay)} youth/TAY across ${n(lowTay.schools)} schools.`] : ["Lowest market penetration", "No TAY data in this view."],
    decline ? ["Largest YoY decline", `${decline.district}: ${signed(decline.yoy_delta)} youth, ${signed(decline.yoy_pct, p)} YoY.`] : ["Largest YoY decline", "No matching districts."],
    risk ? ["Highest unit health risk", `${risk.district}: ${p(risk.metric_0_2_rate)} of units are metric 0-2.`] : ["Highest unit health risk", "No matching districts."],
    schools ? ["Most schools without associated unit", `${schools.district}: ${n(schools.schools_without_unit)} of ${n(schools.schools)} school rows.`] : ["Most schools without associated unit", "No matching school rows."],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderPipelineSignals() {
  const rows = currentRows();
  const prospects = rows.reduce((sum, row) => sum + numeric(row.prospects), 0);
  const stuck = rows.reduce((sum, row) => sum + numeric(row.stuck_prospects), 0);
  const unscheduled = rows.reduce((sum, row) => sum + numeric(row.unscheduled_prospects), 0);
  const renewalFollowUp = rows.reduce((sum, row) => sum + numeric(row.renewal_follow_up), 0);
  const dropping = rows.reduce((sum, row) => sum + numeric(row.dropping_renewals), 0);
  const noUnit = rows.reduce((sum, row) => sum + numeric(row.schools_without_unit), 0);
  const schools = rows.reduce((sum, row) => sum + numeric(row.schools), 0);
  const cards = [
    [`${n(prospects)} hot prospects`, `${n(stuck)} stuck and ${n(unscheduled)} unscheduled.`],
    [`${n(renewalFollowUp)} renewal rows need follow-up`, `${n(dropping)} renewal rows marked dropping.`],
    [`${n(noUnit)} school rows without units`, `${p(noUnit / Math.max(1, schools))} of school rows in view.`],
    [`${n(rows.length)} districts in view`, "Filters update this page across charts, signals, and table."],
  ];

  document.getElementById("pipelineSignals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderRows() {
  const rows = sortedRows();
  const groups = serviceAreaGroups(rows);
  document.getElementById("rowCount").textContent = `${n(rows.length)} districts`;
  document.getElementById("districtRows").innerHTML = groups.map((service) => {
    const open = forceOpenGroups() || serviceIsOpen(service.service_area);
    const summary = serviceSummary(service.rows);
    return `
      <tr class="service-area-row">
        <td>
          <button class="service-toggle" type="button" data-service-area="${esc(service.service_area)}" aria-expanded="${open}">
            <span class="disclosure">${open ? "-" : "+"}</span>
            <span><strong>${esc(service.service_area)}</strong><span>${n(service.rows.length)} districts · ${esc(service.field_director || "No field director")}</span></span>
          </button>
        </td>
        <td><span class="status">Service Area</span></td>
        <td class="num">${n(summary.members)}</td>
        <td class="num">${signed(summary.yoy_delta)}<div class="subtle">${signed(summary.yoy_pct, p)}</div></td>
        <td class="num"><span class="status ${summary.membership_pct_tay == null ? "warn" : summary.membership_pct_tay >= .03 ? "good" : summary.membership_pct_tay >= .015 ? "warn" : "bad"}">${p(summary.membership_pct_tay)}</span></td>
        <td class="num">${n(summary.schools)}</td>
        <td class="num">${n(summary.schools_without_unit)}</td>
        <td class="num">${n(summary.units)}</td>
        <td class="num">${n(summary.at_risk_units)}<div class="subtle">${p(summary.metric_0_2_rate)}</div></td>
        <td class="num">${n(summary.healthy_units)}<div class="subtle">${p(summary.metric_4_5_rate)}</div></td>
        <td class="num">${n(summary.prospects)}</td>
        <td class="num">${n(summary.stuck_prospects)}</td>
        <td class="num">${n(summary.renewal_follow_up)}</td>
        <td><span class="status warn">Rollup</span></td>
      </tr>
      ${open ? service.rows.map((row) => `
        <tr>
          <td><strong>${esc(row.district)}</strong><div class="subtle">${esc(row.field_exec || "")}</div></td>
          <td><span class="status ${row.status === "On Track" ? "good" : row.status === "Needs Attention" ? "bad" : "warn"}">${esc(row.status || "n/a")}</span></td>
          <td class="num">${n(row.members)}</td>
          <td class="num">${signed(row.yoy_delta)}<div class="subtle">${signed(row.yoy_pct, p)}</div></td>
          <td class="num"><span class="status ${row.membership_pct_tay == null ? "warn" : row.membership_pct_tay >= .03 ? "good" : row.membership_pct_tay >= .015 ? "warn" : "bad"}">${p(row.membership_pct_tay)}</span></td>
          <td class="num">${n(row.schools)}</td>
          <td class="num">${n(row.schools_without_unit)}</td>
          <td class="num">${n(row.units)}</td>
          <td class="num">${n(row.at_risk_units)}<div class="subtle">${p(row.metric_0_2_rate)}</div></td>
          <td class="num">${n(row.healthy_units)}<div class="subtle">${p(row.metric_4_5_rate)}</div></td>
          <td class="num">${n(row.prospects)}</td>
          <td class="num">${n(row.stuck_prospects)}</td>
          <td class="num">${n(row.renewal_follow_up)}</td>
          <td><span class="status ${signalTone(row.signal)}">${esc(row.signal)}</span></td>
        </tr>
      `).join("") : ""}
    `;
  }).join("") || '<tr><td colspan="14"><div class="empty-state">No matching districts.</div></td></tr>';
}

function renderAll() {
  renderControls();
  renderKpis();
  renderPriorityBars();
  renderSignals();
  renderTayBars();
  renderPipelineSignals();
  renderRows();
}

function bindEvents() {
  ["districtSelect", "statusSelect", "sortSelect", "searchInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
  });
  ["priorityBars", "tayBars", "districtRows"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (event) => {
      const button = event.target.closest("[data-service-area]");
      if (!button) return;
      const service = button.dataset.serviceArea;
      if (state.openServiceAreas.has(service)) state.openServiceAreas.delete(service);
      else state.openServiceAreas.add(service);
      renderAll();
    });
  });
}

async function init() {
  const [dashboardResponse, mondayResponse] = await Promise.all([
    fetch("data/latest.json", { cache: "no-store" }),
    fetch("data/monday-latest.json", { cache: "no-store" }),
  ]);
  if (!dashboardResponse.ok) throw new Error(`Unable to load dashboard data: ${dashboardResponse.status}`);
  if (!mondayResponse.ok) throw new Error(`Unable to load monday.com data: ${mondayResponse.status}`);
  state.dashboard = await dashboardResponse.json();
  state.monday = await mondayResponse.json();
  buildRows();
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>Membership intelligence data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read the dashboard data files.</p>
    </section>
  `;
});

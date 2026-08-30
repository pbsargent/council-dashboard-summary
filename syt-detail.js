const state = {
  data: null,
  people: [],
  trainingPeople: [],
  codes: {},
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
const today = new Date();
today.setHours(0, 0, 0, 0);

const issueLabels = {
  expired: "Expired",
  next30: "Expires in 0-30 days",
  next90: "Expires in 31-90 days",
  review: "Expired or expiring in 90 days",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
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
  const date = sourceTimestampDate(value);
  return date && !Number.isNaN(date.getTime()) ? viewerTimestamp.format(date) : "n/a";
}

function n(value) {
  return value == null || Number.isNaN(value) ? "n/a" : fmt.format(value);
}

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateLabel(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString() : "n/a";
}

function sytStatus(row) {
  const date = parseDate(row.syt_expires);
  if (row.expired || (date && date < today)) {
    return { key: "expired", label: `Expired ${dateLabel(row.syt_expires)}`, tone: "bad", issue: true };
  }
  if (row.expiring_0_30) {
    return { key: "next30", label: `Expires ${dateLabel(row.syt_expires)}`, tone: "bad", issue: true };
  }
  if (row.expiring_31_90) {
    return { key: "next90", label: `Expires ${dateLabel(row.syt_expires)}`, tone: "warn", issue: true };
  }
  if (!date) {
    return { key: "missing", label: "Missing", tone: "bad", issue: true };
  }
  return { key: "current", label: dateLabel(row.syt_expires), tone: "good", issue: false };
}

function pill(status) {
  return `<span class="status ${status.tone}">${esc(status.label)}</span>`;
}

function isYes(value) {
  return value === true;
}

function codeList(value) {
  return String(value || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function codeName(code) {
  return state.codes[String(code || "").toUpperCase()] || code;
}

function codeLabel(code) {
  const name = codeName(code);
  return name === code ? code : `${code} - ${name}`;
}

function hasCode(row, code) {
  return codeList(row.mandatory_codes).includes(code);
}

function isPack(row) {
  return String(row.unit_type || "").toLowerCase() === "pack";
}

function isTroop(row) {
  return String(row.unit_type || "").toLowerCase() === "troop";
}

function dateStatus(value, required = true) {
  const date = parseDate(value);
  if (!required && !date) return { label: "Not required", tone: "warn", issue: false };
  if (!required && date) return { label: date.toLocaleDateString(), tone: "good", issue: false };
  if (!date) return { label: "Missing", tone: "bad", issue: true };
  if (date < today) return { label: `Expired ${date.toLocaleDateString()}`, tone: "bad", issue: true };
  return { label: date.toLocaleDateString(), tone: "good", issue: false };
}

function completionOrDateStatus(value, required = true) {
  const text = String(value || "").trim().toUpperCase();
  if (!required && !text) return { label: "Not required", tone: "warn", issue: false };
  if (text === "YES") return { label: "Yes", tone: "good", issue: false };
  return dateStatus(value, required);
}

function safetyReadiness(row) {
  const direct = isYes(row.direct_contact);
  const hazard = dateStatus(row.hazardous_weather_expires, direct);
  const balooRequired = isPack(row);
  const balooRecorded = CACOutdoorReadiness.hasBaloo(row);
  const baloo = {
    label: balooRequired ? (balooRecorded ? "Recorded" : "Not recorded") : "Not applicable",
    tone: balooRequired ? (balooRecorded ? "good" : "warn") : "warn",
    issue: balooRequired && !balooRecorded,
  };
  const iolsRequired = CACOutdoorReadiness.isIolsPosition(row);
  const iolsMissing = iolsRequired && !CACOutdoorReadiness.hasIols(row);
  const iols = {
    label: iolsRequired ? (iolsMissing ? `Missing ${codeLabel("S11")}` : "IOLS recorded") : "Not applicable",
    tone: iolsRequired ? (iolsMissing ? "bad" : "good") : "warn",
    issue: iolsMissing,
  };
  const issues = [];
  if (hazard.issue) issues.push("HW");
  if (iols.issue) issues.push("IOLS/S11");
  return { direct, hazard, baloo, iols, issues, balooRequired, iolsRequired };
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

function currentPeople(options = {}) {
  const district = document.getElementById("districtSelect").value;
  const issue = options.ignoreIssue ? "" : document.getElementById("issueSelect").value.trim();
  const unitType = document.getElementById("unitTypeSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return state.people.filter((row) => {
    const status = sytStatus(row);
    const haystack = [
      row.district,
      row.unit,
      row.name,
      row.position,
      row.status,
      row.member_id,
      status.label,
      issueLabels[status.key],
    ].join(" ").toLowerCase();
    const matchesIssue = !issue
      || status.key === issue
      || (issue === "review" && status.issue);

    return ProgramFilter.matchesUnitType(row.unit_type)
      && (!district || row.district === district)
      && (!unitType || row.unit_type === unitType)
      && matchesIssue
      && (!q || haystack.includes(q));
  });
}

function currentSafetyPeople() {
  const district = document.getElementById("districtSelect").value;
  const unitType = document.getElementById("unitTypeSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return state.trainingPeople.filter((row) => {
    const readiness = safetyReadiness(row);
    const haystack = [
      row.district,
      row.unit,
      row.name,
      row.position,
      row.mandatory_codes,
      row.classroom_codes,
      row.online_codes,
      codeList(row.mandatory_codes).map(codeName).join(" "),
      codeList(row.classroom_codes).map(codeName).join(" "),
      codeList(row.online_codes).map(codeName).join(" "),
      readiness.issues.join(" "),
    ].join(" ").toLowerCase();

    return ProgramFilter.matchesUnitType(row.unit_type)
      && (!district || row.district === district)
      && (!unitType || row.unit_type === unitType)
      && (!q || haystack.includes(q));
  });
}

function summarize(rows) {
  const total = rows.length;
  const expired = rows.filter((row) => sytStatus(row).key === "expired").length;
  const next30 = rows.filter((row) => sytStatus(row).key === "next30").length;
  const next90 = rows.filter((row) => sytStatus(row).key === "next90").length;
  const missing = rows.filter((row) => sytStatus(row).key === "missing").length;
  const needsReview = expired + next30 + next90 + missing;
  const current = Math.max(0, total - expired - missing);
  return { total, current, expired, next30, next90, missing, needsReview };
}

function summarizeSafety(rows) {
  const direct = rows.filter((row) => safetyReadiness(row).direct).length;
  const hazardCurrent = rows.filter((row) => safetyReadiness(row).direct && !safetyReadiness(row).hazard.issue).length;
  const balooRequired = rows.filter((row) => safetyReadiness(row).balooRequired).length;
  const balooIssues = rows.filter((row) => safetyReadiness(row).baloo.issue).length;
  const iolsRequired = rows.filter((row) => safetyReadiness(row).iolsRequired).length;
  const iolsIssues = rows.filter((row) => safetyReadiness(row).iols.issue).length;
  const anyIssues = rows.filter((row) => safetyReadiness(row).issues.length).length;
  return { direct, hazardCurrent, balooRequired, balooIssues, iolsRequired, iolsIssues, anyIssues };
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
  const selectedDistrict = document.getElementById("districtSelect").value;
  const districts = [...new Set(state.people.filter((row) => ProgramFilter.matchesUnitType(row.unit_type)).map((row) => row.district).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${
    districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
  document.getElementById("districtSelect").value = districts.includes(selectedDistrict) ? selectedDistrict : "";
  const typeSelect = document.getElementById("unitTypeSelect");
  if (!ProgramFilter.isCouncil()) {
    typeSelect.value = ProgramFilter.getType();
    typeSelect.disabled = true;
  } else {
    typeSelect.disabled = false;
    typeSelect.value = "";
  }
}

function renderKpis() {
  const summary = summarize(currentPeople());
  const safety = summarizeSafety(currentSafetyPeople());
  const activeIssue = document.getElementById("issueSelect").value.trim();
  const issueCount = activeIssue === "expired"
    ? summary.expired
    : activeIssue === "next30"
      ? summary.next30
      : activeIssue === "next90"
        ? summary.next90
        : activeIssue === "review"
          ? summary.needsReview
          : summary.needsReview;
  const tiles = [
    ["SYT Current", p(summary.current / Math.max(1, summary.total)), `${n(summary.current)} of ${n(summary.total)} rows`, summary.needsReview ? "warning" : "good"],
    ["Expired", n(summary.expired), "Expired according to the workbook SYT tab", summary.expired ? "danger" : "good"],
    ["Expires 0-30", n(summary.next30), "Renewal action needed soon", summary.next30 ? "danger" : "good"],
    ["Expires 31-90", n(summary.next90), "Upcoming renewal watch list", summary.next90 ? "warning" : "good"],
    ["Needs Review", n(issueCount), activeIssue ? "Rows matching the selected filter" : "Expired, missing, or expiring in 90 days", issueCount ? "danger" : "good"],
    ["Hazardous Weather", p(safety.hazardCurrent / Math.max(1, safety.direct)), `${n(safety.direct - safety.hazardCurrent)} direct-contact issues`, safety.direct - safety.hazardCurrent ? "danger" : "good"],
    ["BALOO Recorded", n(safety.balooRequired - safety.balooIssues), `${n(safety.balooRequired)} Pack leader rows`, "good"],
    ["IOLS Issues", n(safety.iolsIssues), `${n(safety.iolsRequired)} Scoutmaster/ASM rows`, safety.iolsIssues ? "warning" : "good"],
  ];

  document.getElementById("sytKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function renderSytDonut() {
  const activeIssue = document.getElementById("issueSelect").value.trim();
  const summary = summarize(activeIssue ? currentPeople({ ignoreIssue: true }) : currentPeople());
  const baseCount = summary.total;
  const needsReview = activeIssue === "expired"
    ? summary.expired
    : activeIssue === "next30"
      ? summary.next30
      : activeIssue === "next90"
        ? summary.next90
        : summary.needsReview;
  const ready = Math.max(0, baseCount - needsReview);
  const reviewPct = baseCount ? needsReview / baseCount : 0;
  const readyPct = baseCount ? ready / baseCount : 0;
  const circumference = 100;
  const readyArc = readyPct * circumference;
  const reviewArc = Math.max(0, circumference - readyArc);

  document.getElementById("sytDonut").innerHTML = `
    <div class="donut-layout">
      <div class="donut-figure" role="img" aria-label="${esc(n(needsReview))} of ${esc(n(baseCount))} SYT rows need review">
        <svg class="donut-svg" viewBox="0 0 42 42" aria-hidden="true">
          <circle class="donut-track" cx="21" cy="21" r="15.9155"></circle>
          <circle class="donut-segment trained" cx="21" cy="21" r="15.9155" stroke-dasharray="${readyArc} ${circumference - readyArc}" stroke-dashoffset="25"></circle>
          <circle class="donut-segment untrained" cx="21" cy="21" r="15.9155" stroke-dasharray="${reviewArc} ${circumference - reviewArc}" stroke-dashoffset="${25 - readyArc}"></circle>
        </svg>
        <div class="donut-center">
          <strong>${esc(p(activeIssue ? reviewPct : readyPct))}</strong>
          <span>${esc(activeIssue ? "selected" : "beyond 90 days")}</span>
        </div>
      </div>
      <div class="donut-legend">
        ${activeIssue ? "" : `
          <div class="legend-row">
            <span class="legend-swatch trained"></span>
            <span>Current beyond 90 days</span>
            <strong>${esc(n(ready))}</strong>
          </div>
        `}
        <div class="legend-row">
          <span class="legend-swatch untrained"></span>
          <span>${esc(activeIssue ? issueLabels[activeIssue] : "Needs review")}</span>
          <strong>${esc(n(needsReview))}</strong>
        </div>
        <p>${esc(`${n(needsReview)} of ${n(baseCount)} SYT rows match this review bucket`)}</p>
      </div>
    </div>
  `;
}

function renderRollup() {
  const rows = currentPeople();
  const byDistrict = new Map();
  for (const row of rows) {
    const key = row.district || "Council";
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key).push(row);
  }
  const rollups = [...byDistrict.entries()]
    .map(([district, people]) => ({ district, ...summarize(people), ...(people[0] || {}) }))
    .sort((a, b) => b.needsReview - a.needsReview || a.district.localeCompare(b.district));

  document.querySelector(".training-rollup thead tr").innerHTML = [
    "District",
    "Rows",
    "Needs Review",
    "Current",
    "Expired",
    "0-30",
    "31-90",
  ].map((label, index) => `<th${index ? ' class="num"' : ""}>${esc(label)}</th>`).join("");

  document.getElementById("rollupCount").textContent = `${rollups.length} groups`;
  const forceOpen = Boolean(document.getElementById("districtSelect").value || document.getElementById("searchInput").value.trim());
  document.getElementById("rollupRows").innerHTML = serviceAreaGroups(rollups).map((service) => {
    const summary = summarize(service.rows.flatMap((row) => byDistrict.get(row.district) || []));
    const open = forceOpen || state.openServiceAreas.has(service.name);
    const serviceRow = `
    <tr class="service-area-row">
      <td><button class="service-toggle" type="button" data-service-area="${esc(service.name)}"><span class="disclosure">${open ? "-" : "+"}</span><strong>${esc(service.name)}</strong></button><div class="subtle">${n(service.rows.length)} districts · ${esc(service.fieldDirector || "No field director")}</div></td>
      <td class="num">${n(summary.total)}</td>
      <td class="num"><span class="status ${summary.needsReview ? "bad" : "good"}">${n(summary.needsReview)}</span></td>
      <td class="num">${p(summary.current / Math.max(1, summary.total))}</td>
      <td class="num"><span class="status ${summary.expired ? "bad" : "good"}">${n(summary.expired)}</span></td>
      <td class="num"><span class="status ${summary.next30 ? "bad" : "good"}">${n(summary.next30)}</span></td>
      <td class="num"><span class="status ${summary.next90 ? "warn" : "good"}">${n(summary.next90)}</span></td>
    </tr>`;
    const districtRows = open ? service.rows.map((row) => `
    <tr>
      <td><strong>${esc(row.district)}</strong></td>
      <td class="num">${n(row.total)}</td>
      <td class="num"><span class="status ${row.needsReview ? "bad" : "good"}">${n(row.needsReview)}</span></td>
      <td class="num">${p(row.current / Math.max(1, row.total))}</td>
      <td class="num"><span class="status ${row.expired ? "bad" : "good"}">${n(row.expired)}</span></td>
      <td class="num"><span class="status ${row.next30 ? "bad" : "good"}">${n(row.next30)}</span></td>
      <td class="num"><span class="status ${row.next90 ? "warn" : "good"}">${n(row.next90)}</span></td>
    </tr>
  `).join("") : "";
    return serviceRow + districtRows;
  }).join("") || '<tr><td colspan="7"><div class="empty-state">No matching SYT rows.</div></td></tr>';
}

function renderSignals() {
  const rows = currentPeople();
  const summary = summarize(rows);
  const safety = summarizeSafety(currentSafetyPeople());
  const issueRows = rows
    .filter((row) => sytStatus(row).issue)
    .sort((a, b) => parseDate(a.syt_expires) - parseDate(b.syt_expires))
    .slice(0, 4);
  const cards = [
    [`SYT tab coverage`, `${n(summary.total)} workbook SYT rows in the filtered view.`],
    [`${n(summary.expired)} expired`, "Rows flagged as expired in the workbook SYT tab."],
    [`${n(summary.next30)} expire in 0-30 days`, "Near-term renewals that are not expired yet."],
    [`${n(summary.next90)} expire in 31-90 days`, "Upcoming renewals to watch before they become urgent."],
    [`Outdoor safety`, `${n(safety.direct - safety.hazardCurrent)} Hazardous Weather and ${n(safety.iolsIssues)} IOLS position-training issues; ${n(safety.balooRequired - safety.balooIssues)} BALOO qualifications are recorded.`],
    [`Top follow-up`, issueRows.map((row) => `${row.name} (${sytStatus(row).label})`).join(", ") || "No SYT rows need review in this view."],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderSafetyRows() {
  const allRows = currentSafetyPeople()
    .filter((row) => safetyReadiness(row).issues.length)
    .sort((a, b) => {
      const aReady = safetyReadiness(a);
      const bReady = safetyReadiness(b);
      return bReady.issues.length - aReady.issues.length
        || String(a.district || "").localeCompare(String(b.district || ""))
        || String(a.name || "").localeCompare(String(b.name || ""));
    });
  const rows = allRows;

  document.getElementById("safetyCount").textContent = `${n(rows.length)} issue rows`;
  document.getElementById("safetyRows").innerHTML = rows.map((row) => {
    const readiness = safetyReadiness(row);
    return `
      <tr>
        <td>${esc(row.district || "")}</td>
        <td>${esc(row.unit || "")}</td>
        <td><strong>${esc(row.name || "")}</strong></td>
        <td>${esc(row.position || "")}</td>
        <td>${pill(readiness.hazard)}</td>
        <td>${pill(readiness.baloo)}</td>
        <td>${pill(readiness.iols)}</td>
        <td>${esc(readiness.issues.join(", ") || "None")}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="8"><div class="empty-state">No matching outdoor safety issues.</div></td></tr>';
}

function renderPeopleRows() {
  const allRows = currentPeople()
    .sort((a, b) => {
      const aStatus = sytStatus(a);
      const bStatus = sytStatus(b);
      const order = { expired: 0, missing: 1, next30: 2, next90: 3, current: 4 };
      return (order[aStatus.key] ?? 9) - (order[bStatus.key] ?? 9)
        || parseDate(a.syt_expires) - parseDate(b.syt_expires)
        || String(a.district || "").localeCompare(String(b.district || ""))
        || String(a.name || "").localeCompare(String(b.name || ""));
    });
  const rows = allRows;

  document.getElementById("peopleTitle").textContent = "SYT Expiration Detail";
  document.querySelector(".detail-table thead tr").innerHTML = `
    <th>District</th>
    <th>Unit</th>
    <th>Name</th>
    <th>Position</th>
    <th>Status</th>
    <th>SYT Expires</th>
    <th>Took Y01</th>
    <th>Member ID</th>
    <th>Key</th>
  `;
  document.getElementById("peopleCount").textContent = `${n(rows.length)} rows`;
  document.getElementById("peopleRows").innerHTML = rows.map((row) => {
    const status = sytStatus(row);
    return `
      <tr>
        <td>${esc(row.district || "")}</td>
        <td>${esc(row.unit || "")}</td>
        <td><strong>${esc(row.name || "")}</strong></td>
        <td>${esc(row.position || "")}</td>
        <td>${pill(status)}</td>
        <td>${esc(dateLabel(row.syt_expires))}</td>
        <td>${esc(dateLabel(row.took_y01))}</td>
        <td>${esc(row.member_id || "")}</td>
        <td>${esc(row.key || "")}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="9"><div class="empty-state">No matching SYT rows.</div></td></tr>';
}

function renderAll() {
  renderKpis();
  renderSytDonut();
  renderRollup();
  renderSignals();
  renderPeopleRows();
  renderSafetyRows();
}

function bindEvents() {
  ["districtSelect", "issueSelect", "unitTypeSelect", "searchInput"].forEach((id) => {
    const control = document.getElementById(id);
    control.addEventListener("input", renderAll);
    control.addEventListener("change", renderAll);
  });
  document.getElementById("rollupRows").addEventListener("click", (event) => {
    const button = event.target.closest(".service-toggle");
    if (!button) return;
    const name = button.dataset.serviceArea;
    if (state.openServiceAreas.has(name)) state.openServiceAreas.delete(name);
    else state.openServiceAreas.add(name);
    renderRollup();
  });
  window.addEventListener("programfilterchange", () => { renderControls(); renderAll(); });
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.people = state.data.dashboard.syt_people || [];
  state.trainingPeople = state.data.dashboard.training_people || [];
  state.codes = state.data.dashboard.training_codes || {};
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>SYT data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p>
    </section>
  `;
});

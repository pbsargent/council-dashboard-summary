const state = {
  data: null,
  people: [],
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

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function yes(value) {
  return value === true;
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

function dateLabel(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function statusPill(value) {
  if (value === true) return '<span class="status good">Yes</span>';
  if (value === false) return '<span class="status bad">No</span>';
  return '<span class="status warn">n/a</span>';
}

function pill(status) {
  return `<span class="status ${status.tone}">${esc(status.label)}</span>`;
}

function codeList(value) {
  return String(value || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function codeName(code) {
  return state.data.dashboard.training_codes?.[String(code || "").toUpperCase()] || code;
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
  if (!required && !date) return { label: "Not required", tone: "warn", issue: false, required: false };
  if (!required && date) return { label: date.toLocaleDateString(), tone: "good", issue: false, required: false };
  if (!date) return { label: "Missing", tone: "bad", issue: true, required: true };
  if (date < today) return { label: `Expired ${date.toLocaleDateString()}`, tone: "bad", issue: true, required: true };
  return { label: date.toLocaleDateString(), tone: "good", issue: false, required: true };
}

function completionOrDateStatus(value, required = true) {
  const text = String(value || "").trim().toUpperCase();
  if (!required && !text) return { label: "Not required", tone: "warn", issue: false, required: false };
  if (text === "YES") return { label: "Yes", tone: "good", issue: false, required };
  return dateStatus(value, required);
}

function safetyReadiness(row) {
  const direct = yes(row.direct_contact);
  const hazard = dateStatus(row.hazardous_weather_expires, direct);
  const balooRequired = direct && isPack(row);
  const baloo = completionOrDateStatus(row.baloo_expires, balooRequired);
  const iolsRequired = direct && isTroop(row);
  const iolsMissing = iolsRequired && hasCode(row, "S11");
  const iols = {
    label: iolsRequired ? (iolsMissing ? `Missing ${codeLabel("S11")}` : `No ${codeLabel("S11")} gap`) : "Not required",
    tone: iolsRequired ? (iolsMissing ? "bad" : "good") : "warn",
    issue: iolsMissing,
    required: iolsRequired,
  };
  return { hazard, baloo, iols };
}

function safetyItem(row, key) {
  return safetyReadiness(row)[key];
}

function safetyFilterMatches(row, key, filterValue) {
  if (!filterValue) return true;
  const item = safetyItem(row, key);
  if (filterValue === "issue") return item.required && item.issue;
  if (filterValue === "current") return item.required && !item.issue;
  if (filterValue === "required") return item.required;
  if (filterValue === "not-required") return !item.required;
  return true;
}

function currentPeople(options = {}) {
  const district = document.getElementById("districtSelect").value;
  const directContact = document.getElementById("directContactSelect").value;
  const trained = options.ignoreTrainingStatus ? "" : document.getElementById("trainedSelect").value;
  const hazard = options.ignoreSafety === "hazard" ? "" : document.getElementById("hazardSelect").value;
  const baloo = options.ignoreSafety === "baloo" ? "" : document.getElementById("balooSelect").value;
  const iols = options.ignoreSafety === "iols" ? "" : document.getElementById("iolsSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return state.people.filter((row) => {
    const safety = safetyReadiness(row);
    const haystack = [
      row.district,
      row.unit,
      row.name,
      row.position,
      row.mandatory_codes,
      row.classroom_codes,
      row.online_codes,
      safety.hazard.label,
      safety.baloo.label,
      safety.iols.label,
      codeList(row.mandatory_codes).map(codeName).join(" "),
      codeList(row.classroom_codes).map(codeName).join(" "),
      codeList(row.online_codes).map(codeName).join(" "),
    ].join(" ").toLowerCase();

    return ProgramFilter.matchesUnitType(row.unit_type)
      && (!district || row.district === district)
      && (!directContact || yes(row.direct_contact) === (directContact === "yes"))
      && (!trained || yes(row.trained) === (trained === "yes"))
      && safetyFilterMatches(row, "hazard", hazard)
      && safetyFilterMatches(row, "baloo", baloo)
      && safetyFilterMatches(row, "iols", iols)
      && (!q || haystack.includes(q));
  });
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
}

function summarize(rows) {
  const total = rows.length;
  const trained = rows.filter((row) => yes(row.trained)).length;
  const direct = rows.filter((row) => yes(row.direct_contact)).length;
  const directTrained = rows.filter((row) => yes(row.direct_contact) && yes(row.trained)).length;
  const directUntrained = rows.filter((row) => yes(row.direct_contact) && row.trained === false).length;
  const hazardRequired = rows.filter((row) => safetyItem(row, "hazard").required).length;
  const hazardIssues = rows.filter((row) => safetyItem(row, "hazard").required && safetyItem(row, "hazard").issue).length;
  const balooRequired = rows.filter((row) => safetyItem(row, "baloo").required).length;
  const balooIssues = rows.filter((row) => safetyItem(row, "baloo").required && safetyItem(row, "baloo").issue).length;
  const iolsRequired = rows.filter((row) => safetyItem(row, "iols").required).length;
  const iolsIssues = rows.filter((row) => safetyItem(row, "iols").required && safetyItem(row, "iols").issue).length;
  return {
    total,
    trained,
    direct,
    directTrained,
    directUntrained,
    hazardRequired,
    hazardIssues,
    balooRequired,
    balooIssues,
    iolsRequired,
    iolsIssues,
  };
}

function renderKpis() {
  const summary = summarize(currentPeople());
  const tiles = [
    ["Leaders", n(summary.total), "Rows from Training tab", "teal"],
    ["Trained", p(summary.trained / Math.max(1, summary.total)), `${n(summary.trained)} trained`, "good"],
    ["Direct Contact", n(summary.direct), "Direct Contact = YES", "warning"],
    ["DC Trained", p(summary.directTrained / Math.max(1, summary.direct)), `${n(summary.directUntrained)} need training`, summary.directUntrained ? "danger" : "good"],
    ["HW Issues", n(summary.hazardIssues), "Direct-contact leaders", summary.hazardIssues ? "danger" : "good"],
    ["BALOO Issues", n(summary.balooIssues), `${n(summary.balooRequired)} pack DC leaders`, summary.balooIssues ? "danger" : "good"],
    ["IOLS Issues", n(summary.iolsIssues), `${n(summary.iolsRequired)} troop DC leaders`, summary.iolsIssues ? "warning" : "good"],
    ["Shown", n(currentPeople().length), "After filters", "teal"],
  ];

  document.getElementById("trainingKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function renderTrainingDonut() {
  const activeTrainingStatus = document.getElementById("trainedSelect").value;
  const summary = summarize(activeTrainingStatus ? currentPeople({ ignoreTrainingStatus: true }) : currentPeople());
  const untrained = Math.max(0, summary.total - summary.trained);
  const trainedPct = summary.total ? summary.trained / summary.total : 0;
  const untrainedPct = summary.total ? untrained / summary.total : 0;
  const centerPct = activeTrainingStatus === "no" ? untrainedPct : trainedPct;
  const centerLabel = activeTrainingStatus === "no" ? "need training" : "trained";
  const circumference = 100;
  const trainedArc = summary.total ? trainedPct * circumference : 0;
  const untrainedArc = summary.total ? Math.max(0, circumference - trainedArc) : 0;

  document.getElementById("trainingDonut").innerHTML = `
    <div class="donut-layout">
      <div class="donut-figure" role="img" aria-label="${esc(n(summary.trained))} trained and ${esc(n(untrained))} untrained leaders in this view">
        <svg class="donut-svg" viewBox="0 0 42 42" aria-hidden="true">
          <circle class="donut-track" cx="21" cy="21" r="15.9155"></circle>
          <circle
            class="donut-segment trained"
            cx="21"
            cy="21"
            r="15.9155"
            stroke-dasharray="${trainedArc} ${circumference - trainedArc}"
            stroke-dashoffset="25"
          ></circle>
          <circle
            class="donut-segment untrained"
            cx="21"
            cy="21"
            r="15.9155"
            stroke-dasharray="${untrainedArc} ${circumference - untrainedArc}"
            stroke-dashoffset="${25 - trainedArc}"
          ></circle>
        </svg>
        <div class="donut-center">
          <strong>${esc(p(centerPct))}</strong>
          <span>${esc(centerLabel)}</span>
        </div>
      </div>
      <div class="donut-legend">
        <div class="legend-row">
          <span class="legend-swatch trained"></span>
          <span>Trained</span>
          <strong>${esc(n(summary.trained))}</strong>
        </div>
        <div class="legend-row">
          <span class="legend-swatch untrained"></span>
          <span>Untrained</span>
          <strong>${esc(n(untrained))}</strong>
        </div>
        <p>${esc(activeTrainingStatus === "no" ? `${n(untrained)} of ${n(summary.total)} matching leaders need training` : `${n(summary.total)} leader rows after filters`)}</p>
      </div>
    </div>
  `;
}

function renderSafetyDonut(key, targetId, label, issueLabel) {
  const rows = currentPeople({ ignoreSafety: key });
  const summary = summarize(rows);
  const required = summary[`${key}Required`];
  const issues = summary[`${key}Issues`];
  const current = Math.max(0, required - issues);
  const currentPct = required ? current / required : 0;
  const issuePct = required ? issues / required : 0;
  const circumference = 100;
  const currentArc = currentPct * circumference;
  const issueArc = Math.max(0, circumference - currentArc);

  document.getElementById(targetId).innerHTML = `
    <div class="donut-layout">
      <div class="donut-figure" role="img" aria-label="${esc(n(current))} current and ${esc(n(issues))} ${esc(issueLabel)} among ${esc(n(required))} required ${esc(label)} rows">
        <svg class="donut-svg" viewBox="0 0 42 42" aria-hidden="true">
          <circle class="donut-track" cx="21" cy="21" r="15.9155"></circle>
          <circle class="donut-segment trained" cx="21" cy="21" r="15.9155" stroke-dasharray="${currentArc} ${circumference - currentArc}" stroke-dashoffset="25"></circle>
          <circle class="donut-segment untrained" cx="21" cy="21" r="15.9155" stroke-dasharray="${issueArc} ${circumference - issueArc}" stroke-dashoffset="${25 - currentArc}"></circle>
        </svg>
        <div class="donut-center">
          <strong>${esc(p(currentPct))}</strong>
          <span>current</span>
        </div>
      </div>
      <div class="donut-legend">
        <div class="legend-row">
          <span class="legend-swatch trained"></span>
          <span>Current</span>
          <strong>${esc(n(current))}</strong>
        </div>
        <div class="legend-row">
          <span class="legend-swatch untrained"></span>
          <span>${esc(issueLabel)}</span>
          <strong>${esc(n(issues))}</strong>
        </div>
        <p>${esc(`${n(required)} required ${label} rows · ${p(issuePct)} need review`)}</p>
      </div>
    </div>
  `;
}

function renderDistrictRows() {
  const rows = currentPeople();
  const byDistrict = new Map();
  for (const row of rows) {
    const key = row.district || "Council";
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key).push(row);
  }
  const rollups = [...byDistrict.entries()]
    .map(([district, people]) => ({ district, ...summarize(people), ...(people[0] || {}) }))
    .sort((a, b) => b.directUntrained - a.directUntrained || a.district.localeCompare(b.district));

  document.getElementById("districtCount").textContent = `${rollups.length} groups`;
  const forceOpen = Boolean(document.getElementById("districtSelect").value || document.getElementById("searchInput").value.trim());
  document.getElementById("districtRows").innerHTML = serviceAreaGroups(rollups).map((service) => {
    const summary = summarize(service.rows.flatMap((row) => byDistrict.get(row.district) || []));
    const open = forceOpen || state.openServiceAreas.has(service.name);
    const serviceRow = `
    <tr class="service-area-row">
      <td><button class="service-toggle" type="button" data-service-area="${esc(service.name)}"><span class="disclosure">${open ? "-" : "+"}</span><strong>${esc(service.name)}</strong></button><div class="subtle">${n(service.rows.length)} districts · ${esc(service.fieldDirector || "No field director")}</div></td>
      <td class="num">${n(summary.total)}</td>
      <td class="num">${p(summary.trained / Math.max(1, summary.total))}</td>
      <td class="num">${n(summary.direct)}</td>
      <td class="num">${p(summary.directTrained / Math.max(1, summary.direct))}</td>
      <td class="num"><span class="status ${summary.directUntrained ? "bad" : "good"}">${n(summary.directUntrained)}</span></td>
    </tr>`;
    const districtRows = open ? service.rows.map((row) => `
    <tr>
      <td><strong>${esc(row.district)}</strong></td>
      <td class="num">${n(row.total)}</td>
      <td class="num">${p(row.trained / Math.max(1, row.total))}</td>
      <td class="num">${n(row.direct)}</td>
      <td class="num">${p(row.directTrained / Math.max(1, row.direct))}</td>
      <td class="num"><span class="status ${row.directUntrained ? "bad" : "good"}">${n(row.directUntrained)}</span></td>
    </tr>
  `).join("") : "";
    return serviceRow + districtRows;
  }).join("") || '<tr><td colspan="6"><div class="empty-state">No matching districts.</div></td></tr>';
}

function renderSignals() {
  const rows = currentPeople();
  const summary = summarize(rows);
  const directUntrained = rows
    .filter((row) => yes(row.direct_contact) && row.trained === false)
    .slice(0, 3);
  const cards = [
    [`${n(summary.directUntrained)} direct-contact leaders not trained`, `${p(summary.directTrained / Math.max(1, summary.direct))} direct-contact completion in the filtered view.`],
    [`${n(summary.hazardIssues)} Hazardous Weather issues`, `${p((summary.hazardRequired - summary.hazardIssues) / Math.max(1, summary.hazardRequired))} current among required direct-contact leaders.`],
    [`${n(summary.balooIssues)} BALOO issues`, `${n(summary.balooRequired)} pack direct-contact leaders require BALOO.`],
    [`${n(summary.iolsIssues)} IOLS issues`, `${n(summary.iolsRequired)} troop direct-contact leaders require IOLS.`],
    [`Top follow-up`, directUntrained.map((row) => row.name).filter(Boolean).join(", ") || "No direct-contact training gaps in the filtered view."],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderPeopleRows() {
  const rows = currentPeople()
    .sort((a, b) => {
      const direct = Number(yes(b.direct_contact)) - Number(yes(a.direct_contact));
      const trained = Number(yes(a.trained)) - Number(yes(b.trained));
      return direct || trained || String(a.district || "").localeCompare(String(b.district || "")) || String(a.name || "").localeCompare(String(b.name || ""));
    })
    .slice(0, 500);

  document.getElementById("peopleCount").textContent = `${n(currentPeople().length)} shown, table limited to ${n(rows.length)}`;
  document.getElementById("peopleRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${esc(row.district || "")}</td>
      <td>${esc(row.unit || "")}</td>
      <td><strong>${esc(row.name || "")}</strong></td>
      <td>${esc(row.position || "")}</td>
      <td>${statusPill(row.trained)}</td>
      <td>${statusPill(row.direct_contact)}</td>
      <td>${esc(row.mandatory_codes || "")}</td>
      <td>${esc(row.classroom_codes || "")}</td>
      <td>${esc(row.online_codes || "")}</td>
      <td>${esc(dateLabel(row.syt_expires))}</td>
      <td>${pill(safetyItem(row, "hazard"))}</td>
      <td>${pill(safetyItem(row, "baloo"))}</td>
      <td>${pill(safetyItem(row, "iols"))}</td>
    </tr>
  `).join("") || '<tr><td colspan="13"><div class="empty-state">No matching leaders.</div></td></tr>';
}

function renderAll() {
  renderKpis();
  renderTrainingDonut();
  renderSafetyDonut("hazard", "hazardDonut", "Hazardous Weather", "Needs review");
  renderSafetyDonut("baloo", "balooDonut", "BALOO", "Needs review");
  renderSafetyDonut("iols", "iolsDonut", "IOLS", "Needs review");
  renderDistrictRows();
  renderSignals();
  renderPeopleRows();
}

function bindEvents() {
  ["districtSelect", "directContactSelect", "trainedSelect", "hazardSelect", "balooSelect", "iolsSelect", "searchInput"].forEach((id) => {
    const control = document.getElementById(id);
    control.addEventListener("input", renderAll);
    control.addEventListener("change", renderAll);
  });
  document.getElementById("districtRows").addEventListener("click", (event) => {
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
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.people = state.data.dashboard.training_people || [];
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>Training data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p>
    </section>
  `;
});

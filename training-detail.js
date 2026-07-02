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

function statusPill(value) {
  if (value === true) return '<span class="status good">Yes</span>';
  if (value === false) return '<span class="status bad">No</span>';
  return '<span class="status warn">n/a</span>';
}

function currentPeople(options = {}) {
  const district = document.getElementById("districtSelect").value;
  const directContact = document.getElementById("directContactSelect").value;
  const trained = options.ignoreTrainingStatus ? "" : document.getElementById("trainedSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return state.people.filter((row) => {
    const haystack = [
      row.district,
      row.unit,
      row.name,
      row.position,
      row.mandatory_codes,
      row.classroom_codes,
      row.online_codes,
    ].join(" ").toLowerCase();

    return (!district || row.district === district)
      && (!directContact || yes(row.direct_contact) === (directContact === "yes"))
      && (!trained || yes(row.trained) === (trained === "yes"))
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
  const districts = [...new Set(state.people.map((row) => row.district).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${
    districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
}

function summarize(rows) {
  const total = rows.length;
  const trained = rows.filter((row) => yes(row.trained)).length;
  const direct = rows.filter((row) => yes(row.direct_contact)).length;
  const directTrained = rows.filter((row) => yes(row.direct_contact) && yes(row.trained)).length;
  const directUntrained = rows.filter((row) => yes(row.direct_contact) && row.trained === false).length;
  const directHazardExpired = rows.filter((row) => {
    if (!yes(row.direct_contact) || !row.hazardous_weather_expires) return false;
    const expires = new Date(row.hazardous_weather_expires);
    return !Number.isNaN(expires.getTime()) && expires < new Date();
  }).length;
  return { total, trained, direct, directTrained, directUntrained, directHazardExpired };
}

function renderKpis() {
  const summary = summarize(currentPeople());
  const tiles = [
    ["Leaders", n(summary.total), "Rows from Training tab", "teal"],
    ["Trained", p(summary.trained / Math.max(1, summary.total)), `${n(summary.trained)} trained`, "good"],
    ["Direct Contact", n(summary.direct), "Direct Contact = YES", "warning"],
    ["DC Trained", p(summary.directTrained / Math.max(1, summary.direct)), `${n(summary.directUntrained)} need training`, summary.directUntrained ? "danger" : "good"],
    ["HW Expired", n(summary.directHazardExpired), "Direct-contact leaders", summary.directHazardExpired ? "danger" : "good"],
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
  const noSyt = rows.filter((row) => !row.syt_expires).length;
  const cards = [
    [`${n(summary.directUntrained)} direct-contact leaders not trained`, `${p(summary.directTrained / Math.max(1, summary.direct))} direct-contact completion in the filtered view.`],
    [`${n(summary.directHazardExpired)} hazardous weather expirations`, "Direct-contact leaders with expired hazardous weather dates."],
    [`${n(noSyt)} missing SYT date`, "Rows in the Training tab without an SYT expiration date."],
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
      <td>${esc(dateLabel(row.hazardous_weather_expires))}</td>
      <td>${esc(dateLabel(row.baloo_expires))}</td>
    </tr>
  `).join("") || '<tr><td colspan="12"><div class="empty-state">No matching leaders.</div></td></tr>';
}

function renderAll() {
  renderKpis();
  renderTrainingDonut();
  renderDistrictRows();
  renderSignals();
  renderPeopleRows();
}

function bindEvents() {
  ["districtSelect", "directContactSelect", "trainedSelect", "searchInput"].forEach((id) => {
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

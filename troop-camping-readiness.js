const state = { data: null, troops: [] };
const fmt = new Intl.NumberFormat("en-US");
const viewerTimestamp = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function n(value) { return fmt.format(value || 0); }

function sourceTimestampDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(text);
  const utcGuess = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utcGuess)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const centralAtGuess = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(utcGuess - (centralAtGuess - utcGuess));
}

function renderMeta() {
  const generated = sourceTimestampDate(state.data.generated_at);
  document.getElementById("generatedDate").textContent = generated && !Number.isNaN(generated.getTime())
    ? viewerTimestamp.format(generated)
    : state.data.generated_date;
  const dataDate = CACOutdoorReadiness.parseDate(state.data.generated_date);
  const label = dataDate
    ? dataDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : state.data.generated_date;
  document.getElementById("titleDataDate").textContent = `Data current as of ${label}`;
}

function renderControls() {
  const districts = [...new Set(state.troops.map((troop) => troop.district))].sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
}

function renderKpis() {
  const zero = state.troops.filter((troop) => troop.qualificationCount === 0).length;
  const one = state.troops.filter((troop) => troop.qualificationCount === 1).length;
  const depth = state.troops.filter((troop) => troop.qualificationCount >= 2).length;
  const hazard = state.troops.filter((troop) => troop.missingHazardousWeather).length;
  const tiles = [
    ["Troops Reviewed", state.troops.length, "Published Troop training rosters", "teal"],
    ["No IOLS", zero, "Position-training gap", zero ? "danger" : "good"],
    ["One IOLS", one, "Single point of failure", one ? "warning" : "good"],
    ["Two+ IOLS", depth, "Preferred leadership depth", "good"],
    ["HW Gaps", hazard, "No current direct-contact record", hazard ? "warning" : "good"],
  ];
  document.getElementById("readinessKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}"><div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(n(value))}</div></div><div class="kpi-sub">${esc(sub)}</div></article>
  `).join("");
}

function currentTroops() {
  const district = document.getElementById("districtSelect").value;
  const status = document.getElementById("statusSelect").value;
  const hazard = document.getElementById("hazardSelect").value;
  const sort = document.getElementById("sortSelect").value;
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  return state.troops.filter((troop) => {
    const matchesStatus = CACOutdoorReadiness.matchesDepthStatus(troop, status);
    const matchesHazard = !hazard || (hazard === "gap" ? troop.missingHazardousWeather : !troop.missingHazardousWeather);
    const haystack = [troop.district, troop.unit, ...troop.qualificationPeople, ...troop.hazardousWeatherPeople].join(" ").toLowerCase();
    return (!district || troop.district === district) && matchesStatus && matchesHazard && (!query || haystack.includes(query));
  }).sort((a, b) => {
    if (sort === "leaders") return a.leaderCount - b.leaderCount || a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber;
    if (sort === "district") return a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber || a.unit.localeCompare(b.unit);
    return b.severity - a.severity || a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber || a.unit.localeCompare(b.unit);
  });
}

function qualificationCell(troop) {
  if (troop.depthStatus.key === "unknown") {
    return '<div class="coverage-cell"><span class="status neutral">Unknown</span><span class="coverage-people">IOLS leadership depth could not be determined from the published roster data.</span></div>';
  }
  const names = troop.qualificationPeople.length
    ? troop.qualificationPeople.join("; ")
    : "No IOLS-trained Scoutmaster or Assistant Scoutmaster appears in the published roster data.";
  return `<div class="coverage-cell"><span class="status ${troop.depthStatus.tone}">${esc(troop.depthStatus.label)} · ${esc(n(troop.qualificationCount))}</span><span class="coverage-people">${esc(names)}</span></div>`;
}

function hazardCell(troop) {
  if (troop.missingHazardousWeather) return '<div class="coverage-cell"><span class="status warn">None current</span><span class="coverage-people">No current direct-contact record appears in the published data.</span></div>';
  return `<div class="coverage-cell"><span class="status good">Current · ${esc(n(troop.hazardousWeatherCount))}</span><span class="coverage-people">${esc(troop.hazardousWeatherPeople.join("; "))}</span></div>`;
}

function recommendedAction(troop) {
  const actions = [];
  if (troop.depthStatus.key === "unknown") actions.push("Verify IOLS training data for this Troop");
  else if (troop.qualificationCount === 0) actions.push("Complete or record IOLS for a Scoutmaster or Assistant Scoutmaster");
  else if (troop.qualificationCount === 1) actions.push("Develop a second IOLS-trained Scoutmaster or Assistant Scoutmaster for continuity");
  if (troop.missingHazardousWeather) actions.push("confirm an attending leader with current Hazardous Weather training");
  if (!actions.length) actions.push("Maintain preferred leadership depth and current training records");
  return `${actions.join("; ")}. Confirm the actual event roster before camping.`;
}

function renderRows() {
  const troops = currentTroops();
  document.getElementById("troopCount").textContent = `${n(troops.length)} troops shown`;
  document.getElementById("troopRows").innerHTML = troops.map((troop) => {
    const signals = [
      `<span class="status ${troop.depthStatus.tone}">${esc(troop.depthStatus.shortLabel)}</span>`,
      troop.missingHazardousWeather ? '<span class="status warn">HW gap</span>' : "",
    ].filter(Boolean).join("");
    return `<tr>
      <td><strong>${esc(troop.district)}</strong></td>
      <td><div class="troop-identity"><strong>${esc(troop.unit)}</strong><span>${esc(n(troop.leaderCount))} registered leaders · ${esc(n(troop.directLeaderCount))} direct-contact</span></div></td>
      <td><div class="readiness-missing">${signals}</div></td>
      <td>${qualificationCell(troop)}</td>
      <td>${hazardCell(troop)}</td>
      <td><span class="action-copy">${esc(recommendedAction(troop))}</span></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6"><div class="empty-state">No troops match the selected filters.</div></td></tr>';
}

function bindEvents() {
  ["districtSelect", "statusSelect", "hazardSelect", "sortSelect", "searchInput"].forEach((id) => document.getElementById(id).addEventListener("input", renderRows));
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.troops = CACOutdoorReadiness.buildUnits(state.data.dashboard.training_people || [], "Troop", state.data.generated_date);
  renderMeta();
  renderControls();
  renderKpis();
  bindEvents();
  renderRows();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `<section class="panel"><h1>Troop readiness data did not load</h1><p>${esc(error.message)}</p><p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p></section>`;
});

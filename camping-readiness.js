const state = { data: null, packs: [] };
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
  const districts = [...new Set(state.packs.map((pack) => pack.district))].sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
}

function renderKpis() {
  const zero = state.packs.filter((pack) => pack.qualificationCount === 0).length;
  const one = state.packs.filter((pack) => pack.qualificationCount === 1).length;
  const depth = state.packs.filter((pack) => pack.qualificationCount >= 2).length;
  const hazard = state.packs.filter((pack) => pack.missingHazardousWeather).length;
  const tiles = [
    ["Packs Reviewed", state.packs.length, "Published Pack training rosters", "teal"],
    ["No BALOO", zero, "Required coverage gap", zero ? "danger" : "good"],
    ["One BALOO", one, "Minimum coverage; single point of failure", one ? "warning" : "good"],
    ["Two+ BALOO", depth, "Preferred leadership depth", "good"],
    ["HW Gaps", hazard, "No current direct-contact record", hazard ? "warning" : "good"],
  ];
  document.getElementById("readinessKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}"><div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(n(value))}</div></div><div class="kpi-sub">${esc(sub)}</div></article>
  `).join("");
}

function currentPacks() {
  const district = document.getElementById("districtSelect").value;
  const status = document.getElementById("statusSelect").value;
  const hazard = document.getElementById("hazardSelect").value;
  const sort = document.getElementById("sortSelect").value;
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  return state.packs.filter((pack) => {
    const matchesStatus = CACOutdoorReadiness.matchesDepthStatus(pack, status);
    const matchesHazard = !hazard || (hazard === "gap" ? pack.missingHazardousWeather : !pack.missingHazardousWeather);
    const haystack = [pack.district, pack.unit, ...pack.qualificationPeople, ...pack.hazardousWeatherPeople].join(" ").toLowerCase();
    return (!district || pack.district === district) && matchesStatus && matchesHazard && (!query || haystack.includes(query));
  }).sort((a, b) => {
    if (sort === "leaders") return a.leaderCount - b.leaderCount || a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber;
    if (sort === "district") return a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber || a.unit.localeCompare(b.unit);
    return b.severity - a.severity || a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber || a.unit.localeCompare(b.unit);
  });
}

function qualificationCell(pack) {
  if (pack.depthStatus.key === "unknown") {
    return '<div class="coverage-cell"><span class="status neutral">Unknown</span><span class="coverage-people">BALOO leadership depth could not be determined from the published roster data.</span></div>';
  }
  const names = pack.qualificationPeople.length
    ? pack.qualificationPeople.join("; ")
    : "No BALOO-qualified leader appears in the published roster data.";
  return `<div class="coverage-cell"><span class="status ${pack.depthStatus.tone}">${esc(pack.depthStatus.label)} · ${esc(n(pack.qualificationCount))}</span><span class="coverage-people">${esc(names)}</span></div>`;
}

function hazardCell(pack) {
  if (pack.missingHazardousWeather) return '<div class="coverage-cell"><span class="status warn">None current</span><span class="coverage-people">No current direct-contact record appears in the published data.</span></div>';
  return `<div class="coverage-cell"><span class="status good">Current · ${esc(n(pack.hazardousWeatherCount))}</span><span class="coverage-people">${esc(pack.hazardousWeatherPeople.join("; "))}</span></div>`;
}

function recommendedAction(pack) {
  const actions = [];
  if (pack.depthStatus.key === "unknown") actions.push("Verify BALOO training data for this Pack");
  else if (pack.qualificationCount === 0) actions.push("Recruit or train a registered adult in BALOO");
  else if (pack.qualificationCount === 1) actions.push("Develop a second BALOO-qualified leader for continuity");
  if (pack.missingHazardousWeather) actions.push("confirm an attending leader with current Hazardous Weather training");
  if (!actions.length) actions.push("Maintain preferred leadership depth and current training records");
  return `${actions.join("; ")}. Confirm the actual event roster before camping.`;
}

function renderRows() {
  const packs = currentPacks();
  document.getElementById("packCount").textContent = `${n(packs.length)} packs shown`;
  document.getElementById("packRows").innerHTML = packs.map((pack) => {
    const signals = [
      `<span class="status ${pack.depthStatus.tone}">${esc(pack.depthStatus.shortLabel)}</span>`,
      pack.missingHazardousWeather ? '<span class="status warn">HW gap</span>' : "",
    ].filter(Boolean).join("");
    return `<tr>
      <td><strong>${esc(pack.district)}</strong></td>
      <td><div class="pack-identity"><strong>${esc(pack.unit)}</strong><span>${esc(n(pack.leaderCount))} registered leaders · ${esc(n(pack.directLeaderCount))} direct-contact</span></div></td>
      <td><div class="readiness-missing">${signals}</div></td>
      <td>${qualificationCell(pack)}</td>
      <td>${hazardCell(pack)}</td>
      <td><span class="action-copy">${esc(recommendedAction(pack))}</span></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6"><div class="empty-state">No packs match the selected filters.</div></td></tr>';
}

function bindEvents() {
  ["districtSelect", "statusSelect", "hazardSelect", "sortSelect", "searchInput"].forEach((id) => document.getElementById(id).addEventListener("input", renderRows));
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.packs = CACOutdoorReadiness.buildUnits(state.data.dashboard.training_people || [], "Pack", state.data.generated_date);
  renderMeta();
  renderControls();
  renderKpis();
  bindEvents();
  renderRows();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `<section class="panel"><h1>Camping readiness data did not load</h1><p>${esc(error.message)}</p><p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p></section>`;
});

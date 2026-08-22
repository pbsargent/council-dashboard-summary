const state = {
  data: null,
  packs: [],
};

const fmt = new Intl.NumberFormat("en-US");
const viewerTimestamp = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function n(value) {
  return fmt.format(value || 0);
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  const date = new Date(`${text.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
  }).formatToParts(new Date(utcGuess)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const centralAtGuess = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(utcGuess - (centralAtGuess - utcGuess));
}

function uniqueNames(rows) {
  return [...new Set(rows.map((row) => String(row.name || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function uniqueLeaderCount(rows) {
  return new Set(rows.map((row) => row.member_id || String(row.name || "").trim().toLowerCase()).filter(Boolean)).size;
}

function hasBaloo(row) {
  const value = String(row.baloo_expires || "").trim().toUpperCase();
  return value === "YES" || Boolean(parseDate(value));
}

function hasCurrentHazardousWeather(row, cutoff) {
  if (row.direct_contact !== true) return false;
  const expiration = parseDate(row.hazardous_weather_expires);
  return Boolean(expiration && expiration >= cutoff);
}

function buildPacks() {
  const cutoff = parseDate(state.data.generated_date) || new Date();
  const groups = new Map();
  const people = state.data.dashboard.training_people || [];

  for (const row of people) {
    if (String(row.unit_type || "").toLowerCase() !== "pack" || !row.unit) continue;
    const key = `${row.district || "Unassigned"}|${row.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  state.packs = [...groups.values()].map((rows) => {
    const balooRows = rows.filter(hasBaloo);
    const hazardRows = rows.filter((row) => hasCurrentHazardousWeather(row, cutoff));
    const directRows = rows.filter((row) => row.direct_contact === true);
    const missingBaloo = balooRows.length === 0;
    const missingHazard = hazardRows.length === 0;
    const unitNumber = Number(rows[0].unit_number) || Number(String(rows[0].unit).match(/\d+/)?.[0]) || 0;

    return {
      district: rows[0].district || "Unassigned",
      unit: rows[0].unit,
      unitNumber,
      leaderCount: uniqueLeaderCount(rows),
      directLeaderCount: uniqueLeaderCount(directRows),
      balooPeople: uniqueNames(balooRows),
      hazardPeople: uniqueNames(hazardRows),
      missingBaloo,
      missingHazard,
      severity: Number(missingBaloo) + Number(missingHazard),
    };
  });
}

function renderMeta() {
  const generated = sourceTimestampDate(state.data.generated_at);
  document.getElementById("generatedDate").textContent = generated && !Number.isNaN(generated.getTime())
    ? viewerTimestamp.format(generated)
    : state.data.generated_date;
  const dataDate = parseDate(state.data.generated_date);
  const label = dataDate
    ? dataDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : state.data.generated_date;
  document.getElementById("titleDataDate").textContent = `Data current as of ${label}`;
}

function renderControls() {
  const districts = [...new Set(state.packs.map((pack) => pack.district))].sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
}

function blockedPacks() {
  return state.packs.filter((pack) => pack.missingBaloo || pack.missingHazard);
}

function renderKpis() {
  const blocked = blockedPacks();
  const missingBaloo = blocked.filter((pack) => pack.missingBaloo).length;
  const missingHazard = blocked.filter((pack) => pack.missingHazard).length;
  const missingBoth = blocked.filter((pack) => pack.missingBaloo && pack.missingHazard).length;
  const ready = state.packs.length - blocked.length;
  const tiles = [
    ["Packs Reviewed", state.packs.length, `${n(ready)} have both recorded requirements`, "teal"],
    ["Overnight Gaps", blocked.length, "Missing one or both requirements", blocked.length ? "danger" : "good"],
    ["BALOO Gaps", missingBaloo, `${n(missingBoth)} also lack Hazardous Weather`, missingBaloo ? "danger" : "good"],
    ["Hazardous Weather Gaps", missingHazard, "No current direct-contact coverage", missingHazard ? "warning" : "good"],
  ];

  document.getElementById("readinessKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(n(value))}</div></div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function currentPacks() {
  const district = document.getElementById("districtSelect").value;
  const gap = document.getElementById("gapSelect").value;
  const sort = document.getElementById("sortSelect").value;
  const query = document.getElementById("searchInput").value.trim().toLowerCase();

  const rows = blockedPacks().filter((pack) => {
    const matchesGap = !gap
      || (gap === "both" && pack.missingBaloo && pack.missingHazard)
      || (gap === "baloo" && pack.missingBaloo)
      || (gap === "hazard" && pack.missingHazard);
    const haystack = [pack.district, pack.unit, ...pack.balooPeople, ...pack.hazardPeople].join(" ").toLowerCase();
    return (!district || pack.district === district) && matchesGap && (!query || haystack.includes(query));
  });

  return rows.sort((a, b) => {
    if (sort === "leaders") return a.leaderCount - b.leaderCount || a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber;
    if (sort === "district") return a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber || a.unit.localeCompare(b.unit);
    return b.severity - a.severity || a.district.localeCompare(b.district) || a.unitNumber - b.unitNumber || a.unit.localeCompare(b.unit);
  });
}

function coverageCell(people, currentLabel, missingLabel) {
  if (!people.length) return `<div class="coverage-cell"><span class="status bad">${esc(missingLabel)}</span><span class="coverage-people">No qualifying leader appears in the published roster data.</span></div>`;
  return `<div class="coverage-cell"><span class="status good">${esc(currentLabel)}</span><span class="coverage-people">${esc(people.join("; "))}</span></div>`;
}

function recommendedAction(pack) {
  if (pack.missingBaloo && pack.missingHazard) return "Identify an attending registered leader for BALOO and an attending leader with current Hazardous Weather training; the same person may satisfy both.";
  if (pack.missingBaloo) return "Recruit or train a registered adult in BALOO and confirm that leader will attend the unit-coordinated overnighter.";
  return "Verify whether another attending registered leader has current Hazardous Weather training; otherwise complete or renew the online course.";
}

function renderRows() {
  const packs = currentPacks();
  document.getElementById("packCount").textContent = `${n(packs.length)} packs shown`;
  document.getElementById("packRows").innerHTML = packs.map((pack) => {
    const missing = [
      pack.missingBaloo ? '<span class="status bad">BALOO</span>' : "",
      pack.missingHazard ? '<span class="status warn">Hazardous Weather</span>' : "",
    ].filter(Boolean).join("");
    return `
      <tr>
        <td><strong>${esc(pack.district)}</strong></td>
        <td><div class="pack-identity"><strong>${esc(pack.unit)}</strong><span>${esc(n(pack.leaderCount))} registered leaders · ${esc(n(pack.directLeaderCount))} direct-contact</span></div></td>
        <td><div class="readiness-missing">${missing}</div></td>
        <td>${coverageCell(pack.balooPeople, "Recorded", "None recorded")}</td>
        <td>${coverageCell(pack.hazardPeople, "Current", "None current")}</td>
        <td><span class="action-copy">${esc(recommendedAction(pack))}</span></td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="6"><div class="empty-state">No packs match the selected filters.</div></td></tr>';
}

function renderAll() {
  renderRows();
}

function bindEvents() {
  ["districtSelect", "gapSelect", "sortSelect", "searchInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
  });
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  buildPacks();
  renderMeta();
  renderControls();
  renderKpis();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>Camping readiness data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p>
    </section>
  `;
});

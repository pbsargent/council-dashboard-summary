const state = {
  data: null,
  troops: [],
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

function codeList(value) {
  return String(value || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function hasIols(row) {
  return row.direct_contact === true && !codeList(row.mandatory_codes).includes("S11");
}

function hasCurrentHazardousWeather(row, cutoff) {
  if (row.direct_contact !== true) return false;
  const expiration = parseDate(row.hazardous_weather_expires);
  return Boolean(expiration && expiration >= cutoff);
}

function buildTroops() {
  const cutoff = parseDate(state.data.generated_date) || new Date();
  const groups = new Map();
  const people = state.data.dashboard.training_people || [];

  for (const row of people) {
    if (String(row.unit_type || "").toLowerCase() !== "troop" || !row.unit) continue;
    const key = `${row.district || "Unassigned"}|${row.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  state.troops = [...groups.values()].map((rows) => {
    const iolsRows = rows.filter(hasIols);
    const hazardRows = rows.filter((row) => hasCurrentHazardousWeather(row, cutoff));
    const directRows = rows.filter((row) => row.direct_contact === true);
    const missingIols = iolsRows.length === 0;
    const missingHazard = hazardRows.length === 0;
    const unitNumber = Number(rows[0].unit_number) || Number(String(rows[0].unit).match(/\d+/)?.[0]) || 0;

    return {
      district: rows[0].district || "Unassigned",
      unit: rows[0].unit,
      unitNumber,
      leaderCount: uniqueLeaderCount(rows),
      directLeaderCount: uniqueLeaderCount(directRows),
      iolsPeople: uniqueNames(iolsRows),
      hazardPeople: uniqueNames(hazardRows),
      missingIols,
      missingHazard,
      severity: Number(missingIols) + Number(missingHazard),
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
  const districts = [...new Set(state.troops.map((troop) => troop.district))].sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
}

function blockedTroops() {
  return state.troops.filter((troop) => troop.missingIols || troop.missingHazard);
}

function renderKpis() {
  const blocked = blockedTroops();
  const missingIols = blocked.filter((troop) => troop.missingIols).length;
  const missingHazard = blocked.filter((troop) => troop.missingHazard).length;
  const missingBoth = blocked.filter((troop) => troop.missingIols && troop.missingHazard).length;
  const ready = state.troops.length - blocked.length;
  const tiles = [
    ["Troops Reviewed", state.troops.length, `${n(ready)} have both recorded requirements`, "teal"],
    ["Overnight Gaps", blocked.length, "Missing one or both requirements", blocked.length ? "danger" : "good"],
    ["IOLS Gaps", missingIols, `${n(missingBoth)} also lack Hazardous Weather`, missingIols ? "danger" : "good"],
    ["Hazardous Weather Gaps", missingHazard, "No current direct-contact coverage", missingHazard ? "warning" : "good"],
  ];

  document.getElementById("readinessKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(n(value))}</div></div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function currentTroops() {
  const district = document.getElementById("districtSelect").value;
  const gap = document.getElementById("gapSelect").value;
  const sort = document.getElementById("sortSelect").value;
  const query = document.getElementById("searchInput").value.trim().toLowerCase();

  const rows = blockedTroops().filter((troop) => {
    const matchesGap = !gap
      || (gap === "both" && troop.missingIols && troop.missingHazard)
      || (gap === "iols" && troop.missingIols)
      || (gap === "hazard" && troop.missingHazard);
    const haystack = [troop.district, troop.unit, ...troop.iolsPeople, ...troop.hazardPeople].join(" ").toLowerCase();
    return (!district || troop.district === district) && matchesGap && (!query || haystack.includes(query));
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

function recommendedAction(troop) {
  if (troop.missingIols && troop.missingHazard) return "Confirm an IOLS-trained Scoutmaster or Assistant Scoutmaster and an attending leader with current Hazardous Weather training; the same person may satisfy both readiness signals.";
  if (troop.missingIols) return "Complete or record IOLS for a Scoutmaster or Assistant Scoutmaster and confirm qualified direct-contact leadership for the outing.";
  return "Verify whether another attending registered leader has current Hazardous Weather training; otherwise complete or renew the online course.";
}

function renderRows() {
  const troops = currentTroops();
  document.getElementById("troopCount").textContent = `${n(troops.length)} troops shown`;
  document.getElementById("troopRows").innerHTML = troops.map((troop) => {
    const missing = [
      troop.missingIols ? '<span class="status bad">IOLS</span>' : "",
      troop.missingHazard ? '<span class="status warn">Hazardous Weather</span>' : "",
    ].filter(Boolean).join("");
    return `
      <tr>
        <td><strong>${esc(troop.district)}</strong></td>
        <td><div class="troop-identity"><strong>${esc(troop.unit)}</strong><span>${esc(n(troop.leaderCount))} registered leaders · ${esc(n(troop.directLeaderCount))} direct-contact</span></div></td>
        <td><div class="readiness-missing">${missing}</div></td>
        <td>${coverageCell(troop.iolsPeople, "No S11 gap", "S11 still outstanding")}</td>
        <td>${coverageCell(troop.hazardPeople, "Current", "None current")}</td>
        <td><span class="action-copy">${esc(recommendedAction(troop))}</span></td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="6"><div class="empty-state">No troops match the selected filters.</div></td></tr>';
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
  buildTroops();
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

const state = {
  monday: null,
  dashboard: null,
  rows: [],
  openServiceAreas: new Set(),
  openDistricts: new Set(),
};

const integer = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const viewerTimestamp = new Intl.DateTimeFormat(undefined, {
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
  return Number.isFinite(Number(value)) ? integer.format(Number(value)) : "n/a";
}

function p(value) {
  return Number.isFinite(value) ? percent.format(value) : "n/a";
}

function money(value) {
  return Number.isFinite(Number(value)) ? currency.format(Number(value)) : "n/a";
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

function dateLabel(value) {
  const date = sourceTimestampDate(value);
  return !date || Number.isNaN(date.getTime()) ? "n/a" : viewerTimestamp.format(date);
}

function shortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function serviceAreas() {
  return [...(state.dashboard?.dashboard?.service_areas || [])]
    .sort((a, b) => (a.service_area_order ?? 99) - (b.service_area_order ?? 99) || a.service_area.localeCompare(b.service_area));
}

function serviceAreaForDistrict(district) {
  const match = serviceAreas().find((area) => (area.districts || []).includes(district));
  return match?.service_area || "Other / Unassigned";
}

function decorate(row) {
  return { ...row, service_area: serviceAreaForDistrict(row.district) };
}

function selectedRows() {
  const serviceArea = document.getElementById("serviceAreaSelect").value;
  const district = document.getElementById("districtSelect").value;
  const commitment = document.getElementById("commitmentSelect").value;
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  return state.rows.filter((row) => {
    const haystack = [row.name, row.service_area, row.district, row.commitment, row.onboarding].join(" ").toLowerCase();
    return ProgramFilter.matchesUnitName(row.name)
      && (!serviceArea || row.service_area === serviceArea)
      && (!district || row.district === district)
      && (!commitment || row.commitment === commitment)
      && (!query || haystack.includes(query));
  });
}

function aggregate(rows) {
  const committedRows = rows.filter((row) => row.commitment === "Committed");
  const sales = committedRows.reduce((total, row) => total + Number(row.sales_2025 || 0), 0);
  const goal = committedRows.reduce((total, row) => total + Number(row.goal_2026 || 0), 0);
  return {
    total: rows.length,
    committed: committedRows.length,
    participation: rows.length ? committedRows.length / rows.length : null,
    sales,
    goal,
    goalDelta: sales ? (goal - sales) / sales : null,
    onboarded: committedRows.filter((row) => row.onboarding === "11/11").length,
    onboardingComplete: committedRows.filter((row) => row.onboarding_complete).length,
    trained: committedRows.filter((row) => row.unit_trained).length,
  };
}

function renderControls() {
  const programRows = state.rows.filter((row) => ProgramFilter.matchesUnitName(row.name));
  const selectedService = document.getElementById("serviceAreaSelect").value;
  const selectedDistrict = document.getElementById("districtSelect").value;
  const areaNames = serviceAreas().map((area) => area.service_area);
  if (programRows.some((row) => row.service_area === "Other / Unassigned")) areaNames.push("Other / Unassigned");
  document.getElementById("serviceAreaSelect").innerHTML = `<option value="">All Service Areas</option>${areaNames.map((area) => `<option value="${esc(area)}">${esc(area)}</option>`).join("")}`;
  document.getElementById("serviceAreaSelect").value = areaNames.includes(selectedService) ? selectedService : "";

  const activeService = document.getElementById("serviceAreaSelect").value;
  const districts = [...new Set(programRows
    .filter((row) => !activeService || row.service_area === activeService)
    .map((row) => row.district))]
    .sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All Districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
  document.getElementById("districtSelect").value = districts.includes(selectedDistrict) ? selectedDistrict : "";

  const commitments = [...new Set(programRows.map((row) => row.commitment))].sort((a, b) => a.localeCompare(b));
  const currentCommitment = document.getElementById("commitmentSelect").value;
  document.getElementById("commitmentSelect").innerHTML = `<option value="">All Commitment Statuses</option>${commitments.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join("")}`;
  document.getElementById("commitmentSelect").value = commitments.includes(currentCommitment) ? currentCommitment : "";
}

function renderKpis() {
  const summary = aggregate(selectedRows());
  const goalTone = summary.goalDelta == null ? "teal" : summary.goalDelta >= 0 ? "good" : "warning";
  if (ProgramFilter.getType() === "Post") {
    document.getElementById("popcornKpis").innerHTML = `<article class="kpi teal"><div><div class="kpi-label">Popcorn Participation</div><div class="kpi-value">Not tracked</div></div><div class="kpi-sub">Posts are excluded from the published popcorn population</div></article>`;
    return;
  }
  const tiles = [
    ["Popcorn Participation", p(summary.participation), `${n(summary.committed)} of ${n(summary.total)} units committed`, "teal"],
    ["Committed Units", n(summary.committed), "Units marked Committed", "good"],
    ["Committed 2026 Goal", money(summary.goal), "Goal from committed units", "teal"],
    ["Goal vs 2025 Sales", summary.goalDelta == null ? "n/a" : signedPercent.format(summary.goalDelta), `${money(summary.goal)} vs ${money(summary.sales)}`, goalTone],
    ["Fully Onboarded", n(summary.onboarded), `${n(summary.onboardingComplete)} completion boxes checked`, "teal"],
    ["Unit Trained", n(summary.trained), `${p(summary.committed ? summary.trained / summary.committed : null)} of committed units`, "warning"],
  ];
  document.getElementById("popcornKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div></div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function rollupRow(label, rows, className, note = "", options = {}) {
  const summary = aggregate(rows);
  const goalDelta = summary.goalDelta == null ? "n/a" : signedPercent.format(summary.goalDelta);
  const toggleData = options.level === "district"
    ? `data-level="district" data-key="${esc(options.key)}"`
    : `data-level="service-area" data-service-area="${esc(label)}"`;
  const firstCell = options.collapsible ? `
    <button class="service-toggle" type="button" ${toggleData} aria-expanded="${options.open}">
      <span class="disclosure" aria-hidden="true">${options.open ? "−" : "+"}</span>
      <strong>${esc(label)}</strong>
    </button>
    ${note ? `<div class="subtle">${esc(note)}</div>` : ""}
  ` : `<strong>${esc(label)}</strong>${note ? `<div class="subtle">${esc(note)}</div>` : ""}`;
  return `
    <tr class="${className}">
      <td>${firstCell}</td>
      <td class="num"><strong>${p(summary.participation)}</strong></td>
      <td class="num">${n(summary.committed)}</td>
      <td class="num">${n(summary.total)}</td>
      <td class="num">${money(summary.goal)}</td>
      <td class="num">${money(summary.sales)}</td>
      <td class="num">${goalDelta}</td>
      <td class="num">${n(summary.onboarded)} / ${n(summary.committed)}</td>
      <td class="num">${n(summary.trained)} / ${n(summary.committed)}</td>
    </tr>
  `;
}

function districtKey(serviceArea, district) {
  return `${serviceArea}\u001f${district}`;
}

function unitRollupRow(row) {
  const committed = row.commitment === "Committed";
  const sales = Number(row.sales_2025 || 0);
  const goal = Number(row.goal_2026 || 0);
  const goalDelta = committed && sales ? signedPercent.format((goal - sales) / sales) : "—";
  const operationalNote = [
    `Kernel: ${row.kernel_recruited ? "Yes" : "No"}`,
    `Kickoff: ${shortDate(row.kickoff)}`,
    `Updated: ${dateLabel(row.updated_at)}`,
  ].join(" · ");
  return `
    <tr class="unit-child-row">
      <td><strong>${esc(row.name)}</strong><div class="subtle">${esc(operationalNote)}</div></td>
      <td>${commitmentBadge(row.commitment)}</td>
      <td class="num">${committed ? "1" : "0"}</td>
      <td class="num">1</td>
      <td class="num">${committed ? money(goal) : "—"}</td>
      <td class="num">${committed ? money(sales) : "—"}</td>
      <td class="num">${goalDelta}</td>
      <td>${esc(row.onboarding || "0/11")} · ${row.onboarding_complete ? "Complete" : "Open"}</td>
      <td>${yesNo(row.unit_trained)}</td>
    </tr>
  `;
}

function renderRollup() {
  const rows = selectedRows();
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.service_area)) grouped.set(row.service_area, new Map());
    const districts = grouped.get(row.service_area);
    if (!districts.has(row.district)) districts.set(row.district, []);
    districts.get(row.district).push(row);
  }
  const orderedAreas = [...grouped.keys()].sort((a, b) => {
    const order = new Map(serviceAreas().map((area, index) => [area.service_area, area.service_area_order ?? index]));
    return (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b);
  });
  document.getElementById("rollupRows").innerHTML = orderedAreas.map((areaName) => {
    const districts = grouped.get(areaName);
    const areaRows = [...districts.values()].flat();
    const fieldDirector = serviceAreas().find((area) => area.service_area === areaName)?.field_director || "Exception group";
    const open = state.openServiceAreas.has(areaName);
    const districtRows = open ? [...districts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([district, districtItems]) => {
        const key = districtKey(areaName, district);
        const districtOpen = state.openDistricts.has(key);
        const districtRow = rollupRow(
          district,
          districtItems,
          "district-child-row",
          `${districtItems.length} units`,
          { collapsible: true, open: districtOpen, level: "district", key },
        );
        const unitRows = districtOpen
          ? [...districtItems].sort((a, b) => a.name.localeCompare(b.name)).map(unitRollupRow).join("")
          : "";
        return districtRow + unitRows;
      })
      .join("") : "";
    return rollupRow(
      areaName,
      areaRows,
      "service-area-row",
      `${districts.size} districts · ${fieldDirector}`,
      { collapsible: true, open, level: "service-area" },
    ) + districtRows;
  }).join("") || '<tr><td colspan="9"><div class="empty-state">No matching Popcorn rows.</div></td></tr>';
  document.getElementById("rollupCount").textContent = `${n(rows.length)} units`;
}

function yesNo(value) {
  return value ? '<span class="status good">Yes</span>' : '<span class="status warn">No</span>';
}

function commitmentBadge(value) {
  const tone = value === "Committed" ? "good" : value === "Not Committed" ? "bad" : "warn";
  return `<span class="status ${tone}">${esc(value)}</span>`;
}

function renderAll() {
  renderKpis();
  renderRollup();
}

function bindEvents() {
  document.getElementById("serviceAreaSelect").addEventListener("change", () => {
    renderControls();
    renderAll();
  });
  ["districtSelect", "commitmentSelect", "searchInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
  });
  document.getElementById("rollupRows").addEventListener("click", (event) => {
    const button = event.target.closest(".service-toggle");
    if (!button) return;
    if (button.dataset.level === "district") {
      const key = button.dataset.key;
      if (state.openDistricts.has(key)) state.openDistricts.delete(key);
      else state.openDistricts.add(key);
    } else {
      const areaName = button.dataset.serviceArea;
      if (state.openServiceAreas.has(areaName)) state.openServiceAreas.delete(areaName);
      else state.openServiceAreas.add(areaName);
    }
    renderRollup();
  });
  window.addEventListener("programfilterchange", () => { renderControls(); renderAll(); });
}

async function init() {
  const [mondayResponse, dashboardResponse] = await Promise.all([
    fetch("data/monday-latest.json", { cache: "no-store" }),
    fetch("data/latest.json", { cache: "no-store" }),
  ]);
  if (!mondayResponse.ok) throw new Error(`Unable to load monday.com data: ${mondayResponse.status}`);
  if (!dashboardResponse.ok) throw new Error(`Unable to load dashboard hierarchy: ${dashboardResponse.status}`);
  state.monday = await mondayResponse.json();
  state.dashboard = await dashboardResponse.json();
  const popcorn = state.monday?.boards?.popcorn;
  if (!popcorn?.rows) throw new Error("Popcorn data is not present in the monday.com snapshot.");
  state.rows = popcorn.rows.map(decorate);
  document.getElementById("generatedDate").textContent = dateLabel(state.monday.generated_at);
  document.getElementById("titleDataDate").textContent = `Data extracted ${dateLabel(state.monday.generated_at)}`;
  document.getElementById("boardLink").href = popcorn.url;
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>Popcorn data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server after refreshing data/monday-latest.json.</p>
    </section>
  `;
});

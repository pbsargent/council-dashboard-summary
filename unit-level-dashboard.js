const state = { data: null, unit: null };
const fmt = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat("en-US", { signDisplay: "always", maximumFractionDigits: 0 });

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function n(value) { return value == null ? "n/a" : fmt.format(value); }
function p(value) { return value == null ? "n/a" : pct.format(value); }
function pct100(value) { return value == null ? "n/a" : `${Math.round(value)}%`; }
function dateLabel(value) {
  if (!value) return "Not recorded";
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function metricStatus(metric) {
  if (metric >= 4) return ["Healthy", "good"];
  if (metric === 3) return ["Monitor", "warning"];
  return ["Priority attention", "danger"];
}

function unitsForDistrict(district) {
  return state.data.units.filter((unit) => ProgramFilter.matchesUnitType(unit.unit_type) && unit.district === district);
}

function renderControls() {
  const matchingUnits = state.data.units.filter((unit) => ProgramFilter.matchesUnitType(unit.unit_type));
  const districts = [...new Set(matchingUnits.map((unit) => unit.district).filter(Boolean))].sort();
  const defaultUnit = matchingUnits.find((unit) => unit.unit_id === state.data.default_unit_id) || matchingUnits[0];
  document.getElementById("districtSelect").innerHTML = districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("");
  if (!defaultUnit) return;
  document.getElementById("districtSelect").value = defaultUnit.district;
  renderUnitOptions(defaultUnit.unit_id);
}

function renderUnitOptions(selectedId) {
  const district = document.getElementById("districtSelect").value;
  const units = unitsForDistrict(district).sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById("unitSelect").innerHTML = units.map((unit) => `<option value="${unit.unit_id}">${esc(unit.name)}</option>`).join("");
  const target = units.some((unit) => unit.unit_id === Number(selectedId)) ? Number(selectedId) : units[0]?.unit_id;
  document.getElementById("unitSelect").value = String(target || "");
  selectUnit();
}

function selectUnit() {
  state.unit = state.data.units.find((unit) => unit.unit_id === Number(document.getElementById("unitSelect").value));
  if (state.unit) renderAll();
}

function renderHero() {
  const unit = state.unit;
  const [status] = metricStatus(unit.metric);
  document.getElementById("unitTitle").textContent = unit.name;
  document.getElementById("unitSubtitle").textContent = `${unit.district} · ${unit.chartered_organization || "Chartered organization not recorded"} · Data current ${dateLabel(state.data.data_date)}`;
  document.getElementById("heroMetric").textContent = unit.metric;
  document.getElementById("heroStatus").textContent = status;
}

function renderKpis() {
  const unit = state.unit;
  const training = unit.training || {};
  const change = unit.youth_change == null ? "n/a" : `${signed.format(unit.youth_change)} YoY`;
  const districtUnits = unitsForDistrict(unit.district);
  const rank = [...districtUnits].sort((a, b) => b.metric - a.metric).findIndex((row) => row.unit_id === unit.unit_id) + 1;
  const tiles = [
    ["Youth", n(unit.youth), `${change} from ${n(unit.youth_prior)}`, unit.youth_change >= 0 ? "good" : "danger"],
    ["Retention", pct100(unit.retention_pct), "Rounded to nearest whole percent; may exceed 100%", unit.retention_pct >= 90 ? "good" : "warning"],
    ["Direct Contact Trained", p(training.direct_contact_trained_rate), "Unit leadership readiness", training.direct_contact_trained_rate >= .8 ? "good" : "warning"],
    ["SYT Compliance", p(training.syt_compliance_rate), `${n(training.syt_0_30)} due in 0–30 days`, training.syt_compliance_rate >= .95 ? "good" : "danger"],
    ["District Position", `${rank} of ${districtUnits.length}`, "Ranked by unit metric", "teal"],
  ];
  document.getElementById("unitKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `<article class="kpi ${tone}"><div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div></div><div class="kpi-sub">${esc(sub)}</div></article>`).join("");
}

function renderDrivers() {
  const unit = state.unit;
  const labels = [
    ["ul_cc_trained", "Unit leader and committee chair trained", "Core leadership positions are position-trained."],
    ["size", "Sustainable unit size", "Meets the workbook threshold for the unit type."],
    ["growth", "Year-over-year growth", `${n(unit.youth)} youth versus ${n(unit.youth_prior)} last year.`],
    ["advancement_or_officers", "Advancement or youth officers", unit.advancement_pct == null ? "Program progress signal." : `${pct100(unit.advancement_pct)} advancement.`],
    ["outdoor", "Outdoor or super activity", `Last recorded: ${dateLabel(unit.last_outdoor_date)}.`],
  ];
  const met = labels.filter(([key]) => unit.drivers[key]).length;
  document.getElementById("driverCount").textContent = `${met} of ${labels.length} met`;
  document.getElementById("driverRows").innerHTML = labels.map(([key, label, detail]) => `<div class="driver-row"><div><strong>${esc(label)}</strong><p>${esc(detail)}</p></div><span class="driver-status ${unit.drivers[key] ? "met" : "gap"}">${unit.drivers[key] ? "Met" : "Gap"}</span></div>`).join("");
}

function renderTraining() {
  const unit = state.unit;
  const training = unit.training || {};
  const rows = [
    ["Unit leader trained", unit.unit_leader_trained ? 1 : 0],
    ["Committee chair trained", unit.committee_chair_trained ? 1 : 0],
    ["Direct contact leaders", training.direct_contact_trained_rate],
    ["All adult leaders", training.all_leaders_trained_rate],
    ["SYT compliance", training.syt_compliance_rate],
  ];
  document.getElementById("trainingRows").innerHTML = rows.map(([label, value]) => `<div class="metric-row"><strong>${esc(label)}</strong><div class="metric-value"><span>${p(value)}</span><div class="rate-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, (value || 0) * 100))}%"></span></div></div></div>`).join("");
}

function renderRenewal() {
  const renewal = state.unit.renewal_records;
  const members = renewal.members || [];
  const memberTable = members.length ? `
    <div class="member-table-wrap">
      <table class="member-table">
        <thead><tr><th>Member</th><th>Renewal date</th><th>Type</th><th>Opt-out</th><th>Status</th></tr></thead>
        <tbody>${members.map((member) => {
          const pastDue = member.renewal_date && member.renewal_date < state.data.data_date;
          return `<tr><td><strong>${esc(member.name || "Not recorded")}</strong></td><td>${esc(dateLabel(member.renewal_date))}</td><td>${esc(member.type)}</td><td>${member.opt_out ? "Yes" : "No"}</td><td><span class="renewal-status ${pastDue ? "past" : "upcoming"}">${pastDue ? "Past renewal date" : "Upcoming"}</span></td></tr>`;
        }).join("")}</tbody>
      </table>
    </div>` : '<p class="subtle">No member renewal records are attached to this unit in the source tab.</p>';
  document.getElementById("renewalCount").textContent = `${n(renewal.total)} records`;
  document.getElementById("renewalBody").innerHTML = `<div class="renewal-summary"><div><span>Youth</span><strong>${n(renewal.youth)}</strong></div><div><span>Adults</span><strong>${n(renewal.adults)}</strong></div><div><span>Opt-outs</span><strong>${n(renewal.opt_outs)}</strong></div></div>${memberTable}`;
}

function renderProfile() {
  const unit = state.unit;
  const fields = [
    ["District", unit.district], ["Unit ID", unit.unit_id], ["Chartered organization", unit.chartered_organization || "Not recorded"],
    ["Assigned commissioner", unit.commissioner || "Not recorded"], ["Last connection", dateLabel(unit.last_connection)], ["Last outdoor activity", dateLabel(unit.last_outdoor_date)],
  ];
  document.getElementById("unitProfile").innerHTML = fields.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("");
}

function renderAll() { renderHero(); renderKpis(); renderDrivers(); renderTraining(); renderRenewal(); renderProfile(); }

async function init() {
  if (window.UNIT_LEVEL_DATA) {
    state.data = window.UNIT_LEVEL_DATA;
  } else {
    const response = await fetch("data/unit-level-latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load unit dashboard data: ${response.status}`);
  state.data = await response.json();
  }
  document.getElementById("generatedDate").textContent = `Data ${dateLabel(state.data.data_date)}`;
  document.getElementById("printSource").textContent = `Source: ${state.data.source.name} · ${state.data.source.sheets.join(", ")}`;
  document.getElementById("printGenerated").textContent = `Data current ${dateLabel(state.data.data_date)}`;
  renderControls();
  document.getElementById("districtSelect").addEventListener("change", () => renderUnitOptions());
  document.getElementById("unitSelect").addEventListener("change", selectUnit);
  document.getElementById("printButton").addEventListener("click", () => window.print());
  window.addEventListener("programfilterchange", renderControls);
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `<section class="panel"><h1>Unit dashboard data did not load</h1><p>${esc(error.message)}</p></section>`;
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "council-dashboard-summary.20260626-tay-kpi.js"), "utf8");
const districtRows = { innerHTML: "" };
let selectedType = "Council";
const context = vm.createContext({
  console,
  Intl,
  Map,
  Set,
  URL,
  ProgramFilter: {
    isCouncil() { return selectedType === "Council"; },
    matchesUnitType(unitType) { return selectedType === "Council" || unitType === selectedType; },
    cleanDistrict(value) { return String(value || "").replace(/\s+\d+$/, "").trim(); },
  },
  CACOutdoorReadiness: {},
  document: {
    getElementById(id) {
      if (id === "districtRows") return districtRows;
      return null;
    },
  },
  window: {},
  fetch() { return new Promise(() => {}); },
});

vm.runInContext(source, context);
vm.runInContext(`
  state.data = { dashboard: {
    districts: [
      { district: "Alpha", service_area: "North", units: 3, members: 30, last_year_members: 28, yoy_delta: 2, yoy_pct: 2 / 28, avg_metric: 3, retention_rate: .9, assigned_pct: .67, syt_pct: .9, training_pct: .8, status: "Monitor" },
      { district: "Beta", service_area: "North", units: 2, members: 20, last_year_members: 20, yoy_delta: 0, yoy_pct: 0, avg_metric: 4, retention_rate: 1.05, assigned_pct: 1, syt_pct: .95, training_pct: .9, status: "On Track" },
    ],
    service_areas: [{ service_area: "North", field_director: "Alex R." }],
    unit_pin_statuses: [
      { district: "Alpha", unit: "Pack 1", unit_type: "Pack", pin_status: "Active" },
      { district: "Alpha", unit: "Pack 2", unit_type: "Pack", pin_status: "Stale" },
      { district: "Beta", unit: "Pack 3", unit_type: "Pack", pin_status: "Inactive" },
      { district: "Beta", unit: "Troop 4", unit_type: "Troop", pin_status: "Stale" },
    ],
  } };
  state.unitData = { units: [
    { district: "Alpha 01", unit_id: 101, name: "Pack 1", unit_type: "Pack", number: 1, metric: 1, youth: 12, youth_prior: 10, youth_change: 2, retention_pct: 88, commissioner: null, training: { syt_compliance_rate: .9, all_leaders_trained_rate: .6 } },
    { district: "Alpha 01", unit_id: 102, name: "Pack 2", unit_type: "Pack", number: 2, metric: 4, youth: 20, youth_prior: 20, youth_change: 0, retention_pct: 105, commissioner: "Alex R.", training: { syt_compliance_rate: 1, all_leaders_trained_rate: .8 } },
    { district: "Beta 02", unit_id: 103, name: "Pack 3", unit_type: "Pack", number: 3, metric: 3, youth: 15, youth_prior: 16, youth_change: -1, retention_pct: 75, commissioner: "Sam T.", training: { syt_compliance_rate: .95, all_leaders_trained_rate: .7 } },
  ] };
  state.openServiceAreas = new Set(["North"]);
  state.openOperationalDistricts = new Set(["Alpha"]);
`, context);

vm.runInContext("renderDistrictRows()", context);
assert.doesNotMatch(districtRows.innerHTML, /mini-meter/);
assert.match(districtRows.innerHTML, /40%<div class="subtle">2 \/ 5<\/div>/);
assert.match(districtRows.innerHTML, /33\.3%<div class="subtle">1 \/ 3<\/div>/);
assert.match(districtRows.innerHTML, /50%<div class="subtle">1 \/ 2<\/div>/);
assert.match(districtRows.innerHTML, /class="operational-district-toggle"[^>]+aria-expanded="true"/);
assert.match(districtRows.innerHTML, /Individual Unit Status/);
assert.match(districtRows.innerHTML, /Priority attention/);
assert.match(districtRows.innerHTML, /Healthy/);
assert.match(districtRows.innerHTML, /unit-level\.html\?unit=101/);
assert.match(districtRows.innerHTML, /105%/);
for (const row of districtRows.innerHTML.match(/<tr class="(?:service-area-row|operational-district-row)"[\s\S]*?<\/tr>/g) || []) {
  assert.equal((row.match(/<td/g) || []).length, 11, "every scorecard summary row must have 11 cells");
}
assert.ok(districtRows.innerHTML.indexOf("Alpha") < districtRows.innerHTML.indexOf("Beta"), "lowest PIN Currency should sort first");

selectedType = "Pack";
assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext("Object.fromEntries(pinCurrencyByDistrict())", context))),
  { Alpha: 1, Beta: 1 },
);

console.log("District PIN Currency tests passed.");

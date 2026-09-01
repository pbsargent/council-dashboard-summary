const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "unit-level-dashboard.js"), "utf8");
const context = vm.createContext({
  console,
  Intl,
  Map,
  ProgramFilter: {
    cleanDistrict(value) { return String(value || "").replace(/\s+\d+$/, "").trim(); },
  },
  CACOutdoorReadiness: {},
  window: { UNIT_LEVEL_DATA: { units: [] } },
  fetch() { return new Promise(() => {}); },
});

vm.runInContext(source, context);

assert.equal(vm.runInContext('unitKey("Armadillo 02", "Pack 14 F")', context), "Armadillo|Pack 14 F");
vm.runInContext(`
  state.pinByUnit = new Map([
    ["Armadillo|Crew 4", "Active"],
    ["Armadillo|Crew 3", "Inactive"],
    ["Armadillo|Crew 8787", "Stale"],
  ]);
`, context);

assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 4, gender: null, name: "Crew 4" })', context))),
  { status: "Active", detail: "Current BeAScout PIN record", tone: "good" },
);
assert.equal(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 3, name: "Crew 3" }).status', context), "Inactive");
assert.equal(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 8787, name: "Crew 8787" }).status', context), "Stale");
assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Ship", number: 999, name: "Ship 999" })', context))),
  { status: "n/a", detail: "No matched BeAScout PIN record", tone: "warning" },
);

const unitKpis = { innerHTML: "" };
context.document = { getElementById(id) { return id === "unitKpis" ? unitKpis : null; } };
context.ProgramFilter.matchesUnitType = () => true;
vm.runInContext(`
  state.data = { units: [{
    district: "Armadillo 02", unit_id: 4, unit_type: "Crew", number: 4, name: "Crew 4",
    metric: 3, youth: 12, youth_prior: 10, youth_change: 2, retention_pct: 92, training: {},
  }] };
  state.unit = state.data.units[0];
  renderKpis();
`, context);
assert.match(unitKpis.innerHTML, /^<article class="kpi good"><div><div class="kpi-label">PIN Status<\/div><div class="kpi-value">Active<\/div>/);

console.log("Unit-Level PIN status tests passed.");

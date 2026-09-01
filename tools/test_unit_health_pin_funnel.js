const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "council-dashboard-summary.20260626-tay-kpi.js"), "utf8");
const funnel = { innerHTML: "" };
let selectedType = "Council";
const context = vm.createContext({
  console,
  Intl,
  Map,
  Set,
  URL,
  ProgramFilter: {
    isCouncil() { return true; },
    matchesUnitType(unitType) { return selectedType === "Council" || unitType === selectedType; },
  },
  CACOutdoorReadiness: {},
  document: { getElementById(id) { return id === "healthFunnel" ? funnel : null; } },
  window: {},
  fetch() { return new Promise(() => {}); },
});

vm.runInContext(source, context);

const pinRows = [
  ...Array.from({ length: 135 }, (_, index) => ({ unit_type: index < 62 ? "Pack" : "Troop", pin_status: "Active" })),
  ...Array.from({ length: 22 }, (_, index) => ({ unit_type: index < 4 ? "Pack" : "Troop", pin_status: "Inactive" })),
  ...Array.from({ length: 139 }, (_, index) => ({ unit_type: index < 59 ? "Pack" : "Troop", pin_status: "Stale" })),
];
context.pinRows = pinRows;
vm.runInContext(`state.data = { dashboard: { council: {
  units: 296, assigned_units: 0, assigned_pct: 0, healthy_units: 0, healthy_rate: 0, at_risk_units: 0, at_risk_rate: 0,
}, unit_pin_statuses: pinRows } };`, context);

vm.runInContext("renderHealthFunnel()", context);
assert.match(funnel.innerHTML, /Inactive \+ stale PINs/);
assert.match(funnel.innerHTML, /<div class="funnel-value">161<\/div>/);
assert.match(funnel.innerHTML, /<div class="subtle">54\.4%<\/div>/);

selectedType = "Pack";
vm.runInContext("state.data.dashboard.council.units = 125; renderHealthFunnel()", context);
assert.match(funnel.innerHTML, /<div class="funnel-value">63<\/div>/);
assert.match(funnel.innerHTML, /<div class="subtle">50\.4%<\/div>/);

vm.runInContext("state.data.dashboard.unit_pin_statuses = []; renderHealthFunnel()", context);
assert.match(funnel.innerHTML, /Inactive \+ stale PINs[\s\S]*?<div class="funnel-value">n\/a<\/div>/);

console.log("Unit Health PIN funnel tests passed.");

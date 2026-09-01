const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "council-dashboard-summary.20260626-tay-kpi.js"), "utf8");
const signals = { innerHTML: "" };
const context = vm.createContext({
  console,
  Intl,
  Map,
  Set,
  URL,
  ProgramFilter: {
    isCouncil() { return true; },
    matchesUnitType() { return true; },
    cleanDistrict(value) { return String(value || "").replace(/\s+\d+$/, "").trim(); },
  },
  CACOutdoorReadiness: {},
  document: { getElementById(id) { return id === "signals" ? signals : null; }, querySelectorAll() { return []; } },
  window: { addEventListener() {} },
  fetch() { return new Promise(() => {}); },
});

vm.runInContext(source, context);
vm.runInContext(`state.data = { dashboard: {
  council: { units: 5, assigned_units: 4, assigned_pct: .8, unit_commissioners: 2 },
  districts: [
    { district: "Alpha", at_risk_rate: .5, yoy_pct: .1, members: 100, training_pct: .7 },
    { district: "Beta", at_risk_rate: .2, yoy_pct: -.1, members: 80, training_pct: .6 },
  ],
  commissioners: [], priority_units: [],
  unit_pin_statuses: [
    { unit_type: "Pack", pin_status: "Active" },
    { unit_type: "Pack", pin_status: "Inactive" },
    { unit_type: "Troop", pin_status: "Stale" },
    { unit_type: "Troop", pin_status: "Stale" },
  ],
} }; state.unitData = null; renderSignals();`, context);

assert.match(signals.innerHTML, /PIN state: 3 need follow-up/);
assert.match(signals.innerHTML, /1 Active · 1 Inactive · 2 Stale · 1 unmatched\. 40% current\./);

console.log("Overview PIN signal tests passed.");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "pin-status.js"), "utf8");
let selectedType = "Council";
const programFilter = {
  isCouncil() { return selectedType === "Council"; },
  matchesUnitType(unitType) { return selectedType === "Council" || unitType === selectedType; },
  cleanDistrict(value) { return String(value || "").replace(/\s+\d+$/, "").trim(); },
};
const windowObject = { ProgramFilter: programFilter };
const context = vm.createContext({
  console,
  Intl,
  Map,
  Set,
  ProgramFilter: programFilter,
  window: windowObject,
  document: { readyState: "loading", addEventListener() {} },
  fetch() { return new Promise(() => {}); },
});

vm.runInContext(source, context);
const api = windowObject.PinStatusPage;
assert.ok(api, "PIN page calculation API should be available for regression tests");

const dashboard = {
  districts: [
    { district: "Alpha", units: 3 },
    { district: "Beta", units: 2 },
  ],
  unit_pin_statuses: [
    { district: "Alpha", unit_type: "Pack", pin_status: "Active", pin_status_complete: true, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: true },
    { district: "Alpha", unit_type: "Pack", pin_status: "Inactive", pin_status_complete: true, pin_contact_complete: false, pin_meeting_complete: true, pin_details_complete: false },
    { district: "Beta", unit_type: "Troop", pin_status: "Stale", pin_status_complete: true, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: true },
    { district: "Beta", unit_type: "Troop", pin_status: "Stale", pin_status_complete: false, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: false },
  ],
};
const unitData = {
  units: [
    { district: "Alpha 01", unit_type: "Pack" },
    { district: "Alpha 01", unit_type: "Pack" },
    { district: "Alpha 01", unit_type: "Troop" },
    { district: "Beta 02", unit_type: "Troop" },
    { district: "Beta 02", unit_type: "Troop" },
  ],
};

const councilRows = api.summarizeDistricts(dashboard, unitData, programFilter);
const council = api.rollup(councilRows);
assert.equal(council.units, 5);
assert.equal(council.active, 1);
assert.equal(council.inactive, 1);
assert.equal(council.stale, 2);
assert.equal(council.unmatched, 1, "unmatched units stay visible and in the denominator");
assert.equal(council.complete, 2);
assert.equal(council.currency, 2 / 5);
assert.equal(council.completeness, 2 / 5);
assert.equal(council.detailGaps, 2);

selectedType = "Pack";
const pack = api.rollup(api.summarizeDistricts(dashboard, unitData, programFilter));
assert.equal(pack.units, 2, "program views use the complete unit-level population");
assert.equal(pack.active, 1);
assert.equal(pack.inactive, 1);
assert.equal(pack.currency, 1);
assert.equal(pack.complete, 1);
assert.equal(pack.completeness, 0.5);

console.log("PIN Status & Completeness page tests passed.");

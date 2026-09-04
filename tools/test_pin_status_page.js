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
assert.equal(api.unitHeaderOffset(100, 150, 360, 34), 0, "unscrolled unit headings stay at the inner viewport top");
assert.equal(api.unitHeaderOffset(100, 60, 360, 34), 40, "outer scrolling keeps unit headings below district headings");
assert.equal(api.unitHeaderOffset(140, 60, 360, 34), 80, "wrapped or zoomed district headings are measured, not hard-coded");
assert.equal(api.unitHeaderOffset(500, 60, 360, 34), 326, "headings cannot escape the bottom of their own scrollport");
assert.equal(api.unitHeaderOffset(100, 60, 20, 34), 0, "short viewports never produce a negative offset");

const dashboard = {
  districts: [
    { district: "Alpha", units: 3 },
    { district: "Beta", units: 2 },
  ],
  unit_pin_statuses: [
    { district: "Alpha", unit: "Pack 1 F", unit_type: "Pack", pin_status: "Active", pin_status_complete: true, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: true },
    { district: "Alpha", unit: "Pack 2 F", unit_type: "Pack", pin_status: "Inactive", pin_status_complete: true, pin_contact_complete: false, pin_meeting_complete: true, pin_details_complete: false },
    { district: "Beta", unit: "Troop 4 F", unit_type: "Troop", pin_status: "Stale", pin_status_complete: true, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: true },
    { district: "Beta", unit: "Troop 5 B", unit_type: "Troop", pin_status: "Stale", pin_status_complete: false, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: false },
  ],
};
const unitData = {
  units: [
    { unit_id: 1, name: "Pack 1 F", district: "Alpha 01", unit_type: "Pack" },
    { unit_id: 2, name: "Pack 2 F", district: "Alpha 01", unit_type: "Pack" },
    { unit_id: 3, name: "Troop 3 B", district: "Alpha 01", unit_type: "Troop" },
    { unit_id: 4, name: "Troop 4 B", district: "Beta 02", unit_type: "Troop" },
    { unit_id: 5, name: "Troop 5 B", district: "Beta 02", unit_type: "Troop" },
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
const alphaUnits = councilRows.find((row) => row.district === "Alpha").unitRows;
assert.deepEqual(JSON.parse(JSON.stringify(alphaUnits.map((row) => row.unit))), ["Troop 3 B", "Pack 2 F", "Pack 1 F"], "unit detail prioritizes no PIN, Inactive, then complete Active");
assert.equal(alphaUnits[0].pinStatus, "n/a");
assert.deepEqual(JSON.parse(JSON.stringify(alphaUnits[0].missing)), ["No matched PIN"]);
assert.equal(alphaUnits[1].detailsComplete, false);
assert.deepEqual(JSON.parse(JSON.stringify(alphaUnits[1].missing)), ["Contact"]);
assert.equal(alphaUnits[2].detailsComplete, true);
assert.deepEqual(JSON.parse(JSON.stringify(alphaUnits[2].missing)), []);
assert.equal(alphaUnits[2].unitId, 1, "unit detail retains the Unit-Level Detail deep-link identifier");
const betaUnits = councilRows.find((row) => row.district === "Beta").unitRows;
assert.equal(betaUnits[0].pinStatus, "Stale", "unique district, program, and unit-number identity tolerates display-label differences");
assert.equal(betaUnits[0].matched, true);

selectedType = "Pack";
const pack = api.rollup(api.summarizeDistricts(dashboard, unitData, programFilter));
assert.equal(pack.units, 2, "program views use the complete unit-level population");
assert.equal(pack.active, 1);
assert.equal(pack.inactive, 1);
assert.equal(pack.currency, 1);
assert.equal(pack.complete, 1);
assert.equal(pack.completeness, 0.5);

console.log("PIN Status & Completeness page tests passed.");

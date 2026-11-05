const assert = require("node:assert/strict");
const page = require("../key3-status.js");

const rows = [
  { service_area: "North", district: "Armadillo", unit: "Pack 10", unit_type: "Pack", status: "Complete", missing_roles: [] },
  { service_area: "North", district: "Armadillo", unit: "Pack 2", unit_type: "Pack", status: "Missing 1", missing_roles: ["COR / CUR"] },
  { service_area: "North", district: "Bee Cave", unit: "Troop 1", unit_type: "Troop", status: "Missing 2", missing_roles: ["Unit Leader", "Committee Chair"] },
  { service_area: "South", district: "Chisholm Trail", unit: "Crew 3", unit_type: "Crew", status: "Complete", missing_roles: [] },
];
for (const row of rows) Object.assign(row, { executive_officers: [{name: "Morgan E.", position: "Executive Officer"}], key4_status: row.status, key4_missing_roles: [...row.missing_roles] });

assert.deepEqual(page.summarize(rows), {
  units: 4,
  complete: 2,
  missingAny: 2,
  missingUnitLeader: 1,
  missingCommitteeChair: 1,
  missingCorCur: 1,
  missingExecutiveOfficer: 0,
  unavailable: 0,
});

assert.deepEqual(page.summarizeByUnitType(rows).map((row) => [row.unitType, row.units, row.complete]), [
  ["Pack", 2, 1],
  ["Troop", 1, 0],
  ["Crew", 1, 1],
]);
assert.equal(page.matchesFocus(rows[1], "cor-cur"), true);
assert.equal(page.matchesFocus(rows[2], "cor-cur"), false);
assert.equal(page.matchesFocus(rows[0], "complete"), true);
assert.equal(page.matchesFocus(rows[0], "missing"), false);
assert.equal(page.matchesStatus(rows[0], ""), true);
assert.equal(page.matchesStatus(rows[0], "Complete"), true);
assert.equal(page.matchesStatus(rows[0], "Missing 1"), false);
assert.equal(page.matchesStatus(rows[1], "Missing 1"), true);
assert.equal(page.matchesStatus(rows[2], "Missing 2"), true);
const sytStatusRow = {
  status: "Complete",
  unit_leaders: [{ syt_expires: "2026-09-05" }],
  committee_chairs: [{ syt_expires: "2026-10-01" }],
  cor_cur_holders: [{ syt_expires: "2027-01-01" }],
};
assert.deepEqual(page.holderSytStates(sytStatusRow, new Date(2026, 8, 6)), ["expired", "expiring-soon", "current"]);
assert.equal(page.matchesStatus(sytStatusRow, "expired-syt", new Date(2026, 8, 6)), true);
assert.equal(page.matchesStatus(sytStatusRow, "expiring-syt", new Date(2026, 8, 6)), true);
assert.equal(page.matchesStatus(rows[0], "expired-syt", new Date(2026, 8, 6)), false);
assert.equal(page.matchesStatus(rows[0], "expiring-syt", new Date(2026, 8, 6)), false);

const hierarchy = page.buildHierarchy(rows);
assert.deepEqual(hierarchy.map((area) => [area.area, area.districts.map((district) => district.district)]), [
  ["North", ["Armadillo", "Bee Cave"]],
  ["South", ["Chisholm Trail"]],
]);
assert.deepEqual(hierarchy[0].districts[0].rows.map((row) => row.unit), ["Pack 2", "Pack 10"]);
assert.equal(page.districtKey("North", "Armadillo"), "North|Armadillo");

assert.deepEqual(page.sytExpirationState("2026-12-05T00:00:00", new Date(2026, 8, 6)), {
  label: "SYT expires Dec 5, 2026",
  state: "expiring-soon",
  daysRemaining: 90,
});
assert.equal(page.sytExpirationState("2026-12-06T00:00:00", new Date(2026, 8, 6)).state, "current");
assert.equal(page.sytExpirationState("2026-09-06T00:00:00", new Date(2026, 8, 6)).state, "expiring-soon");
assert.equal(page.sytExpirationState("2026-09-05T00:00:00", new Date(2026, 8, 6)).state, "expired");
assert.deepEqual(page.sytExpirationState(null, new Date(2026, 8, 6)), {
  label: "SYT expiration unavailable",
  state: "unavailable",
  daysRemaining: null,
});

console.log("Unit Key 3 page tests passed.");

const key4 = { ...rows[0], executive_officers: [{ name: "Morgan E.", position: "Executive Officer" }], key4_status: "Complete", key4_missing_roles: [] };
assert.equal(page.key4Detail(key4).status, "Complete");
assert.equal(page.key4Detail({status:"Complete", missing_roles:[]}).status, "Unavailable");
assert.match(page.renderUnitTable([key4]), /IH \/ Executive Officer/);
assert.match(page.renderUnitTable([key4]), /Morgan E\./);
assert.match(page.renderUnitTable([{...key4, executive_officers: [], key4_status: "Missing 1", key4_missing_roles: ["IH / Executive Officer"]}]), /No qualifying record found/);
assert.match(page.renderUnitTable([{status:"Complete", missing_roles:[]}]), /Unavailable/);

const missingIH = {...rows[0], executive_officers: [], key4_missing_roles: ["IH / Executive Officer"], key4_status: "Missing 1"};
const summary = page.summarize([missingIH, rows[3]]);
assert.equal(summary.complete, 1);
assert.equal(summary.missingAny, 1);
assert.equal(summary.missingExecutiveOfficer, 1);
assert.equal(page.matchesFocus(missingIH, "executive-officer"), true);
assert.equal(page.matchesFocus(missingIH, "complete"), false);
assert.equal(page.matchesStatus(missingIH, "Missing 1"), true);
assert.equal(page.matchesStatus({...missingIH, key4_status:"Missing 4"}, "Missing 4"), true);
assert.equal(page.summarizeByUnitType([missingIH])[0].complete, 0);
assert.equal(page.summarize([{}]).unavailable, 1);
assert.equal(page.summarize([{}]).missingAny, 0);
console.log("Unit Key 4 summary, IH focus, four-role status and unavailable-state tests passed.");

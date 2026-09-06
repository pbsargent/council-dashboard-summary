const assert = require("node:assert/strict");
const page = require("../key3-status.js");

const rows = [
  { service_area: "North", district: "Armadillo", unit: "Pack 10", unit_type: "Pack", status: "Complete", missing_roles: [] },
  { service_area: "North", district: "Armadillo", unit: "Pack 2", unit_type: "Pack", status: "Missing 1", missing_roles: ["COR / CUR"] },
  { service_area: "North", district: "Bee Cave", unit: "Troop 1", unit_type: "Troop", status: "Missing 2", missing_roles: ["Unit Leader", "Committee Chair"] },
  { service_area: "South", district: "Chisholm Trail", unit: "Crew 3", unit_type: "Crew", status: "Complete", missing_roles: [] },
  { service_area: "South", district: "Exploring", unit: "Post 100", unit_type: "Post", status: "Complete", missing_roles: [], required_roles: ["Unit Leader", "Committee Chair"] },
];

assert.deepEqual(page.summarize(rows), {
  units: 5,
  complete: 3,
  missingAny: 2,
  missingUnitLeader: 1,
  missingCommitteeChair: 1,
  missingCorCur: 1,
});

assert.deepEqual(page.summarizeByUnitType(rows).map((row) => [row.unitType, row.units, row.complete]), [
  ["Pack", 2, 1],
  ["Troop", 1, 0],
  ["Crew", 1, 1],
  ["Post", 1, 1],
]);
assert.equal(page.matchesFocus(rows[1], "cor-cur"), true);
assert.equal(page.matchesFocus(rows[2], "cor-cur"), false);
assert.equal(page.matchesFocus(rows[0], "complete"), true);
assert.equal(page.matchesFocus(rows[0], "missing"), false);
assert.equal(page.roleRequired(rows[4], "COR / CUR"), false);
assert.equal(page.roleRequired(rows[4], "Committee Chair"), true);
assert.equal(page.roleRequired(rows[0], "COR / CUR"), true);

const hierarchy = page.buildHierarchy(rows);
assert.deepEqual(hierarchy.map((area) => [area.area, area.districts.map((district) => district.district)]), [
  ["North", ["Armadillo", "Bee Cave"]],
  ["South", ["Chisholm Trail", "Exploring"]],
]);
assert.deepEqual(hierarchy[0].districts[0].rows.map((row) => row.unit), ["Pack 2", "Pack 10"]);
assert.equal(page.districtKey("North", "Armadillo"), "North|Armadillo");

assert.deepEqual(page.sytExpirationState("2026-12-05T00:00:00", new Date(2026, 8, 6)), {
  label: "SYT expires Dec 5, 2026",
  urgent: true,
  daysRemaining: 90,
});
assert.equal(page.sytExpirationState("2026-12-06T00:00:00", new Date(2026, 8, 6)).urgent, false);
assert.equal(page.sytExpirationState("2026-09-05T00:00:00", new Date(2026, 8, 6)).urgent, true);
assert.deepEqual(page.sytExpirationState(null, new Date(2026, 8, 6)), {
  label: "SYT expiration unavailable",
  urgent: false,
  daysRemaining: null,
});

console.log("Unit Key 3 page tests passed.");

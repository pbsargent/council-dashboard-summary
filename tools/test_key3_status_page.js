const assert = require("node:assert/strict");
const page = require("../key3-status.js");

const rows = [
  { unit_type: "Pack", status: "Complete", missing_roles: [] },
  { unit_type: "Pack", status: "Missing 1", missing_roles: ["COR / CUR"] },
  { unit_type: "Troop", status: "Missing 2", missing_roles: ["Unit Leader", "Committee Chair"] },
  { unit_type: "Crew", status: "Complete", missing_roles: [] },
];

assert.deepEqual(page.summarize(rows), {
  units: 4,
  complete: 2,
  missingAny: 2,
  missingUnitLeader: 1,
  missingCommitteeChair: 1,
  missingCorCur: 1,
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

console.log("Unit Key 3 page tests passed.");

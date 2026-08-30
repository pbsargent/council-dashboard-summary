const assert = require("node:assert/strict");
const readiness = require("../outdoor-readiness.js");

function leader(overrides = {}) {
  return {
    district: "Armadillo",
    unit: "Pack 14 F",
    unit_type: "Pack",
    member_id: "1",
    name: "Example Leader",
    position: "Committee Member",
    direct_contact: false,
    mandatory_codes: "",
    baloo_expires: null,
    hazardous_weather_expires: null,
    ...overrides,
  };
}

const packs = readiness.buildUnits([
  leader({ baloo_expires: "Yes" }),
  leader({ position: "Committee Chair", baloo_expires: "Yes" }),
  leader({ member_id: "2", name: "Second Leader", baloo_expires: "2026-01-01" }),
], "Pack", "2026-08-30");
assert.equal(packs.length, 1);
assert.equal(packs[0].qualificationCount, 2, "duplicate positions must not double-count a person");
assert.equal(packs[0].depthStatus.key, "preferred");
assert.equal(readiness.findUnit(packs, "Armadillo 02", "Pack 14 F"), packs[0], "district numeric suffix should normalize for the Unit-Level join");

const troops = readiness.buildUnits([
  leader({ unit: "Troop 1 B", unit_type: "Troop", position: "Scoutmaster", direct_contact: true, iols_trained: false }),
  leader({ unit: "Troop 1 B", unit_type: "Troop", member_id: "2", name: "Explicit Leader", position: "Assistant Scoutmaster", direct_contact: true, iols_trained: "Yes", mandatory_codes: "S11" }),
  leader({ unit: "Troop 1 B", unit_type: "Troop", member_id: "3", name: "Fallback Leader", position: "Assistant Scoutmaster", direct_contact: true, mandatory_codes: "" }),
], "Troop", "2026-08-30");
assert.equal(troops[0].qualificationCount, 2, "explicit IOLS must take precedence and S11 absence must remain the fallback");
assert.equal(troops[0].depthStatus.key, "preferred");

assert.equal(readiness.depthStatus(0).key, "gap");
assert.equal(readiness.depthStatus(1).key, "fragile");
assert.equal(readiness.depthStatus(2).key, "preferred");
assert.equal(readiness.depthStatus(null).key, "unknown");
assert.equal(readiness.matchesDepthStatus(packs[0], "preferred"), true);
assert.equal(readiness.matchesDepthStatus(packs[0], "gap"), false);
assert.equal(readiness.matchesDepthStatus(packs[0], ""), true);

console.log("Outdoor readiness tests passed.");

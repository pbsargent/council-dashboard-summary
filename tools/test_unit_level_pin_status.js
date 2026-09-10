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
assert.equal(vm.runInContext('preferredUnit([{ unit_id: 1 }, { unit_id: 2 }], 2, 1).unit_id', context), 2, "deep links select the requested unit");
assert.equal(vm.runInContext('preferredUnit([{ unit_id: 1 }, { unit_id: 2 }], 9, 1).unit_id', context), 1, "unknown deep links fall back to the configured default");
vm.runInContext(`
  state.pinByUnit = new Map([
    ["Armadillo|Crew 4", { pin_status: "Active", pin_status_complete: true, pin_contact_complete: true, pin_meeting_complete: true, pin_details_complete: true }],
    ["Armadillo|Crew 3", { pin_status: "Inactive", pin_status_complete: true, pin_contact_complete: false, pin_meeting_complete: true, pin_details_complete: false }],
    ["Armadillo|Crew 8787", { pin_status: "Stale", pin_status_complete: true, pin_contact_complete: true, pin_meeting_complete: false, pin_details_complete: false }],
  ]);
`, context);

assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 4, gender: null, name: "Crew 4" })', context))),
  {
    status: "Active", detail: "Current BeAScout PIN record", tone: "good", completeness: { label: "Details complete", tone: "good" },
    fields: {
      status: { label: "Complete", detail: "PIN status is recorded", tone: "good" },
      contact: { label: "Complete", detail: "Contact name and email or phone are recorded", tone: "good" },
      meeting: { label: "Complete", detail: "Meeting location and details are recorded", tone: "good" },
    },
  },
);
assert.equal(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 3, name: "Crew 3" }).status', context), "Inactive");
assert.equal(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 8787, name: "Crew 8787" }).status', context), "Stale");
assert.equal(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 3, name: "Crew 3" }).fields.contact.label', context), "Needs follow-up");
assert.equal(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Crew", number: 8787, name: "Crew 8787" }).fields.meeting.detail', context), "Meeting location or details are missing");
assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext('pinSummary({ district: "Armadillo 02", unit_type: "Ship", number: 999, name: "Ship 999" })', context))),
  {
    status: "n/a", detail: "No matched BeAScout PIN record", tone: "warning", completeness: { label: "Details n/a", tone: "warning" },
    fields: {
      status: { label: "n/a", detail: "No matched PIN record", tone: "warning" },
      contact: { label: "n/a", detail: "No matched PIN record", tone: "warning" },
      meeting: { label: "n/a", detail: "No matched PIN record", tone: "warning" },
    },
  },
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

const unitProfile = { innerHTML: "" };
context.document = { getElementById(id) { return id === "unitProfile" ? unitProfile : null; } };
vm.runInContext("renderProfile()", context);
assert.match(unitProfile.innerHTML, /PIN status \/ freshness/);
assert.match(unitProfile.innerHTML, /Required PIN Details/);
assert.match(unitProfile.innerHTML, /PIN status field/);
assert.match(unitProfile.innerHTML, /PIN contact requirements/);
assert.match(unitProfile.innerHTML, /PIN meeting requirements/);
assert.match(unitProfile.innerHTML, /status good">Active<\/span>/);
assert.match(unitProfile.innerHTML, /status good">Details complete<\/span>/);
assert.match(unitProfile.innerHTML, /Contact name and email or phone are recorded/);
assert.match(unitProfile.innerHTML, /Meeting location and details are recorded/);

console.log("Unit-Level PIN status tests passed.");

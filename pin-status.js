(() => {
  const state = { dashboard: null, unitData: null, focus: "all", expandedDistricts: new Set() };
  const integer = new Intl.NumberFormat("en-US");
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const n = (value) => integer.format(Number(value) || 0);
  const p = (value) => Number.isFinite(value) ? percent.format(value) : "n/a";
  const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
  const cleanDistrict = (value) => window.ProgramFilter?.cleanDistrict(value) || String(value || "").replace(/\s+\d+$/, "").trim();
  const unitName = (unit) => String(unit?.name || [unit?.unit_type, unit?.number, unit?.gender].filter((part) => part != null && part !== "").join(" ")).trim();
  const unitKey = (district, unit) => `${cleanDistrict(district)}|${String(unit || "").trim()}`;
  const unitNumber = (value) => String(value ?? "").match(/\d+/)?.[0].replace(/^0+(?=\d)/, "") || "";
  const unitBaseKey = (district, unitType, unit) => `${cleanDistrict(district)}|${String(unitType || "").trim()}|${unitNumber(unit)}`;

  function unitDetailsByDistrict(dashboard, unitData, programFilter = window.ProgramFilter) {
    const pins = (dashboard?.unit_pin_statuses || []).filter((row) => programFilter.matchesUnitType(row.unit_type));
    const units = (unitData?.units || []).filter((unit) => programFilter.matchesUnitType(unit.unit_type));
    const pinByUnit = new Map(pins.map((row) => [unitKey(row.district, row.unit), row]));
    const pinsByBase = new Map();
    const unitsByBase = new Map();
    for (const pin of pins) {
      const key = unitBaseKey(pin.district, pin.unit_type, pin.unit);
      if (!pinsByBase.has(key)) pinsByBase.set(key, []);
      pinsByBase.get(key).push(pin);
    }
    for (const unit of units) {
      const key = unitBaseKey(unit.district, unit.unit_type, unit.number ?? unitName(unit));
      unitsByBase.set(key, (unitsByBase.get(key) || 0) + 1);
    }
    const details = new Map();
    for (const unit of units) {
      const district = cleanDistrict(unit.district);
      const name = unitName(unit);
      const baseKey = unitBaseKey(district, unit.unit_type, unit.number ?? name);
      const baseMatches = pinsByBase.get(baseKey) || [];
      const pin = pinByUnit.get(unitKey(district, name))
        || (unitsByBase.get(baseKey) === 1 && baseMatches.length === 1 ? baseMatches[0] : null);
      const missing = pin ? [
        pin.pin_status_complete === true ? null : "Status",
        pin.pin_contact_complete === true ? null : "Contact",
        pin.pin_meeting_complete === true ? null : "Meeting",
      ].filter(Boolean) : ["No matched PIN"];
      if (!details.has(district)) details.set(district, []);
      details.get(district).push({
        district,
        unitId: unit.unit_id,
        unit: name,
        unitType: unit.unit_type || "n/a",
        pinStatus: pin?.pin_status || "n/a",
        detailsComplete: pin?.pin_details_complete === true,
        matched: Boolean(pin),
        missing,
      });
    }
    const expectedCounts = unitCountsByDistrict(dashboard, unitData, programFilter);
    for (const [district, expected] of expectedCounts) {
      if (!details.has(district)) details.set(district, []);
      const rows = details.get(district);
      while (rows.length < expected) {
        rows.push({
          district,
          unitId: null,
          unit: "Tracked unit identity unavailable",
          unitType: "n/a",
          pinStatus: "n/a",
          detailsComplete: false,
          matched: false,
          missing: ["No matched PIN"],
        });
      }
    }
    for (const rows of details.values()) {
      rows.sort((a, b) => unitPriority(a) - unitPriority(b) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
    }
    return details;
  }

  function unitCountsByDistrict(dashboard, unitData, programFilter = window.ProgramFilter) {
    if (programFilter.isCouncil()) {
      return new Map((dashboard?.districts || []).map((row) => [cleanDistrict(row.district), Number(row.units) || 0]));
    }
    const counts = new Map();
    for (const unit of unitData?.units || []) {
      if (!programFilter.matchesUnitType(unit.unit_type)) continue;
      const district = cleanDistrict(unit.district);
      counts.set(district, (counts.get(district) || 0) + 1);
    }
    return counts;
  }

  function summarizeDistricts(dashboard, unitData, programFilter = window.ProgramFilter) {
    const unitCounts = unitCountsByDistrict(dashboard, unitData, programFilter);
    const unitDetails = unitDetailsByDistrict(dashboard, unitData, programFilter);
    const rowsByDistrict = new Map();
    for (const row of dashboard?.unit_pin_statuses || []) {
      if (!programFilter.matchesUnitType(row.unit_type)) continue;
      const district = cleanDistrict(row.district);
      if (!rowsByDistrict.has(district)) rowsByDistrict.set(district, []);
      rowsByDistrict.get(district).push(row);
    }
    return [...unitCounts.entries()].map(([district, units]) => {
      const pinRows = rowsByDistrict.get(district) || [];
      const active = pinRows.filter((row) => row.pin_status === "Active").length;
      const inactive = pinRows.filter((row) => row.pin_status === "Inactive").length;
      const stale = pinRows.filter((row) => row.pin_status === "Stale").length;
      const complete = pinRows.filter((row) => row.pin_details_complete === true).length;
      const contactGaps = pinRows.filter((row) => row.pin_contact_complete !== true).length;
      const otherDetailGaps = pinRows.filter((row) => row.pin_contact_complete === true && row.pin_details_complete !== true).length;
      const unmatched = Math.max(0, units - pinRows.length);
      return {
        district, units, active, inactive, stale, unmatched, complete, contactGaps, otherDetailGaps,
        unitRows: unitDetails.get(district) || [],
        currency: ratio(active + inactive, units),
        completeness: ratio(complete, units),
      };
    }).sort((a, b) => a.district.localeCompare(b.district));
  }

  function rollup(rows) {
    const keys = ["units", "active", "inactive", "stale", "unmatched", "complete", "contactGaps", "otherDetailGaps"];
    const total = Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
    total.currency = ratio(total.active + total.inactive, total.units);
    total.completeness = ratio(total.complete, total.units);
    total.detailGaps = Math.max(0, total.units - total.complete - total.unmatched);
    return total;
  }

  function serviceAreaForDistrict(district) {
    return (state.dashboard?.dashboard?.service_areas || []).find((area) => (area.districts || []).includes(district))?.service_area || "Other / Unassigned";
  }

  function selectedRows(allRows) {
    const area = document.getElementById("serviceAreaSelect").value;
    const district = document.getElementById("districtSelect").value;
    return allRows.filter((row) => (!area || serviceAreaForDistrict(row.district) === area) && (!district || row.district === district));
  }

  function focusMatches(row) {
    if (state.focus === "stale") return row.stale > 0;
    if (state.focus === "inactive") return row.inactive > 0;
    if (state.focus === "details") return row.units - row.complete - row.unmatched > 0;
    if (state.focus === "unmatched") return row.unmatched > 0;
    return true;
  }

  function unitFocusMatches(row) {
    if (state.focus === "stale") return row.pinStatus === "Stale";
    if (state.focus === "inactive") return row.pinStatus === "Inactive";
    if (state.focus === "details") return row.matched && !row.detailsComplete;
    if (state.focus === "unmatched") return !row.matched;
    return true;
  }

  function unitPriority(row) {
    if (!row.matched) return 0;
    if (row.pinStatus === "Stale") return 1;
    if (row.pinStatus === "Inactive") return 2;
    if (!row.detailsComplete) return 3;
    return 4;
  }

  function statusTone(status) {
    if (status === "Active") return "good";
    if (status === "Stale") return "bad";
    return "warn";
  }

  function renderUnitRows(row) {
    const units = row.unitRows.filter(unitFocusMatches);
    if (!units.length) return '<p class="subtle pin-unit-empty">No units match the selected focus.</p>';
    return `<div class="pin-unit-table-wrap"><table class="pin-unit-table">
      <thead><tr><th>Unit</th><th>Program</th><th>PIN Status</th><th>Required PIN Details</th><th>Missing</th><th><span class="visually-hidden">Action</span></th></tr></thead>
      <tbody>${units.map((unit) => {
        const detailsLabel = unit.matched ? (unit.detailsComplete ? "Complete" : "Needs follow-up") : "n/a";
        const missingLabel = unit.missing.length ? unit.missing.join(" · ") : "None";
        const link = unit.unitId != null
          ? `<a class="pin-unit-link" href="unit-level.html?unit=${encodeURIComponent(unit.unitId)}">View unit</a>`
          : "";
        return `<tr><td><strong>${esc(unit.unit)}</strong></td><td>${esc(unit.unitType)}</td><td><span class="status ${statusTone(unit.pinStatus)}">${esc(unit.pinStatus)}</span></td><td><span class="status ${unit.detailsComplete ? "good" : "warn"}">${esc(detailsLabel)}</span></td><td>${esc(missingLabel)}</td><td>${link}</td></tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function renderControls(allRows) {
    const areaSelect = document.getElementById("serviceAreaSelect");
    const districtSelect = document.getElementById("districtSelect");
    const previousArea = areaSelect.value;
    const previousDistrict = districtSelect.value;
    const areas = [...new Set(allRows.map((row) => serviceAreaForDistrict(row.district)))].sort();
    areaSelect.innerHTML = `<option value="">All Service Areas</option>${areas.map((area) => `<option value="${esc(area)}">${esc(area)}</option>`).join("")}`;
    areaSelect.value = areas.includes(previousArea) ? previousArea : "";
    const districts = allRows.filter((row) => !areaSelect.value || serviceAreaForDistrict(row.district) === areaSelect.value).map((row) => row.district);
    districtSelect.innerHTML = `<option value="">All Districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
    districtSelect.value = districts.includes(previousDistrict) ? previousDistrict : "";
  }

  function renderKpis(summary) {
    const tiles = [
      ["PIN Currency", p(summary.currency), `${n(summary.active + summary.inactive)} of ${n(summary.units)} tracked units`, "teal"],
      ["Active", n(summary.active), "Current and available", "good"],
      ["Inactive", n(summary.inactive), "Current but unavailable", "warning"],
      ["Stale", n(summary.stale), "More than 12 months since the last update, or update date missing", "danger"],
      ["No Matched PIN", n(summary.unmatched), "Remains in every denominator", "warning"],
    ];
    document.getElementById("pinKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
      <article class="kpi ${tone}"><div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div><div class="kpi-sub">${sub}</div></article>
    `).join("");
  }

  function renderRanking(rows) {
    const ranked = [...rows].sort((a, b) => (b.currency ?? -1) - (a.currency ?? -1) || a.district.localeCompare(b.district));
    document.getElementById("currencyRanking").innerHTML = ranked.length ? ranked.map((row) => `
      <div class="pin-rank-row">
        <strong>${esc(row.district)}</strong>
        <div class="pin-rank-meter" role="img" aria-label="${esc(row.district)} PIN Currency ${p(row.currency)}"><span style="width:${Math.max(0, Math.min(100, (row.currency || 0) * 100))}%"></span></div>
        <span class="num">${p(row.currency)}</span>
      </div>
    `).join("") : '<p class="subtle">No districts match the selected view.</p>';
  }

  function renderComposition(summary) {
    const segments = [
      ["active", "Active", summary.active], ["inactive", "Inactive", summary.inactive],
      ["stale", "Stale", summary.stale], ["unmatched", "No PIN", summary.unmatched],
    ];
    document.getElementById("pinComposition").innerHTML = `
      <div class="pin-composition-bar" role="img" aria-label="${segments.map(([, label, count]) => `${label} ${count}`).join(", ")}">
        ${segments.map(([key, label, count]) => `<span class="${key}" title="${label}: ${n(count)}" style="width:${summary.units ? count / summary.units * 100 : 0}%"></span>`).join("")}
      </div>
      <div class="pin-legend">${segments.map(([key, label, count]) => `<div class="pin-legend-item ${key}"><span>${label}</span><strong>${n(count)}</strong><span>${p(ratio(count, summary.units))}</span></div>`).join("")}</div>
      <p class="subtle">Stale means more than 12 months since the last update, or the update date is blank or unusable.</p>`;
  }

  function renderDetails(summary) {
    document.getElementById("detailsTotal").textContent = `${n(summary.complete)} of ${n(summary.units)} units complete · ${p(summary.completeness)}`;
    const gapDetail = summary.contactGaps && !summary.otherDetailGaps
      ? `${n(summary.contactGaps)} missing required contact information`
      : `${n(summary.contactGaps)} contact · ${n(summary.otherDetailGaps)} status or meeting`;
    const outcomes = [
      ["Essential details complete", summary.complete, p(summary.completeness), "good"],
      ["Missing required details", summary.detailGaps, gapDetail, "warning"],
      ["No matched PIN", summary.unmatched, "Not treated as incomplete PIN data", "danger"],
    ];
    document.getElementById("detailsOutcomes").innerHTML = outcomes.map(([label, value, note, tone]) => `
      <article class="pin-outcome ${tone}"><span>${label}</span><strong>${n(value)}</strong><span>${note}</span></article>
    `).join("");
  }

  function renderTable(rows) {
    const shown = rows.filter(focusMatches).sort((a, b) => (a.currency ?? 2) - (b.currency ?? 2) || a.district.localeCompare(b.district));
    document.getElementById("districtCount").textContent = `${n(shown.length)} districts`;
    document.getElementById("districtPinRows").innerHTML = shown.length ? shown.map((row, index) => {
      const gaps = Math.max(0, row.units - row.complete - row.unmatched);
      const detailId = `district-pin-units-${index}`;
      const expanded = state.expandedDistricts.has(row.district);
      const focusCount = row.unitRows.filter(unitFocusMatches).length;
      return `<tr class="pin-district-row"><td><button class="pin-district-toggle" type="button" data-district="${esc(row.district)}" aria-expanded="${expanded}" aria-controls="${detailId}"><span class="disclosure" aria-hidden="true">${expanded ? "−" : "+"}</span><span><strong>${esc(row.district)}</strong><span class="subtle">${esc(serviceAreaForDistrict(row.district))}</span></span></button></td><td class="num">${n(row.units)}</td><td class="num">${n(row.active)}</td><td class="num">${n(row.inactive)}</td><td class="num">${n(row.stale)}</td><td class="num">${n(row.unmatched)}</td><td class="num"><strong>${p(row.currency)}</strong></td><td><div class="pin-detail-summary"><strong>${n(row.complete)} complete · ${p(row.completeness)}</strong><span>${n(gaps)} need details · ${n(row.unmatched)} no PIN</span></div></td></tr>
        <tr class="pin-unit-detail-row" id="${detailId}"${expanded ? "" : " hidden"}><td colspan="8"><div class="pin-unit-detail"><div class="pin-unit-detail-head"><strong>Individual Unit Status</strong><span>${n(focusCount)} of ${n(row.unitRows.length)} units in current focus</span></div>${renderUnitRows(row)}</div></td></tr>`;
    }).join("") : '<tr><td colspan="8">No districts match the selected focus.</td></tr>';
  }

  function unitHeaderOffset(districtHeaderBottom, unitViewportTop, viewportHeight, headerHeight) {
    return Math.min(Math.max(0, districtHeaderBottom - unitViewportTop), Math.max(0, viewportHeight - headerHeight));
  }

  function syncUnitHeaders() {
    const table = document.querySelector(".pin-table");
    if (!table) return;
    const districtHeader = table.querySelector(":scope > thead th");
    const headerBottom = districtHeader.getBoundingClientRect().bottom;
    table.querySelectorAll(".pin-unit-detail-row:not([hidden]) .pin-unit-table-wrap").forEach((viewport) => {
      const header = viewport.querySelector("thead");
      // The inner scrollport moves with the outer table. Keep its own sticky
      // headings below the district header even after its top has scrolled away.
      const offset = unitHeaderOffset(headerBottom, viewport.getBoundingClientRect().top + viewport.clientTop,
        viewport.clientHeight, header.getBoundingClientRect().height);
      viewport.style.setProperty("--pin-unit-header-offset", `${offset}px`);
    });
  }

  function render() {
    const allRows = summarizeDistricts(state.dashboard?.dashboard, state.unitData);
    renderControls(allRows);
    const rows = selectedRows(allRows);
    const summary = rollup(rows);
    renderKpis(summary);
    renderRanking(rows);
    renderComposition(summary);
    renderDetails(summary);
    renderTable(rows);
    syncUnitHeaders();
  }

  function bind() {
    document.getElementById("serviceAreaSelect").addEventListener("change", () => { renderControls(summarizeDistricts(state.dashboard?.dashboard, state.unitData)); render(); });
    document.getElementById("districtSelect").addEventListener("change", render);
    document.getElementById("pinFocus").addEventListener("click", (event) => {
      const button = event.target.closest("[data-focus]");
      if (!button) return;
      state.focus = button.dataset.focus;
      document.querySelectorAll("[data-focus]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render();
    });
    document.getElementById("districtPinRows").addEventListener("click", (event) => {
      const button = event.target.closest(".pin-district-toggle");
      if (!button) return;
      const district = button.dataset.district;
      const detail = document.getElementById(button.getAttribute("aria-controls"));
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      button.querySelector(".disclosure").textContent = expanded ? "−" : "+";
      detail.hidden = !expanded;
      if (expanded) state.expandedDistricts.add(district);
      else state.expandedDistricts.delete(district);
      syncUnitHeaders();
    });
    const scrollport = document.querySelector(".pin-table").parentElement;
    scrollport.addEventListener("scroll", syncUnitHeaders, { passive: true });
    window.addEventListener("resize", syncUnitHeaders);
    new ResizeObserver(syncUnitHeaders).observe(scrollport);
    window.addEventListener("programfilterchange", render);
  }

  async function init() {
    try {
      [state.dashboard, state.unitData] = await Promise.all([
        fetch("data/latest.json", { cache: "no-store" }).then((response) => response.json()),
        fetch("data/unit-level-latest.json", { cache: "no-store" }).then((response) => response.json()),
      ]);
      const date = state.dashboard.generated_date || state.unitData.data_date || "";
      document.getElementById("generatedDate").textContent = date ? `Data through ${date}` : "Current data";
      document.getElementById("titleDataDate").textContent = date ? `· ${date}` : "";
      bind();
      render();
    } catch (error) {
      document.getElementById("pinKpis").innerHTML = `<article class="kpi danger"><div><div class="kpi-label">PIN data unavailable</div><div class="kpi-value">Unable to load</div></div><div class="kpi-sub">${esc(error.message)}</div></article>`;
    }
  }

  window.PinStatusPage = { unitCountsByDistrict, unitDetailsByDistrict, summarizeDistricts, rollup, unitHeaderOffset };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

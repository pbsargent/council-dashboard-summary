(() => {
  const state = { dashboard: null, unitData: null, focus: "all" };
  const integer = new Intl.NumberFormat("en-US");
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const n = (value) => integer.format(Number(value) || 0);
  const p = (value) => Number.isFinite(value) ? percent.format(value) : "n/a";
  const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
  const cleanDistrict = (value) => window.ProgramFilter?.cleanDistrict(value) || String(value || "").replace(/\s+\d+$/, "").trim();

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
    document.getElementById("districtPinRows").innerHTML = shown.length ? shown.map((row) => {
      const gaps = Math.max(0, row.units - row.complete - row.unmatched);
      return `<tr><td><strong>${esc(row.district)}</strong><span class="subtle">${esc(serviceAreaForDistrict(row.district))}</span></td><td class="num">${n(row.units)}</td><td class="num">${n(row.active)}</td><td class="num">${n(row.inactive)}</td><td class="num">${n(row.stale)}</td><td class="num">${n(row.unmatched)}</td><td class="num"><strong>${p(row.currency)}</strong></td><td><div class="pin-detail-summary"><strong>${n(row.complete)} complete · ${p(row.completeness)}</strong><span>${n(gaps)} need details · ${n(row.unmatched)} no PIN</span></div></td></tr>`;
    }).join("") : '<tr><td colspan="8">No districts match the selected focus.</td></tr>';
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

  window.PinStatusPage = { unitCountsByDistrict, summarizeDistricts, rollup };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

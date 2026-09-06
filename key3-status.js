(() => {
  const integer = new Intl.NumberFormat("en-US");
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  const state = { data: null, expandedAreas: new Set(), expandedDistricts: new Set() };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const n = (value) => integer.format(Number(value) || 0);
  const p = (numerator, denominator) => denominator ? percent.format(numerator / denominator) : "n/a";
  const missing = (row, role) => (row?.missing_roles || []).includes(role);

  function parseDateOnly(value) {
    if (!value) return null;
    const text = String(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function sytExpirationState(value, todayValue = new Date()) {
    const expiration = parseDateOnly(value);
    if (!expiration) return { label: "SYT expiration unavailable", urgent: false, daysRemaining: null };
    const today = new Date(todayValue);
    today.setHours(0, 0, 0, 0);
    const daysRemaining = Math.round((expiration - today) / 86400000);
    const dateLabel = expiration.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return {
      label: daysRemaining < 0 ? `SYT expired ${dateLabel}` : `SYT expires ${dateLabel}`,
      urgent: daysRemaining <= 90,
      daysRemaining,
    };
  }

  function summarize(rows) {
    return {
      units: rows.length,
      complete: rows.filter((row) => row.status === "Complete").length,
      missingAny: rows.filter((row) => row.status !== "Complete").length,
      missingUnitLeader: rows.filter((row) => missing(row, "Unit Leader")).length,
      missingCommitteeChair: rows.filter((row) => missing(row, "Committee Chair")).length,
      missingCorCur: rows.filter((row) => missing(row, "COR / CUR")).length,
    };
  }

  function summarizeByUnitType(rows) {
    const order = ["Pack", "Troop", "Crew", "Ship", "Post"];
    return order.map((unitType) => {
      const typeRows = rows.filter((row) => row.unit_type === unitType);
      return { unitType, ...summarize(typeRows) };
    }).filter((row) => row.units > 0);
  }

  function matchesFocus(row, focus) {
    if (focus === "missing") return row.status !== "Complete";
    if (focus === "complete") return row.status === "Complete";
    if (focus === "unit-leader") return missing(row, "Unit Leader");
    if (focus === "committee-chair") return missing(row, "Committee Chair");
    if (focus === "cor-cur") return missing(row, "COR / CUR");
    return true;
  }

  function serviceArea(row) {
    return row.service_area || "Other / Unassigned";
  }

  function sortUnits(rows) {
    return [...rows].sort((a, b) =>
      (b.missing_roles?.length || 0) - (a.missing_roles?.length || 0)
      || String(a.unit).localeCompare(String(b.unit), undefined, { numeric: true })
    );
  }

  function districtKey(area, district) {
    return `${area}|${district}`;
  }

  function buildHierarchy(rows) {
    const areas = new Map();
    for (const row of rows) {
      const area = serviceArea(row);
      if (!areas.has(area)) areas.set(area, new Map());
      const districts = areas.get(area);
      if (!districts.has(row.district)) districts.set(row.district, []);
      districts.get(row.district).push(row);
    }
    return [...areas.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([area, districts]) => ({
        area,
        rows: [...districts.values()].flat(),
        districts: [...districts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([district, districtRows]) => ({ district, rows: sortUnits(districtRows) })),
      }));
  }

  function holderSearchText(row) {
    return [row.unit_leaders, row.committee_chairs, row.cor_cur_holders]
      .flatMap((holders) => holders || [])
      .flatMap((holder) => [holder.name, holder.position])
      .join(" ");
  }

  function programRows() {
    return (state.data?.dashboard?.unit_key3_statuses || [])
      .filter((row) => window.ProgramFilter?.matchesUnitType(row.unit_type) ?? true);
  }

  function filteredRows() {
    const area = document.getElementById("serviceAreaSelect").value;
    const district = document.getElementById("districtSelect").value;
    const focus = document.getElementById("focusSelect").value;
    const search = document.getElementById("searchInput").value.trim().toLocaleLowerCase();
    return programRows().filter((row) => {
      if (area && serviceArea(row) !== area) return false;
      if (district && row.district !== district) return false;
      if (!matchesFocus(row, focus)) return false;
      if (!search) return true;
      return [row.district, row.unit, row.unit_type, holderSearchText(row)]
        .some((value) => String(value || "").toLocaleLowerCase().includes(search));
    });
  }

  function renderControls() {
    const rows = programRows();
    const areaSelect = document.getElementById("serviceAreaSelect");
    const districtSelect = document.getElementById("districtSelect");
    const previousArea = areaSelect.value;
    const previousDistrict = districtSelect.value;
    const areas = [...new Set(rows.map(serviceArea))].sort();
    areaSelect.innerHTML = `<option value="">All Service Areas</option>${areas.map((area) => `<option value="${esc(area)}">${esc(area)}</option>`).join("")}`;
    areaSelect.value = areas.includes(previousArea) ? previousArea : "";
    const districts = [...new Set(rows.filter((row) => !areaSelect.value || serviceArea(row) === areaSelect.value).map((row) => row.district))].sort();
    districtSelect.innerHTML = `<option value="">All Districts</option>${districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")}`;
    districtSelect.value = districts.includes(previousDistrict) ? previousDistrict : "";
  }

  function renderKpis(summary) {
    const tiles = [
      ["Complete Key 3", n(summary.complete), `${p(summary.complete, summary.units)} of ${n(summary.units)} units`, "good"],
      ["Missing Any", n(summary.missingAny), `${p(summary.missingAny, summary.units)} of selected units`, "danger"],
      ["Missing Unit Leader", n(summary.missingUnitLeader), "Program-specific unit leader", "warning"],
      ["Missing Committee Chair", n(summary.missingCommitteeChair), "Current registration required", "warning"],
      ["Missing COR / CUR", n(summary.missingCorCur), "Either current position satisfies coverage", "warning"],
    ];
    document.getElementById("key3Kpis").innerHTML = tiles.map(([label, value, note, tone]) => `
      <article class="kpi ${tone}"><div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div><div class="kpi-sub">${note}</div></article>
    `).join("");
  }

  function renderUnitTypeSummary(rows) {
    const summaries = summarizeByUnitType(rows);
    document.getElementById("unitTypeRows").innerHTML = summaries.length ? summaries.map((row) => `
      <tr><td><strong>${esc(row.unitType)}</strong></td><td class="num">${n(row.units)}</td><td class="num">${n(row.complete)}</td><td class="num">${n(row.missingAny)}</td><td class="num">${n(row.missingUnitLeader)}</td><td class="num">${n(row.missingCommitteeChair)}</td><td class="num">${n(row.missingCorCur)}</td><td class="num"><strong>${p(row.complete, row.units)}</strong></td></tr>
    `).join("") : '<tr><td colspan="8">No unit types match the selected filters.</td></tr>';
  }

  function renderHolders(holders, missingLabel) {
    if (!holders?.length) return `<span class="key3-missing">${esc(missingLabel)}</span>`;
    return holders.map((holder) => {
      const syt = sytExpirationState(holder.syt_expires);
      return `<div class="key3-person"><strong>${esc(holder.name)}</strong><span class="key3-syt${syt.urgent ? " urgent" : ""}">${esc(syt.label)}</span></div>`;
    }).join("");
  }

  function renderUnitTable(rows) {
    return `<div class="key3-unit-table-wrap"><table class="key3-detail-table">
      <thead><tr><th>Unit</th><th>Program</th><th>Status</th><th>Missing</th><th>Unit Leader</th><th>Committee Chair</th><th>COR / CUR</th><th><span class="visually-hidden">Action</span></th></tr></thead>
      <tbody>${rows.map((row) => {
      const complete = row.status === "Complete";
      const detailLink = row.unit_id
        ? `<a class="key3-unit-link" href="unit-level.html?unit=${encodeURIComponent(row.unit_id)}">View unit</a>`
        : "";
      return `<tr><td><strong>${esc(row.unit)}</strong></td><td>${esc(row.unit_type)}</td><td><span class="status ${complete ? "good" : "bad"}">${esc(row.status)}</span></td><td>${row.missing_roles?.length ? `<span class="key3-missing">${esc(row.missing_roles.join(" · "))}</span>` : "None"}</td><td>${renderHolders(row.unit_leaders, "MISSING")}</td><td>${renderHolders(row.committee_chairs, "MISSING")}</td><td>${renderHolders(row.cor_cur_holders, "MISSING")}</td><td>${detailLink}</td></tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function coverageSummary(rows) {
    const summary = summarize(rows);
    return `${n(summary.units)} units · ${n(summary.complete)} complete · ${n(summary.missingAny)} missing`;
  }

  function renderUnits(rows) {
    const hierarchy = buildHierarchy(rows);
    const districtCount = hierarchy.reduce((total, area) => total + area.districts.length, 0);
    const searchActive = Boolean(document.getElementById("searchInput").value.trim());
    const selectedArea = document.getElementById("serviceAreaSelect").value;
    const selectedDistrict = document.getElementById("districtSelect").value;
    document.getElementById("unitCount").textContent = `${n(rows.length)} units · ${n(districtCount)} districts`;
    document.getElementById("unitHierarchy").innerHTML = hierarchy.length ? hierarchy.map((area, areaIndex) => {
      const areaId = `key3-area-${areaIndex}`;
      const areaExpanded = state.expandedAreas.has(area.area) || searchActive || selectedArea === area.area || Boolean(selectedDistrict);
      return `<section class="key3-area-group">
        <button class="key3-area-toggle" type="button" data-area="${esc(area.area)}" aria-expanded="${areaExpanded}" aria-controls="${areaId}">
          <span class="disclosure" aria-hidden="true">${areaExpanded ? "−" : "+"}</span>
          <span class="key3-group-label"><strong>${esc(area.area)}</strong><span>${coverageSummary(area.rows)} · ${n(area.districts.length)} districts</span></span>
          <span class="key3-group-rate">${p(summarize(area.rows).complete, area.rows.length)}</span>
        </button>
        <div class="key3-area-content" id="${areaId}"${areaExpanded ? "" : " hidden"}>
          ${area.districts.map((district, districtIndex) => {
            const detailId = `key3-district-${areaIndex}-${districtIndex}`;
            const key = districtKey(area.area, district.district);
            const districtExpanded = state.expandedDistricts.has(key) || searchActive || selectedDistrict === district.district;
            const districtSummary = summarize(district.rows);
            return `<section class="key3-district-group">
              <button class="key3-district-toggle" type="button" data-area="${esc(area.area)}" data-district="${esc(district.district)}" aria-expanded="${districtExpanded}" aria-controls="${detailId}">
                <span class="disclosure" aria-hidden="true">${districtExpanded ? "−" : "+"}</span>
                <span class="key3-group-label"><strong>${esc(district.district)}</strong><span>${coverageSummary(district.rows)}</span></span>
                <span class="status ${districtSummary.missingAny ? "warn" : "good"}">${districtSummary.missingAny ? `${n(districtSummary.missingAny)} need follow-up` : "Complete"}</span>
              </button>
              <div class="key3-district-content" id="${detailId}"${districtExpanded ? "" : " hidden"}>${renderUnitTable(district.rows)}</div>
            </section>`;
          }).join("")}
        </div>
      </section>`;
    }).join("") : '<p class="subtle key3-empty">No units match the selected filters.</p>';
  }

  function render() {
    const rows = filteredRows();
    renderKpis(summarize(rows));
    renderUnitTypeSummary(rows);
    renderUnits(rows);
  }

  function bind() {
    document.getElementById("serviceAreaSelect").addEventListener("change", () => { renderControls(); render(); });
    document.getElementById("districtSelect").addEventListener("change", render);
    document.getElementById("focusSelect").addEventListener("change", render);
    document.getElementById("searchInput").addEventListener("input", render);
    document.getElementById("unitHierarchy").addEventListener("click", (event) => {
      const areaButton = event.target.closest(".key3-area-toggle");
      const districtButton = event.target.closest(".key3-district-toggle");
      const button = districtButton || areaButton;
      if (!button) return;
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      button.querySelector(".disclosure").textContent = expanded ? "−" : "+";
      document.getElementById(button.getAttribute("aria-controls")).hidden = !expanded;
      const collection = districtButton ? state.expandedDistricts : state.expandedAreas;
      const key = districtButton ? districtKey(button.dataset.area, button.dataset.district) : button.dataset.area;
      if (expanded) collection.add(key);
      else collection.delete(key);
    });
    document.getElementById("expandAll").addEventListener("click", () => {
      for (const area of buildHierarchy(filteredRows())) {
        state.expandedAreas.add(area.area);
        for (const district of area.districts) state.expandedDistricts.add(districtKey(area.area, district.district));
      }
      render();
    });
    document.getElementById("collapseAll").addEventListener("click", () => {
      state.expandedAreas.clear();
      state.expandedDistricts.clear();
      render();
    });
    window.addEventListener("programfilterchange", () => { renderControls(); render(); });
  }

  async function init() {
    try {
      state.data = await fetch("data/latest.json", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      if (!Array.isArray(state.data?.dashboard?.unit_key3_statuses)) throw new Error("Unit Key 3 data is missing from this snapshot");
      const date = state.data.generated_date || state.data.dashboard.report_date || "";
      document.getElementById("generatedDate").textContent = date ? `Data through ${date}` : "Current data";
      document.getElementById("titleDataDate").textContent = date ? `· ${date}` : "";
      renderControls();
      bind();
      render();
    } catch (error) {
      document.getElementById("key3Kpis").innerHTML = `<article class="kpi danger"><div><div class="kpi-label">Unit Key 3 data unavailable</div><div class="kpi-value">Unable to load</div></div><div class="kpi-sub">${esc(error.message)}</div></article>`;
      document.getElementById("unitTypeRows").innerHTML = '<tr><td colspan="8">Unit Key 3 data is unavailable.</td></tr>';
      document.getElementById("unitHierarchy").innerHTML = '<p class="subtle key3-empty">Unit Key 3 data is unavailable.</p>';
    }
  }

  const api = { summarize, summarizeByUnitType, matchesFocus, sortUnits, districtKey, buildHierarchy, parseDateOnly, sytExpirationState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Key3StatusPage = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();

(() => {
  const integer = new Intl.NumberFormat("en-US");
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  const state = { data: null };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const n = (value) => integer.format(Number(value) || 0);
  const p = (numerator, denominator) => denominator ? percent.format(numerator / denominator) : "n/a";
  const missing = (row, role) => (row?.missing_roles || []).includes(role);

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
    return holders.map((holder) => `<div class="key3-person"><strong>${esc(holder.name)}</strong><span>${esc(holder.position)}</span></div>`).join("");
  }

  function renderUnits(rows) {
    const shown = [...rows].sort((a, b) =>
      (b.missing_roles?.length || 0) - (a.missing_roles?.length || 0)
      || String(a.district).localeCompare(String(b.district))
      || String(a.unit).localeCompare(String(b.unit), undefined, { numeric: true })
    );
    document.getElementById("unitCount").textContent = `${n(shown.length)} units`;
    document.getElementById("unitRows").innerHTML = shown.length ? shown.map((row) => {
      const complete = row.status === "Complete";
      const detailLink = row.unit_id
        ? `<a class="key3-unit-link" href="unit-level.html?unit=${encodeURIComponent(row.unit_id)}">View unit</a>`
        : "";
      return `<tr><td>${esc(row.district)}</td><td><strong>${esc(row.unit)}</strong></td><td><span class="status ${complete ? "good" : "bad"}">${esc(row.status)}</span></td><td>${row.missing_roles?.length ? `<span class="key3-missing">${esc(row.missing_roles.join(" · "))}</span>` : "None"}</td><td>${renderHolders(row.unit_leaders, "MISSING")}</td><td>${renderHolders(row.committee_chairs, "MISSING")}</td><td>${renderHolders(row.cor_cur_holders, "MISSING")}</td><td>${detailLink}</td></tr>`;
    }).join("") : '<tr><td colspan="8">No units match the selected filters.</td></tr>';
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
      document.getElementById("unitRows").innerHTML = '<tr><td colspan="8">Unit Key 3 data is unavailable.</td></tr>';
    }
  }

  const api = { summarize, summarizeByUnitType, matchesFocus };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Key3StatusPage = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();

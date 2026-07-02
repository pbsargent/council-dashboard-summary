const data = window.RENEWAL_BOARD_DATA;
const state = {
  district: "",
  status: "",
  match: "",
  search: "",
  openServiceAreas: new Set(),
  openGroups: new Set(),
  selectedId: null,
};

const fmt = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function n(value) {
  return value == null || Number.isNaN(Number(value)) ? "n/a" : fmt.format(value);
}

function p(value) {
  return value == null || Number.isNaN(Number(value)) ? "n/a" : pct.format(value);
}

function statusClass(value) {
  const label = String(value || "blank").toLowerCase();
  if (label === "completed") return "completed";
  if (label === "renewing") return "renewing";
  if (label === "dropping") return "dropping";
  if (label === "stuck") return "stuck";
  if (label === "not started") return "not-started";
  if (label === "blank") return "blank";
  return "other";
}

function rowSearch(row) {
  return [
    row.name,
    row.district,
    row.owner,
    row.commissioner,
    row.charterOrg,
    row.unitLeader,
    row.beAScoutContact,
    row.dropRenew,
    row.initiated,
    row.submitted,
    row.pendingAcceptance,
    row.posted,
  ].join(" ").toLowerCase();
}

function rowMatches(row) {
  const values = [row.dropRenew, row.initiated, row.submitted, row.pendingAcceptance, row.posted];
  return (!state.district || row.group === state.district)
    && (!state.status || values.includes(state.status))
    && (!state.match || (state.match === "matched" ? row.matchedDashboardUnit : !row.matchedDashboardUnit))
    && (!state.search || rowSearch(row).includes(state.search));
}

function filteredRows() {
  return data.rows.filter(rowMatches);
}

function groupedRows() {
  const rows = filteredRows();
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push(row);
  }
  return [...groups.entries()]
    .map(([name, rowsForGroup]) => {
      const source = data.groups.find((group) => group.name === name);
      return { ...source, rows: rowsForGroup };
    })
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

function hierarchyRows() {
  const districts = groupedRows();
  const serviceAreas = new Map();
  for (const district of districts) {
    const serviceName = district.serviceArea || "Unassigned";
    if (!serviceAreas.has(serviceName)) {
      serviceAreas.set(serviceName, {
        name: serviceName,
        fieldDirector: district.serviceAreaFieldDirector || "",
        districts: [],
        rows: [],
      });
    }
    const service = serviceAreas.get(serviceName);
    service.districts.push(district);
    service.rows.push(...district.rows);
    if (!service.fieldDirector && district.serviceAreaFieldDirector) {
      service.fieldDirector = district.serviceAreaFieldDirector;
    }
  }
  const order = {
    North: 0,
    Northern: 0,
    "Northern Service Area": 0,
    Central: 1,
    "Central Service Area": 1,
    South: 2,
    Southern: 2,
    "Southern Service Area": 2,
    Unassigned: 9,
  };
  return [...serviceAreas.values()]
    .map(service => ({
      ...service,
      districts: service.districts.sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (order[a.name] ?? 8) - (order[b.name] ?? 8) || a.name.localeCompare(b.name));
}

function countsFor(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const label = row[key] || "Blank";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const order = { Renewing: 0, Completed: 0, Dropping: 1, Stuck: 1, "Not Started": 2, Blank: 3 };
  return [...counts.entries()]
    .sort((a, b) => (order[a[0]] ?? 9) - (order[b[0]] ?? 9) || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function completedFor(rows, key) {
  if (key === "dropRenew") return rows.filter(row => row.dropRenew === "Renewing").length;
  return rows.filter(row => row[key] === "Completed").length;
}

function progressFor(rows) {
  const keys = ["dropRenew", "initiated", "submitted", "pendingAcceptance", "posted"];
  if (!rows.length) return 0;
  const completed = keys.reduce((total, key) => total + completedFor(rows, key), 0);
  return Math.round(completed / (rows.length * keys.length) * 100);
}

function renderKpis() {
  const summary = data.summary;
  const renewal = summary.renewNewDrop;
  const cards = [
    ["monday rows", summary.mondayRows, `${summary.matchedRows} matched to Units`],
    ["posted complete", summary.postedCompleted, `${Math.round(summary.postedCompleted / summary.mondayRows * 100)}% of monday rows`],
    ["dropping", summary.dropping, "monday Drop/Renew field"],
    ["needs attention", summary.unmatchedRows, "drop, stuck, or unposted edge cases"],
    ["youth in matched rows", summary.totalYouth, "from Units tab"],
    ["renew/new/drop", `${renewal.renewed}/${renewal.new}/${renewal.dropped}`, "dashboard event lists"],
  ];
  document.getElementById("kpis").innerHTML = cards.map(([label, value, note]) => `
    <article class="kpi">
      <span>${esc(label)}</span>
      <strong>${esc(typeof value === "number" ? n(value) : value)}</strong>
      <small>${esc(note)}</small>
    </article>
  `).join("");
}

function renderMeta() {
  document.getElementById("generatedAt").textContent = dateFmt.format(new Date(data.metadata.generatedAt));
  document.getElementById("mondayWorkbook").textContent = data.metadata.mondayWorkbook;
  document.getElementById("dashboardWorkbook").textContent = data.metadata.dashboardWorkbook;
  const hierarchy = data.metadata.hierarchy || {};
  document.getElementById("hierarchySource").textContent = hierarchy.boardName
    ? `${hierarchy.source} (${hierarchy.boardName})`
    : hierarchy.source || "Workbook fallback";
}

function renderControls() {
  const districts = [...new Set(data.rows.map(row => row.group))].sort((a, b) => a.localeCompare(b));
  const statuses = [...new Set(data.rows.flatMap(row => [
    row.dropRenew,
    row.initiated,
    row.submitted,
    row.pendingAcceptance,
    row.posted,
  ]))].filter(Boolean).sort((a, b) => a.localeCompare(b));

  document.getElementById("districtFilter").innerHTML = `<option value="">All districts</option>${
    districts.map(district => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
  document.getElementById("statusFilter").innerHTML = `<option value="">All statuses</option>${
    statuses.map(status => `<option value="${esc(status)}">${esc(status)}</option>`).join("")
  }`;
}

function stageCell(rows, key, label) {
  const counts = countsFor(rows, key);
  const total = rows.length || 1;
  const main = counts[0] || { label: "Blank", count: 0 };
  return `
    <div class="stage-cell" title="${esc(counts.map(item => `${item.label}: ${item.count}`).join("; "))}">
      <div class="bar-label"><span>${esc(label)}</span><span>${esc(main.label)} ${n(main.count)}</span></div>
      <div class="track stacked">
        ${counts.map(item => `
          <span class="seg ${statusClass(item.label)}" style="width:${item.count / total * 100}%"></span>
        `).join("")}
      </div>
    </div>
  `;
}

function unitChip(value) {
  return `<span class="status-chip ${statusClass(value)}">${esc(value || "Blank")}</span>`;
}

function serviceLabel(name) {
  return String(name || "Unassigned").includes("Service Area") ? name : `${name} Service Area`;
}

function districtContext(group) {
  return [
    group.districtProfessionalRole && group.districtProfessional
      ? `${group.districtProfessionalRole}: ${group.districtProfessional}`
      : group.districtProfessional,
    group.districtChair ? `Chair: ${group.districtChair}` : "",
    group.districtCommissionerFromHierarchy ? `Commissioner: ${group.districtCommissionerFromHierarchy}` : "",
  ].filter(Boolean).join(" · ");
}

function renderUnitRow(row) {
  const selected = state.selectedId === row.id ? " selected" : "";
  return `
    <button class="unit-row${selected}" type="button" data-unit-id="${esc(row.id)}">
      <strong>${esc(row.name)}</strong>
      ${unitChip(row.dropRenew)}
      ${unitChip(row.initiated)}
      ${unitChip(row.submitted)}
      ${unitChip(row.pendingAcceptance)}
      ${unitChip(row.posted)}
      <span class="row-meta">${esc(row.commissioner || row.owner || "Unassigned")}</span>
      <span class="row-meta">${row.matchedDashboardUnit ? "Matched" : "No match"}</span>
    </button>
  `;
}

function renderBoard() {
  const services = hierarchyRows();
  const groups = services.flatMap(service => service.districts);
  const visibleRows = filteredRows();
  document.getElementById("visibleCount").textContent = `${n(visibleRows.length)} units`;
  document.getElementById("collapseAll").disabled = !services.some(service => state.openServiceAreas.has(service.name) || service.districts.some(group => state.openGroups.has(group.name)));
  document.getElementById("expandAll").disabled = services.length > 0
    && services.every(service => state.openServiceAreas.has(service.name))
    && groups.every(group => state.openGroups.has(group.name));

  document.getElementById("groupRows").innerHTML = services.map((service, serviceIndex) => {
    const serviceOpen = state.openServiceAreas.has(service.name);
    const serviceProgress = progressFor(service.rows);
    const stripeColors = ["#5d9cec", "#f35f83", "#f6b453", "#a56de2", "#7cc95f", "#17b897"];
    return `
      <article class="service-block${serviceOpen ? " open" : ""}">
        <button class="service-row" type="button" data-service="${esc(service.name)}" aria-expanded="${serviceOpen ? "true" : "false"}">
          <div class="district-cell">
            <span class="district-stripe service-stripe" style="background:${stripeColors[serviceIndex % stripeColors.length]}"></span>
            <span class="disclosure" aria-hidden="true">›</span>
            <span class="district-title">
              <strong>${esc(serviceLabel(service.name))}</strong>
              <span>${n(service.rows.length)} units · ${n(service.districts.length)} districts · ${n(service.rows.filter(row => row.matchedDashboardUnit).length)} matched${service.fieldDirector ? ` · ${esc(service.fieldDirector)}` : ""}</span>
            </span>
          </div>
          <div class="progress-cell">
            <span class="progress-number">${serviceProgress}%</span>
            <div class="track"><div class="fill" style="--w:${serviceProgress}%"></div></div>
          </div>
          ${stageCell(service.rows, "dropRenew", "Drop/Renew")}
          ${stageCell(service.rows, "initiated", "Initiated")}
          ${stageCell(service.rows, "submitted", "Submitted")}
          ${stageCell(service.rows, "pendingAcceptance", "Pending")}
          ${stageCell(service.rows, "posted", "Posted")}
        </button>
        <div class="district-list">
          ${service.districts.map((group, index) => {
    const progress = progressFor(group.rows);
    const open = state.openGroups.has(group.name) ? " open" : "";
    const expanded = state.openGroups.has(group.name) ? "true" : "false";
    return `
      <article class="group-block${open}">
        <button class="group-row" type="button" data-group="${esc(group.name)}" aria-expanded="${expanded}">
          <div class="district-cell">
            <span class="district-stripe" style="background:${stripeColors[index % stripeColors.length]}"></span>
            <span class="disclosure" aria-hidden="true">›</span>
            <span class="district-title">
              <strong>${esc(group.name)}</strong>
              <span>${n(group.rows.length)} visible of ${n(group.count)} tasks · ${n(group.rows.filter(row => row.matchedDashboardUnit).length)} matched${districtContext(group) ? ` · ${esc(districtContext(group))}` : ""}</span>
            </span>
          </div>
          <div class="progress-cell">
            <span class="progress-number">${progress}%</span>
            <div class="track"><div class="fill" style="--w:${progress}%"></div></div>
          </div>
          ${stageCell(group.rows, "dropRenew", "Drop/Renew")}
          ${stageCell(group.rows, "initiated", "Initiated")}
          ${stageCell(group.rows, "submitted", "Submitted")}
          ${stageCell(group.rows, "pendingAcceptance", "Pending")}
          ${stageCell(group.rows, "posted", "Posted")}
        </button>
        <div class="unit-list">
          ${group.rows.sort((a, b) => a.name.localeCompare(b.name)).map(renderUnitRow).join("")}
        </div>
      </article>
    `;
          }).join("")}
        </div>
      </article>
    `;
  }).join("") || `<div class="empty-state">No renewal rows match the current filters.</div>`;
}

function detailValue(label, value, wide = false) {
  return `
    <div class="${wide ? "detail-wide" : ""}">
      <span>${esc(label)}</span>
      <strong>${esc(value || "n/a")}</strong>
    </div>
  `;
}

function renderDetail() {
  const row = data.rows.find(item => item.id === state.selectedId);
  const detail = document.getElementById("unitDetail");
  if (!row) {
    detail.className = "unit-detail empty-state";
    detail.textContent = "Select a unit row to see dashboard workbook enrichment.";
    return;
  }
  detail.className = "unit-detail detail-section";
  detail.innerHTML = `
    <div class="detail-title">
      <strong>${esc(row.name)}</strong>
      <span>${esc(row.group)} · ${esc(row.timeline || "No timeline")}</span>
    </div>
    <div class="detail-grid">
      ${detailValue("Drop/Renew", row.dropRenew)}
      ${detailValue("Posted", row.posted)}
      ${detailValue("Owner", row.owner)}
      ${detailValue("Commissioner", row.commissioner)}
      ${detailValue("Service area", row.serviceArea)}
      ${detailValue("District professional", [row.districtProfessionalRole, row.districtProfessional].filter(Boolean).join(": "))}
      ${detailValue("Dashboard status", row.dashboardRenewalStatus)}
      ${detailValue("Pin status", row.pinStatus)}
      ${detailValue("Total youth", n(row.totalYouth))}
      ${detailValue("Total adults", n(row.totalAdults))}
      ${detailValue("Primary YTY", n(row.primaryYty))}
      ${detailValue("Unit metric", n(row.unitMetric))}
      ${detailValue("SYT", p(row.syt))}
      ${detailValue("All leaders trained", p(row.allLeaderTrained))}
      ${detailValue("Unit leader", row.unitLeader, true)}
      ${detailValue("Charter org", row.charterOrg, true)}
      ${detailValue("BeAScout contact", [row.beAScoutContact, row.beAScoutEmail, row.beAScoutPhone].filter(Boolean).join(" · "), true)}
      ${detailValue("Meeting address", row.beAScoutAddress, true)}
    </div>
    <p class="events-note">${row.matchedDashboardUnit ? "Matched to dashboard Units tab." : "No matching Units tab row found; this is likely a drop, stuck, or unposted item."}</p>
  `;
}

function eventTable(title, rows) {
  return `
    <article class="event-card">
      <h3>${esc(title)} · ${n(rows.length)}</h3>
      <table>
        <thead><tr><th>District</th><th>Unit</th><th>Renewal</th><th>When</th></tr></thead>
        <tbody>
          ${rows.slice(0, 12).map(row => `
            <tr>
              <td>${esc(row.district)}</td>
              <td>${esc(row.unit)}</td>
              <td>${esc(row.renewal)}</td>
              <td>${esc(row.when)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderEvents() {
  const events = data.renewNewDrop;
  document.getElementById("eventLists").innerHTML = [
    eventTable("Renewed since 1/1/26", events.renewed),
    eventTable("New since 1/1/26", events.new),
    eventTable("Dropped since 1/1/26", events.dropped),
  ].join("");
}

function rerender() {
  renderBoard();
  renderDetail();
}

function bindEvents() {
  document.getElementById("districtFilter").addEventListener("change", event => {
    state.district = event.target.value;
    rerender();
  });
  document.getElementById("statusFilter").addEventListener("change", event => {
    state.status = event.target.value;
    rerender();
  });
  document.getElementById("matchFilter").addEventListener("change", event => {
    state.match = event.target.value;
    rerender();
  });
  document.getElementById("searchInput").addEventListener("input", event => {
    state.search = event.target.value.trim().toLowerCase();
    rerender();
  });
  document.getElementById("collapseAll").addEventListener("click", () => {
    state.openServiceAreas.clear();
    state.openGroups.clear();
    renderBoard();
  });
  document.getElementById("expandAll").addEventListener("click", () => {
    for (const service of hierarchyRows()) {
      state.openServiceAreas.add(service.name);
      for (const group of service.districts) {
        state.openGroups.add(group.name);
      }
    }
    renderBoard();
  });
  document.getElementById("groupRows").addEventListener("click", event => {
    const serviceButton = event.target.closest("[data-service]");
    const groupButton = event.target.closest("[data-group]");
    const unitButton = event.target.closest("[data-unit-id]");
    if (unitButton) {
      state.selectedId = unitButton.dataset.unitId;
      renderBoard();
      renderDetail();
      return;
    }
    if (serviceButton) {
      const service = serviceButton.dataset.service;
      if (state.openServiceAreas.has(service)) state.openServiceAreas.delete(service);
      else state.openServiceAreas.add(service);
      renderBoard();
      return;
    }
    if (groupButton) {
      const group = groupButton.dataset.group;
      if (state.openGroups.has(group)) state.openGroups.delete(group);
      else state.openGroups.add(group);
      renderBoard();
    }
  });
}

function init() {
  renderMeta();
  renderKpis();
  renderControls();
  renderEvents();
  bindEvents();
  rerender();
}

init();

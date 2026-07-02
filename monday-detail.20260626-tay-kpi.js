const state = {
  monday: null,
  dashboard: null,
  rows: [],
};

const fmt = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const centralTimestamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const centralDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function n(value) {
  return value == null || Number.isNaN(value) ? "n/a" : fmt.format(value);
}

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function dateLabel(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : centralTimestamp.format(date);
}

function shortDateLabel(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : centralDate.format(date);
}

function boardName(board) {
  return {
    prospects: "Hot Prospects",
    renewals: "2026 Unit Renewal",
    schools: "Schools",
  }[board] || board;
}

function rowDistrict(row) {
  return row.district || row.scouting_district || "Unassigned";
}

function districtLabels(value) {
  const labels = String(value || "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  return labels.length ? labels : ["Unassigned"];
}

function numeric(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function councilTaySummary() {
  const members = numeric(state.dashboard?.dashboard?.council?.members);
  const schools = state.monday?.boards?.schools?.rows || [];
  const tay = schools.reduce((total, row) => total + numeric(row.tay), 0);
  return {
    members,
    tay,
    pct: tay ? members / tay : null,
  };
}

function rowStatus(row) {
  if (row.board === "prospects") return row.status || "Unlabeled";
  if (row.board === "renewals") return row.posted || row.intent || "Unlabeled";
  return row.status || "Unlabeled";
}

function rowType(row) {
  if (row.board === "prospects") return row.unit_type || "n/a";
  if (row.board === "renewals") return row.intent || "n/a";
  return row.school_district || "n/a";
}

function rowTiming(row) {
  if (row.board === "prospects") return row.projected_start || "Unscheduled";
  if (row.board === "renewals") return row.timeline || "n/a";
  return row.tay ? `${row.tay} TAY` : "n/a";
}

function rowFollowUp(row) {
  if (row.board === "prospects") {
    return [
      row.contact_stage && `Contact: ${row.contact_stage}`,
      row.first_visit && `Visit: ${row.first_visit}`,
      row.charter_stage && `Charter: ${row.charter_stage}`,
    ].filter(Boolean).join("; ") || "n/a";
  }
  if (row.board === "renewals") {
    return [
      row.initiated && `Initiated: ${row.initiated}`,
      row.submitted && `Submitted: ${row.submitted}`,
      row.pending_acceptance && `Pending: ${row.pending_acceptance}`,
    ].filter(Boolean).join("; ") || "n/a";
  }
  return [
    row.unit_associated && `Unit: ${row.unit_associated}`,
    row.principal_meeting && `Principal meeting: ${row.principal_meeting}`,
    row.city && row.city,
  ].filter(Boolean).join("; ") || "n/a";
}

function rowSearchText(row) {
  return [
    boardName(row.board),
    row.name,
    rowDistrict(row),
    rowStatus(row),
    rowType(row),
    rowTiming(row),
    rowFollowUp(row),
    row.group,
    row.city,
    row.county,
  ].join(" ").toLowerCase();
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const key = getter(row) || "Unassigned";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function currentRows() {
  const board = document.getElementById("boardSelect").value;
  const district = document.getElementById("districtSelect").value;
  const status = document.getElementById("statusSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return state.rows.filter((row) => {
    return (board === "all" || row.board === board)
      && (!district || rowDistrict(row) === district)
      && (!status || rowStatus(row) === status)
      && (!q || rowSearchText(row).includes(q));
  });
}

function renderMeta() {
  document.getElementById("generatedDate").textContent = dateLabel(state.monday.generated_at);
  document.getElementById("titleDataDate").textContent = `Data extracted ${dateLabel(state.monday.generated_at)}`;
}

function renderControls() {
  const board = document.getElementById("boardSelect").value;
  let selectedDistrict = document.getElementById("districtSelect").value;
  let selectedStatus = document.getElementById("statusSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const boardRows = state.rows.filter((row) => {
    return (board === "all" || row.board === board)
      && (!q || rowSearchText(row).includes(q));
  });

  const districtRows = selectedStatus
    ? boardRows.filter((row) => rowStatus(row) === selectedStatus)
    : boardRows;
  const statusRows = selectedDistrict
    ? boardRows.filter((row) => rowDistrict(row) === selectedDistrict)
    : boardRows;

  const districts = [...new Set(districtRows.map(rowDistrict).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const statuses = [...new Set(statusRows.map(rowStatus).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  if (selectedDistrict && !districts.includes(selectedDistrict)) selectedDistrict = "";
  if (selectedStatus && !statuses.includes(selectedStatus)) selectedStatus = "";

  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${
    districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
  document.getElementById("statusSelect").innerHTML = `<option value="">All statuses</option>${
    statuses.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join("")
  }`;

  document.getElementById("districtSelect").value = selectedDistrict;
  document.getElementById("statusSelect").value = selectedStatus;
}

function renderKpis() {
  const rows = currentRows();
  const tay = councilTaySummary();
  const prospects = rows.filter((row) => row.board === "prospects");
  const renewals = rows.filter((row) => row.board === "renewals");
  const schools = rows.filter((row) => row.board === "schools");
  const stuckProspects = prospects.filter((row) => row.status === "Stuck").length;
  const unscheduled = prospects.filter((row) => row.projected_start === "Unscheduled").length;
  const notPosted = renewals.filter((row) => row.posted !== "Completed").length;
  const schoolsWithUnits = schools.filter((row) => row.unit_associated).length;

  const tiles = [
    ["Youth / TAY", tay.pct == null ? "n/a" : p(tay.pct), `${n(tay.members)} youth of ${n(tay.tay)} TAY`, "teal"],
    ["Hot Prospects", n(prospects.length), `${n(stuckProspects)} stuck, ${n(unscheduled)} unscheduled`, stuckProspects ? "warning" : "good"],
    ["Renewals", n(renewals.length), `${n(notPosted)} not posted`, notPosted ? "danger" : "good"],
    ["Schools", n(schools.length), `${p(schoolsWithUnits / Math.max(1, schools.length))} with unit associated`, "teal"],
    ["Districts", n(countBy(rows, rowDistrict).length), "Represented in filtered view", "good"],
    ["Updated", shortDateLabel(state.monday.generated_at), dateLabel(state.monday.generated_at), "teal"],
  ];

  document.getElementById("mondayDetailKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function renderBars(targetId, rows, total, tone = "") {
  const max = Math.max(1, ...rows.map((row) => row.count));
  document.getElementById(targetId).innerHTML = rows.slice(0, 14).map((row) => `
    <div class="bar-row">
      <div class="bar-label">${esc(row.label)}<span>${p(row.count / Math.max(1, total))} of filtered rows</span></div>
      <div class="meter"><div class="meter-fill ${tone}" style="width:${Math.max(2, (row.count / max) * 100)}%"></div></div>
      <div class="bar-value">${n(row.count)}</div>
    </div>
  `).join("") || '<div class="empty-state">No matching rows.</div>';
}

function renderDistributions() {
  const rows = currentRows();
  const districtRows = countBy(rows, rowDistrict);
  const statusRows = countBy(rows, rowStatus);
  document.getElementById("districtCount").textContent = `${n(districtRows.length)} districts`;
  renderBars("districtBars", districtRows, rows.length);
  renderBars("stageBars", statusRows, rows.length, "good");
}

function renderSignals() {
  const rows = currentRows();
  const prospects = rows.filter((row) => row.board === "prospects");
  const renewals = rows.filter((row) => row.board === "renewals");
  const schools = rows.filter((row) => row.board === "schools");
  const stuck = prospects.filter((row) => row.status === "Stuck").length;
  const unposted = renewals.filter((row) => row.posted !== "Completed").length;
  const noUnit = schools.filter((row) => !row.unit_associated).length;
  const overdueProspectExamples = prospects
    .filter((row) => row.status === "Stuck" || row.projected_start === "Unscheduled")
    .slice(0, 3)
    .map((row) => row.name)
    .join(", ");

  const cards = [
    [`${n(stuck)} stuck hot prospects`, overdueProspectExamples || "No stuck or unscheduled prospect examples in the filtered view."],
    [`${n(unposted)} renewal records not completed`, `${p(unposted / Math.max(1, renewals.length))} of filtered renewal rows.`],
    [`${n(noUnit)} schools without unit association`, `${p(noUnit / Math.max(1, schools.length))} of filtered school rows.`],
    [`${n(rows.length)} filtered operating rows`, "Use board, district, status, and search filters to narrow follow-up lists."],
  ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderSourceCards() {
  const boards = state.monday.boards;
  const cards = [
    ["Workbook", state.monday.source_workbook || state.monday.generated_from],
    ["Extracted", dateLabel(state.monday.generated_at)],
    ["Latest prospect row", dateLabel(boards.prospects.updated_at)],
    ["Latest school row", dateLabel(boards.schools.updated_at)],
  ];

  document.getElementById("sourceCards").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function tayRollups() {
  const board = document.getElementById("boardSelect").value;
  const district = document.getElementById("districtSelect").value;
  const status = document.getElementById("statusSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const memberByDistrict = new Map((state.dashboard?.dashboard?.districts || [])
    .map((row) => [row.district, numeric(row.members)]));
  const rollups = new Map();
  const schoolRows = state.rows.filter((row) => {
    return row.board === "schools"
      && (board === "all" || board === "schools")
      && (!status || rowStatus(row) === status)
      && (!q || rowSearchText(row).includes(q));
  });

  for (const row of schoolRows) {
    for (const label of districtLabels(row.scouting_district)) {
      if (district && label !== district) continue;
      if (!rollups.has(label)) {
        rollups.set(label, { district: label, schools: 0, tay: 0, members: memberByDistrict.get(label) || null });
      }
      const item = rollups.get(label);
      item.schools += 1;
      item.tay += numeric(row.tay);
    }
  }

  return [...rollups.values()]
    .map((row) => ({ ...row, membership_pct: row.tay && row.members ? row.members / row.tay : null }))
    .sort((a, b) => {
      const pctCompare = (b.membership_pct ?? -1) - (a.membership_pct ?? -1);
      return pctCompare || b.tay - a.tay || a.district.localeCompare(b.district);
    });
}

function renderTayRows() {
  const rows = tayRollups();
  document.getElementById("tayCount").textContent = `${n(rows.length)} districts`;
  document.getElementById("tayRows").innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${esc(row.district)}</strong></td>
      <td class="num">${n(row.schools)}</td>
      <td class="num">${n(row.tay)}</td>
      <td class="num">${row.members == null ? "n/a" : n(row.members)}</td>
      <td class="num"><span class="status ${row.membership_pct == null ? "warn" : row.membership_pct >= .03 ? "good" : row.membership_pct >= .015 ? "warn" : "bad"}">${row.membership_pct == null ? "n/a" : p(row.membership_pct)}</span></td>
    </tr>
  `).join("") || '<tr><td colspan="5"><div class="empty-state">No matching school TAY rows.</div></td></tr>';
}

function renderDetailRows() {
  const allRows = currentRows()
    .sort((a, b) => {
      const boardCompare = boardName(a.board).localeCompare(boardName(b.board));
      return boardCompare
        || rowDistrict(a).localeCompare(rowDistrict(b))
        || rowStatus(a).localeCompare(rowStatus(b))
        || String(a.name || "").localeCompare(String(b.name || ""));
    });
  const rows = allRows.slice(0, 700);

  document.getElementById("rowCount").textContent = `${n(allRows.length)} shown, table limited to ${n(rows.length)}`;
  document.getElementById("detailRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${esc(boardName(row.board))}</td>
      <td><strong>${esc(row.name || "")}</strong><div class="subtle">${esc(row.group || "")}</div></td>
      <td>${esc(rowDistrict(row))}</td>
      <td><span class="status ${rowStatus(row) === "Completed" || rowStatus(row) === "Active" || rowStatus(row) === "Qualified Prospect" ? "good" : rowStatus(row) === "Stuck" || rowStatus(row) === "Closed" ? "bad" : "warn"}">${esc(rowStatus(row))}</span></td>
      <td>${esc(rowType(row))}</td>
      <td>${esc(rowTiming(row))}</td>
      <td>${esc(rowFollowUp(row))}</td>
      <td>${esc(dateLabel(row.updated_at))}</td>
    </tr>
  `).join("") || '<tr><td colspan="8"><div class="empty-state">No matching monday.com rows.</div></td></tr>';
}

function renderAll() {
  renderKpis();
  renderDistributions();
  renderSignals();
  renderSourceCards();
  renderTayRows();
  renderDetailRows();
}

function bindEvents() {
  document.getElementById("boardSelect").addEventListener("input", () => {
    renderControls();
    renderAll();
  });
  ["districtSelect", "statusSelect", "searchInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      renderControls();
      renderAll();
    });
  });
}

async function init() {
  const [mondayResponse, dashboardResponse] = await Promise.all([
    fetch("data/monday-latest.json", { cache: "no-store" }),
    fetch("data/latest.json", { cache: "no-store" }),
  ]);
  if (!mondayResponse.ok) throw new Error(`Unable to load monday.com data: ${mondayResponse.status}`);
  if (!dashboardResponse.ok) throw new Error(`Unable to load dashboard data: ${dashboardResponse.status}`);
  state.monday = await mondayResponse.json();
  state.dashboard = await dashboardResponse.json();
  const boards = state.monday.boards || {};
  state.rows = Object.entries(boards).flatMap(([board, value]) => (value.rows || []).map((row) => ({ ...row, board })));
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>monday.com data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read data/monday-latest.json.</p>
    </section>
  `;
});

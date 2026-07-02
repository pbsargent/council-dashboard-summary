const state = {
  data: null,
  people: [],
  codes: {},
};

const fmt = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const viewerTimestamp = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});
const today = new Date();
today.setHours(0, 0, 0, 0);
const issueLabels = {
  syt: "SYT",
  hazard: "Hazardous Weather",
  baloo: "BALOO",
  iols: "IOLS",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function sourceTimestampDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(text);
  const utcGuess = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess)).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const centralAtGuess = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(utcGuess - (centralAtGuess - utcGuess));
}

function viewerTimestampLabel(value) {
  const date = sourceTimestampDate(value);
  return date && !Number.isNaN(date.getTime()) ? viewerTimestamp.format(date) : "n/a";
}

function n(value) {
  return value == null || Number.isNaN(value) ? "n/a" : fmt.format(value);
}

function p(value) {
  return value == null || Number.isNaN(value) ? "n/a" : pct.format(value);
}

function isYes(value) {
  return value === true;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateLabel(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString() : "n/a";
}

function dateStatus(value, required = true) {
  const date = parseDate(value);
  if (!required && !date) return { label: "Not required", tone: "warn", issue: false };
  if (!required && date) return { label: date.toLocaleDateString(), tone: "good", issue: false };
  if (!date) return { label: "Missing", tone: "bad", issue: true };
  if (date < today) return { label: `Expired ${date.toLocaleDateString()}`, tone: "bad", issue: true };
  return { label: date.toLocaleDateString(), tone: "good", issue: false };
}

function codeList(value) {
  return String(value || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function codeName(code) {
  return state.codes[String(code || "").toUpperCase()] || code;
}

function codeLabel(code) {
  const name = codeName(code);
  return name === code ? code : `${code} - ${name}`;
}

function hasCode(row, code) {
  return codeList(row.mandatory_codes).includes(code);
}

function isPack(row) {
  return String(row.unit_type || "").toLowerCase() === "pack";
}

function isTroop(row) {
  return String(row.unit_type || "").toLowerCase() === "troop";
}

function leaderReadiness(row) {
  const direct = isYes(row.direct_contact);
  const syt = dateStatus(row.syt_expires, true);
  const hazard = dateStatus(row.hazardous_weather_expires, direct);
  const balooRequired = direct && isPack(row);
  const baloo = dateStatus(row.baloo_expires, balooRequired);
  const iolsRequired = direct && isTroop(row);
  const iolsMissing = iolsRequired && hasCode(row, "S11");
  const iols = {
    label: iolsRequired ? (iolsMissing ? `Missing ${codeLabel("S11")}` : `No ${codeLabel("S11")} gap`) : "Not required",
    tone: iolsRequired ? (iolsMissing ? "bad" : "good") : "warn",
    issue: iolsMissing,
  };
  const issues = [];
  if (syt.issue) issues.push("SYT");
  if (hazard.issue) issues.push("HW");
  if (baloo.issue) issues.push("BALOO");
  if (iols.issue) issues.push("IOLS/S11");
  return { direct, syt, hazard, baloo, iols, issues, balooRequired, iolsRequired };
}

function pill(status) {
  return `<span class="status ${status.tone}">${esc(status.label)}</span>`;
}

function currentPeople(options = {}) {
  const district = document.getElementById("districtSelect").value;
  const scope = document.getElementById("scopeSelect").value;
  const issue = options.ignoreIssue ? "" : document.getElementById("issueSelect").value.trim().toLowerCase();
  const unitType = document.getElementById("unitTypeSelect").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return state.people.filter((row) => {
    const readiness = leaderReadiness(row);
    const haystack = [
      row.district,
      row.unit,
      row.name,
      row.position,
      row.mandatory_codes,
      row.classroom_codes,
      row.online_codes,
      codeList(row.mandatory_codes).map(codeName).join(" "),
      codeList(row.classroom_codes).map(codeName).join(" "),
      codeList(row.online_codes).map(codeName).join(" "),
      readiness.issues.join(" "),
    ].join(" ").toLowerCase();

    return (scope !== "direct" || readiness.direct)
      && (!district || row.district === district)
      && (!unitType || row.unit_type === unitType)
      && (!issue || readiness[issue]?.issue)
      && (!q || haystack.includes(q));
  });
}

function summarize(rows) {
  const total = rows.length;
  const direct = rows.filter((row) => leaderReadiness(row).direct).length;
  const directRows = rows.filter((row) => leaderReadiness(row).direct);
  const sytCurrent = rows.filter((row) => !leaderReadiness(row).syt.issue).length;
  const hazardCurrent = directRows.filter((row) => !leaderReadiness(row).hazard.issue).length;
  const balooRequired = directRows.filter((row) => leaderReadiness(row).balooRequired).length;
  const balooIssues = directRows.filter((row) => leaderReadiness(row).baloo.issue).length;
  const iolsRequired = directRows.filter((row) => leaderReadiness(row).iolsRequired).length;
  const iolsIssues = directRows.filter((row) => leaderReadiness(row).iols.issue).length;
  const anyIssues = rows.filter((row) => leaderReadiness(row).issues.length).length;
  return { total, direct, directRows, sytCurrent, hazardCurrent, balooRequired, balooIssues, iolsRequired, iolsIssues, anyIssues };
}

function renderMeta() {
  document.getElementById("generatedDate").textContent = viewerTimestampLabel(state.data.generated_at) || state.data.generated_date;
  const dataDate = new Date(`${state.data.generated_date}T00:00:00`);
  const dateLabel = Number.isNaN(dataDate.getTime())
    ? state.data.generated_date
    : dataDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  document.getElementById("titleDataDate").textContent = `Data current as of ${dateLabel}`;
}

function renderControls() {
  const districts = [...new Set(state.people.map((row) => row.district).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  document.getElementById("districtSelect").innerHTML = `<option value="">All districts</option>${
    districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("")
  }`;
}

function renderKpis() {
  const summary = summarize(currentPeople());
  const activeIssue = document.getElementById("issueSelect").value.trim().toLowerCase();
  const issueLabel = issueLabels[activeIssue] || "Selected issue";
  const issueCounts = {
    syt: summary.total - summary.sytCurrent,
    hazard: summary.direct - summary.hazardCurrent,
    baloo: summary.balooIssues,
    iols: summary.iolsIssues,
  };
  const selectedIssueCount = activeIssue ? issueCounts[activeIssue] : summary.anyIssues;
  const tiles = [
    ["DC Leaders", n(summary.direct), "Direct Contact = YES", "teal"],
    ...(
      activeIssue
        ? [
          [`${issueLabel} Needs Review`, n(selectedIssueCount), "Rows matching the selected issue filter", selectedIssueCount ? "danger" : "good"],
          ["SYT Issues", n(issueCounts.syt), "Missing or expired SYT among shown rows", issueCounts.syt ? "danger" : "good"],
          ["HW Issues", n(issueCounts.hazard), "Hazardous Weather gaps among shown rows", issueCounts.hazard ? "danger" : "good"],
          ["BALOO Issues", n(issueCounts.baloo), `${n(summary.balooRequired)} pack direct-contact leaders shown`, issueCounts.baloo ? "danger" : "good"],
          ["IOLS Issues", n(issueCounts.iols), `${n(summary.iolsRequired)} troop direct-contact leaders shown`, issueCounts.iols ? "warning" : "good"],
        ]
        : [
          ["SYT Current", p(summary.sytCurrent / Math.max(1, summary.total)), `${n(issueCounts.syt)} with SYT issue`, issueCounts.syt ? "danger" : "good"],
          ["HW Current", p(summary.hazardCurrent / Math.max(1, summary.direct)), `${n(issueCounts.hazard)} with HW issue`, issueCounts.hazard ? "danger" : "good"],
          ["BALOO Issues", n(issueCounts.baloo), `${n(summary.balooRequired)} pack direct-contact leaders`, issueCounts.baloo ? "danger" : "good"],
          ["IOLS Issues", n(issueCounts.iols), `${n(summary.iolsRequired)} troop direct-contact leaders`, issueCounts.iols ? "warning" : "good"],
          ["Any Issue", n(summary.anyIssues), "Direct-contact leaders with at least one issue", summary.anyIssues ? "danger" : "good"],
        ]
    ),
  ];

  document.getElementById("sytKpis").innerHTML = tiles.map(([label, value, sub, tone]) => `
    <article class="kpi ${tone}">
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
      </div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}

function renderSytDonut() {
  const activeIssue = document.getElementById("issueSelect").value.trim().toLowerCase();
  const scope = document.getElementById("scopeSelect").value;
  const summary = summarize(activeIssue ? currentPeople({ ignoreIssue: true }) : currentPeople());
  const issueLabel = issueLabels[activeIssue] || "Needs review";
  const issueCounts = {
    syt: summary.total - summary.sytCurrent,
    hazard: summary.direct - summary.hazardCurrent,
    baloo: summary.balooIssues,
    iols: summary.iolsIssues,
  };
  const needsReview = Math.max(0, activeIssue ? issueCounts[activeIssue] : summary.anyIssues);
  const baseCount = scope === "direct" ? summary.direct : summary.total;
  const baseLabel = scope === "direct" ? "direct-contact leaders" : "matching leaders";
  const ready = Math.max(0, baseCount - needsReview);
  const reviewPct = baseCount ? needsReview / baseCount : 0;
  const readyPct = baseCount ? ready / baseCount : 0;
  const centerPct = activeIssue ? reviewPct : readyPct;
  const centerLabel = activeIssue ? "need resolution" : "ready";
  const circumference = 100;
  const readyArc = summary.direct ? readyPct * circumference : 0;
  const reviewArc = summary.direct ? Math.max(0, circumference - readyArc) : 0;

  document.getElementById("sytDonut").innerHTML = `
    <div class="donut-layout">
      <div class="donut-figure" role="img" aria-label="${esc(n(needsReview))} of ${esc(n(baseCount))} ${esc(baseLabel)} need resolution in this view">
        <svg class="donut-svg" viewBox="0 0 42 42" aria-hidden="true">
          <circle class="donut-track" cx="21" cy="21" r="15.9155"></circle>
          <circle
            class="donut-segment trained"
            cx="21"
            cy="21"
            r="15.9155"
            stroke-dasharray="${readyArc} ${circumference - readyArc}"
            stroke-dashoffset="25"
          ></circle>
          <circle
            class="donut-segment untrained"
            cx="21"
            cy="21"
            r="15.9155"
            stroke-dasharray="${reviewArc} ${circumference - reviewArc}"
            stroke-dashoffset="${25 - readyArc}"
          ></circle>
        </svg>
        <div class="donut-center">
          <strong>${esc(p(centerPct))}</strong>
          <span>${esc(centerLabel)}</span>
        </div>
      </div>
      <div class="donut-legend">
        ${activeIssue ? "" : `
          <div class="legend-row">
            <span class="legend-swatch trained"></span>
            <span>No flagged issue</span>
            <strong>${esc(n(ready))}</strong>
          </div>
        `}
        <div class="legend-row">
          <span class="legend-swatch untrained"></span>
          <span>${esc(activeIssue ? `${issueLabel} needs resolution` : "Needs review")}</span>
          <strong>${esc(n(needsReview))}</strong>
        </div>
        <p>${esc(activeIssue ? `${n(needsReview)} of ${n(baseCount)} ${baseLabel} need this issue resolved` : `${n(needsReview)} of ${n(baseCount)} ${baseLabel} need review`)}</p>
      </div>
    </div>
  `;
}

function renderRollup() {
  const scope = document.getElementById("scopeSelect").value;
  const rows = currentPeople().filter((row) => scope !== "direct" || leaderReadiness(row).direct);
  const activeIssue = document.getElementById("issueSelect").value.trim().toLowerCase();
  const byDistrict = new Map();
  for (const row of rows) {
    const key = row.district || "Council";
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key).push(row);
  }
  const rollups = [...byDistrict.entries()]
    .map(([district, people]) => ({ district, ...summarize(people) }))
    .sort((a, b) => b.anyIssues - a.anyIssues || a.district.localeCompare(b.district));

  const leaderHeader = scope === "direct" ? "DC Leaders" : "Leaders";
  const header = activeIssue
    ? ["District", leaderHeader, "Needs Review", "SYT Issues", "HW Issues", "BALOO Issues", "IOLS Issues"]
    : ["District", leaderHeader, "Needs Review", "SYT Current", "HW Current", "BALOO Issues", "IOLS Issues"];
  document.querySelector(".training-rollup thead tr").innerHTML = header.map((label, index) => `
    <th${index ? ' class="num"' : ""}>${esc(label)}</th>
  `).join("");

  document.getElementById("rollupCount").textContent = `${rollups.length} groups`;
  document.getElementById("rollupRows").innerHTML = rollups.map((row) => `
    <tr>
      <td><strong>${esc(row.district)}</strong></td>
      <td class="num">${n(scope === "direct" ? row.direct : row.total)}</td>
      <td class="num"><span class="status ${row.anyIssues ? "bad" : "good"}">${n(row.anyIssues)}</span></td>
      <td class="num">${activeIssue ? n(row.total - row.sytCurrent) : p(row.sytCurrent / Math.max(1, row.total))}</td>
      <td class="num">${activeIssue ? n(row.direct - row.hazardCurrent) : p(row.hazardCurrent / Math.max(1, row.direct))}</td>
      <td class="num"><span class="status ${row.balooIssues ? "bad" : "good"}">${n(row.balooIssues)}</span></td>
      <td class="num"><span class="status ${row.iolsIssues ? "bad" : "good"}">${n(row.iolsIssues)}</span></td>
    </tr>
  `).join("") || '<tr><td colspan="7"><div class="empty-state">No matching direct-contact leaders.</div></td></tr>';
}

function renderSignals() {
  const scope = document.getElementById("scopeSelect").value;
  const rows = currentPeople().filter((row) => scope !== "direct" || leaderReadiness(row).direct);
  const summary = summarize(rows);
  const baseCount = scope === "direct" ? summary.direct : summary.total;
  const baseLabel = scope === "direct" ? "direct-contact leaders" : "matching leaders";
  const activeIssue = document.getElementById("issueSelect").value.trim().toLowerCase();
  const issueLabel = issueLabels[activeIssue] || "Any issue";
  const activeIssueCount = activeIssue === "syt"
    ? summary.total - summary.sytCurrent
    : activeIssue === "hazard"
      ? summary.direct - summary.hazardCurrent
      : activeIssue === "baloo"
        ? summary.balooIssues
        : activeIssue === "iols"
          ? summary.iolsIssues
          : summary.anyIssues;
  const issueRows = rows
    .filter((row) => leaderReadiness(row).issues.length)
    .slice(0, 4);
  const cards = activeIssue
    ? [
      [`${n(activeIssueCount)} ${issueLabel} rows need review`, "This view is filtered to leaders with the selected issue."],
      [`${n(summary.total - summary.sytCurrent)} SYT issues`, "Missing or expired SYT dates among shown leaders."],
      [`${n(summary.direct - summary.hazardCurrent)} Hazardous Weather issues`, `Shown direct-contact leaders requiring current ${codeLabel("SCO_800")}.`],
      [`Code interpretation`, `${codeLabel("Y01")}; ${codeLabel("SCO_800")}; ${codeLabel("C32")}; ${codeLabel("S11")}.`],
      [`Top follow-up`, issueRows.map((row) => `${row.name} (${leaderReadiness(row).issues.join("/")})`).join(", ") || "No flagged issues in the filtered view."],
    ]
    : [
      [`${n(summary.anyIssues)} leaders need review`, `${p((baseCount - summary.anyIssues) / Math.max(1, baseCount))} of ${baseLabel} have no flagged issue in this view.`],
      [`${n(summary.total - summary.sytCurrent)} SYT issues`, "Missing or expired SYT dates for shown leaders."],
      [`${n(summary.direct - summary.hazardCurrent)} Hazardous Weather issues`, `Direct-contact leaders require current ${codeLabel("SCO_800")}.`],
      [`Code interpretation`, `${codeLabel("Y01")}; ${codeLabel("SCO_800")}; ${codeLabel("C32")}; ${codeLabel("S11")}.`],
      [`Top follow-up`, issueRows.map((row) => `${row.name} (${leaderReadiness(row).issues.join("/")})`).join(", ") || "No flagged issues in the filtered view."],
    ];

  document.getElementById("signals").innerHTML = cards.map(([title, body]) => `
    <article class="signal"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>
  `).join("");
}

function renderPeopleRows() {
  const scope = document.getElementById("scopeSelect").value;
  const allRows = currentPeople()
    .filter((row) => scope !== "direct" || leaderReadiness(row).direct)
    .sort((a, b) => {
      const aReady = leaderReadiness(a);
      const bReady = leaderReadiness(b);
      return bReady.issues.length - aReady.issues.length
        || String(a.district || "").localeCompare(String(b.district || ""))
        || String(a.name || "").localeCompare(String(b.name || ""));
    });
  const rows = allRows.slice(0, 500);

  document.getElementById("peopleTitle").textContent = scope === "direct"
    ? "Direct-Contact Leader Detail"
    : "All-Leader Detail With Direct-Contact Applicability";
  document.querySelector(".detail-table thead tr").innerHTML = `
    <th>District</th>
    <th>Unit</th>
    <th>Name</th>
    <th>Position</th>
    <th>Direct Contact</th>
    <th>SYT</th>
    <th>Hazardous Weather</th>
    <th>BALOO</th>
    <th>IOLS</th>
    <th>Issues</th>
  `;
  document.getElementById("peopleCount").textContent = `${n(allRows.length)} shown, table limited to ${n(rows.length)}`;
  document.getElementById("peopleRows").innerHTML = rows.map((row) => {
    const readiness = leaderReadiness(row);
    return `
      <tr>
        <td>${esc(row.district || "")}</td>
        <td>${esc(row.unit || "")}</td>
        <td><strong>${esc(row.name || "")}</strong></td>
        <td>${esc(row.position || "")}</td>
        <td>${pill({ label: readiness.direct ? "Yes" : "No", tone: readiness.direct ? "good" : "warn" })}</td>
        <td>${pill(readiness.syt)}</td>
        <td>${pill(readiness.hazard)}</td>
        <td>${pill(readiness.baloo)}</td>
        <td>${pill(readiness.iols)}</td>
        <td>${esc(readiness.issues.join(", ") || "None")}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="10"><div class="empty-state">No matching leaders.</div></td></tr>';
}

function renderAll() {
  renderKpis();
  renderSytDonut();
  renderRollup();
  renderSignals();
  renderPeopleRows();
}

function bindEvents() {
  ["districtSelect", "scopeSelect", "issueSelect", "unitTypeSelect", "searchInput"].forEach((id) => {
    const control = document.getElementById(id);
    control.addEventListener("input", renderAll);
    control.addEventListener("change", renderAll);
  });
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  state.data = await response.json();
  state.people = state.data.dashboard.training_people || [];
  state.codes = state.data.dashboard.training_codes || {};
  renderMeta();
  renderControls();
  bindEvents();
  renderAll();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `
    <section class="panel">
      <h1>SYT data did not load</h1>
      <p>${esc(error.message)}</p>
      <p class="subtle">Run this page from a local web server or static host so it can read data/latest.json.</p>
    </section>
  `;
});

(function () {
  const STORAGE_KEY = "cac-dashboard-program-filter";
  const PROGRAMS = [
    ["Council", "Council"],
    ["Packs", "Pack"],
    ["Troops", "Troop"],
    ["Crews", "Crew"],
    ["Ships", "Ship"],
    ["Posts", "Post"],
  ];
  const GRADE_ORDER = ["EE", "PK", "KG", ...Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")), "AE"];
  const PROGRAM_TAY_RULES = {
    Packs: {
      program: "Cub Scouts",
      grades: ["KG", "01", "02", "03", "04", "05"],
      ages: [5, 10],
      exception: "Early education and pre-K are excluded.",
    },
    Troops: {
      program: "Scouts BSA",
      grades: ["06", "07", "08", "09", "10", "11", "12"],
      ages: [11, 17],
      exception: "Eligible fifth-graders and age-10 transition exceptions are not separately identifiable, so this estimate may be low.",
    },
    Crews: {
      program: "Venturing",
      grades: ["09", "10", "11", "12"],
      ages: [14, 20],
      exception: "Age 13 after eighth-grade completion is not separately identifiable, and the school source generally does not cover ages 18-20.",
    },
    Ships: {
      program: "Sea Scouts",
      grades: ["09", "10", "11", "12"],
      ages: [14, 20],
      exception: "Age 13 after eighth-grade completion is not separately identifiable, and the school source generally does not cover ages 18-20.",
    },
    Posts: {
      program: "Exploring Posts",
      grades: ["09", "10", "11", "12"],
      ages: [14, 20],
      exception: "Exploring Clubs (grades 6-8) are not included in the Posts view, and the school source generally does not cover ages 18-20.",
    },
  };

  function initialProgram() {
    const requested = new URLSearchParams(location.search).get("program");
    const stored = localStorage.getItem(STORAGE_KEY);
    return PROGRAMS.some(([label]) => label === requested) ? requested
      : PROGRAMS.some(([label]) => label === stored) ? stored
        : "Council";
  }

  let selected = initialProgram();

  function type() {
    return PROGRAMS.find(([label]) => label === selected)?.[1] || "Council";
  }

  function words(value) {
    return String(value || "").split(/[,/;&]+/).map((part) => part.trim()).filter(Boolean);
  }

  function matchesUnitType(value) {
    if (selected === "Council") return true;
    return words(value).some((part) => new RegExp(`\\b${type()}\\b`, "i").test(part));
  }

  function matchesUnitName(value) {
    if (selected === "Council") return true;
    return new RegExp(`^${type()}\\b`, "i").test(String(value || "").trim());
  }

  function matchesMondayRow(row, board) {
    if (selected === "Council") return true;
    if (board === "prospects") return matchesUnitType(row.unit_type);
    if (board === "renewals" || board === "popcorn") return matchesUnitName(row.name);
    if (board === "schools") return estimateSchoolTay(row).value > 0;
    return matchesUnitType(row.unit_type) || matchesUnitName(row.name || row.unit);
  }

  function numeric(value) {
    const parsed = Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeGrade(value) {
    const token = String(value || "").trim().toUpperCase();
    if (token === "K") return "KG";
    if (/^\d{1,2}$/.test(token)) return String(Number(token)).padStart(2, "0");
    return token;
  }

  function expandGradeSegment(segment) {
    const parts = String(segment || "").split("-").map(normalizeGrade).filter(Boolean);
    if (parts.length === 1) return GRADE_ORDER.includes(parts[0]) ? parts : [];
    if (parts.length !== 2) return [];
    const start = GRADE_ORDER.indexOf(parts[0]);
    const end = GRADE_ORDER.indexOf(parts[1]);
    if (start < 0 || end < start) return [];
    return GRADE_ORDER.slice(start, end + 1);
  }

  function schoolCoverage(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const gradeBased = raw.startsWith("'") || /(?:EE|PK|KG|AE|K-)/i.test(raw);
    if (gradeBased) {
      const grades = [...new Set(raw.replace(/^'+/, "").split(/\s+/).flatMap(expandGradeSegment))];
      return grades.length ? { basis: "grades", values: grades } : null;
    }
    const ageMatch = raw.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!ageMatch) return null;
    const start = Number(ageMatch[1]);
    const end = Number(ageMatch[2] || ageMatch[1]);
    if (start > end || end > 30) return null;
    return { basis: "ages", values: Array.from({ length: end - start + 1 }, (_, index) => start + index) };
  }

  function estimateSchoolTay(row) {
    const total = numeric(row?.tay);
    if (selected === "Council") return { value: total, total, weight: total ? 1 : 0, known: true, basis: "all" };
    const rule = PROGRAM_TAY_RULES[selected];
    const coverage = schoolCoverage(row?.grades);
    if (!rule || !coverage || !total) return { value: null, total, weight: null, known: false, basis: coverage?.basis || "unknown" };
    const target = coverage.basis === "grades"
      ? new Set(rule.grades)
      : new Set(coverage.values.filter((age) => age >= rule.ages[0] && age <= rule.ages[1]));
    const eligible = coverage.values.filter((value) => target.has(value)).length;
    const weight = coverage.values.length ? eligible / coverage.values.length : 0;
    return { value: total * weight, total, weight, known: true, basis: coverage.basis };
  }

  function tayLabel() {
    return selected === "Council" ? "Total Available Youth" : `Estimated ${PROGRAM_TAY_RULES[selected]?.program || selected} TAY`;
  }

  function tayCaution(rows = []) {
    if (selected === "Council") return "For schools assigned to multiple Scouting Districts, TAY is attributed to each listed district.";
    const rule = PROGRAM_TAY_RULES[selected];
    const sourceRows = rows.filter((row) => numeric(row?.tay) > 0);
    const unknown = sourceRows.filter((row) => !estimateSchoolTay(row).known).length;
    const coverage = unknown ? ` ${unknown} of ${sourceRows.length} school rows with TAY lack a usable grade/age span and are excluded.` : "";
    return `${rule.program} TAY is an estimate: each school's total TAY is allocated evenly across its published grade or age span, then limited to the program's eligible span. ${rule.exception} Program estimates overlap and must not be added together.${coverage}`;
  }

  function masterNote() {
    if (selected === "Council") return "All council data";
    return `${selected} where program type is available; TAY uses an estimated grade/age allocation`;
  }

  function cleanDistrict(value) {
    return String(value || "").replace(/\s+\d+$/, "").trim();
  }

  function updateLinks() {
    document.querySelectorAll("a[href]").forEach((link) => {
      const raw = link.getAttribute("href");
      if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
      let url;
      try { url = new URL(raw, location.href); } catch (_) { return; }
      if (url.origin !== location.origin || !/\.html$/.test(url.pathname)) return;
      if (selected === "Council") url.searchParams.delete("program");
      else url.searchParams.set("program", selected);
      link.href = `${url.pathname}${url.search}${url.hash}`;
    });
  }

  function render() {
    const hero = document.querySelector("main .hero, main .topbar");
    if (!hero || document.getElementById("masterProgramFilter")) return;
    const control = document.createElement("div");
    control.className = "master-program-filter";
    control.innerHTML = `
      <span class="master-filter-label">Master view</span>
      <div class="master-filter-options" id="masterProgramFilter" role="group" aria-label="Master program filter">
        ${PROGRAMS.map(([label]) => `<button type="button" data-program="${label}" class="${label === selected ? "active" : ""}" aria-pressed="${label === selected}">${label}</button>`).join("")}
      </div>
      <span class="master-filter-note" id="masterProgramNote">${masterNote()}</span>
      <span class="master-filter-caution" id="masterProgramCaution" ${selected === "Council" ? "hidden" : ""}>${selected === "Council" ? "" : tayCaution()}</span>`;
    hero.appendChild(control);
    control.addEventListener("click", (event) => {
      const button = event.target.closest("[data-program]");
      if (!button || button.dataset.program === selected) return;
      selected = button.dataset.program;
      localStorage.setItem(STORAGE_KEY, selected);
      const url = new URL(location.href);
      if (selected === "Council") url.searchParams.delete("program");
      else url.searchParams.set("program", selected);
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      control.querySelectorAll("[data-program]").forEach((item) => {
        const active = item.dataset.program === selected;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      document.getElementById("masterProgramNote").textContent = masterNote();
      const caution = document.getElementById("masterProgramCaution");
      caution.hidden = selected === "Council";
      caution.textContent = selected === "Council" ? "" : tayCaution();
      updateLinks();
      window.dispatchEvent(new CustomEvent("programfilterchange", { detail: { program: selected, unitType: type() } }));
    });
    updateLinks();
  }

  window.ProgramFilter = {
    get: () => selected,
    getType: type,
    isCouncil: () => selected === "Council",
    matchesUnitType,
    matchesUnitName,
    matchesMondayRow,
    estimateSchoolTay,
    tayLabel,
    tayCaution,
    cleanDistrict,
    updateLinks,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();

(function attachOutdoorReadiness(root) {
  "use strict";

  function text(value) {
    return String(value ?? "").trim();
  }

  function parseDate(value) {
    const raw = text(value);
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
    const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function codeList(value) {
    return text(value)
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
  }

  function isUnitType(row, unitType) {
    return text(row?.unit_type).toLowerCase() === unitType.toLowerCase();
  }

  function districtKey(value) {
    return text(value).toLowerCase().replace(/\s+\d{2}$/, "");
  }

  function isIolsPosition(row) {
    if (!isUnitType(row, "Troop")) return false;
    const position = text(row?.position).toLowerCase().replace(/\s+/g, " ");
    return row?.direct_contact === true
      && (position === "scoutmaster" || position === "assistant scoutmaster");
  }

  function explicitBoolean(value) {
    if (value === true || value === false) return value;
    const normalized = text(value).toUpperCase();
    if (["YES", "Y", "TRUE", "1", "TRAINED"].includes(normalized)) return true;
    if (["NO", "N", "FALSE", "0", "NOT TRAINED"].includes(normalized)) return false;
    return null;
  }

  function hasBaloo(row) {
    if (!isUnitType(row, "Pack")) return false;
    const value = text(row?.baloo_expires).toUpperCase();
    return value === "YES" || Boolean(parseDate(value));
  }

  function hasIols(row) {
    if (!isIolsPosition(row)) return false;
    const explicit = explicitBoolean(row?.iols_trained);
    if (explicit !== null) return explicit;
    return !codeList(row?.mandatory_codes).includes("S11");
  }

  function hasCurrentHazardousWeather(row, cutoff) {
    if (row?.direct_contact !== true) return false;
    const expiration = parseDate(row?.hazardous_weather_expires);
    return Boolean(expiration && expiration >= cutoff);
  }

  function personKey(row) {
    return text(row?.member_id)
      || [text(row?.name).toLowerCase(), text(row?.unit).toLowerCase()].filter(Boolean).join("|");
  }

  function uniqueRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = personKey(row);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueNames(rows) {
    return [...new Set(uniqueRows(rows).map((row) => text(row?.name)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function depthStatus(count) {
    if (count <= 0) return { key: "gap", label: "No qualified leader", shortLabel: "Gap", tone: "bad" };
    if (count === 1) return { key: "fragile", label: "One qualified leader", shortLabel: "Fragile", tone: "warn" };
    return { key: "preferred", label: "Two or more qualified leaders", shortLabel: "Preferred depth", tone: "good" };
  }

  function buildUnits(people, unitType, generatedDate) {
    const qualification = unitType.toLowerCase() === "pack" ? "BALOO" : "IOLS";
    const cutoff = parseDate(generatedDate) || new Date();
    const groups = new Map();

    for (const row of people || []) {
      if (!isUnitType(row, unitType) || !text(row?.unit)) continue;
      const district = text(row?.district) || "Unassigned";
      const unit = text(row?.unit);
      const key = `${districtKey(district)}|${unit.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    return [...groups.values()].map((rows) => {
      const qualificationRows = uniqueRows(rows.filter(qualification === "BALOO" ? hasBaloo : hasIols));
      const hazardRows = uniqueRows(rows.filter((row) => hasCurrentHazardousWeather(row, cutoff)));
      const directRows = uniqueRows(rows.filter((row) => row.direct_contact === true));
      const allRows = uniqueRows(rows);
      const status = depthStatus(qualificationRows.length);
      const unitNumber = Number(rows[0].unit_number)
        || Number(text(rows[0].unit).match(/\d+/)?.[0])
        || 0;

      return {
        key: `${districtKey(rows[0].district)}|${text(rows[0].unit).toLowerCase()}`,
        district: text(rows[0].district) || "Unassigned",
        unit: text(rows[0].unit),
        unitNumber,
        unitType,
        qualification,
        leaderCount: allRows.length,
        directLeaderCount: directRows.length,
        qualificationCount: qualificationRows.length,
        qualificationPeople: uniqueNames(qualificationRows),
        hazardousWeatherCount: hazardRows.length,
        hazardousWeatherPeople: uniqueNames(hazardRows),
        depthStatus: status,
        missingHazardousWeather: hazardRows.length === 0,
        needsAction: qualificationRows.length < 2 || hazardRows.length === 0,
        severity: Number(qualificationRows.length === 0) * 3
          + Number(hazardRows.length === 0) * 2
          + Number(qualificationRows.length === 1),
      };
    });
  }

  function findUnit(units, district, unit) {
    const key = `${districtKey(district)}|${text(unit).toLowerCase()}`;
    return (units || []).find((row) => row.key === key) || null;
  }

  const api = {
    buildUnits,
    codeList,
    depthStatus,
    explicitBoolean,
    findUnit,
    hasBaloo,
    hasCurrentHazardousWeather,
    hasIols,
    isIolsPosition,
    isUnitType,
    parseDate,
  };

  root.CACOutdoorReadiness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof window !== "undefined" ? window : globalThis));

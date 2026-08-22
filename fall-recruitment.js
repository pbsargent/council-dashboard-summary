(() => {
  "use strict";

  const DATA = window.FALL_RECRUITMENT_DATA || {};
  const districtFilter = document.querySelector("#districtFilter");
  const number = new Intl.NumberFormat("en-US");
  const totalOf = (parts) => Object.values(parts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const colorFor = (district) => DATA.colors?.[district] || "#8b93aa";
  const datePalette = ["#579bfc", "#00c875", "#a25ddc", "#00a36c", "#00b875", "#18a872", "#fdab3d", "#00c875", "#00b875", "#ff5ac4", "#16b36c", "#00a86b", "#00b875", "#cab641"];

  function filteredParts(parts) {
    const district = districtFilter.value;
    if (district === "all") return parts;
    return { [district]: Number(parts?.[district] || 0) };
  }

  function niceMax(value) {
    if (value <= 5) return 5;
    const step = value <= 20 ? 5 : value <= 60 ? 10 : 20;
    return Math.ceil(value / step) * step;
  }

  function renderChart(targetId, buckets) {
    const target = document.querySelector(`#${targetId}`);
    const entries = Object.entries(buckets || {}).map(([label, parts]) => [label, filteredParts(parts)]);
    const largest = Math.max(0, ...entries.map(([, parts]) => totalOf(parts)));
    const roundedMax = niceMax(largest);
    const max = largest >= roundedMax ? niceMax(roundedMax + 1) : roundedMax;
    const allDistricts = [...new Set(entries.flatMap(([, parts]) => Object.keys(parts)))]
      .filter((district) => entries.some(([, parts]) => parts[district]));

    target.innerHTML = "";
    if (!largest) {
      target.innerHTML = '<p class="empty-state">No records match this district.</p>';
      return;
    }

    const axis = document.createElement("div");
    axis.className = "axis-y";
    [0, .25, .5, .75, 1].forEach((portion) => {
      const tick = document.createElement("span");
      tick.style.bottom = `${portion * 100}%`;
      tick.textContent = Math.round(max * portion);
      axis.append(tick);
    });

    const plot = document.createElement("div");
    plot.className = "plot";
    entries.forEach(([label, parts]) => {
      const total = totalOf(parts);
      const column = document.createElement("div");
      column.className = "bar-column";
      column.title = `${label}: ${total}`;

      const stack = document.createElement("div");
      stack.className = "bar-stack";
      stack.style.height = `${Math.max(1, (total / max) * 100)}%`;
      Object.entries(parts).forEach(([district, value]) => {
        if (!value) return;
        const segment = document.createElement("span");
        segment.className = "bar-segment";
        segment.style.height = `${(value / total) * 100}%`;
        segment.style.background = colorFor(district);
        segment.title = `${district}: ${value}`;
        stack.append(segment);
      });

      const totalLabel = document.createElement("span");
      totalLabel.className = "bar-total";
      totalLabel.style.bottom = `calc(${Math.max(1, (total / max) * 100)}% + 3px)`;
      totalLabel.textContent = total;
      const labelNode = document.createElement("span");
      labelNode.className = "x-label";
      labelNode.textContent = label;
      column.append(stack, totalLabel, labelNode);
      plot.append(column);
    });

    const legend = document.createElement("div");
    legend.className = "legend";
    allDistricts.forEach((district) => {
      const item = document.createElement("span");
      item.innerHTML = `<i style="background:${colorFor(district)}"></i>${district}`;
      legend.append(item);
    });
    target.append(axis, plot, legend);
  }

  function dateColor(label) {
    if (label === "No Date") return "#bb3354";
    const index = Math.max(0, (DATA.districtDateOrder || []).indexOf(label));
    return datePalette[index % datePalette.length];
  }

  function renderDistrictChart() {
    const target = document.querySelector("#districtChart");
    const selected = districtFilter.value;
    const order = (DATA.districtAllOrder || []).filter((district) => selected === "all" || district === selected);
    const max = Math.max(1, ...order.map((district) => totalOf(DATA.districtDateBuckets?.[district])));
    const segmentOrder = ["No Date", ...(DATA.districtDateOrder || []).filter((label) => label !== "No Date")];
    target.innerHTML = "";

    const plot = document.createElement("div");
    plot.className = "horizontal-plot";
    order.forEach((district) => {
      const parts = DATA.districtDateBuckets?.[district] || {};
      const total = totalOf(parts);
      const row = document.createElement("div");
      row.className = "horizontal-row";
      const label = document.createElement("span");
      label.className = "horizontal-label";
      label.textContent = district;
      const track = document.createElement("div");
      track.className = "horizontal-track";
      const bar = document.createElement("div");
      bar.className = "horizontal-bar";
      bar.style.width = `${(total / max) * 100}%`;
      segmentOrder.forEach((dateLabel) => {
        const value = Number(parts[dateLabel] || 0);
        if (!value) return;
        const segment = document.createElement("span");
        segment.className = "horizontal-segment";
        segment.style.flex = `${value} 1 0`;
        segment.style.background = dateColor(dateLabel);
        segment.title = `${district} — ${dateLabel}: ${value}`;
        if (value > 1) segment.textContent = value;
        bar.append(segment);
      });
      const value = document.createElement("strong");
      value.className = "horizontal-total";
      value.textContent = total;
      track.append(bar, value);
      row.append(label, track);
      plot.append(row);
    });

    const legend = document.createElement("div");
    legend.className = "legend district-date-legend";
    segmentOrder.filter((label) => order.some((district) => DATA.districtDateBuckets?.[district]?.[label])).forEach((label) => {
      const item = document.createElement("span");
      item.innerHTML = `<i style="background:${dateColor(label)}"></i>${label}`;
      legend.append(item);
    });
    target.append(plot, legend);
  }

  function renderDistrictPie({ targetId, order, values, emptyMessage, ariaDescription }) {
    const target = document.querySelector(`#${targetId}`);
    const selected = districtFilter.value;
    const rows = (order || [])
      .filter((district) => selected === "all" || district === selected)
      .map((district) => [district, Number(values?.[district] || 0)])
      .filter(([, value]) => value);
    const total = rows.reduce((sum, [, value]) => sum + value, 0);
    target.innerHTML = "";
    if (!total) {
      target.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
      return;
    }
    let cursor = 0;
    const stops = rows.map(([district, value]) => {
      const start = cursor;
      cursor += (value / total) * 100;
      return `${colorFor(district)} ${start}% ${cursor}%`;
    });
    const pie = document.createElement("div");
    pie.className = "pie-chart";
    pie.style.background = `conic-gradient(${stops.join(",")})`;
    pie.setAttribute("role", "img");
    pie.setAttribute("aria-label", `${total} ${ariaDescription}`);
    const legend = document.createElement("div");
    legend.className = "pie-legend";
    rows.forEach(([district, value]) => {
      const item = document.createElement("span");
      item.innerHTML = `<i style="background:${colorFor(district)}"></i><b>${district}</b>: ${value}`;
      legend.append(item);
    });
    target.append(pie, legend);
  }

  function renderGauge(targetId, value, max) {
    const target = document.querySelector(`#${targetId}`);
    const angle = -180 + Math.min(1, value / max) * 180;
    target.innerHTML = `<div class="ring" style="--angle:${angle}deg"><span class="needle"></span><strong class="value">${number.format(value)}</strong><span class="range"><b>0</b><b>${number.format(max)}</b></span></div>`;
  }

  function renderAll() {
    renderDistrictChart();
    renderDistrictPie({
      targetId: "noPackChart",
      order: DATA.noCubPacksOrder,
      values: DATA.noCubPacks,
      emptyMessage: "No schools without a connected Cub pack match this district.",
      ariaDescription: "schools without connected Cub packs",
    });
    renderDistrictPie({
      targetId: "noPlansChart",
      order: DATA.noRecruitmentPlansOrder,
      values: DATA.noRecruitmentPlans,
      emptyMessage: "No schools without recruitment plans match this district.",
      ariaDescription: "schools without recruitment plans",
    });
    renderChart("locationChart", DATA.locationBuckets);
    renderChart("timeChart", DATA.timeBuckets);
    renderChart("weekChart", DATA.weekBuckets);
    renderChart("monthChart", DATA.monthBuckets);
    renderChart("dayChart", DATA.dayBuckets);
    const district = districtFilter.value;
    document.querySelector("#scheduledTotal").textContent = number.format(district === "all" ? DATA.scheduled : DATA.districtCounts?.[district] || 0);
    document.querySelector("#schoolTotal").textContent = number.format(district === "all" ? DATA.totalItems : DATA.districtAllCounts?.[district] || 0);
  }

  const districtOptions = ["all", ...(DATA.districtAllOrder || DATA.districtOrder || [])];
  districtFilter.innerHTML = districtOptions.map((district) => `<option value="${district}">${district === "all" ? "All districts" : district}</option>`).join("");
  districtFilter.addEventListener("change", renderAll);
  document.querySelector("#resetFilter").addEventListener("click", () => { districtFilter.value = "all"; renderAll(); });
  document.querySelector("#materialTotal").textContent = number.format(DATA.totalMaterials || 0);
  document.querySelector("#freshness").textContent = `monday.com snapshot refreshed ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }).format(new Date(DATA.generatedAt))}`;
  renderGauge("flierGauge", DATA.materials?.fliers || 0, DATA.gaugeMaximums?.fliers || 63000);
  renderGauge("stickerGauge", DATA.materials?.stickers || 0, DATA.gaugeMaximums?.stickers || 40000);
  renderGauge("p2pGauge", DATA.materials?.p2p || 0, DATA.gaugeMaximums?.p2p || 11000);
  renderAll();
})();

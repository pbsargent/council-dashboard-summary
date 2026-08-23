(() => {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  function formatSnapshotDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load dashboard metadata");
    return response.json();
  }

  async function updateFreshness() {
    try {
      const [latest, monday] = await Promise.all([
        loadJson("data/latest.json"),
        loadJson("data/monday-latest.json").catch(() => null),
      ]);
      const dashboardDate = formatSnapshotDate(
        latest.dashboard?.source_mtime || latest.generated_at || latest.generated_date
      );
      const mondayDate = formatSnapshotDate(monday?.generated_at);
      const primaryLabel = dashboardDate ? "Dashboard data refreshed " + dashboardDate : "Refresh date unavailable";

      setText("helpFreshness", primaryLabel);
      setText("titleDataDate", dashboardDate ? "Data refreshed " + dashboardDate : "Data refresh date unavailable");
      setText(
        "guideFreshness",
        mondayDate && mondayDate !== dashboardDate
          ? primaryLabel + "; monday.com snapshot refreshed " + mondayDate
          : primaryLabel
      );
    } catch (error) {
      setText("helpFreshness", "Refresh date unavailable");
      setText("titleDataDate", "Data refresh date unavailable");
    }
  }

  document.getElementById("printHelp")?.addEventListener("click", () => window.print());
  updateFreshness();
})();

(() => {
  const link = document.querySelector("[data-back-context]");
  if (!link) return;

  const params = new URLSearchParams(window.location.search);
  const from = (params.get("from") || "").toLowerCase();
  const referrer = (document.referrer || "").toLowerCase();
  const cameFromCommissioner = from === "commissioner" || referrer.includes("commissioner");

  if (cameFromCommissioner) {
    link.textContent = "Back to Commissioner Dashboard";
    link.href = "https://pbsargent.github.io/council-commissioner-dashboard/";
  } else {
    link.textContent = "Back to Council Summary Dashboard";
    link.href = link.dataset.summaryHref || "index.html";
  }
})();

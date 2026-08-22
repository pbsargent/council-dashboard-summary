(function () {
  "use strict";

  const recipient = "scouting@imetpetersargent.com";

  function textFrom(id) {
    const element = document.getElementById(id);
    const text = element && element.textContent.trim();
    return text && text !== "Loading" ? text : "Not available";
  }

  function buildMailto() {
    const dataDate = ["titleDataDate", "generatedDate", "generatedAt"]
      .map(textFrom)
      .find((value) => value !== "Not available") || "Not available";
    const subject = `Council Dashboard problem: ${document.title}`;
    const body = [
      "Please describe the problem:",
      "",
      "What did you expect to see?",
      "",
      "--- Dashboard context ---",
      `Page: ${document.title}`,
      `URL: ${window.location.href}`,
      `Displayed data date: ${dataDate}`,
      `Browser: ${navigator.userAgent}`
    ].join("\n");

    return `mailto:${recipient}?${new URLSearchParams({ subject, body }).toString()}`;
  }

  document.querySelectorAll("[data-report-problem]").forEach((link) => {
    link.href = buildMailto();
    link.addEventListener("click", function () {
      this.href = buildMailto();
    });
  });
})();

(() => {
  let tooltip;
  let activeButton;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.id = "panelHelpTooltip";
    tooltip.className = "panel-help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(button) {
    const tip = ensureTooltip();
    const rect = button.getBoundingClientRect();
    const gap = 8;
    const margin = 14;
    const tipRect = tip.getBoundingClientRect();
    let top = rect.bottom + gap;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

    if (top + tipRect.height > window.innerHeight - margin) {
      top = rect.top - tipRect.height - gap;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function showHelp(button) {
    const text = button.dataset.help;
    if (!text) return;
    const tip = ensureTooltip();
    tip.textContent = text;
    tip.hidden = false;
    activeButton = button;
    button.setAttribute("aria-describedby", tip.id);
    button.setAttribute("aria-expanded", "true");
    positionTooltip(button);
  }

  function hideHelp() {
    if (!tooltip || tooltip.hidden) return;
    if (activeButton) {
      activeButton.removeAttribute("aria-describedby");
      activeButton.setAttribute("aria-expanded", "false");
    }
    tooltip.hidden = true;
    activeButton = null;
  }

  function toggleHelp(button) {
    if (activeButton === button && tooltip && !tooltip.hidden) {
      hideHelp();
    } else {
      showHelp(button);
    }
  }

  function initHelpButton(button) {
    if (!button.dataset.help) {
      button.dataset.help = button.getAttribute("title") || button.getAttribute("aria-label") || "";
    }
    button.removeAttribute("title");
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("mouseenter", () => showHelp(button));
    button.addEventListener("mouseleave", hideHelp);
    button.addEventListener("focus", () => showHelp(button));
    button.addEventListener("blur", hideHelp);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleHelp(button);
    });
  }

  function initPanelHelp() {
    document.querySelectorAll(".panel-help").forEach(initHelpButton);
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".panel-help")) hideHelp();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideHelp();
    });
    window.addEventListener("resize", () => {
      if (activeButton && tooltip && !tooltip.hidden) positionTooltip(activeButton);
    });
    window.addEventListener("scroll", () => {
      if (activeButton && tooltip && !tooltip.hidden) positionTooltip(activeButton);
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPanelHelp);
  } else {
    initPanelHelp();
  }
})();

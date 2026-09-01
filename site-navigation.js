(() => {
  const sidebar = document.querySelector("aside.sidebar, aside.site-nav, aside.rail");
  const navigation = sidebar?.querySelector("nav");
  if (!sidebar || !navigation) return;

  const script = document.currentScript;
  const siteRoot = new URL(".", script?.src || window.location.href);
  const pageKey = document.body.dataset.page || "overview";
  const destination = (path) => new URL(path, siteRoot).href;

  const overviewItems = [
    { key: "commissioner-portal", label: "Commissioner Portal", href: "https://pbsargent.github.io/council-commissioner-dashboard/", external: true },
    { key: "comparison", label: "Council Comparison", path: "comparison.html" },
  ];

  const groups = [
    {
      key: "districts",
      label: "District Performance",
      path: "districts.html",
      items: [
        { key: "pin-status", label: "PIN Status & Completeness", path: "pin-status.html" },
        { key: "popcorn", label: "Popcorn", path: "popcorn.html" },
      ],
    },
    {
      key: "membership",
      label: "Membership & Growth",
      path: "membership.html",
      items: [
        { key: "monday", label: "Recruitment Pipeline", path: "monday.html" },
        { key: "fall-recruitment", label: "Cub Scout JSN", path: "fall-recruitment.html" },
      ],
    },
    {
      key: "unit-health",
      label: "Unit Health & Renewal",
      path: "unit-health.html",
      items: [
        { key: "unit-metrics", label: "Unit Metrics", path: "unit-metrics.html" },
        { key: "unit-level", label: "Unit-Level Detail", path: "unit-level.html" },
        { key: "renewal", label: "Renewal Status", path: "renewal-board/index.html" },
      ],
    },
    {
      key: "people",
      label: "People & Readiness",
      path: "people.html",
      items: [
        { key: "training", label: "Training", path: "training.html" },
        { key: "syt", label: "SYT", path: "syt.html" },
        { key: "camping-readiness", label: "Pack Camping Readiness", path: "camping-readiness.html" },
        { key: "troop-camping-readiness", label: "Troop Camping Readiness", path: "troop-camping-readiness.html" },
      ],
    },
    {
      key: "sources",
      label: "Data & Help",
      path: "sources.html",
      items: [
        { key: "help", label: "Using the Dashboard", path: "help.html" },
        { key: "guide", label: "Calculation Guide", path: "docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.pdf", external: true },
        { key: "report-problem", label: "Report a Problem", href: "mailto:scouting@imetpetersargent.com" },
      ],
    },
  ];

  const itemHref = (item) => item.href || destination(item.path);
  const activeGroupKey = () => groups.find((group) =>
    group.key === pageKey || group.items.some((item) => item.key === pageKey)
  )?.key || null;

  const brandImage = sidebar.querySelector(".brand img");
  if (brandImage) brandImage.src = destination("assets/cac-logo-horizontal.png");

  navigation.className = "site-navigation";
  navigation.setAttribute("aria-label", "Council dashboard");
  navigation.innerHTML = `
    <section class="nav-overview">
      <a class="nav-home" data-nav-key="overview" href="${destination("index.html")}">
        <span>Overview</span>
        <small>Council-level KPIs</small>
      </a>
      <div class="nav-children nav-overview-children">
        ${overviewItems.map((item) => `
          <a class="nav-child" data-nav-key="${item.key}" href="${itemHref(item)}"${item.external ? ' target="_blank" rel="noreferrer"' : ""}>
            <span>${item.label}</span>${item.external ? '<span class="nav-external" aria-hidden="true">↗</span>' : ""}
          </a>
        `).join("")}
      </div>
    </section>
    ${groups.map((group) => `
      <section class="nav-group${group.items.length ? " has-children" : ""}" data-nav-group="${group.key}">
        <div class="nav-group-head">
          <a class="nav-group-link" data-nav-key="${group.key}" href="${destination(group.path)}">
            <span>${group.label}</span>
          </a>
          ${group.items.length ? `
            <button class="nav-group-toggle" type="button" aria-label="Toggle ${group.label} submenu" aria-expanded="false" aria-controls="nav-${group.key}">
              <span class="nav-chevron" aria-hidden="true">›</span>
            </button>
          ` : ""}
        </div>
        ${group.items.length ? `
          <div class="nav-children" id="nav-${group.key}" hidden>
            ${group.items.map((item) => `
              <a class="nav-child" data-nav-key="${item.key}" href="${itemHref(item)}"${item.external ? ' target="_blank" rel="noreferrer"' : ""}>
                <span>${item.label}</span>${item.external ? '<span class="nav-external" aria-hidden="true">↗</span>' : ""}
              </a>
            `).join("")}
          </div>
        ` : ""}
      </section>
    `).join("")}
  `;

  const menuButton = document.createElement("button");
  menuButton.className = "nav-menu-toggle";
  menuButton.type = "button";
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-controls", "council-site-navigation");
  menuButton.innerHTML = '<span aria-hidden="true">☰</span><span>Menu</span>';
  navigation.id = "council-site-navigation";
  sidebar.insertBefore(menuButton, navigation);

  const setGroupOpen = (groupElement, open) => {
    const toggle = groupElement.querySelector(".nav-group-toggle");
    const children = groupElement.querySelector(".nav-children");
    if (!toggle || !children) return;
    toggle.setAttribute("aria-expanded", String(open));
    children.hidden = !open;
    groupElement.classList.toggle("is-open", open);
  };

  const groupKey = activeGroupKey();
  navigation.querySelectorAll("[data-nav-key]").forEach((link) => {
    const active = link.dataset.navKey === pageKey;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  navigation.querySelector(".nav-home")?.classList.toggle("active-parent", pageKey === "comparison");
  navigation.querySelectorAll("[data-nav-group]").forEach((group) => {
    const belongsToCurrentPage = group.dataset.navGroup === groupKey;
    group.querySelector(".nav-group-link")?.classList.toggle("active-parent", belongsToCurrentPage && pageKey !== groupKey);
    setGroupOpen(group, belongsToCurrentPage);
  });

  navigation.querySelectorAll(".nav-group-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const group = toggle.closest(".nav-group");
      setGroupOpen(group, toggle.getAttribute("aria-expanded") !== "true");
    });
  });

  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
  });

  navigation.addEventListener("click", (event) => {
    if (!event.target.closest("a")) return;
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  });

  document.body.classList.add("site-nav-ready");
})();

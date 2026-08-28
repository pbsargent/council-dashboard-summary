#!/usr/bin/env python3
"""Fail closed when the published dashboard structure regresses."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.body_page: str | None = None
        self.headings: list[str] = []
        self._heading_depth = 0
        self._heading_parts: list[str] = []
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []
        self.elements_by_id: dict[str, tuple[str, set[str]]] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.elements_by_id[element_id] = (
                tag,
                set((attributes.get("class") or "").split()),
            )
        if tag == "body":
            self.body_page = attributes.get("data-page")
        elif tag in {"h1", "h2"}:
            self._heading_depth += 1
            self._heading_parts = []
        elif tag == "link" and attributes.get("rel") == "stylesheet":
            if attributes.get("href"):
                self.stylesheets.append(attributes["href"])
        elif tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])

    def handle_endtag(self, tag: str) -> None:
        if tag in {"h1", "h2"} and self._heading_depth:
            heading = " ".join("".join(self._heading_parts).split())
            if heading:
                self.headings.append(heading)
            self._heading_depth -= 1
            self._heading_parts = []

    def handle_data(self, data: str) -> None:
        if self._heading_depth:
            self._heading_parts.append(data)


SUMMARY_PAGES = {
    "index.html": ("overview", ("Council Overview", "Signals to Watch", "Council Dashboard Areas")),
    "comparison.html": ("comparison", ("Council Comparison", "Service Territory Council Comparison")),
    "districts.html": ("districts", ("District Performance", "District Membership and Unit Health", "Operational Detail")),
    "membership.html": ("membership", ("Membership Intelligence", "Unit & Youth Trends")),
    "unit-health.html": ("unit-health", ("Unit Health & Renewal", "Unit Health Funnel", "Exceptions", "Priority Units")),
    "people.html": ("people", ("People & Readiness", "All-Scouter Training", "Safeguarding Youth Training", "Commissioner Coverage Roster", "Coverage Snapshot")),
    "sources.html": ("sources", ("Sources, Freshness & Help", "Dashboard Source Workbooks", "Calculation Guide", "Report a Problem")),
    "help.html": ("help", ("How to Use the CAC Dashboard", "Quick Start", "Choose the Right Dashboard Page", "Common Measures", "Troubleshooting")),
}

DETAIL_PAGES = {
    "monday.html": "monday",
    "fall-recruitment.html": "fall-recruitment",
    "popcorn.html": "popcorn",
    "unit-metrics.html": "unit-metrics",
    "camping-readiness.html": "camping-readiness",
    "troop-camping-readiness.html": "troop-camping-readiness",
    "unit-level.html": "unit-level",
    "renewal-board/index.html": "renewal",
    "training.html": "training",
    "syt.html": "syt",
}

REQUIRED_PARENT_LINKS = {
    "popcorn.html": ("districts.html", "Back to District Performance"),
}

NAVIGATION_ROUTES = {
    "overview": "index.html",
    "comparison": "comparison.html",
    "districts": "districts.html",
    "membership": "membership.html",
    "monday": "monday.html",
    "fall-recruitment": "fall-recruitment.html",
    "popcorn": "popcorn.html",
    "unit-health": "unit-health.html",
    "unit-metrics": "unit-metrics.html",
    "camping-readiness": "camping-readiness.html",
    "troop-camping-readiness": "troop-camping-readiness.html",
    "unit-level": "unit-level.html",
    "renewal": "renewal-board/index.html",
    "people": "people.html",
    "training": "training.html",
    "syt": "syt.html",
    "sources": "sources.html",
    "help": "help.html",
}

NAVIGATION_HIERARCHY = {
    "overview": ("comparison",),
    "districts": ("popcorn",),
    "membership": ("monday", "fall-recruitment"),
    "unit-health": ("unit-metrics", "unit-level", "renewal"),
    # Persistent user-approved placement: both camping readiness pages belong
    # under People & Readiness and must survive every scheduled build/publish.
    "people": ("training", "syt", "camping-readiness", "troop-camping-readiness", "commissioner-portal"),
    "sources": ("help", "guide", "report-problem"),
}

REQUIRED_ASSETS = (
    "cac-theme.css",
    "site-navigation.js",
    "assets/cac-logo-horizontal.png",
    "assets/cac-topo-navy.webp",
    "assets/fonts/Figtree-Variable.ttf",
    "assets/fonts/RobotoSlab-Variable.ttf",
)

HELP_ASSETS = (
    "help.css",
    "help.js",
)

SCROLL_ASSET_VERSION = "20260821-scrollable-tables-v1"
SHARED_TABLE_STYLE_PAGES = (
    "index.html",
    "comparison.html",
    "districts.html",
    "membership.html",
    "unit-health.html",
    "people.html",
    "sources.html",
    "help.html",
    "monday.html",
    "popcorn.html",
    "unit-metrics.html",
    "camping-readiness.html",
    "troop-camping-readiness.html",
    "unit-level.html",
    "training.html",
    "syt.html",
)


def parse_page(path: Path) -> PageParser:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def bracket_contents(source: str, start: int) -> str | None:
    opening = source.find("[", start)
    if opening < 0:
        return None
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "[":
            depth += 1
        elif source[index] == "]":
            depth -= 1
            if depth == 0:
                return source[opening + 1:index]
    return None


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    errors: list[str] = []

    for relative in REQUIRED_ASSETS:
        path = root / relative
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"missing required dashboard asset: {relative}")

    for relative in HELP_ASSETS:
        path = root / relative
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"missing required help asset: {relative}")

    for relative, (page_key, required_headings) in SUMMARY_PAGES.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"missing required summary page: {relative}")
            continue
        parsed = parse_page(path)
        if parsed.body_page != page_key:
            errors.append(f"{relative}: expected data-page={page_key!r}, found {parsed.body_page!r}")
        for heading in required_headings:
            if not any(heading in actual for actual in parsed.headings):
                errors.append(f"{relative}: missing required heading {heading!r}")
        if not any("cac-theme.css?v=20260812-discrete-pages-1" in href for href in parsed.stylesheets):
            errors.append(f"{relative}: missing discrete-page CAC theme reference")
        if not any("site-navigation.js?v=20260823-help-nav-1" in src for src in parsed.scripts):
            errors.append(f"{relative}: missing discrete-page navigation reference")

    help_page_path = root / "help.html"
    if help_page_path.is_file():
        help_page = parse_page(help_page_path)
        if not any("help.css?v=20260823-help-1" in href for href in help_page.stylesheets):
            errors.append("help.html: missing cache-busted help stylesheet")
        if not any("help.js?v=20260823-help-1" in src for src in help_page.scripts):
            errors.append("help.html: missing cache-busted help script")
        help_source = help_page_path.read_text(encoding="utf-8")
        for href in ("sources.html", "docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.pdf"):
            if f'href="{href}"' not in help_source:
                errors.append(f"help.html: missing required documentation link {href!r}")

    unit_health_path = root / "unit-health.html"
    priority_script_path = root / "council-dashboard-summary.20260626-tay-kpi.js"
    if unit_health_path.is_file():
        unit_health_source = unit_health_path.read_text(encoding="utf-8")
        if 'id="priorityMetricSelect"' not in unit_health_source:
            errors.append("unit-health.html: missing Priority Units metric selector")
        for value in ("0-2", "3", "4-5"):
            if f'<option value="{value}">' not in unit_health_source:
                errors.append(f"unit-health.html: missing Priority Units metric option {value!r}")
    if priority_script_path.is_file():
        priority_script = priority_script_path.read_text(encoding="utf-8")
        for required in (
            'document.getElementById("priorityMetricSelect")',
            'matchesPriorityMetricBand(row.metric)',
            '"priorityMetricSelect"',
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing Priority Units metric-filter binding {required!r}"
                )
        for required in (
            'state.data.dashboard.council.volunteers',
            '["Volunteers", n(c.volunteers)',
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing Volunteers metric integration {required!r}"
                )

    if help_page_path.is_file():
        help_source = help_page_path.read_text(encoding="utf-8")
        if "<dt>Volunteers</dt>" not in help_source:
            errors.append("help.html: missing Volunteers measure definition")
        if "<dt>Connections (12 Mo.)</dt>" not in help_source:
            errors.append("help.html: missing Connections (12 Mo.) measure definition")

    for relative, page_key in DETAIL_PAGES.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"missing required detail page: {relative}")
            continue
        parsed = parse_page(path)
        if parsed.body_page != page_key:
            errors.append(f"{relative}: expected data-page={page_key!r}, found {parsed.body_page!r}")
        if not any("site-navigation.js?v=20260823-help-nav-1" in src for src in parsed.scripts):
            errors.append(f"{relative}: missing discrete-page navigation reference")
        if relative in REQUIRED_PARENT_LINKS:
            expected_href, expected_label = REQUIRED_PARENT_LINKS[relative]
            source = path.read_text(encoding="utf-8")
            link_pattern = (
                rf'<a\b[^>]*href="{re.escape(expected_href)}"[^>]*>'
                rf'\s*{re.escape(expected_label)}\s*</a>'
            )
            if not re.search(link_pattern, source):
                errors.append(
                    f"{relative}: missing parent link {expected_label!r} -> {expected_href!r}"
                )

    fall_page_path = root / "fall-recruitment.html"
    fall_script_path = root / "fall-recruitment.js"
    if fall_page_path.is_file():
        fall_page = parse_page(fall_page_path)
        for chart_id in ("noPackChart", "noPlansChart"):
            element = fall_page.elements_by_id.get(chart_id)
            if element is None:
                errors.append(f"fall-recruitment.html: missing required chart #{chart_id}")
            elif "pie-widget" not in element[1]:
                errors.append(
                    f"fall-recruitment.html: #{chart_id} must remain a pie-widget to match monday.com"
                )
    if fall_script_path.is_file():
        fall_script = fall_script_path.read_text(encoding="utf-8")
        pie_bindings = {
            "noPackChart": "noCubPacksOrder",
            "noPlansChart": "noRecruitmentPlansOrder",
        }
        for chart_id, order_name in pie_bindings.items():
            pattern = (
                rf'targetId:\s*"{re.escape(chart_id)}"'
                rf'[\s\S]{{0,240}}?order:\s*DATA\.{re.escape(order_name)}'
            )
            if not re.search(pattern, fall_script):
                errors.append(
                    f"fall-recruitment.js: #{chart_id} must be bound to the monday.com pie renderer"
                )

    navigation_path = root / "site-navigation.js"
    if navigation_path.is_file():
        navigation = navigation_path.read_text(encoding="utf-8")
        for key, route in NAVIGATION_ROUTES.items():
            route_pattern = rf'key:\s*"{re.escape(key)}"[\s\S]{{0,240}}?path:\s*"{re.escape(route)}"'
            overview_pattern = rf'data-nav-key="{re.escape(key)}"[^\n]*href="\$\{{destination\("{re.escape(route)}"\)\}}"'
            if not re.search(route_pattern, navigation) and not re.search(overview_pattern, navigation):
                errors.append(f"site-navigation.js: missing route {key!r} -> {route!r}")

        overview_start = navigation.find("const overviewItems")
        overview_items = bracket_contents(navigation, overview_start) if overview_start >= 0 else None
        overview_keys = tuple(re.findall(r'\bkey:\s*"([^"]+)"', overview_items or ""))
        if overview_keys != NAVIGATION_HIERARCHY["overview"]:
            errors.append(
                "site-navigation.js: Overview children must be "
                f"{NAVIGATION_HIERARCHY['overview']!r}, found {overview_keys!r}"
            )

        groups_start = navigation.find("const groups")
        groups = bracket_contents(navigation, groups_start) if groups_start >= 0 else None
        if groups is None:
            errors.append("site-navigation.js: missing navigation groups array")
        else:
            parent_names = tuple(key for key in NAVIGATION_HIERARCHY if key != "overview")
            parent_positions = [groups.find(f'key: "{parent}"') for parent in parent_names]
            for offset, parent in enumerate(parent_names):
                start = parent_positions[offset]
                if start < 0:
                    errors.append(f"site-navigation.js: missing parent navigation group {parent!r}")
                    continue
                later_positions = [position for position in parent_positions[offset + 1:] if position >= 0]
                end = min(later_positions) if later_positions else len(groups)
                group_source = groups[start:end]
                items_start = group_source.find("items:")
                items = bracket_contents(group_source, items_start) if items_start >= 0 else None
                child_keys = tuple(re.findall(r'\bkey:\s*"([^"]+)"', items or ""))
                expected_keys = NAVIGATION_HIERARCHY[parent]
                if child_keys != expected_keys:
                    errors.append(
                        f"site-navigation.js: {parent!r} children must be "
                        f"{expected_keys!r}, found {child_keys!r}"
                    )
        if re.search(r'(?:index\.html)?#[A-Za-z]', navigation):
            errors.append("site-navigation.js: legacy in-page hash navigation is not allowed")

    shared_css_path = root / "council-dashboard-summary.css"
    if shared_css_path.is_file():
        shared_css = shared_css_path.read_text(encoding="utf-8")
        required_scroll_css = (
            ".panel.detail-table {\n  max-height: none;\n}",
            ".panel.detail-table > .table-wrap {\n  max-height: clamp(240px, calc(100vh - 310px), 560px);\n}",
            "overscroll-behavior: contain;",
            "scrollbar-gutter: stable;",
        )
        for rule in required_scroll_css:
            if rule not in shared_css:
                errors.append(
                    "council-dashboard-summary.css: missing required scroll-table rule "
                    f"{rule.splitlines()[0]!r}"
                )
        if re.search(r"@media \(max-width: 760px\)[\s\S]*?\.table-wrap \{\s*max-height: none;", shared_css):
            errors.append(
                "council-dashboard-summary.css: mobile table wrappers must retain bounded vertical scrolling"
            )

    for relative in SHARED_TABLE_STYLE_PAGES:
        path = root / relative
        if not path.is_file():
            continue
        parsed = parse_page(path)
        expected = f"council-dashboard-summary.css?v={SCROLL_ASSET_VERSION}"
        if expected not in parsed.stylesheets:
            errors.append(f"{relative}: missing scroll-table cache-busted stylesheet {expected!r}")

    unit_style_path = root / "unit-level-dashboard.css"
    if unit_style_path.is_file():
        unit_style = unit_style_path.read_text(encoding="utf-8")
        for rule in (
            ".member-table-wrap {",
            "overscroll-behavior: contain;",
            ".member-table th { position: sticky;",
        ):
            if rule not in unit_style:
                errors.append(f"unit-level-dashboard.css: missing required member-table rule {rule!r}")
    unit_page_path = root / "unit-level.html"
    if unit_page_path.is_file():
        expected = f"unit-level-dashboard.css?v={SCROLL_ASSET_VERSION}"
        if expected not in parse_page(unit_page_path).stylesheets:
            errors.append(f"unit-level.html: missing scroll-table cache-busted stylesheet {expected!r}")

    renewal_page_path = root / "renewal-board/index.html"
    renewal_style_path = root / "renewal-board/styles.css"
    renewal_script_path = root / "renewal-board/app.js"
    if renewal_page_path.is_file():
        renewal_page = renewal_page_path.read_text(encoding="utf-8")
        renewal_parsed = parse_page(renewal_page_path)
        if 'class="board-scroll"' not in renewal_page:
            errors.append("renewal-board/index.html: workflow rows must remain inside .board-scroll")
        if f"styles.css?v={SCROLL_ASSET_VERSION}" not in renewal_parsed.stylesheets:
            errors.append("renewal-board/index.html: missing cache-busted scroll-table stylesheet")
        if f"app.js?v={SCROLL_ASSET_VERSION}" not in renewal_parsed.scripts:
            errors.append("renewal-board/index.html: missing cache-busted scroll-table script")
    if renewal_style_path.is_file():
        renewal_style = renewal_style_path.read_text(encoding="utf-8")
        for rule in (".board-scroll,", ".event-table-wrap {", "overscroll-behavior: contain;"):
            if rule not in renewal_style:
                errors.append(f"renewal-board/styles.css: missing required scroll-container rule {rule!r}")
    if renewal_script_path.is_file():
        renewal_script = renewal_script_path.read_text(encoding="utf-8")
        if 'class="event-table-wrap"' not in renewal_script:
            errors.append("renewal-board/app.js: renewal event tables must remain scrollable")
        if "rows.slice(0, 12)" in renewal_script:
            errors.append("renewal-board/app.js: renewal event rows must not be truncated to 12")

    forbidden_detail_caps = {
        "training-detail.js": ".slice(0, 500)",
        "syt-detail.js": ".slice(0, 500)",
        "monday-detail.js": ".slice(0, 700)",
    }
    for relative, forbidden in forbidden_detail_caps.items():
        path = root / relative
        if path.is_file() and forbidden in path.read_text(encoding="utf-8"):
            errors.append(f"{relative}: scrollable detail rows must not be artificially truncated")

    if errors:
        print("Dashboard structure validation FAILED:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        "Dashboard structure validation passed: "
        f"{len(SUMMARY_PAGES)} summary pages, {len(DETAIL_PAGES)} detail pages, "
        f"{len(NAVIGATION_ROUTES)} routes, {len(NAVIGATION_HIERARCHY)} hierarchy groups, "
        f"{len(REQUIRED_ASSETS)} shared assets, {len(HELP_ASSETS)} help assets, Cub Scout JSN pie-chart parity, "
        "Priority Units metric filtering, and scroll-table safeguards."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

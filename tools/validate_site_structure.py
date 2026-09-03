#!/usr/bin/env python3
"""Fail closed when the published dashboard structure regresses."""

from __future__ import annotations

import os
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
    "pin-status.html": ("pin-status", ("PIN Status & Completeness", "District PIN Currency", "PIN Status Composition", "Required PIN Details", "District PIN Detail")),
    "membership.html": ("membership", ("Membership Intelligence", "Unit & Youth Trends")),
    "unit-health.html": ("unit-health", ("Unit Health & Renewal", "Unit Health Funnel", "Exceptions", "Priority Units")),
    "people.html": ("people", ("People & Readiness", "All-Scouter Training", "Safeguarding Youth Training", "Commissioner Coverage Roster", "Coverage Snapshot")),
    "sources.html": ("sources", ("Sources, Freshness & Help", "Dashboard Source Workbooks", "References", "Calculation Guide", "Report a Problem")),
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
    "pin-status": "pin-status.html",
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
    "overview": ("commissioner-portal", "comparison"),
    "districts": ("pin-status", "popcorn"),
    "membership": ("monday", "fall-recruitment"),
    "unit-health": ("unit-metrics", "unit-level", "renewal"),
    # Persistent user-approved placement: both camping readiness pages belong
    # under People & Readiness and must survive every scheduled build/publish.
    "people": ("training", "syt", "camping-readiness", "troop-camping-readiness"),
    "sources": ("help", "guide", "report-problem"),
}

REQUIRED_ASSETS = (
    "cac-theme.css",
    "site-navigation.js",
    "outdoor-readiness.js",
    "assets/cac-logo-horizontal.png",
    "assets/cac-topo-navy.webp",
    "assets/fonts/Figtree-Variable.ttf",
    "assets/fonts/RobotoSlab-Variable.ttf",
)

HELP_ASSETS = (
    "help.css",
    "help.js",
)

PERSON_NAME_PRIVACY_ASSET = "tools/sanitize_public_person_names.py"

SCROLL_ASSET_VERSION = "20260821-scrollable-tables-v1"
SHARED_TABLE_ASSET_VERSION = "20260903-operational-unit-detail-1"
SHARED_TABLE_STYLE_PAGES = (
    "index.html",
    "comparison.html",
    "districts.html",
    "pin-status.html",
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

    privacy_path = root / PERSON_NAME_PRIVACY_ASSET
    if not privacy_path.is_file() or privacy_path.stat().st_size == 0:
        errors.append(f"missing required person-name privacy asset: {PERSON_NAME_PRIVACY_ASSET}")
    updater_path = root / "update_daily.zsh"
    if updater_path.is_file():
        updater_source = updater_path.read_text(encoding="utf-8")
        for required in (
            'PERSON_NAME_SANITIZER="${SUMMARY_REPO}/tools/sanitize_public_person_names.py"',
            '"$PYTHON" "$PERSON_NAME_SANITIZER" "$SITE_STAGE"',
            '"$PYTHON" "$PERSON_NAME_SANITIZER" "$SITE_STAGE" --check',
        ):
            if required not in updater_source:
                errors.append(f"update_daily.zsh: missing person-name privacy contract {required!r}")

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
        if not any("site-navigation.js?v=20260901-pin-status-page-1" in src for src in parsed.scripts):
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

    sources_page_path = root / "sources.html"
    if sources_page_path.is_file():
        sources_source = sources_page_path.read_text(encoding="utf-8")
        for href in (
            "https://www.scouting.org/wp-content/uploads/2026/01/Training-Codes-Jan-26.xlsx",
            "https://www.scouting.org/wp-content/uploads/2025/05/Position-Trained-Requirements-Jun2025.pdf",
        ):
            if f'href="{href}"' not in sources_source:
                errors.append(f"sources.html: missing required reference link {href!r}")

    unit_health_path = root / "unit-health.html"
    priority_script_path = root / "council-dashboard-summary.20260626-tay-kpi.js"
    shared_dashboard_script = "council-dashboard-summary.20260626-tay-kpi.js?v=20260903-operational-unit-detail-1"
    for page_name in ("index.html", "comparison.html", "districts.html", "unit-health.html", "people.html", "sources.html"):
        page_source = (root / page_name).read_text(encoding="utf-8")
        if shared_dashboard_script not in page_source:
            errors.append(f"{page_name}: missing cache-busted shared PIN-funnel script")
    districts_path = root / "districts.html"
    if districts_path.is_file():
        districts_source = districts_path.read_text(encoding="utf-8")
        if '<th class="num">Retention</th>' not in districts_source:
            errors.append("districts.html: Operational Detail must include the Retention column")
        if '<th class="num">PIN Currency</th>' not in districts_source:
            errors.append("districts.html: Operational Detail must include the PIN Currency column")
        if '<th class="num">At Risk</th>' in districts_source:
            errors.append("districts.html: Operational Detail must not restore the former At Risk column")
        if "Expand a Service Area, then a district" not in districts_source:
            errors.append("districts.html: Operational Detail help must explain the district-to-unit drill-down")
    index_path = root / "index.html"
    if index_path.is_file():
        index_source = index_path.read_text(encoding="utf-8")
        if '<a class="overview-path" href="pin-status.html"><strong>PIN Status &amp; Completeness</strong>' not in index_source:
            errors.append("index.html: Overview Explore must link to PIN Status & Completeness")
        if "BeAScout PIN state" not in index_source:
            errors.append("index.html: Signals to Watch help must describe BeAScout PIN state")
    pin_status_path = root / "pin-status.html"
    pin_status_script_path = root / "pin-status.js"
    pin_status_style_path = root / "pin-status.css"
    if pin_status_path.is_file():
        pin_page_source = pin_status_path.read_text(encoding="utf-8")
        for required in (
            'pin-status.css?v=20260903-district-unit-detail-1',
            'pin-status.js?v=20260903-district-unit-detail-1',
            'data-focus="stale"',
            'data-focus="inactive"',
            'data-focus="details"',
            'data-focus="unmatched"',
            "Only completion flags are published",
            "Expand a district to see its individual unit PIN status",
        ):
            if required not in pin_page_source:
                errors.append(f"pin-status.html: missing PIN page contract {required!r}")
    if pin_status_script_path.is_file():
        pin_script_source = pin_status_script_path.read_text(encoding="utf-8")
        for required in (
            "function unitCountsByDistrict",
            "function unitDetailsByDistrict",
            "function summarizeDistricts",
            "function rollup",
            'row.pin_details_complete === true',
            'row.pin_contact_complete !== true',
            "ratio(active + inactive, units)",
            "ratio(complete, units)",
            "Math.max(0, units - pinRows.length)",
            "More than 12 months since the last update",
            'class="pin-district-toggle"',
            'aria-expanded="${expanded}"',
            "Individual Unit Status",
            "unit-level.html?unit=",
            'pin.pin_status_complete === true ? null : "Status"',
            'pin.pin_contact_complete === true ? null : "Contact"',
            'pin.pin_meeting_complete === true ? null : "Meeting"',
        ):
            if required not in pin_script_source:
                errors.append(f"pin-status.js: missing PIN calculation contract {required!r}")
        for forbidden in ("BeAScout Contact", "BeAScout email", "BeAScout phone#", "Meeting Location"):
            if forbidden in pin_script_source:
                errors.append(f"pin-status.js: must not request private source field {forbidden!r}")
    if not pin_status_style_path.is_file() or pin_status_style_path.stat().st_size == 0:
        errors.append("missing required PIN status page stylesheet: pin-status.css")

    builder_candidates = [
        Path(os.environ["CAC_DASHBOARD_ROOT"]) / "work" / "commissioner_site" / "build_site.py"
        if os.environ.get("CAC_DASHBOARD_ROOT") else None,
        root.parents[1] / "work" / "commissioner_site" / "build_site.py",
        root.parents[2] / "work" / "commissioner_site" / "build_site.py" if len(root.parents) > 2 else None,
    ]
    builder_path = next((path for path in builder_candidates if path is not None and path.is_file()), None)
    if builder_path is None:
        errors.append("missing production PIN-aware work/commissioner_site/build_site.py")
    else:
        builder_source = builder_path.read_text(encoding="utf-8")
        for required in (
            "def report_date_for_path",
            "def pin_field_completeness",
            '"pin_status_complete"',
            '"pin_contact_complete"',
            '"pin_meeting_complete"',
            '"pin_details_complete"',
            "**pin_field_completeness(pin_row)",
            "pin_display_status(pin_row, report_as_of)",
        ):
            if required not in builder_source:
                errors.append(f"build_site.py: missing privacy-safe PIN completeness contract {required!r}")
    if unit_health_path.is_file():
        unit_health_source = unit_health_path.read_text(encoding="utf-8")
        if 'id="priorityMetricSelect"' not in unit_health_source:
            errors.append("unit-health.html: missing Priority Units metric selector")
        for value in ("0-2", "3", "4-5"):
            if f'<option value="{value}">' not in unit_health_source:
                errors.append(f"unit-health.html: missing Priority Units metric option {value!r}")
    if priority_script_path.is_file():
        priority_script = priority_script_path.read_text(encoding="utf-8")
        district_rows_match = re.search(
            r"function renderDistrictRows\(\) \{(?P<body>[\s\S]*?)\n\}\n\nfunction renderPriorityRows",
            priority_script,
        )
        if district_rows_match is None:
            errors.append(
                "council-dashboard-summary.20260626-tay-kpi.js: missing District Operational Detail renderer"
            )
        else:
            district_rows_source = district_rows_match.group("body")
            if "miniMeter(" in district_rows_source:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    "District Operational Detail must use plain percentages, not mini-bars"
                )
            for required in (
                'pWhole(serviceAreaSummary(service.rows, "retention_rate"))',
                "pWhole(row.retention_rate)",
                "pinCurrencySummary(service.rows, currentByDistrict)",
                "pinCurrencySummary([row], currentByDistrict)",
            ):
                if required not in district_rows_source:
                    errors.append(
                        "council-dashboard-summary.20260626-tay-kpi.js: "
                        f"missing District Operational Detail retention binding {required!r}"
                    )
            if 'serviceAreaSummary(service.rows, "at_risk_rate")' in district_rows_source or "p(row.at_risk_rate)" in district_rows_source:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    "District Operational Detail must use PIN Currency instead of At Risk"
                )
            for required in (
                'class="operational-district-toggle"',
                'aria-expanded="${districtOpen}"',
                "Individual Unit Status",
                "renderOperationalUnitRows(row.district)",
                'colspan="11"',
            ):
                if required not in district_rows_source:
                    errors.append(
                        "council-dashboard-summary.20260626-tay-kpi.js: "
                        f"missing District Operational Detail drill-down binding {required!r}"
                    )
        for required in (
            "function pinCurrencyByDistrict()",
            'row.pin_status === "Active" || row.pin_status === "Inactive"',
            "function pinCurrencySummary(rows, currentByDistrict)",
            "current / units",
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing District PIN Currency safeguard {required!r}"
                )
        for required in (
            "function operationalUnitsForDistrict",
            "function renderOperationalUnitRows",
            "function operationalUnitHealth",
            "unit-level.html?unit=",
            "state.openOperationalDistricts",
            'unit.commissioner ? "Yes" : "No"',
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing operational district-to-unit safeguard {required!r}"
                )
        for required in (
            'document.getElementById("priorityMetricSelect")',
            'matchesPriorityMetricBand(row.metric)',
            'state.data?.dashboard?.unit_pin_statuses',
            'pinByUnit.get(key)',
            '"priorityMetricSelect"',
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing Priority Units metric-filter binding {required!r}"
                )
        for required in (
            '["Inactive", "Stale"].includes(row.pin_status)',
            '["Inactive + stale PINs", pinFollowup, pinFollowupRate',
            'pinFollowup / c.units',
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing Unit Health Funnel PIN-follow-up binding {required!r}"
                )
        for required in (
            'PIN state: ${n(inactivePins + stalePins)} need follow-up',
            'row.pin_status === "Active"',
            'row.pin_status === "Inactive"',
            'row.pin_status === "Stale"',
            "Math.max(0, (c.units || 0) - pinRows.length)",
            "(activePins + inactivePins) / c.units",
        ):
            if required not in priority_script:
                errors.append(
                    "council-dashboard-summary.20260626-tay-kpi.js: "
                    f"missing Overview PIN-state signal contract {required!r}"
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
        if "<dt>PIN</dt>" not in help_source or "Stale means" not in help_source:
            errors.append("help.html: missing PIN Stale-state definition")
        if "more than 12 months have passed since" not in help_source:
            errors.append("help.html: missing approved PIN freshness wording")
        if "Unit Health Funnel combines Inactive and Stale PINs" not in help_source:
            errors.append("help.html: missing Unit Health Funnel combined PIN-follow-up definition")
        if "Units without a matched PIN remain in the denominator" not in help_source:
            errors.append("help.html: missing Unit Health Funnel PIN-denominator explanation")
        if '<a href="pin-status.html"><strong>PIN Status &amp; Completeness</strong>' not in help_source:
            errors.append("help.html: missing PIN Status & Completeness page directory entry")
        if "<dt>Required PIN Details</dt>" not in help_source or "Only completion flags" not in help_source:
            errors.append("help.html: missing privacy-safe Required PIN Details definition")
        if "expand a District PIN Detail row" not in help_source or "individual-unit status" not in help_source:
            errors.append("help.html: missing District PIN Detail unit-drill-down guidance")
        if "<dt>Outdoor Leadership Depth</dt>" not in help_source:
            errors.append("help.html: missing Outdoor Leadership Depth measure definition")
        if "first name and last initial" not in help_source:
            errors.append("help.html: missing public person-name privacy guidance")
        if "<strong>Data &amp; Help</strong>" not in help_source or "training reference links" not in help_source:
            errors.append("help.html: missing Data & Help training-reference guidance")

    deprecated_pin_wording = "over 12 months " + "old"
    pin_wording_files = (
        "README.md",
        "DASHBOARD_DATA_DICTIONARY.md",
        "IMPLEMENTATION_RUNBOOK.md",
        "help.html",
        "unit-health.html",
        "unit-level-dashboard.js",
        "council-dashboard-summary.20260626-tay-kpi.js",
        "tools/build_human_data_guide.py",
    )
    for relative in pin_wording_files:
        wording_path = root / relative
        if wording_path.is_file() and deprecated_pin_wording in wording_path.read_text(encoding="utf-8").casefold():
            errors.append(f"{relative}: contains deprecated PIN freshness wording")

    for relative, page_key in DETAIL_PAGES.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"missing required detail page: {relative}")
            continue
        parsed = parse_page(path)
        if parsed.body_page != page_key:
            errors.append(f"{relative}: expected data-page={page_key!r}, found {parsed.body_page!r}")
        if not any("site-navigation.js?v=20260901-pin-status-page-1" in src for src in parsed.scripts):
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

    readiness_asset_version = "20260830-status-filter-1"
    readiness_pages = (
        "camping-readiness.html",
        "troop-camping-readiness.html",
        "training.html",
        "syt.html",
        "people.html",
        "unit-level.html",
    )
    for relative in readiness_pages:
        path = root / relative
        if not path.is_file():
            continue
        expected = f"outdoor-readiness.js?v={readiness_asset_version}"
        if expected not in parse_page(path).scripts:
            errors.append(f"{relative}: missing shared outdoor-readiness script {expected!r}")

    readiness_path = root / "outdoor-readiness.js"
    if readiness_path.is_file():
        readiness_source = readiness_path.read_text(encoding="utf-8")
        for required in (
            'if (count <= 0)',
            'if (count === 1)',
            'key: "unknown"',
            'matchesDepthStatus',
            'qualificationRows.length < 2',
            'row?.iols_trained',
            'includes("S11")',
        ):
            if required not in readiness_source:
                errors.append(f"outdoor-readiness.js: missing leadership-depth contract {required!r}")

    readiness_status_options = (
        '<option value="">All statuses</option>',
        '<option value="gap">Gap</option>',
        '<option value="fragile">Fragile</option>',
        '<option value="preferred">Preferred Depth</option>',
        '<option value="unknown">Unknown</option>',
    )
    readiness_filter_contracts = {
        "camping-readiness.html": "camping-readiness.js",
        "troop-camping-readiness.html": "troop-camping-readiness.js",
    }
    for page_name, script_name in readiness_filter_contracts.items():
        page_source = (root / page_name).read_text(encoding="utf-8")
        script_source = (root / script_name).read_text(encoding="utf-8")
        for option in readiness_status_options:
            if option not in page_source:
                errors.append(f"{page_name}: missing readiness Status option {option!r}")
        if 'id="hazardSelect"' not in page_source:
            errors.append(f"{page_name}: missing separate Hazardous Weather filter")
        if "CACOutdoorReadiness.matchesDepthStatus" not in script_source:
            errors.append(f"{script_name}: Status selector must filter leadership-depth status")
        if '"hazardSelect"' not in script_source:
            errors.append(f"{script_name}: Hazardous Weather selector must remain bound")
        if "actionPacks()" in script_source or "actionTroops()" in script_source:
            errors.append(f"{script_name}: readiness table must include preferred-depth units")

    unit_level_path = root / "unit-level.html"
    unit_level_script_path = root / "unit-level-dashboard.js"
    if unit_level_path.is_file() and unit_level_script_path.is_file():
        unit_level_page = unit_level_path.read_text(encoding="utf-8")
        unit_level_script = unit_level_script_path.read_text(encoding="utf-8")
        if "unit-level-dashboard.js?v=20260903-pin-detail-link-1" not in unit_level_page:
            errors.append("unit-level.html: missing cache-busted Unit-Level PIN-context script")
        if "panel-help.js?v=20260630-active-help" not in unit_level_page:
            errors.append("unit-level.html: Commissioner Context PIN help must load panel help")
        for required in ('"Camping Readiness"', 'preferred: "Preferred Depth"', "CACOutdoorReadiness.depthStatus(null)"):
            if required not in unit_level_script:
                errors.append(f"unit-level-dashboard.js: missing Unit-Level readiness status contract {required!r}")
        for required in ('"PIN Status"', "dashboard?.unit_pin_statuses", "state.pinByUnit.get", 'Stale: ["More than 12 months since the last update, or update date is missing"'):
            if required not in unit_level_script:
                errors.append(f"unit-level-dashboard.js: missing Unit-Level PIN status contract {required!r}")
        for required in (
            "record.pin_details_complete === true",
            "record.pin_details_complete === false",
            "PIN status / completeness",
            "Details complete",
            "Details need follow-up",
            "[unitKey(row.district, row.unit), row]",
            "function preferredUnit",
            'new URLSearchParams(window.location.search).get("unit")',
        ):
            if required not in unit_level_script:
                errors.append(f"unit-level-dashboard.js: missing Commissioner Context PIN completeness contract {required!r}")

    documentation_contracts = {
        "README.md": ("Gap / Fragile / Preferred Depth / Unknown", "Unit-Level Detail uses the same shared classification"),
        "IMPLEMENTATION_RUNBOOK.md": ("All statuses, Gap, Fragile, Preferred Depth, and Unknown", "unmatched Training-tab units show Unknown"),
        "DASHBOARD_DATA_DICTIONARY.md": ("| Unknown |", "Every reviewed Pack", "Every reviewed Troop", "status is Unknown rather than Gap"),
        "tools/build_human_data_guide.py": ("Leadership-depth Status can be filtered", "Unknown is not converted to Gap", "Unit-Level camping readiness"),
    }
    for relative, required_phrases in documentation_contracts.items():
        source = (root / relative).read_text(encoding="utf-8")
        for phrase in required_phrases:
            if phrase not in source:
                errors.append(f"{relative}: missing camping-readiness documentation contract {phrase!r}")

    pin_documentation_contracts = {
        "README.md": ("PIN Status & Completeness", "Public `unit_pin_statuses` rows contain only Boolean completion flags", "Overview includes PIN state in Signals to Watch", "expandable individual-unit drill-down"),
        "DASHBOARD_DATA_DICTIONARY.md": ("Required PIN Details", "pin_contact_complete", "privacy-safe individual-unit rows", "Commissioner Context repeats the status as a badge"),
        "IMPLEMENTATION_RUNBOOK.md": ("PIN Status & Completeness", "Do not publish the underlying contact or meeting values", "Overview's Signals to Watch groups filtered matched rows", "expanded district unit rows"),
        "tools/build_human_data_guide.py": ("Required PIN Details is separate from freshness", "The public data contains only completion flags", "PIN state in Signals to Watch", "expandable district rows"),
    }
    for relative, required_phrases in pin_documentation_contracts.items():
        source = (root / relative).read_text(encoding="utf-8")
        for phrase in required_phrases:
            if phrase not in source:
                errors.append(f"{relative}: missing PIN completeness documentation contract {phrase!r}")

    operational_detail_documentation_contracts = {
        "README.md": ("Operational Detail district rows expand", "Unit-Level Detail"),
        "DASHBOARD_DATA_DICTIONARY.md": ("District Operational Detail drill-down", "priority attention"),
        "IMPLEMENTATION_RUNBOOK.md": ("Operational Detail district rows", "direct Unit-Level Detail link"),
        "tools/build_human_data_guide.py": ("expandable district rows", "individual unit health"),
    }
    for relative, required_phrases in operational_detail_documentation_contracts.items():
        source = (root / relative).read_text(encoding="utf-8")
        for phrase in required_phrases:
            if phrase not in source:
                errors.append(f"{relative}: missing Operational Detail documentation contract {phrase!r}")

    for relative, forbidden in {
        "camping-readiness.html": "Packs Missing Camping Leadership Coverage",
        "troop-camping-readiness.html": "Troops Missing Camping Leadership Coverage",
    }.items():
        path = root / relative
        if path.is_file() and forbidden in path.read_text(encoding="utf-8"):
            errors.append(f"{relative}: legacy binary camping-readiness language remains")

    syt_detail_path = root / "syt-detail.js"
    if syt_detail_path.is_file() and 'if (baloo.issue) issues.push("BALOO")' in syt_detail_path.read_text(encoding="utf-8"):
        errors.append("syt-detail.js: BALOO must not be counted as an individual leader issue")

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
            ".operational-unit-table-wrap {",
            ".operational-unit-detail-row[hidden] {",
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
        expected = f"council-dashboard-summary.css?v={SHARED_TABLE_ASSET_VERSION}"
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
        "District Operational Detail retention, PIN Currency, and plain-percentage safeguards, Priority Units metric filtering, Unit-Level PIN status, Unit Health PIN follow-up, "
        "public person-name privacy, and scroll-table safeguards."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# Council Dashboard Summary

Static web dashboard for Capitol Area Council summary metrics, monday.com operating snapshots, CST comparison data, and source workbook links.

The GitHub Pages entry point is `index.html`.

The masthead master filter (`Council / Packs / Troops / Crews / Ships / Posts`) persists across the main dashboard and linked detail pages. Program views use direct unit-type fields where available, parse standardized unit names for renewal and popcorn rows, and estimate program-specific TAY from each school's total TAY plus its published grade or age span. Visible cautions explain the equal-allocation assumption, eligibility exceptions, overlapping program populations, and limited school-source coverage above grade 12. Units-Youth history and most CST comparisons remain council-only.

Public URLs:

- Council Dashboard Summary: https://pbsargent.github.io/council-dashboard-summary/
- Commissioner Dashboard portal: https://pbsargent.github.io/council-commissioner-dashboard/

Data sources and calculations are documented in `DASHBOARD_DATA_DICTIONARY.md`.

Technical setup, data acquisition, automation, validation, and rebuild guidance are documented in `IMPLEMENTATION_RUNBOOK.md`.

Freshness timestamps shown in the dashboard are rendered in the viewer browser's local timezone. No-offset Council dashboard timestamps are interpreted as America/Chicago source time before display.

The scheduled daily updater runs from the active working copy at `/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary`, orchestrated by `/Users/petersargent/CACDashboardPlatform/tools/daily_build_publish.zsh`. Older checkouts are retained only for reference and must not be used for production edits.

The normal web refresh also rebuilds `data/fall-recruitment-latest.js` from monday.com board `18420720719` for the Cub Scout JSN Dashboard. Its pre-publish validation requires both school-planning graphics to remain pie charts, matching the monday.com dashboard.

Global navigation is defined once in `site-navigation.js`. Major navigation selections open focused summary pages: `index.html` (Overview), `comparison.html`, `districts.html`, `membership.html`, `unit-health.html`, `people.html`, and `sources.html`. `pin-status.html` is the PIN Status & Completeness child page under District Performance. `key3-status.html` is the Unit Key 3 Coverage child page under Unit Health & Renewal. Existing operational detail pages remain indented beneath their parent summaries. CAC typography, color tokens, approved logo treatment, topo pattern usage, responsive navigation, and Overview action-path styling are defined in `cac-theme.css`.

Reader help is layered across the panel-level `?` controls, the print-friendly `help.html` dashboard guide, and the deeper source and calculation material linked from `sources.html`. The guide reads current refresh metadata from the published JSON bundles so its freshness label advances with the normal daily data deployment.

The approved Overview navigation contract places Commissioner Portal before Council Comparison. The approved People & Readiness navigation contract is: Training, SYT, Pack Camping Readiness, and Troop Camping Readiness. Pack Camping Readiness must remain at `camping-readiness.html`; Troop Camping Readiness must remain at `troop-camping-readiness.html`. Both pages read the daily `dashboard.training_people` data, use the shared `outdoor-readiness.js` Gap / Fragile / Preferred Depth / Unknown model, show all reviewed units, and filter leadership-depth status independently from Hazardous Weather coverage. Unit-Level Detail uses the same shared classification for its Pack/Troop Camping Readiness KPI and Training Readiness row. These behaviors must survive data-only refreshes and all future site publishes.

The scheduled updater runs `tools/validate_site_structure.py` after synchronizing with GitHub and again immediately before publication. The refresh fails closed if a required summary/detail page, discrete route, parent/child hierarchy, page identity, shared branded asset, or cache-versioned navigation/theme reference is missing, or if legacy in-page hash navigation returns.

Membership Intelligence uses the Council dashboard workbook `Units-Youth` tab for councilwide Unit & Youth Trends. The daily updater injects this tab into `dashboard.unit_youth_trends` through `tools/inject_unit_youth_trends.py` after the external workbook builder writes JSON.

The Unit Level Dashboard uses the latest dated Unit Level Metrics workbook, stored as `CAC - Unit Metric Scorecard.xlsx` and captured by `CACDashboardAutomation`. The daily publisher rebuilds `data/unit-level-latest.json` and `data/unit-level-latest.js` through `tools/build_unit_level_dashboard.py` before publishing.

Unit Key 3 Coverage uses the complete tracked-unit population and current registrations from the Training roster. Packs, Troops, Crews, and Ships require a program-specific Unit Leader, Committee Chair, and third Key 3 position; either a current COR or CUR satisfies that third position. Explorer Posts require only a current Post Advisor and Committee Chair, so COR/CUR is not required and does not reduce Post completion. A registration is current when its expiration is on or after the report date. The page supports the master program filter, Service Area, District, follow-up focus, and search; it summarizes completion by unit type and organizes missing-first detail in collapsible Service Area and District groups. The detail table shows the SYT expiration date beneath each holder instead of the position title and renders it red when expired or due within 90 days, based on the viewer's current date. Public names are reduced to first name plus last initial, and no contact fields are published in this dataset.

BeAScout PIN follow-up uses the main dashboard workbook's `Pin` tab. A matched PIN is `Stale` when more than 12 months have passed since its last update, or its update date is blank or unusable; otherwise its source `Active` or `Inactive` state is retained. The same state appears in every Unit Follow-up metric band and in the first Unit-Level Detail KPI. The Unit Health Funnel combines `Inactive` and `Stale` matched PINs, then divides by all membership-dashboard units in the selected program view. A unit without a matched PIN displays `n/a` and remains in that funnel denominator.

The District Performance scorecard uses the same classification for `PIN Currency`: matched current `Active` or `Inactive` PIN rows divided by all tracked units in the selected district/program view. `Stale` and unmatched `n/a` units remain in the denominator and do not count as current.

Operational Detail district rows expand to an individual-unit table beneath the selected district. The unit rows inherit the master program filter, sort lowest unit metrics first, summarize health, youth movement, retention, PIN status, commissioner assignment, SYT, and training, and link directly to the selected Unit-Level Detail record. Service Area and district rollups remain compact until opened.

Operational Detail keeps the unit headings visible below the district headings during both outer-panel and inner-unit scrolling, including Safari. Header positions adapt to resizing and wrapped headings without changing the underlying measures.

PIN Status & Completeness separates freshness from field completeness. A matched PIN has `Required PIN Details` only when status, contact name plus at least one contact method (email or phone), meeting location, and meeting details are present. Website, fee, fundraising, and availability fields are not counted. The percentage divides complete matched PINs by all tracked units; unmatched units stay in the denominator. Public `unit_pin_statuses` rows contain only Boolean completion flags, never contact names, email addresses, phone numbers, or meeting values.

District PIN Detail includes an expandable individual-unit drill-down. Expanded rows respect the master program, Service Area, District, and follow-up focus filters; prioritize unmatched, Stale, Inactive, and incomplete units; show only privacy-safe status, completion, and missing-category indicators; and link to the selected Unit-Level Detail record.

Expanded PIN unit tables preserve their own sticky headings beneath the district headings during both levels of scrolling, including Safari; status/completeness values must not appear labeled by district-only columns.

Overview includes PIN state in Signals to Watch and links directly to PIN Status & Completeness from Explore. Unit-Level Detail keeps the existing PIN Status KPI and also presents separate PIN status and Required PIN Details badges in the Commissioner Context panel. These surfaces reuse the shared `unit_pin_statuses` classification and completion flags rather than recalculating PIN state.

The scheduled Council Summary publisher uses the `CACDashboardAutomation/.venv` Python environment and does not require the Codex application or a Codex-managed runtime to be running.

Both the Council Summary and Commissioner portal deploy daily data as verified
GitHub Pages artifacts. Their repositories retain ordinary linear history for
source changes only. The consolidated platform is their sole production
deployer; force pushes and parentless commits are prohibited.

All person names in public Council Summary and Commissioner portal data are
published as first name plus last initial (for example, `Alex R.`). The
publication sanitizer covers the shared Council snapshot, Unit Level bundles,
and Renewal Board bundle without modifying the private source workbooks.

For manual site-only publishing after HTML/CSS/JS/data edits, use `publish_site_only.zsh` or double-click `Publish Council Dashboard.command`. This path does not rebuild source workbooks.

Service Area filtering and district volunteer leadership are refreshed from the authoritative monday.com `Field Service / Service Areas` board. The run-specific hierarchy is applied during JSON generation and is available alongside District filters across the major dashboard pages; board leadership values, including intentional blanks, override workbook values.

Popcorn Commitments is included as a home-page participation KPI and as a dedicated operational page with a collapsed-by-default Service Area → District → Unit hierarchy. Its rows refresh from the normal daily monday.com workbook, with the API retained as a fallback. The public Popcorn snapshot contains unit-level commitment, goal, sales, onboarding, and training fields but excludes contact names, email addresses, and phone numbers.

The workbook importer accepts the current `Popcorn Details` sheet and the legacy `Popcorn Committments` / `Popcorn Commitments` names. Both workbook and API paths publish full public prospect, renewal, and school rows, including school TAY, Grades, and Scouting District. `tools/validate_monday_snapshot.py` rejects missing detail, count mismatches, duplicate identities, invalid TAY, and a missing/zero council TAY denominator before output replacement. The daily publisher stops on refresh failure and runs the structural validator with `--require-data` before deployment. Run `tools/test_monday_tay.py` for the regression checks.

For a more shareable reader-facing guide, see:

- `docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.docx`
- `docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.pdf`

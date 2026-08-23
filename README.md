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

Global navigation is defined once in `site-navigation.js`. Major navigation selections open focused summary pages: `index.html` (Overview), `comparison.html`, `districts.html`, `membership.html`, `unit-health.html`, `people.html`, and `sources.html`. Existing operational detail pages remain indented beneath their parent summaries. CAC typography, color tokens, approved logo treatment, topo pattern usage, responsive navigation, and Overview action-path styling are defined in `cac-theme.css`.

The approved People & Readiness navigation contract is: Training, SYT, Pack Camping Readiness, Troop Camping Readiness, and Commissioner Portal. Pack Camping Readiness must remain at `camping-readiness.html`; Troop Camping Readiness must remain at `troop-camping-readiness.html`. Both pages read the daily `dashboard.training_people` data and must survive data-only refreshes and all future site publishes.

The scheduled updater runs `tools/validate_site_structure.py` after synchronizing with GitHub and again immediately before publication. The refresh fails closed if a required summary/detail page, discrete route, parent/child hierarchy, page identity, shared branded asset, or cache-versioned navigation/theme reference is missing, or if legacy in-page hash navigation returns.

Membership Intelligence uses the Council dashboard workbook `Units-Youth` tab for councilwide Unit & Youth Trends. The daily updater injects this tab into `dashboard.unit_youth_trends` through `tools/inject_unit_youth_trends.py` after the external workbook builder writes JSON.

The Unit Level Dashboard uses the latest dated Unit Level Metrics workbook, stored as `CAC - Unit Metric Scorecard.xlsx` and captured by `CACDashboardAutomation`. The daily publisher rebuilds `data/unit-level-latest.json` and `data/unit-level-latest.js` through `tools/build_unit_level_dashboard.py` before publishing.

The scheduled Council Summary publisher uses the `CACDashboardAutomation/.venv` Python environment and does not require the Codex application or a Codex-managed runtime to be running.

Both the Council Summary and Commissioner portal deploy daily data as verified
GitHub Pages artifacts. Their repositories retain ordinary linear history for
source changes only. The consolidated platform is their sole production
deployer; force pushes and parentless commits are prohibited.

For manual site-only publishing after HTML/CSS/JS/data edits, use `publish_site_only.zsh` or double-click `Publish Council Dashboard.command`. This path does not rebuild source workbooks.

Service Area filtering and district volunteer leadership are refreshed from the authoritative monday.com `Field Service / Service Areas` board. The run-specific hierarchy is applied during JSON generation and is available alongside District filters across the major dashboard pages; board leadership values, including intentional blanks, override workbook values.

Popcorn Commitments is included as a home-page participation KPI and as a dedicated operational page with a collapsed-by-default Service Area → District → Unit hierarchy. Its rows refresh from the normal daily monday.com workbook, with the API retained as a fallback. The public Popcorn snapshot contains unit-level commitment, goal, sales, onboarding, and training fields but excludes contact names, email addresses, and phone numbers.

For a more shareable reader-facing guide, see:

- `docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.docx`
- `docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.pdf`

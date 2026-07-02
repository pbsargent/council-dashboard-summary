# Council Dashboard Summary

Static web dashboard for Capitol Area Council summary metrics, monday.com operating snapshots, CST comparison data, and source workbook links.

The GitHub Pages entry point is `index.html`.

Public URLs:

- Council Dashboard Summary: https://pbsargent.github.io/council-dashboard-summary/
- Commissioner Dashboard portal: https://pbsargent.github.io/council-commissioner-dashboard/

Data sources and calculations are documented in `DASHBOARD_DATA_DICTIONARY.md`.

Technical setup, data acquisition, automation, validation, and rebuild guidance are documented in `IMPLEMENTATION_RUNBOOK.md`.

Freshness timestamps shown in the dashboard are rendered in the viewer browser's local timezone. No-offset Council dashboard timestamps are interpreted as America/Chicago source time before display.

The scheduled daily updater runs from the launchd-safe working copy at `/Users/petersargent/CouncilDashboardSummaryRepo`, using `/Users/petersargent/CouncilDashboardSummaryUpdate.zsh`. The checkout under `outputs/council-dashboard-summary-github` remains useful for development, but it is not the active scheduled GitHub Pages working copy.

Both the Council Summary and the separate Commissioner Dashboard portal now use historyless publishing. Each publish replaces the public `main` branch with one current root commit using `--force-with-lease`, so the repos do not grow by one commit per daily refresh.

Service Area filtering is based on Bill Kohl's authoritative 2026-06-30 `Districts and Service Area` email. The mapping is applied during JSON generation and is available alongside District filters across the major dashboard pages.

For a more shareable reader-facing guide, see:

- `docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.docx`
- `docs/Council-Dashboard-Summary-Source-and-Calculation-Guide.pdf`

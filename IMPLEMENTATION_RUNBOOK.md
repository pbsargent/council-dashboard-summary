# Council Dashboard Summary Implementation Runbook

Last reviewed: 2026-08-13

This runbook is for a technical handoff. It explains what another analyst or engineer needs to acquire data, recreate a similar static dashboard, run the daily refresh, validate outputs, and publish through GitHub Pages.

Use this with:

- `README.md` for project orientation
- `DASHBOARD_DATA_DICTIONARY.md` for source fields and calculations
- `tools/build_human_data_guide.py` for the reader-facing DOCX/PDF guide
- `update_daily.zsh`, `refresh_monday_data.py`, and `work/commissioner_site/build_site.py` for the actual refresh implementation

## 1. What Must Exist

### Local Runtime

The current automation uses the Codex-bundled Python runtime:

```text
/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

Required Python capabilities:

- `openpyxl` for reading Excel workbooks
- `python-docx` for generating the human-readable DOCX guide
- Standard library modules for JSON, paths, dates, HTTP, and subprocess-safe file handling

For a similar dashboard on another machine, either install equivalent Python packages in a normal virtual environment or update the scripts to point at that machine's Python.

### GitHub Pages Repository

The active publishing repository is:

```text
/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary
https://github.com/pbsargent/council-dashboard-summary
```

GitHub Pages publishes from the `main` branch. The browser-facing site is static HTML, CSS, JavaScript, images, and JSON.

Minimum static files for a similar dashboard:

- `index.html`
- `council-dashboard-summary.css`
- `panel-help.js` for active `?` panel help popovers
- Dashboard JavaScript files
- `assets/`
- `data/latest.json`
- Optional `data/monday-latest.json`
- Optional `renewal-board/` static subpage and `renewal-board/data.js`
- Optional `docs/` artifacts

This repository also carries operational helper scripts:

- `tools/inject_unit_youth_trends.py` injects the workbook `Units-Youth` tab into published dashboard JSON.
- `publish_site_only.zsh` publishes prepared local site changes without rebuilding source workbooks.
- `Publish Council Dashboard.command` is the double-click wrapper for `publish_site_only.zsh`.

Separate Commissioner Dashboard portal:

```text
/Users/petersargent/CACDashboardPlatform/sites/council-commissioner-dashboard
https://github.com/pbsargent/council-commissioner-dashboard
https://pbsargent.github.io/council-commissioner-dashboard/
```

That repository is a small static portal into the Council Dashboard Summary and reads the same canonical `data/latest.json`. It is not a separate embedded-data dashboard.

### Persistent Camping Readiness Build Contract

Future builds and publishes must preserve these two data-driven detail pages:

- `camping-readiness.html`: **Pack Camping Readiness**, using BALOO and current Hazardous Weather roster coverage.
- `troop-camping-readiness.html`: **Troop Camping Readiness**, using the absence of mandatory code `S11` as the published IOLS readiness signal plus current Hazardous Weather roster coverage.

Both pages belong under **People & Readiness**, after Training and SYT and before Commissioner Portal. They must not be moved back under Unit Health & Renewal. Their page eyebrow and back link must continue to identify `people.html` as the parent page.

This is enforced in `tools/validate_site_structure.py` through `DETAIL_PAGES`, `NAVIGATION_ROUTES`, and `NAVIGATION_HIERARCHY`. The scheduled updater runs that validator after loading the current site code and again immediately before publication. A future build that removes either page, changes its route or page identity, or moves it to the wrong navigation parent must fail before publishing.

## 2. Data Acquisition Requirements

The dashboard does not read Google Drive, OneDrive, or monday.com from the browser. Data is acquired by local scripts, converted to JSON, committed by the consolidated single writer, and served by GitHub Pages.

### Google Shared Drive Access

The refresh account must have local Google Drive for desktop access to these shared drives:

| Shared drive | Required files | Used by |
| --- | --- | --- |
| `Council Dashboard Reports` | Newest `*_Dashboard - CAC.xlsx` for the main council dashboard; newest `*_CAC - Unit Metric Scorecard.xlsx` for Unit Level detail | Main council dashboard data and Unit Level dashboard data |
| `Council Metric Reports` | Newest `*_CST7.xlsx` | Council Service Territory comparison |
| `Council monday.com Reports` | Newest `*monday-export.xlsx` | monday.com operating detail and TAY |

Current local base path pattern:

```text
/Users/petersargent/Library/CloudStorage/GoogleDrive-peter@imetpetersargent.com/Shared drives/<drive name>
```

If another user or machine has a different Google Drive account path, update the default paths in:

- `work/commissioner_site/build_site.py`
- `refresh_monday_data.py`
- `update_daily.zsh` if wrapper paths change

### Source Workbook Naming

The automated selectors depend on filename patterns:

| Source | Pattern |
| --- | --- |
| Council dashboard workbook | `*_Dashboard - CAC.xlsx` only |
| Unit Level Metrics workbook | `*_CAC - Unit Metric Scorecard.xlsx` only |
| CST workbook | `*_CST7.xlsx` |
| monday.com export workbook | `*monday-export.xlsx` |

The scripts choose the newest matching file by modification time and filename. Keep the council dashboard workbook and Unit Level Metrics patterns separate even when both files live in `Council Dashboard Reports`. The CAC dashboard deck builder must never use a Unit Level Metrics workbook; that workbook does not contain the `Membership` sheet and will fail the build. If naming changes, update the glob patterns in the refresh scripts.

### Non-Workbook Source: Service Areas

Service Area grouping is controlled by the authoritative Bill Kohl email titled `Districts and Service Area`, received 2026-06-30. The mapping is hard-coded in `work/commissioner_site/build_site.py` so daily refreshes can add `service_area` and `service_area_field_director` to published JSON rows.

Current mapping:

| Service Area | Field Director | Districts |
| --- | --- | --- |
| Northern | Justin Brundin | Bee Cave, Chisholm Trail, Hill Country, North Shore |
| Central | Vicki Rosengarten | Armadillo, Colorado River, Exploring, San Gabriel, Thunderbird |
| Southern | Ed Grune | Live Oak, Sacred Springs, Waterloo |

If the council changes Service Area ownership, update `SERVICE_AREAS` in `build_site.py`, rebuild `data/latest.json`, republish the Council Summary, and refresh the documentation.

### Required Workbook Sheets

Council dashboard workbook:

- `Membership`
- `Unit Metric Compare`
- `Glance`
- `Training Dive`
- `Objectives - Commissioners`
- `Unit Metrics`
- `Assigned`
- `Pin`
- `Units`
- `Training`
- `Training Codes`
- `Commissioners`
- `Units-Youth`

CST workbook:

- `Membership`
- `Unit Metric Compare`
- `Glance`

monday.com export workbook:

- `Overview`
- `New unit Hot Prospects`
- `2026 Unit Renewal`
- `Schools`
- `Popcorn Committments`

The renewal board subpage also reads the `2026 Unit Renewal` sheet and joins it to the Council dashboard `Units` and `RenewNewDrop` tabs through `work/renewal_recreation/build_renewal_board_data.py`.

The Membership Intelligence Unit & Youth Trends section reads the `Units-Youth` tab through `tools/inject_unit_youth_trends.py`. This injector runs after the external workbook builder writes `data/latest.json` and the dated archive, because the external builder lives outside this repo and is not the only place the GitHub Pages refresh is coordinated.

`DASHBOARD_DATA_DICTIONARY.md` lists the important fields used from each sheet. Header changes in these workbooks are the most likely cause of a refresh failure or silent metric drift.

### monday.com API Token

The preferred monday.com input is the daily workbook export for Prospects, Renewals, Schools, and Popcorn. If the workbook is unavailable, the API fallback maintains board summaries and privacy-safe Popcorn rows; the other detailed board views remain workbook-dependent.

Token locations currently used:

- `refresh_monday_data.py` default: `/Users/petersargent/Documents/Monday-Com-API-Token.txt`
- Active wrapper default: `/Users/petersargent/Documents/06 Personal, Legal, and Sensitive/Sensitive - Move to Password Manager/Monday-Com-API-Token.txt`
- Active wrapper override: set `MONDAY_API_TOKEN_FILE`

Accepted token file format:

```text
actual_token_value
```

or:

```text
MONDAY_API_TOKEN=actual_token_value
```

Required API access:

- Read access to the Capitol Area Council monday.com workspace
- Read access to the boards configured in `refresh_monday_data.py`
- Ability to query board items and column values

Current board IDs are embedded in `refresh_monday_data.py`.

## 3. Build and Refresh Flow

The daily refresh is coordinated by:

```text
/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/update_daily.zsh
```

The installed LaunchAgent runs:

```text
/bin/zsh -lc 'COUNCIL_DASHBOARD_SUMMARY_REPO=/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/update_daily.zsh'
```

The operational order is:

1. Run `work/commissioner_site/build_site.py`.
2. Locate the newest `*_Dashboard - CAC.xlsx` Council dashboard workbook.
3. Exclude `*_CAC - Unit Metric Scorecard.xlsx` from the CAC dashboard source selection even if it has the newest modified time.
4. Locate the newest CST workbook.
5. Generate `data/latest.json`.
6. Generate dated archive JSON, for example `data/2026-06-28.json`.
7. Run `tools/inject_unit_youth_trends.py` against `data/latest.json` and `data/YYYY-MM-DD.json`.
8. Run `refresh_monday_data.py`.
9. Prefer the newest monday.com export workbook.
10. Fall back to monday.com API if workbook acquisition fails.
11. Generate or preserve `data/monday-latest.json`.
12. Locate the newest validated `*_CAC - Unit Metric Scorecard.xlsx` captured by `CACDashboardAutomation`.
13. Rebuild `data/unit-level-latest.json` and `data/unit-level-latest.js` with `tools/build_unit_level_dashboard.py`.
14. Copy refreshed JSON and Unit Level data to the local preview site when present.
15. Rebuild `renewal-board/data.js` when the renewal board subpage exists.
16. Copy the renewal-board data bundle to the local preview site when present.
17. Fetch `origin/main` and align the automation-owned checkout to it.
18. Stage changed JSON files, the Unit Level data bundle, and `renewal-board/data.js`.
19. Create one ordinary child commit from the staged changes.
20. Push it to GitHub Pages without force.

The website code is not regenerated daily. JSON data files and the renewal-board data bundle update unless a human commits HTML/CSS/JS changes.

The installed scheduled launcher is `/Users/petersargent/CACDashboardPlatform/tools/daily_pipeline.zsh`. The site updater should contain these Unit & Youth injector lines:

```zsh
UNIT_YOUTH_INJECTOR="${COUNCIL_DASHBOARD_SUMMARY_UNIT_YOUTH_INJECTOR:-${SUMMARY_REPO}/tools/inject_unit_youth_trends.py}"
require_file "$UNIT_YOUTH_INJECTOR"
"$PYTHON" "$UNIT_YOUTH_INJECTOR" "${SUMMARY_REPO}/data/latest.json" "${SUMMARY_REPO}/data/${SNAPSHOT_DATE}.json"
```

If those lines are missing, restore `update_daily.zsh` from the consolidated
platform source; the site repository no longer installs its own scheduler.

The Commissioner Dashboard portal is published by:

```text
/Users/petersargent/CACDashboardPlatform/work/commissioner_site/update_and_publish_github.zsh
```

The sole 8:30 AM platform job invokes this publisher after the Council site. It
writes the portal only when shared code or assets changed and publishes an
ordinary linear commit without force.

## 4. Manual Refresh

Use a manual refresh when validating a new source workbook, testing a path change, or recovering from a missed scheduled run.

Recommended command:

```bash
COUNCIL_DASHBOARD_SUMMARY_REPO=/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/update_daily.zsh
```

Optional monday.com token override:

```bash
MONDAY_API_TOKEN_FILE=/path/to/Monday-Com-API-Token.txt \
COUNCIL_DASHBOARD_SUMMARY_REPO=/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary \
/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/update_daily.zsh
```

Manual council/CST build only:

```bash
/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/petersargent/Documents/Codex/Daily\ Uodate/work/commissioner_site/build_site.py \
  --output-dir /tmp/council-dashboard-test
```

Manual monday.com workbook refresh only:

```bash
/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/refresh_monday_data.py \
  --token-file /path/to/Monday-Com-API-Token.txt \
  --output /tmp/monday-latest.json
```

Manual Unit & Youth trend injection only:

```bash
/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/tools/inject_unit_youth_trends.py \
  /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/data/latest.json \
  /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/data/$(date +%F).json
```

This reads the workbook path already stored in each JSON file at `dashboard.source`, then extracts the `Units-Youth` tab into `dashboard.unit_youth_trends`.

## 5. Schedule and Logs

Installed LaunchAgent:

```text
/Users/petersargent/Library/LaunchAgents/com.cac.dashboard.macpro-daily.plist
```

Current schedule:

```text
Daily at 9:05 AM local machine time
```

Related daily automation sequence:

| Time | LaunchAgent | Purpose |
| --- | --- | --- |
| 8:30 AM | `com.cac.dashboard.sync` | Download/sync the Council dashboard workbook |
| 8:35 AM | `com.cac.dashboard.cst7sync` | Download/sync the CST7 workbook |
| 8:40 AM | `com.cac.dashboard.refresh` | Build branded CAC dashboard deck/PDF |
| 8:45 AM | `com.cac.dashboard.unitmetricrefresh` | Build UnitMetricCompare deck/PDF |
| 8:50 AM | `com.cac.dashboard.githubpublish` | Publish the Commissioner Dashboard portal |
| 8:55 AM | `com.pbsargent.membership-operating-reports.daily` | Export monday.com workbook and build operating deck/PDF |
| 9:05 AM | `com.cac.dashboard.macpro-daily` | Build and publish Council Dashboard Summary JSON |

Current log files:

```text
/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.log
/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.err.log
```

Useful checks:

```bash
launchctl print gui/$(id -u)/com.cac.dashboard.macpro-daily
tail -50 "/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.log"
tail -50 "/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.err.log"
```

## 6. Publication and Cache Behavior

Publishing occurs when the active repo pushes to:

```text
origin main
```

The Pages repositories use normal linear history. The consolidated publisher
starts from the current remote commit, verifies that no second writer changed
GitHub during generation, and pushes without force.

Public site:

```text
https://pbsargent.github.io/council-dashboard-summary/
```

JSON fetches use `cache: "no-store"`, so daily data updates should appear without changing script filenames. HTML/CSS/JS changes may require cache-busting query strings, such as:

```html
<script src="council-dashboard-summary.20260626-tay-kpi.js?v=20260628-viewer-tz2"></script>
```

Use cache busting after code changes, not for ordinary data-only refreshes.

Most major panels include circular `?` controls. The text lives in the HTML button `title` attributes, while `panel-help.js` removes the native title tooltip and displays a custom hover/focus/click popover. After changing panel help behavior or styling, bump the `panel-help.js` and CSS query strings.

For manual site-only publishing after page, script, stylesheet, docs, or already-prepared data changes, run:

```bash
cd /Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary
./publish_site_only.zsh "Publish site updates"
```

Or double-click:

```text
/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/Publish Council Dashboard.command
```

This path stages and commits the current repo state and pushes to GitHub Pages. It does not rebuild Council/CST workbooks, refresh monday.com, or regenerate renewal-board data unless those files are already changed locally.

## 7. Validation Checklist

After any refresh or rebuild, check:

- `data/latest.json` exists and has the expected `generated_date`.
- A dated archive JSON exists for the same generated date.
- `data/monday-latest.json` exists or the monday.com failure was expected and the previous file was intentionally preserved.
- `data/unit-level-latest.json` and `data/unit-level-latest.js` exist, match, and reference the newest validated Unit Level Metrics capture.
- Unit Level renewal names remain first name plus last initial; the intake job must reject the workbook otherwise.
- `renewal-board/data.js` exists and its metadata references the newest renewal and dashboard workbook inputs.
- Council dashboard source name matches the newest `*_Dashboard - CAC.xlsx` and is not a `*_CAC - Unit Metric Scorecard.xlsx` Unit Level Metrics file.
- CST source name matches the newest `*_CST7.xlsx`.
- monday.com source workbook matches the newest `*monday-export.xlsx`, unless API fallback was used.
- `dashboard.districts` includes the 12 official districts.
- Council youth, units, training rows, commissioner rows, prospects, renewals, school rows, and Popcorn participation counts are plausible.
- Home page loads without JavaScript errors.
- Training, SYT, monday.com, Popcorn, unit metrics, and membership detail pages load.
- Pack Camping Readiness and Troop Camping Readiness load, remain under People & Readiness, and read the current `dashboard.training_people` snapshot.
- Pack Camping Readiness continues to evaluate BALOO plus current Hazardous Weather coverage; Troop Camping Readiness continues to evaluate the IOLS `S11` signal plus current Hazardous Weather coverage.
- Renewal board page loads, honors light/dark mode, and links back to the Council Summary page.
- Panel `?` controls display active help popovers on hover, focus, or click/tap.
- Service Area and District filters both populate and work on the home page, Training, SYT, Unit Metrics, Membership, monday.com detail, Popcorn, and Commissioner Dashboard.
- Popcorn rows reconcile to the daily workbook extraction (or API fallback), participation equals committed rows divided by all rows, and no contact name, email, or phone fields are published.
- Lower-left freshness timestamp displays in the viewer timezone.
- `dashboard.service_area_source` is present, and all 12 official districts have `service_area`.
- `dashboard.council.unit_commissioners` counts unique Unit Commissioner people, not duplicate role rows.
- `dashboard.unit_youth_trends` exists and includes `new_units`, `new_youth`, `total_youth`, and `total_units`.
- Each `dashboard.unit_youth_trends.series.*.values` object includes `2026`, `2025`, and `2024`.
- Membership Intelligence shows four Unit & Youth grouped bar charts and each chart's `?` button expands a 2026/2025/2024 data table.
- Git status is clean after a successful scheduled publish, except for intentionally ignored local files.

Suggested public checks:

```bash
curl -I https://pbsargent.github.io/council-dashboard-summary/
curl -I https://pbsargent.github.io/council-dashboard-summary/data/latest.json
curl -I https://pbsargent.github.io/council-dashboard-summary/data/monday-latest.json
```

## 8. Common Failure Modes

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Missing `latest.json` | Council/CST builder failed | Google Drive path, workbook names, required sheets |
| monday.com page is stale | monday workbook missing and API fallback failed | Export workbook, token path, API access |
| 18 monday.com districts appear | Operational labels included | Official-district filtering logic and source labels |
| School market context is blank | Schools rows missing or district labels do not match official districts | `boards.schools.rows`, `scouting_district`, official district list |
| Git push fails | Auth, network, or a second writer changed GitHub | `git status`, `git fetch`, GitHub credentials, remote `origin/main` |
| Page still shows old code | Browser or CDN cached JavaScript | Bump script query string and republish |
| `?` help does not open | Missing/stale `panel-help.js` or cached CSS | Confirm `panel-help.js` is loaded, CSS has `.panel-help-tooltip`, and query strings were bumped |
| Future-looking timestamp | Source timezone interpreted incorrectly | Check whether timestamp has `Z`/offset or should be treated as America/Chicago |
| Service Area filter missing or empty | Stale JavaScript/HTML or missing mapping in JSON | Check cache-busted script URL, `dashboard.service_areas`, and `service_area` fields |
| CAC deck fails with `Worksheet Membership does not exist` | CAC deck builder selected a Unit Level Metrics workbook instead of the `Dashboard - CAC` workbook | Verify `update_from_google_folder.zsh` filters to `*_Dashboard - CAC.xlsx`; confirm the log line `Newest workbook:` shows the dated Dashboard file, not `*_CAC - Unit Metric Scorecard.xlsx` |
| Unit & Youth trends missing/stale | Injector not present in scheduled launcher or `Units-Youth` tab changed layout | Check `UNIT_YOUTH_INJECTOR` lines in `/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/update_daily.zsh`, run `tools/inject_unit_youth_trends.py`, verify `dashboard.unit_youth_trends` |
| Membership trend charts show legend but no 2024 values | Published JSON lacks 2024 series or stale script/data cache | Verify `dashboard.unit_youth_trends.series.*.values.2024`, refresh page, confirm cache-busted `membership-detail.20260626.js` |
| Commissioner publisher diverges | A legacy checkout still has production push access | Confirm only `/Users/petersargent/CACDashboardPlatform/sites/council-commissioner-dashboard` can push |
| Workbook quality concern | Concentrated formula errors in source workbook | Scan actual Excel error cells; current 2026-07-01 CAC workbook has concentrated errors in `Renewal Prep` and `Objectives - Commissioners`, not a mostly-error workbook |

## 9. Rebuilding a Similar Dashboard

For a similar council or organization:

1. Create a static GitHub Pages repository.
2. Decide the canonical source workbooks and daily export process.
3. Define workbook filename patterns and required sheets.
4. Build a local extractor that writes stable JSON.
5. Keep calculations in source code and document them in a data dictionary.
6. Build the dashboard against the JSON, not directly against private data sources.
7. Add a daily automation that refreshes JSON and publishes the current static tree to GitHub Pages.
8. Add validation checks for source freshness, row counts, official district labels, and key KPI plausibility.
9. Use cache-busted script URLs after code changes.
10. Keep a human-readable source/calculation guide aligned with the technical dictionary.

## 10. Security and Privacy Notes

- Do not commit monday.com API tokens.
- Do not expose private Google Drive local paths in browser-facing data unless acceptable for the audience.
- Do not put sensitive person-level fields into public JSON unless the dashboard audience is authorized for them.
- Treat the published `data/` directory as public once pushed to GitHub Pages.

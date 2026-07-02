# Council Dashboard Summary Implementation Runbook

Last reviewed: 2026-07-01

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
/Users/petersargent/CouncilDashboardSummaryRepo
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

Separate Commissioner Dashboard portal:

```text
/Users/petersargent/CACDashboardAutomation/outputs/council-commissioner-dashboard-github
https://github.com/pbsargent/council-commissioner-dashboard
https://pbsargent.github.io/council-commissioner-dashboard/
```

That repository is a small static portal into the Council Dashboard Summary and reads the same canonical `data/latest.json`. It is not a separate embedded-data dashboard.

## 2. Data Acquisition Requirements

The dashboard does not read Google Drive, OneDrive, or monday.com from the browser. Data is acquired by local scripts, converted to JSON, historylessly published to GitHub, and served by GitHub Pages.

### Google Shared Drive Access

The refresh account must have local Google Drive for desktop access to these shared drives:

| Shared drive | Required files | Used by |
| --- | --- | --- |
| `Council Dashboard Reports` | Newest `*Dashboard - CAC*.xlsx` | Main council dashboard data |
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
| Council dashboard workbook | `*Dashboard - CAC*.xlsx` |
| CST workbook | `*_CST7.xlsx` |
| monday.com export workbook | `*monday-export.xlsx` |

The scripts choose the newest matching file by modification time and filename. If naming changes, update the glob patterns in the refresh scripts.

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

CST workbook:

- `Membership`
- `Unit Metric Compare`
- `Glance`

monday.com export workbook:

- `Overview`
- `New unit Hot Prospects`
- `2026 Unit Renewal`
- `Schools`

The renewal board subpage also reads the `2026 Unit Renewal` sheet and joins it to the Council dashboard `Units` and `RenewNewDrop` tabs through `work/renewal_recreation/build_renewal_board_data.py`.

`DASHBOARD_DATA_DICTIONARY.md` lists the important fields used from each sheet. Header changes in these workbooks are the most likely cause of a refresh failure or silent metric drift.

### monday.com API Token

The preferred monday.com input is the daily workbook export. The API fallback is still useful for basic board-level counts if the workbook is unavailable.

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
/Users/petersargent/CouncilDashboardSummaryUpdate.zsh
```

The installed LaunchAgent runs:

```text
/bin/zsh -lc 'COUNCIL_DASHBOARD_SUMMARY_REPO=/Users/petersargent/CouncilDashboardSummaryRepo /Users/petersargent/CouncilDashboardSummaryUpdate.zsh'
```

The operational order is:

1. Run `work/commissioner_site/build_site.py`.
2. Locate the newest Council dashboard workbook.
3. Locate the newest CST workbook.
4. Generate `data/latest.json`.
5. Generate dated archive JSON, for example `data/2026-06-28.json`.
6. Run `refresh_monday_data.py`.
7. Prefer the newest monday.com export workbook.
8. Fall back to monday.com API if workbook acquisition fails.
9. Generate or preserve `data/monday-latest.json`.
10. Copy refreshed JSON to the local preview site when present.
11. Rebuild `renewal-board/data.js` when the renewal board subpage exists.
12. Copy the renewal-board data bundle to the local preview site when present.
13. Fetch/pull `origin/main` for the publishing repo.
14. Stage changed JSON files and `renewal-board/data.js`.
15. Create a fresh root commit from the staged site tree.
16. Push that single commit to GitHub Pages with `--force-with-lease`.

The website code is not regenerated daily. JSON data files and the renewal-board data bundle update unless a human commits HTML/CSS/JS changes.

The Commissioner Dashboard portal is published by:

```text
/Users/petersargent/CACDashboardAutomation/work/commissioner_site/update_and_publish_github.zsh
```

Its LaunchAgent runs at 8:50 AM local machine time. The publisher writes the portal HTML and uses the same historyless `git commit-tree` plus `push --force-with-lease` pattern. The commissioner repository should therefore remain one current root commit rather than growing each day.

## 4. Manual Refresh

Use a manual refresh when validating a new source workbook, testing a path change, or recovering from a missed scheduled run.

Recommended command:

```bash
COUNCIL_DASHBOARD_SUMMARY_REPO=/Users/petersargent/CouncilDashboardSummaryRepo /Users/petersargent/CouncilDashboardSummaryUpdate.zsh
```

Optional monday.com token override:

```bash
MONDAY_API_TOKEN_FILE=/path/to/Monday-Com-API-Token.txt \
COUNCIL_DASHBOARD_SUMMARY_REPO=/Users/petersargent/CouncilDashboardSummaryRepo \
/Users/petersargent/CouncilDashboardSummaryUpdate.zsh
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
  /Users/petersargent/CouncilDashboardSummaryRepo/refresh_monday_data.py \
  --token-file /path/to/Monday-Com-API-Token.txt \
  --output /tmp/monday-latest.json
```

## 5. Schedule and Logs

Installed LaunchAgent:

```text
/Users/petersargent/Library/LaunchAgents/com.pbsargent.council-dashboard-summary.daily.plist
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
| 9:05 AM | `com.pbsargent.council-dashboard-summary.daily` | Build and publish Council Dashboard Summary JSON |

Current log files:

```text
/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.log
/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.err.log
```

Useful checks:

```bash
launchctl print gui/$(id -u)/com.pbsargent.council-dashboard-summary.daily
tail -50 "/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.log"
tail -50 "/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github/update_daily.err.log"
```

## 6. Publication and Cache Behavior

Publishing occurs when the active repo pushes to:

```text
origin main
```

The Pages repositories use historyless publishing. Each publish replaces `main` with one current root commit made from the staged site tree. The scripts use `--force-with-lease` so a publish will not overwrite a remote update that the local checkout has not fetched.

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

## 7. Validation Checklist

After any refresh or rebuild, check:

- `data/latest.json` exists and has the expected `generated_date`.
- A dated archive JSON exists for the same generated date.
- `data/monday-latest.json` exists or the monday.com failure was expected and the previous file was intentionally preserved.
- `renewal-board/data.js` exists and its metadata references the newest renewal and dashboard workbook inputs.
- Council dashboard source name matches the newest `*Dashboard - CAC*.xlsx`.
- CST source name matches the newest `*_CST7.xlsx`.
- monday.com source workbook matches the newest `*monday-export.xlsx`, unless API fallback was used.
- `dashboard.districts` includes the 12 official districts.
- Council youth, units, training rows, commissioner rows, prospects, renewals, and school row counts are plausible.
- Home page loads without JavaScript errors.
- Training, SYT, monday.com, unit metrics, and membership detail pages load.
- Renewal board page loads, honors light/dark mode, and links back to the Council Summary page.
- Panel `?` controls display active help popovers on hover, focus, or click/tap.
- Service Area and District filters both populate and work on the home page, Training, SYT, Unit Metrics, Membership, monday.com detail, and Commissioner Dashboard.
- Lower-left freshness timestamp displays in the viewer timezone.
- `dashboard.service_area_source` is present, and all 12 official districts have `service_area`.
- `dashboard.council.unit_commissioners` counts unique Unit Commissioner people, not duplicate role rows.
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
| Git push fails | Auth, network, or force-with-lease mismatch | `git status`, `git fetch`, GitHub credentials, remote `origin/main` |
| Page still shows old code | Browser or CDN cached JavaScript | Bump script query string and republish |
| `?` help does not open | Missing/stale `panel-help.js` or cached CSS | Confirm `panel-help.js` is loaded, CSS has `.panel-help-tooltip`, and query strings were bumped |
| Future-looking timestamp | Source timezone interpreted incorrectly | Check whether timestamp has `Z`/offset or should be treated as America/Chicago |
| Service Area filter missing or empty | Stale JavaScript/HTML or missing mapping in JSON | Check cache-busted script URL, `dashboard.service_areas`, and `service_area` fields |
| Commissioner repo starts growing again | Scheduled publisher reverted to normal commit flow | Confirm `/Users/petersargent/CACDashboardAutomation/work/commissioner_site/update_and_publish_github.zsh` uses `commit-tree` and `push --force-with-lease` |
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

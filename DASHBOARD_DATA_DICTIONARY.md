# Council Dashboard Summary Data Dictionary

Last reviewed: 2026-07-01

This document explains where the Council Dashboard Summary gets its data and how the displayed values are computed. It is based on the current implementation in the static site repository, especially:

- `update_daily.zsh`
- `refresh_monday_data.py`
- `work/commissioner_site/build_site.py`
- `council-dashboard-summary.20260626-tay-kpi.js`
- `training-detail.js`
- `syt-detail.js`
- `unit-metrics-detail.js`
- `monday-detail.20260626-official-tay.js`
- `membership-detail.20260626.js`

For environment setup, data acquisition requirements, automation installation, validation checks, and rebuild guidance, see `IMPLEMENTATION_RUNBOOK.md`.

## Current Source Inventory

As of the 2026-07-01 extract:

| Source | Current File / Feed | Current Count / Coverage |
| --- | --- | --- |
| Council dashboard workbook | `2026-07-01_Dashboard - CAC.xlsx` | 12 official districts, 30 priority units, 5,967 training rows, 65 deduped Unit Commissioners |
| CST comparison workbook | `2026-07-01_CST7.xlsx` | Service Territory comparison data |
| monday.com daily workbook | `2026-07-01_Membership-Hub-Field-Service-monday-export.xlsx` | 202 prospects, 311 renewals, 737 schools |
| Service Area hierarchy | monday.com `Field Service / Service Areas` board | Authoritative Service Area > District mapping, Field Director names, district professionals, chairs, and commissioners |
| Published dashboard data | `data/latest.json` | Main source for home, training, SYT, unit metrics, coverage, and CST views |
| Published monday.com data | `data/monday-latest.json` | Source for monday.com and membership market context views |
| Published renewal board data | `renewal-board/data.js` | Source for the 2026 Unit Renewal subpage |

## Daily Refresh Flow

The daily refresh is controlled by `update_daily.zsh`.

The scheduled macOS LaunchAgent runs the refresh through `/Users/petersargent/CouncilDashboardSummaryUpdate.zsh` and points it at the launchd-safe Git working copy in `/Users/petersargent/CouncilDashboardSummaryRepo`. The older checkout under `/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github` can still be used for development, but it is not the active scheduled GitHub working copy.

1. The script runs `work/commissioner_site/build_site.py`.
2. The builder finds the newest `*Dashboard - CAC*.xlsx` file in the Council Dashboard Reports shared drive.
3. The builder finds the newest `*_CST7.xlsx` file in the Council Metric Reports shared drive.
4. The builder writes a fresh `data/latest.json` and a dated archive file such as `data/YYYY-MM-DD.json`.
5. The script runs `refresh_monday_data.py`.
6. The monday.com refresher first looks for the newest `*monday-export.xlsx` workbook in the Council monday.com Reports shared drive.
7. If no workbook is available or parsing fails, it falls back to the monday.com API using the local token file.
8. The script copies refreshed data into the local preview site.
9. The script rebuilds `renewal-board/data.js` from the newest monday.com renewal export and Council dashboard workbook.
10. If the data files changed, the script publishes the current site tree to the GitHub Pages repository from the launchd-safe working copy using historyless publishing.
The dashboard pages are static HTML, CSS, and JavaScript. They do not query Google Drive or monday.com directly in the browser. They read only the published JSON files.

The Commissioner Dashboard at `https://pbsargent.github.io/council-commissioner-dashboard/` is a separate GitHub Pages portal that reads the same canonical Council Dashboard Summary JSON. Its scheduled publisher also uses historyless publishing, so the commissioner repository is replaced with one current root commit instead of growing by one commit each day.

Most major dashboard panels include a circular `?` help control. The button text is stored in each page's HTML, and the shared `panel-help.js` script turns those descriptions into active hover, focus, and click/tap popovers. These popovers provide brief panel-level source and meaning notes; this data dictionary remains the source of exact formulas and implementation detail.

Historyless publishing creates a fresh single root commit from the current staged site tree and pushes it with `--force-with-lease`. This keeps the public Pages branch compact while preserving lease protection against overwriting a remote update the local checkout has not fetched.

## Source Workbook Tabs

### Council Dashboard Workbook

The builder reads these tabs from the Council dashboard workbook:

| Workbook Tab | Used For |
| --- | --- |
| `Membership` | District youth membership, units, YoY movement, year-end comparison, SYT %, PIN %, district commissioner, field executive |
| `Unit Metric Compare` | Average metric, metric band rates, UL & CC trained, small unit threshold, membership growth, advancement, outdoor, retention |
| `Glance` | Packs, pack connect %, troops, troop connect %, % units not renewed, commissioner trained % |
| `Training Dive` | All-scouter training %, direct-contact training % |
| `Objectives - Commissioners` | Unit commissioners, UC ratio, assignment %, new units, new-unit assignment % |
| `Unit Metrics` | Unit-level metric rows and unit health flags |
| `Assigned` | Commissioner assignment lookup by unit |
| `Pin` | PIN status by unit |
| `Units` | Unit ID lookup used to connect unit metric rows to assignments and PIN rows |
| `Training` | Person-level training rows |
| `Training Codes` | Training code-to-course-name lookup |
| `Commissioners` | Commissioner roster and coverage fields |

Only official district rows are used for the primary district rollups. The official district list is:

Armadillo, Bee Cave, Chisholm Trail, Colorado River, Exploring, Hill Country, Live Oak, North Shore, Sacred Springs, San Gabriel, Thunderbird, Waterloo.

`Scoutreach` is recognized by the builder as a real district-like label in source files, but the published district dashboard uses the 12 official dashboard workbook rows.

### Service Area Hierarchy

Service Area is not derived from the source workbook formulas. It is an authoritative hierarchy read from the monday.com `Field Service / Service Areas` board and cached locally for the daily builder.

| Service Area | Field Director | Districts |
| --- | --- | --- |
| Northern Service Area | Justin Brundin | Bee Cave, Chisholm Trail, Hill Country, North Shore |
| Central Service Area | Vicki Rosengarten | Armadillo, Colorado River, Exploring, San Gabriel, Thunderbird |
| Southern Service Area | Ed Grune | Live Oak, Sacred Springs, Waterloo |

The builder writes `service_area`, `service_area_field_director`, and available district hierarchy fields onto district rows, priority units, unit metric compare rows, training people, and commissioner rows where a district can be resolved. It also writes `dashboard.service_hierarchy` metadata and a `dashboard.service_areas` rollup array for Service Area-level summaries.

All current major dashboard pages that expose district filtering also expose Service Area filtering. The Service Area filter narrows the District filter options and then constrains the rows shown. On monday.com detail pages, multi-district labels match a Service Area when any listed official district belongs to that Service Area.

### CST Comparison Workbook

The CST comparison builder reads these tabs:

| Workbook Tab | Used For |
| --- | --- |
| `Membership` | Council-level units, youth membership, YoY, ranks, year-end movement, total youth served, adults, SYT % |
| `Unit Metric Compare` | Average metric, 0-2 / 3 / 4-5 counts and rates, UL & CC trained, small unit threshold |
| `Glance` | Pack connect %, troop connect %, % units not renewed, commissioner trained % |

### monday.com Daily Workbook

The monday.com refresher reads these sheets:

| Sheet | Published Board Key | Important Fields |
| --- | --- | --- |
| `New unit Hot Prospects` | `prospects` | Item ID, Item Name, Group, District, Potential Unit Type(s), Unit Number(s), Projected Start Month, Step 1, Step 2, Step 3, Step 10, unit posted flag, Date of First Meeting, Updated At |
| `2026 Unit Renewal` | `renewals` | Item ID, Item Name, Group, District, Drop/Renew, Initiated, Submitted, Pending Acceptance, Posted, Timeline, Updated At |
| `Schools` | `schools` | Item ID, Item Name, Group, School District, Scouting District, Unit Associated, TAY, Principal Meeting, City, County, District Type, Instruction Type, School Status, Updated At |

If a monday.com export workbook is unavailable, the API fallback currently produces board-level counts and status distributions. The detailed pages depend on workbook rows for the richer row-level detail.

## Core JSON Files

### `data/latest.json`

Top-level fields:

| Field | Meaning |
| --- | --- |
| `generated_at` | Timestamp when the JSON snapshot was generated |
| `generated_date` | Date string used in page titles and archive file names |
| `dashboard` | Council dashboard data from the Council dashboard workbook |
| `cst` | CST comparison data from the CST comparison workbook |

Timestamp display note: `generated_at` values from the Council dashboard snapshot may be stored without a timezone offset. The site treats those no-offset values as America/Chicago source timestamps, converts them to a real instant, and then displays them in the viewer browser's local timezone. Values that already include `Z` or a numeric timezone offset are treated as explicit instants and also displayed in the viewer browser's local timezone.

Important `dashboard` fields:

| Field | Meaning |
| --- | --- |
| `source`, `source_name`, `source_mtime` | Workbook path, file name, and modified timestamp |
| `service_area_source` | Human-readable source note for the authoritative Service Area mapping |
| `service_areas` | Service Area rollups computed from official district rows |
| `districts` | One row per district with membership, training, unit health, coverage, and status metrics |
| `council` | Council-wide rollups computed from district and roster rows |
| `priority_units` | Top 30 unit metric rows where unit metric is 0-2 |
| `unit_metric_compare` | Sectioned detail extracted from the Unit Metric Compare tab |
| `training_people` | Person-level training rows from the Training tab |
| `training_codes` | Code-to-course lookup from the Training Codes tab |
| `commissioners` | Commissioner roster rows from the Commissioners tab |

### `data/monday-latest.json`

Top-level fields:

| Field | Meaning |
| --- | --- |
| `generated_from` | `monday.com daily workbook` or `monday.com API` |
| `generated_at` | Workbook extraction timestamp or API refresh timestamp |
| `source_workbook` | Workbook file name when generated from the daily workbook |
| `boards.prospects` | Hot prospects counts, distributions, and rows |
| `boards.renewals` | Renewal counts, distributions, and rows |
| `boards.schools` | School counts, distributions, and rows |

The monday.com export timestamp normally includes an explicit UTC marker. The dashboard formats it in the viewer browser's local timezone.

## Main Dashboard Formulas

The home page reads `data/latest.json` and, when available, `data/monday-latest.json`.

### Top KPI Cards

| Card | Source | Formula |
| --- | --- | --- |
| Youth | `dashboard.council.members` | Sum of district `members` from the Membership tab |
| Units | `dashboard.council.units` | Sum of district `units` from the Membership tab |
| Average Metric | `dashboard.council.avg_metric` | Weighted average of district `avg_metric`, weighted by district `units` |
| Assigned | `dashboard.council.assigned_pct` | `assigned_units / units`; assigned units are counted from rows in the Assigned tab where `Assigned` is `yes` |
| Training | `dashboard.council.training_pct` | Weighted average of district `training_pct`, weighted by district `units` |
| Youth / TAY | `dashboard.council.members / sum(monday schools tay)` | Council youth membership divided by the total TAY across all school rows in the monday.com Schools export |

### District Status

Each district receives a status in `build_site.py`:

| Status | Rule |
| --- | --- |
| Needs Attention | YoY % < -10%, or SYT % < 80%, or at-risk unit rate >= 55% |
| Monitor | Training % < 65%, or at-risk unit rate >= 40%, or SYT % < 85% |
| On Track | None of the Needs Attention or Monitor conditions apply |

### Unit Health

| Value | Source / Formula |
| --- | --- |
| At-risk units | Count of Unit Metrics rows where `Unit Metric <= 2` |
| Healthy units | Count of Unit Metrics rows where `Unit Metric >= 4` |
| At-risk rate | `at_risk_units / units` |
| Healthy rate | `healthy_units / units` |
| Priority Units | Unit-level rows where `Unit Metric <= 2`, sorted by metric ascending, youth descending, then district; limited to 30 |

### Today's Read / Signals

| Signal | Formula |
| --- | --- |
| Units need assignment | `dashboard.council.units - dashboard.council.assigned_units` |
| Highest risk district | District with highest `at_risk_rate` |
| Best growth district | District with highest `yoy_pct` |
| Unit commissioners | Count of unique commissioner names with at least one `Unit Commissioner` role |
| Training gap district | District with lowest `training_pct` |

### Quality Checks

| Check | Formula |
| --- | --- |
| SYT below 80% | Count of district rows where `syt_pct < 0.80` |
| 0-2 rate >= 55% | Count of district rows where `at_risk_rate >= 0.55` |
| Assignment below 50% | Count of district rows where `assigned_pct < 0.50` |
| Training below 55% | Count of district rows where `training_pct < 0.55` |

## Training Detail Page

The Training page reads `dashboard.training_people` from `data/latest.json`.

Each row comes from the workbook `Training` tab:

| Published Field | Workbook Field |
| --- | --- |
| `district` | `District2` or `District` |
| `unit`, `unit_type`, `unit_number`, `gender` | `Unit`, `#`, `Gender` |
| `name`, `position` | `Name`, `Position` |
| `trained` | `Trained`, converted from YES/NO to boolean |
| `direct_contact` | `Direct Contact`, converted from YES/NO to boolean |
| `mandatory_codes`, `classroom_codes`, `online_codes` | `Mandatory`, `Classroom`, `Online` |
| `syt_expires` | `SYT` |
| `hazardous_weather_expires` | `Hazardous Weather - DC Only` |
| `baloo_expires` | `Baloo - Pack` |

Training page KPI formulas:

| KPI | Formula |
| --- | --- |
| Leaders | Count of filtered training rows |
| Trained | Count where `trained === true` divided by total rows |
| Direct Contact | Count where `direct_contact === true` |
| DC Trained | Count where `direct_contact === true` and `trained === true`, divided by direct-contact rows |
| HW Expired | Count of direct-contact rows where Hazardous Weather expiration exists and is before the current browser date |
| Shown | Count after filters |

The district rollup groups filtered people by district and computes the same counts per district.

## SYT Detail Page

The SYT page also reads `dashboard.training_people`, plus `dashboard.training_codes`.

Direct-contact status is based on the source workbook `Direct Contact` column. It is converted from YES/NO to boolean during JSON generation.

Readiness logic:

| Readiness Item | Requirement |
| --- | --- |
| SYT | Required for direct-contact leaders; missing or expired date is an issue |
| Hazardous Weather | Required for direct-contact leaders; missing or expired date is an issue |
| BALOO | Required only when direct-contact leader is in a Pack; missing or expired BALOO date is an issue |
| IOLS | Required only when direct-contact leader is in a Troop; the page flags an IOLS issue when mandatory code `S11` remains present |

Display behavior:

- When the SYT page is filtered to `All leaders`, existing SYT or safety dates are displayed even for non-direct-contact rows.
- Missing SYT, Hazardous Weather, BALOO, or IOLS fields are flagged as issues only when the item is required by the direct-contact/unit-type logic above.
- For non-direct-contact rows with no required date, the page displays `n/a`.

The code names displayed on the SYT page come from the workbook `Training Codes` tab. For example, the page looks up `Y01`, `SCO_800`, `C32`, and `S11` to display course names when available.

SYT page KPI formulas:

| KPI | Formula |
| --- | --- |
| DC Leaders | Count where `direct_contact === true` |
| SYT Current | Direct-contact rows without an SYT issue divided by direct-contact rows |
| HW Current | Direct-contact rows without a Hazardous Weather issue divided by direct-contact rows |
| BALOO Issues | Direct-contact Pack rows with missing or expired BALOO |
| IOLS Issues | Direct-contact Troop rows with mandatory code `S11` still present |
| Any Issue | Direct-contact rows with at least one SYT, Hazardous Weather, BALOO, or IOLS issue |

## Unit Metrics Detail Page

The Unit Metrics page reads `dashboard.unit_metric_compare`.

The builder extracts each section of the workbook `Unit Metric Compare` tab. A section begins where column A is `District`; the section name is read from column B on that same header row.

Per-row fields include:

| Field | Source |
| --- | --- |
| `units` | Section unit count column, falling back through `All Units`, `Pack`, `Troop`, `Crew`, `Post`, or `Ship` |
| `avg_metric` | `Average Metric` |
| `metric_0_2_rate` | `0-2` |
| `metric_3_rate` | `3` |
| `metric_4_5_rate` | `4-5` |
| `ul_cc_trained_rate` | `UL & CC Trained` |
| `small_unit_rate` | `Exceeds Small Unit Threshold` |
| `membership_yoy_growth_rate` | `Membership YOY Growth` |
| `rank_advancement_rate` | `Rank Advancement` |
| `outdoor_rate` | `Outdoor` |
| `retention_rate` | `Retention` |
| `metric_0_2_count`, `metric_3_count`, `metric_4_5_count` | Count columns `0-2.1`, `3.1`, and `4-5.1` |

Unit Metrics KPI formulas:

| KPI | Formula |
| --- | --- |
| Units | Sum of `units` in the filtered rows |
| Average Metric | Weighted average of `avg_metric`, weighted by `units` |
| 0-2 Units | Sum of `metric_0_2_count`; rate is `metric_0_2_count / units` |
| 4-5 Units | Sum of `metric_4_5_count`; rate is `metric_4_5_count / units` |
| UL & CC Trained | Weighted average of `ul_cc_trained_rate`, weighted by `units` |
| Retention | Weighted average of `retention_rate`, weighted by `units` |

## monday.com Detail Page

The monday.com page reads both `data/monday-latest.json` and `data/latest.json`.

### Row Standardization

The page flattens all board rows into one list and adds a `board` field:

| Board | Row Status Used By Page | Type / Intent Used By Page | Timing Used By Page |
| --- | --- | --- | --- |
| Prospects | `status` from Step 1 | `unit_type` | `projected_start`, defaulting to Unscheduled |
| Renewals | `posted`, falling back to `intent` | `intent` | `timeline` |
| Schools | `status` | `school_district` | `tay` |

### monday.com KPI Formulas

| KPI | Formula |
| --- | --- |
| Youth / TAY | Council youth from `dashboard.council.members` divided by total TAY across all school rows |
| Hot Prospects | Count of filtered prospect rows; stuck and unscheduled counts are shown in the subtitle |
| Renewals | Count of filtered renewal rows; not posted count is rows where `posted !== "Completed"` |
| Schools | Count of filtered school rows; with-unit rate is rows with `unit_associated` divided by school rows |
| Districts | Count of official districts represented in filtered rows |
| Updated | `monday-latest.json generated_at` |

### Official District Handling

For the monday.com district charts and school market context:

1. The official district list comes from `data/latest.json dashboard.districts`.
2. Comma-separated monday.com district labels are split.
3. Only labels matching an official district are included.
4. Non-official labels such as `Unassigned` or other operational labels are excluded from official-district rollups.

### School Market Context

For schools assigned to multiple Scouting Districts, the page attributes the full TAY value to each listed official district. This matches the visible note on the page and supports district-level context, not a council-total TAY reconciliation.

District membership/TAY is computed as:

`district youth membership / attributed district TAY`

Council youth/TAY is computed differently:

`council youth membership / raw sum of all school-row TAY`

The council calculation does not duplicate TAY for multi-district school labels.

## Membership Intelligence Detail Page

The Membership Intelligence page reads both `data/latest.json` and `data/monday-latest.json`.

It joins:

- Official district membership and unit health from `dashboard.districts`
- School/TAY context from `monday-latest.json boards.schools.rows`
- Hot prospect context from `monday-latest.json boards.prospects.rows`
- Renewal follow-up context from `monday-latest.json boards.renewals.rows`

### District monday.com Rollups

For each official district:

| Rollup | Formula |
| --- | --- |
| Schools | Count of school rows whose `scouting_district` includes the district |
| TAY | Sum of `tay` for school rows attributed to the district |
| Schools without unit | Count of attributed school rows where `unit_associated` is blank |
| Hot prospects | Count of prospect rows whose `district` includes the district |
| Stuck prospects | Count of prospect rows where `status === "Stuck"` |
| Unscheduled prospects | Count of prospect rows where `projected_start === "Unscheduled"` |
| Renewals | Count of renewal rows whose `district` includes the district |
| Renewal follow-up | Count of renewal rows where `posted !== "Completed"` |
| Dropping renewals | Count of renewal rows where `intent === "Dropping"` |

### Membership Intelligence KPI Formulas

| KPI | Formula |
| --- | --- |
| Youth | Sum of `members` across filtered district rows |
| Youth / TAY | Council youth divided by raw sum of all school TAY |
| Declining Districts | Count of filtered districts where `yoy_pct < 0` |
| At-Risk Units | Sum of `at_risk_units`; rate is at-risk units divided by units |
| Hot Prospects | Sum of prospect rollups; stuck count shown in subtitle |
| Renewal Follow-Up | Sum of renewal rows where `posted !== "Completed"` |

### Priority Signal Formula

Each district gets a computed priority score:

```text
low_tay = max(0, 0.03 - membership_pct_tay) * 600
decline = max(0, -yoy_pct) * 150
health = metric_0_2_rate * 30
pipeline = min(18, stuck_prospects * 2 + unscheduled_prospects * 0.4)
renewals = min(18, renewal_follow_up * 0.7 + dropping_renewals * 2)
priority_score = low_tay + decline + health + pipeline + renewals
```

This score is used for sorting and bar length. It is an internal prioritization signal, not a source-workbook field.

### Membership Signal Labels

District signal labels are assigned in this order:

| Label | Rule |
| --- | --- |
| Decline + low TAY penetration | `yoy_pct < 0` and `membership_pct_tay < 1.5%` |
| Unit health risk | `metric_0_2_rate >= 48%` |
| Pipeline stuck | `stuck_prospects >= 5` |
| Renewal follow-up | `renewal_follow_up >= 10` |
| Low TAY penetration | `membership_pct_tay < 1.5%` |
| Growth momentum | `yoy_pct > 4%` |
| Monitor | None of the above |

## Coverage and Commissioner Roster

The home page coverage panel and commissioner roster read `dashboard.commissioners`.

| Value | Formula |
| --- | --- |
| Registered commissioners | `dashboard.council.commissioners`, the count of unique commissioner names after normalizing whitespace and case |
| Workbook commissioner records | `dashboard.council.commissioner_records`, the raw count of rows in the Commissioners tab |
| Duplicate commissioner records | Raw commissioner records minus unique commissioner names |
| Unit commissioners | Count of unique people who have at least one `Unit Commissioner` role; if the same person appears more than once, they count once, assigned to the district of their first Unit Commissioner record |
| Commissioners trained | Count of commissioner rows where `trained === true` divided by commissioner rows |
| With assignments | Count of commissioner rows with a nonblank `assigned_units` field divided by commissioner rows |

Commissioner roster fields are passed through from the Commissioners tab: district, name, position, trained, YPT, assigned units, unit health, and SYT expiration.

## Sources Panel

The Sources panel on the home page is intentionally visible and includes:

- Commissioner dashboard workbook source metadata from `data/latest.json`
- CST7 metric workbook source metadata from `data/latest.json`
- monday.com source metadata from `data/monday-latest.json`, when available
- Manual source links added in the HTML for the Detailed Council Dashboard and Council Service Territory Comparison Data
- Contact text for monday.com detailed access
- Service Area mapping source note, based on Bill Kohl's 2026-06-30 email

## Current Workbook Error Caveat

The current 2026-07-01 source workbooks are not mostly error cells. A direct scan found:

| Workbook | Non-empty cells | Actual Excel error cells | Error rate | Concentration |
| --- | ---: | ---: | ---: | --- |
| `2026-07-01_Dashboard - CAC.xlsx` | 236,913 | 113 | 0.0477% | `Renewal Prep` and `Objectives - Commissioners` |
| `2026-07-01_CST7.xlsx` | 537,492 | 10 | 0.0019% | `Units` |
| `2026-07-01_Membership-Hub-Field-Service-monday-export.xlsx` | 38,949 | 1 | 0.0026% | `New unit Hot Prospects` |

The dashboard source workbook is broadly usable, but the `Renewal Prep` tab and some `Objectives - Commissioners` fields contain concentrated `#VALUE!` or `#REF!` errors. Values sourced from those specific formula ranges should be treated as suspect until the workbook formulas are repaired.

## In-Dashboard Panel Help

The panel `?` controls are a reader aid, not a separate data source. They summarize:

- Which workbook, JSON file, or computed rollup feeds the panel
- What the panel means in practical operating terms
- Whether the panel is an official source metric or a dashboard-created prioritization/signal view

The active behavior is implemented by `panel-help.js` and shared CSS. The script copies each button's `title` text into `data-help`, removes the native browser `title` tooltip, and displays a custom popover on hover, focus, or click/tap. Escape or clicking elsewhere dismisses the popover.

## Refresh and Publication Notes

- Daily values update only when the shared-drive source workbooks are updated, the local daily automation runs, and the resulting JSON changes are published.
- Existing HTML, CSS, and JavaScript logic is not regenerated daily unless code changes are committed. The renewal-board data bundle is regenerated daily when the renewal board subpage exists.
- GitHub Pages publishing is historyless for both the Council Summary repository and the separate Commissioner Dashboard repository: each publish replaces the public `main` branch with one current root commit rather than accumulating daily commits.
- The pages use `fetch(..., { cache: "no-store" })` for JSON data files, but browser caching of HTML and JavaScript can still make cache-busted script filenames useful after code changes.
- The lower-left sidebar timestamp and detail-page freshness timestamps are rendered in the viewer browser's local timezone. No-offset Council dashboard timestamps are first interpreted as America/Chicago source time; explicit UTC/offset timestamps are used as-is.

## Known Interpretation Choices

- TAY is sourced from the monday.com Schools export, not the Council dashboard workbook.
- Council Youth / TAY uses raw school-row TAY once per school row.
- District Youth / TAY attributes full TAY to each official district listed on a school row.
- monday.com operational rows may include labels outside the official 12 districts; official district views exclude those labels.
- The Membership Intelligence priority score is a dashboard-created prioritization aid, not an official workbook metric.
- Date-expiration checks on Training and SYT pages use the viewer browser's current date.
- Freshness timestamps are displayed in the viewer browser's local timezone, so two viewers in different timezones may see different clock times for the same data snapshot.
- Service Area filters are authoritative because they use the monday.com `Field Service / Service Areas` hierarchy, not a workbook-derived field.

# Council Dashboard Summary Data Dictionary

Last reviewed: 2026-08-23

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
- `tools/inject_unit_youth_trends.py`

For environment setup, data acquisition requirements, automation installation, validation checks, and rebuild guidance, see `IMPLEMENTATION_RUNBOOK.md`.

## Current Source Inventory

As of the 2026-08-23 extract:

| Source | Current File / Feed | Current Count / Coverage |
| --- | --- | --- |
| Council dashboard workbook | `2026-08-23_Dashboard - CAC.xlsx` | 12 official districts, 296 units, 5,672 training/SYT rows, Unit & Youth trend history |
| CST comparison workbook | `2026-08-23_CST7.xlsx` | Service Territory comparison data |
| monday.com daily workbook | `2026-08-23_Membership-Hub-Field-Service-monday-export.xlsx` | 208 prospects, 311 renewals, 738 schools, 281 Popcorn commitment rows |
| Unit Level Metrics workbook | `2026-08-23_CAC - Unit Metric Scorecard.xlsx` | Unit, member-due-to-renew, and program-specific operating detail |
| Cub Scout JSN board | monday.com board `18420720719` | 731 source items, 340 eligible items, and 143 scheduled recruitments in the current published snapshot |
| Service Area hierarchy | monday.com `Field Service / Service Areas` board | Authoritative Service Area > District mapping, Field Director names, district professionals, Volunteer Chairs, and District Commissioners; board values override workbook leadership fields, including intentional blanks |
| Published dashboard data | `data/latest.json` | Main source for home, training, SYT, unit metrics, coverage, and CST views |
| Published monday.com data | `data/monday-latest.json` | Source for monday.com and membership market context views |
| Published renewal board data | `renewal-board/data.js` | Source for the 2026 Unit Renewal subpage |

Publication privacy rule: every person-name field in the public Council Summary
and Commissioner portal artifacts is abbreviated to first name plus last
initial, such as `Alex R.`. This applies to training and SYT people, commissioner
assignments and rosters, district and Service Area leadership, Unit Level member
and commissioner fields, and Renewal Board owners, leaders, contacts, and
commissioners. Private source workbooks and intermediate build inputs are not
modified.

## Daily Refresh Flow

The daily refresh is controlled by `update_daily.zsh`.

The scheduled macOS LaunchAgent runs the refresh through `/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary/update_daily.zsh` and points it at the launchd-safe Git working copy in `/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary`. The older checkout under `/Users/petersargent/Documents/Codex/Daily Uodate/outputs/council-dashboard-summary-github` can still be used for development, but it is not the active scheduled GitHub working copy.

1. The script runs `work/commissioner_site/build_site.py`.
2. The builder finds the newest `*Dashboard - CAC*.xlsx` file in the Council Dashboard Reports shared drive.
3. The builder finds the newest `*_CST7.xlsx` file in the Council Metric Reports shared drive.
4. The builder finds the newest `Connection History YYYY-MM-DD.csv` file in the Commissioner Tools Reports shared drive and counts completed connections in the report's trailing 365-day window.
5. The builder writes a fresh `data/latest.json` and a dated working archive such as `data/YYYY-MM-DD.json` outside the Pages source tree.
6. The script runs `tools/inject_unit_youth_trends.py` against the fresh JSON files so `dashboard.unit_youth_trends` is regenerated from the workbook `Units-Youth` tab.
7. The script runs `refresh_monday_data.py`.
8. The monday.com refresher first looks for the newest `*monday-export.xlsx` workbook in the Council monday.com Reports shared drive.
9. If no workbook is available or parsing fails, it falls back to the monday.com API using the local token file.
10. The script copies refreshed data into the local preview site.
11. The script rebuilds `renewal-board/data.js` from the newest monday.com renewal export and Council dashboard workbook.
12. The consolidated platform packages the current static tree, verifies its checksum, and deploys it through GitHub Pages Actions without creating a generated-data commit.
The dashboard pages are static HTML, CSS, and JavaScript. They do not query Google Drive or monday.com directly in the browser. They read only the published JSON files.

The Commissioner Dashboard at `https://pbsargent.github.io/council-commissioner-dashboard/` is a separate GitHub Pages portal that reads the same canonical Council Dashboard Summary JSON. The consolidated platform updates it only when its code or shared assets change.

Most major dashboard panels include a circular `?` help control. The button text is stored in each page's HTML, and the shared `panel-help.js` script turns those descriptions into active hover, focus, and click/tap popovers. These popovers provide brief panel-level source and meaning notes; this data dictionary remains the source of exact formulas and implementation detail.

Production source changes use normal linear Git history without force. Daily generated data is deployed from an isolated staging tree as a verified Pages artifact. The platform refuses deployment if another writer changes the source repository during generation.

## Source Workbook Tabs

### Council Dashboard Workbook

The builder reads these tabs from the Council dashboard workbook:

| Workbook Tab | Used For |
| --- | --- |
| `Membership` | District youth membership, units, YoY movement, year-end comparison, SYT %, PIN %, district commissioner, field executive, and the councilwide Volunteers count |
| `Unit Metric Compare` | Average metric, metric band rates, UL & CC trained, small unit threshold, membership growth, advancement, outdoor, retention |
| `Glance` | Packs, pack connect %, troops, troop connect %, % units not renewed, commissioner trained % |
| `Training Dive` | All-scouter training %, direct-contact training % |
| `Objectives - Commissioners` | Unit commissioners, UC ratio, assignment %, new units, new-unit assignment % |
| `Unit Metrics` | Unit-level metric rows and unit health flags |
| `Assigned` | Commissioner assignment lookup by unit |
| `Pin` | BeAScout PIN status and last-modified date by unit |
| `Units` | Unit ID lookup used to connect unit metric rows to assignments and PIN rows |
| `Training` | Person-level training rows |
| `Training Codes` | Training code-to-course-name lookup |
| `Commissioners` | Commissioner roster and coverage fields |
| `Units-Youth` | Councilwide monthly new units, new youth, total youth, and total units trend history |

Only official district rows are used for the primary district rollups. The official district list is:

Armadillo, Bee Cave, Chisholm Trail, Colorado River, Exploring, Hill Country, Live Oak, North Shore, Sacred Springs, San Gabriel, Thunderbird, Waterloo.

`Scoutreach` is recognized by the builder as a real district-like label in source files, but the published district dashboard uses the 12 official dashboard workbook rows.

### Commissioner Connection History

The Commissioner Dashboard's **Connections (12 Mo.)** district column counts completed rows in the newest `Connection History YYYY-MM-DD.csv` report. The window is the 365 days ending on the report-generated date, and each completed connection counts once as a unit visit. Rows outside the official district list, incomplete rows, and rows outside that window are excluded. The published JSON records the source file, report date, and window boundaries in `dashboard.connection_history`.

### Service Area Hierarchy

Service Area is not derived from the source workbook formulas. It is an authoritative hierarchy read from the monday.com `Field Service / Service Areas` board and captured for each daily build. The same board is authoritative for district `Volunteer Chair` and `Commissioner`; those values replace the workbook's district-leadership values everywhere the shared district and renewal datasets expose them. A blank board cell remains blank rather than falling back to a stale workbook value.

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
| `Membership` | Council-level units, youth membership, YoY, ranks, year-end movement, total youth served, adults, SYT %, retention |
| `Unit Metric Compare` | Average metric, 0-2 / 3 / 4-5 counts and rates, UL & CC trained, small unit threshold |
| `Glance` | Pack connect %, troop connect %, % units not renewed, commissioner trained % |

### monday.com Daily Workbook

The monday.com refresher reads these sheets:

| Sheet | Published Board Key | Important Fields |
| --- | --- | --- |
| `New unit Hot Prospects` | `prospects` | Item ID, Item Name, Group, District, Potential Unit Type(s), Unit Number(s), Projected Start Month, Step 1, Step 2, Step 3, Step 10, unit posted flag, Date of First Meeting, Updated At |
| `2026 Unit Renewal` | `renewals` | Item ID, Item Name, Group, District, Drop/Renew, Initiated, Submitted, Pending Acceptance, Posted, Timeline, Updated At |
| `Schools` | `schools` | Item ID, Item Name, Group, School District, Scouting District, Unit Associated, TAY, Grades, Principal Meeting, City, County, District Type, Instruction Type, School Status, Updated At |
| `Popcorn Committments` | `popcorn` | Item ID, Unit Name, District, Commitment, 2026 Sales Goal, 2025 Sales, 11/11 Onboarding, Onboarding Completed, Leader Trained, Unit Kernel, Updated At |

If a monday.com export workbook is unavailable, the API fallback produces board-level counts and status distributions for all configured boards and row-level operational data for Popcorn. Other detailed pages still depend on workbook rows for their richer row-level detail.

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
| `unit_pin_statuses` | Matched unit-level BeAScout PIN display states plus privacy-safe `pin_status_complete`, `pin_contact_complete`, `pin_meeting_complete`, and `pin_details_complete` Boolean flags. Unmatched units are absent and display as `n/a` after the page join. Contact names, email addresses, phone numbers, meeting locations, and meeting details are never published in this array. |
| `unit_metric_compare` | Sectioned detail extracted from the Unit Metric Compare tab |
| `unit_youth_trends` | Councilwide monthly Unit & Youth Trends extracted from the Units-Youth tab |
| `training_people` | Person-level training rows from the Training tab |
| `training_codes` | Code-to-course lookup from the Training Codes tab |
| `commissioners` | Commissioner roster rows from the Commissioners tab |

### `dashboard.unit_youth_trends`

The Membership Intelligence page reads `dashboard.unit_youth_trends`, generated by `tools/inject_unit_youth_trends.py` from the Council dashboard workbook `Units-Youth` tab. The source tab is manually updated, so each series carries its own `freshness_month`.

Published shape:

| Field | Meaning |
| --- | --- |
| `source_sheet` | Always `Units-Youth` |
| `source_note` | Source caveat shown/available to the dashboard |
| `months` | Month labels Jan-Dec |
| `ytd` | Current/prior YTD new-unit and new-youth values plus deltas |
| `series.new_units` | Monthly new-unit counts for 2026, 2025, and 2024 |
| `series.new_youth` | Monthly new-youth counts for 2026, 2025, and 2024 |
| `series.total_youth` | Monthly total youth membership for 2026, 2025, and 2024 |
| `series.total_units` | Monthly total unit count for 2026, 2025, and 2024 |

Extractor row mapping in the current workbook layout:

| Published Series | 2026 Row | 2025 Row | 2024 Row | Delta Row |
| --- | ---: | ---: | ---: | ---: |
| `new_units` | 3 | 4 | 6 | 5 |
| `new_youth` | 11 | 12 | 14 | 13 |
| `total_youth` | 24 | 25 | 26 | n/a |
| `total_units` | 31 | 32 | 33 | n/a |

YTD values come from rows 19-21: current period, prior period, and delta. Current workbook values are `6` new units vs `9` prior-year units and `421` new youth vs `747` prior-year youth.

Membership Intelligence renders all four series as grouped monthly bar charts. The `?` button on each chart expands a month-by-month table showing 2026, 2025, and 2024 values. Because 2026 is partial-year and 2025/2024 are full-year context, missing current-year months remain blank rather than being interpolated.

### `data/monday-latest.json`

Top-level fields:

| Field | Meaning |
| --- | --- |
| `generated_from` | Normally `monday.com daily workbook` or `monday.com API`; one-off manual refreshes may record a hybrid source |
| `generated_at` | Workbook extraction timestamp or API refresh timestamp |
| `source_workbook` | Workbook file name when generated from the daily workbook |
| `boards.prospects` | Hot prospects counts, distributions, and rows |
| `boards.renewals` | Renewal counts, distributions, and rows |
| `boards.schools` | School counts, distributions, and rows |
| `boards.popcorn` | Popcorn commitment counts, participation rate, readiness/financial rollups, and privacy-safe unit rows |

The monday.com export timestamp normally includes an explicit UTC marker. The dashboard formats it in the viewer browser's local timezone.

### `data/unit-level-latest.json` and `data/unit-level-latest.js`

These equivalent bundles are generated from the newest `*_CAC - Unit Metric Scorecard.xlsx` workbook. They publish the source workbook metadata and one compact record per unit from `Unit_Metrics`, `Units`, and `MembersDueToRenew`. The Unit-Level Detail page uses the direct `unit_type` field and unit/member records to support program-aware health, growth, training, SYT, assignment, and renewal views.

### `data/fall-recruitment-latest.js`

This JavaScript bundle is generated from monday.com board `18420720719` for the Cub Scout JSN page. It includes source and eligible item counts, scheduled recruitment counts, district/date/location distributions, uncovered-school rollups, and material totals. Widget-specific scope metadata is published with the data so the page does not replace monday.com's per-widget filters with one page-wide approximation.

### `renewal-board/data.js`

The Renewal Status bundle joins the monday.com `2026 Unit Renewal` sheet to Council dashboard unit, renewal, metric, commissioner-assignment, and Service Area hierarchy data. It publishes source metadata, council and hierarchy summaries, unit workflow rows, and event tables. The page uses the authoritative monday.com Service Areas capture for the same district hierarchy and volunteer-leadership values used by the Council dashboard.

## Main Dashboard Formulas

The home page reads `data/latest.json` and, when available, `data/monday-latest.json`.

### Master Program Filter

The shared masthead filter is implemented by `program-filter.js` and is carried across dashboard links with the `program` query parameter. The selected value also persists in browser local storage.

| Source / Page | Program filtering method |
| --- | --- |
| Unit Level Metrics | Direct `unit_type` field; used to rebuild program youth, units, health, growth, training, SYT, and commissioner-assignment rollups |
| Training and SYT | Direct person-row `unit_type` field |
| Unit Metric Compare | Workbook section (`Pack`, `Troop`, `Crew`, `Ship`, or `Post`) |
| monday.com prospects | Published `Potential Unit Type(s)` / `unit_type`; multi-type rows can appear in each applicable program view |
| monday.com renewals | Program parsed from the standardized unit name |
| Popcorn | Program parsed from the standardized unit name; Posts are excluded from the published popcorn population |
| Renewal board | Program parsed from the standardized unit name |
| Schools / TAY | Council view uses full school TAY; program views estimate eligible TAY from each school's published grade or age span and use actual program youth from unit-level data |
| Units-Youth multi-year history | Council-only because the published workbook series is not split by program |
| CST comparison | Council-only except for source-native Pack/Troop connection fields; the main comparison table is not program-filtered |

Program-filtered pages retain council-only panels when they provide useful context, but label those values as council-only rather than presenting them as filtered results.

### Program-Specific TAY Estimates

The Schools source publishes one total TAY value and one mixed `Grades` field per school, not enrollment counts by individual grade. Public-school rows generally use grade spans such as `'EE-05`, `'06-08`, and `'09-12`; many private-school rows instead use age spans such as `2-17`.

For a program view, the dashboard allocates each school's total TAY evenly across the published grade or age span, keeps the portion overlapping the selected program, and then sums those estimated portions. The program spans are:

| Master view | Program | Grade basis | Age basis when the source provides ages |
| --- | --- | --- | --- |
| Packs | Cub Scouts | K-5 | 5-10 |
| Troops | Scouts BSA | 6-12 | 11-17 |
| Crews | Venturing | 9-12 | 14-20 |
| Ships | Sea Scouts | 9-12 | 14-20 |
| Posts | Exploring Posts | 9-12 | 14-20 |

These are estimates rather than source-native grade counts. Program views display caution notes because grade-level enrollment is assumed to be even within each school, program eligibility overlaps, fifth-grade/age-10 Scouts BSA exceptions and age-13 older-youth exceptions cannot be isolated, Exploring Clubs are not represented in the Posts view, and the school source generally does not cover eligible ages 18-20. Program TAY estimates must not be added together.

### Top KPI Cards

| Card | Source | Formula |
| --- | --- | --- |
| Youth | `dashboard.council.members` | Sum of district `members` from the Membership tab |
| Retention | Selected `dashboard.unit_metric_compare` section | Weighted average of district `retention_rate`, weighted by units with a reported retention value; the Council view uses `All Units` |
| Units | `dashboard.council.units` | Sum of district `units` from the Membership tab |
| Average Metric | `dashboard.council.avg_metric` | Weighted average of district `avg_metric`, weighted by district `units` |
| Assigned | `dashboard.council.assigned_pct` | `assigned_units / units`; assigned units are counted from rows in the Assigned tab where `Assigned` is `yes` |
| Training | `dashboard.council.training_pct` | Trained person-level rows divided by all rows from the workbook Training tab |
| Volunteers | `dashboard.council.volunteers` | Councilwide value published in `Membership!S2`, calculated by the source workbook as the count of unique nonblank `Training[MemberID]` values; it does not change with district or program filters |
| Youth / TAY | Council: `dashboard.council.members / sum(monday schools tay)`; program: actual unit-level program youth divided by estimated grade/age-eligible school TAY | Council uses source totals; program views use the documented program-specific estimate |
| Popcorn Participation | `boards.popcorn.committed / boards.popcorn.items` | Units marked `Committed` divided by all rows in the Popcorn Commitments snapshot |

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
| Unit Follow-up | Complete unit-level rows in the selected Metric band (`0-2`, `3`, or `4-5`), further constrained by the master program view; the legacy `priority_units` array supplies commissioner/PIN enrichment when available but is not the table's row limit |
| PIN | For a matched `Pin` row, `Stale` when more than 12 months have passed since `lastmodifieddate`, or that date is blank or unusable; otherwise the source `pinstatus` (`Active` or `Inactive`). The implementation treats a date earlier than the same calendar date one year before the dated report's as-of date as more than 12 months since the last update. An unmatched PIN row remains `n/a`. |
| PIN Currency | District Performance scorecard count of matched unit PIN rows whose display state is current (`Active` or `Inactive`), divided by all tracked units in the selected district/program view. `Stale` and unmatched `n/a` units remain in the denominator and do not count as current. Service Area values sum the current-PIN and tracked-unit counts for the displayed districts before division. |
| Required PIN Details | Count of matched PIN rows where `pin_details_complete` is true, divided by all tracked units in the selected district/program view. A row is complete only when `pinstatus`, `BeAScout Contact`, either `BeAScout email` or `BeAScout phone#`, `Meeting Location`, and `Meeting` are present. Website, fee, fundraising, and availability fields are excluded. Unmatched units remain in the denominator. Freshness is not part of this metric because PIN Currency measures it separately. |
| Inactive + stale PINs | Count of matched `unit_pin_statuses` rows whose display state is `Inactive` or `Stale`; the displayed rate divides that count by all membership-dashboard units in the current master program view. Units without a matched PIN remain in the denominator, so the rate can differ from `(Inactive + Stale) / unit_pin_statuses.length`. |

### PIN Status & Completeness page

`pin-status.html` is a District Performance child page. It combines the shared PIN display-state classification with the Required PIN Details metric, supports the master program filter plus Service Area and District filters, and offers follow-up focuses for Stale, Inactive, details gaps, and no matched PIN. Every displayed percentage uses all tracked units in the selected view as its denominator. The page renders district aggregates only and does not expose the private source values used to calculate the completion flags.

### Today's Read / Signals

| Signal | Formula |
| --- | --- |
| Units need assignment | `dashboard.council.units - dashboard.council.assigned_units` |
| Highest risk district | District with highest `at_risk_rate` |
| Best growth district | District with highest `yoy_pct` |
| PIN state | Matched PIN rows grouped as Active, Inactive, or Stale after the master program filter; unmatched is `max(0, tracked units - matched rows)`. PIN Currency shown in the same signal is `(Active + Inactive) / tracked units`. |
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

## Pack Camping Readiness Detail Page

The Camping Readiness page reads `dashboard.training_people` from `data/latest.json`, keeps Pack rows, and groups them by district plus published unit label. The page evaluates roster-level leadership coverage for unit-coordinated overnight camping.

| Readiness Item | Pack-level Formula |
| --- | --- |
| BALOO leadership depth | Count of unique registered Pack leaders whose `baloo_expires` value is `Yes` or another recognizable completion date |
| Hazardous Weather coverage | At least one direct-contact Pack leader row has a recognizable `hazardous_weather_expires` date on or after `generated_date` |
| Gap | Zero BALOO-qualified leaders are recorded |
| Fragile | Exactly one BALOO-qualified leader is recorded; this satisfies the Pack coverage signal but creates a single point of failure |
| Preferred Depth | Two or more BALOO-qualified leaders are recorded |
| Unknown | The published Training-tab roster cannot support a leadership-depth classification for the unit |
| Displayed population | Every reviewed Pack, including Preferred Depth; the Status filter offers All statuses, Gap, Fragile, Preferred Depth, and Unknown |
| Hazardous Weather filter | Independently offers All HW statuses, Current, and Gap; it can be combined with leadership-depth Status |

The page shows all registered Pack positions when counting BALOO because the unit requirement is based on an attending registered leader, not only a direct-contact position. Hazardous Weather remains limited to direct-contact leaders because the published workbook field is `Hazardous Weather - DC Only`. The classifications measure roster depth; they do not prove who will attend or whether event-level two-deep, female-leader, or registration rules are satisfied.

The page is a planning and follow-up aid. It does not confirm which leaders will attend a particular campout and does not replace council approval or Guide to Safe Scouting requirements.

## Troop Camping Readiness Detail Page

The Troop Camping Readiness page applies the same district-plus-unit grouping to Troop rows and substitutes IOLS for BALOO.

| Readiness Item | Troop-level Formula |
| --- | --- |
| IOLS leadership depth | Count of unique Scoutmasters and Assistant Scoutmasters recorded as IOLS trained. An explicit `iols_trained` value controls when present; otherwise absence of mandatory code `S11` is the fallback signal. |
| Hazardous Weather coverage | At least one direct-contact Troop leader has a recognizable `hazardous_weather_expires` date on or after `generated_date` |
| Gap | Zero IOLS-trained Scoutmasters or Assistant Scoutmasters are recorded |
| Fragile | Exactly one IOLS-trained Scoutmaster or Assistant Scoutmaster is recorded |
| Preferred Depth | Two or more IOLS-trained Scoutmasters or Assistant Scoutmasters are recorded |
| Unknown | The published Training-tab roster cannot support a leadership-depth classification for the unit |
| Displayed population | Every reviewed Troop, including Preferred Depth; the Status filter offers All statuses, Gap, Fragile, Preferred Depth, and Unknown |
| Hazardous Weather filter | Independently offers All HW statuses, Current, and Gap; it can be combined with leadership-depth Status |

The daily builder publishes an explicit `iols_trained` value when the Training tab contains `IOLS Trained` (or the transitional `IOLA - Troops` header). When it is unavailable, the page infers status from the mandatory-training exception list: an applicable SM/ASM with `S11` still present is flagged as needing IOLS. Hazardous Weather retains the same direct-contact-only limitation described above.

The Troop page is a roster-readiness and training follow-up aid. IOLS is required for Scoutmasters and Assistant Scoutmasters to be position-trained; the page does not represent campout approval or replace attendance-specific leadership checks.

## SYT Detail Page

The SYT page also reads `dashboard.training_people`, plus `dashboard.training_codes`.

Direct-contact status is based on the source workbook `Direct Contact` column. It is converted from YES/NO to boolean during JSON generation.

Readiness logic:

| Readiness Item | Requirement |
| --- | --- |
| SYT | Required for direct-contact leaders; missing or expired date is an issue |
| Hazardous Weather | Required for direct-contact leaders; missing or expired date is an issue |
| BALOO | Informational person-level qualification for Pack leaders; missing BALOO is not an individual issue because Pack coverage is evaluated at unit level |
| IOLS | Required for Scoutmaster and Assistant Scoutmaster rows; explicit IOLS status is used when present, otherwise mandatory code `S11` is the fallback |

Display behavior:

- When the SYT page is filtered to `All leaders`, existing SYT or safety dates are displayed even for non-direct-contact rows.
- Missing SYT, Hazardous Weather, or applicable IOLS fields are flagged as person-level issues. BALOO is displayed as a recorded qualification and evaluated as a Pack-level depth measure.
- For non-direct-contact rows with no required date, the page displays `n/a`.

The code names displayed on the SYT page come from the workbook `Training Codes` tab. For example, the page looks up `Y01`, `SCO_800`, `C32`, and `S11` to display course names when available.

SYT page KPI formulas:

| KPI | Formula |
| --- | --- |
| DC Leaders | Count where `direct_contact === true` |
| SYT Current | Filtered SYT rows with a non-missing, non-expired expiration date divided by all filtered SYT rows; upcoming 0-90 day expirations remain current but are included in Needs Review |
| HW Current | Direct-contact rows without a Hazardous Weather issue divided by direct-contact rows |
| BALOO Recorded | Pack leader rows with BALOO recorded; unit-level depth is reported separately |
| IOLS Issues | Scoutmaster and Assistant Scoutmaster rows lacking an explicit IOLS completion or retaining mandatory code `S11` |
| Any Issue | Applicable rows with at least one SYT, Hazardous Weather, or IOLS issue |

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

Retention is calculated as `(current members - members new in the prior 12 months) / same-month prior-year members`. The workbook stores it as an Excel ratio, so values above `1.0` are valid results above 100% and must not be divided by 100 again or capped. The exact ratio is retained in JSON for calculations and sorting; dashboard displays round retention to the nearest whole percent to match the source workbook.

## Unit-Level Detail Page

The Unit-Level Detail page reads `data/unit-level-latest.js`, generated from the newest Unit Level Metrics workbook. Its direct `unit_type` field is the source of truth for the master program filter. Unit records expose the selected unit's health and growth metrics plus the published member-due-to-renew detail; long member tables remain inside a bounded, scrollable region on desktop and mobile and expand fully only for print.

The page also matches the selected unit to `dashboard.unit_pin_statuses` in `data/latest.json` and displays the result in the first KPI card. The card uses the same PIN display state as Unit Follow-up: `Stale` when more than 12 months have passed since the matched PIN's last update, or its update date is blank or unusable; otherwise it displays `Active` or `Inactive`. An unmatched unit displays `n/a`. Commissioner Context repeats the status as a badge beside a separate Required PIN Details badge (`Details complete`, `Details need follow-up`, `Details unavailable`, or `Details n/a`). Neither indicator is inferred from the Unit Health Funnel percentage, and no underlying contact or meeting value is published.

For Packs and Troops, the page also reads `dashboard.training_people` from `data/latest.json` and applies the same district-plus-unit join and `outdoor-readiness.js` classification used by the Camping Readiness pages. The KPI strip and Training Readiness panel both display Gap, Fragile, Preferred Depth, or Unknown. Pack status uses BALOO depth; Troop status uses IOLS-trained Scoutmaster/Assistant Scoutmaster depth. The KPI detail also reports the recorded qualification count and Hazardous Weather Current/Gap signal. If no matching Training-tab unit is found, the status is Unknown rather than Gap. Crews, Ships, and Posts do not display this camping-readiness KPI.

The Unit Level Metrics workbook is a separate source from the main `Dashboard - CAC.xlsx` workbook. The two filename selectors must remain distinct even though both files live in the Council Dashboard Reports shared drive.

## Renewal Status Detail Page

The Renewal Status page reads `renewal-board/data.js`. The builder joins monday.com renewal workflow rows with Council dashboard unit, `RenewNewDrop`, unit-metric, commissioner-assignment, and chartered-organization context. Program filtering is parsed from standardized unit names. Service Area and district leadership come from the same run-specific monday.com hierarchy capture used by the main dashboard.

Workflow rows scroll inside `.board-scroll`, and renewal event tables scroll inside `.event-table-wrap`. All event rows remain available; the page must not truncate them to an arbitrary first-row subset.

## Cub Scout JSN Detail Page

The Cub Scout JSN page reads `data/fall-recruitment-latest.js`, generated from monday.com board `18420720719`. The authenticated monday.com dashboard is the source of truth for each widget's chart type, labels, filters, stacking, date buckets, and gauge scales.

- District recruitment is a horizontal stacked chart by recruitment date and includes `No Date`.
- `School with no Cub Packs` is a pie chart for Cub Recruiting Target `Core` or `Partial`, blank Unit Associated, and No Recruitment Plans not checked. Its current widget scope excludes North Shore and Waterloo.
- Location, time-of-day, week, month, and day charts use the selected scouting-district scope; Waterloo and Exploring are excluded, and week buckets start on Monday.
- Materials gauges sum the entire board. Their fixed maxima are 63,000 fliers, 40,000 stickers, and 11,000 peer-to-peer cards.
- `Schools with no Recruitment Plans` is a district pie chart for Cub Recruiting Target `Core` or `Partial`, blank Unit Associated, and No Recruitment Plans checked; Waterloo and Exploring are excluded.
- The current source dashboard has no expenses gauge, so the public page must not restore it unless it returns to monday.com.

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
| Youth / TAY | Council youth divided by total school TAY; program youth divided by estimated grade/age-eligible school TAY in a program view |
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

For schools assigned to multiple Scouting Districts, the page attributes the full TAY value—or the full estimated program-eligible portion—to each listed official district. This matches the visible note on the page and supports district-level context, not a council-total TAY reconciliation.

District membership/TAY is computed as:

`district youth membership / attributed district TAY`

Council youth/TAY is computed differently:

`council youth membership / raw sum of all school-row TAY`

The council calculation does not duplicate TAY for multi-district school labels.

## Popcorn Commitments Detail Page

The Popcorn page reads `data/monday-latest.json boards.popcorn` and joins each row to the authoritative hierarchy in `data/latest.json dashboard.service_areas`. The normal scheduled refresh uses the Popcorn sheet from the daily monday.com workbook; the API remains the fallback when the workbook is unavailable.

The page groups rows as Service Area → District → Unit in one drill-down table. Service Areas and Districts default to collapsed; expanding a District reveals its unit follow-up rows inline. Rows without an official district mapping appear under `Other / Unassigned` so that the council total still reconciles to the source snapshot. Service Area, District, Commitment, and unit-name filters constrain both the KPI cards and hierarchy.

| KPI / Field | Formula |
| --- | --- |
| Participation | Filtered rows marked `Committed` divided by all filtered rows |
| Committed Units | Count of filtered rows where `commitment` is `Committed` |
| Committed Goal | Sum of `sales_goal` for committed rows only |
| Prior Sales | Sum of `prior_sales` for committed rows only |
| Goal Delta | Committed Goal minus Prior Sales |
| Onboarded | Count of committed rows with the onboarding-completed checkbox selected |
| Trained | Count of committed rows with the leader-trained checkbox selected |

The public snapshot intentionally excludes primary contact names, email addresses, and phone numbers from Popcorn rows. Participation uses all unit rows as the denominator, including `Not Committed` and `Not Selling`; blank or nonstandard statuses remain in the denominator and are visible in the source distribution. The page displays the daily workbook extraction timestamp, or the API timestamp when fallback mode is used.

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
| TAY | Council view: sum of `tay`; program view: sum of estimated grade/age-eligible TAY for school rows attributed to the district |
| Schools without unit | Council view: attributed schools where `unit_associated` is blank; program view: eligible-span schools without an associated unit matching the selected program |
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
| Youth / TAY | Council youth divided by raw school TAY; program youth divided by estimated grade/age-eligible school TAY |
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
- Manual source links added in the HTML for the Detailed Council Dashboard, Council Service Territory Comparison Data, and Unit Level Metrics
- Contact text for monday.com detailed access
- Service Area hierarchy and leadership source note from the run-specific monday.com `Field Service / Service Areas` capture

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
- GitHub Pages publishing is owned exclusively by the consolidated platform. Generated data is artifact-deployed; source changes use ordinary linear commits without force.
- The pages use `fetch(..., { cache: "no-store" })` for JSON data files, but browser caching of HTML and JavaScript can still make cache-busted script filenames useful after code changes.
- The lower-left sidebar timestamp and detail-page freshness timestamps are rendered in the viewer browser's local timezone. No-offset Council dashboard timestamps are first interpreted as America/Chicago source time; explicit UTC/offset timestamps are used as-is.

## Known Interpretation Choices

- TAY is sourced from the monday.com Schools export, not the Council dashboard workbook.
- Council Youth / TAY uses raw school-row TAY once per school row.
- District Youth / TAY attributes full TAY to each official district listed on a school row.
- Program Youth / TAY uses actual youth from units of the selected type and the documented estimated grade/age-eligible TAY; it is not an official source-native market-share metric.
- monday.com operational rows may include labels outside the official 12 districts; official district views exclude those labels.
- The Membership Intelligence priority score is a dashboard-created prioritization aid, not an official workbook metric.
- Date-expiration checks on Training and SYT pages use the viewer browser's current date.
- Freshness timestamps are displayed in the viewer browser's local timezone, so two viewers in different timezones may see different clock times for the same data snapshot.
- Service Area filters are authoritative because they use the monday.com `Field Service / Service Areas` hierarchy, not a workbook-derived field.

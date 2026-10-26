# Council Dashboard Summary project instructions

## New-youth joins pages — October 26, 2026 replacement

Peter replaced Cub Scout JSN with `cubs-joins.html` (Cub Scout Joins) and
`scouts-bsa-joins.html` (Scouts BSA Joins). This supersedes the former JSN
widget parity and monday-board refresh requirements for that page only.
Keep other monday.com inputs and School Market Context unchanged.

`tools/build_join_dashboards.py` selects the newest date in each
`CAC_All_Cub_Pack_Joins_Sept1_2026_to_YYYY-MM-DD.xlsx` and
`CAC_All_Scout_Troop_Joins_Sept1_2026_to_YYYY-MM-DD.xlsx` filename in
CAC-Published-Reports. Require both newest files to match the Central run date;
never fall back to an older valid workbook. Validate periods, schemas, unit and
age totals, review flags, district-sheet equality, unique available unit IDs,
and unchanged hashes across the pair read. Publish a single atomic
`data/joins-latest.js` bundle only after both pass.

Preserve zero-join units, workbook council ranks and ties, unavailable ages,
and units flagged for missing current unit-report coverage. Flagged units may
have unavailable unit IDs and organizations; do not fabricate them or drop
their joins. Counts are distinct new youth per unit, not deduplicated council
people. Ages describe the current roster date, not age at joining. Exclude
transfers and re-registrations. Publish unit aggregates only, never youth names,
member IDs or raw join records. Unit IDs are organizational identifiers.

Keep both pages under Membership & Growth, redirect old JSN bookmarks to Cubs,
apply district/search/unit-view filters to all charts, KPIs, rows and exports,
and retain bounded two-axis table scrolling at mobile widths. Keep navigation
cache versions, Dashboard Guide, data dictionary, updater, validator, sanitizer,
release manifest and `tools/test_join_dashboards.py` synchronized. Daily data
belongs only in the isolated Pages payload; do not commit generated bundles.
Source changes use linear source commits and the normal validated artifact
publisher. Verify both live pages and exact public bundle after deployment.

## School Market Context unit-affiliation contract

Preserve **Recruitment Pipeline → School Market Context → Schools with Unit Affiliation / Total** as the verified affiliated-school count alongside the total school count for every Service Area and district rollup.

- Determine affiliation from the live monday.com Unit Associated board relation's linked item IDs, not from workbook relation text, which may be blank even when a link exists.
- Verify a privacy-safe Boolean affiliation flag for every exported school on every daily refresh. Missing, duplicate, partial, or non-Boolean relationship coverage must fail closed.
- Pin the published verification metadata to `monday.com BoardRelationValue.linked_item_ids` and the approved Unit Associated relation-column ID. Require a parseable, timezone-aware verification timestamp that does not predate the snapshot, and reconcile the published affiliated and verified counts to the Boolean rows.
- Keep the affiliated and total counts on the same active school, district, status, search, program-eligibility, and usable-TAY scope. Preserve the existing multi-district attribution behavior.
- Keep the affiliated, total, and verified school counts in the daily refresh summary so a scheduled run leaves auditable evidence of relationship coverage.
- Keep the panel help, Dashboard Guide, data dictionary, generated calculation guide, cache-busted JavaScript, focused monday/TAY tests, and structural validator synchronized.

## Scrollable dashboard tables

Preserve the nested scrolling behavior added on 2026-08-21. Long tables must remain fully available inside bounded dashboard blocks instead of making the panel grow indefinitely or clipping rows.

- `.panel.detail-table` must not own the height limit. Its direct `.table-wrap` child owns the viewport-aware height and both-axis scroll region.
- Keep `overflow: auto`, `overscroll-behavior: contain`, `scrollbar-gutter: stable`, and sticky table headers on scrollable table containers.
- Do not remove the table height limit at the mobile breakpoint. Mobile tables must retain internal vertical and horizontal scrolling.
- Unit-level member tables must use the same contained scrolling pattern, except in print styles where the full table is intentionally visible.
- Renewal workflow rows must scroll inside `.board-scroll`; renewal event tables must scroll inside `.event-table-wrap` and render all rows rather than an arbitrary first-row subset.
- Training person-level detail, SYT expiration detail, Outdoor Safety Readiness, and monday.com Operating Detail tables must render every row matching the active filters. Do not restore fixed `slice()` row caps; use the bounded scroll containers to manage their on-screen size.
- When shared table CSS or renewal table JavaScript changes, bump the corresponding cache-busting query string on every page that loads the asset.

`tools/validate_site_structure.py` fails closed on these requirements. Before publishing, run that validator, exercise a genuinely long table at desktop and mobile widths, and verify the cache-busted assets on the live GitHub Pages site after the consolidated daily build.

## Renewal Status expanded-unit column contract

Preserve the clarified **Renewal Status → District Renewal Workflow** hierarchy
and expanded-unit layout published on 2026-09-04.

- Keep Service Area, district, and expanded unit rows on the same seven-column
  workflow grid: hierarchy identity, Workflow Progress, Drop/Renew, Initiated,
  Submitted, Pending Acceptance, and Posted. Do not restore the former
  eight-cell unit layout, which shifted unit values beneath unrelated district
  headings and left support and match fields unlabeled.
- Every expanded district must render its own unit-level heading row with the
  exact fields **Unit · Dashboard Match · Support**, **Workflow Progress**,
  **Drop/Renew**, **Initiated**, **Submitted**, **Pending Acceptance**, and
  **Posted**. The heading cells and unit-row cells must use the same grid and
  remain exactly aligned.
- Calculate each unit's Workflow Progress through the same five-stage logic
  used by district and Service Area progress. Keep dashboard-match state and
  support ownership beneath the unit name, with dashboard match first so the
  state remains visible when a long support name is truncated.
- Preserve explicit accessible unit-row labels that identify every workflow
  value, progress, support owner, and dashboard-match state. Continue applying
  the public First Name, Last Initial privacy rule to support names.
- Keep the full hierarchy inside `.board-scroll` with bounded two-axis
  scrolling at desktop and mobile widths. Do not hide the unit header at the
  mobile breakpoint or remove horizontal access to later workflow stages.
- When the renewal CSS or JavaScript changes, bump both cache-busting query
  strings in `renewal-board/index.html`. Keep the Dashboard Guide and the
  fail-closed Renewal Status checks in `tools/validate_site_structure.py`
  synchronized.
- Before publishing, expand a district with a genuinely long unit list at
  desktop and narrow/mobile widths, verify exact unit-header/cell alignment,
  confirm the live cache versions and abbreviated public names, and check the
  browser console for warnings or errors.

The public implementation baseline is commit `3885181`.

## Dashboard help guide maintenance

Treat `help.html` as part of the public product contract. Whenever the website's navigation, page structure, page purpose, filters, controls, metric names or definitions, status language, source behavior, privacy guidance, or troubleshooting behavior changes, review and update the corresponding help content in the same source change.

Use the dashboard's page names precisely in implementation and handoff notes:

- **Data & Help** means `sources.html`, the page for source workbooks, references, methodology, and support links.
- **Dashboard Guide** means `help.html`, the separate reader guide linked from Data & Help.
- When reporting a published change to either page, identify the exact page and public URL so “help page” is not ambiguous.

- Keep the page directory in `help.html` aligned with `site-navigation.js`, including parent/child placement and user-facing labels.
- Keep Quick Start, controls, measures, responsible-use guidance, and troubleshooting text consistent with actual dashboard behavior.
- Preserve live freshness rendering through `help.js`, responsive and print behavior through `help.css`, and the link from `sources.html`.
- Update the help asset cache-busting versions whenever `help.css` or `help.js` changes, and update every navigation cache-busting reference whenever `site-navigation.js` changes.
- Extend `tools/validate_site_structure.py` when a structural help requirement changes so scheduled publication fails closed on regressions.
- Before publishing any structural or content change, include `help.html` in the review and verify the live help page after deployment.

## Priority Units metric-band contract

Preserve the Metric selector in the **Priority Units** block on `unit-health.html`. It must offer exactly these operational bands: `0–2`, `3`, and `4–5`, with `0–2` selected by default.

- Populate the table from the complete unit-level dataset so all three bands return the full matching unit list; do not fall back to the legacy capped `dashboard.priority_units` list as the primary source.
- Preserve commissioner and PIN details from `dashboard.priority_units` when matching records are available, and use the unit-level assignment data for the remaining units.
- Publish complete matched PIN enrichment through `dashboard.unit_pin_statuses` so every Metric band can display its BeAScout PIN state. Show `Stale` when `lastmodifieddate` is blank or earlier than the same calendar date one year before publication; otherwise retain `Active` or `Inactive`. An unmatched PIN record remains `n/a`.
- Keep the Unit-Level Detail PIN Status KPI on the same `dashboard.unit_pin_statuses` join and the same `Active`, `Inactive`, `Stale`, and `n/a` semantics.
- Keep the Unit Health Funnel's `Inactive + stale PINs` measure on the complete matched `dashboard.unit_pin_statuses` dataset. Count both states together, filter by the master program view, and divide by all membership-dashboard units in that view for the displayed rate. Units without a matched PIN remain in the denominator, so the rate can differ from a percentage calculated only over PIN-status rows.
- In all reader-facing descriptions, express `Stale` as **more than 12 months since the last update** or a grammatically equivalent sentence. Do not say that a PIN or update date is **over 12 months old**. Preserve the exact calendar-date boundary in technical documentation and keep the structural validator's deprecated-wording guard active.
- Keep the selector compatible with the master program filter and any district or search filters present on the page.
- Keep `help.html` aligned with this control, retain the validator checks for all three options and their JavaScript binding, and bump the page's JavaScript cache-busting query whenever the implementation changes.
- Before publishing changes to this block, verify each band on the live page and confirm that the rendered Metric values remain within the selected band.

## Public person-name privacy contract

Every public Council Dashboard Summary and Commissioner portal page and data
bundle must publish person names as **First Name, Last Initial** (for example,
`Alex R.`). Apply the rule at the publication-data layer so visible tables,
searchable values, fetched JSON, and JavaScript data bundles all use the same
privacy-safe value while private source workbooks remain unchanged.

- Preserve `tools/sanitize_public_person_names.py` in both production deployment paths.
- Keep the shared Council snapshot, Unit Level bundles, and Renewal Board bundle covered.
- When a new public bundle or person-name field is added, extend the sanitizer and its tests before publishing.
- Run the sanitizer's check mode immediately before deploying either public site; fail closed if a full person name remains in a covered field.

## Outdoor leadership readiness contract

Preserve the shared readiness model established on 2026-08-30 across People &
Readiness, Training, SYT, Pack Camping Readiness, Troop Camping Readiness, and
Unit-Level Detail.

- Leadership depth is **Gap** for zero qualified leaders, **Fragile** for one,
  **Preferred Depth** for two or more, and **Unknown** when the published data
  cannot support a classification. Never convert Unknown to Gap.
- Pack readiness uses BALOO-qualified leaders. Troop readiness uses IOLS-trained
  Scoutmasters and Assistant Scoutmasters. Hazardous Weather remains a
  separate filter and signal rather than part of the depth classification.
- Pack and Troop readiness tables include every reviewed unit matching the
  active filters, including Preferred Depth units. Do not revert to gap-only or
  action-only lists.
- Preserve the exact Status choices `All statuses`, `Gap`, `Fragile`,
  `Preferred Depth`, and `Unknown`, and keep Unit-Level Detail on the same
  shared classification.
- Keep `outdoor-readiness.js`, its focused test, the site validator, public help,
  data dictionary, runbook, README, and generated calculation guide aligned.

## District Operational Detail contract

Preserve the compact scorecard table in **District Performance → District
scorecard → Operational Detail**.

- Show **PIN Currency** and **Assigned** as plain numeric percentages. PIN
  Currency is the number of matched PIN rows in current `Active` or `Inactive`
  display states divided by all tracked units in the selected district/program
  view. `Stale` and unmatched `n/a` units remain in the denominator and do not
  count as current. Do not restore mini-meters, progress bars, or other
  decorative bars inside these table cells.
- Keep the **Retention** column immediately after **Avg Metric** for both
  district and Service Area rows. District values come from the workbook's
  `retention_rate`; the master program filter does not recalculate that source
  metric.
- Display retention rounded to the nearest whole percent and allow valid values
  above 100%. Service Area retention is the unit-weighted average of districts
  that have both a reported retention value and a nonzero unit count.
- Keep the header and every rendered row at the same column count. Whenever the
  shared dashboard JavaScript changes, bump its cache-busting query on every
  page that loads it.
- Preserve the Service Area to district hierarchy and the expandable district
  rows that reveal every matching unit in the active master program view. Unit
  detail rows show unit health, youth, YoY, metric, retention, PIN status,
  assignment presence, SYT, and training; sort lowest metrics first; and link
  directly to the selected Unit-Level Detail record. Keep the nested unit table
  bounded and scrollable and do not expose private PIN contact or meeting data.
- Preserve the District Operational Detail assertions in
  `tools/validate_site_structure.py`, render `districts.html`, and confirm zero
  `.mini-meter` elements in `#districtRows` before publishing.
- Keep expanded Operational Detail unit headings visible below the district
  headings during both scroll levels, including Safari. Preserve measured
  offsets, resize handling, scoped header stacking, and regression coverage.

## PIN Status & Completeness page contract

Preserve `pin-status.html` as the **PIN Status & Completeness** child page under
District Performance.

- The normal daily source is the `Pin` tab inside that day's downloaded
  `YYYY-MM-DD_Dashboard - CAC.xlsx` OneDrive workbook. Do not introduce a
  separate PIN file into the Council Summary publication path or substitute
  the Unit Level Metrics workbook for this source.
- A daily Pages payload must stage `data/latest.json` and
  `data/unit-level-latest.json` from the same report date. The PIN rows must be
  nonempty when Unit-Level units exist, contain one privacy-safe row per
  matched identity, have no duplicate or extraneous unit identities, and use
  the privacy-safe `pin_last_updated` calendar date plus Boolean completion
  flags. Never publish the raw timestamp. Preserve the fail-closed checks in
  `validate_unit_pin_snapshot` and their focused tests.
- Keep freshness and field completeness separate. PIN Currency uses matched
  current `Active` or `Inactive` rows divided by all tracked units. Required
  PIN Details uses matched rows where `pin_details_complete` is true divided
  by all tracked units. Stale and unmatched units remain in both denominators.
- Do not source the public `pin_pct` field from the Membership worksheet's
  `Pin`, `Pin Meeting`, or any later renamed summary column. Reconcile council
  and district `pin_pct` to the shared privacy-safe PIN rows before deployment;
  the structural validator must reject a mismatch.
- A PIN has Required PIN Details only when status, contact name plus at least
  one contact method (email or phone), meeting location, and meeting details
  are present. Website, fee, fundraising, and availability fields are not
  counted unless this product definition is explicitly revised.
- Publish only the privacy-safe `pin_last_updated` calendar date and the Boolean flags `pin_status_complete`,
  `pin_contact_complete`, `pin_meeting_complete`, and
  `pin_details_complete`. Never publish the raw source timestamp or underlying
  PIN contact names, email addresses, phone numbers, meeting locations, or
  meeting details.
- Preserve the master program filter, Service Area and District filters,
  Stale/Inactive/details-gap/no-PIN focuses, district aggregates, and the
  approved reader wording for Stale.
- Preserve expandable District PIN Detail rows that list every unit matching
  the active filters, prioritize follow-up units, and show Last Updated between
  PIN Status and Required PIN Details. Show only privacy-safe status, calendar
  date, completeness, and missing-category indicators, and deep-link to the
  selected Unit-Level Detail record.
- Preserve PIN state in Overview Signals to Watch, the direct PIN Status &
  Completeness link in Overview Explore, and the PIN indicators in Unit-Level
  Detail's Unit Profile. All three reuse the shared privacy-safe row and
  established denominators.
- Unit-Level Detail's Unit Profile must show Last Updated immediately below PIN
  status and freshness, followed by overall Required PIN Details and separate
  privacy-safe indicators for the status, contact, and meeting completion
  categories. Last Updated uses the published `pin_last_updated` calendar date,
  displays `Not recorded` for a matched PIN without a usable date, and displays
  `n/a` for an unmatched unit. These indicators must use the shared published
  PIN row and must not expose the raw timestamp or underlying private values.
- Keep the builder, focused tests, validator, Dashboard Guide, README, data
  dictionary, runbook, generated calculation guide, cache-busting strings, and
  live page synchronized. The daily publisher must execute the focused
  Unit-Level PIN rendering test before staging a release; a missing label,
  incorrect row order, invalid date-state display, or exposed private PIN value
  must fail closed.
- Keep the expanded unit column headings visible below the district headings
  during both outer-table and inner-unit scrolling, including Safari. Preserve
  the measured header offset, resize handling, and scoped stacking safeguards;
  district-only headings must not appear to label unit status/completeness cells.

## Data & Help training-reference contract

Keep the official Scouting America Training Codes workbook and Position Trained
Requirements PDF linked from `sources.html`. Preserve the corresponding
fail-closed checks in `tools/validate_site_structure.py` and keep the public
Dashboard Guide and generated calculation guide synchronized with metric and
control changes.

## Unit Key 3 hierarchy contract

Preserve Unit Key 3 Detail as a two-level collapsible Service Area → District
hierarchy. Service Area rows summarize all filtered units beneath them; district
rows summarize their own filtered units and expand to the missing-first unit
table. Keep accessible disclosure state, Expand all and Collapse all controls,
automatic expansion for searches and exact district selections, bounded outer
and unit-table scrolling, public person-name abbreviation, and direct Unit-Level
Detail links. Filters, Unit Key 3 definitions, COR/CUR substitution, privacy,
and denominators must not change as a side effect of the hierarchy.

In every expanded Unit Key 3 row, the line beneath a holder's public name must
show that person's SYT expiration date instead of their position title. Render
dates due within 90 days of the viewer's current date in yellow and render
expired dates in red. A missing or unusable SYT date displays as unavailable
and does not change whether the qualifying Key 3 position is present. Keep
`syt_expires` privacy-safe and do not add contact or meeting values to the
public holder objects.

Keep `key3-status.html`, `key3-status.js`, `key3-status.css`, the focused page
test, structural validator, Dashboard Guide, Markdown documentation, generated
calculation guide, and cache-busted asset versions synchronized. Verify the live
two-level disclosure behavior after publication.

The Unit Key 3 Status filter must offer exactly All statuses, Complete, Missing
1, Missing 2, Missing 3, 1 or more expired SYTs, and 1 or more SYTs expiring
within 90 days. Coverage statuses filter the exact published `status` value.
The two SYT statuses evaluate every displayed holder against the viewer's
current date; a unit with both states matches either filter. All choices combine
with the master program, Service Area, District, Focus, and Search filters
without changing Key 3 definitions or denominators.


## BeAScout unit listing publication contract

- Preserve `tools/beascout_links.py`, its offline regression suite, the Unit Profile link, cache versions, and `update_daily.zsh` integration as one release. Resolve numeric internal unit IDs plus ZIP through the official BeAScout resolver; publish only verified canonical `/units/UUID` URLs. Never guess UUIDs or substitute registration/search URLs.
- The raw PIN CSV supplies link identity/ZIP only. PIN status, freshness, completeness, and denominators remain sourced from the dashboard workbook's `Pin` tab. CSV mtime is an intake-date check, not proof of report-generation freshness. Require its matched ID population to equal the authoritative workbook PIN population, validate identity/council/gender where supplied, reject normalized duplicate IDs, and verify source fingerprint/hash across the complete lookup.
- Every matched unit must resolve successfully before a new bundle may publish. A partial outage, source mutation, ambiguous identity, or duplicate destination URL must fail closed and retain the prior published snapshot. Only units genuinely absent from the authoritative PIN population may display Link unavailable. Never encode today's 297/299 counts as future requirements.
- Keep HTTPS-only redirects, per-request total limits, a five-minute overall lookup budget, modest concurrency and one reduced-concurrency retry. Private failed-run audits contain unit IDs and safe outcome codes; never record source contacts, addresses, server response bodies or arbitrary exception text.
- Require strict public verification metadata, a same-report-date timezone-aware verification timestamp, reconciled coverage and source digest. Validate that the JSON and JavaScript browser bundles represent exactly the same complete generation before publication. Preserve the prior published bundle on failures.
- Run the BeAScout and Unit Profile regressions in the read-only daily preflight before intake/report artifacts, as well as at site publication. Keep release parity, source-cleanliness gates, reader documentation, daily coverage logging, and production source copies synchronized. Test live matched/unmatched units, guide freshness, browser cache versions, staged/live payload equality, and core presentation parity after a site release.


Unit joins now groups every matching unit in collapsible Service Area → District sections. Both headings show filtered unit and new-join totals. Expand all and Collapse all control the hierarchy; district, search or unit-view filters automatically reveal matching units. Collapsing a section does not remove its units from counts or CSV exports. Service-area assignments come from the same-day council snapshot using validated district labels; missing or ambiguous assignments block a new bundle.

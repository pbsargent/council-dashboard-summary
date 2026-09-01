# Council Dashboard Summary project instructions

## Cub Scout JSN Dashboard

Treat the authenticated monday.com Cub Scout JSN Dashboard as the source of truth for the website page:

- monday overview: `https://capitolareacouncil564.monday.com/overviews/32299792`
- underlying board ID: `18420720719`
- public page: `https://pbsargent.github.io/council-dashboard-summary/fall-recruitment.html`

The implementation is primarily in:

- `tools/build_fall_recruitment_dashboard.py`
- `fall-recruitment.html`
- `fall-recruitment.js`
- `fall-recruitment.css`
- generated data: `data/fall-recruitment-latest.js`

When updating this page, query the monday API for current data and inspect the authenticated monday dashboard when widget appearance or filter behavior is relevant. Match each widget's chart type, labels, category scope, stacking, date bucketing, and gauge scale. Do not replace widget-specific scopes with one page-wide approximation.

Preserve these established widget semantics unless the monday dashboard itself changes:

- District recruitment is a horizontal stacked chart by recruitment date and includes `No Date`.
- `School with no Cub Packs` is a pie chart filtered to Cub Recruiting Target `Core` or `Partial`, blank Unit Associated, and No Recruitment Plans not checked. Its selected district scope excludes North Shore and Waterloo.
- Location, time-of-day, week, month, and day charts use the selected scouting-district scope. Waterloo and Exploring are excluded from that scope.
- Week buckets start on Monday.
- Materials gauges sum the entire board rather than the Cub-target subset. Gauge maxima are 63,000 fliers, 40,000 stickers, and 11,000 peer-to-peer cards.
- `Schools with no Recruitment Plans` is a district pie chart filtered to Cub Recruiting Target `Core` or `Partial`, blank Unit Associated, and No Recruitment Plans checked. Waterloo and Exploring are excluded.
- The current monday.com dashboard does not include the former expenses gauge; do not restore it unless it returns to the source dashboard.

Counts are live values, not permanent requirements. The 2026-08-14 parity implementation is commit `f49c069bf14c064da3f0dcfa752425e1c798dc11`; use it as the visual and filter baseline if a later edit regresses the page.

Before publishing a Cub Scout JSN Dashboard change:

1. Regenerate `data/fall-recruitment-latest.js` through the builder/API path.
2. Run syntax and repository validation checks.
3. Render the page and visually compare it with monday.com.
4. Publish and verify the live GitHub Pages output rather than relying only on the local render.

## Cub Scout JSN Dashboard daily automation

The Cub Scout JSN data refresh is part of the normal Council web refresh. The active production checkout is `/Users/petersargent/CACDashboardPlatform/sites/council-dashboard-summary`; `/Users/petersargent/CACDashboardPlatform/tools/daily_build_publish.zsh` invokes its `update_daily.zsh` during the regular dashboard build.

Daily generated data must be written to the platform's isolated Pages staging tree and deployed through `.github/workflows/deploy-pages-payload.yml`. Do not commit daily JSON, create orphan commits, or force-push. Source-code changes remain ordinary linear commits on `main`.

That updater fetches and fast-forwards `main`, queries monday.com board `18420720719`, regenerates `data/fall-recruitment-latest.js`, runs `tools/validate_site_structure.py`, publishes the refreshed data, and reports the Cub Scout JSN status with the other web dashboards. The validator fails closed unless both `School with no Cub Packs` and `Schools with no Recruitment Plans` remain monday.com-style pie charts. The refresh must not modify monday.com.

The older standalone Codex task `daily-fall-recruitment-dashboard-refresh` is redundant after this consolidation and should remain paused or be removed so two jobs do not publish the same data independently.

The end-to-end test completed on 2026-08-14 with published commit `7d5c552fff90a15a6e2e848efbe39d53a07d7572`. The test observed 732 board items, 350 eligible items, 128 scheduled recruitments, and 34,191 total materials. These counts are evidence that the workflow worked on that date, not fixed expectations for future runs.

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
- Preserve the District Operational Detail assertions in
  `tools/validate_site_structure.py`, render `districts.html`, and confirm zero
  `.mini-meter` elements in `#districtRows` before publishing.

## PIN Status & Completeness page contract

Preserve `pin-status.html` as the **PIN Status & Completeness** child page under
District Performance.

- Keep freshness and field completeness separate. PIN Currency uses matched
  current `Active` or `Inactive` rows divided by all tracked units. Required
  PIN Details uses matched rows where `pin_details_complete` is true divided
  by all tracked units. Stale and unmatched units remain in both denominators.
- A PIN has Required PIN Details only when status, contact name plus at least
  one contact method (email or phone), meeting location, and meeting details
  are present. Website, fee, fundraising, and availability fields are not
  counted unless this product definition is explicitly revised.
- Publish only the Boolean flags `pin_status_complete`,
  `pin_contact_complete`, `pin_meeting_complete`, and
  `pin_details_complete`. Never publish the underlying PIN contact names,
  email addresses, phone numbers, meeting locations, or meeting details.
- Preserve the master program filter, Service Area and District filters,
  Stale/Inactive/details-gap/no-PIN focuses, district aggregates, and the
  approved reader wording for Stale.
- Keep the builder, focused tests, validator, Dashboard Guide, README, data
  dictionary, runbook, generated calculation guide, cache-busting strings, and
  live page synchronized.

## Data & Help training-reference contract

Keep the official Scouting America Training Codes workbook and Position Trained
Requirements PDF linked from `sources.html`. Preserve the corresponding
fail-closed checks in `tools/validate_site_structure.py` and keep the public
Dashboard Guide and generated calculation guide synchronized with metric and
control changes.

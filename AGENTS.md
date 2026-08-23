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
- When shared table CSS or renewal table JavaScript changes, bump the corresponding cache-busting query string on every page that loads the asset.

`tools/validate_site_structure.py` fails closed on these requirements. Before publishing, run that validator, exercise a genuinely long table at desktop and mobile widths, and verify the cache-busted assets on the live GitHub Pages site after the consolidated daily build.

# Tranche 202 — The sales report as a native screen

**Status:** in progress on `claude/sales-report-native`.
**Origin:** Tom, 2026-10-02. The sales-report Artifact becomes a first-class screen of the sales workspace, "דוח מכירות". The Artifact stays active and untouched during an overlap period.

## Before

The report lives only as an Artifact (`report_template.html` plus `build_report.py` in the backend repo). Its numbers are computed in the browser from one data blob, `D`. Phones get a desktop spreadsheet, hover-only tooltips, and states that can read as zero sales.

## Change

- `GET /api/sales/report` proxies the backend's `/api/v1/queries/sales/report`, which serves exactly `build_report.py`'s `D`, its freshness, and whether it is stale.
- `src/app/(sales)/_lib/report/*` are pure TypeScript ports of the template's computations, one unit test per definition with hand-checked numbers: periods and year-over-year, heat, trend tiles, the year matrix, chains (roster, merge, dormancy, KPIs), the daily model (weekday medians, same-hour base, month pace, axis clip) and the retro chips.
- `/sales/report` ("דוח מכירות") holds the five Artifact tabs in the Artifact's order: יומי · לקוחות · מוצרים · רשתות · מגמה. It is the fifth destination, for managers (admin or planner) only. A rep who opens the URL gets the manager-only message and no data.
- Phone first: a summary / by-month toggle on the grid tabs, 2x2 hero tiles, stacked retro rows, tap tooltips on the four hand-drawn SVG charts, no sideways page scroll from 320px.
- Every state is stated: loading is a skeleton of the tab, "never built" is a message, a failed read is an error card with a retry, and a stale report is shown in full under an amber band. None of them can read as zero sales.
- Fixed in the port, with no change to a business definition: chains search uses the chains tree; controls that do nothing on a tab are hidden; the summary line is per tab; the total row's prior-year figure covers the same filtered rows; a search says the total is filtered; years and "25 חודשים" come from the data; search ignores case; chains month headers mark the partial month; products search also matches the SKU code and title; the retro footnote matches what the "today" tile does; tooltips open on tap and close on an outside tap or Escape.

## Manifest

manifest:
  - docs/portal-os/tranches/202-sales-report-native.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/api/sales/report/route.ts
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/report/types.ts
  - src/app/(sales)/_lib/report/period.ts
  - src/app/(sales)/_lib/report/aggregate.ts
  - src/app/(sales)/_lib/report/trend.ts
  - src/app/(sales)/_lib/report/chains.ts
  - src/app/(sales)/_lib/report/daily.ts
  - src/app/(sales)/_lib/report/freshness.ts
  - src/app/(sales)/_lib/report/format.ts
  - src/app/(sales)/_lib/report/csv.ts
  - src/app/(sales)/_lib/report/hooks.ts
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/_components/report/ReportScreen.tsx
  - src/app/(sales)/_components/report/ReportHeader.tsx
  - src/app/(sales)/_components/report/ReportStates.tsx
  - src/app/(sales)/_components/report/ReportControls.tsx
  - src/app/(sales)/_components/report/GridTab.tsx
  - src/app/(sales)/_components/report/ChainsTab.tsx
  - src/app/(sales)/_components/report/TrendTab.tsx
  - src/app/(sales)/_components/report/DailyTab.tsx
  - src/app/(sales)/_components/report/HeroTiles.tsx
  - src/app/(sales)/_components/report/Sparkline.tsx
  - src/app/(sales)/_components/report/MonthlyChart.tsx
  - src/app/(sales)/_components/report/YoyChart.tsx
  - src/app/(sales)/_components/report/DailyChart.tsx
  - src/app/(sales)/_components/report/YearMatrix.tsx
  - src/app/(sales)/_components/report/RetroTable.tsx
  - src/app/(sales)/_components/report/ChartTip.tsx
  - src/app/(sales)/_components/report/CopyCsv.tsx
  - src/app/(sales)/sales/report/page.tsx
  - src/app/(sales)/sales/report/layout.tsx
  - src/app/(sales)/sales-tokens.css
  - tests/e2e/_fixtures/salesReport.ts
  - tests/e2e/sales-report.spec.ts

Unit tests live under `tests/unit/sales/report/` (one file per ported module, plus `fixture-parity.test.ts`, which reads the synthetic world against the figures the Artifact itself printed) and `tests/unit/sales/` (`sales-shell`, `api-stubs`).

## Differences from the Artifact that are copy or layout, not definitions

- The project's internal "not" mark (`⊥`) is gone from every sentence: "הטלה, לא תחזית", "אינה מזיזה את הקו".
- The year-over-year header reads "מול אשתקד" instead of "YoY"; zero prints as zero where the Artifact printed a bare ₪.
- A phone's month table keeps the name column, the newest months and the total in view; the share, year-over-year and sparkline columns appear from 640px and 1024px, because the summary list already carries them on a phone.
- The quick-add disc is hidden on this screen, as on settings: it sat over the numbers.

## Gates

- Red-first unit tests for every ported definition, with hand-checked numbers.
- UI parity against the Artifact built from the same synthetic data: trend and daily hero tiles, the pace sentence, chains KPIs, customers totals for three periods, products family totals, one drill-down, the retro rows.
- Screenshots of every tab at 320, 390, 430, 768, 1280 and 1440 px, light and dark, plus the stale, never and error states.
- vitest, typecheck, lint, and the sales e2e specs.

## Rollback

Revert the merge commit. The Artifact was never touched.

## UX gate round 1 (fixes on this branch)

Red-first where testable. Tests: 1885 unit (full run), 75 e2e (report 44, today 7, orgs 24), parity against the Artifact 154/154, the review's differential harness 0 logic mismatches on every world except the 2027 and 2028 pulls, where only the years x months matrix differs on purpose (the Artifact hard-codes 2024 to 2026).

- A hollow blob (keys, no rows, orders, customers or SKUs) or a month in progress that is not the last month reads as an error; no freshness pill over it.
- A sort the period cannot honour falls back to the default; a sort is kept per tab; the phone list says what it is sorted by.
- Phone: tab bar sticky under the app bar, back-to-top after two screens, a new tab opens at its top; the month table scrolls inside a screen-bound box so its headers hold; the room beside the pinned column is tiled in whole columns and snapped, so no month figure is cut.
- Wording: every daily change names its baseline; "12 חודשים מלאים"; units follow the unit; the partial month is keyed under every month table and in the summary; "Shopify" only for the reconciliation gate; singular forms; one date style; build note about products outside the price list.
- Access: a 401 asks to sign in again (reload), a 403 is the not-yours card, neither is retried; non-managers get a card with a way back and no VAT claim; the proxy answers `Cache-Control: private, no-store`.
- Accessibility: stable names (CSV button, summary rows with aria-describedby), always-mounted live regions for chart tips and the CSV result, tips close on blur, range change and outside tap, a swipe that starts on a chart opens nothing, heat cells carry an arrow, 44px targets, non-text contrast of bars and badges.
- Not changed, by decision: "צפי לסוף החודש", "ישנים/שקט", K/M suffixes (Artifact wording).

# Tranche 039: dashboard — operational trend visualisations

status: active
created: 2026-06-01
activated: 2026-06-01
scorecard_target_category: ux_polish
expected_delta: +1 ux_polish
sizing: M

## Why this tranche
`/dashboard` is a polished command-center, but every panel today is a *snapshot*
— current values, current lists. A COO opening it cannot see motion: is
production picking up or slowing down? Is the warehouse busier than last week?
This tranche adds the first **time-series visualisations** to the dashboard so
the surface reads like a real instrument cluster, not a static report.

Two charts, both built from data the portal already has — **no new backend
endpoint, contract, or schema** (those are W1/W4 lanes). Each reuses an existing
proxy with a larger `?limit=` and aggregates client-side.

## Non-negotiable: honest aggregation
Production actuals and stock-ledger rows mix units of measure across items
(kg, units, packs). Summing raw quantities across items would produce a
meaningless number, so the trend helpers aggregate the **count of postings per
day** — an unambiguous, UOM-agnostic activity signal — never a summed
mixed-unit quantity. This matches the dashboard's existing "no invented values"
discipline.

## What graduates
1. **Production activity** card — output postings per day over the last 14 days,
   rendered as a token-driven SVG area+line chart with a 7-day-vs-prior-7-day
   trend chip. Source: `/api/production-actuals/history` (limit raised for this
   query only; the existing "Recent production" list query is untouched).
2. **Stock movement flow** card — inbound vs outbound postings per day over the
   last 14 days, rendered as grouped SVG bars with a legend. Source:
   `/api/stock/ledger` (separate trend query; the existing 3-row "Recent
   movements" query is untouched). Direction is derived from the page's existing
   single-source `MOVEMENT_REGISTRY` (no duplicated mapping).

Both charts are theme-aware (colour via `currentColor` + design tokens),
`prefers-reduced-motion` safe (draw-in gated), accessible (`role="img"` +
summarising `aria-label`, per-point native `<title>` tooltips), and degrade to
a calm empty state when there is no activity in the window.

## Scope
- `src/app/(shared)/dashboard/_lib/trends.ts` — NEW: pure, framework-free daily
  aggregation helpers (`lastNDays`, `dailyCounts`, `dailyFlow`, `trendDelta`).
- `src/app/(shared)/dashboard/_components/TrendChart.tsx` — NEW: presentational
  SVG `TrendAreaChart` + `MovementBars`. Owns no queries.
- `src/app/(shared)/dashboard/page.tsx` — add two trend queries, derive series
  via the helpers, render the two new cards in a trends band below the live
  blocks. Additive only; no existing panel/query changed.
- `tests/unit/features/dashboard-trends.test.ts` — NEW: lock the aggregation
  helpers (bucketing, window exclusion, in/out split, 7v7 delta).

## Manifest (files that may be touched)
manifest:
  - src/app/(shared)/dashboard/_lib/trends.ts
  - src/app/(shared)/dashboard/_components/TrendChart.tsx
  - src/app/(shared)/dashboard/page.tsx
  - tests/unit/features/dashboard-trends.test.ts
  - docs/portal-os/tranches/039-dashboard-data-viz.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Revive directives (if any)
revive: []

## Out-of-scope
- Any new backend endpoint, contract, schema, or proxy (wrong lane).
- Any change to existing dashboard queries/panels beyond the two additive cards.
- Summed mixed-UOM quantities (explicitly forbidden — counts only).
- Token / colour-system changes (charts consume existing tokens only).

## Tests / verification
- typecheck clean.
- full vitest green, including the new dashboard-trends spec.
- production build clean.

## Exit evidence
- one combined verification run (typecheck + vitest + build) pasted on the PR.

## Rollback
Revert the PR; the change is two additive presentational cards + two read-only
queries + one pure helper module + one test file.

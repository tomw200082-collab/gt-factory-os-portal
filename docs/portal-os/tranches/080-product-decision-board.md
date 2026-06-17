# Tranche 080: product-decision-board

status: landed-pending-review
created: 2026-06-16
landed: 2026-06-16
pr:
scorecard_target_category: economics_surface
expected_delta: +3 (new decision surface; margin×velocity quadrant; transparent add/drop recommendations)
sizing: M (1 new page, 1 new proxy route, 1 nav entry; no backend change)

## Why this tranche
Tom 2026-06-16 — the factory needs a financial decision tool that actually helps
decide which products to add, keep, reprice, or drop. The existing
`/admin/economics` page is an analyst-grade table for closing the books, not a
decision surface. Crucially, an add/drop decision needs **velocity** (what is
selling), which `/economics` alone does not expose — its 90-day P&L columns
(migration 0210 / tranche 026) were reverted in 0211 because the
measurement-completeness *framing* added "more complexity than insight." The
data was never the problem; the framing was.

This tranche reframes the same numbers as a **decision board**: a Star / Hidden
gem / Workhorse / Drag quadrant on margin × velocity, with transparent
recommendations. It is highest-ROI because it ships entirely portal-side over
two **existing, live** endpoints — zero backend change, no reopening of
0210/0211.

## Scope (new files only — nothing existing is rewritten)
- **New page** `src/app/(economics)/admin/decision-board/page.tsx` (URL
  `/admin/decision-board`, planner+admin via the `(economics)` layout gate):
  - KPI strip: profit pool (90d), losing-money count, can't-decide-yet count,
    top-3 contribution concentration.
  - Interactive zero-dependency SVG quadrant: X = units sold (90d), Y = margin
    %, bubble size = contribution, colour = decision. Hover/tap → Inspector.
  - Inspector panel: full per-product economics + the recommended action + a
    plain-language "why".
  - Ranked, filterable, sortable decision table (default sort: contribution
    desc). Filter chips per decision category with counts.
  - "How decisions are made" popover — the rules are explicit, never a black box.
- **New proxy** `src/app/api/orders/by-item-and-period/route.ts` — forwards to
  the existing `GET /api/v1/queries/orders/by-item-and-period` (velocity).
- **Nav** `src/lib/nav/manifest.ts` — one entry under Planning, beside Economics.

### Data sources (both already live; client-side join)
- `GET /api/economics` → COGS, margin (₪/%), confidence (`cogs_complete`),
  inventory value, manual sale price (`v_fg_economics`, post-0211 shape).
- `GET /api/orders/by-item-and-period?from=&to=&cadence=monthly` → units sold +
  order count per item per month (LionWheel mirror, resolved lines).
- Derived in-browser: `contribution_90d = margin_ils × units_90d`,
  `revenue_90d = sale_price × units_90d`. Products missing cost or price are
  classed "Needs data" and excluded from the quadrant — no ungrounded decisions.

### Decision rules (transparent, tunable constants in the page)
- Healthy margin ≥ 25%; thin < 10%.
- High velocity = units sold ≥ the factory's median among selling products
  (relative, adapts to scale).
- Star = healthy + high vel (protect) · Gem = healthy + low vel (promote) ·
  Workhorse = thin + high vel (reprice) · Drag = thin + low vel (review/drop) ·
  Losing money = margin < 0 (act now) · Not selling = 0 units in 90d.

### Out of scope
- No backend change (no migration, no view edit, no new endpoint).
- No edit/write actions on this surface (read-only decision view in v1).
- Automated sale-price snapshots (Wave 10B) — still uses manual price.
- Cash-flow / budget lenses — later layers of the wider CFO cockpit vision.

## Manifest (files that may be touched — portal repo)
manifest:
  - src/app/(economics)/admin/decision-board/page.tsx
  - src/app/api/orders/by-item-and-period/route.ts
  - src/lib/nav/manifest.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/080-product-decision-board.md
  - docs/portal-os/tranches/_active.txt

## Revive directives (if any)
revive: []

## Tests / verification
- typecheck clean (`npx tsc --noEmit`).
- manual: open `/admin/decision-board` as planner/admin; verify the quadrant
  plots priced+costed products, the KPI strip sums contribution, filter chips
  narrow the table, hover syncs Inspector + bubble highlight, and a product with
  no sale price shows under "Needs data" (not in the quadrant).
- velocity-down degradation: when `/api/orders/by-item-and-period` errors, a
  warning banner shows and margin/inventory remain accurate (no fabrication).

## Exit evidence
- typecheck summary.
- PR link (this tranche).

## Rollback
Delete the new page + proxy and revert the single nav-manifest entry. No
backend or shared-component changes to unwind.

## Operator approval
- [x] Tom 2026-06-16: "start … basic, highest ROI … amazing & interactive
  dashboard that helps make product decisions." Velocity-via-existing-endpoint
  path chosen after Tom rejected both velocity-blind and reopen-backend options.

## Actual evidence
- (to be filled at push: typecheck exit code, branch, PR link)

# Tranche 021: economics-p-and-l-coverage

status: landed-pending-review
created: 2026-05-24
landed: 2026-05-24
pr:
scorecard_target_category: economics_surface
expected_delta: +4 (coverage frame, demand-weighted sort, chip taxonomy split, honest inventory totals)
sizing: M (1 page file, large reframe; companion backend in gt-factory-os for the view+handler)

## Why this tranche
Tom 2026-05-24 — current Economics Overview shows "47 incomplete" without telling the operator which incomplete SKUs are actually selling. The operator can't tell whether the 47 represent ₪12K or ₪340K of revenue this quarter. Worse, the "Inventory at cost" tile silently excludes SKUs without COGS, so a number like ₪427K is missing whatever exposure the unpriced SKUs represent — a CFO-grade dashboard cannot silently drop data.

The reframe replaces "risk" language (forward-looking, fear-based) with "P&L coverage" language (retrospective, measurement-quality). Same data, different mental model: the page mission becomes "close the books on this quarter" rather than "prevent a future loss." That mission unifies the three tabs under one question viewed from three lenses (revenue-weighted, SKU-count, inventory) instead of three half-overlapping checklists.

## Scope

### Reframe (Overview tab only — Component Costs / Raw Materials untouched in this tranche)
- Replace top stat-tile band with a coverage-led layout:
  - **P&L Coverage Q (last 90d)** — primary tile. Two-axis: revenue% (`measured_revenue / measurable_revenue`) and SKU% (`measured_skus / active_skus_90d`). Both with absolute values underneath. Reads as a progress metric to drive toward 100%.
  - **FG inventory** — honest layout: `measured + unmeasured` decomposition instead of a silent-exclusion single number.
  - **Raw-material inventory** — unchanged (already accurate).
  - Removed: "Embedded margin in stock" (relegated to the table footer; not a headline metric under the coverage frame).
- Split the single chip row into two semantically distinct groups:
  - **Measurement status** (within 90d-active SKUs): Fully measured · Margin unmeasured (has revenue, no COGS) · Revenue unmeasured (no price set) · Not selling 90d.
  - **Findings** (within fully measured): Negative margin · Healthy margin.
  - Old single-row taxonomy (`complete/incomplete/no_snapshot/no_supplier_cost/no_sale_price/negative_margin`) is removed — overlapping categories collapse into the new orthogonal axes.
- New columns added to the table:
  - **Sold 90d** — quantity, sortable. `0` for inactive SKUs renders muted.
  - **Revenue 90d** — `qty_sold_90d × avg_sale_price_ils`. NULL renders "—" with tooltip "no price set".
- Default sort changes from `name asc` to `revenue_90d desc` — the largest measurement gaps surface first. Header reads "Sort by: largest first" so the user understands why.
- `SnapshotStatusBadge` gains a size axis: under the badge, render the unmeasured-revenue size (e.g., `₪294K @ risk` becomes `₪294K unmeasured`). For inactive SKUs (qty_sold_90d=0) the badge size shows "—" so the operator can dismiss them immediately.
- Cost-gaps drawer header gains a one-line context: "Margin unmeasured · ₪X in 90d revenue" so the operator sees the size of the gap before they start fixing.

### Out of scope
- Component Costs tab and Raw Materials tab UI — unchanged in this tranche (no chip changes, no new columns).
- Estimated margin band — needs a "similar products" definition; deferred to tranche 022 alongside cost-freshness.
- Bulk cost edit — deferred to tranche 024.
- Per-product recalc endpoint — deferred to tranche 024.
- Wave 10B automated sale-price snapshots — out of scope (orthogonal W1 work). This tranche continues using `manual_avg_sale_price_ils` as the price source; the view simply joins it to sold quantities.

## Companion backend changes (gt-factory-os repo — separate commit)
This portal tranche depends on these changes to `tomw200082-collab/gt-factory-os` on the same `claude/brave-rubin-SnYk1` branch, landed together:
- **Migration 0210** — `CREATE OR REPLACE VIEW private_core.v_fg_economics` adding three new columns at the end of the SELECT (additive only, existing column shape unchanged):
  - `qty_sold_90d` (qty_8dp, defaults to 0)
  - `order_count_90d` (integer, defaults to 0)
  - `revenue_90d_ils` (money_4dp, NULL when price not set)
  - Joined via `orders_mirror × orders_mirror_lines` with the verbatim inclusion predicates from `handler.byItemAndPeriod.ts` (retired_at IS NULL, resolution_status='resolved', item_id IS NOT NULL, lw_qty_ordered > 0).
- **pgTAP test 0210** — covers: view has new columns; qty_sold_90d sums only resolved, non-retired, in-window lines; revenue_90d_ils is NULL when avg_sale_price is NULL; 91-day-old order is excluded; unresolved line is excluded.
- **Handler update** — `api/src/economics/route.ts` adds the new columns to the SELECT and the EconomicsRow type.

## Manifest (files that may be touched — portal repo)
manifest:
  - src/app/(economics)/admin/economics/page.tsx

## Revive directives (if any)
revive: []

## Tests / verification
- typecheck clean (`npx tsc --noEmit`).
- backend pgTAP 0210 passes.
- manual against staging: open `/admin/economics`, verify the coverage tile shows two percentages with absolute values; verify chips split into two rows; verify default sort is by revenue 90d desc; verify a SKU with no sale price shows "Revenue unmeasured" chip and "—" in the Revenue column; verify the inventory tile shows both measured + unmeasured.

## Exit evidence
- typecheck summary.
- PR link (this tranche).
- PR link (companion backend tranche in gt-factory-os).
- Screenshot of the new Overview header band.

## Rollback
Revert the single tranche commit; the page reverts to the tranche 020 layout. The backend view migration is additive — if rolled back independently the portal degrades gracefully (the new columns become undefined and the coverage tile reads "—") but no error is raised. To fully roll back, also revert the gt-factory-os 0210 migration (a CREATE OR REPLACE that drops the three appended columns).

## Operator approval
- [x] Tom approves this plan (session directive 2026-05-24: shift framing from "Revenue at risk" to "P&L Coverage", dual coverage axis B, "no less than amazing").

## Actual evidence
- typecheck: `npx tsc --noEmit` → exit 0 (2026-05-24).
- backend companion: `tomw200082-collab/gt-factory-os` commit `c8eb10e` on `claude/brave-rubin-SnYk1` — migration 0210 + pgTAP test (13 assertions covering window predicates, distinct-mirror counts, NULL revenue when price absent, IDLE defaults, NULL-item-id exclusion) + handler update.
- portal diff scope: 1 source file (`src/app/(economics)/admin/economics/page.tsx`), tranche manifest, `_active.txt` → 021.
- branch: `claude/brave-rubin-SnYk1`.
- new components: `CoverageTile`, `CoverageAxis`, `CoverageAxisSkeleton`, `InventoryHonestTile`, `MeasurementCell`, `classifyMeasurement`, `isActive90d`, `coverageTone`.
- removed components: `SnapshotStatusBadge` (replaced by `MeasurementCell` with size + action).
- chip taxonomy: `OVERVIEW_STATUS_DEFS` (6 overlapping) → `OVERVIEW_MEASUREMENT_DEFS` (4 orthogonal) + `OVERVIEW_FINDING_DEFS` (3 within-measurable).
- table reorder: added `revenue_90d` (default sort, desc) + `sold_90d` columns; dropped per-row `inv_sale` and `snapshot` columns (snapshot timestamp moved to `MeasurementCell` tooltip; inventory-at-sale remains in tfoot total). Net column count unchanged.

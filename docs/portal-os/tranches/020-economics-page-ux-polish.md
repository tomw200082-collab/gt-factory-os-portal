# Tranche 020: economics-page-ux-polish

status: active
created: 2026-05-24
scorecard_target_category: economics_surface
expected_delta: +3 (filtering, drill-down, publish affordance)
sizing: M (1 page file, large diff)

## Why this tranche
The Economics page is the planner/admin command surface for COGS, sale price, and inventory valuation, but the current iteration has three operator-pain gaps Tom flagged in the 2026-05-24 session: (1) no professional classification/filtering across the three tabs — only a free-text search on Component Costs, nothing on Overview or Raw Materials; (2) when a product's COGS is incomplete, the editor can see the count of missing components in a tooltip but has no in-page way to drill in, see what's missing with names, edit each one inline, and trigger a recalculate scoped to that product; (3) on Component Costs the only "publish" path after a fallback edit is the global Run Snapshot Now button or waiting for the 04:00 UTC cron — there is no clear affordance saying "your edit affects N products, recalc them now."

## Scope
- Add a shared `<FilterChipBar>` (chip-style toggles + counts + clear-all + visible-row counter) and instantiate it on each of the three tabs:
  - Overview: status chips (Complete / Incomplete / No snapshot / Missing supplier cost / No sale price / Negative margin) + product text search.
  - Component Costs: cost-source chips (Primary supplier / Fallback / Missing / Recipe rollup) + class chip (RM / PKG / SEMI / FG) + Zero-cost only. Existing text search retained.
  - Raw Materials: item-type chips (RM / PKG) + cost-source chips + Zero-cost only + Has-stock-only. Text search added.
- Add a "Cost gaps" drill-down on Overview rows for any product where `cogs_complete` is false:
  - Inline "Open gaps" affordance per row that opens the existing `<Drawer>` primitive.
  - Drawer body lists the product's `missing_cost_components` enriched with `component_name` + `component_class` + `cost_source` from the Component Costs query (already fetched), each row carrying the same inline `CostEditCell` so editors can publish a fallback cost without leaving the drawer.
  - Drawer footer offers "Recalc this product" (calls existing POST /api/economics/recalculate — recalculates all; surfaces a sticky note that "next-edit-then-recalc" is the canonical flow until a per-item recalc endpoint is added in a later W1 tranche).
  - Per Tom's directive 2026-05-24, drawer shows only the missing components (no full BOM walk — keeps the change frontend-only, no backend contract changes).
- "Publish" affordance on Component Costs:
  - Replace the passive "Cost saved. New COGS will recalculate tonight at 04:00 UTC" line with a sticky toast that contains a primary "Recalc affected products now" button. Clicking it fires the recalc mutation and surfaces a per-run banner with items_complete / items_missing counts.
- UX/UI sweep applied uniformly to all three tabs:
  - Sortable column headers (click to cycle asc/desc/clear) with a visual arrow + aria-sort.
  - Sticky table header inside the overflow container so totals/headers do not scroll off on long lists.
  - Empty states standardized to the existing "border + bg-subtle + centered text + CTA" pattern already used on Overview.
  - `dir="auto"` on every product/component name cell (Hebrew + English mix).
  - `tabular-nums` on every numeric column (audit existing cells).
  - Mobile-friendly chip wrap (`flex-wrap gap-2 -mx-1`).
  - Role-gate hints already in place; verify each disabled control has a tooltip explaining the gate.

## Manifest (files that may be touched)
manifest:
  - src/app/(economics)/admin/economics/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- New backend endpoints (per-product recalc, full BOM-with-costs query). Both would require W1 backend work; explicitly deferred to a future tranche.
- Changes to migrations, the v_fg_economics view, or the cogs-rollup logic.
- Edits to the (admin)/admin/components page (separate surface; same patterns can be ported later).
- Mobile-only layouts beyond chip-wrap; the page remains desktop-first.

## Tests / verification
- typecheck clean.
- manual: load /admin/economics, exercise each chip on each tab, open a gaps drawer on an incomplete product, edit a fallback cost in the drawer, recalc the product, observe the COGS row refresh.
- regression-sentinel: no baseline regressions.

## Exit evidence
- typecheck summary pasted below post-execution.
- PR link.

## Rollback
Revert the single tranche commit; the page reverts to the existing 3-tab layout with no schema impact.

## Operator approval
- [x] Tom approves this plan (session directive 2026-05-24: "תשפר את הדף ECONOMICS" + multi-select confirming A+B+C+D scope and missing-only drawer).

## Actual evidence
Filled in post-land.

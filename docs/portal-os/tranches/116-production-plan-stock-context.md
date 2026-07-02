# Tranche 116: production-plan stock-timing context strip

status: proposed
created: 2026-07-02
scorecard_target_category: flow_continuity
expected_delta: +0 on flow_continuity (category is 10/10; this closes the F1-adjacent decision gap from docs/ux/production-plan-backend-requirements-2026-06-25.md without backend work — value is operator decision quality, tracked via exit evidence)
sizing: M  (6 files)

## Why this tranche

The planner picks WHAT and WHEN to produce on `/planning/production-plan` blind:
the ManualAdd modal shows a bare product `<select>` and the job card shows only
the planned quantity. The two failure modes Tom named are stockout (produced too
late) and overproduction (produced too much / double-planned). Every variable
needed to answer both already ships in the `/api/inventory/flow` response —
this tranche surfaces five of them at the exact moment of decision. No backend
changes, no new endpoints, no raw-materials scope.

## The five locked variables (per selected item)

| # | Label (English — surface is NOT in the Hebrew exception list) | Source field | Answers |
|---|---|---|---|
| 1 | `On hand now` | `FlowItem.current_on_hand` | starting point |
| 2 | `Runs out` + derived `Produce by` (= stockout − 1 day) | `FlowItem.stockout_at_day_with_production` (fallback `earliest_stockout_date` when the optional field is absent) | the real deadline — already includes existing planned runs; the −1 day matches the server's +1-day production-inflow lag (`FlowDay.inflow_from_production`) |
| 3 | `Daily demand` | `demandSum14(item) / 14` (helper already exported from `inventory-flow/_lib/production-lens.ts`) | converts qty ↔ days |
| 4 | `Cover after this run` | modal (preview, live while qty is typed): `(projectedOnHandAt(item, plan_date) + qty) / dailyRate`. Card (plan already saved → projection already includes it): `FlowItem.days_cover_with_production` verbatim | the overproduction brake |
| 5 | `Already covered by planned production` chip | `coveredByPlan(item)` (already exported from `production-lens.ts`) | the double-planning trap |

`projectedOnHandAt(item, isoDate)` = `days.find(d => d.day === isoDate)?.projected_on_hand_eod_with_production ?? null` (56-day horizon; null ⇒ date beyond window).

## Scope

- **New pure lib** `src/app/(planning)/planning/production-plan/_lib/stock-context.ts` — no React/DOM/fetch (repo convention, mirrors `production-lens.ts`):
  - `findFlowItem(flow: FlowResponse | undefined, itemId: string | null): FlowItem | null`
  - `dailyDemandRate(item: FlowItem): number` — `demandSum14(item) / 14`
  - `projectedOnHandAt(item: FlowItem, isoDate: string): number | null`
  - `coverAfterRun(onHandAtDate: number, qty: number, dailyRate: number): number | null` — returns `null` when `dailyRate <= 0` (render as "No demand recorded in the next 14 days" — itself an overproduction signal)
  - `produceByDate(stockoutIso: string): string` — stockout minus 1 calendar day (reuse `addDays` from `../_lib/helpers`)
  - `buildStockContext(item, planDate, previewQty | null)` → one view-model object consumed by the component; re-export/wrap `coveredByPlan` from `../../inventory-flow/_lib/production-lens` (relative import within the `(planning)` route group — types from `../../inventory-flow/_lib/types`)
- **New component** `src/app/(planning)/planning/production-plan/_components/ItemStockContext.tsx`:
  - Props: `{ itemId: string | null; planDate: string; previewQty: number | null; mode: "preview" | "card" }`
  - Data: `useInventoryFlow({})` from `../../inventory-flow/_lib/useInventoryFlow` — **same queryKey `["inventory-flow", {}]` as the inventory-flow page** ⇒ warm-cache + localStorage-seed reuse, 60s background refetch, zero new endpoints. Do NOT pass params (a different params object is a different cache entry and forfeits the shared cache).
  - Renders one compact strip (styling register of `InventoryImpactPanel`: `text-xs`, `tabular-nums`, `chip`, existing tone tokens; `fmtQty` from `../_lib/helpers` for numbers). Rows: variables 1–4 + chip 5 + a `Stock details →` link to `/planning/inventory-flow`.
  - States (all required): `itemId == null` → render nothing · flow loading → 2 skeleton rows (`animate-pulse`, matches InventoryImpactPanel) · flow error or item not found in response → single muted line `No stock projection available for this item.` (no retry button — the shared query self-refetches) · `projectedOnHandAt` null (date beyond 56-day horizon) → show rows 1–3 + `Beyond the 8-week forecast window` in place of row 4 · no stockout in horizon (`stockout_at_day_with_production` null AND `days_cover_with_production` = 56 sentinel) → row 2 reads `No stockout in the next 8 weeks`.
  - `data-testid="item-stock-context"`.
- **Wire into ManualAddModal** (`page.tsx`): render `<ItemStockContext mode="preview" itemId={itemId || null} planDate={planDate} previewQty={parseFloat(qty) > 0 ? parseFloat(qty) : null} />` directly under the Product `<select>` label block. Row 4 updates live as the planner types the quantity.
- **Wire into the job card** via `InventoryImpactPanel.tsx` (NOT a new always-visible card element — the panel is the card's existing inventory home and is already lazily gated on `open`): render `<ItemStockContext mode="card" itemId={plan.item_id} planDate={plan.plan_date} previewQty={null} />` above the existing "+X to finished goods" banner. Base-batch plans (`item_id === null`) naturally render nothing.
- **Warm the cache**: call the existing `usePrefetchInventoryFlow({})` once in `ProductionPlanPage` (`page.tsx`) — the hook was built for exactly this (cold upstream SQL ≈ 22s; prefetch hides it before the planner opens the modal).

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/production-plan/_lib/stock-context.ts
  - src/app/(planning)/planning/production-plan/_lib/stock-context.test.ts
  - src/app/(planning)/planning/production-plan/_components/ItemStockContext.tsx
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/InventoryImpactPanel.tsx
  - docs/portal-os/tranches/116-production-plan-stock-context.md

## Revive directives (if any)
revive: []

## Out-of-scope
- Raw-material availability vs on-hand (Tom-excluded explicitly, 2026-07-02).
- Daily capacity anchor + recommendation rationale (backend-blocked F3/F4 — docs/ux/production-plan-backend-requirements-2026-06-25.md).
- Any over-cover / target-cover threshold coloring on row 4 — displaying the number is honest; a threshold is policy Tom has not set. Plain number only.
- Always-visible risk chip on the card face (stays inside the impact disclosure).
- New API routes, changes under `src/app/api/**`, changes to `inventory-flow/**` (read-only imports from its `_lib` only).
- Hebrew labels — surface is English-first per portal CLAUDE.md (not in the exception list).

## Tests / verification
- typecheck clean (`npx tsc --noEmit`)
- vitest: src/app/(planning)/planning/production-plan/_lib/stock-context.test.ts — cover: item found/missing; dailyRate 0 → coverAfterRun null; projectedOnHandAt hit / date-out-of-horizon null; produceByDate = stockout − 1d; 56-day no-stockout sentinel; coveredByPlan passthrough true/false
- vitest: full existing suite stays green (notably `_lib/*.test.ts`, `_components/card-*.test.tsx` in production-plan)
- playwright: no existing production-plan spec (verified — closest is production-actual-real.spec.ts); no new e2e in this tranche; `inventory-flow-smoke.spec.ts` must stay green (shared hook untouched, import-only)
- regression-sentinel: no baseline regressions

## Exit evidence
- Screenshot: ManualAddModal with an item selected — strip visible, row 4 changing with typed qty
- Screenshot: job card impact panel open with the context strip above the FG banner
- vitest N/N pass counts pasted
- PR link

## Rollback
Revert the PR — two edited files regain their prior state, three files are new and deleted by the revert; no data-layer or shared-hook changes, so revert is clean.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 116` on the PR)

## Actual evidence (filled in by /portal-tranche-fix run)
<pasted after execution>

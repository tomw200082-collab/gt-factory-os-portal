"use client";

// ItemStockContext — the production-timing decision strip (Tranche 116,
// Tom-directed 2026-07-02): "when is it smart to produce this?" answered by
// five numbers, all already served by /api/inventory/flow. No raw materials,
// no backend changes — see docs/portal-os/tranches/116-production-plan-stock-context.md.
//
// Two call sites, one component: ManualAddModal passes mode="preview" with
// the live-typed quantity (row 4 recomputes as the planner types); the job
// card's InventoryImpactPanel passes mode="card" with previewQty=null (the
// plan is already saved, so the server projection already includes it —
// re-adding the qty would double-count).

import Link from "next/link";
import { useMemo } from "react";
import { Boxes } from "lucide-react";
import { useInventoryFlow } from "../../inventory-flow/_lib/useInventoryFlow";
import {
  fmtDate,
  formatDaysCover,
  fmtQty as fmtNumber,
} from "../../inventory-flow/_lib/format";
import { buildStockContext, findFlowItem } from "../_lib/stock-context";

export function ItemStockContext({
  itemId,
  planDate,
  previewQty,
  mode,
}: {
  itemId: string | null;
  planDate: string;
  /** Quantity currently typed (preview) or null (card — already saved). */
  previewQty: number | null;
  mode: "preview" | "card";
}) {
  const flowQuery = useInventoryFlow({});

  const item = useMemo(
    () => findFlowItem(flowQuery.data, itemId),
    [flowQuery.data, itemId],
  );

  if (!itemId) return null;

  if (flowQuery.isLoading) {
    return (
      <div className="mt-2 space-y-1.5" data-testid="item-stock-context" aria-busy="true">
        <div className="h-4 w-full animate-pulse rounded bg-bg-subtle" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-bg-subtle" />
      </div>
    );
  }

  if (flowQuery.isError || !item) {
    return (
      <div className="mt-2 text-3xs text-fg-muted" data-testid="item-stock-context">
        No stock projection available for this item.
      </div>
    );
  }

  const ctx = buildStockContext(item, planDate, previewQty);

  // In preview mode with nothing typed yet, row 4 still shows a real number
  // (the item's current cover, before this run) — annotate it as the
  // baseline so it doesn't read as "the effect of this run".
  const isLiveOverride = mode === "preview" && previewQty !== null && previewQty > 0;
  const showBaselineHint =
    mode === "preview" && !isLiveOverride && !ctx.beyondHorizon && ctx.coverAfterRunDays !== null;

  const coverFmt = formatDaysCover(ctx.coverAfterRunDays);

  return (
    <div
      className="mt-2 rounded border border-info/30 bg-info-softer/20 p-2 space-y-1"
      data-testid="item-stock-context"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">On hand now</span>
        <span className="font-semibold tabular-nums text-fg-strong">
          {fmtNumber(ctx.onHandNow)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-fg-muted shrink-0">Runs out</span>
        {ctx.hasStockoutInHorizon ? (
          <span className="text-right font-semibold tabular-nums text-warning-fg">
            {fmtDate(ctx.stockoutDate)}
            {ctx.produceBy && (
              <span className="block font-normal text-3xs text-fg-muted">
                produce by {fmtDate(ctx.produceBy)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-success-fg">No stockout in the next 8 weeks</span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">Daily demand</span>
        <span className="tabular-nums text-fg">{fmtNumber(ctx.dailyRate)} / day</span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-fg-muted shrink-0">Cover after this run</span>
        {ctx.beyondHorizon ? (
          <span className="text-right text-fg-faint">Beyond the 8-week forecast window</span>
        ) : ctx.coverAfterRunDays === null ? (
          <span className="text-right text-fg-faint">No demand recorded in the next 14 days</span>
        ) : (
          <span className="text-right font-semibold tabular-nums text-fg-strong">
            {coverFmt.value}
            {coverFmt.sub && <span className="ml-0.5 font-normal text-fg-muted">{coverFmt.sub}</span>}
            {showBaselineHint && (
              <span className="block font-normal text-3xs text-fg-muted">current, before this run</span>
            )}
          </span>
        )}
      </div>

      {ctx.coveredByPlan && (
        <div className="chip chip-warning gap-1 text-[10px]" data-testid="chip-covered-by-plan">
          <Boxes className="h-2.5 w-2.5" strokeWidth={2.5} />
          Already covered by planned production
        </div>
      )}

      <Link
        href="/planning/inventory-flow"
        className="block pt-0.5 text-[10px] text-accent hover:underline"
      >
        Stock details →
      </Link>
    </div>
  );
}

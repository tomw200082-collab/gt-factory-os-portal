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
//
// Post-/ux-release-gate fixes (2026-07-02, zero P0s found): no outbound link
// (both call sites already have other paths to /planning/inventory-flow —
// the page's own secondary nav and, in card mode, InventoryImpactPanel's own
// "Check stock levels" link — and a link here risked silently discarding an
// in-progress ManualAddModal's typed qty/notes on navigation); loading/error/
// loaded states share one stable wrapper so aria-live announces the
// transition; error vs. item-not-found are distinct, with a retry action on
// the former.

import { useMemo } from "react";
import { RefreshCw, Boxes } from "lucide-react";
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

  return (
    <div
      className="rounded border border-info/30 bg-info-softer/20 p-2 space-y-1"
      data-testid="item-stock-context"
      aria-live="polite"
      aria-busy={flowQuery.isLoading || undefined}
    >
      {flowQuery.isLoading ? (
        <div className="space-y-1.5">
          <div className="h-4 w-full animate-pulse rounded bg-bg-subtle" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-bg-subtle" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-bg-subtle" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-bg-subtle" />
        </div>
      ) : flowQuery.isError ? (
        <div className="flex items-center justify-between gap-2 text-3xs text-fg-muted">
          <span>Stock data couldn&apos;t load — it will refresh in a moment.</span>
          <button
            type="button"
            onClick={() => void flowQuery.refetch()}
            className="inline-flex shrink-0 items-center gap-1 text-accent hover:underline"
            data-testid="item-stock-context-retry"
          >
            <RefreshCw className="h-2.5 w-2.5" strokeWidth={2.5} />
            Try again
          </button>
        </div>
      ) : !item ? (
        <div className="text-3xs text-fg-muted">
          This item isn&apos;t yet tracked in inventory flow.
        </div>
      ) : (
        (() => {
          const ctx = buildStockContext(item, planDate, previewQty);
          // In preview mode with nothing typed yet, row 4 still shows a real
          // number (the item's current cover, before this run) — annotate it
          // as the baseline so it doesn't read as "the effect of this run".
          const isLiveOverride = mode === "preview" && previewQty !== null && previewQty > 0;
          const showBaselineHint =
            mode === "preview" &&
            !isLiveOverride &&
            !ctx.beyondHorizon &&
            ctx.coverAfterRunDays !== null;
          const coverFmt = formatDaysCover(ctx.coverAfterRunDays);

          return (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-muted">On hand now</span>
                <span className="font-semibold tabular-nums text-fg-strong">
                  {fmtNumber(ctx.onHandNow)}
                </span>
              </div>

              <div className="flex items-start justify-between gap-2 text-xs">
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

              <div className="flex items-start justify-between gap-2 text-xs">
                <span className="text-fg-muted shrink-0">Cover after this run</span>
                {ctx.beyondHorizon ? (
                  <span className="text-right text-fg-faint">Beyond the 8-week forecast window</span>
                ) : ctx.coverAfterRunDays === null ? (
                  <span className="text-right text-fg-faint">
                    No demand in the next 14 days — this stock may sit unused
                  </span>
                ) : (
                  <span className="text-right font-semibold tabular-nums text-fg-strong">
                    {coverFmt.value}
                    {coverFmt.sub && <span className="ml-0.5 font-normal text-fg-muted">{coverFmt.sub}</span>}
                    {showBaselineHint && (
                      <span className="block font-normal text-3xs text-fg-muted">
                        today&apos;s cover · no quantity entered yet
                      </span>
                    )}
                  </span>
                )}
              </div>

              {ctx.coveredByPlan && (
                <div className="chip chip-info gap-1 text-[10px]" data-testid="chip-covered-by-plan">
                  <Boxes className="h-2.5 w-2.5" strokeWidth={2.5} />
                  Already covered by planned production
                </div>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}

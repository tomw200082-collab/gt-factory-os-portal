"use client";

// ---------------------------------------------------------------------------
// WeekCell — weekly cell for weeks 3..N in the desktop grid.
//
// Polish 2026-05-05 (grid body pass):
//   - Composite 2-row layout: top = EOD numeral (right-aligned, semibold);
//     bottom = stockout indicator with calendar icon (more glanceable than
//     plain "Stockout d{N}" text per Refactoring UI iconography guidance).
//   - Vertical depth gradient overlay (`.cell-depth`) — Stripe/Linear-grade
//     subtle 8% gradient instead of flat tier fill.
//   - Hover ring matches DayCell exactly (1px inset accent, 80ms ease-out).
//
// Width inherits from the grid track (`var(--week-col-w)` 96px) — no fixed
// wrapper. Pixel-aligns with the weekly column headers in DayHeaderRow.
//
// Performance: wrapped in React.memo. ~6 weekly cells × 68 items ≈ 408
// instances; combined with 952 DayCells under the same tree, memoization
// keeps the parent re-render cost near-zero when filter / search state
// changes.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtQty } from "../_lib/format";
import { weekCellClassNameProduction } from "../_lib/risk";
import type { FlowWeek } from "../_lib/types";
import { PlannedChip } from "./PlannedChip";

interface WeekCellProps {
  week: FlowWeek;
  /** When true, render aggregated planned-inflow chip for this week. */
  overlayEnabled?: boolean;
  /** Sum of planned_remaining_qty across (item, day) rows in this ISO-week. */
  plannedRemainingQty?: number;
  /** UoM hint for tooltip on the chip. */
  sales_uom?: string | null;
}

function WeekCellInner({
  week,
  overlayEnabled = false,
  plannedRemainingQty = 0,
  sales_uom = null,
}: WeekCellProps) {
  // Polish A v3 review (2026-05-04) — prefer the production-aware
  // stockout day. Falls back to the production-blind `stockout_day` when
  // the API hasn't shipped the new field yet (defensive against
  // deployment ordering).
  const stockoutDay =
    week.stockout_day_with_production !== undefined
      ? week.stockout_day_with_production
      : week.stockout_day;
  let stockoutDayNum: number | null = null;
  if (stockoutDay) {
    try {
      stockoutDayNum = new Date(`${stockoutDay}T00:00:00`).getDate();
    } catch {
      stockoutDayNum = null;
    }
  }
  const minOnHand =
    week.min_on_hand_with_production != null
      ? week.min_on_hand_with_production
      : week.min_on_hand;
  const hasProductionAwareStockout =
    week.stockout_day_with_production != null;

  const showPlannedChip = overlayEnabled && plannedRemainingQty > 0;
  const isStockoutWeek =
    week.tier === "stockout" || hasProductionAwareStockout;

  return (
    <div
      role="gridcell"
      tabIndex={0}
      data-week={week.week_start}
      data-testid="week-cell"
      className={cn(
        "group relative flex h-full w-full flex-col items-stretch",
        "border-l border-r border-border/30 px-1.5 text-xs tabular-nums",
        "cell-hover-ring",
        weekCellClassNameProduction(
          week.cell_tier_with_production,
          week.tier,
          hasProductionAwareStockout,
        ),
      )}
      title={`Week of ${week.week_start} — min on-hand ${fmtQty(minOnHand)}`}
    >
      {/* Depth gradient overlay — subtle 8% vertical fade for modern
          dashboard depth without flattening the tier fill. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 cell-depth"
      />

      {/* ---------- Top row: EOD numeral (right-aligned, semibold) -------- */}
      <div className="relative z-[1] flex flex-1 items-end justify-end pt-1">
        <span
          className={cn(
            "leading-none tabular-nums",
            // The week reading should feel quietly authoritative — bigger
            // than a day cell number, semibold so it anchors the cell.
            isStockoutWeek ? "text-[14px] font-bold" : "text-[13px] font-semibold",
          )}
        >
          {fmtQty(minOnHand)}
        </span>
      </div>

      {/* ---------- Bottom row: stockout day with calendar icon ----------- */}
      <div className="relative z-[1] flex h-[14px] items-center justify-end gap-0.5 pb-0.5">
        {stockoutDayNum != null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] uppercase tracking-sops leading-none",
              isStockoutWeek ? "opacity-90 font-medium" : "opacity-75",
            )}
            aria-label={`Stockout day ${stockoutDayNum}`}
          >
            <Calendar
              className="h-2 w-2 shrink-0"
              strokeWidth={2.5}
              aria-hidden
            />
            <span className="tabular-nums">d{stockoutDayNum}</span>
          </span>
        ) : (
          <span aria-hidden className="text-[9px] opacity-0">
            &nbsp;
          </span>
        )}
      </div>

      {/* Aggregated planned-inflow chip (week sum). Bottom-left so the
          existing center column visualization stays uncluttered. */}
      {showPlannedChip ? (
        <PlannedChip
          qty={plannedRemainingQty}
          uom={sales_uom}
          variant="week"
          className="bottom-0.5 left-0.5 right-auto"
        />
      ) : null}
    </div>
  );
}

export const WeekCell = memo(WeekCellInner);

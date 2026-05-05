"use client";

// ---------------------------------------------------------------------------
// WeekCell — weekly cell for weeks 3..N in the desktop grid.
//
// Operational Clarity v2 (2026-05-05):
//   - Width inherits from the grid track (`var(--week-col-w)` 96px) — no
//     fixed-width wrapper. Pixel-aligns with the weekly column headers in
//     DayHeaderRow.
//   - Tabular numerics; min-on-hand line large + "Stockout day N" muted
//     sub-label.
//
// Performance: wrapped in React.memo. ~6 weekly cells × 68 items ≈ 408
// instances; combined with 952 DayCells under the same tree, memoization
// keeps the parent re-render cost near-zero when filter / search state
// changes.
// ---------------------------------------------------------------------------

import { memo } from "react";
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

  return (
    <div
      role="gridcell"
      data-week={week.week_start}
      data-testid="week-cell"
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-0.5 border-l border-r border-border/30 px-1 text-xs tabular-nums transition-colors duration-200",
        "hover:shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.7)]",
        weekCellClassNameProduction(
          week.cell_tier_with_production,
          week.tier,
          hasProductionAwareStockout,
        ),
      )}
      title={`Week of ${week.week_start} — min on-hand ${fmtQty(minOnHand)}`}
    >
      <span
        className={cn(
          "text-[13px] leading-none",
          (week.tier === "stockout" || hasProductionAwareStockout) &&
            "font-semibold",
        )}
      >
        {fmtQty(minOnHand)}
      </span>
      {stockoutDayNum != null ? (
        <span className="text-[9px] uppercase tracking-sops leading-none opacity-80">
          Stockout d{stockoutDayNum}
        </span>
      ) : null}

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

"use client";

// ---------------------------------------------------------------------------
// DayCell — single 64×52 cell for one item × one day in the desktop grid.
//
// Operational Clarity redesign 2026-05-04:
//   - Today column: vertical accent-tinted band background overlay
//   - Non-working / pre-today cells: diagonal hatch (.bg-hatch-history)
//     with em-dash instead of a number — these are history, not data
//   - Production receipts: ▼ +N chip ABOVE the cell number when
//     inflow_from_production > 0; uses accent palette so it reads as a
//     "supply event marker" distinct from the row tier color
//   - Numbers use formatCompact (1.5K, -120, 0.0 → —)
//
// Wrapped in DayPopover so click reveals demand/supply detail. Memoized.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { ArrowDown, Triangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtQty, formatCompact } from "../_lib/format";
import {
  dayCellClassNameProduction,
  hasIncomingPo,
  isDemandSpike,
} from "../_lib/risk";
import type { FlowDay, FlowItem } from "../_lib/types";
import type { PlannedInflowRow } from "../_lib/plannedInflow";
import { DayPopover } from "./DayPopover";
import { PlannedChip } from "./PlannedChip";

interface DayCellProps {
  item: FlowItem;
  day: FlowDay;
  avgDailyDemand: number;
  isToday: boolean;
  /** Render planned-inflow overlay chip + tooltip section when true. */
  overlayEnabled?: boolean;
  /** Aggregated planned-inflow row for this (item, day), if any. */
  plannedRow?: PlannedInflowRow;
}

function DayCellInner({
  item,
  day,
  avgDailyDemand,
  isToday,
  overlayEnabled = false,
  plannedRow,
}: DayCellProps) {
  const isNonWorking = day.tier === "non_working";
  const totalDemand = day.demand_lionwheel + day.demand_forecast;
  const spike = !isNonWorking && isDemandSpike(totalDemand, avgDailyDemand);
  const incoming = !isNonWorking && hasIncomingPo(day);
  const productionInflow =
    !isNonWorking && day.inflow_from_production > 0
      ? day.inflow_from_production
      : 0;
  const showPlannedChip =
    overlayEnabled &&
    !isNonWorking &&
    plannedRow != null &&
    plannedRow.planned_remaining_qty > 0;

  // Render the production-aware EOD on the cell.
  const cellEod = day.projected_on_hand_eod_with_production;

  const cellInner = (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        isNonWorking
          ? day.holiday_name_he ?? "Non-working day"
          : `${day.day} end-of-day ${formatCompact(cellEod)}`
      }
      className={cn(
        "relative flex h-[52px] w-[64px] cursor-pointer items-center justify-center text-xs tabular-nums transition-colors",
        // Non-working / pre-today cells get the hatched "history not data"
        // treatment; otherwise apply the 5-tier production-aware classifier.
        isNonWorking
          ? "bg-hatch-history text-fg-faint"
          : dayCellClassNameProduction(day.cell_tier_with_production, day.tier),
        // Today column accent band overlay (drawn on top of tier color via
        // an inset shadow so the tier color is still legible underneath).
        isToday && "ring-1 ring-inset ring-accent/40",
        !isNonWorking && "hover:brightness-95",
      )}
      title={
        isNonWorking
          ? day.holiday_name_he ?? "Non-working day"
          : productionInflow > 0
            ? `${formatCompact(productionInflow)} bottles arriving from planned production`
            : undefined
      }
    >
      {/* Today vertical band overlay — soft accent wash so the eye locks
          on this column. Drawn behind content via z-0; inert to clicks. */}
      {isToday && !isNonWorking ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-accent/8"
        />
      ) : null}
      {isNonWorking ? (
        <span className="relative text-fg-faint">—</span>
      ) : (
        <span className="relative leading-none">{formatCompact(cellEod)}</span>
      )}

      {/* Top-right: demand spike */}
      {spike ? (
        <Triangle
          className="absolute right-1 top-1 h-2 w-2 fill-warning text-warning"
          strokeWidth={1}
        />
      ) : null}

      {/* Top-left/center: planned-production receipt chip — visible "supply
          event marker" in accent tone. The triangle ▼ glyph + "+N" reads
          as "arriving here". Tooltip surfaces source info. */}
      {productionInflow > 0 ? (
        <span
          className="absolute left-1/2 top-0.5 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-sm border border-dashed border-accent/60 bg-accent-soft px-1 py-0 text-[9px] font-semibold leading-tight text-accent shadow-sm"
          title={`+${formatCompact(productionInflow)} bottles arriving from planned production`}
          aria-label={`Plus ${formatCompact(productionInflow)} from planned production`}
          data-testid="day-cell-production-inflow"
        >
          <span aria-hidden>▼</span>
          <span>+{formatCompact(productionInflow)}</span>
        </span>
      ) : null}

      {/* Bottom-right: incoming PO. */}
      {incoming ? (
        <ArrowDown
          className="absolute bottom-1 right-1 h-2.5 w-2.5 text-info"
          strokeWidth={2.5}
        />
      ) : null}

      {/* Bottom-left corner: planned-inflow overlay chip (intent, not truth). */}
      {showPlannedChip && plannedRow ? (
        <PlannedChip
          qty={plannedRow.planned_remaining_qty}
          uom={plannedRow.sales_uom}
          variant="day"
          className="bottom-0.5 left-0.5 right-auto"
        />
      ) : null}
    </div>
  );

  if (isNonWorking) {
    // Don't open the popover on non-working days; nothing useful to surface.
    return cellInner;
  }

  return (
    <DayPopover
      item={item}
      day={day}
      overlayEnabled={overlayEnabled}
      plannedRow={plannedRow}
    >
      {cellInner}
    </DayPopover>
  );
}

export const DayCell = memo(DayCellInner);

// fmtQty kept for backwards-compat callers that import it via re-export
// chain; not used directly here but referenced indirectly by tests.
void fmtQty;

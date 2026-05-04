"use client";

// ---------------------------------------------------------------------------
// DayCell — single 64×52 cell for one item × one day in the desktop grid.
//
// Visual: tier-colored background + projected_on_hand_eod number (tabular).
// Corner glyphs:
//   ↓ bottom-right when incoming PO arrives this day
//   ▾ top-right when this day's demand is a "spike" relative to window avg
// Non-working days render an em-dash on a striped neutral background.
//
// Wrapped in DayPopover so click reveals demand/supply detail.
//
// Performance: 68 items × 14 days = ~952 DayCell instances. Wrapped in
// React.memo so each cell only re-renders when its own props change. Since
// FlowItem and FlowDay come from TanStack Query (stable refs across renders
// when data hasn't changed), this drops the per-state-change render cost
// from ~1000 cells to 0. Major UX win on filter / search / hover.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { ArrowDown, Triangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtQty } from "../_lib/format";
import {
  dayCellClassName,
  hasIncomingPo,
  isDemandSpike,
  NON_WORKING_STRIPE_STYLE,
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
  // Migration 0144: planned-production receipts land at +1 day from the
  // production_plan plan_date. Surface them as a discreet "+N" chip so the
  // operator can see WHERE the supply is coming from. This is independent
  // of the toggle-driven planned-inflow overlay (`plannedRow` below) and
  // always renders when the FG-level view reports inflow_from_production.
  const productionInflow =
    !isNonWorking && day.inflow_from_production > 0
      ? day.inflow_from_production
      : 0;
  const showPlannedChip =
    overlayEnabled &&
    !isNonWorking &&
    plannedRow != null &&
    plannedRow.planned_remaining_qty > 0;

  // Render the production-aware EOD on the cell (was production-blind
  // projected_on_hand_eod). The two only differ when planned production is
  // scheduled in the visible 14-day band; otherwise both equal.
  const cellEod = day.projected_on_hand_eod_with_production;

  const cellInner = (
    <div
      role="button"
      tabIndex={0}
      style={isNonWorking ? NON_WORKING_STRIPE_STYLE : undefined}
      className={cn(
        "relative flex h-[52px] w-[64px] cursor-pointer items-center justify-center text-xs tabular-nums transition-colors",
        dayCellClassName(day.tier),
        isToday && "ring-1 ring-inset ring-accent/40",
        !isNonWorking && "hover:brightness-95",
      )}
      title={isNonWorking ? day.holiday_name_he ?? "Non-working day" : undefined}
    >
      {isNonWorking ? (
        <span className="text-fg-faint">—</span>
      ) : (
        <span className="leading-none">{fmtQty(cellEod)}</span>
      )}

      {/* Top-right: demand spike */}
      {spike ? (
        <Triangle
          className="absolute right-1 top-1 h-2 w-2 fill-warning text-warning"
          strokeWidth={1}
        />
      ) : null}

      {/* Top-left: planned-production receipt (FG-level inflow_from_production
          from view 0144). Visually distinct from the bottom-right PO arrow:
          this is "+N units made" not "+N units bought-in". Production-aware
          stockout cells already get the production-aware EOD number; this
          chip tells the operator WHY the day is healthier than the PO-only
          view would suggest. */}
      {productionInflow > 0 ? (
        <span
          className="absolute left-0.5 top-0.5 inline-flex items-center rounded-sm bg-info-softer px-1 py-0 text-[9px] font-semibold leading-tight text-info-fg shadow-sm"
          title={`+${fmtQty(productionInflow)} from planned production`}
          aria-label={`Plus ${fmtQty(productionInflow)} from planned production`}
          data-testid="day-cell-production-inflow"
        >
          +{fmtQty(productionInflow)}
        </span>
      ) : null}

      {/* Bottom-right: incoming PO (truth) — top-most so the planned chip
          (lower bottom-right) does not cover it. */}
      {incoming ? (
        <ArrowDown
          className="absolute bottom-1 right-1 h-2.5 w-2.5 text-info"
          strokeWidth={2.5}
        />
      ) : null}

      {/* Bottom-left corner: planned-inflow overlay chip (intent, not truth).
          Per contract V1: secondary in size/saturation; info-tone; dashed
          border; carries the literal "Planned" word in title/aria. */}
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

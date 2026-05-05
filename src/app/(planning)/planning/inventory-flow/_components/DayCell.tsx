"use client";

// ---------------------------------------------------------------------------
// DayCell — single 80×56 cell for one item × one day in the desktop grid.
//
// Operational Clarity v2 (2026-05-05) — STRUCTURAL ALIGNMENT FIX
// =============================================================
// Tom feedback 2026-05-04:
//   "המספרים מקוטעים מכיוון שעולים על המשבצות" — numbers cut off
//   because the production-receipt chip (▼ +517.5) overlapped the cell
//   number (1.5K) due to `position: absolute; top: 2px; left: 50%`.
//
// Fix: production chip is now INLINE in a 2-row vertical stack:
//
//     ┌──────────────────────┐  ← 80px wide
//     │  ▼ 517              │  ← chip row (16px) — only when inflow>0
//     ├──────────────────────┤
//     │       1.5K           │  ← number row (~28px) — always
//     │                      │
//     │ ⚠            ⬇      │  ← spike-triangle (TL) and incoming-PO (BR)
//     └──────────────────────┘     remain absolute but will never collide
//                                  with the chip because chip is in its
//                                  own row at the top.
//
// When there is NO production inflow, the number occupies the full cell
// height and reads centered — no awkward empty top row.
//
// The cell width comes from `var(--day-col-w, 80px)` set on the parent
// grid; min === max === width so flex-shrink can't drift the pixel grid.
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

  const hasChipRow = productionInflow > 0;

  const cellInner = (
    <div
      role="gridcell"
      tabIndex={0}
      data-day={day.day}
      data-today={isToday ? "true" : undefined}
      data-testid="day-cell"
      aria-label={
        isNonWorking
          ? day.holiday_name_he ?? "Non-working day"
          : `${item.item_name} on ${day.day}: ${formatCompact(cellEod)} units, tier ${day.cell_tier_with_production ?? day.tier}`
      }
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col items-stretch border-r border-border/30 text-xs tabular-nums transition-colors duration-200 last:border-r-0",
        // Tier color (5-tier production-aware classifier).
        isNonWorking
          ? "bg-hatch-history text-fg-faint"
          : dayCellClassNameProduction(day.cell_tier_with_production, day.tier),
        // Today vertical band — inset shadows on left+right edges so the
        // accent line is pixel-perfect aligned with the header pill above.
        isToday && !isNonWorking && "shadow-[inset_1px_0_0_hsl(var(--accent)/0.55),inset_-1px_0_0_hsl(var(--accent)/0.55)]",
        // Hover: 1px accent inset ring; doesn't affect layout.
        !isNonWorking && "hover:shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.7)]",
      )}
      title={
        isNonWorking
          ? day.holiday_name_he ?? "Non-working day"
          : productionInflow > 0
            ? `+${formatCompact(productionInflow)} bottles arriving from planned production`
            : undefined
      }
    >
      {/* Today column soft-tint overlay (drawn behind content; doesn't
          fight the tier background — uses accent at very low alpha). */}
      {isToday && !isNonWorking ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-accent/[0.06]"
        />
      ) : null}

      {/* ---------- Chip row (inline; only when production inflow > 0) ----- */}
      {hasChipRow ? (
        <div className="relative z-[1] flex h-[16px] items-center justify-center px-1 pt-[2px]">
          <span
            className="inline-flex max-w-full items-center gap-0.5 truncate rounded-sm border border-dashed border-accent/60 bg-accent-soft/90 px-1 py-0 text-[9px] font-semibold leading-none text-accent shadow-sm"
            aria-label={`Plus ${formatCompact(productionInflow)} from planned production`}
            data-testid="day-cell-production-inflow"
          >
            <span aria-hidden>▼</span>
            <span className="tabular-nums">{formatCompact(productionInflow)}</span>
          </span>
        </div>
      ) : null}

      {/* ---------- Number row (always) ------------------------------------ */}
      <div
        className={cn(
          "relative z-[1] flex flex-1 items-center justify-center px-1.5",
          // When there's no chip, give the number a tiny bit of top
          // breathing room so it doesn't kiss the cell border.
          !hasChipRow && "pt-1",
        )}
      >
        {isNonWorking ? (
          <span className="text-fg-faint">—</span>
        ) : (
          <span
            className={cn(
              "leading-none",
              // 12px is the default; bump to 13px when the cell has no
              // chip so the number reads slightly heavier (Tom locked: a
              // production-marked cell is "louder" by virtue of the chip,
              // so the number can be quieter; clean cells lean on the
              // number alone).
              hasChipRow ? "text-[12px]" : "text-[13px]",
            )}
          >
            {formatCompact(cellEod)}
          </span>
        )}
      </div>

      {/* Top-left: demand spike triangle (only when no chip — they share
          the top-left zone). When chip is present the spike moves to
          top-right. */}
      {spike && !hasChipRow ? (
        <Triangle
          className="absolute left-1 top-1 h-2 w-2 fill-warning text-warning"
          strokeWidth={1}
          aria-label="Demand spike"
        />
      ) : null}
      {spike && hasChipRow ? (
        <Triangle
          className="absolute right-1 top-[18px] h-2 w-2 fill-warning text-warning"
          strokeWidth={1}
          aria-label="Demand spike"
        />
      ) : null}

      {/* Bottom-right: incoming PO. */}
      {incoming ? (
        <ArrowDown
          className="absolute bottom-1 right-1 h-2.5 w-2.5 text-info"
          strokeWidth={2.5}
          aria-label="Incoming PO"
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

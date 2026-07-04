"use client";

// ---------------------------------------------------------------------------
// DayCell — single 80×56 cell for one item × one day in the desktop grid.
//
// Polish 2026-05-05 (grid body pass — Tom mandate "מהממים"):
//   - Right-aligned tabular numerals (currency convention; Primer DataTable
//     standard for quantitative cells).
//   - Subtle vertical depth gradient overlay (`.cell-depth`) — 8% fade,
//     not flat fill. Modern Stripe/Linear dashboard convention.
//   - Today column: 1px inset accent glow + bg overlay (`.today-glow`).
//   - Demand-spike marker → Lucide `TrendingUp` icon (was Triangle) for
//     stronger semantic clarity at small sizes.
//   - Production-receipt chip → ArrowDown icon + `var(--accent)` pill,
//     hover scales 1.04 (`.production-chip`).
//   - Cell hover: 1px inset accent ring with 80ms ease-out
//     (`.cell-hover-ring`). Native title fires browser tooltip after the
//     OS-default delay (300ms typical) per NN/g brevity guidance.
//
// Operational Clarity v2 layout (preserved):
//   - Production-receipt chip is INLINE in a top row (16px) when present;
//     number row owns the rest. No absolute-positioning collision with the
//     main numeral.
//
//     ┌──────────────────────┐  ← 80px wide
//     │  ↓ 517              │  ← chip row (16px) — only when inflow>0
//     ├──────────────────────┤
//     │             1.5K     │  ← number row (~28px), right-aligned
//     │                      │
//     │ ↗            ⬇      │  ← spike (TL) and incoming-PO (BR) corners
//     └──────────────────────┘
//
// Wrapped in DayPopover so click reveals demand/supply detail. Memoized.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { ArrowDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtQty, formatCompact } from "../_lib/format";
import {
  cellTierLabel,
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
  /**
   * When true, the popover's "Drill down" affordance is rendered
   * non-clickable. Forwarded to `DayPopover`. Default `false`.
   */
  disableRowLink?: boolean;
}

function DayCellInner({
  item,
  day,
  avgDailyDemand,
  isToday,
  overlayEnabled = false,
  plannedRow,
  disableRowLink = false,
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

  // shortfall_qty_with_production = demand-minus-available gap including
  // planned production. Supply-side view sets it equal to shortfall_qty
  // (no production overlay). Both required after migration 0193/0190.
  const cellShortfall = day.shortfall_qty_with_production;

  const hasChipRow = productionInflow > 0;

  // Compute spike % above average for the tooltip.
  const spikePct =
    spike && avgDailyDemand > 0
      ? Math.round(((totalDemand - avgDailyDemand) / avgDailyDemand) * 100)
      : 0;

  const cellInner = (
    <div
      role="gridcell"
      // DR-018 A11Y-008 (Tranche 125) — non-working cells were still real
      // Tab stops with nothing actionable behind them (no popover opens —
      // see the `isNonWorking` early-return below); a keyboard user hit a
      // dead stop on every Friday/Saturday/holiday column.
      tabIndex={isNonWorking ? -1 : 0}
      data-day={day.day}
      data-today={isToday ? "true" : undefined}
      data-testid="day-cell"
      aria-label={
        isNonWorking
          ? day.holiday_name_he ?? "Non-working day"
          : cellShortfall > 0
            ? `${item.item_name} on ${day.day}: 0 units on hand, short ${formatCompact(cellShortfall)} units, tier ${cellTierLabel(day.cell_tier_with_production ?? day.tier)}`
            : `${item.item_name} on ${day.day}: ${formatCompact(cellEod)} units, tier ${cellTierLabel(day.cell_tier_with_production ?? day.tier)}`
      }
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col items-stretch",
        "border-r border-border/30 text-xs tabular-nums last:border-r-0",
        // Hover ring + 80ms ease-out (no transition-colors — handled in
        // .cell-hover-ring so we get one declarative source).
        !isNonWorking && "cell-hover-ring",
        // Tier color (5-tier production-aware classifier).
        isNonWorking
          ? "bg-hatch-history text-fg-faint"
          : dayCellClassNameProduction(day.cell_tier_with_production, day.tier),
        // Today vertical band — accent glow on left+right edges plus a
        // soft bloom inward, so the today column reads "alive" relative
        // to neighboring cells.
        isToday && !isNonWorking && "today-glow",
      )}
      title={
        isNonWorking
          ? day.holiday_name_he ?? "Non-working day"
          : spike && productionInflow > 0
            ? `Demand spike (${spikePct >= 0 ? "+" : ""}${spikePct}% vs avg) · +${formatCompact(productionInflow)} from planned production`
            : spike
              ? `Demand spike: ${formatCompact(totalDemand)} units (${spikePct >= 0 ? "+" : ""}${spikePct}% vs avg)`
              : productionInflow > 0
                ? `+${formatCompact(productionInflow)} bottles arriving from planned production`
                : undefined
      }
    >
      {/* Vertical depth gradient — sits above tier bg, below content.
          Subtle modern dashboard depth (Stripe/Linear) without distracting
          from the numeral. Skipped on non-working days because the hatch
          pattern already carries texture. */}
      {!isNonWorking ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 cell-depth"
        />
      ) : null}

      {/* Today column soft-tint overlay (drawn behind content; doesn't
          fight the tier background — uses accent at very low alpha). */}
      {isToday && !isNonWorking ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-accent/[0.07]"
        />
      ) : null}

      {/* ---------- Chip row (inline; only when production inflow > 0) ----- */}
      {hasChipRow ? (
        <div className="relative z-[1] flex h-[16px] items-center justify-center px-1 pt-[2px]">
          <span
            className={cn(
              "production-chip inline-flex max-w-full items-center gap-0.5 truncate",
              "rounded-full border border-accent/45 bg-accent-soft/95",
              "px-1.5 py-0 text-[9px] font-semibold leading-none text-accent shadow-sm",
            )}
            aria-label={`Plus ${formatCompact(productionInflow)} from planned production`}
            data-testid="day-cell-production-inflow"
          >
            <ArrowDown
              className="h-2 w-2 shrink-0"
              strokeWidth={3}
              aria-hidden
            />
            <span className="tabular-nums">{formatCompact(productionInflow)}</span>
          </span>
        </div>
      ) : null}

      {/* ---------- Number row (always) ------------------------------------ */}
      <div
        className={cn(
          "relative z-[1] flex flex-1 flex-col items-end justify-center pr-2",
          // When there's no chip, give the number a tiny bit of top
          // breathing room so it doesn't kiss the cell border.
          !hasChipRow && "pt-1",
        )}
      >
        {isNonWorking ? (
          <span className="text-fg-faint">—</span>
        ) : (
          <>
            <span
              className={cn(
                "leading-none tabular-nums text-right",
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
            {/* Stock Truth Change 2 (2026-05-14) — shortfall hint when
                projected demand exceeds available supply on this day.
                Renders only when backend reports shortfall_qty > 0. */}
            {cellShortfall > 0 ? (
              <span
                className="mt-0.5 text-[10px] font-semibold leading-none text-danger-fg tabular-nums"
                title={`Short ${formatCompact(cellShortfall)} units (demand exceeds available stock)`}
                data-testid="day-cell-shortfall"
              >
                −{formatCompact(cellShortfall)}
              </span>
            ) : null}
          </>
        )}
      </div>

      {/* Top-left: demand spike — TrendingUp icon (was Triangle).
          Stronger semantic at thumbnail size; warning-tinted but not too
          loud. Repositions to top-right when chip row is occupied. */}
      {spike && !hasChipRow ? (
        <TrendingUp
          className="absolute left-1 top-1 h-2.5 w-2.5 text-warning"
          strokeWidth={2.5}
          aria-label="Demand spike"
        />
      ) : null}
      {spike && hasChipRow ? (
        <TrendingUp
          className="absolute right-1 top-[18px] h-2.5 w-2.5 text-warning"
          strokeWidth={2.5}
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
      disableRowLink={disableRowLink}
    >
      {cellInner}
    </DayPopover>
  );
}

export const DayCell = memo(DayCellInner);

// fmtQty kept for backwards-compat callers that import it via re-export
// chain; not used directly here but referenced indirectly by tests.
void fmtQty;

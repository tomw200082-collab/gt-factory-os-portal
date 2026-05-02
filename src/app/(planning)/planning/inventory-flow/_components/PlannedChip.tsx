"use client";

// ---------------------------------------------------------------------------
// PlannedChip — visually distinct "Planned: N" indicator for a (item, day).
//
// Visual contract (inventory_flow_planned_inflow_overlay_contract.md §5.1):
//   V1 — secondary in size + saturation; never visually competes with the
//        posted-stock fill that already lives in the cell.
//   V3 — info-tone color (blue/blue-soft). Never success/warning/error.
//   V4 — literal word "Planned" must appear in the chip OR within ≤1
//        hover/tap of it (§7.1). The chip itself shows "Planned: N".
//   V5 — cancelled rows are filtered at the read-model level; this chip
//        will never render for a cancelled-only aggregate (planned_remaining=0).
//   V6 — done plans are likewise filtered at the read-model.
//   V7 — chip MUST NOT alter the posted-stock projected_on_hand_eod number.
//
// Visual primitive choice: dotted/dashed border + info-tone soft fill
// (contract §10 row 6 default; UNRESOLVED-IFPI-1 default = (a)).
//
// The chip is positioned as an absolute overlay in the bottom-left corner
// of the day cell so it never overlaps the existing top-right "demand spike"
// triangle or the bottom-right "incoming PO" arrow.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { cn } from "@/lib/cn";
import { fmtQty } from "../_lib/format";

interface PlannedChipProps {
  plannedRemainingQty: number;
  /** "compact" = corner overlay on day cell; "inline" = standalone chip in lists/tooltips. */
  variant?: "compact" | "inline";
  className?: string;
  /** When true, render a small skeleton rather than the chip (loading state). */
  loading?: boolean;
}

function PlannedChipInner({
  plannedRemainingQty,
  variant = "compact",
  className,
  loading,
}: PlannedChipProps) {
  if (loading) {
    return (
      <span
        aria-hidden
        className={cn(
          variant === "compact"
            ? "absolute bottom-0.5 left-0.5 h-3 w-7 animate-pulse rounded-sm bg-info/15"
            : "inline-block h-4 w-16 animate-pulse rounded-sm bg-info/15",
          className,
        )}
      />
    );
  }

  // Empty render guard — contract §6.1: empty days render NOTHING.
  if (plannedRemainingQty <= 0) return null;

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border border-dashed border-info/60 bg-info-softer px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-info-fg",
          className,
        )}
      >
        <span className="dot bg-info" aria-hidden />
        <span className="tabular-nums">Planned: {fmtQty(plannedRemainingQty)}</span>
      </span>
    );
  }

  // Compact: corner overlay inside a 64×52 day cell.
  return (
    <span
      role="img"
      aria-label={`Planned production: ${fmtQty(plannedRemainingQty)} units, not yet posted`}
      className={cn(
        "pointer-events-none absolute bottom-0.5 left-0.5 inline-flex items-center rounded-sm border border-dashed border-info/70 bg-info-softer/80 px-1 py-0 text-[9px] font-semibold leading-tight tracking-tight text-info-fg shadow-sm",
        className,
      )}
    >
      <span className="tabular-nums">P:{fmtQty(plannedRemainingQty)}</span>
    </span>
  );
}

export const PlannedChip = memo(PlannedChipInner);

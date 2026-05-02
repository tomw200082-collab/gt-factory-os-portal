"use client";

// ---------------------------------------------------------------------------
// PlannedChip — visually-distinct overlay chip for planned (not-yet-posted)
// production on a day or week cell.
//
// Contract authority:
//   docs/integrations/inventory_flow_planned_inflow_overlay_contract.md
//   §5.1 V1..V7 (visual rules), §7.1 (per-element microcopy), §7.4 (no
//   completion glyphs).
//
// Tom-locked dispatch invariants (see active_mode.json):
//   - Localization register = English/LTR (NOT Hebrew on this surface).
//   - Microcopy: "Planned: <qty> · not posted" satisfies V4 + §7.1 in one
//     hover; the literal word "Planned" appears textually within the chip
//     without abbreviation.
//
// Visual rules:
//   - Info-tone color (blue-soft); NEVER success/warning/error tones (V3).
//   - Dashed border (V1 — option (a) per A13 #6, default until Tom flips).
//   - Smaller / lower-saturation than truth elements (V1).
//   - Empty (qty=0 OR plan_count_remaining=0) → render NOTHING per §6.1.
//
// Dispatch hard rule: do NOT author a new primitive — this is a thin
// wrapper around existing tokens (info palette + cn helper). No Radix
// surface; the tooltip lives in PlannedTooltip.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { cn } from "@/lib/cn";
import { fmtQty } from "../_lib/format";

interface PlannedChipProps {
  /** SUM of planned-remaining quantity for this (item, day) or (item, week). */
  qty: number;
  /** UoM string from the backend (sales_uom); falls back to no unit. */
  uom?: string | null;
  /**
   * Render variant:
   *   - "day"  — corner chip on a 64×52 day cell. Compact (qty only).
   *   - "week" — chip on a 96×52 week cell. Slightly more room.
   *   - "inline" — full text inline (used in mobile cards / item detail).
   */
  variant?: "day" | "week" | "inline";
  /** Optional className override for layout positioning by parent. */
  className?: string;
}

function PlannedChipInner({
  qty,
  uom,
  variant = "day",
  className,
}: PlannedChipProps) {
  // Empty-state contract §6.1 — render NOTHING when no planned-remaining.
  if (!qty || qty <= 0) return null;

  const qtyText = fmtQty(qty);
  const uomText = uom ? ` ${uom}` : "";

  if (variant === "day") {
    return (
      <span
        // Per V4 + §7.1 — literal "Planned" word in tooltip-on-hover.
        // The visible chip is compact; the title attr satisfies the
        // ≤1-interaction microcopy rule for keyboard / screen-reader.
        title={`Planned: ${qtyText}${uomText} · not posted`}
        aria-label={`Planned ${qtyText}${uomText}, not yet posted to stock`}
        className={cn(
          "pointer-events-none absolute bottom-0.5 right-0.5",
          "inline-flex items-center gap-0.5 rounded-sm",
          "border border-dashed border-info/60 bg-info-softer/85",
          "px-1 py-px text-[9px] font-semibold leading-none tabular-nums",
          "text-info-fg",
          className,
        )}
        data-testid="planned-chip-day"
      >
        {/* Plus sign signals an inflow without using a completion glyph. */}
        <span aria-hidden>+</span>
        <span>{qtyText}</span>
      </span>
    );
  }

  if (variant === "week") {
    return (
      <span
        title={`Planned (week): ${qtyText}${uomText} · not posted`}
        aria-label={`Planned ${qtyText}${uomText} this week, not yet posted to stock`}
        className={cn(
          "pointer-events-none absolute bottom-0.5 right-0.5",
          "inline-flex items-center gap-0.5 rounded-sm",
          "border border-dashed border-info/60 bg-info-softer/85",
          "px-1 py-px text-[9px] font-semibold leading-none tabular-nums",
          "text-info-fg",
          className,
        )}
        data-testid="planned-chip-week"
      >
        <span aria-hidden>+</span>
        <span>{qtyText}</span>
      </span>
    );
  }

  // inline variant — full text including the literal "Planned" word per V4.
  return (
    <span
      aria-label={`Planned ${qtyText}${uomText}, not yet posted to stock`}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm",
        "border border-dashed border-info/60 bg-info-softer",
        "px-1.5 py-0.5 text-2xs font-semibold tabular-nums",
        "text-info-fg",
        className,
      )}
      data-testid="planned-chip-inline"
    >
      <span>Planned: +{qtyText}{uomText}</span>
      <span className="text-3xs font-normal text-info-fg/80">
        · not posted
      </span>
    </span>
  );
}

export const PlannedChip = memo(PlannedChipInner);

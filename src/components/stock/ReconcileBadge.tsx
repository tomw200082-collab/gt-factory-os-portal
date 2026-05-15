"use client";

import { Badge } from "@/components/ui/Badge";

export interface ReconcileBadgeProps {
  /** Magnitude of how far calculated_on_hand is below zero. Always >= 0. */
  floorGap: number | string;
  /** Display uom (e.g. "unit", "bottle"). */
  uom: string | null;
  /** Click handler — opens the StockTruthDrawer at the call site. */
  onClick: () => void;
  /** When true, render as a non-interactive span (role-gated case). */
  disabled?: boolean;
  /** Optional className for surface-specific positioning. */
  className?: string;
}

/**
 * Amber "Reconcile" badge surfaced when calculated_on_hand < 0.
 *
 * Tranche 0A consolidation (2026-05-15): this is now a thin wrapper over the
 * canonical <Badge> primitive. The button/span conditional and the Radix
 * Tooltip boilerplate moved into <Badge>. Tone, size, icon, label, tooltip
 * body and aria-label text are all preserved verbatim from the pre-
 * consolidation implementation.
 *
 * Spec: PRODUCTION/docs/superpowers/specs/2026-05-13-display-clamp-physical-stock-truth-design.md §4
 * Handoff: INTER-001 (Radix Tooltip + disabled prop), VISUAL-002 (ring-warning/50)
 */
export function ReconcileBadge({
  floorGap,
  uom,
  onClick,
  disabled,
  className,
}: ReconcileBadgeProps) {
  const gapDisplay = typeof floorGap === "number" ? floorGap : Number(floorGap);
  const gapText = Number.isNaN(gapDisplay) ? "?" : String(gapDisplay);
  const uomText = uom ?? "units";
  const tooltipBody = `Recorded outflows exceed receipts by ${gapText} ${uomText}. Click to review.`;
  const ariaShort = `Reconcile — ${gapText} ${uomText} below floor`;
  const ariaLabel = disabled ? `${ariaShort} (action unavailable)` : ariaShort;

  return (
    <Badge
      tone="warning"
      variant="soft"
      size="sm"
      interactive
      onClick={onClick}
      disabled={disabled}
      tooltip={tooltipBody}
      ariaLabel={ariaLabel}
      icon={<span className="font-mono">⚠</span>}
      className={`ring-1 ring-warning/50${className ? ` ${className}` : ""}`}
    >
      Reconcile
    </Badge>
  );
}

"use client";

import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/cn';

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
  const gapDisplay = typeof floorGap === 'number' ? floorGap : Number(floorGap);
  const gapText = Number.isNaN(gapDisplay) ? '?' : String(gapDisplay);
  const uomText = uom ?? 'units';
  const tooltipBody = `Recorded outflows exceed receipts by ${gapText} ${uomText}. Click to review.`;
  const ariaShort = `Reconcile — ${gapText} ${uomText} below floor`;

  const visualBody = (
    <>
      <span aria-hidden className="font-mono">⚠</span>
      Reconcile
    </>
  );

  const sharedClass = cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ring-1',
    'bg-warning-softer text-warning-fg ring-warning/50',
    className,
  );

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        {disabled ? (
          <span
            role="status"
            aria-label={`${ariaShort} (action unavailable)`}
            className={cn(sharedClass, 'opacity-70 cursor-not-allowed')}
          >
            {visualBody}
          </span>
        ) : (
          <button
            type="button"
            onClick={onClick}
            aria-label={ariaShort}
            className={cn(
              sharedClass,
              'transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              'hover:bg-warning-softer/80',
            )}
          >
            {visualBody}
          </button>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 rounded border border-border bg-bg-raised px-2 py-1 text-2xs text-fg shadow-md"
        >
          {tooltipBody}
          <Tooltip.Arrow className="fill-bg-raised" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

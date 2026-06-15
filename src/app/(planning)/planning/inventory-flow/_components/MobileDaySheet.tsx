"use client";

// ---------------------------------------------------------------------------
// MobileDaySheet — bottom sheet with single-day detail for the mobile card
// stream (Tranche 057, FLOW-M04).
//
// On desktop, day-level numbers live in <DayPopover> (Radix hover/click
// popover on each grid cell). The mobile card stream has no grid cells, so
// before this sheet existed a phone operator could see that a day was red
// but had NO way to learn the quantities behind it. This sheet renders the
// same decision rows as DayPopover — demand breakdown, incoming supply,
// planned-production inflow, projected end-of-day on-hand — for one
// (item, day), opened by tapping a cell in MobileItemCard's day strip.
//
// Interaction model mirrors the app drawer (MobileNav):
//   - Portaled to document.body (escapes transformed/filtered ancestors).
//   - Backdrop z-[45] above the sticky TopBar (z-40); panel z-50.
//   - Closes on backdrop tap, Escape, and the explicit Close button.
//   - Body scroll locked while open; focus moves to the Close button on
//     open and returns to the previously-focused element on close.
//   - Safe-area bottom padding so the iPhone home indicator never covers
//     the last row.
//
// All data is already client-side in FlowDay — no backend contract change.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDateLong, formatCompact } from "../_lib/format";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowDay, FlowItem } from "../_lib/types";
import type { PlannedInflowRow } from "../_lib/plannedInflow";
import { PlannedTooltip } from "./PlannedTooltip";
import { Sparkline } from "./Sparkline";

interface MobileDaySheetProps {
  item: FlowItem;
  day: FlowDay;
  onClose: () => void;
  /** Render the planned-inflow section when true. */
  overlayEnabled?: boolean;
  /** Planned-inflow row for this (item, day). */
  plannedRow?: PlannedInflowRow;
  /** Hide the per-item drill-down link (supply view — route is FG-only). */
  disableRowLink?: boolean;
}

export function MobileDaySheet({
  item,
  day,
  onClose,
  overlayEnabled = false,
  plannedRow,
  disableRowLink = false,
}: MobileDaySheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Escape closes; body scroll locks while the sheet is mounted; focus is
  // captured on mount and restored on unmount.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  const isStockout = day.tier === "stockout";
  const isNonWorking = day.tier === "non_working";
  const heroDays = item.days.slice(0, 14);

  const sheet = (
    <>
      {/* Backdrop — z-[45] sits above the sticky TopBar (z-40). */}
      <div
        className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Bottom panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Day detail — ${fmtDateLong(day.day)}, ${item.item_name}`}
        data-testid="mobile-day-sheet"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[min(85vh,560px)] overflow-y-auto rounded-t-lg border-t border-border/70 bg-bg-raised shadow-pop animate-fade-in-up"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border/40 bg-bg-raised px-4 pb-3 pt-4">
          <div className="min-w-0">
            <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              {fmtDateLong(day.day)}
            </div>
            <div
              className={cn(
                "mt-1 text-base font-semibold tabular-nums",
                isStockout
                  ? "text-danger-fg"
                  : isNonWorking
                    ? "text-fg-muted"
                    : "text-fg-strong",
              )}
            >
              {isNonWorking
                ? day.holiday_name_he
                  ? `Non-working — ${day.holiday_name_he}`
                  : "Non-working day"
                : isStockout
                  ? "Stockout"
                  : `End of day: ${formatCompact(day.projected_on_hand_eod_with_production)}`}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close day detail"
            data-testid="mobile-day-sheet-close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="px-4 pt-3">
          {/* 14-day trajectory — same hero context the desktop popover gives. */}
          {!isNonWorking && heroDays.length > 0 ? (
            <div
              className="flex flex-col gap-0.5 rounded-sm border border-border/30 bg-bg-subtle/60 px-2 py-1.5"
              aria-hidden
            >
              <div className="flex items-center justify-between text-3xs uppercase tracking-sops text-fg-subtle">
                <span>14-day trajectory</span>
                <span className="tabular-nums opacity-80">
                  {formatCompact(
                    heroDays[0]!.projected_on_hand_eod_with_production,
                  )}
                  {" → "}
                  {formatCompact(
                    heroDays[heroDays.length - 1]!
                      .projected_on_hand_eod_with_production,
                  )}
                </span>
              </div>
              <Sparkline
                days={heroDays}
                riskTier={item.risk_tier}
                width={296}
                height={40}
                className="w-full"
              />
            </div>
          ) : null}

          {/* Decision rows — same surfaces as DayPopover (contract §4.3). */}
          {!isNonWorking ? (
            <dl className="mt-3 flex flex-col">
              <Row label="Demand (LionWheel)" value={day.demand_lionwheel} />
              <Row label="Demand (Forecast)" value={day.demand_forecast} />
              <Row
                label="Incoming supply (PO)"
                value={day.incoming_supply}
                valueClassName={day.incoming_supply > 0 ? "text-info-fg" : ""}
              />
              {day.inflow_from_production > 0 ? (
                <Row
                  label="From planned production"
                  value={day.inflow_from_production}
                  valueClassName="text-info-fg"
                />
              ) : null}
              <Row
                label="Projected on-hand (end of day)"
                value={day.projected_on_hand_eod_with_production}
                valueClassName={
                  day.shortfall_qty_with_production > 0
                    ? "text-danger-fg font-semibold"
                    : "font-semibold text-fg-strong"
                }
                emphasized
              />
            </dl>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              No deliveries / no demand on this day. Friday and Saturday are
              non-working by default; holidays from <code>holidays_il</code>{" "}
              also block pickup.
            </p>
          )}

          {/* Planned-inflow overlay section (intent — not truth). */}
          {overlayEnabled && plannedRow && plannedRow.planned_remaining_qty > 0 ? (
            <PlannedTooltip row={plannedRow} />
          ) : null}

          {/* Item context + drill-down */}
          <div className="mt-3 border-t border-border/40 pt-3">
            <div className="text-3xs uppercase tracking-sops text-fg-subtle">
              Item
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">
                  {item.item_name}
                </div>
                <div className="text-3xs text-fg-muted">
                  {RISK_TIER_STYLE[item.risk_tier].label} · cover{" "}
                  <span className="tabular-nums">
                    {formatCompact(
                      item.days_cover_with_production != null
                        ? item.days_cover_with_production
                        : item.days_of_cover,
                    )}
                    d
                  </span>
                  {item.stockout_at_day_with_production ? (
                    <>
                      {" · stockout "}
                      <span className="tabular-nums">
                        {item.stockout_at_day_with_production.slice(5)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              {disableRowLink ? null : (
                <Link
                  href={`/planning/inventory-flow/${encodeURIComponent(item.item_id)}`}
                  className="inline-flex min-h-[44px] items-center gap-1 px-2 text-xs font-semibold uppercase tracking-sops text-accent hover:underline"
                >
                  Drill down
                  <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}

interface RowProps {
  label: string;
  value: number;
  valueClassName?: string;
  emphasized?: boolean;
}

function Row({ label, value, valueClassName, emphasized = false }: RowProps) {
  return (
    <div
      className={cn(
        "popover-row flex items-baseline justify-between gap-2 py-1.5",
        emphasized && "mt-0.5 border-t border-border/40 pt-2",
      )}
    >
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "text-sm tabular-nums tracking-tight text-fg-strong",
          "text-right",
          valueClassName,
        )}
      >
        {formatCompact(value)}
      </dd>
    </div>
  );
}

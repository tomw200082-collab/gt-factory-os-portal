"use client";

// ---------------------------------------------------------------------------
// DayPopover — Radix Popover content for a single day cell.
//
// Polish 2026-05-05 (grid body pass):
//   - Hero sparkline at top (200×40) showing the full visible trajectory
//     with the hovered day's tier color — turns the popover into a "story"
//     of the item's flow rather than a flat list.
//   - Refined two-column rows: label left, value right, separated by a
//     faint hairline (.popover-row+.popover-row). Stripe charge-detail /
//     Linear issue-detail pattern for scannability.
//   - Width bumped 280→320 to accommodate the hero sparkline.
//
// Surfaces (per contract §4.3 + plan §Phase 8.5):
//   - Header: weekday + date + status ("Stockout" or "X days cover")
//   - Demand row: LionWheel + Forecast breakdown
//   - Supply row: PO arrivals (incoming_supply)
//   - Projected row: end-of-day on-hand
//   - Drill-down link to per-item detail
// ---------------------------------------------------------------------------

import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDateLong, formatCompact } from "../_lib/format";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowDay, FlowItem } from "../_lib/types";
import type { PlannedInflowRow } from "../_lib/plannedInflow";
import { PlannedTooltip } from "./PlannedTooltip";
import { Sparkline } from "./Sparkline";

interface DayPopoverProps {
  item: FlowItem;
  day: FlowDay;
  children: React.ReactNode;
  /** Render the planned-inflow tooltip section when true. */
  overlayEnabled?: boolean;
  /** Planned-inflow row for this (item, day). */
  plannedRow?: PlannedInflowRow;
}

export function DayPopover({
  item,
  day,
  children,
  overlayEnabled = false,
  plannedRow,
}: DayPopoverProps) {
  const isStockout = day.tier === "stockout";
  const isNonWorking = day.tier === "non_working";

  // Trim to the visible 14-day window for the hero sparkline. Mirrors the
  // grid's display horizon so the user sees the same trajectory.
  const heroDays = item.days.slice(0, 14);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[320px] rounded-md border border-border/70 bg-bg-raised p-3 text-xs shadow-pop animate-fade-in-up"
        >
          {/* Header */}
          <div className="border-b border-border/40 pb-2">
            <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              {fmtDateLong(day.day)}
            </div>
            <div
              className={cn(
                "mt-1 text-sm font-semibold tabular-nums",
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

          {/* Hero sparkline — only on working days. Shows the 14-day arc
              of this item's projected on-hand so the day's number reads
              in the context of the trend, not in isolation. */}
          {!isNonWorking && heroDays.length > 0 ? (
            <div
              className="mt-2 flex flex-col gap-0.5 rounded-sm border border-border/30 bg-bg-subtle/60 px-2 py-1.5"
              aria-hidden
            >
              <div className="flex items-center justify-between text-3xs uppercase tracking-sops text-fg-subtle">
                <span>14-day trajectory</span>
                <span className="tabular-nums opacity-80">
                  {formatCompact(heroDays[0]!.projected_on_hand_eod_with_production)}
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

          {/* Body rows — two-column layout with hairline dividers (Stripe /
              Linear pattern). Label left, value right; .popover-row class
              draws the hairline divider between siblings. */}
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
                label="Projected on-hand (eod)"
                value={day.projected_on_hand_eod_with_production}
                valueClassName={
                  day.projected_on_hand_eod_with_production < 0
                    ? "text-danger-fg font-semibold"
                    : "font-semibold text-fg-strong"
                }
                emphasized
              />
            </dl>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
              No deliveries / no demand on this day. Friday and Saturday are
              non-working by default; holidays from <code>holidays_il</code>{" "}
              also block pickup.
            </p>
          )}

          {/* Planned-inflow overlay section (intent — not truth).
              Visually separated by border-t inside PlannedTooltip per
              contract §5.1 tooltip rules. Only renders when toggle ON
              AND a planned-remaining row exists for this (item, day). */}
          {overlayEnabled &&
          plannedRow &&
          plannedRow.planned_remaining_qty > 0 ? (
            <PlannedTooltip row={plannedRow} />
          ) : null}

          {/* Item context */}
          <div className="mt-3 border-t border-border/40 pt-2">
            <div className="text-3xs uppercase tracking-sops text-fg-subtle">
              Item
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-fg">
                  {item.item_name}
                </div>
                <div className="text-3xs text-fg-muted">
                  {/* Polish A v3 review (2026-05-04) — surface the
                      production-aware cover + first stockout day.
                      Falls back to production-blind cover if the API
                      hasn't shipped the new fields yet. */}
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
              <Link
                href={`/planning/inventory-flow/${encodeURIComponent(item.item_id)}`}
                className="inline-flex items-center gap-0.5 text-3xs font-semibold uppercase tracking-sops text-accent hover:underline"
              >
                Drill down
                <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </Link>
            </div>
          </div>

          <Popover.Arrow className="fill-bg-raised" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface RowProps {
  label: string;
  value: number;
  valueClassName?: string;
  /** Render the row with a slightly heavier visual weight (used for the
   *  bottom-line projected-on-hand row). */
  emphasized?: boolean;
}

function Row({ label, value, valueClassName, emphasized = false }: RowProps) {
  return (
    <div
      className={cn(
        "popover-row flex items-baseline justify-between gap-2 py-1",
        emphasized && "mt-0.5 border-t border-border/40 pt-1.5",
      )}
    >
      <dt className="text-3xs text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "text-xs tabular-nums tracking-tight text-fg-strong",
          "text-right",
          valueClassName,
        )}
      >
        {formatCompact(value)}
      </dd>
    </div>
  );
}

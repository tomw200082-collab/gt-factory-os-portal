"use client";

// ---------------------------------------------------------------------------
// DayPopover — Radix Popover content for a single day cell.
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
import { fmtDateLong, fmtQty } from "../_lib/format";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowDay, FlowItem } from "../_lib/types";

interface DayPopoverProps {
  item: FlowItem;
  day: FlowDay;
  children: React.ReactNode;
}

export function DayPopover({ item, day, children }: DayPopoverProps) {
  const isStockout = day.tier === "stockout";
  const isNonWorking = day.tier === "non_working";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[280px] rounded-md border border-border/70 bg-bg-raised p-3 text-xs shadow-pop animate-fade-in-up"
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
                  : `End of day: ${fmtQty(day.projected_on_hand_eod)}`}
            </div>
          </div>

          {/* Body rows */}
          {!isNonWorking ? (
            <dl className="mt-2 space-y-1.5">
              <Row label="Demand (LionWheel)" value={day.demand_lionwheel} />
              <Row label="Demand (Forecast)" value={day.demand_forecast} />
              <Row
                label="Incoming supply"
                value={day.incoming_supply}
                valueClassName={day.incoming_supply > 0 ? "text-info-fg" : ""}
              />
              <Row
                label="Projected on-hand (eod)"
                value={day.projected_on_hand_eod}
                valueClassName={
                  day.projected_on_hand_eod < 0
                    ? "text-danger-fg font-semibold"
                    : ""
                }
              />
            </dl>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
              No deliveries / no demand on this day. Friday and Saturday are
              non-working by default; holidays from <code>holidays_il</code>{" "}
              also block pickup.
            </p>
          )}

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
                  {RISK_TIER_STYLE[item.risk_tier].label} · cover{" "}
                  <span className="tabular-nums">{fmtQty(item.days_of_cover)}d</span>
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
}

function Row({ label, value, valueClassName }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-3xs text-fg-muted">{label}</dt>
      <dd className={cn("text-xs tabular-nums text-fg-strong", valueClassName)}>
        {fmtQty(value)}
      </dd>
    </div>
  );
}

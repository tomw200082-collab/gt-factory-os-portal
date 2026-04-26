"use client";

// ---------------------------------------------------------------------------
// MobileItemCard — single card in the mobile vertical stream.
//
// Visual:
//   - 4px tier strip on the left
//   - Item name + family + risk badge top
//   - Hero days-of-cover (text-5xl)
//   - One-sentence insight
//   - Mini 14-day strip (color blocks)
//   - Tap routes to /planning/inventory-flow/[itemId]
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { fmtDateLong, fmtDayLetter, fmtDaysOfCover } from "../_lib/format";
import { dayCellClassName, RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowItem } from "../_lib/types";

interface MobileItemCardProps {
  item: FlowItem;
}

export function MobileItemCard({ item }: MobileItemCardProps) {
  const style = RISK_TIER_STYLE[item.risk_tier];
  const insight = buildInsight(item);

  return (
    <Link
      href={`/planning/inventory-flow/${encodeURIComponent(item.item_id)}`}
      className="relative flex overflow-hidden rounded-md border border-border/40 bg-bg-raised shadow-raised transition-colors hover:border-accent/40"
    >
      {/* Tier strip */}
      <div className={cn("w-1 shrink-0", style.stripClass)} aria-hidden />
      <div className="flex-1 px-4 py-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-medium text-fg-strong">
              {item.item_name}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-3xs text-fg-muted">
              {item.family ? (
                <span className="rounded-sm bg-bg-muted px-1 py-0.5 uppercase tracking-sops">
                  {item.family}
                </span>
              ) : null}
              <Badge tone={style.badgeTone} variant="soft" dotted>
                {style.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Hero days of cover */}
        <div className="mt-4 flex items-baseline gap-2">
          <div
            className={cn(
              "text-5xl font-semibold leading-none tabular-nums",
              item.risk_tier === "stockout"
                ? "text-danger-fg"
                : item.risk_tier === "critical" || item.risk_tier === "watch"
                  ? "text-warning-fg"
                  : "text-fg-strong",
            )}
          >
            {fmtDaysOfCover(item.days_of_cover)}
          </div>
          <div className="text-sm text-fg-subtle">days cover</div>
        </div>

        {/* Insight sentence */}
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{insight}</p>

        {/* 14-day mini strip */}
        <div className="mt-4 flex gap-0.5">
          {item.days.slice(0, 14).map((d) => (
            <div
              key={d.day}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5",
              )}
              title={fmtDateLong(d.day)}
            >
              <div
                className={cn(
                  "h-6 w-full rounded-sm",
                  dayCellClassName(d.tier),
                )}
              />
              <span className="text-[9px] uppercase tracking-sops text-fg-faint">
                {fmtDayLetter(d.day)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}

function buildInsight(item: FlowItem): string {
  if (item.risk_tier === "stockout" && item.earliest_stockout_date) {
    return `Stockout projected ${fmtDateLong(item.earliest_stockout_date)}.`;
  }
  if (item.risk_tier === "critical") {
    return `Cover below lead time (${item.effective_lead_time_days}d). Replenish soon.`;
  }
  if (item.risk_tier === "watch") {
    return `Within 1.5× lead time (${item.effective_lead_time_days}d). Monitor.`;
  }
  return "Healthy through the visible horizon.";
}

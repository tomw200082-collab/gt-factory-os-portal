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
//
// Performance: wrapped in React.memo to skip re-render when FlowItem
// reference is stable across TanStack Query refetches.
// ---------------------------------------------------------------------------

import { memo, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import {
  daysCoverTierClass,
  fmtDateLong,
  fmtDayLetter,
  formatCompact,
  formatDaysCover,
} from "../_lib/format";
import { familyAccent } from "../_lib/family";
import { dayCellClassName, RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowItem } from "../_lib/types";
import type { PlannedInflowRow } from "../_lib/plannedInflow";
import { Sparkline } from "./Sparkline";

interface MobileItemCardProps {
  item: FlowItem;
  /** When true, render planned-inflow chips on the per-day mini-strip. */
  overlayEnabled?: boolean;
  /** Pre-indexed `${item_id}|${plan_date}` → row map. */
  plannedByItemDate?: Map<string, PlannedInflowRow>;
}

function MobileItemCardInner({
  item,
  overlayEnabled = false,
  plannedByItemDate,
}: MobileItemCardProps) {
  const style = RISK_TIER_STYLE[item.risk_tier];
  const insight = buildInsight(item);

  // Sum planned-remaining across the visible 14-day strip for this item —
  // surfaced as an inline summary chip when the overlay is on. Cheap (≤14
  // lookups per render) and deduplicates the noise of marking every day.
  const plannedSum = useMemo(() => {
    if (!overlayEnabled || !plannedByItemDate) return 0;
    let total = 0;
    for (const d of item.days.slice(0, 14)) {
      const row = plannedByItemDate.get(`${item.item_id}|${d.day}`);
      if (row && row.planned_remaining_qty > 0) {
        total += row.planned_remaining_qty;
      }
    }
    return total;
  }, [overlayEnabled, plannedByItemDate, item]);
  const plannedUom = useMemo(() => {
    if (!overlayEnabled || !plannedByItemDate) return null;
    for (const d of item.days.slice(0, 14)) {
      const row = plannedByItemDate.get(`${item.item_id}|${d.day}`);
      if (row?.sales_uom) return row.sales_uom;
    }
    return null;
  }, [overlayEnabled, plannedByItemDate, item]);

  const familyColor = familyAccent(item.family);
  const cover =
    item.days_cover_with_production != null
      ? item.days_cover_with_production
      : item.days_of_cover;
  const isFullHorizon =
    item.days_cover_with_production != null &&
    item.days_cover_with_production >= 56;
  const semantic = formatDaysCover(cover);
  const heroValue = isFullHorizon ? ">8w" : semantic.value;
  const heroSub = isFullHorizon ? "cover" : semantic.sub;
  const heroToneClass = isFullHorizon
    ? "text-tier-healthy-bg"
    : daysCoverTierClass(cover);

  return (
    <Link
      href={`/planning/inventory-flow/${encodeURIComponent(item.item_id)}`}
      className="relative flex overflow-hidden rounded-md border border-border/40 bg-bg-raised shadow-raised transition-colors hover:border-accent/40"
      style={{ borderLeft: `3px solid ${familyColor}` }}
    >
      {/* Tier strip (kept as a thin secondary cue inside the family-colored
          left border so risk still reads at a glance). */}
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

        {/* Hero days of cover (semantic — STOCKOUT / Nd / Nw / >3w) +
            inline sparkline so the slope reads alongside the headline. */}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <div
              className={cn(
                "text-4xl font-semibold leading-none tabular-nums",
                heroToneClass,
              )}
            >
              {heroValue}
            </div>
            {heroSub ? (
              <div className="text-sm uppercase tracking-sops text-fg-subtle">
                {heroSub}
              </div>
            ) : null}
          </div>
          <Sparkline
            days={item.days.slice(0, 14)}
            riskTier={item.risk_tier}
            width={96}
            height={28}
          />
        </div>

        {/* Insight sentence */}
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{insight}</p>

        {/* Planned-inflow summary chip (visible inline so the operator sees
            the planned summary without expanding the day strip).
            Touch target reachable inline; Link wrapper provides ≥44px hit
            via the parent card.
            Per dispatch validation gate 5: chip is a static label inside
            the card; the parent <Link> is the interactive element with a
            full-card touch target well above 44px. */}
        {overlayEnabled && plannedSum > 0 ? (
          <div className="mt-3 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-sm border border-dashed border-info/60 bg-info-softer px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-info-fg"
              data-testid="mobile-planned-summary"
              aria-label={`Planned ${formatCompact(plannedSum)} this 14-day window, not yet posted to stock`}
            >
              <span aria-hidden>+</span>
              <span>
                {formatCompact(plannedSum)}
                {plannedUom ? ` ${plannedUom}` : ""}
              </span>
              <span className="text-3xs font-normal text-info-fg/80">
                · planned · not posted
              </span>
            </span>
          </div>
        ) : null}

        {/* 14-day mini strip */}
        <div className="mt-4 flex gap-0.5">
          {item.days.slice(0, 14).map((d) => {
            const plannedRow =
              overlayEnabled && plannedByItemDate
                ? plannedByItemDate.get(`${item.item_id}|${d.day}`)
                : undefined;
            const hasPlanned =
              plannedRow && plannedRow.planned_remaining_qty > 0;
            return (
              <div
                key={d.day}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5",
                )}
                title={
                  hasPlanned
                    ? `${fmtDateLong(d.day)} · planned ${formatCompact(
                        plannedRow!.planned_remaining_qty,
                      )} · not posted`
                    : fmtDateLong(d.day)
                }
              >
                <div
                  className={cn(
                    "relative h-6 w-full rounded-sm",
                    dayCellClassName(d.tier),
                  )}
                >
                  {hasPlanned ? (
                    <span
                      aria-hidden
                      data-testid="mobile-planned-dot"
                      className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-tl-sm border-l border-t border-dashed border-info bg-info-softer"
                    />
                  ) : null}
                </div>
                <span className="text-[9px] uppercase tracking-sops text-fg-faint">
                  {fmtDayLetter(d.day)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}

export const MobileItemCard = memo(MobileItemCardInner);

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

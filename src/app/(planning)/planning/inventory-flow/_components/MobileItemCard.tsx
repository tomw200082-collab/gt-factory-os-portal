"use client";

// ---------------------------------------------------------------------------
// MobileItemCard — single card in the mobile vertical stream.
//
// Visual:
//   - 4px tier strip on the left
//   - Item name + family + risk badge top
//   - Hero days-of-cover (text-4xl)
//   - One-sentence insight
//   - 14-day strip as a 7-column × 2-row grid of TAPPABLE day cells
//     (Tranche 057, FLOW-M04/M05): tapping a day opens <MobileDaySheet>
//     with the same demand / supply / projected-EOD rows the desktop
//     DayPopover shows. Cells are ≥44px touch targets.
//   - Tapping the card body routes to /planning/inventory-flow/[itemId]
//
// Structure note (Tranche 057): the card wrapper is a <div>; the <Link>
// wraps only the body (header / hero / insight). The day strip is a
// sibling of the Link because interactive <button> day cells cannot nest
// inside an anchor (invalid HTML, broken a11y). Pre-057 the whole card
// was one <Link> and the strip was hover-title-only — useless on touch.
//
// Performance: wrapped in React.memo to skip re-render when FlowItem
// reference is stable across TanStack Query refetches.
// ---------------------------------------------------------------------------

import { memo, useMemo, useState, type CSSProperties } from "react";
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
import {
  dayCellClassNameProduction,
  NON_WORKING_STRIPE_STYLE,
  RISK_TIER_STYLE,
} from "../_lib/risk";
import {
  coveredByPlan,
  demandSum14,
  incomingSum14,
  shortfallSum14,
} from "../_lib/production-lens";
import type { FlowDay, FlowItem } from "../_lib/types";
import type { PlannedInflowRow } from "../_lib/plannedInflow";
import { MobileDaySheet } from "./MobileDaySheet";
import { Sparkline } from "./Sparkline";

interface MobileItemCardProps {
  item: FlowItem;
  /** When true, render planned-inflow chips on the per-day mini-strip. */
  overlayEnabled?: boolean;
  /** Pre-indexed `${item_id}|${plan_date}` → row map. */
  plannedByItemDate?: Map<string, PlannedInflowRow>;
  /**
   * When true, the card body is a non-clickable `<div>` instead of a
   * `<Link>` to the per-SKU drill-down route. Used by the supply view,
   * where `/planning/inventory-flow/[itemId]` does not yet handle
   * component IDs and would render broken/empty data on tap. Default
   * `false` preserves the FG card behaviour exactly. The day sheet stays
   * available in both modes (it reads client-side data only) but hides
   * its drill-down link when this is true.
   */
  disableRowLink?: boolean;
  /** When true, a coverage-days heat badge is overlaid on the card. */
  showCoverageHeatmap?: boolean;
  /** Coverage days for this item (null if unavailable). */
  coverageDays?: number | null;
  /** When true, render 4-week net movement sparkline on the card. */
  showMovementSparklines?: boolean;
  /** Array of 4 weekly net movement values for this item. */
  movementWeeks?: number[];
}

function MobileItemCardInner({
  item,
  overlayEnabled = false,
  plannedByItemDate,
  disableRowLink = false,
  showCoverageHeatmap = false,
  coverageDays = null,
  showMovementSparklines = false,
  movementWeeks,
}: MobileItemCardProps) {
  const style = RISK_TIER_STYLE[item.risk_tier];
  const insight = buildInsight(item);
  // Tranche 058 — production-lens numbers for the digest row + plan badge.
  const demand14 = demandSum14(item);
  const incoming14 = incomingSum14(item);
  const gap14 = shortfallSum14(item);
  const planCovers = coveredByPlan(item);

  // FLOW-M04 — which day's detail sheet is open (null = closed).
  const [sheetDay, setSheetDay] = useState<FlowDay | null>(null);

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

  const wrapperStyle: CSSProperties = {
    borderLeft: `3px solid ${familyColor}`,
  };

  // Coverage badge class
  const coverageBadgeClass =
    showCoverageHeatmap && coverageDays !== null
      ? coverageDays <= 7
        ? "bg-danger-softer text-danger-fg"
        : coverageDays <= 30
          ? "bg-warning-softer text-warning-fg"
          : "bg-success-softer text-success-fg"
      : null;

  const body = (
    <>
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
            {/* Tranche 058 — planned (not yet posted) production is what
                prevents this item's projected stockout. The job is to
                VERIFY the plan lands, not to start a new decision. */}
            {planCovers ? (
              <span data-testid="mobile-covered-by-plan">
                <Badge tone="info" variant="soft">
                  Covered by plan
                </Badge>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Hero days of cover (semantic — STOCKOUT / Nd / Nw / >3w) +
          inline sparkline so the slope reads alongside the headline.
          FLOW-M15: the value block carries min-w-0 and the sparkline is
          shrink-0 at a slightly narrower 80px, and the movement sparkline
          hides below sm — so "STOCKOUT" never clips at 360–390px. */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
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
          width={80}
          height={28}
          className="shrink-0"
        />
        {/* R-NEW-7 — 4-week movement sparkline (sm+ only; on phones the
            hero value wins the space contest). */}
        {showMovementSparklines && movementWeeks && movementWeeks.length >= 4 ? (() => {
          const xs = [5, 15, 25, 35] as const;
          const maxVal = Math.max(...movementWeeks.map(Math.abs), 1);
          const pts = movementWeeks
            .map((val, i) => `${xs[i]},${8 - (val / maxVal) * 6}`)
            .join(" ");
          return (
            <svg
              viewBox="0 0 40 16"
              width={40}
              height={16}
              className="ml-1 hidden shrink-0 sm:inline-block"
              aria-hidden
            >
              <polyline
                points={pts}
                fill="none"
                className="stroke-info"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        })() : null}
      </div>

      {/* Insight sentence */}
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{insight}</p>

      {/* Digest row (Tranche 058) — the actual quantities behind the colors:
          current stock, total 14-day demand, and either the unfilled gap
          (danger, = minimum production batch) or total incoming. */}
      <dl
        className="mt-3 grid grid-cols-3 gap-2 border-t border-border/40 pt-2.5"
        data-testid="mobile-digest-row"
      >
        <DigestStat label="On hand" value={formatCompact(item.current_on_hand)} />
        <DigestStat label="Demand 14d" value={formatCompact(demand14)} />
        {gap14 > 0 ? (
          <DigestStat
            label="Unfilled 14d"
            value={formatCompact(-gap14)}
            valueClassName="text-danger-fg"
          />
        ) : (
          <DigestStat
            label="Incoming 14d"
            value={formatCompact(incoming14)}
            valueClassName={incoming14 > 0 ? "text-info-fg" : undefined}
          />
        )}
      </dl>

      {/* Planned-inflow summary chip (visible inline so the operator sees
          the planned summary without expanding the day strip). */}
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
    </>
  );

  return (
    <div
      className="relative flex overflow-hidden rounded-md border border-border/40 bg-bg-raised shadow-raised"
      style={wrapperStyle}
    >
      {/* Tier strip (kept as a thin secondary cue inside the family-colored
          left border so risk still reads at a glance). */}
      <div className={cn("w-1 shrink-0", style.stripClass)} aria-hidden />
      {/* R-NEW-3 — Coverage heat badge (absolute top-left of card) */}
      {showCoverageHeatmap && coverageDays !== null && coverageBadgeClass ? (
        <span
          className={cn(
            "absolute left-3 top-1.5 z-10 text-3xs font-medium rounded px-1 leading-tight pointer-events-none",
            coverageBadgeClass,
          )}
          aria-label={`Coverage: ${coverageDays} days`}
        >
          {coverageDays}d
        </span>
      ) : null}

      <div className="flex-1 px-4 pb-3 pt-4">
        {/* Card body — navigates to the per-item drill-down (FG only). */}
        {disableRowLink ? (
          <div>{body}</div>
        ) : (
          <Link
            href={`/planning/inventory-flow/${encodeURIComponent(item.item_id)}`}
            className="block rounded-sm transition-colors hover:bg-bg-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {body}
          </Link>
        )}

        {/* 14-day strip — 7 columns × 2 rows of tappable day cells
            (FLOW-M04/M05). Each cell is a ≥44px button that opens the
            day-detail sheet; the tier color renders as a 3px LEFT BORDER
            plus a softened bg tint (same visual language as before). */}
        <div
          className="mt-3 grid grid-cols-7 gap-1"
          data-testid="mobile-day-strip"
          role="group"
          aria-label="Next 14 days — tap a day for detail"
        >
          {item.days.slice(0, 14).map((d) => {
            const plannedRow =
              overlayEnabled && plannedByItemDate
                ? plannedByItemDate.get(`${item.item_id}|${d.day}`)
                : undefined;
            const hasPlanned =
              plannedRow && plannedRow.planned_remaining_qty > 0;
            const isNonWorking = d.tier === "non_working";
            const isShort = d.shortfall_qty_with_production > 0;
            // Tranche 058 — the number IS the cell: projected end-of-day
            // on-hand, or the NEGATIVE unfilled gap on shortfall days
            // (−120 says "how much is missing", which beats a clamped 0).
            const cellValue = isNonWorking
              ? null
              : isShort
                ? formatCompact(-d.shortfall_qty_with_production)
                : formatCompact(d.projected_on_hand_eod_with_production);
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => setSheetDay(d)}
                aria-haspopup="dialog"
                aria-label={
                  isNonWorking
                    ? `${fmtDateLong(d.day)} — non-working day. Open day detail.`
                    : isShort
                      ? `${fmtDateLong(d.day)} — short ${formatCompact(d.shortfall_qty_with_production)} units. Open day detail.`
                      : `${fmtDateLong(d.day)} — ${formatCompact(d.projected_on_hand_eod_with_production)} units end of day. Open day detail.`
                }
                className="flex min-h-[48px] flex-col items-center gap-0.5 rounded-sm pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:opacity-80"
              >
                <span
                  className={cn(
                    // Same 5-tier production-aware palette the desktop grid
                    // cells use, so color reads identically on both surfaces.
                    "relative flex h-8 w-full items-center justify-center overflow-hidden rounded-sm",
                    dayCellClassNameProduction(
                      d.cell_tier_with_production,
                      d.tier,
                    ),
                  )}
                  style={isNonWorking ? NON_WORKING_STRIPE_STYLE : undefined}
                >
                  {/* Subtle vertical depth gradient — same .cell-depth
                      utility used on desktop cells for visual coherence. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 cell-depth"
                  />
                  {cellValue != null ? (
                    <span className="relative text-[10px] font-semibold leading-none tabular-nums tracking-tight">
                      {cellValue}
                    </span>
                  ) : null}
                  {hasPlanned ? (
                    <span
                      aria-hidden
                      data-testid="mobile-planned-dot"
                      className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-tl-sm border-l border-t border-dashed border-info bg-info-softer"
                    />
                  ) : null}
                </span>
                <span className="text-[9px] uppercase tracking-sops text-fg-faint">
                  {fmtDayLetter(d.day)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day-detail bottom sheet (FLOW-M04) */}
      {sheetDay ? (
        <MobileDaySheet
          item={item}
          day={sheetDay}
          onClose={() => setSheetDay(null)}
          overlayEnabled={overlayEnabled}
          plannedRow={
            overlayEnabled && plannedByItemDate
              ? plannedByItemDate.get(`${item.item_id}|${sheetDay.day}`)
              : undefined
          }
          disableRowLink={disableRowLink}
        />
      ) : null}
    </div>
  );
}

export const MobileItemCard = memo(MobileItemCardInner);

function buildInsight(item: FlowItem): string {
  // Tranche 058 — production-aware truth: when planned production prevents
  // the blind-projection stockout, say THAT instead of an alarming stockout
  // line that contradicts the (production-aware) hero number above it.
  if (coveredByPlan(item)) {
    return "Planned production covers the projected stockout — verify it lands.";
  }
  const stockoutDate =
    item.stockout_at_day_with_production ?? item.earliest_stockout_date;
  if (item.risk_tier === "stockout" && stockoutDate) {
    return `Stockout projected ${fmtDateLong(stockoutDate)}.`;
  }
  if (item.risk_tier === "critical") {
    return `Cover below lead time (${item.effective_lead_time_days}d). Replenish soon.`;
  }
  if (item.risk_tier === "watch") {
    return `Within 1.5× lead time (${item.effective_lead_time_days}d). Monitor.`;
  }
  return "Healthy through the visible horizon.";
}

function DigestStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[9px] font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tabular-nums text-fg-strong",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

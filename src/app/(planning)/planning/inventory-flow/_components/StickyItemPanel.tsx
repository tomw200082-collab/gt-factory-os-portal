"use client";

// ---------------------------------------------------------------------------
// StickyItemPanel — left-most sticky panel for an item row in the grid.
//
// Operational Clarity v2 — POLISH PASS 3 (2026-05-05, sticky col + headers
// expert UX iteration):
//   - Item name allows up to 2 lines (line-clamp-2) — preserves long
//     product names like "MUZA HERBAL MULE BLISS COCKTAIL 0.2L" instead of
//     truncating mid-word.
//   - Family chip is now a colored pill — family color at 15% alpha bg +
//     family color text at full saturation (border at 25%). Cohesive
//     brand signal that pairs with the 3px family stripe.
//   - Family stripe gets a subtle top-to-bottom gradient (full alpha at
//     top, 75% at bottom) — depth, not flat. Modern data-row treatment.
//   - Days-cover hero sprouts a tiny trend arrow (▲ growing / ▼ shrinking
//     / – stable) computed from comparing today's projected EOD vs the
//     +7-day projected EOD. Arrow is colored to the cover-tier so the
//     direction signal stays risk-aware.
//   - Hero pulses (1 → 1.04 → 1, 1.5s loop) when days-cover < 3 — the
//     most urgent items literally beat. Pulse is reduce-motion safe.
//   - Layered right boundary preserved (inset hairline + soft drop shadow)
//     for the sticky-vs-grid surface separation.
//
// Sources consulted: Refactoring UI principles on row identity hierarchy
// (whitespace + muted secondary lines); shadcn-ui sticky-column inset
// shadow discussion #4202; NN/g frozen-columns guidance.
//
// `position: sticky; left: 0` keeps it pinned while the day columns scroll.
// Background must remain opaque so scrolling content doesn't bleed through.
// ---------------------------------------------------------------------------

import { memo, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { daysCoverTierClass, formatDaysCover } from "../_lib/format";
import { familyVar } from "../_lib/family";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowItem } from "../_lib/types";
import { Sparkline } from "./Sparkline";

// Server-locked horizon length matches handler.flow.ts HORIZON_DAYS.
const HORIZON_DAYS = 56;

// Threshold (in stock units) below which a day-7 vs day-0 EOD delta is
// considered "stable" rather than directional. Picked at 5% of current
// on-hand floor so tiny demand jitter doesn't flip the arrow daily.
const TREND_NOISE_FRACTION = 0.05;

interface StickyItemPanelProps {
  item: FlowItem;
}

/**
 * Compute the 7-day cover trend direction by comparing today's
 * production-aware EOD against the +7-day production-aware EOD. Stability
 * band = max(2 units, 5% of today's EOD) so micro-fluctuations register
 * as "stable", not "shrinking".
 */
function coverTrend(item: FlowItem): "up" | "down" | "flat" {
  const days = item.days;
  if (!days || days.length < 8) return "flat";
  const todayEod = days[0]?.projected_on_hand_eod_with_production ?? 0;
  const futureEod = days[7]?.projected_on_hand_eod_with_production ?? 0;
  const delta = futureEod - todayEod;
  const noiseBand = Math.max(2, Math.abs(todayEod) * TREND_NOISE_FRACTION);
  if (delta > noiseBand) return "up";
  if (delta < -noiseBand) return "down";
  return "flat";
}

function StickyItemPanelInner({ item }: StickyItemPanelProps) {
  const style = RISK_TIER_STYLE[item.risk_tier];

  // Production-aware days-cover with horizon-length sentinel handling.
  const cover =
    item.days_cover_with_production != null
      ? item.days_cover_with_production
      : item.days_of_cover;
  const isFullHorizon =
    item.days_cover_with_production != null &&
    item.days_cover_with_production >= HORIZON_DAYS;

  const semantic = formatDaysCover(cover);
  const heroValue = isFullHorizon ? ">8w" : semantic.value;
  const heroSub = isFullHorizon ? "cover" : semantic.sub;
  const heroToneClass = isFullHorizon
    ? "text-tier-healthy-bg"
    : daysCoverTierClass(cover);

  const familyTintRef = familyVar(item.family);

  // Urgent pulse only when cover is critically low (< 3 days). STOCKOUT
  // (cover < 0) also qualifies.
  const isUrgent =
    typeof cover === "number" && Number.isFinite(cover) && cover < 3;

  const trend = coverTrend(item);

  // Inline custom-property bag — surfaces the family color to two CSS
  // utilities (`family-stripe` reads `--stripe-color`, `family-pill`
  // reads `--family-tint`).
  const styleVars: CSSProperties = {
    ["--stripe-color" as string]: familyTintRef,
    ["--family-tint" as string]: familyTintRef,
    // Layered right boundary — preserved from polish-pass-2.
    boxShadow:
      "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
  };

  return (
    <div
      role="rowheader"
      className="sticky left-0 z-20 flex h-full items-stretch overflow-hidden bg-bg-raised relative"
      style={styleVars}
    >
      {/* 3px family-color stripe — its own absolutely-positioned slab so
          we can give it a top-to-bottom gradient (depth, not flat). */}
      <div
        className="family-stripe pointer-events-none absolute left-0 top-0 h-full w-[3px] z-10"
        aria-hidden
      />

      <div className="relative flex flex-1 items-stretch gap-3 pl-3 pr-2">
        {/* Item identity + family + status — primary column. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2">
          <div
            className="flow-item-name-2line text-[13px] font-medium leading-tight text-fg-strong"
            title={item.item_name}
          >
            {item.item_name}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
            {item.family ? (
              <span
                className="family-pill"
                style={{ ["--family-tint" as string]: familyTintRef }}
                title={item.family}
              >
                {item.family}
              </span>
            ) : null}
            <Badge tone={style.badgeTone} variant="soft" dotted>
              {style.label}
            </Badge>
          </div>
        </div>

        {/* Sparkline column — fixed 80px slot; centered vertically. Bumped
            from 64px so 14 points render unconstrained. */}
        <div className="flex w-20 shrink-0 items-center justify-center">
          <Sparkline
            days={item.days.slice(0, 14)}
            riskTier={item.risk_tier}
            width={80}
            height={20}
            className="opacity-90"
          />
        </div>

        {/* Days-cover hero — bounded stat tile with trend arrow + urgent
            pulse. 96px wide so STOCKOUT + sub label fit comfortably. */}
        <div
          className="relative flex w-24 shrink-0 flex-col items-center justify-center overflow-hidden border-l border-border/60 bg-bg-subtle/40 px-2 py-2"
          style={{ borderLeftColor: `hsl(var(--border) / 0.6)` }}
        >
          <div
            className={cn(
              "flex w-full items-center justify-center gap-1 leading-none",
              isUrgent && "cover-urgent-pulse",
            )}
          >
            <div
              className={cn(
                "min-w-0 truncate text-center font-semibold tabular-nums",
                heroSub ? "text-[16px]" : "text-[12px]",
                heroToneClass,
              )}
              data-testid="row-days-cover-hero"
              title={heroValue}
            >
              {heroValue}
            </div>
            {/* Trend arrow — only when there is a sub label (i.e. a
                normal cover value, not STOCKOUT or em-dash). Inherits
                the hero-tone color so the direction signal stays
                risk-aware. */}
            {heroSub ? (
              <span
                className={cn("shrink-0", heroToneClass)}
                data-testid="row-days-cover-trend"
                aria-label={`cover trend ${trend}`}
                title={
                  trend === "up"
                    ? "cover growing vs +7d"
                    : trend === "down"
                      ? "cover shrinking vs +7d"
                      : "cover stable vs +7d"
                }
              >
                {trend === "up" ? (
                  <ArrowUp size={11} strokeWidth={2.25} aria-hidden />
                ) : trend === "down" ? (
                  <ArrowDown size={11} strokeWidth={2.25} aria-hidden />
                ) : (
                  <Minus size={11} strokeWidth={2.25} aria-hidden />
                )}
              </span>
            ) : null}
          </div>
          {heroSub ? (
            <div
              className="mt-1 w-full truncate text-center text-[9px] uppercase tracking-sops leading-none text-fg-subtle"
              title={heroSub}
            >
              {heroSub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const StickyItemPanel = memo(StickyItemPanelInner);

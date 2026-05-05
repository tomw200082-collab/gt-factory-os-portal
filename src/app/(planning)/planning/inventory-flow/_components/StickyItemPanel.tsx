"use client";

// ---------------------------------------------------------------------------
// StickyItemPanel — left-most sticky panel for an item row in the grid.
//
// Operational Clarity v2 (2026-05-05) — POLISH PASS 2:
//   - Width inherits from the grid track (`var(--item-col-w)` 400px) — no
//     fixed-width wrapper. This guarantees pixel alignment with the
//     sticky header's top-left corner cell.
//   - Family color: 3px left rule — confident brand-signal stripe.
//   - Days-cover hero: prominent number + tiny uppercase "cover" sub-label.
//   - Sparkline: 80px wide slot so 14 points render unconstrained.
//   - Cover tile: 96px slot so "STOCKOUT" + ">8w / cover" sit comfortably.
//   - Right boundary: layered inset hairline + soft 6px drop shadow that
//     visually separates the sticky col from the data grid (Tom feedback
//     2026-05-05: 1px border was too easy to miss; the cover tile was
//     reading as crowding the first data cell).
//
// `position: sticky; left: 0` keeps it pinned while the day columns scroll.
// Background must remain opaque so scrolling content doesn't bleed through.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { daysCoverTierClass, formatDaysCover } from "../_lib/format";
import { familyAccent } from "../_lib/family";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowItem } from "../_lib/types";
import { Sparkline } from "./Sparkline";

// Server-locked horizon length matches handler.flow.ts HORIZON_DAYS.
const HORIZON_DAYS = 56;

interface StickyItemPanelProps {
  item: FlowItem;
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

  const familyColor = familyAccent(item.family);

  return (
    <div
      role="rowheader"
      className="sticky left-0 z-20 flex h-full items-stretch overflow-hidden bg-bg-raised"
      style={{
        // 3px family color rule on the left edge — confident brand signal
        // (the 2px variant was too easy to miss on dark theme).
        borderLeft: `3px solid ${familyColor}`,
        // Layered right boundary: inset 1px hairline + 6px soft drop shadow
        // falling into the data grid. Visually distinct surface from the
        // first data cell without expanding layout. Tom feedback 2026-05-05:
        // a single 1px border didn't isolate the sticky col strongly enough.
        boxShadow:
          "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
      }}
    >
      <div className="flex flex-1 items-stretch gap-3 pl-3 pr-2">
        {/* Item identity + family + status — primary column. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2">
          <div className="truncate text-[13px] font-medium leading-tight text-fg-strong">
            {item.item_name}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
            {item.family ? (
              <span className="rounded-sm bg-bg-muted px-1 py-0.5 uppercase tracking-sops leading-none">
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

        {/* Days-cover hero — bounded stat tile. 96px wide (was 84) so
            "STOCKOUT" + a faint sub-label sit comfortably with breathing
            room next to the sparkline. overflow-hidden + truncate on every
            text node guarantees containment against any future longer
            string. Tom feedback 2026-05-05: cover tile + first data cell
            still felt crowded at 84px. */}
        <div className="flex w-24 shrink-0 flex-col items-center justify-center overflow-hidden border-l border-border/60 bg-bg-subtle/40 px-2 py-2">
          <div
            className={cn(
              "w-full truncate text-center font-semibold leading-none tabular-nums",
              heroSub ? "text-[16px]" : "text-[12px]",
              heroToneClass,
            )}
            data-testid="row-days-cover-hero"
            title={heroValue}
          >
            {heroValue}
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

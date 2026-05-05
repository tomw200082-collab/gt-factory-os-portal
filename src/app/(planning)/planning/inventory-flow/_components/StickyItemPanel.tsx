"use client";

// ---------------------------------------------------------------------------
// StickyItemPanel — left-most sticky panel for an item row in the grid.
//
// Operational Clarity v2 (2026-05-05):
//   - Width inherits from the grid track (`var(--item-col-w)` 320px) — no
//     fixed-width wrapper. This guarantees pixel alignment with the
//     sticky header's top-left corner cell.
//   - Family color: 2px (was 3px) left rule — tighter, less visual weight.
//   - Days-cover hero: prominent number + tiny uppercase "cover" sub-label.
//   - Sparkline: 64px wide × 18px tall — sits between label and hero so
//     the slope reads naturally left-to-right alongside the days-cover.
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
      className="sticky left-0 z-20 flex h-full items-stretch border-r border-border bg-bg-raised"
      style={{
        // 2px family color rule on the left edge (tighter than the legacy
        // 3px; keeps the family signal without overpowering the row).
        borderLeft: `2px solid ${familyColor}`,
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

        {/* Sparkline column — fixed 64px slot; centered vertically. */}
        <div className="flex w-16 shrink-0 items-center justify-center">
          <Sparkline
            days={item.days.slice(0, 14)}
            riskTier={item.risk_tier}
            width={64}
            height={20}
            className="opacity-90"
          />
        </div>

        {/* Days-cover hero — its OWN bounded slot. The 1px left divider +
            background tile + 64px fixed width + centered alignment makes it
            read as a "stat tile" rather than floating text. Tom feedback
            2026-05-05: needed a clear frame around the days-cover number. */}
        <div className="flex w-[68px] shrink-0 flex-col items-center justify-center border-l border-border/60 bg-bg-subtle/40 py-2">
          <div
            className={cn(
              "text-[16px] font-semibold leading-none tabular-nums",
              heroToneClass,
            )}
            data-testid="row-days-cover-hero"
          >
            {heroValue}
          </div>
          {heroSub ? (
            <div className="mt-1 text-[9px] uppercase tracking-sops leading-none text-fg-subtle">
              {heroSub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const StickyItemPanel = memo(StickyItemPanelInner);

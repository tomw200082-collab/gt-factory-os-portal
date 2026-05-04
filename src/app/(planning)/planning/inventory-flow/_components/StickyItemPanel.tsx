"use client";

// ---------------------------------------------------------------------------
// StickyItemPanel — left-most 320px panel for an item row in the desktop
// grid. Operational Clarity redesign 2026-05-04:
//   - 3px family-color accent strip on the far left
//   - Item name + family chip + risk badge
//   - Inline sparkline (14-day projected_on_hand_eod_with_production)
//   - Days-of-cover hero with semantic label (STOCKOUT / Nd / Nw / >3w),
//     colored by row tier
//
// `position: sticky; left: 0` keeps it pinned while the day columns scroll.
// Background must remain opaque so scrolling content doesn't bleed through.
//
// Performance: wrapped in React.memo. 68 instances per render; FlowItem
// reference is stable across TanStack Query refetches.
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
      className="sticky left-0 z-10 flex h-[52px] w-[320px] items-stretch border-r border-border/40 bg-bg-raised"
      style={{ borderLeft: `3px solid ${familyColor}` }}
    >
      <div className="flex flex-1 items-center justify-between gap-2 px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg-strong">
            {item.item_name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-3xs text-fg-muted">
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

        {/* Sparkline — sits between the label and the hero numerals so the
            slope reads naturally left-to-right alongside the days-cover. */}
        <Sparkline
          days={item.days.slice(0, 14)}
          riskTier={item.risk_tier}
          width={64}
          height={18}
          className="opacity-90"
        />

        <div className="text-right">
          <div
            className={cn(
              "text-xl font-semibold leading-none tabular-nums",
              heroToneClass,
            )}
            data-testid="row-days-cover-hero"
          >
            {heroValue}
          </div>
          {heroSub ? (
            <div className="mt-1 text-3xs uppercase tracking-sops text-fg-subtle">
              {heroSub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const StickyItemPanel = memo(StickyItemPanelInner);

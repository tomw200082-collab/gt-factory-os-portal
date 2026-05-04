"use client";

// ---------------------------------------------------------------------------
// StickyItemPanel — 320px wide left panel for a single item in the desktop
// grid. Contains:
//   - 4px tier strip on the far-left (the only "loud" element when stockout)
//   - Item name + family chip + risk badge
//   - Days-of-cover hero (text-2xl tabular-nums)
//
// `position: sticky; left: 0` keeps it pinned while the day columns scroll.
//
// Performance: wrapped in React.memo. 68 instances per render; FlowItem
// reference is stable across TanStack Query refetches when data hasn't
// changed, so memo skips re-render entirely on filter / search / hover.
// ---------------------------------------------------------------------------

import { memo } from "react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { fmtDaysOfCover } from "../_lib/format";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowItem } from "../_lib/types";

// Server-locked horizon length matches handler.flow.ts HORIZON_DAYS.
const HORIZON_DAYS = 56;

interface StickyItemPanelProps {
  item: FlowItem;
}

function StickyItemPanelInner({ item }: StickyItemPanelProps) {
  const style = RISK_TIER_STYLE[item.risk_tier];

  // Polish A v3 review (2026-05-04) — prefer the production-aware
  // days-cover hero. The server returns the horizon length (56 days =
  // 8 weeks) when no production-aware stockout falls within the visible
  // 8-week horizon, so we render ">8w cover" rather than a misleading
  // exact "56 days". Falls back to the production-blind `days_of_cover`
  // when the API hasn't shipped the new field yet.
  const cover =
    item.days_cover_with_production != null
      ? item.days_cover_with_production
      : item.days_of_cover;
  const isFullHorizon =
    item.days_cover_with_production != null &&
    item.days_cover_with_production >= HORIZON_DAYS;

  return (
    <div className="sticky left-0 z-10 flex h-[52px] w-[320px] items-stretch border-r border-border/40 bg-bg">
      {/* tier strip */}
      <div className={cn("w-1 shrink-0", style.stripClass)} aria-hidden />
      <div className="flex flex-1 items-center justify-between gap-3 px-3">
        <div className="min-w-0">
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
        <div className="text-right">
          <div className="text-2xl font-semibold leading-none tabular-nums text-fg-strong">
            {isFullHorizon ? ">8w" : fmtDaysOfCover(cover)}
          </div>
          <div className="mt-1 text-3xs text-fg-subtle">
            {isFullHorizon ? "cover" : "days cover"}
          </div>
        </div>
      </div>
    </div>
  );
}

export const StickyItemPanel = memo(StickyItemPanelInner);

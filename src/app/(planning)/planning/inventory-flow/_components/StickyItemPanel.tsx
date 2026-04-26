"use client";

// ---------------------------------------------------------------------------
// StickyItemPanel — 320px wide left panel for a single item in the desktop
// grid. Contains:
//   - 4px tier strip on the far-left (the only "loud" element when stockout)
//   - Item name + family chip + risk badge
//   - Days-of-cover hero (text-2xl tabular-nums)
//
// `position: sticky; left: 0` keeps it pinned while the day columns scroll.
// ---------------------------------------------------------------------------

import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { fmtDaysOfCover } from "../_lib/format";
import { RISK_TIER_STYLE } from "../_lib/risk";
import type { FlowItem } from "../_lib/types";

interface StickyItemPanelProps {
  item: FlowItem;
}

export function StickyItemPanel({ item }: StickyItemPanelProps) {
  const style = RISK_TIER_STYLE[item.risk_tier];

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
            {fmtDaysOfCover(item.days_of_cover)}
          </div>
          <div className="mt-1 text-3xs text-fg-subtle">days cover</div>
        </div>
      </div>
    </div>
  );
}

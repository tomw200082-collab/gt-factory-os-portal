"use client";

// ---------------------------------------------------------------------------
// MobileCardStream — vertical list of mobile item cards.
//
// Thin synopsis strip at the top of the list (non-sticky since Tranche
// 057 — the sticky FilterBar already carries the at-risk count and the
// old sticky version slid under the TopBar). Pull-to-refresh via a touch
// handler that triggers when the user pulls down past 60px at scroll-top
// (the page scrolls on `window` — AppShellChrome's <main> is not an
// overflow container — so the `window.scrollY` check is correct).
// ---------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  sortItems,
  type FlowSortKey,
} from "../_lib/production-lens";
import { fmtDaysFromNow } from "../_lib/format";
import type { FlowItem, FlowSummary } from "../_lib/types";
import type { PlannedInflowRow } from "../_lib/plannedInflow";
import { MobileItemCard } from "./MobileItemCard";

interface MobileCardStreamProps {
  items: FlowItem[];
  summary: FlowSummary | null;
  onRefresh?: () => void;
  /** When true, mobile cards render planned-inflow chips per day. */
  overlayEnabled?: boolean;
  /** Pre-indexed `${item_id}|${plan_date}` → row map for O(1) lookup. */
  plannedByItemDate?: Map<string, PlannedInflowRow>;
  /**
   * When true, each card is rendered as a non-clickable wrapper instead
   * of a `<Link>` to `/planning/inventory-flow/[itemId]`. Used by the
   * supply view, where per-SKU drill-down for components is deferred to
   * v2. Default `false` keeps FG behaviour unchanged.
   */
  disableRowLink?: boolean;
  /** When true, coverage-days heat badge is shown on each mobile card. */
  showCoverageHeatmap?: boolean;
  /** itemId → coverage days (null if unavailable). */
  coverageDaysMap?: Map<string, number | null>;
  /** Called with the item_id when the user clicks a card (R-NEW-5). */
  onSelectItem?: (itemId: string) => void;
  /** When true, render 4-week net movement sparklines on each card. */
  showMovementSparklines?: boolean;
  /** item_id → array of 4 weekly net movement values. */
  movementByItemId?: Map<string, number[]>;
  /** Production-lens ordering (Tranche 058). Default "urgency" preserves
   *  the pre-058 risk sort exactly. */
  sortKey?: FlowSortKey;
}

export function MobileCardStream({
  items,
  summary,
  onRefresh,
  overlayEnabled = false,
  plannedByItemDate,
  disableRowLink = false,
  showCoverageHeatmap = false,
  coverageDaysMap,
  showMovementSparklines = false,
  movementByItemId,
  sortKey = "urgency",
}: MobileCardStreamProps) {
  const sorted = useMemo(() => sortItems(items, sortKey), [items, sortKey]);
  const queryClient = useQueryClient();
  const startY = useRef<number | null>(null);
  const [pullPx, setPullPx] = useState(0);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0]?.clientY ?? null;
      } else {
        startY.current = null;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy > 0) setPullPx(Math.min(dy, 80));
    }
    function onTouchEnd() {
      if (pullPx > 60) {
        queryClient.invalidateQueries({ queryKey: ["inventory-flow"] });
        onRefresh?.();
      }
      setPullPx(0);
      startY.current = null;
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [queryClient, pullPx, onRefresh]);

  return (
    <div className="space-y-3">
      {/* Pull-to-refresh hint */}
      {pullPx > 0 ? (
        <div
          className="flex h-12 items-center justify-center text-2xs uppercase tracking-sops text-fg-muted"
          style={{ height: pullPx }}
        >
          {pullPx > 60 ? "Release to refresh" : "Pull to refresh"}
        </div>
      ) : null}

      {/* Synopsis — plain (non-sticky) summary strip (Tranche 057,
          FLOW-M03/M10). The previous `sticky top-0 -mx-4` version slid
          underneath the sticky TopBar (z-40) and assumed exactly 16px of
          parent padding for its full-bleed trick. The at-risk count stays
          permanently visible anyway in the sticky FilterBar's "At risk
          only" segment, so the strip only needs to orient at the top of
          the list, not follow the scroll. */}
      {summary ? (
        <div className="rounded-sm border border-border/40 bg-bg-subtle/60 px-3 py-2">
          <div className="text-3xs uppercase tracking-sops text-fg-subtle">
            <span className="font-semibold text-danger-fg tabular-nums">
              {summary.at_risk_count}
            </span>{" "}
            at risk{" "}
            {summary.earliest_stockout
              ? `· earliest ${fmtDaysFromNow(summary.earliest_stockout.date)}`
              : ""}
          </div>
        </div>
      ) : null}

      {sorted.map((item) => (
        <MobileItemCard
          key={item.item_id}
          item={item}
          overlayEnabled={overlayEnabled}
          plannedByItemDate={plannedByItemDate}
          disableRowLink={disableRowLink}
          showCoverageHeatmap={showCoverageHeatmap}
          coverageDays={coverageDaysMap?.get(item.item_id) ?? null}
          showMovementSparklines={showMovementSparklines}
          movementWeeks={movementByItemId?.get(item.item_id)}
        />
      ))}
    </div>
  );
}

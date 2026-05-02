"use client";

// ---------------------------------------------------------------------------
// MobileCardStream — vertical list of mobile item cards.
//
// Sticky thin synopsis header + sticky filter chips. Pull-to-refresh
// via a touch handler that triggers when the user pulls down past 60px
// at scroll-top.
// ---------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { compareItemsByRisk } from "../_lib/risk";
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
}

export function MobileCardStream({
  items,
  summary,
  onRefresh,
  overlayEnabled = false,
  plannedByItemDate,
}: MobileCardStreamProps) {
  const sorted = useMemo(() => [...items].sort(compareItemsByRisk), [items]);
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

      {/* Synopsis */}
      {summary ? (
        <div className="sticky top-0 z-10 -mx-4 border-b border-border/40 bg-bg/95 px-4 py-2 backdrop-blur">
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
        />
      ))}
    </div>
  );
}

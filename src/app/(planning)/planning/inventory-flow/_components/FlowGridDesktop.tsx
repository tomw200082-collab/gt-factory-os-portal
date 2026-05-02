"use client";

// ---------------------------------------------------------------------------
// FlowGridDesktop — main desktop grid for Inventory Flow.
//
// Layout:
//   Sticky left:  320px item panel (StickyItemPanel)
//   Daily band:   14 columns × 64px (DayCell)
//   Spacer:       16px
//   Weekly band:  6 columns × 96px (WeekCell) covering weeks 3..8
//
// Today column auto-scrolls into view on first mount.
// Items pre-sorted by server (§6.4) but we re-apply client-side sort so
// pagination / filter changes stay deterministic.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef } from "react";
import { compareItemsByRisk } from "../_lib/risk";
import { todayIsoLocal } from "../_lib/format";
import type { FlowItem } from "../_lib/types";
import {
  weeklySumsByItem,
  type PlannedInflowRow,
} from "../_lib/plannedInflow";
import { DayCell } from "./DayCell";
import { DayHeaderRow } from "./DayHeaderRow";
import { StickyItemPanel } from "./StickyItemPanel";
import { WeekCell } from "./WeekCell";

interface FlowGridDesktopProps {
  items: FlowItem[];
  /** When true, render planned-inflow overlay chips/tooltip section. */
  overlayEnabled?: boolean;
  /** Pre-indexed `${item_id}|${plan_date}` → row map for O(1) day-cell lookup. */
  plannedByItemDate?: Map<string, PlannedInflowRow>;
  /** Full row array (used for client-side weekly aggregation per item). */
  plannedRows?: PlannedInflowRow[];
}

export function FlowGridDesktop({
  items,
  overlayEnabled = false,
  plannedByItemDate,
  plannedRows,
}: FlowGridDesktopProps) {
  const sortedItems = useMemo(
    () => [...items].sort(compareItemsByRisk),
    [items],
  );

  // Days / weeks shape derived from first item (all items have same horizon).
  const firstItem = sortedItems[0];
  const days = firstItem?.days ?? [];
  const weeks = firstItem?.weeks ?? [];

  // Daily window covers first 2 weeks (=14 days). Remaining weeks render as
  // weekly cells.
  const dailyWeekCount = Math.ceil(days.length / 7);
  const weeklyOnly = weeks.slice(dailyWeekCount);

  const todayIso = todayIsoLocal();
  const todayIdx = days.findIndex((d) => d.day === todayIso);

  // Auto-scroll today into view on mount.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollerRef.current || todayIdx < 0) return;
    const el = scrollerRef.current;
    // 320 sticky panel + idx*64 column - one column to give context
    const target = 320 + Math.max(0, (todayIdx - 1) * 64);
    el.scrollTo({ left: target, behavior: "auto" });
  }, [todayIdx]);

  // Avg daily demand across visible window — for "demand spike" arrow on cells.
  const avgDailyDemand = useMemo(() => {
    if (sortedItems.length === 0 || days.length === 0) return 0;
    let total = 0;
    let count = 0;
    for (const it of sortedItems) {
      for (const d of it.days) {
        if (d.tier !== "non_working") {
          total += d.demand_lionwheel + d.demand_forecast;
          count += 1;
        }
      }
    }
    return count > 0 ? total / count : 0;
  }, [sortedItems, days.length]);

  if (sortedItems.length === 0) {
    return null;
  }

  // weeklyOnly is recomputed per item below; suppress unused-var lint via void.
  void weeklyOnly;

  return (
    <div
      ref={scrollerRef}
      className="overflow-x-auto overflow-y-visible rounded-md border border-border/40 bg-bg-raised"
    >
      <DayHeaderRow days={days} weeks={weeks} />
      <div>
        {sortedItems.map((item) => (
          <ItemRow
            key={item.item_id}
            item={item}
            avgDailyDemand={avgDailyDemand}
            todayIso={todayIso}
            overlayEnabled={overlayEnabled}
            plannedByItemDate={plannedByItemDate}
            plannedRows={plannedRows}
          />
        ))}
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: FlowItem;
  avgDailyDemand: number;
  todayIso: string;
  overlayEnabled: boolean;
  plannedByItemDate?: Map<string, PlannedInflowRow>;
  plannedRows?: PlannedInflowRow[];
}

function ItemRow({
  item,
  avgDailyDemand,
  todayIso,
  overlayEnabled,
  plannedByItemDate,
  plannedRows,
}: ItemRowProps) {
  const dailyWeekCount = Math.ceil(item.days.length / 7);
  const weeklyOnly = item.weeks.slice(dailyWeekCount);

  // Client-side weekly aggregation — sum planned-remaining quantities for
  // this item across each week_start (Sunday-anchored). Computed once per
  // item-row render; cheap because plannedRows is bounded by horizon.
  const weeklySums = useMemo(
    () =>
      overlayEnabled
        ? weeklySumsByItem(plannedRows, item.item_id)
        : new Map<string, number>(),
    [overlayEnabled, plannedRows, item.item_id],
  );

  return (
    <div className="flex border-b border-border/30 last:border-b-0 hover:bg-bg-subtle/30">
      <StickyItemPanel item={item} />
      {item.days.map((d) => {
        const plannedRow = overlayEnabled
          ? plannedByItemDate?.get(`${item.item_id}|${d.day}`)
          : undefined;
        return (
          <div
            key={d.day}
            className="border-r border-border/30 last:border-r-0"
          >
            <DayCell
              item={item}
              day={d}
              avgDailyDemand={avgDailyDemand}
              isToday={d.day === todayIso}
              overlayEnabled={overlayEnabled}
              plannedRow={plannedRow}
            />
          </div>
        );
      })}
      {/* spacer between daily and weekly bands */}
      <div className="h-[52px] w-4 shrink-0" />
      {weeklyOnly.map((w) => (
        <div
          key={w.week_start}
          className="border-l border-r border-border/30"
        >
          <WeekCell
            week={w}
            overlayEnabled={overlayEnabled}
            plannedRemainingQty={weeklySums.get(w.week_start) ?? 0}
            sales_uom={null}
          />
        </div>
      ))}
    </div>
  );
}

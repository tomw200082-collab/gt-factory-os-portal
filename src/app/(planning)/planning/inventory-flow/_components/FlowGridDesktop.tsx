"use client";

// ---------------------------------------------------------------------------
// FlowGridDesktop — main desktop grid for Inventory Flow.
//
// Operational Clarity v2 (2026-05-05) — STRUCTURAL ALIGNMENT FIX
// =============================================================
// Tom feedback 2026-05-04:
//   1. "המספרים מקוטעים מכיוון שעולים על המשבצות" — numbers cut off
//      because they overflow cells. Production-receipt chip overlapped
//      the cell number due to `position: absolute`.
//   2. "הימים והתאריכים לא עומדים בדיוק מעל היום שלהם והעמודות לא
//      ישרות" — day headers don't sit exactly above their column. Header
//      and body used DIFFERENT layout systems (header: flex w-[64px];
//      body: flex w-[64px]) and pixel widths drifted.
//   3. "אני מעדיף שייראו פחות משבצות אבל כאשר אני אגלול הצידה אני
//      אראה בבירור ובדיוק מה המשבצת של איזה יום" — prefer fewer
//      visible cells, but when scrolling sideways the cell-to-day binding
//      must be unambiguous.
//
// Fix:
//   - Single CSS-Grid `grid-template-columns` shared between header and
//     every body row via the `--flow-grid-cols` custom property set on
//     the wrapper.
//   - Per-cell widths come from CSS variables (`--day-col-w` 80px,
//     `--week-col-w` 96px, `--item-col-w` 320px). Constants exported
//     from this module so React siblings can reason about them.
//   - Fixed-width tracks; cells set `width: var(...)` so min === max ===
//     width — no flex-shrink drift.
//   - Outer wrapper: `overflow-x: auto` + `overflow-y: visible` so Tom
//     can scroll horizontally; sticky item col + sticky header keep the
//     cross-hairs visible.
//
// Layout (left-to-right):
//   Sticky item col:  320px  (StickyItemPanel)
//   Daily band:       14 columns × 80px (DayCell)        ← was 64px
//   Spacer:           16px
//   Weekly band:      6 columns × 96px (WeekCell)
//
// Today column auto-scrolls into view on first mount.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
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

// ----- Grid track widths (shared between header + body) ---------------------
// Tom locked: prefer fewer cells with crisp alignment over many narrow cells.
// 80px daily column comfortably fits "1.5K" (cell number) AND a "▼ 517"
// production-receipt chip stacked on top of it without clipping.
export const ITEM_COL_W = 360; // px — sticky left column (was 320; bumped 2026-05-05 so days-cover hero has clear breathing room within its frame)
export const DAY_COL_W = 80; // px — daily band cell
export const WEEK_COL_W = 96; // px — weekly band cell
export const BAND_GAP_W = 16; // px — spacer between daily and weekly bands
export const ROW_H = 56; // px — cell row height (was 52; +4px for chip stack)

// ----- CSS-only constants (consumable via inline style) ---------------------
function gridStyle(dayCount: number, weekCount: number): CSSProperties {
  return {
    // The shared template: sticky col + N daily + spacer + M weekly.
    gridTemplateColumns:
      `${ITEM_COL_W}px` +
      ` repeat(${dayCount}, ${DAY_COL_W}px)` +
      ` ${BAND_GAP_W}px` +
      ` repeat(${weekCount}, ${WEEK_COL_W}px)`,
    // Surface widths to children that don't use `display: contents`.
    ["--item-col-w" as string]: `${ITEM_COL_W}px`,
    ["--day-col-w" as string]: `${DAY_COL_W}px`,
    ["--week-col-w" as string]: `${WEEK_COL_W}px`,
    ["--row-h" as string]: `${ROW_H}px`,
  };
}

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
    // sticky item col + (idx-1) day cols → leave one column of context.
    const target = ITEM_COL_W + Math.max(0, (todayIdx - 1) * DAY_COL_W);
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

  const dayCount = days.length;
  const weekCount = weeklyOnly.length;
  const sharedGridStyle = gridStyle(dayCount, weekCount);

  return (
    <div
      ref={scrollerRef}
      className="flow-grid-scroller overflow-x-auto overflow-y-visible rounded-md border border-border/40 bg-bg-raised"
      data-testid="flow-grid-scroller"
    >
      {/* min-w-fit ensures the inner grid keeps its full width even when the
          viewport is narrower than the grid; combined with overflow-x-auto on
          the parent this gives Tom horizontal scroll. */}
      <div className="min-w-fit">
        <DayHeaderRow
          days={days}
          weeks={weeks}
          gridStyle={sharedGridStyle}
        />
        <div role="rowgroup">
          {sortedItems.map((item, rowIdx) => (
            <ItemRow
              key={item.item_id}
              item={item}
              avgDailyDemand={avgDailyDemand}
              todayIso={todayIso}
              overlayEnabled={overlayEnabled}
              plannedByItemDate={plannedByItemDate}
              plannedRows={plannedRows}
              rowIdx={rowIdx}
              gridStyle={sharedGridStyle}
            />
          ))}
        </div>
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
  rowIdx: number;
  gridStyle: CSSProperties;
}

function ItemRow({
  item,
  avgDailyDemand,
  todayIso,
  overlayEnabled,
  plannedByItemDate,
  plannedRows,
  rowIdx,
  gridStyle,
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

  // Stagger-fade the first 8 rows so the eye lands on critical_stockout
  // (always sorted to the top) first. Rows 9+ appear together.
  const staggerDelay = rowIdx < 8 ? `${rowIdx * 40}ms` : "0ms";
  const rowAnimStyle: CSSProperties = {
    animationDelay: staggerDelay,
  };

  return (
    <div
      role="row"
      className="grid border-b border-border/30 last:border-b-0 reveal hover:bg-bg-subtle/30"
      style={{ ...gridStyle, ...rowAnimStyle }}
    >
      <StickyItemPanel item={item} />
      {/* Spacer cells — daily band */}
      {item.days.map((d) => {
        const plannedRow = overlayEnabled
          ? plannedByItemDate?.get(`${item.item_id}|${d.day}`)
          : undefined;
        return (
          <DayCell
            key={d.day}
            item={item}
            day={d}
            avgDailyDemand={avgDailyDemand}
            isToday={d.day === todayIso}
            overlayEnabled={overlayEnabled}
            plannedRow={plannedRow}
          />
        );
      })}
      {/* Spacer between daily and weekly bands — occupies one grid track */}
      <div aria-hidden className="h-full" />
      {weeklyOnly.map((w) => (
        <WeekCell
          key={w.week_start}
          week={w}
          overlayEnabled={overlayEnabled}
          plannedRemainingQty={weeklySums.get(w.week_start) ?? 0}
          sales_uom={null}
        />
      ))}
    </div>
  );
}

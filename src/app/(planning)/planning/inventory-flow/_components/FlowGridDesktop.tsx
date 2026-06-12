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
//     `--week-col-w` 96px, `--item-col-w` 400px). Constants exported
//     from this module so React siblings can reason about them.
//   - Fixed-width tracks; cells set `width: var(...)` so min === max ===
//     width — no flex-shrink drift.
//   - Outer wrapper: `overflow-x: auto` + `overflow-y: visible` so Tom
//     can scroll horizontally; sticky item col + sticky header keep the
//     cross-hairs visible.
//
// Layout (left-to-right):
//   Sticky item col:  400px  (StickyItemPanel — 3px family + flex item +
//                              80px trend + 96px cover + paddings)
//   Daily band:       14 columns × 80px (DayCell)        ← was 64px
//   Spacer:           16px
//   Weekly band:      6 columns × 96px (WeekCell)
//
// Today column auto-scrolls into view on first mount.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { sortItems, type FlowSortKey } from "../_lib/production-lens";
import { todayIsoLocal } from "../_lib/format";
import type { FlowItem } from "../_lib/types";
import {
  weeklySumsByItem,
  type PlannedInflowRow,
} from "../_lib/plannedInflow";
import { cn } from "@/lib/cn";
import { DayCell } from "./DayCell";
import { DayHeaderRow } from "./DayHeaderRow";
import { StickyItemPanel } from "./StickyItemPanel";
import { WeekCell } from "./WeekCell";

// ----- Grid track widths (shared between header + body) ---------------------
// Tom locked: prefer fewer cells with crisp alignment over many narrow cells.
// 80px daily column comfortably fits "1.5K" (cell number) AND a "▼ 517"
// production-receipt chip stacked on top of it without clipping.
export const ITEM_COL_W = 400; // px — sticky left column (was 320 → 360 → 380 → 400; the 400 bump 2026-05-05 polish-pass-2 accommodates the 96px cover tile + 80px sparkline + breathing room next to the data grid)
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
  /**
   * When true, the per-day popover's "Drill down" link is rendered as a
   * non-clickable label. Used by the supply view, where the FG drill-down
   * route does not yet handle component IDs. Default `false` keeps FG
   * behaviour unchanged.
   */
  disableRowLink?: boolean;
  /** When true, coverage-days heat badges are shown on item rows. */
  showCoverageHeatmap?: boolean;
  /** itemId → coverage days (null if unavailable). Used when showCoverageHeatmap is true. */
  coverageDaysMap?: Map<string, number | null>;
  /** Called with the item_id when the user clicks the detail chevron. */
  onSelectItem?: (itemId: string) => void;
  /** When true, render 4-week net movement sparklines on each item row. */
  showMovementSparklines?: boolean;
  /** item_id → array of 4 weekly net movement values. */
  movementByItemId?: Map<string, number[]>;
  /** Production-lens ordering (Tranche 058). Default "urgency" preserves
   *  the pre-058 risk sort exactly. */
  sortKey?: FlowSortKey;
}

export function FlowGridDesktop({
  items,
  overlayEnabled = false,
  plannedByItemDate,
  plannedRows,
  disableRowLink = false,
  showCoverageHeatmap = false,
  coverageDaysMap,
  onSelectItem,
  showMovementSparklines = false,
  movementByItemId,
  sortKey = "urgency",
}: FlowGridDesktopProps) {
  const sortedItems = useMemo(
    () => sortItems(items, sortKey),
    [items, sortKey],
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
              disableRowLink={disableRowLink}
              showCoverageHeatmap={showCoverageHeatmap}
              coverageDaysMap={coverageDaysMap}
              onSelectItem={onSelectItem}
              showMovementSparklines={showMovementSparklines}
              movementByItemId={movementByItemId}
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
  /** Forwarded to per-day popover; disables drill-down link when true. */
  disableRowLink?: boolean;
  /** When true, a coverage-days heat badge is shown on the sticky item panel. */
  showCoverageHeatmap?: boolean;
  /** itemId → coverage days (null if unavailable). */
  coverageDaysMap?: Map<string, number | null>;
  /** Called with the item_id when the user clicks the detail chevron. */
  onSelectItem?: (itemId: string) => void;
  /** When true, render 4-week net movement sparklines inline on each row. */
  showMovementSparklines?: boolean;
  /** item_id → array of 4 weekly net movement values. */
  movementByItemId?: Map<string, number[]>;
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
  disableRowLink = false,
  showCoverageHeatmap = false,
  coverageDaysMap,
  onSelectItem,
  showMovementSparklines = false,
  movementByItemId,
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

  // Coverage badge — computed once per row when heatmap is active.
  const coverageDays = showCoverageHeatmap
    ? (coverageDaysMap?.get(item.item_id) ?? null)
    : null;
  const coverageBadgeClass =
    coverageDays === null
      ? null
      : coverageDays <= 7
        ? "bg-danger-softer text-danger-fg"
        : coverageDays <= 30
          ? "bg-warning-softer text-warning-fg"
          : "bg-success-softer text-success-fg";

  // R-NEW-7 — Movement sparkline: compute SVG points from 4-week data.
  const movementSparklineEl = useMemo(() => {
    if (!showMovementSparklines) return null;
    const weeks = movementByItemId?.get(item.item_id);
    if (!weeks) return null;
    const xs = [5, 15, 25, 35] as const;
    const maxVal = Math.max(...weeks.map(Math.abs), 1);
    const pts = weeks
      .map((val, i) => `${xs[i]},${8 - (val / maxVal) * 6}`)
      .join(" ");
    return (
      <svg
        viewBox="0 0 40 16"
        width={40}
        height={16}
        className="inline-block ml-1"
        aria-hidden
      >
        <polyline
          points={pts}
          fill="none"
          className="stroke-info"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }, [showMovementSparklines, movementByItemId, item.item_id]);

  return (
    <div
      role="row"
      className="grid border-b border-border/30 last:border-b-0 reveal hover:bg-bg-subtle/30"
      style={{ ...gridStyle, ...rowAnimStyle }}
    >
      {/* Sticky item column. CRITICAL: the GRID ITEM itself carries
          `position: sticky; left: 0` (not an inner child) so its containing
          block is the full grid — the item names stay frozen across the
          ENTIRE horizontal scroll, not just the first ITEM_COL_W px. This
          mirrors the sticky item-col cell in DayHeaderRow; previously the
          sticky lived on the inner StickyItemPanel, whose containing block
          was this 400px wrapper, so the names scrolled away after ~400px
          (and on first paint, because the grid auto-scrolls to "today").
          The element is also the positioning context for the absolute
          badges/chevron below (sticky establishes a containing block). */}
      <div className="sticky left-0 z-20 bg-bg-raised">
        <StickyItemPanel item={item} />
        {/* R-NEW-7 — Movement sparkline rendered after the cover tile */}
        {movementSparklineEl !== null ? (
          <span className="absolute bottom-1 left-4 z-30 pointer-events-none">
            {movementSparklineEl}
          </span>
        ) : null}
        {showCoverageHeatmap && coverageDays !== null && coverageBadgeClass ? (
          <span
            className={cn(
              "absolute left-4 top-1 z-30 text-3xs font-medium rounded px-1 leading-tight pointer-events-none",
              coverageBadgeClass,
            )}
            aria-label={`Coverage: ${coverageDays} days`}
          >
            {coverageDays}d
          </span>
        ) : null}
        {/* R-NEW-5 — detail-chevron button; only when parent wires onSelectItem */}
        {onSelectItem ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectItem(item.item_id);
            }}
            className="absolute bottom-1 right-1 z-30 inline-flex h-5 w-5 items-center justify-center rounded-sm text-fg-faint opacity-50 hover:opacity-100 hover:text-fg-muted transition-opacity"
            aria-label={`View detail for ${item.item_name}`}
            title="Open item detail"
          >
            <ChevronRight size={12} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
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
            disableRowLink={disableRowLink}
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

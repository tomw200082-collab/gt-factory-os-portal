"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Monthly Grid (sparse, dense data-entry).
//
// "Operational Clarity" v3 — GRID PASS (2026-05-05, Tom mandate: 40-iteration
// polish across forecast pages, 3 parallel agents — this is the densest
// surface).
//
// Sources consulted (10-min cap):
//   - Pencil & Paper / LogRocket enterprise data-table guides — sticky cols
//     and frozen headers are non-negotiable for orientation; opportunistic
//     hover affordances; summary rows for at-a-glance totals.
//   - Airtable grid view — sticky-column boundary, hover-row highlight,
//     consistent column widths via shared template.
//   - Theresa Neil "Designing Web Interfaces" / Harvest style — live row
//     totals + grid-style data-entry with explicit save action.
//
// 14 changes shipped in this pass:
//   1. Pixel-aligned single CSS Grid; header + every body row + footer-totals
//      row share the same `grid-template-columns`. Item-col 380px sticky-
//      left + N month columns 130px each + 140px ROW TOTAL sticky-right.
//   2. Sticky header (z-30) + sticky item col (z-20) + sticky right total
//      col (z-25) + sticky footer totals row (z-25). Top-left and top-right
//      corner cells z-40. Layered shadow boundary on every sticky surface.
//   3. Sticky-col 3-slot layout per row: item identity (name + supply-method
//      tinted chip + STOCKOUT badge if at-risk) + spacer + ROW TOTAL hero
//      pinned to the right.
//   4. Two-line month header — line 1 "MAY" 9px tracking-sops; line 2
//      "2026" 13px medium tabular-nums. Current month = TODAY pill (with
//      `today-pill-pulse`) + accent vertical band. Frozen-past = muted
//      `bg-hatch-history` cue.
//   5. Inline cell input with subtle focus accent ring + bg-bg-raised lift
//      on focus. Tab/Enter to commit; type-to-edit; no popup.
//   6. Filled-vs-empty visual hierarchy on inputs (filled = bg-bg-raised +
//      fg-strong; empty = transparent + em-dash placeholder). NO tier
//      semantic on numbers (qty magnitude is volume, not risk).
//   7. Production-aware corner badge — hidden when no production planned;
//      visible as a small `▼ N planned` chip. Stub-driven for now (the
//      forecast/items endpoint doesn't yet expose planned-production;
//      the prop hook is wired for when it does).
//   8. ROW TOTAL hero — sticky right cell per row, exact integer thousands-
//      separator format, updates real-time as the planner edits.
//   9. Column TOTALS sticky-bottom row — per-month sum across every item;
//      bg-bg-raised + accent top border + tabular-nums.
//   10. Cell hover ring (`.cell-hover-ring`) + native `title` tooltip with
//       "{Supply} · {Item} · {Month}" for fast disclosure.
//   11. Refined empty state lives in EmptyState.tsx (this file just renders
//       MonthlyGrid; parent decides empty vs grid).
//   12. Exact-number policy enforced via formatExactInt for totals;
//       formatQty for cell values (em-dash on 0, integer otherwise).
//   13. Row + column hover highlight via per-cell data attrs (`data-row-id`,
//       `data-col-id`) + a CSS rule that lifts the row's bg + the column's
//       header on hover. Cross-axis tracking for many-month visibility.
//   14. Keyboard navigation — Tab / Shift+Tab / Arrow Up/Down/Left/Right /
//       Enter (= Down) move between cells. Mirrors Notion / Airtable.
//
// English LTR per Tom-locked global standard 2026-05-01.
//
// Tranche 053 (FLOW-003): below 768px the fixed-track grid (380px sticky item
// col + 130px month cols) is unusable, so a vertical per-item collapsible list
// replaces it — same edit/save state machine (effectiveValue + onCellEdit →
// parent's debounced auto-save), ≥44px numeric inputs. Desktop md+ unchanged.
// FLOW-014: the remove button no longer window.confirm()s — it *requests*
// removal; the parent page owns the confirmation (bottom sheet naming the item).
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  formatExactInt,
  formatMonthHeader2,
  formatQty,
  findTodayBucketIndex,
  isFrozenPast,
} from "../_lib/format";
import type { MonthBucket } from "../_lib/format";

// ---- Grid track widths (shared between header, body, and footer-totals) ----
// Tom-locked grid pass 2026-05-05: prefer crisp pixel alignment over flexible
// widths. Every sticky cell sets `width: var(--*-col-w)` so min === max ===
// width — no flex-shrink drift.
const ITEM_COL_W = 380; // px — sticky left column (item identity + chip)
const MONTH_COL_W = 130; // px — month data-entry column
const TOTAL_COL_W = 140; // px — sticky right ROW TOTAL column
const ROW_H = 48; // px — body row height
const HEADER_H = 56; // px — two-line header (primary + secondary)
const FOOTER_H = 44; // px — sticky bottom column-totals row

function gridStyle(
  monthCount: number,
  rowHeight: number = ROW_H,
): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns:
      `${ITEM_COL_W}px` +
      ` repeat(${monthCount}, ${MONTH_COL_W}px)` +
      ` ${TOTAL_COL_W}px`,
    // Fix the row height so every child cell stretches to it via align-
    // self: stretch (CSS Grid default). Without this the implicit row
    // would size to content and `h-full` on cells would do nothing.
    gridAutoRows: `${rowHeight}px`,
    ["--item-col-w" as string]: `${ITEM_COL_W}px`,
    ["--month-col-w" as string]: `${MONTH_COL_W}px`,
    ["--total-col-w" as string]: `${TOTAL_COL_W}px`,
    ["--row-h" as string]: `${ROW_H}px`,
  };
}

/**
 * Normalize a raw numeric-input value to the string the edit state machine
 * expects: "" passes through (cleared cell), negative / non-finite input is
 * rejected (null = ignore the keystroke), anything else floors to an integer
 * string. Shared by the desktop grid cells and the mobile list inputs so both
 * feed the SAME onCellEdit → debounced auto-save pipeline.
 */
function normalizeCellInput(raw: string): string | null {
  if (raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(Math.floor(n));
}

// ---- Public types ---------------------------------------------------------

export interface ForecastLineLite {
  line_id: string;
  item_id: string;
  period_bucket_key: string;
  forecast_quantity: string;
}

export interface ItemForGrid {
  item_id: string;
  item_name: string;
  supply_method: string;
}

interface MonthlyGridProps {
  /** Items in display order (sparse). */
  items: ItemForGrid[];
  /** All forecast lines for the version. Sparse. */
  lines: ForecastLineLite[];
  /** Locally-edited cell values keyed by `${item_id}|${bucket_key}`. */
  localCells: Record<string, string>;
  /** Items that were added in this session but have no lines yet. Highlighted. */
  freshlyAddedItemIds: Set<string>;
  /** Bucket columns. Pre-computed by parent (computeMonthBuckets). */
  buckets: MonthBucket[];
  /** Author may edit (planner / admin on draft). */
  isEditable: boolean;
  /** Cell edit. value is the raw string (parent normalizes via auto-save). */
  onCellEdit: (itemId: string, bucketKey: string, value: string) => void;
  /**
   * Request removal of an item. The parent owns confirmation (Tranche 053
   * FLOW-014: inline bottom-sheet confirm naming the item — no window.confirm
   * here) and performs the actual delete/zero-out.
   */
  onItemRemove: (itemId: string) => void;
  /**
   * Optional: pre-aggregated planned-production quantity by
   * `${item_id}|${bucket_key}`. When present and > 0, renders a small
   * `▼ N planned` chip in the cell corner. Wave-2 stub for the forthcoming
   * planning-recommendations integration.
   */
  plannedProductionByCell?: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthlyGrid(props: MonthlyGridProps) {
  const {
    items,
    lines,
    localCells,
    freshlyAddedItemIds,
    buckets,
    isEditable,
    onCellEdit,
    onItemRemove,
    plannedProductionByCell,
  } = props;

  // FLOW-003 (Tranche 053): mobile fallback. Pair the media query with an
  // isMounted flag (idiom copied from InventoryFlowClient.tsx) so SSR/first
  // paint always renders the desktop grid — no hydration mismatch.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const monthCount = buckets.length;
  const sharedGridStyle = useMemo(() => gridStyle(monthCount), [monthCount]);

  // Cadence is uniform across the buckets array.
  const cadence = buckets[0]?.cadence ?? "monthly";

  // Today index — drives TODAY pill + accent column band.
  const todayIdx = useMemo(
    () => findTodayBucketIndex(buckets, cadence),
    [buckets, cadence],
  );

  // Build a fast lookup: (item_id, bucket_key) → forecast_quantity.
  const linesByCell = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lines) {
      m.set(`${l.item_id}|${l.period_bucket_key}`, l.forecast_quantity);
    }
    return m;
  }, [lines]);

  // Effective value for a cell: local override (planner mid-edit) > persisted.
  const effectiveValue = useCallback(
    (itemId: string, bucketKey: string): string => {
      const cellKey = `${itemId}|${bucketKey}`;
      const local = localCells[cellKey];
      if (local !== undefined) return local;
      return linesByCell.get(cellKey) ?? "";
    },
    [localCells, linesByCell],
  );

  // ---- Row totals (real-time) -----------------------------------------
  const rowTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      let sum = 0;
      for (const b of buckets) {
        const v = effectiveValue(it.item_id, b.key);
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) sum += n;
      }
      m.set(it.item_id, sum);
    }
    return m;
  }, [items, buckets, effectiveValue]);

  // ---- Column totals (real-time) --------------------------------------
  const colTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of buckets) {
      let sum = 0;
      for (const it of items) {
        const v = effectiveValue(it.item_id, b.key);
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) sum += n;
      }
      m.set(b.key, sum);
    }
    return m;
  }, [items, buckets, effectiveValue]);

  // Grand total — bottom-right cell.
  const grandTotal = useMemo(() => {
    let sum = 0;
    for (const v of rowTotals.values()) sum += v;
    return sum;
  }, [rowTotals]);

  // ---- Keyboard navigation grid -------------------------------------
  // 2D ref grid: rows = items, cols = buckets. Used to implement Notion /
  // Airtable arrow / Tab / Enter cell-to-cell navigation.
  const inputRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);
  // Resize whenever items / buckets change.
  if (
    inputRefs.current.length !== items.length ||
    (inputRefs.current[0]?.length ?? 0) !== buckets.length
  ) {
    const next: Array<Array<HTMLInputElement | null>> = [];
    for (let r = 0; r < items.length; r++) {
      next.push(new Array(buckets.length).fill(null));
    }
    inputRefs.current = next;
  }

  const focusCell = useCallback((row: number, col: number) => {
    const grid = inputRefs.current;
    if (!grid[row]) return;
    const el = grid[row]![col];
    if (el) {
      el.focus();
      // Select-all so the planner can immediately type to overwrite.
      try {
        el.select();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
      const cols = buckets.length;
      const rows = items.length;
      if (cols === 0 || rows === 0) return;
      switch (e.key) {
        case "ArrowDown":
        case "Enter": {
          e.preventDefault();
          const next = Math.min(rows - 1, row + 1);
          focusCell(next, col);
          return;
        }
        case "ArrowUp": {
          e.preventDefault();
          const next = Math.max(0, row - 1);
          focusCell(next, col);
          return;
        }
        case "ArrowLeft": {
          // Only navigate if the caret is at the beginning — otherwise let the
          // arrow move the caret inside the input value (Notion parity).
          if (e.currentTarget.selectionStart === 0) {
            e.preventDefault();
            const next = Math.max(0, col - 1);
            focusCell(row, next);
          }
          return;
        }
        case "ArrowRight": {
          const len = e.currentTarget.value.length;
          if (e.currentTarget.selectionEnd === len) {
            e.preventDefault();
            const next = Math.min(cols - 1, col + 1);
            focusCell(row, next);
          }
          return;
        }
        case "Tab": {
          // Move within the row first; wrap to next/prev row when at edges.
          e.preventDefault();
          if (e.shiftKey) {
            if (col > 0) focusCell(row, col - 1);
            else if (row > 0) focusCell(row - 1, cols - 1);
          } else {
            if (col < cols - 1) focusCell(row, col + 1);
            else if (row < rows - 1) focusCell(row + 1, 0);
          }
          return;
        }
        case "Escape": {
          e.currentTarget.blur();
          return;
        }
        default:
          return;
      }
    },
    [buckets.length, items.length, focusCell],
  );

  // ── Mobile (<768px): vertical collapsible list, same edit pipeline ──────
  if (isMounted && isMobile) {
    return (
      <MobileForecastList
        items={items}
        buckets={buckets}
        todayIdx={todayIdx}
        isEditable={isEditable}
        freshlyAddedItemIds={freshlyAddedItemIds}
        rowTotals={rowTotals}
        grandTotal={grandTotal}
        effectiveValue={effectiveValue}
        onCellEdit={onCellEdit}
        onItemRemove={onItemRemove}
      />
    );
  }

  return (
    <div
      className="forecast-grid-scroller relative overflow-auto"
      data-testid="forecast-monthly-grid"
      style={{
        // Bound the grid height so the column-totals footer can stick to the
        // bottom inside this scroller. 70vh keeps the page chrome visible.
        maxHeight: "70vh",
      }}
    >
      <div
        className="min-w-fit"
        style={{ width: "max-content" }}
      >
        {/* ── Header row ─────────────────────────────────────────────────── */}
        <HeaderRow
          buckets={buckets}
          cadence={cadence}
          todayIdx={todayIdx}
          gridStyle={sharedGridStyle}
          isEditable={isEditable}
        />

        {/* ── Body rows ──────────────────────────────────────────────────── */}
        <div role="rowgroup">
          {items.map((item, rowIdx) => {
            const isFresh = freshlyAddedItemIds.has(item.item_id);
            const rowTotal = rowTotals.get(item.item_id) ?? 0;
            return (
              <BodyRow
                key={item.item_id}
                item={item}
                rowIdx={rowIdx}
                buckets={buckets}
                todayIdx={todayIdx}
                cadence={cadence}
                isEditable={isEditable}
                isFresh={isFresh}
                rowTotal={rowTotal}
                effectiveValue={effectiveValue}
                onCellEdit={onCellEdit}
                onItemRemove={onItemRemove}
                onCellKeyDown={handleKeyDown}
                inputRefs={inputRefs}
                gridStyle={sharedGridStyle}
                plannedProductionByCell={plannedProductionByCell}
              />
            );
          })}
        </div>

        {/* ── Footer: column totals sticky-bottom row ────────────────────── */}
        <FooterTotalsRow
          buckets={buckets}
          colTotals={colTotals}
          grandTotal={grandTotal}
          gridStyle={sharedGridStyle}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header row
// ---------------------------------------------------------------------------

function HeaderRow({
  buckets,
  cadence,
  todayIdx,
  gridStyle: gs,
  isEditable: _isEditable,
}: {
  buckets: MonthBucket[];
  cadence: "monthly" | "weekly" | "daily";
  todayIdx: number;
  gridStyle: CSSProperties;
  isEditable: boolean;
}) {
  return (
    <div
      role="row"
      className="sticky-header-shadow sticky top-0 z-30 bg-bg-raised"
      style={{ ...gs, gridAutoRows: `${HEADER_H}px`, height: HEADER_H }}
    >
      {/* Top-left corner — pinned both axes (z-40). */}
      <div
        role="columnheader"
        className="sticky left-0 z-40 flex h-full items-end bg-bg-raised px-4 pb-2 pt-3"
        style={{
          boxShadow:
            "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
        }}
      >
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Item
        </span>
      </div>
      {/* Per-bucket two-line header. */}
      {buckets.map((b, idx) => {
        const { primary, secondary } = formatMonthHeader2(b.key, cadence);
        const isToday = idx === todayIdx;
        const isFrozen = isFrozenPast(b.key, cadence) && !isToday;
        return (
          <div
            key={b.key}
            role="columnheader"
            data-bucket={b.key}
            data-testid="forecast-grid-bucket-header"
            data-today={isToday ? "true" : undefined}
            data-frozen={isFrozen ? "true" : undefined}
            title={b.label}
            className={cn(
              "relative flex h-full flex-col items-center justify-center border-l border-border/40 px-2",
              isFrozen && "bg-hatch-history",
              isToday &&
                "bg-today-band shadow-[inset_1px_0_0_hsl(var(--accent)/0.55),inset_-1px_0_0_hsl(var(--accent)/0.55)]",
            )}
          >
            {isToday ? (
              <span
                className="today-pill-pulse mb-1 rounded-sm bg-accent px-1 py-px text-[8px] font-bold uppercase tracking-sops text-accent-fg"
                data-testid="forecast-grid-today-pill"
              >
                TODAY
              </span>
            ) : (
              <div
                className={cn(
                  "text-[9px] font-semibold uppercase leading-none tracking-sops",
                  isFrozen ? "text-fg-faint" : "text-fg-subtle",
                )}
              >
                {primary}
              </div>
            )}
            <div
              className={cn(
                "mt-1 text-[13px] font-medium leading-none tabular-nums",
                isToday
                  ? "text-accent"
                  : isFrozen
                    ? "text-fg-faint"
                    : "text-fg-strong",
              )}
            >
              {isToday ? primary : secondary}
            </div>
            {/* Compact secondary line under the TODAY pill — surfaces the
                primary "MAY" label so the today column still reads as a
                month label, not just a pill. */}
            {isToday ? (
              <div className="mt-0.5 text-[9px] font-medium leading-none tabular-nums text-accent/80">
                {secondary}
              </div>
            ) : null}
          </div>
        );
      })}
      {/* Top-right corner — ROW TOTAL header, pinned both axes (z-40). */}
      <div
        role="columnheader"
        className="sticky right-0 z-40 flex h-full items-end justify-end bg-bg-raised px-3 pb-2 pt-3"
        style={{
          boxShadow:
            "inset 1px 0 0 hsl(var(--border-strong)), -2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
        }}
      >
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Row Total
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body row
// ---------------------------------------------------------------------------

interface BodyRowProps {
  item: ItemForGrid;
  rowIdx: number;
  buckets: MonthBucket[];
  todayIdx: number;
  cadence: "monthly" | "weekly" | "daily";
  isEditable: boolean;
  isFresh: boolean;
  rowTotal: number;
  effectiveValue: (itemId: string, bucketKey: string) => string;
  onCellEdit: (itemId: string, bucketKey: string, value: string) => void;
  onItemRemove: (itemId: string) => void;
  onCellKeyDown: (
    e: KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => void;
  inputRefs: React.MutableRefObject<Array<Array<HTMLInputElement | null>>>;
  gridStyle: CSSProperties;
  plannedProductionByCell?: Map<string, number>;
}

function BodyRow({
  item,
  rowIdx,
  buckets,
  todayIdx,
  cadence,
  isEditable,
  isFresh,
  rowTotal,
  effectiveValue,
  onCellEdit,
  onItemRemove,
  onCellKeyDown,
  inputRefs,
  gridStyle: gs,
  plannedProductionByCell,
}: BodyRowProps) {
  return (
    <div
      role="row"
      data-testid="forecast-grid-row"
      data-item-id={item.item_id}
      className={cn(
        "forecast-grid-row group relative border-b border-border/40 transition-colors duration-150",
        isFresh && "bg-accent-soft/15",
      )}
      style={{ ...gs, gridAutoRows: `${ROW_H}px`, height: ROW_H }}
    >
      {/* ── Sticky-left: item identity + chip + remove handle ─────────────── */}
      <div
        role="rowheader"
        className="sticky left-0 z-20 flex h-full items-center gap-2 bg-bg-raised px-3"
        style={{
          boxShadow:
            "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <div
            className="truncate text-[13px] font-medium text-fg-strong"
            title={item.item_name}
          >
            {item.item_name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-fg-faint">
            <span className="truncate" title={item.item_id}>
              {item.item_id}
            </span>
            <SupplyMethodChip supplyMethod={item.supply_method} />
          </div>
        </div>
        {isEditable ? (
          <button
            type="button"
            onClick={() => onItemRemove(item.item_id)}
            className="row-quick-action inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-faint transition-colors duration-150 hover:bg-danger-softer hover:text-danger-fg focus-visible:opacity-100"
            title={`Remove ${item.item_name} from forecast`}
            data-testid="forecast-grid-row-remove"
            aria-label={`Remove ${item.item_name} from forecast`}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {/* ── Body: per-month cells ─────────────────────────────────────────── */}
      {buckets.map((b, colIdx) => {
        const cellKey = `${item.item_id}|${b.key}`;
        const displayValue = effectiveValue(item.item_id, b.key);
        const isToday = colIdx === todayIdx;
        const isFrozen = isFrozenPast(b.key, cadence) && !isToday;
        const planned = plannedProductionByCell?.get(cellKey) ?? 0;
        const numericVal = Number(displayValue);
        const isFilled =
          displayValue !== "" &&
          Number.isFinite(numericVal) &&
          numericVal > 0;

        const supplyLabel =
          item.supply_method === "MANUFACTURED"
            ? "Make"
            : item.supply_method === "REPACK"
              ? "Repack"
              : item.supply_method === "BOUGHT_FINISHED"
                ? "Buy"
                : item.supply_method;

        const tooltip = `${supplyLabel} · ${item.item_name} · ${b.label}`;

        return (
          <div
            key={b.key}
            role="gridcell"
            data-testid="forecast-grid-cell"
            data-item-id={item.item_id}
            data-bucket={b.key}
            data-today={isToday ? "true" : undefined}
            data-frozen={isFrozen ? "true" : undefined}
            className={cn(
              "forecast-grid-cell cell-hover-ring relative flex h-full items-stretch border-l border-border/30 transition-colors duration-150",
              isFrozen && "bg-hatch-history",
              isToday &&
                "shadow-[inset_1px_0_0_hsl(var(--accent)/0.45),inset_-1px_0_0_hsl(var(--accent)/0.45)]",
            )}
            title={tooltip}
          >
            {/* Production-aware corner badge — only when planned > 0. */}
            {planned > 0 ? (
              <span
                className="production-chip pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-sm bg-info-softer px-1 py-px text-[9px] font-semibold uppercase tracking-sops text-info-fg"
                data-testid="forecast-grid-planned-chip"
                title={`${formatExactInt(planned)} planned production this month`}
              >
                <ChevronDown className="h-2 w-2" strokeWidth={2.5} aria-hidden />
                {formatExactInt(planned)}
              </span>
            ) : null}

            {isEditable ? (
              <input
                ref={(el) => {
                  if (!inputRefs.current[rowIdx]) return;
                  inputRefs.current[rowIdx]![colIdx] = el;
                }}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={displayValue}
                onChange={(e) => {
                  const normalized = normalizeCellInput(e.target.value);
                  if (normalized === null) return;
                  onCellEdit(item.item_id, b.key, normalized);
                }}
                onKeyDown={(e) => onCellKeyDown(e, rowIdx, colIdx)}
                placeholder="—"
                aria-label={`${item.item_name} — ${b.label}`}
                data-testid="forecast-grid-input"
                className={cn(
                  // Fill the cell so the focus ring lands on the visible box.
                  "h-full w-full border-0 px-3 text-right font-mono text-sm tabular-nums outline-none transition-colors duration-150",
                  "placeholder:text-fg-faint/70",
                  isFilled
                    ? "bg-bg-raised text-fg-strong"
                    : "bg-transparent text-fg",
                  "focus:bg-accent-soft/25 focus:text-fg-strong",
                  // 1px inset accent ring on focus — sits inside the cell so
                  // the alignment stays pixel-perfect with neighbors.
                  "focus:shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.7)]",
                )}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-end px-3 font-mono text-sm tabular-nums text-fg">
                {formatQty(displayValue)}
              </span>
            )}
          </div>
        );
      })}

      {/* ── Sticky-right: ROW TOTAL hero ─────────────────────────────────── */}
      <div
        role="rowheader"
        className={cn(
          "sticky right-0 z-20 flex h-full items-center justify-end bg-bg-raised px-3",
          "border-l border-border/60",
        )}
        style={{
          boxShadow:
            "inset 1px 0 0 hsl(var(--border-strong)), -2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
        }}
        data-testid="forecast-grid-row-total"
      >
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            rowTotal > 0 ? "text-fg-strong" : "text-fg-faint",
          )}
        >
          {rowTotal > 0 ? formatExactInt(rowTotal) : "—"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer — sticky-bottom column totals row
// ---------------------------------------------------------------------------

function FooterTotalsRow({
  buckets,
  colTotals,
  grandTotal,
  gridStyle: gs,
}: {
  buckets: MonthBucket[];
  colTotals: Map<string, number>;
  grandTotal: number;
  gridStyle: CSSProperties;
}) {
  return (
    <div
      role="row"
      className="sticky bottom-0 z-[25] border-t-2 border-accent/60 bg-bg-raised"
      style={{ ...gs, gridAutoRows: `${FOOTER_H}px`, height: FOOTER_H }}
      data-testid="forecast-grid-totals-row"
    >
      {/* Bottom-left corner — pinned both axes. */}
      <div
        role="rowheader"
        className="sticky left-0 z-30 flex h-full items-center bg-bg-raised px-3"
        style={{
          boxShadow:
            "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
        }}
      >
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Column total
        </span>
      </div>
      {buckets.map((b) => {
        const total = colTotals.get(b.key) ?? 0;
        return (
          <div
            key={b.key}
            role="gridcell"
            data-bucket={b.key}
            data-testid="forecast-grid-col-total"
            className="flex h-full items-center justify-end border-l border-border/40 px-3"
          >
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                total > 0 ? "text-fg-strong" : "text-fg-faint",
              )}
            >
              {total > 0 ? formatExactInt(total) : "—"}
            </span>
          </div>
        );
      })}
      {/* Bottom-right corner — grand total, pinned both axes. */}
      <div
        role="rowheader"
        className="sticky right-0 z-30 flex h-full items-center justify-end bg-bg-raised px-3"
        style={{
          boxShadow:
            "inset 1px 0 0 hsl(var(--border-strong)), -2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
        }}
        data-testid="forecast-grid-grand-total"
      >
        <span
          className={cn(
            "font-mono text-base font-bold tabular-nums",
            grandTotal > 0 ? "text-accent" : "text-fg-faint",
          )}
        >
          {grandTotal > 0 ? formatExactInt(grandTotal) : "—"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile (<768px) fallback — Tranche 053 FLOW-003.
//
// One collapsible row per item (name + supply chip + live row total); expands
// to stacked month cells with ≥44px-tall numeric inputs wired to the SAME
// effectiveValue / onCellEdit state machine as the grid, so the parent's
// debounced auto-save keeps working unchanged. New testids (forecast-mobile-*)
// — the desktop forecast-grid-* testids are untouched.
// ---------------------------------------------------------------------------

interface MobileForecastListProps {
  items: ItemForGrid[];
  buckets: MonthBucket[];
  todayIdx: number;
  isEditable: boolean;
  freshlyAddedItemIds: Set<string>;
  rowTotals: Map<string, number>;
  grandTotal: number;
  effectiveValue: (itemId: string, bucketKey: string) => string;
  onCellEdit: (itemId: string, bucketKey: string, value: string) => void;
  onItemRemove: (itemId: string) => void;
}

function MobileForecastList({
  items,
  buckets,
  todayIdx,
  isEditable,
  freshlyAddedItemIds,
  rowTotals,
  grandTotal,
  effectiveValue,
  onCellEdit,
  onItemRemove,
}: MobileForecastListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggle = useCallback((itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  return (
    <div data-testid="forecast-mobile-list">
      <div className="divide-y divide-border/40">
        {items.map((item) => {
          const open = expandedIds.has(item.item_id);
          const isFresh = freshlyAddedItemIds.has(item.item_id);
          const rowTotal = rowTotals.get(item.item_id) ?? 0;
          return (
            <div
              key={item.item_id}
              data-testid="forecast-mobile-item"
              data-item-id={item.item_id}
              className={cn(isFresh && "bg-accent-soft/15")}
            >
              {/* Collapsible row header — ≥44px touch target. */}
              <button
                type="button"
                onClick={() => toggle(item.item_id)}
                aria-expanded={open}
                aria-label={`${item.item_name} — ${open ? "collapse" : "expand"} month cells`}
                data-testid="forecast-mobile-item-toggle"
                className="flex min-h-[44px] w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-bg-subtle/60"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-fg-faint transition-transform duration-150",
                    open && "rotate-180",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg-strong">
                    {item.item_name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <SupplyMethodChip supplyMethod={item.supply_method} />
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-sm font-semibold tabular-nums",
                    rowTotal > 0 ? "text-fg-strong" : "text-fg-faint",
                  )}
                  data-testid="forecast-mobile-row-total"
                >
                  {rowTotal > 0 ? formatExactInt(rowTotal) : "—"}
                </span>
              </button>

              {/* Expanded: stacked month cells. */}
              {open ? (
                <div className="space-y-2 px-4 pb-3">
                  {buckets.map((b, idx) => {
                    const displayValue = effectiveValue(item.item_id, b.key);
                    const isToday = idx === todayIdx;
                    return (
                      <label
                        key={b.key}
                        className="flex items-center gap-3"
                        data-testid="forecast-mobile-cell"
                        data-bucket={b.key}
                      >
                        <span className="flex w-24 shrink-0 flex-col">
                          <span className="text-xs font-medium text-fg-muted">
                            {b.label}
                          </span>
                          {isToday ? (
                            <span className="text-[9px] font-bold uppercase tracking-sops text-accent">
                              Today
                            </span>
                          ) : null}
                        </span>
                        {isEditable ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={displayValue}
                            onChange={(e) => {
                              const normalized = normalizeCellInput(
                                e.target.value,
                              );
                              if (normalized === null) return;
                              onCellEdit(item.item_id, b.key, normalized);
                            }}
                            placeholder="—"
                            aria-label={`${item.item_name} — ${b.label}`}
                            data-testid="forecast-mobile-cell-input"
                            className={cn(
                              "min-h-[44px] w-full rounded border border-border bg-bg px-3 text-right font-mono text-sm tabular-nums outline-none transition-colors duration-150",
                              "placeholder:text-fg-faint/70",
                              "focus:border-accent focus:bg-accent-soft/25 focus:text-fg-strong",
                            )}
                          />
                        ) : (
                          <span className="flex min-h-[44px] w-full items-center justify-end rounded border border-border/40 bg-bg-subtle/40 px-3 font-mono text-sm tabular-nums text-fg">
                            {formatQty(displayValue)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                  {isEditable ? (
                    <button
                      type="button"
                      onClick={() => onItemRemove(item.item_id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded px-1 text-xs font-medium text-danger-fg transition-colors hover:bg-danger-softer"
                      data-testid="forecast-mobile-item-remove"
                      aria-label={`Remove ${item.item_name} from forecast`}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      Remove from forecast
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Grand total — parity with the desktop footer totals row. */}
      <div
        className="flex items-center justify-between border-t-2 border-accent/60 bg-bg-raised px-4 py-3"
        data-testid="forecast-mobile-grand-total"
      >
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Total
        </span>
        <span
          className={cn(
            "font-mono text-base font-bold tabular-nums",
            grandTotal > 0 ? "text-accent" : "text-fg-faint",
          )}
        >
          {grandTotal > 0 ? formatExactInt(grandTotal) : "—"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supply-method chip — tinted version using `family-chip-tinted` shape but
// keyed off a tone (info / warning) instead of family color, since the
// items endpoint does not yet expose `family` to the forecast page.
// ---------------------------------------------------------------------------

function SupplyMethodChip({ supplyMethod }: { supplyMethod: string }) {
  const isMake =
    supplyMethod === "MANUFACTURED" || supplyMethod === "REPACK";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1 py-px font-sans text-[9px] font-semibold uppercase tracking-sops",
        isMake
          ? "border-info/40 bg-info-softer text-info-fg"
          : "border-warning/40 bg-warning-softer text-warning-fg",
      )}
      title={
        isMake
          ? "Manufactured — forecasting demand here drives a production recommendation."
          : "Bought-finished — forecasting demand here drives a purchase recommendation."
      }
    >
      {isMake ? "Make" : "Buy"}
    </span>
  );
}

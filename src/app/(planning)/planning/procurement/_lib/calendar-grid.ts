// ---------------------------------------------------------------------------
// Calendar-grid engine — Tranche 033 (procurement-calendar-view).
//
// Pure helpers behind the procurement page's secondary "calendar" view. Build a
// Sunday-aligned month grid, derive calendar entries from the open session's
// POs (one source of truth — no second fetch), group them per order-by day, and
// total them. All UTC-based so the grid is deterministic and unit-testable.
// ---------------------------------------------------------------------------

import type { PoTierLike, PoStatusLike } from "./decision";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";

export interface CalEntry {
  session_po_id: string;
  supplier_snapshot: string;
  tier: PoTierLike;
  status: PoStatusLike;
  total_cost: number;
  line_count: number;
  order_by_date: string;
}

export interface GridDay {
  iso: string;
  dayOfMonth: number;
  monthIdx: number; // 0-11
  isToday: boolean;
  isPast: boolean;
  showMonth: boolean;
}

const TIER_RANK: Record<PoTierLike, number> = {
  urgent: 0,
  must: 1,
  recommended: 2,
};

/**
 * Sunday-aligned grid of `weeks*7` days, starting from the Sunday on/before
 * `todayISO` (YYYY-MM-DD). Pure / UTC-based.
 */
export function buildGrid(todayISO: string, weeks = 10): GridDay[] {
  const base = new Date(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return [];
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday

  const days: GridDay[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayOfMonth = d.getUTCDate();
    days.push({
      iso,
      dayOfMonth,
      monthIdx: d.getUTCMonth(),
      isToday: iso === todayISO,
      isPast: iso < todayISO,
      showMonth: dayOfMonth === 1 || i === 0,
    });
  }
  return days;
}

/** Count of lines that will actually be ordered (kept, non-dropped). */
function activeLineCount(po: PurchaseSessionPo): number {
  return po.lines.filter((l) => !l.is_dropped).length;
}

/** Map the open session's POs to calendar entries — one source of truth. */
export function posToCalEntries(pos: readonly PurchaseSessionPo[]): CalEntry[] {
  return pos.map((po) => ({
    session_po_id: po.session_po_id,
    supplier_snapshot: po.supplier_snapshot,
    tier: po.tier,
    status: po.status,
    total_cost: po.total_cost,
    line_count: activeLineCount(po),
    order_by_date: po.order_by_date,
  }));
}

/** Bucket entries by order-by date; within a day, urgent → must → recommended. */
export function groupByDay(
  entries: readonly CalEntry[],
): Map<string, CalEntry[]> {
  const m = new Map<string, CalEntry[]>();
  for (const e of entries) {
    const arr = m.get(e.order_by_date) ?? [];
    arr.push(e);
    m.set(e.order_by_date, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  }
  return m;
}

export interface CalTotals {
  count: number;
  cost: number;
  byTier: Record<PoTierLike, number>;
}

export function calTotals(entries: readonly CalEntry[]): CalTotals {
  const t: CalTotals = {
    count: entries.length,
    cost: 0,
    byTier: { urgent: 0, must: 0, recommended: 0 },
  };
  for (const e of entries) {
    t.cost += e.total_cost;
    t.byTier[e.tier] += 1;
  }
  return t;
}

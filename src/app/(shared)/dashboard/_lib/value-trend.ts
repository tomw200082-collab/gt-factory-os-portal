// ---------------------------------------------------------------------------
// Inventory-value trend reconstruction (tranche 039, indicative).
//
// There is NO backend endpoint for inventory value over time — /api/stock/value
// is a current snapshot only, and stock-ledger rows carry qty_delta but no
// monetary value. Tom approved an *indicative* reconstruction:
//
//   value(end of day d) = anchorValue − Σ value_delta(movements after day d)
//   value_delta(row)    = qty_delta(row) × unit_cost(item)
//
// The series is ANCHORED to today's real RM+PKG snapshot value, so the most
// recent point is always exact; earlier points are reconstructed from real
// movements priced at the current effective unit cost. This is an estimate
// (assumes stable costs) and is labelled "indicative" in the UI.
//
// Honesty guard: unit cost comes from the economics surface keyed by
// component_id, joined to ledger item_id. That cross-namespace join is not
// guaranteed, so this module reports a COVERAGE ratio (share of in-window RM/PKG
// movements that resolved to a cost). The card degrades to an honest empty
// state when coverage is too low (below 75%, tranche 042), rather than
// drawing a wrong line.
// ---------------------------------------------------------------------------

import { lastNDays, localDayKey } from "./trends";

export interface ValueTrendPoint {
  key: string;
  label: string;
  /** Reconstructed RM+PKG inventory value at end of this day, in ILS. */
  value: number;
}

export interface ValueMovement {
  when: string | null | undefined;
  item_id: string;
  /** Backend item_type — only RM and PKG are valued here. */
  item_type: string | null | undefined;
  qty_delta: number;
}

export interface ValueTrendResult {
  points: ValueTrendPoint[];
  /** Share (0..1) of in-window RM/PKG movements that resolved to a unit cost. */
  coverage: number;
  /** Count of in-window RM/PKG movements considered. */
  movementCount: number;
}

function parseDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : localDayKey(d);
}

const isRmPkg = (t: string | null | undefined) => t === "RM" || t === "PKG";

/**
 * Reconstruct an indicative RM+PKG inventory-value series over the last `n`
 * days, anchored to `anchorValue` (today's real snapshot value).
 *
 * `costOf(item_id)` returns the current effective unit cost, or null when the
 * item has no resolvable cost (it then contributes to the uncovered share).
 */
export function reconstructValueSeries(
  anchorValue: number,
  movements: ValueMovement[],
  costOf: (itemId: string) => number | null,
  n: number,
  today: Date,
): ValueTrendResult {
  const days = lastNDays(n, today);
  const index = new Map<string, number>();
  days.forEach((d, i) => index.set(d.key, i));

  // Signed value delta per in-window day.
  const delta = new Array<number>(days.length).fill(0);
  let movementCount = 0;
  let covered = 0;

  for (const m of movements) {
    if (!isRmPkg(m.item_type)) continue;
    const key = parseDayKey(m.when);
    if (key === null) continue;
    const i = index.get(key);
    if (i === undefined) continue; // outside the window
    movementCount += 1;
    const cost = costOf(m.item_id);
    if (cost === null || Number.isNaN(cost)) continue;
    covered += 1;
    delta[i] += m.qty_delta * cost;
  }

  // Walk backward from today's anchored close.
  const close = new Array<number>(days.length).fill(anchorValue);
  for (let i = days.length - 2; i >= 0; i--) {
    close[i] = close[i + 1] - delta[i + 1];
  }

  const points = days.map((d, i) => ({ key: d.key, label: d.label, value: close[i] }));
  const coverage = movementCount > 0 ? covered / movementCount : 1;
  return { points, coverage, movementCount };
}

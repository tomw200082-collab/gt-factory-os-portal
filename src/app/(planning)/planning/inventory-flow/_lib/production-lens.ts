// ---------------------------------------------------------------------------
// production-lens.ts — pure helpers that turn the flow projection into a
// production-planning lens (Tranche 058, Tom dispatch 2026-06-12).
//
// The operator's question on this page is not "what is red?" but "what do I
// produce next, and how much?". That needs three things the raw projection
// rows don't surface directly:
//
//   1. ORDER — a user-selectable sort over the item list:
//        urgency  : what dies first (tier → earliest stockout → cover)
//        gap      : biggest unfilled 14-day shortfall first — where the
//                   largest production batches are needed
//        demand   : biggest 14-day movers first — plan the volume runs
//        family   : group by product line (batch production: one line's
//                   flavors run together), urgency within the line
//   2. MAGNITUDE — 14-day sums per item (demand, incoming, shortfall) so
//      each card carries real quantities, not just colors.
//   3. PLAN AWARENESS — "covered by plan": the blind projection stocks out
//      but the production-aware one doesn't, i.e. planned production
//      rescues this item. Those items need plan VERIFICATION, not a new
//      decision — visually distinct from items that need production now.
//
// Pure module: no React, no DOM, no fetch — unit-tested in
// production-lens.test.ts. Sort keys are URL-backed (?sort=) by FilterBar.
// ---------------------------------------------------------------------------

import type { FlowItem } from "./types";
import { compareItemsByRisk } from "./risk";

export type FlowSortKey = "urgency" | "gap" | "demand" | "family";

export const DEFAULT_SORT_KEY: FlowSortKey = "urgency";

export const FLOW_SORT_OPTIONS: ReadonlyArray<{
  key: FlowSortKey;
  label: string;
  /** One-line operator meaning, used as the chip title attribute. */
  hint: string;
}> = [
  {
    key: "urgency",
    label: "Urgency",
    hint: "What runs out first — stockouts at the top",
  },
  {
    key: "gap",
    label: "Biggest gap",
    hint: "Largest unfilled 14-day shortfall first — biggest batches needed",
  },
  {
    key: "demand",
    label: "Demand",
    hint: "Biggest 14-day movers first — plan the volume runs",
  },
  {
    key: "family",
    label: "Product line",
    hint: "Grouped by line for batch production, most urgent within each line",
  },
];

/** Parse a raw ?sort= value; anything unknown falls back to the default. */
export function parseSortKey(raw: string | null | undefined): FlowSortKey {
  if (raw === "gap" || raw === "demand" || raw === "family" || raw === "urgency") {
    return raw;
  }
  return DEFAULT_SORT_KEY;
}

// ----- 14-day magnitude sums (the visible daily window) ---------------------

function days14(item: FlowItem) {
  return item.days.slice(0, 14);
}

/** Total demand (LionWheel + Forecast) over the visible 14-day window. */
export function demandSum14(item: FlowItem): number {
  let t = 0;
  for (const d of days14(item)) t += d.demand_lionwheel + d.demand_forecast;
  return t;
}

/** Total incoming (PO + planned production) over the visible 14-day window. */
export function incomingSum14(item: FlowItem): number {
  let t = 0;
  for (const d of days14(item)) t += d.incoming_supply_combined;
  return t;
}

/**
 * Total production-aware shortfall over the visible 14-day window — the
 * quantity of demand that goes UNFILLED even after planned production.
 * This is the "how much to produce, at minimum" magnitude.
 */
export function shortfallSum14(item: FlowItem): number {
  let t = 0;
  for (const d of days14(item)) t += d.shortfall_qty_with_production;
  return t;
}

// ----- Plan awareness --------------------------------------------------------

/**
 * True when the blind projection stocks out but the production-aware one
 * does not — i.e. planned (not yet posted) production is what saves this
 * item. The operator's job here is to VERIFY the plan lands, not to start
 * a new decision.
 */
export function coveredByPlan(item: FlowItem): boolean {
  return (
    item.earliest_stockout_date != null &&
    item.stockout_at_day_with_production == null &&
    item.days_cover_with_production != null
  );
}

// ----- Sorting ---------------------------------------------------------------

function byFamily(a: FlowItem, b: FlowItem): number {
  const fa = a.family ?? "";
  const fb = b.family ?? "";
  // Named families A→Z; null-family items last.
  if (fa === "" && fb !== "") return 1;
  if (fa !== "" && fb === "") return -1;
  const c = fa.localeCompare(fb);
  if (c !== 0) return c;
  return compareItemsByRisk(a, b);
}

function byGap(a: FlowItem, b: FlowItem): number {
  const d = shortfallSum14(b) - shortfallSum14(a);
  if (d !== 0) return d;
  return compareItemsByRisk(a, b);
}

function byDemand(a: FlowItem, b: FlowItem): number {
  const d = demandSum14(b) - demandSum14(a);
  if (d !== 0) return d;
  return compareItemsByRisk(a, b);
}

const COMPARATORS: Record<FlowSortKey, (a: FlowItem, b: FlowItem) => number> = {
  urgency: compareItemsByRisk,
  gap: byGap,
  demand: byDemand,
  family: byFamily,
};

/** Stable, non-mutating sort of the item list by the given key. */
export function sortItems(items: FlowItem[], key: FlowSortKey): FlowItem[] {
  return [...items].sort(COMPARATORS[key]);
}

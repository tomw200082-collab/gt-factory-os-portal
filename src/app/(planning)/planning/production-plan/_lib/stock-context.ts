// stock-context — pure helpers turning an inventory-flow item into the
// production-timing decision the planner needs when picking WHAT and WHEN to
// produce: "am I about to stock out?" vs "am I about to overproduce?".
//
// Tranche 116 (Tom-directed, 2026-07-02) — narrow scope: five variables, no
// raw materials, no backend changes. All data already ships on FlowItem from
// /api/inventory/flow; this module just re-shapes it for one view.
//
// Pure module: no React, no DOM, no fetch — mirrors production-lens.ts.

import { addDays, toIsoDate } from "./helpers";
import {
  coveredByPlan,
  demandSum14,
} from "../../inventory-flow/_lib/production-lens";
import type { FlowItem, FlowResponse } from "../../inventory-flow/_lib/types";

export function findFlowItem(
  flow: FlowResponse | undefined,
  itemId: string | null,
): FlowItem | null {
  if (!flow || !itemId) return null;
  return flow.items.find((it) => it.item_id === itemId) ?? null;
}

/** Average daily demand over the 14-day window — converts qty <-> days. */
export function dailyDemandRate(item: FlowItem): number {
  return demandSum14(item) / 14;
}

/**
 * Production-aware projected on-hand at end of the given day, or null when
 * the date falls outside the server's projection horizon (56 days).
 */
export function projectedOnHandAt(item: FlowItem, isoDate: string): number | null {
  const day = item.days.find((d) => d.day === isoDate);
  return day ? day.projected_on_hand_eod_with_production : null;
}

/**
 * Days of cover after adding `qty` on top of the on-hand-at-date balance.
 * Null when there is no recorded demand to divide by (a real overproduction
 * signal in its own right, not an error) or the date is beyond the horizon.
 */
export function coverAfterRun(
  onHandAtDate: number,
  qty: number,
  dailyRate: number,
): number | null {
  if (!(dailyRate > 0)) return null;
  return (onHandAtDate + qty) / dailyRate;
}

/** Calendar day before the given ISO date — matches the server's +1-day
 * production-inflow lag: producing on this date lands before the stockout. */
export function produceByDate(stockoutIso: string): string {
  return toIsoDate(addDays(new Date(`${stockoutIso}T00:00:00`), -1));
}

// `stockout_at_day_with_production` / `days_cover_with_production` are
// optional fields (server rollout guard). `undefined` means "not shipped yet
// — fall back to the blind projection"; `null` means "shipped, and there is
// no stockout in horizon" and must NOT fall back (that would show the blind
// stockout a covering plan is meant to rescue — exactly what coveredByPlan
// exists to distinguish).
function resolveStockoutIso(item: FlowItem): string | null {
  return item.stockout_at_day_with_production !== undefined
    ? item.stockout_at_day_with_production
    : item.earliest_stockout_date;
}

export interface StockContextViewModel {
  itemFound: boolean;
  onHandNow: number | null;
  /** Production-aware stockout date, or null when none in the 8-week horizon. */
  stockoutDate: string | null;
  hasStockoutInHorizon: boolean;
  /** stockoutDate minus one day; null when there is no stockout to produce against. */
  produceBy: string | null;
  dailyRate: number | null;
  /** True when planDate falls beyond the server's 56-day projection window. */
  beyondHorizon: boolean;
  /** Days of cover after this run — live preview when a qty is typed, else
   *  the plan's own already-saved projection value. Null when unknown
   *  (no demand recorded, or the date is beyond the horizon). */
  coverAfterRunDays: number | null;
  coveredByPlan: boolean;
}

const NOT_FOUND: StockContextViewModel = {
  itemFound: false,
  onHandNow: null,
  stockoutDate: null,
  hasStockoutInHorizon: false,
  produceBy: null,
  dailyRate: null,
  beyondHorizon: false,
  coverAfterRunDays: null,
  coveredByPlan: false,
};

/**
 * Build the full view-model for one item.
 *
 * `previewQty` is the mode switch: pass the quantity the planner is
 * currently typing (ManualAddModal, "preview" mode) to compute what cover
 * would look like WITH this run added on top of the projection. Pass `null`
 * (job card, "card" mode — the plan is already saved, so the server
 * projection already includes it) to read `days_cover_with_production`
 * verbatim instead of double-counting the addition.
 */
export function buildStockContext(
  item: FlowItem | null,
  planDate: string,
  previewQty: number | null,
): StockContextViewModel {
  if (!item) return NOT_FOUND;

  const stockoutDate = resolveStockoutIso(item);
  const hasStockoutInHorizon = stockoutDate !== null;
  const produceBy = stockoutDate ? produceByDate(stockoutDate) : null;
  const dailyRate = dailyDemandRate(item);
  const onHandAtPlanDate = projectedOnHandAt(item, planDate);
  const beyondHorizon = onHandAtPlanDate === null;

  const coverAfterRunDays =
    previewQty !== null && previewQty > 0 && onHandAtPlanDate !== null
      ? coverAfterRun(onHandAtPlanDate, previewQty, dailyRate)
      : (item.days_cover_with_production ?? null);

  return {
    itemFound: true,
    onHandNow: item.current_on_hand,
    stockoutDate,
    hasStockoutInHorizon,
    produceBy,
    dailyRate,
    beyondHorizon,
    coverAfterRunDays,
    coveredByPlan: coveredByPlan(item),
  };
}

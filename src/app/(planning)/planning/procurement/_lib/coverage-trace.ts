// ---------------------------------------------------------------------------
// Coverage trace — decode the "why this quantity" derivation the purchase
// session already returns per line (Tranche 072).
//
// The session engine (db fn 0235) attaches a `coverage_trace` JSON to every
// proposed line explaining HOW the recommended quantity was derived from the
// firmed production plan: demand over the horizon, current on-hand, incoming
// open-PO receipts, the projected balance at the need date (negative = the
// item runs out), the safety floor, and the resulting order quantity. The API
// passes it through as `unknown`; the portal has never surfaced it. This module
// parses it safely and turns it into a display-ready reasoning model so the
// planner can SEE why each line is on the buy list — the decision support that
// makes "what to order" obvious. All figures are in INVENTORY uom (the natural
// unit of the demand math); the line's own purchase uom carries the order qty.
// ---------------------------------------------------------------------------

export interface CoverageTrace {
  on_hand_inv: number | null;
  total_horizon_demand_inv: number | null;
  avg_daily_demand_inv: number | null;
  cover_days: number | null;
  safety_floor_inv: number | null;
  need_date: string | null;
  projected_on_hand_at_need_inv: number | null;
  consolidation_window_days: number | null;
  window_demand_inv: number | null;
  window_open_po_receipts_inv: number | null;
  order_qty_inventory_uom: number | null;
  purchase_to_inv_factor: number | null;
  lead_time_days: number | null;
  demand_model_version: string | null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Safe parse of the on-the-wire `unknown`. Returns null when the value is not
 *  a recognizable coverage trace (older runs / rollback / malformed). */
export function parseCoverageTrace(raw: unknown): CoverageTrace | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const recognized = [
    "on_hand_inv",
    "total_horizon_demand_inv",
    "order_qty_inventory_uom",
    "projected_on_hand_at_need_inv",
  ];
  if (!recognized.some((k) => k in o)) return null;
  return {
    on_hand_inv: num(o.on_hand_inv),
    total_horizon_demand_inv: num(o.total_horizon_demand_inv),
    avg_daily_demand_inv: num(o.avg_daily_demand_inv),
    cover_days: num(o.cover_days),
    safety_floor_inv: num(o.safety_floor_inv),
    need_date: str(o.need_date),
    projected_on_hand_at_need_inv: num(o.projected_on_hand_at_need_inv),
    consolidation_window_days: num(o.consolidation_window_days),
    window_demand_inv: num(o.window_demand_inv),
    window_open_po_receipts_inv: num(o.window_open_po_receipts_inv),
    order_qty_inventory_uom: num(o.order_qty_inventory_uom),
    purchase_to_inv_factor: num(o.purchase_to_inv_factor),
    lead_time_days: num(o.lead_time_days),
    demand_model_version: str(o.demand_model_version),
  };
}

export type CoverageSeverity = "stockout" | "below_safety" | "ok";

export interface CoverageReasoning {
  needDate: string | null;
  onHand: number | null;
  incoming: number | null;
  demand: number | null;
  projectedAtNeed: number | null;
  safetyFloor: number | null;
  coverDays: number | null;
  leadTimeDays: number | null;
  /** projected balance at the need date is below zero — the item runs out. */
  wouldRunOut: boolean;
  /** projected balance is at/below the safety floor (but not necessarily < 0). */
  belowSafety: boolean;
  severity: CoverageSeverity;
  /** True when there is enough signal to render a meaningful reasoning block. */
  hasSignal: boolean;
}

export function buildCoverageReasoning(
  trace: CoverageTrace | null,
): CoverageReasoning | null {
  if (!trace) return null;
  const projectedAtNeed = trace.projected_on_hand_at_need_inv;
  const safetyFloor = trace.safety_floor_inv;
  const wouldRunOut = projectedAtNeed != null && projectedAtNeed < 0;
  const belowSafety =
    projectedAtNeed != null &&
    safetyFloor != null &&
    projectedAtNeed < safetyFloor;
  const severity: CoverageSeverity = wouldRunOut
    ? "stockout"
    : belowSafety
      ? "below_safety"
      : "ok";
  const hasSignal =
    trace.on_hand_inv != null ||
    trace.total_horizon_demand_inv != null ||
    projectedAtNeed != null;
  return {
    needDate: trace.need_date,
    onHand: trace.on_hand_inv,
    incoming: trace.window_open_po_receipts_inv,
    demand: trace.total_horizon_demand_inv,
    projectedAtNeed,
    safetyFloor,
    coverDays: trace.cover_days,
    leadTimeDays: trace.lead_time_days,
    wouldRunOut,
    belowSafety,
    severity,
    hasSignal,
  };
}

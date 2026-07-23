// ---------------------------------------------------------------------------
// today-board.ts — pure, DB-free builders for the /home Today Board
// (Tranche 136).
//
// Mapping-v3 decisions this tranche implements (Tom, 2026-07-22):
//   Q6 — one read-model, three outfits: Yesterday / Today / Tomorrow tabs
//        inside the existing /home, not a new page.
//   Q12 — the "Yesterday" tab leads with plan-vs-actual + a first-position
//        "no report entered" red flag for a firmed past-day plan with zero
//        linked production reports.
//   Q5  — the "Tomorrow" tab speaks READY/SHORT per item. The AGGREGATE
//        READY flag (does stock cover ALL open demand for the item) needs a
//        per-order/per-item open-demand read model that does not exist yet
//        (gap G4) — this module never fabricates that flag; callers render
//        an honest "not available yet" state instead.
//
// Every function here is pure (no Date.now(), no fetch, no React) so the
// whole module is unit-testable without mocking the network. Fetching and
// TanStack Query wiring live in the calling component (TodayBoard.tsx), not
// here — see the tranche manifest.
//
// Reuse, not reinvention: ProductionPlanRow is the SAME type the Daily
// Production Plan board renders from (planning/production-plan/_lib/types).
// FlowItem/FlowDay are the SAME types the Inventory Flow grid renders from
// (planning/inventory-flow/_lib/types). This module only adds the small
// amount of glue logic (join, flag, bucket, tier-pick) those two surfaces
// don't need for themselves.
// ---------------------------------------------------------------------------

import type {
  ProductionPlanRow,
  ProductionPlanStatus,
} from "@/app/(planning)/planning/production-plan/_lib/types";
import type { FlowItem } from "@/app/(planning)/planning/inventory-flow/_lib/types";

// ---------------------------------------------------------------------------
// Date helpers — pure, UTC day-math (no DST edge cases for a date-only
// string). Mirrors the addDaysISO helper already used in
// planning/procurement/_lib/decision.ts.
// ---------------------------------------------------------------------------

/** ISO date `n` whole days after `iso` (YYYY-MM-DD in, YYYY-MM-DD out). */
export function addDaysIso(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Local YYYY-MM-DD of an ISO datetime string, for comparing against a
 *  YYYY-MM-DD "day" bucket (credit_tasks.created_at, submission event_at). */
function localDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Status vocabulary — reused verbatim from ProductionJobCard's "Draft — not
// yet locked" copy so the board and the Daily Production Plan board never
// disagree on what a status means.
// ---------------------------------------------------------------------------

export const PLAN_STATUS_LABEL: Record<ProductionPlanStatus, string> = {
  draft: "Draft — not yet locked",
  planned: "Planned",
  in_production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** A plan is "firmed" (locked, briefing-relevant) once it leaves draft and
 *  hasn't been cancelled. Notes (plan_type !== "production") are never
 *  briefing rows. */
function isFirmedProductionPlan(p: ProductionPlanRow): boolean {
  return (
    p.plan_type === "production" &&
    p.status !== "draft" &&
    p.status !== "cancelled"
  );
}

// ---------------------------------------------------------------------------
// Yesterday — plan vs. actual, no-report flag
// ---------------------------------------------------------------------------

// Minimal mirror of GET /api/production-actuals/history rows (ProductionActualListRow
// in stock/production-actual/page.tsx) — only the fields this module reads.
export interface ProductionActualHistoryRow {
  submission_id: string;
  item_id: string;
  item_name: string;
  output_qty: string;
  scrap_qty: string;
  output_uom: string;
  event_at: string;
  reversed: boolean;
}

export interface YesterdayActual {
  submission_id: string;
  output_qty: number | null;
  scrap_qty: number | null;
  output_uom: string | null;
  variance_qty: number | null;
  variance_pct: number | null;
}

export interface YesterdayPlanRow {
  plan_id: string;
  item_id: string | null;
  item_name: string | null;
  planned_qty: number | null;
  uom: string | null;
  status: ProductionPlanStatus;
  /** Q12: true when a firmed plan for the day has zero linked reports. */
  no_report: boolean;
  actual: YesterdayActual | null;
}

/**
 * Plan-vs-actual join for one day, client-side stopgap for gap G1 (a
 * canonical backend read model lands later — see tranche manifest).
 *
 * The join direction is plan → actual via `plan.completed_submission_id`
 * (server-set in the same transaction as a linked production report),
 * cross-checked against the fetched actuals history by submission_id so a
 * richer row (variance reason, scrap) wins when both are available. This is
 * the reverse of "join actuals to plans by from_plan_id" — the history list
 * endpoint does not carry from_plan_id (only the POST/detail responses do)
 * — but it reaches the identical linked pairs, because completed_submission_id
 * and from_plan_id are set together, server-side, on the same event.
 *
 * Sorted with `no_report` flags FIRST (Q12: the red flag leads the tab).
 */
export function buildYesterdayPlanVsActual(
  planRows: ProductionPlanRow[],
  actualRows: ProductionActualHistoryRow[],
  yesterdayDate: string,
): YesterdayPlanRow[] {
  const actualsBySubmission = new Map(actualRows.map((a) => [a.submission_id, a]));

  const rows: YesterdayPlanRow[] = planRows
    .filter((p) => p.plan_type === "production" && p.plan_date === yesterdayDate)
    .map((p) => {
      const linkedId = p.completed_submission_id;
      let actual: YesterdayActual | null = null;
      if (linkedId) {
        const fromHistory = actualsBySubmission.get(linkedId);
        if (fromHistory) {
          actual = {
            submission_id: fromHistory.submission_id,
            output_qty: toNum(fromHistory.output_qty),
            scrap_qty: toNum(fromHistory.scrap_qty),
            output_uom: fromHistory.output_uom,
            variance_qty: null,
            variance_pct: null,
          };
        } else if (p.completed_actual) {
          // Fallback: the submission is outside the fetched history window
          // (e.g. a different limit/page), but the plan row already embeds
          // it server-side — use that rather than showing "no report".
          actual = {
            submission_id: p.completed_actual.submission_id,
            output_qty: toNum(p.completed_actual.output_qty),
            scrap_qty: toNum(p.completed_actual.scrap_qty),
            output_uom: p.completed_actual.output_uom,
            variance_qty: toNum(p.completed_actual.variance_qty),
            variance_pct: toNum(p.completed_actual.variance_pct),
          };
        }
      }

      return {
        plan_id: p.plan_id,
        item_id: p.item_id,
        item_name: p.item_name,
        planned_qty: toNum(p.planned_qty),
        uom: p.uom,
        status: p.status,
        no_report: isFirmedProductionPlan(p) && !linkedId,
        actual,
      };
    });

  // Q6: "every flag carries an owner" (owner attribution deferred — see PR
  // deviations); the flag itself leads, then the rest keep plan order.
  return rows.sort((a, b) => Number(b.no_report) - Number(a.no_report));
}

export interface UnmatchedActualRow {
  submission_id: string;
  item_id: string;
  item_name: string;
  output_qty: number | null;
  event_at: string;
}

/**
 * Actual submissions from the fetched history that are NOT linked to any
 * plan row's completed_submission_id — ad-hoc production reported without a
 * plan card (or whose plan falls outside the fetched date range). Reversed
 * submissions are excluded: a reversal means the report was voided, not
 * that it is an unexplained gap.
 */
export function findUnmatchedActuals(
  planRows: ProductionPlanRow[],
  actualRows: ProductionActualHistoryRow[],
): UnmatchedActualRow[] {
  const linked = new Set(
    planRows.map((p) => p.completed_submission_id).filter((id): id is string => Boolean(id)),
  );
  return actualRows
    .filter((a) => !a.reversed && !linked.has(a.submission_id))
    .map((a) => ({
      submission_id: a.submission_id,
      item_id: a.item_id,
      item_name: a.item_name,
      output_qty: toNum(a.output_qty),
      event_at: a.event_at,
    }));
}

// ---------------------------------------------------------------------------
// Yesterday — picking-gap → credits summary
// ---------------------------------------------------------------------------

// Minimal mirror of GET /api/credit-tracking rows (CreditTrackingRow in
// credit-tracking/page.tsx) — only the fields this module reads.
export interface CreditTrackingRowLite {
  credit_task_id: string;
  created_at: string;
  status: string;
  qty_missing: number;
}

export interface CreditsSummary {
  count: number;
  totalQtyMissing: number;
  byStatus: Record<string, number>;
}

/**
 * Credit-tracking has no server-side date-filter param (verified against
 * the live page — it fetches the full set and filters client-side); this
 * mirrors that same client-side-by-created_at pattern for the given day.
 */
export function buildYesterdayCreditsSummary(
  rows: CreditTrackingRowLite[],
  yesterdayDate: string,
): CreditsSummary {
  const dayRows = rows.filter((r) => localDateOf(r.created_at) === yesterdayDate);
  const byStatus: Record<string, number> = {};
  let totalQtyMissing = 0;
  for (const r of dayRows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    totalQtyMissing += r.qty_missing;
  }
  return { count: dayRows.length, totalQtyMissing, byStatus };
}

// ---------------------------------------------------------------------------
// Today — locked plan + supplier arrivals
// ---------------------------------------------------------------------------

export interface TodayPlanRow {
  plan_id: string;
  item_id: string | null;
  item_name: string | null;
  planned_qty: number | null;
  uom: string | null;
  status: ProductionPlanStatus;
  /** true once the plan has left draft (and isn't cancelled) — the "locked
   *  for today" state the briefing cares about. */
  locked: boolean;
}

export function buildTodayPlan(
  planRows: ProductionPlanRow[],
  todayDate: string,
): TodayPlanRow[] {
  return planRows
    .filter((p) => p.plan_type === "production" && p.plan_date === todayDate)
    .map((p) => ({
      plan_id: p.plan_id,
      item_id: p.item_id,
      item_name: p.item_name,
      planned_qty: toNum(p.planned_qty),
      uom: p.uom,
      status: p.status,
      locked: isFirmedProductionPlan(p),
    }));
}

// Minimal mirror of GET /api/purchase-orders rows — only the fields this
// module reads (same query /stock/receipts uses: status=OPEN&status=PARTIAL).
export interface PurchaseOrderRowLite {
  po_id: string;
  po_number: string;
  supplier_name: string | null;
  status: string;
  expected_receive_date: string | null;
}

export interface ArrivalRow {
  po_id: string;
  po_number: string;
  supplier_name: string | null;
  status: string;
  expected_receive_date: string;
}

export interface ArrivalsBucket {
  today: ArrivalRow[];
  /** Still open/partial but expected before today — surfaced, not hidden. */
  overdue: ArrivalRow[];
}

/**
 * Buckets open/partial POs by expected_receive_date relative to today. POs
 * with no expected_receive_date are excluded (never guessed) rather than
 * silently dumped into one bucket.
 */
export function bucketArrivals(
  poRows: PurchaseOrderRowLite[],
  todayDate: string,
): ArrivalsBucket {
  const today: ArrivalRow[] = [];
  const overdue: ArrivalRow[] = [];
  for (const po of poRows) {
    if (!po.expected_receive_date) continue;
    const row: ArrivalRow = {
      po_id: po.po_id,
      po_number: po.po_number,
      supplier_name: po.supplier_name,
      status: po.status,
      expected_receive_date: po.expected_receive_date,
    };
    if (po.expected_receive_date === todayDate) {
      today.push(row);
    } else if (po.expected_receive_date < todayDate) {
      overdue.push(row);
    }
  }
  today.sort((a, b) => a.po_number.localeCompare(b.po_number));
  overdue.sort((a, b) => a.expected_receive_date.localeCompare(b.expected_receive_date));
  return { today, overdue };
}

// ---------------------------------------------------------------------------
// Tomorrow — READY/SHORT per item
// ---------------------------------------------------------------------------

export type TomorrowTier = "ready" | "short" | "non_working" | "unknown";

export interface TomorrowItemRow {
  item_id: string;
  item_name: string;
  tier: TomorrowTier;
  projected_on_hand: number | null;
  shortfall_qty: number | null;
  demand_total: number | null;
  supply_total: number | null;
}

/**
 * Q5's per-item READY/SHORT, computed from the SAME production-aware
 * projection the Inventory Flow grid renders (shortfall_qty_with_production
 * — a real field, not a fabricated tier). "unknown" is returned (never
 * "ready") when tomorrow falls outside the fetched flow horizon — an honest
 * gap, not a green light.
 *
 * This is NOT the aggregate-READY flag from Q5 (does stock cover ALL open
 * demand for the item) — that needs the per-item open-demand read model
 * that does not exist yet (gap G4). Callers must render that absence
 * honestly; this function only ever answers "is tomorrow's projected
 * balance non-negative".
 */
export function buildTomorrowTiers(
  items: FlowItem[],
  tomorrowDate: string,
): TomorrowItemRow[] {
  const rows: TomorrowItemRow[] = items.map((item) => {
    const day = item.days.find((d) => d.day === tomorrowDate);
    if (!day) {
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        tier: "unknown",
        projected_on_hand: null,
        shortfall_qty: null,
        demand_total: null,
        supply_total: null,
      };
    }
    const shortfall = day.shortfall_qty_with_production ?? day.shortfall_qty;
    const tier: TomorrowTier = !day.is_working_day
      ? "non_working"
      : shortfall > 0
        ? "short"
        : "ready";
    return {
      item_id: item.item_id,
      item_name: item.item_name,
      tier,
      projected_on_hand: day.projected_on_hand_eod_with_production,
      shortfall_qty: shortfall,
      demand_total: day.demand_lionwheel + day.demand_forecast,
      supply_total: day.incoming_supply_combined,
    };
  });

  const rank: Record<TomorrowTier, number> = { short: 0, non_working: 1, unknown: 2, ready: 3 };
  return rows.sort((a, b) => {
    const r = rank[a.tier] - rank[b.tier];
    if (r !== 0) return r;
    if (a.tier === "short") return (b.shortfall_qty ?? 0) - (a.shortfall_qty ?? 0);
    return a.item_name.localeCompare(b.item_name);
  });
}

"use client";

// ---------------------------------------------------------------------------
// plannedInflow — types + TanStack Query hook for the planned-inflow overlay.
//
// Backend authority:
//   - View `api_read.v_planned_inflow_by_day` (migration 0125 / signal #29)
//   - HTTP endpoint `GET /api/v1/queries/inventory/planned-inflow` (signal #32,
//     evidence: Projects/gt-factory-os/docs/cycle20_w1_planned_inflow_endpoint_checkpoint.md)
//
// Mode B-Planning-Corridor — types verbatim from cycle 20 §1.3 endpoint shape.
// 11 columns from the view + 3 LEFT-JOIN-from-items fields per signal #32
// scope_summary. NEVER invent a field that is not in the upstream contract;
// emit assumption_failure if a hook needs one that is not surfaced.
//
// Cadence: 60s silent refetch (matches base inventory-flow hook).
// ---------------------------------------------------------------------------

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Verbatim row shape from the endpoint
// ---------------------------------------------------------------------------

export interface PlannedInflowRow {
  /** ISO date YYYY-MM-DD — same key shape as FlowDay.day for client-side join. */
  plan_date: string;
  /** FK to items.item_id — same key shape as FlowItem.item_id. */
  item_id: string;
  /** Joined from items.item_name; may be null if the item row was pruned. */
  item_display_name: string | null;
  /** Joined from items.sales_uom. */
  sales_uom: string | null;
  /** Joined from items.supply_method. */
  supply_method: string | null;
  /** SUM(planned_qty) across ALL plan rows for this (plan_date, item_id). */
  planned_qty_total: number;
  /** SUM(planned_qty) where rendered_state='done'. */
  completed_qty_total: number;
  /**
   * SUM(planned_qty) where rendered_state='planned'
   * (status='planned' AND completed_submission_id IS NULL).
   * THIS IS THE HEADLINE METRIC for the overlay chip.
   */
  planned_remaining_qty: number;
  /** SUM(planned_qty) where status='cancelled' — never surfaced as overlay. */
  cancelled_qty_total: number;
  /** COUNT of all plan rows. */
  plan_count: number;
  /** COUNT where rendered_state='done'. */
  plan_count_completed: number;
  /** COUNT where status='cancelled'. */
  plan_count_cancelled: number;
  /** COUNT where rendered_state='planned'. */
  plan_count_remaining: number;
  /** ISO8601 UTC — MAX(created_at) — used for freshness tooltip. */
  latest_created_at: string | null;
}

export interface PlannedInflowResponse {
  rows: PlannedInflowRow[];
  /** ISO8601 UTC — response generation timestamp. */
  as_of: string;
  /** Documented horizon (days) — endpoint surfaces 14 per cycle 20 §1.3. */
  horizon_days: number;
  /** Source-view literal — operational debugging affordance. */
  source_view: string;
}

export interface PlannedInflowQueryParams {
  /** Required ISO date YYYY-MM-DD — validated upstream. */
  from: string;
  /** Required ISO date YYYY-MM-DD — validated upstream. */
  to: string;
  /** Optional — narrows to one item. */
  item_id?: string;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchPlannedInflow(
  params: PlannedInflowQueryParams,
): Promise<PlannedInflowResponse> {
  const sp = new URLSearchParams();
  sp.set("from", params.from);
  sp.set("to", params.to);
  if (params.item_id) sp.set("item_id", params.item_id);
  const url = `/api/inventory/planned-inflow?${sp.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : "";
    throw new Error(
      `inventory_planned_inflow_${res.status}${detail ? `:${detail}` : ""}`,
    );
  }
  return (await res.json()) as PlannedInflowResponse;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const REFETCH_INTERVAL_MS = 60_000;
const STALE_TIME_MS = 30_000;

/**
 * usePlannedInflow — fetch planned-inflow rows for a date range +
 * optional item filter. Returns a TanStack Query result.
 *
 * `enabled` is forced false when from/to are empty so the hook can be
 * called unconditionally (caller may pass empty strings while horizon
 * computes). Queries refetch on a 60s background cadence to align with
 * the base /flow hook so both layers refresh together.
 */
export function usePlannedInflow(
  params: PlannedInflowQueryParams | { from: ""; to: ""; item_id?: string },
  options?: { enabled?: boolean },
): UseQueryResult<PlannedInflowResponse> {
  const hasRange = Boolean(params.from && params.to);
  const enabled = (options?.enabled ?? true) && hasRange;
  return useQuery({
    queryKey: ["inventory-planned-inflow", params] as const,
    queryFn: () => fetchPlannedInflow(params as PlannedInflowQueryParams),
    enabled,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Aggregation helpers (client-side weekly bucketing per dispatch invariant)
// ---------------------------------------------------------------------------

/**
 * Index rows by (item_id, plan_date) for O(1) lookup from a day cell.
 * Returns a Map keyed by `${item_id}|${plan_date}` → row.
 */
export function indexByItemDate(
  rows: PlannedInflowRow[] | undefined,
): Map<string, PlannedInflowRow> {
  const out = new Map<string, PlannedInflowRow>();
  if (!rows) return out;
  for (const r of rows) {
    out.set(`${r.item_id}|${r.plan_date}`, r);
  }
  return out;
}

/**
 * Compute ISO-week-start date (Sunday-anchored to match the existing
 * inventory-flow `week_start` semantics from the backend `/flow` endpoint).
 * Input: ISO date YYYY-MM-DD. Output: ISO date YYYY-MM-DD of that day's
 * Sunday.
 */
export function isoWeekStartSunday(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const sunday = new Date(d.getTime() - dow * 24 * 3600 * 1000);
  const yyyy = sunday.getUTCFullYear();
  const mm = String(sunday.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(sunday.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Reduce daily rows for a given item_id into weekly buckets keyed by
 * `week_start` (Sunday). Sums planned_remaining_qty across each week.
 *
 * Returns a Map<week_start, planned_remaining_qty_sum>.
 *
 * Used by FlowGridDesktop / WeekCell for weeks 3..8 weekly aggregation
 * (dispatch invariant: client-side bucketed from daily rows; contract
 * IFPI-4 deferred but dispatch authorizes since the weekly band exists).
 */
export function weeklySumsByItem(
  rows: PlannedInflowRow[] | undefined,
  itemId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!rows) return out;
  for (const r of rows) {
    if (r.item_id !== itemId) continue;
    if (!r.planned_remaining_qty) continue;
    const wk = isoWeekStartSunday(r.plan_date);
    out.set(wk, (out.get(wk) ?? 0) + r.planned_remaining_qty);
  }
  return out;
}

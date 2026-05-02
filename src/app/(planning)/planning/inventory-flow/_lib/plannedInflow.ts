"use client";

// ---------------------------------------------------------------------------
// plannedInflow.ts — types + TanStack hook for the planned-inflow overlay.
//
// Backend contract: api/src/inventory/handler.planned_inflow.ts (W1 cycle 20)
//   surfaces api_read.v_planned_inflow_by_day (migration 0125, signal #29) +
//   3 LEFT-JOIN-from-items display fields.
//
// DTO shape mirrored verbatim from:
//   docs/cycle20_w1_planned_inflow_endpoint_checkpoint.md §1.3
//
// IMPORTANT: do NOT invent fields. If a hook needs a value not on this type,
// emit assumption_failure per Mode B-Planning-Corridor hard rules.
//
// The endpoint returns daily rows (per (plan_date, item_id)). The
// inventory-flow board renders both a 14-day daily band AND a weeks 3..8
// weekly band. The contract IFPI-4 explicitly defers the weekly band's
// dedicated read-model to v1.1 — for v1, this hook fetches the FULL window
// (from = today, to = today + 8 weeks) and the consumer client-side buckets
// into ISO-week aggregates for the weekly band.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// DTO mirror — verbatim from cycle 20 §1.3
// ---------------------------------------------------------------------------

export interface PlannedInflowRow {
  plan_date: string;                 // YYYY-MM-DD
  item_id: string;                   // FK items.item_id
  item_display_name: string | null;  // items.item_name (LEFT JOIN, may be null)
  sales_uom: string | null;          // items.sales_uom (LEFT JOIN)
  supply_method: string | null;      // items.supply_method (LEFT JOIN)
  planned_qty_total: number;         // qty_8dp — SUM all (planned + done + cancelled)
  completed_qty_total: number;       // qty_8dp — SUM where rendered_state='done'
  planned_remaining_qty: number;     // qty_8dp — SUM where rendered_state='planned' (HEADLINE)
  cancelled_qty_total: number;       // qty_8dp — SUM where status='cancelled'
  plan_count: number;                // COUNT(*)
  plan_count_completed: number;      // COUNT FILTER (done)
  plan_count_cancelled: number;      // COUNT FILTER (cancelled)
  plan_count_remaining: number;      // COUNT FILTER (open)
  latest_created_at: string;         // ISO8601 UTC — MAX(created_at) across the aggregate
}

export interface PlannedInflowResponse {
  rows: PlannedInflowRow[];
  as_of: string;                     // ISO8601 UTC — response generation timestamp
  horizon_days: number;              // contract §4.8 — informational; client may ignore
  source_view: string;               // 'api_read.v_planned_inflow_by_day' — operational debug
}

export interface PlannedInflowQueryParams {
  from: string;                      // YYYY-MM-DD (required upstream)
  to: string;                        // YYYY-MM-DD (required upstream)
  item_id?: string;                  // optional narrow filter
}

// ---------------------------------------------------------------------------
// Constants — match useInventoryFlow.ts cadence so refresh ticks stay aligned
// ---------------------------------------------------------------------------

const REFETCH_INTERVAL_MS = 60_000;
const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function buildQuerystring(params: PlannedInflowQueryParams): string {
  const sp = new URLSearchParams();
  sp.set("from", params.from);
  sp.set("to", params.to);
  if (params.item_id) sp.set("item_id", params.item_id);
  return sp.toString();
}

async function fetchPlannedInflow(
  params: PlannedInflowQueryParams,
): Promise<PlannedInflowResponse> {
  const qs = buildQuerystring(params);
  const url = `/api/inventory/planned-inflow?${qs}`;
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
      `planned_inflow_${res.status}${detail ? `:${detail}` : ""}`,
    );
  }
  return (await res.json()) as PlannedInflowResponse;
}

// ---------------------------------------------------------------------------
// Hook — board-level (14-day window covering daily band)
//
// Date range strategy:
//   - The board's daily band runs current_date through current_date + 14 days.
//   - The weekly band covers weeks 3..8 (= +14 .. +56 days).
//   - We fetch the FULL [today, today+56d] window in one call and let the
//     consumer client-side bucket. Single round-trip, single cache entry.
//
// The `enabled` flag lets the overlay toggle skip the network call entirely
// when the user has switched the overlay OFF.
// ---------------------------------------------------------------------------

export function usePlannedInflow(opts: {
  from: string;
  to: string;
  itemId?: string;
  enabled: boolean;
}): UseQueryResult<PlannedInflowResponse> {
  const queryClient = useQueryClient();
  const seededRef = useRef(false);
  void queryClient;
  void seededRef;

  return useQuery({
    queryKey: ["planned-inflow", opts.from, opts.to, opts.itemId ?? null] as const,
    queryFn: () =>
      fetchPlannedInflow({
        from: opts.from,
        to: opts.to,
        item_id: opts.itemId,
      }),
    enabled: opts.enabled,
    refetchInterval: opts.enabled ? REFETCH_INTERVAL_MS : false,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Toggle persistence — localStorage (contract §10 row 3 + §5.1 toggle spec)
// ---------------------------------------------------------------------------

export const PLANNED_OVERLAY_STORAGE_KEY = "gtfos.inventoryFlow.plannedOverlayEnabled";
export const PLANNED_OVERLAY_DEFAULT = true; // contract §10 row 4; dispatch confirms ON.

export function readPlannedOverlayPref(): boolean {
  if (typeof window === "undefined") return PLANNED_OVERLAY_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PLANNED_OVERLAY_STORAGE_KEY);
    if (raw == null) return PLANNED_OVERLAY_DEFAULT;
    return raw === "true";
  } catch {
    return PLANNED_OVERLAY_DEFAULT;
  }
}

export function writePlannedOverlayPref(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLANNED_OVERLAY_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage may be full / disabled; non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Indexing helper — turn the flat row array into a keyed map for O(1)
// per-(item, day) lookup during render. Same shape used by both the daily
// band (DayCell) and the per-item drilldown.
// ---------------------------------------------------------------------------

export interface PlannedInflowIndex {
  /** Lookup by `${item_id}|${plan_date}` — one row max per key (read-model GROUP BY). */
  byItemDay: Map<string, PlannedInflowRow>;
  /**
   * Lookup by `${item_id}|${iso_week_start_date}` — multiple plan_dates may
   * fall in the same ISO week; values are pre-summed for the weekly band.
   */
  byItemWeek: Map<string, AggregatedWeekRow>;
  /** The original response — for stale-warning checks and as_of display. */
  response: PlannedInflowResponse | null;
}

export interface AggregatedWeekRow {
  item_id: string;
  item_display_name: string | null;
  week_start: string;                // YYYY-MM-DD (Sunday-anchored to match WeekCell)
  planned_remaining_qty: number;     // SUM of headline qty across the week
  plan_count_remaining: number;      // SUM of planned-only counts across the week
  latest_created_at: string;         // MAX across the week
}

/**
 * Sunday-anchored week-start for a given ISO date string. Matches the
 * existing FlowWeek.week_start convention in inventory_flow_contract.md
 * (W4 contract §6.2 — week_start = Sunday).
 */
function weekStartSunday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const dow = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - dow);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function buildPlannedInflowIndex(
  response: PlannedInflowResponse | null,
): PlannedInflowIndex {
  const byItemDay = new Map<string, PlannedInflowRow>();
  const byItemWeek = new Map<string, AggregatedWeekRow>();

  if (!response) {
    return { byItemDay, byItemWeek, response: null };
  }

  for (const row of response.rows) {
    const dayKey = `${row.item_id}|${row.plan_date}`;
    byItemDay.set(dayKey, row);

    // Only planned-remaining contributes to the weekly aggregate. Done /
    // cancelled never appear on the overlay (contract §5.1 V5/V6).
    if (row.planned_remaining_qty <= 0) continue;

    const week = weekStartSunday(row.plan_date);
    const weekKey = `${row.item_id}|${week}`;
    const existing = byItemWeek.get(weekKey);
    if (existing) {
      existing.planned_remaining_qty += row.planned_remaining_qty;
      existing.plan_count_remaining += row.plan_count_remaining;
      if (row.latest_created_at > existing.latest_created_at) {
        existing.latest_created_at = row.latest_created_at;
      }
    } else {
      byItemWeek.set(weekKey, {
        item_id: row.item_id,
        item_display_name: row.item_display_name,
        week_start: week,
        planned_remaining_qty: row.planned_remaining_qty,
        plan_count_remaining: row.plan_count_remaining,
        latest_created_at: row.latest_created_at,
      });
    }
  }

  return { byItemDay, byItemWeek, response };
}

/**
 * Convenience hook: takes the inventory-flow horizon and the toggle state,
 * returns the indexed overlay data ready for render.
 */
export function usePlannedInflowIndex(opts: {
  from: string;
  to: string;
  itemId?: string;
  enabled: boolean;
}): {
  index: PlannedInflowIndex;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: Error | null;
} {
  const query = usePlannedInflow(opts);
  const index = useMemo(
    () => buildPlannedInflowIndex(query.data ?? null),
    [query.data],
  );

  // Persist data freshness for stale-warning chip in the header — no-op effect
  // ensures the hook re-runs whenever the data lands.
  useEffect(() => {
    /* no-op */
  }, [query.data]);

  return {
    index,
    isLoading: query.isLoading && opts.enabled,
    isError: query.isError && opts.enabled,
    isFetching: query.isFetching,
    error: (query.error as Error | null) ?? null,
  };
}

/**
 * Stale-warning predicate: returns true when the latest plan in the response
 * was created more than 24h ago (per dispatch §9). Used to drive a small
 * info chip in the header.
 *
 * If response is null or has no rows, returns false (nothing to flag).
 */
export function isPlannedInflowStale(
  response: PlannedInflowResponse | null,
): boolean {
  if (!response || response.rows.length === 0) return false;
  let latest = 0;
  for (const r of response.rows) {
    const t = Date.parse(r.latest_created_at);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  if (latest === 0) return false;
  return Date.now() - latest > 24 * 60 * 60 * 1000;
}

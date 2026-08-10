// ---------------------------------------------------------------------------
// Today's runs — the one fetch + cache key for GET /api/production-runs/today.
//
// Two screens read this list: /production renders it, and the picking screen
// reads it to find a TANK run's sibling filling runs (a tank has no status of
// its own that ever says "done" — see _lib/runs.ts `tankFillProgress`). Sharing
// the key means the second read is a cache hit, not a second request.
// ---------------------------------------------------------------------------

import { t } from "./copy";
import type { ProductionRunsTodayResponse } from "./types";

/** Local calendar date as YYYY-MM-DD (the backend keys "today" on the operator
 *  timezone, not UTC). */
export function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayRunsQueryKey(date: string): readonly unknown[] {
  return ["production-runs", "today", date];
}

export async function fetchTodayRuns(
  date: string,
): Promise<ProductionRunsTodayResponse> {
  const res = await fetch(
    `/api/production-runs/today?date=${encodeURIComponent(date)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(t("error_load_runs"));
  }
  return (await res.json()) as ProductionRunsTodayResponse;
}

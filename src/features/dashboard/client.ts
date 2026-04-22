// ---------------------------------------------------------------------------
// Dashboard Control Tower feature — client-side fetchers (Tranche C §E).
//
// Each signal has a dedicated async fetcher returning Signal<T>. Fetchers
// never throw — on HTTP failure they return { state: "unavailable", ... };
// on "no proxy endpoint exists" they return { state: "pending_tranche_i" }
// without performing a network request.
//
// Discovery summary (Tranche C Step 1, conducted against
// src/app/api/** as of the dispatch timestamp):
//
//   LIVE SOURCES (have a portal proxy endpoint):
//     /api/me                                  — identity + role
//     /api/exceptions                          — inbox working set
//     /api/planning/runs                       — latest planning run + summary
//     /api/forecasts/versions                  — latest published forecast
//
//   PENDING TRANCHE I (no portal proxy endpoint exists):
//     rebuild_verifier drift                   — no endpoint
//     break-glass state                        — no endpoint
//     integration_runs / integration freshness — no endpoint (DR-10 note)
//     jobs 24h health                          — no endpoint
//     RUNTIME_READY registry                   — no endpoint (authoritative
//                                                 source is harness file
//                                                 .claude/state/runtime_ready.json)
// ---------------------------------------------------------------------------

import { get } from "@/lib/api/client";
import type { Result } from "@/lib/api/client";

import {
  type BreakGlassState,
  type ForecastSummary,
  type InboxSummary,
  type IntegrationFreshnessSummary,
  type JobsHealth24h,
  type LatestPlanningRunSummary,
  type RuntimeReadyRegistrySummary,
  type Signal,
  type StockTruthSummary,
} from "./types";
import type { InboxRow } from "@/features/inbox/types";

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------
function pending<T>(note: string): Signal<T> {
  return { state: "pending_tranche_i", note };
}

function unavailable<T>(res: Exclude<Result<unknown>, { ok: true }>): Signal<T> {
  const reason = res.reason_code ? `${res.reason_code}` : `HTTP ${res.status}`;
  const tail = res.detail ? ` — ${res.detail}` : "";
  return { state: "unavailable", reason: `${reason}${tail}` };
}

// ---------------------------------------------------------------------------
// Top-row stat strip.
// ---------------------------------------------------------------------------

/**
 * Inbox summary — reuses the ["inbox","all_rows"] cache from Tranche B when
 * populated. When the cache is cold (user hasn't visited /inbox yet), the
 * fetcher returns a placeholder Signal; the dashboard renders the panel but
 * with a "not yet loaded" hint. This honors the dispatch rule "reuse the
 * ['inbox','all_rows'] cache key from Tranche B for inbox counts (do not
 * duplicate the fetch)".
 *
 * The dashboard page reads the cache directly via queryClient.getQueryData()
 * rather than re-fetching; this fetcher is still exported for symmetry and
 * for the "pending_tranche_i" placeholder path if cache is cold. The caller
 * drives the cache-read path.
 */
export function summarizeInbox(rows: InboxRow[] | undefined): Signal<InboxSummary> {
  if (!rows) {
    return {
      state: "unavailable",
      reason:
        "Inbox cache cold — visit /inbox once to populate the live count.",
    };
  }
  const summary: InboxSummary = {
    total: rows.length,
    critical: rows.filter((r) => r.severity === "critical").length,
    warning: rows.filter((r) => r.severity === "warning").length,
    info: rows.filter((r) => r.severity === "info").length,
  };
  return { state: "ok", data: summary };
}

/**
 * Latest planning run — pulls the single most-recent completed run and
 * projects its `summary.exceptions_count` (DR-11).
 */
interface PlanningRunListRowRaw {
  run_id: string;
  executed_at: string;
  status: string;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

interface PlanningRunListResponse {
  rows: PlanningRunListRowRaw[];
  count: number;
  total: number;
}

export async function fetchLatestPlanningRun(
  signal?: AbortSignal,
): Promise<Signal<LatestPlanningRunSummary>> {
  const res = await get<PlanningRunListResponse>(
    "/api/planning/runs?status=completed&limit=1",
    { signal },
  );
  if (!res.ok) {
    if (res.status === 404) {
      return {
        state: "ok",
        data: {
          run_id: "",
          executed_at: "",
          status: "none",
          exceptions_count: null,
        },
      };
    }
    return unavailable(res);
  }
  const row = res.data.rows[0];
  if (!row) {
    return {
      state: "ok",
      data: {
        run_id: "",
        executed_at: "",
        status: "none",
        exceptions_count: null,
      },
    };
  }
  return {
    state: "ok",
    data: {
      run_id: row.run_id,
      executed_at: row.executed_at,
      status: row.status,
      exceptions_count: row.summary?.exceptions_count ?? null,
    },
  };
}

/**
 * Break-glass state.
 *
 * No portal proxy endpoint currently exposes a break-glass flag readable from
 * the browser side. Returns pending_tranche_i — dashboard renders a muted
 * "Active: —" card with the pending note. Per DR-8, when such an endpoint is
 * later authored by W1, replace the pending path with a GET against it and
 * decode {active, set_at?, set_by?}.
 */
export async function fetchBreakGlassState(): Promise<Signal<BreakGlassState>> {
  return pending<BreakGlassState>(
    "Break-glass readout pending backend endpoint (Tranche I).",
  );
}

// ---------------------------------------------------------------------------
// Middle blocks.
// ---------------------------------------------------------------------------

/**
 * Stock truth — rebuild_verifier drift + anchors + last parity.
 *
 * None of these are exposed by any current portal proxy. Returns
 * pending_tranche_i; dashboard renders a placeholder card referencing the
 * W1 rebuild-verifier rationale.
 */
export async function fetchStockTruth(): Promise<Signal<StockTruthSummary>> {
  return pending<StockTruthSummary>(
    "rebuild_verifier drift + anchors + last parity read — pending backend endpoint (Tranche I).",
  );
}

/**
 * Integration freshness (DR-10).
 *
 * Neither `api_read.v_integration_freshness` nor a `/api/integration-runs`
 * list endpoint has a portal proxy at this time. Returns pending_tranche_i —
 * dashboard renders a single "Freshness signals pending Tranche I" card.
 * When the proxy lands, update this fetcher to GET the view/endpoint and
 * decode per-producer rows.
 */
export async function fetchIntegrationFreshness(): Promise<
  Signal<IntegrationFreshnessSummary>
> {
  return pending<IntegrationFreshnessSummary>(
    "Per-producer integration freshness grid pending backend endpoint (Tranche I). Authoritative state lives in private_core.integration_runs + api_read.v_integration_freshness (once view is exposed).",
  );
}

/**
 * Jobs 24h health (DR-6).
 *
 * No portal proxy for /api/job-runs or /api/jobs. Returns pending_tranche_i.
 * When an endpoint lands, project {successes, failures, skipped} counts AS
 * SEPARATE BUCKETS — skipped does NOT count as a failure nor as a success.
 */
export async function fetchJobsHealth24h(): Promise<Signal<JobsHealth24h>> {
  return pending<JobsHealth24h>(
    "Jobs 24h health ({successes, failures, skipped}) pending backend endpoint (Tranche I).",
  );
}

/**
 * Latest forecast.
 *
 * Reads /api/forecasts/versions?status=published (no limit param upstream —
 * handler orders by created_at DESC). Projects the first row's
 * {version_id, cadence, horizon_weeks, horizon_start_at, published_at,
 * status}. Per DR-7, `cadence` is the explicit column on forecast_versions
 * per upstream toVersionMetadata projection.
 */
interface ForecastVersionRow {
  version_id: string;
  site_id: string;
  cadence: string | null;
  horizon_start_at: string | null;
  horizon_weeks: number | null;
  status: string;
  published_at: string | null;
  notes: string | null;
}

interface ForecastVersionsListResponse {
  rows: ForecastVersionRow[];
}

export async function fetchLatestForecast(
  signal?: AbortSignal,
): Promise<Signal<ForecastSummary>> {
  const res = await get<ForecastVersionsListResponse>(
    "/api/forecasts/versions?status=published",
    { signal },
  );
  if (!res.ok) {
    if (res.status === 404) {
      return {
        state: "ok",
        data: {
          version_id: "",
          cadence: null,
          horizon_weeks: null,
          horizon_start_at: null,
          published_at: null,
          status: "none",
        },
      };
    }
    return unavailable(res);
  }
  const row = res.data.rows[0];
  if (!row) {
    return {
      state: "ok",
      data: {
        version_id: "",
        cadence: null,
        horizon_weeks: null,
        horizon_start_at: null,
        published_at: null,
        status: "none",
      },
    };
  }
  return {
    state: "ok",
    data: {
      version_id: row.version_id,
      cadence: row.cadence,
      horizon_weeks: row.horizon_weeks,
      horizon_start_at: row.horizon_start_at,
      published_at: row.published_at,
      status: row.status,
    },
  };
}

/**
 * RUNTIME_READY registry.
 *
 * The authoritative source is the harness file .claude/state/runtime_ready.json,
 * which the portal does not (and must not) read at runtime. No portal proxy
 * endpoint exposes this registry either. Returns pending_tranche_i —
 * dashboard renders an informational placeholder that names the authoritative
 * source for operator eyes.
 */
export async function fetchRuntimeReadyRegistry(): Promise<
  Signal<RuntimeReadyRegistrySummary>
> {
  return pending<RuntimeReadyRegistrySummary>(
    "RUNTIME_READY registry pending backend endpoint (Tranche I). Authoritative source today is the harness file .claude/state/runtime_ready.json.",
  );
}

// ---------------------------------------------------------------------------
// DR-12 helper — 500-char last_error truncation.
// ---------------------------------------------------------------------------
const LAST_ERROR_MAX = 500;

export function truncateLastError(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  if (s.length <= LAST_ERROR_MAX) return s;
  return s.slice(0, LAST_ERROR_MAX) + "…";
}

// ---------------------------------------------------------------------------
// Dashboard Control Tower feature — types.
//
// Introduced by Tranche C of portal-full-production-refactor (plan §E).
//
// Each signal panel has a typed read-model. Panels whose upstream endpoint
// does not yet exist in the portal proxy tree render a "pending Tranche I"
// placeholder — we model that as `Signal<T> = { state: "pending_tranche_i" }`.
//
// DR-* defaults (Tom-locked 2026-04-21):
//   DR-1  client-side staleTime = 30_000 ms for all signals (no server cache).
//   DR-3/4/5  exception.category rendered as free-text literal (no enum
//           registration) per 0010 migration invariant.
//   DR-6  jobs 24h bucket shape is {successes, failures, skipped} — skipped
//         counts separately, NOT merged into either bucket.
//   DR-7  forecast cadence read from `cadence` column on the latest version
//         row (available per upstream handler.reads toVersionMetadata line
//         107); fallback to derived/em-dash handled in renderer.
//   DR-8  break-glass renders `Active: Yes/No`; optional set_at/set_by when
//         exposed by an endpoint (currently no endpoint — placeholder path).
//   DR-10 integration freshness: if no view/endpoint, render single pending
//         placeholder card (current portal state — no /api/integration-runs
//         or /api/integration-freshness proxy exists).
//   DR-11 exceptions_count sourced from the latest planning run's
//         `summary.exceptions_count` field (present per handler.reads list
//         projection line 179).
//   DR-12 last_error truncated to 500 chars with a single-character ellipsis
//         suffix when clipped.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Common discriminated-union shape for a signal panel. Every fetcher returns
// this; renderer matches on `state`.
//   ok             — fetch succeeded and the source data is present.
//   unavailable    — fetch attempted but failed (HTTP error, network error,
//                    malformed response). NOT the same as pending_tranche_i.
//   pending_tranche_i — no portal proxy endpoint exists yet for this signal.
//                       No fetch attempted; honest placeholder.
// ---------------------------------------------------------------------------
export type Signal<T> =
  | { state: "ok"; data: T }
  | { state: "unavailable"; reason: string }
  | { state: "pending_tranche_i"; note: string };

// ---------------------------------------------------------------------------
// Top-row stat strip projections.
// ---------------------------------------------------------------------------
export interface InboxSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

export interface LatestPlanningRunSummary {
  run_id: string;
  executed_at: string;
  status: "draft" | "running" | "completed" | "failed" | "superseded" | string;
  // DR-11: exceptions_count from summary projection on the list row.
  exceptions_count: number | null;
}

export interface BreakGlassState {
  // DR-8: Active Yes/No is the only guaranteed field in v1. set_at / set_by
  // render only when exposed by a future endpoint.
  active: boolean;
  set_at?: string;
  set_by?: string;
}

// ---------------------------------------------------------------------------
// Stock truth block.
// ---------------------------------------------------------------------------
export interface StockTruthSummary {
  rebuild_verifier_drift: number | null;
  anchors_count?: number;
  last_parity_check_at?: string;
}

// ---------------------------------------------------------------------------
// Integration freshness block (DR-10).
//   If an upstream view or endpoint exists, each row is a per-producer entry.
//   Current portal state: no such endpoint is proxied; block renders as
//   pending_tranche_i single-card.
// ---------------------------------------------------------------------------
export interface IntegrationFreshnessRow {
  producer: string;
  last_success_at: string | null;
  state: "fresh" | "warning" | "critical" | "never_ran" | string;
}

export interface IntegrationFreshnessSummary {
  rows: IntegrationFreshnessRow[];
}

// ---------------------------------------------------------------------------
// Jobs 24h health block (DR-6).
// ---------------------------------------------------------------------------
export interface JobsHealth24h {
  successes: number;
  failures: number;
  skipped: number;
  last_failure_reason?: string;
}

// ---------------------------------------------------------------------------
// Forecast block (DR-7).
// ---------------------------------------------------------------------------
export interface ForecastSummary {
  version_id: string;
  // Reading explicit `cadence` column present on the forecast_versions row
  // per upstream handler.reads toVersionMetadata projection.
  cadence: string | null;
  horizon_weeks: number | null;
  horizon_start_at: string | null;
  published_at: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// RUNTIME_READY registry block.
//   No portal proxy exposes this; the authoritative source is the harness
//   file .claude/state/runtime_ready.json. Placeholder until an aggregate
//   endpoint lands in Tranche I.
// ---------------------------------------------------------------------------
export interface RuntimeReadyRegistryRow {
  signal_name: string;
  emitted_at: string;
}

export interface RuntimeReadyRegistrySummary {
  rows: RuntimeReadyRegistryRow[];
}

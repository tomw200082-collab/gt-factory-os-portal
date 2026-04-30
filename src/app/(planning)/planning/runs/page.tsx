"use client";

// ---------------------------------------------------------------------------
// /planner/runs — canonical list of planning runs.
//
// Scope (W2 Mode B, PlanningRun only; Phase 8 MVP):
//   - Lists rows from GET /api/v1/queries/planning/runs (§3.1)
//   - Status filter (draft / running / completed / failed / superseded)
//   - Click row -> /planner/runs/[run_id]
//   - "Trigger planning run" action (planner + admin only) -> POST
//     /api/v1/mutations/planning/run (Phase 7B) -> redirect on success
//   - Break-glass banner on 503
//
// Role gate:
//   - operator/viewer: list visible; "Trigger run" hidden
//   - planner/admin: "Trigger run" visible
//   - Operators are admitted by PlannerLayout RoleGate (allow list includes
//     all four roles since reads are open per §6 matrix).
//
// Deferred to future cycles: pagination UI, policy_snapshot full drill-down,
// bulk actions.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Play } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

type PlanningRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "superseded";

interface ForecastContextRow {
  version_id: string;
  cadence: string | null;
  horizon_start_at: string | null;
  horizon_weeks: number | null;
  status: string;
  published_at: string | null;
}

interface JobContextRow {
  job_name: string;
  last_ended_at: string | null;
  last_status: string | null;
  failed_count_24h: number;
}

interface DemandCoverageRow {
  as_of: string;
  total_lines: number;
  resolved_lines: number;
  bundle_lines: number;
  unresolved_lines: number;
  total_distinct_skus: number;
  resolved_distinct_skus: number;
  bundle_distinct_skus: number;
  unresolved_distinct_skus: number;
  is_partial: boolean;
}

interface PlanningRunListRow {
  run_id: string;
  executed_at: string;
  actor_user_id: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: PlanningRunStatus;
  idempotency_key: string | null;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

interface ListResponse {
  rows: PlanningRunListRow[];
  count: number;
  total: number;
}

const STATUS_OPTIONS: PlanningRunStatus[] = [
  "draft",
  "running",
  "completed",
  "failed",
  "superseded",
];

function sessionHeaders(_session: Session): HeadersInit {
  // Real identity flows through the Supabase Bearer token on the portal
  // proxy (api-proxy.ts); the `_session` parameter remains for call-site
  // compatibility and potential future audit logging.
  return {
    "Content-Type": "application/json",
  };
}

async function fetchRuns(
  session: Session,
  status: PlanningRunStatus | null,
): Promise<ListResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/planning/runs${qs}`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Failed to load planning runs. Check your connection and try refreshing.");
  }
  return (await res.json()) as ListResponse;
}

function genIdempotencyKey(): string {
  // Browser-safe UUIDv4. crypto.randomUUID is available in all evergreen
  // browsers + Node 18+; we don't need a polyfill.
  try {
    return (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      ?.randomUUID?.() ?? `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function triggerRun(
  session: Session,
): Promise<{ run_id: string; idempotent_replay: boolean; status: string }> {
  const res = await fetch("/api/planning/runs/execute", {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify({
      idempotency_key: genIdempotencyKey(),
      trigger_source: "manual",
    }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (res.status === 503) {
    const err = new Error("Break-glass active: planning writes suspended.");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  if (!res.ok) {
    let detail = "";
    try {
      const parsed = body as { detail?: string };
      detail = parsed.detail ?? "";
    } catch { /* ignore */ }
    const err = new Error(detail || "Could not trigger planning run. Try again.");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body as { run_id: string; idempotent_replay: boolean; status: string };
}

// Color palette (A13 decision, documented in checkpoint):
// - completed -> success (green dot)
// - running -> info (blue dot, pulse)
// - draft -> warning (amber dot)
// - failed -> danger (red dot)
// - superseded -> neutral (grey dot)
function RunStatusBadge({ status }: { status: PlanningRunStatus }) {
  if (status === "completed") {
    return (
      <Badge tone="success" variant="solid">
        Completed
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge tone="info" dotted>
        Running
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge tone="warning" dotted>
        Draft
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge tone="danger" variant="solid">
        Failed
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Superseded
    </Badge>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function fmtTriggerSourceHebrew(t: "manual" | "scheduled"): string {
  return t === "manual" ? "ידני" : "אוטומטי";
}

export default function PlanningRunsListPage() {
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] =
    useState<PlanningRunStatus | null>(null);
  const [breakGlass, setBreakGlass] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [showTriggerConfirm, setShowTriggerConfirm] = useState(false);
  const canAuthor = session.role === "planner" || session.role === "admin";

  const forecastQuery = useQuery<{ rows: ForecastContextRow[] }>({
    queryKey: ["forecast", "versions", "published"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: ForecastContextRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const jobsQuery = useQuery<{ rows: JobContextRow[] }>({
    queryKey: ["admin", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: JobContextRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const demandCoverageQuery = useQuery<DemandCoverageRow>({
    queryKey: ["planning", "demand-coverage"],
    queryFn: async () => {
      const res = await fetch("/api/planning/demand-coverage");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<DemandCoverageRow>;
    },
    staleTime: 3 * 60 * 1000,
  });

  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob =
    jobsQuery.data?.rows?.find(
      (j) => j.job_name === "integration.lionwheel" || j.job_name === "lionwheel_poll",
    ) ?? null;
  const coverage = demandCoverageQuery.data ?? null;

  const query = useQuery<ListResponse>({
    queryKey: ["planning", "runs", statusFilter ?? "all", session.role],
    queryFn: () => fetchRuns(session, statusFilter),
    staleTime: 60_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => triggerRun(session),
    onSuccess: (data) => {
      setBreakGlass(false);
      setTriggerError(null);
      void queryClient.invalidateQueries({ queryKey: ["planning", "runs"] });
      router.push(`/planning/runs/${encodeURIComponent(data.run_id)}`);
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 503) {
        setBreakGlass(true);
        setTriggerError(null);
      } else {
        setBreakGlass(false);
        console.error("[PlanningRuns] trigger error:", err);
        setTriggerError("Could not trigger planning run. Check your connection and try again. If the problem persists, contact your admin.");
      }
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="ריצות תכנון"
        description="ריצות תכנון משוחזרות. כל ריצה לוכדת תמונת מצב של ביקוש, מלאי, BOM ומדיניות ומפיקה המלצות רכש וייצור. שום פעולה לא תופעל אוטומטית."
        meta={
          <Badge tone="neutral" dotted>
            {total} {total === 1 ? "ריצה" : "ריצות"}
          </Badge>
        }
        actions={
          canAuthor ? (
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1.5"
              data-testid="planning-runs-trigger-button"
              disabled={triggerMutation.isPending}
              onClick={() => setShowTriggerConfirm(true)}
            >
              <Play className="h-3 w-3" strokeWidth={2.5} />
              {triggerMutation.isPending ? "מריץ…" : "הרץ תכנון חדש"}
            </button>
          ) : null
        }
      />

      {/* Planning context — demand inputs summary */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Forecast */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Forecast
          </div>
          {forecastQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : !latestForecast ? (
            <div className="text-xs text-warning-fg">
              No published forecast — planning uses open orders only
            </div>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {latestForecast.cadence ?? "forecast"} · {latestForecast.horizon_weeks}w horizon
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                Published {fmtDate(latestForecast.published_at)}
              </div>
            </>
          )}
        </div>

        {/* Order sync */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Order sync (LionWheel)
          </div>
          {jobsQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : jobsQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load sync status.</div>
          ) : !lionwheelJob ? (
            <div className="text-xs text-fg-muted">No sync job found — LionWheel integration may not be configured.</div>
          ) : (
            <>
              <div
                className={cn(
                  "text-xs font-medium",
                  lionwheelJob.last_status === "failed"
                    ? "text-danger-fg"
                    : "text-fg",
                )}
              >
                {lionwheelJob.last_status === "failed"
                  ? "Last sync failed"
                  : "Synced"}
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                {timeAgo(lionwheelJob.last_ended_at)}
              </div>
              {Number(lionwheelJob.failed_count_24h) > 0 ? (
                <div className="mt-0.5 text-3xs text-warning-fg">
                  {lionwheelJob.failed_count_24h} failure
                  {Number(lionwheelJob.failed_count_24h) !== 1 ? "s" : ""} in 24h
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Demand coverage — live from demand-coverage endpoint */}
        <div
          className={cn(
            "rounded-md border px-4 py-3",
            demandCoverageQuery.isLoading || !coverage || coverage.total_lines === 0
              ? "border-border/60 bg-bg-raised"
              : coverage.is_partial
                ? "border-warning/30 bg-warning-softer"
                : "border-success/30 bg-success-softer",
          )}
        >
          <div
            className={cn(
              "mb-1.5 text-3xs font-semibold uppercase tracking-sops",
              demandCoverageQuery.isLoading || !coverage || coverage.total_lines === 0
                ? "text-fg-subtle"
                : coverage.is_partial
                  ? "text-warning-fg"
                  : "text-success-fg",
            )}
          >
            Demand coverage
          </div>
          {demandCoverageQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : demandCoverageQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load demand coverage.</div>
          ) : !coverage ? (
            <div className="text-xs text-fg-muted">No coverage data — run a planning cycle to compute.</div>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {coverage.resolved_lines} / {coverage.total_lines} lines resolved
                {" · "}
                {coverage.resolved_distinct_skus} SKUs
              </div>
              {coverage.total_lines === 0 ? (
                <div className="mt-0.5 text-3xs text-fg-muted">
                  No order lines — LionWheel sync may be pending
                </div>
              ) : coverage.bundle_lines > 0 || coverage.unresolved_lines > 0 ? (
                <div className="mt-0.5 text-3xs text-fg-muted">
                  {[
                    coverage.bundle_lines > 0
                      ? `${coverage.bundle_lines} bundle lines (${coverage.bundle_distinct_skus} SKUs) excluded`
                      : null,
                    coverage.unresolved_lines > 0
                      ? `${coverage.unresolved_lines} unresolved lines (${coverage.unresolved_distinct_skus} SKUs) excluded`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : (
                <div className="mt-0.5 text-3xs text-success-fg">
                  All active order lines resolved
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {breakGlass ? (
        <div
          className="mb-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          data-testid="planning-runs-break-glass-banner"
          role="alert"
        >
          <strong className="font-semibold">Break-glass active.</strong>{" "}
          Planning writes are suspended. Reads remain available; no new runs
          can be triggered until the flag is cleared.
        </div>
      ) : null}

      {triggerError ? (
        <div
          className="mb-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          data-testid="planning-runs-trigger-error"
          role="alert"
        >
          {triggerError}
        </div>
      ) : null}

      <SectionCard contentClassName="p-0">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="planning-runs-filter-bar"
        >
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Status
          </span>
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                data-testid={`planning-runs-filter-status-${s}`}
                aria-pressed={active}
                onClick={() =>
                  setStatusFilter((cur) => (cur === s ? null : s))
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  active
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {s}
              </button>
            );
          })}
          <button
            type="button"
            className="btn btn-sm ml-auto"
            data-testid="planning-runs-filter-clear"
            onClick={() => setStatusFilter(null)}
          >
            All
          </button>
        </div>

        {query.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-5 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-5 flex-1 rounded bg-bg-subtle" />
                  <div className="h-5 w-24 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <div
              className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
              data-testid="planning-runs-list-error"
            >
              <div className="font-semibold">Could not load planning runs</div>
              <div className="mt-1 text-xs">
                Check your connection. The list will refresh when the API is reachable again.
              </div>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No planning runs in this view."
              description={
                canAuthor
                  ? "Trigger a run to get the first recommendation set."
                  : "No runs yet. A planner will trigger one when needed."
              }
            />
          </div>
        ) : (
          <ul
            className="divide-y divide-border/60"
            data-testid="planning-runs-list"
          >
            {rows.map((r) => {
              const runHref = `/planning/runs/${encodeURIComponent(r.run_id)}`;
              return (
              <li
                key={r.run_id}
                className="px-5 py-4 hover:bg-bg-subtle/40 transition-colors duration-150 rounded"
                data-testid="planning-runs-row"
                data-run-id={r.run_id}
                data-status={r.status}
              >
                {/* Header region — clicking anywhere here opens the run detail
                    on its default (Purchase) tab. The summary badges below
                    are their own links so the manager can jump straight into
                    the right tab without an extra click. */}
                <Link
                  href={runHref}
                  className="block -mx-2 px-2 py-1 rounded"
                  data-testid="planning-runs-row-link"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RunStatusBadge status={r.status} />
                      <span className="chip">{fmtTriggerSourceHebrew(r.trigger_source)}</span>
                    </div>
                    <div className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong">
                      Executed {fmtDate(r.executed_at)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-fg-muted">
                      <span>
                        horizon {fmtDate(r.planning_horizon_start_at)} ·{" "}
                        {r.planning_horizon_weeks}w
                      </span>
                      <span>{fmtTriggerSourceHebrew(r.trigger_source)}</span>
                    </div>
                  </div>
                </Link>

                {/* Summary badges — each is its own deep link. Purchase and
                    Production land directly on the matching tab; FG and
                    exceptions go to the run detail (no exceptions tab yet). */}
                <div className="mt-2 -mx-2 px-2 flex flex-wrap gap-2" data-testid="planning-runs-row-summary">
                  <Link
                    href={`${runHref}?tab=purchase`}
                    className="hover:opacity-80"
                    data-testid="planning-runs-row-purchase-link"
                    title="Open purchase recommendations for this run"
                  >
                    <Badge tone="neutral">
                      {r.summary.purchase_recs_count} purchase
                    </Badge>
                  </Link>
                  <Link
                    href={`${runHref}?tab=production`}
                    className="hover:opacity-80"
                    data-testid="planning-runs-row-production-link"
                    title="Open production recommendations for this run"
                  >
                    <Badge tone="neutral">
                      {r.summary.production_recs_count} production
                    </Badge>
                  </Link>
                  <Link
                    href={runHref}
                    className="hover:opacity-80"
                    title="Open run detail"
                  >
                    <Badge tone="neutral">
                      {r.summary.fg_coverage_count} FG lines
                    </Badge>
                  </Link>
                  {r.summary.exceptions_count > 0 ? (
                    <Link
                      href={runHref}
                      className="hover:opacity-80"
                      title="Open run detail to review exceptions"
                    >
                      <Badge tone="warning" dotted>
                        {r.summary.exceptions_count} exception
                        {r.summary.exceptions_count === 1 ? "" : "s"}
                      </Badge>
                    </Link>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {showTriggerConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trigger-run-title"
          data-testid="planning-runs-trigger-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTriggerConfirm(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
            <h2 id="trigger-run-title" className="text-base font-semibold text-fg-strong">
              להריץ תכנון חדש?
            </h2>
            <p className="mt-2 text-sm text-fg-muted leading-relaxed">
              הריצה תיצור תמונה של הביקוש (תחזית + הזמנות פתוחות), המלאי, ה-BOM
              והמדיניות הנוכחית, ותחשב המלצות רכש וייצור.
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              שום הזמנת רכש או דיווח ייצור לא ייווצרו אוטומטית — אתה תאשר כל המלצה
              בנפרד אחרי שהריצה תסתיים.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowTriggerConfirm(false)}
                disabled={triggerMutation.isPending}
                data-testid="planning-runs-trigger-modal-cancel"
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={triggerMutation.isPending}
                onClick={() => {
                  setShowTriggerConfirm(false);
                  triggerMutation.mutate();
                }}
                data-testid="planning-runs-trigger-modal-confirm"
              >
                <Play className="h-3 w-3" strokeWidth={2.5} />
                הרץ תכנון
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

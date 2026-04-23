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
    throw new Error(`Planning runs list failed (HTTP ${res.status}): ${body}`);
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
    const err = new Error(
      `Trigger planning run failed (HTTP ${res.status}): ${text}`,
    );
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

export default function PlanningRunsListPage() {
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] =
    useState<PlanningRunStatus | null>(null);
  const [breakGlass, setBreakGlass] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const canAuthor = session.role === "planner" || session.role === "admin";

  const forecastQuery = useQuery<{ rows: ForecastContextRow[] }>({
    queryKey: ["forecast", "versions", "published"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ rows: ForecastContextRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const jobsQuery = useQuery<{ rows: JobContextRow[] }>({
    queryKey: ["admin", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ rows: JobContextRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob =
    jobsQuery.data?.rows?.find(
      (j) => j.job_name === "integration.lionwheel" || j.job_name === "lionwheel_poll",
    ) ?? null;

  const query = useQuery<ListResponse>({
    queryKey: ["planning", "runs", statusFilter ?? "all", session.role],
    queryFn: () => fetchRuns(session, statusFilter),
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
        setTriggerError(err.message);
      }
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Planning runs"
        description="Reproducible planning-engine executions. Each run snapshots demand, stock, BOM, and policy, then emits purchase and production recommendations. Nothing orders autonomously."
        meta={
          <Badge tone="neutral" dotted>
            {total} run{total === 1 ? "" : "s"}
          </Badge>
        }
        actions={
          canAuthor ? (
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1.5"
              data-testid="planning-runs-trigger-button"
              disabled={triggerMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Trigger a new planning run now? This snapshots current demand, stock, BOM, and policy, then computes recommendations. Nothing orders autonomously.",
                  )
                ) {
                  triggerMutation.mutate();
                }
              }}
            >
              <Play className="h-3 w-3" strokeWidth={2.5} />
              {triggerMutation.isPending ? "Triggering…" : "Trigger planning run"}
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
              <div className="mt-0.5 font-mono text-3xs text-fg-muted">
                {latestForecast.version_id.slice(0, 8)}…
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
          ) : !lionwheelJob ? (
            <div className="text-xs text-fg-muted">No sync data</div>
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

        {/* Demand coverage caveat */}
        <div className="rounded-md border border-warning/30 bg-warning-softer px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-warning-fg">
            Demand coverage
          </div>
          <div className="text-xs text-fg">Partial</div>
          <div className="mt-0.5 text-3xs text-fg-muted">
            Bundle SKUs and unresolved LionWheel mappings are excluded.
            Recommendations reflect resolved demand only.
          </div>
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
          <div className="p-5 text-xs text-fg-muted">Loading…</div>
        ) : query.isError ? (
          <div
            className="p-5 text-xs text-danger-fg"
            data-testid="planning-runs-list-error"
          >
            {(query.error as Error).message}
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
            {rows.map((r) => (
              <li
                key={r.run_id}
                className="px-5 py-4"
                data-testid="planning-runs-row"
                data-run-id={r.run_id}
                data-status={r.status}
              >
                <Link
                  href={`/planning/runs/${encodeURIComponent(r.run_id)}`}
                  className="flex items-start gap-4 hover:bg-bg-subtle/40 -mx-2 px-2 py-1 rounded"
                  data-testid="planning-runs-row-link"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RunStatusBadge status={r.status} />
                      <span className="chip">{r.trigger_source}</span>
                      <span className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                        {r.run_id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong">
                      Executed {fmtDate(r.executed_at)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-fg-muted">
                      <span>
                        horizon {r.planning_horizon_start_at} ·{" "}
                        {r.planning_horizon_weeks} weeks
                      </span>
                      <span>actor {r.actor_user_id.slice(0, 8)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="neutral">
                        {r.summary.purchase_recs_count} purchase
                      </Badge>
                      <Badge tone="neutral">
                        {r.summary.production_recs_count} production
                      </Badge>
                      <Badge tone="neutral">
                        {r.summary.fg_coverage_count} FG lines
                      </Badge>
                      {r.summary.exceptions_count > 0 ? (
                        <Badge tone="warning" dotted>
                          {r.summary.exceptions_count} exception
                          {r.summary.exceptions_count === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

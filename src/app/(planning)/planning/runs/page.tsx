"use client";

// ---------------------------------------------------------------------------
// /planning/runs — canonical list of planning runs.
//
// Scope (W2 Mode B, PlanningRun only; Phase 8 MVP):
//   - Lists rows from GET /api/planning/runs
//   - Status filter — segmented control (All / Running / Completed / Failed)
//   - Click row → /planning/runs/[run_id]
//   - "Trigger planning run" — primary CTA (planner/admin only)
//   - Auto-refresh every 5s while any row is "running"
//   - Break-glass banner on 503
//
// Role gate:
//   - operator/viewer: list visible; "Trigger run" hidden
//   - planner/admin: "Trigger run" visible
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Play, Loader2 } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

type PlanningRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "superseded";

interface PlanningRunListRow {
  run_id: string;
  executed_at: string;
  actor_user_id: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: PlanningRunStatus;
  idempotency_key: string | null;
  triggered_by_name?: string | null;
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

type StatusFilter = "all" | "running" | "completed" | "failed";

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

function sessionHeaders(_session: Session): HeadersInit {
  return { "Content-Type": "application/json" };
}

async function fetchRuns(
  session: Session,
  filter: StatusFilter,
): Promise<ListResponse> {
  const qs = filter !== "all" ? `?status=${encodeURIComponent(filter)}` : "";
  const res = await fetch(`/api/planning/runs${qs}`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    throw new Error(
      "Failed to load planning runs. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as ListResponse;
}

function genIdempotencyKey(): string {
  try {
    return (
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
        ?.randomUUID?.() ??
      `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
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
    } catch {
      /* ignore */
    }
    const err = new Error(detail || "Could not trigger planning run. Try again.");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body as { run_id: string; idempotent_replay: boolean; status: string };
}

function RunStatusBadge({ status }: { status: PlanningRunStatus }) {
  if (status === "completed") {
    return <Badge tone="success" dotted>Completed</Badge>;
  }
  if (status === "running") {
    return <Badge tone="warning" dotted>Running</Badge>;
  }
  if (status === "draft") {
    return <Badge tone="warning" dotted>Draft</Badge>;
  }
  if (status === "failed") {
    return <Badge tone="danger" dotted>Failed</Badge>;
  }
  return <Badge tone="neutral" dotted>Superseded</Badge>;
}

function fmtRunDate(iso: string | null): string {
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

function actorLabel(row: PlanningRunListRow): string {
  if (row.triggered_by_name && row.triggered_by_name.trim()) {
    return row.triggered_by_name;
  }
  if (row.trigger_source === "scheduled") return "Scheduled";
  return "Manual";
}

export default function PlanningRunsListPage() {
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [breakGlass, setBreakGlass] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const canAuthor = session.role === "planner" || session.role === "admin";

  const query = useQuery<ListResponse>({
    queryKey: ["planning", "runs", filter, session.role],
    queryFn: () => fetchRuns(session, filter),
    staleTime: 30_000,
    // Auto-refresh every 5s while any row is running. Otherwise honor the
    // 30s staleTime above.
    refetchInterval: (q) => {
      const data = q.state.data as ListResponse | undefined;
      const anyRunning = data?.rows?.some((r) => r.status === "running");
      return anyRunning ? 5_000 : false;
    },
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
        setTriggerError(
          "Could not trigger planning run. Check your connection and try again.",
        );
      }
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const filteredRows = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-6">
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Planning runs"
        description="Each run turns the active forecast into purchase and production recommendations."
        actions={
          canAuthor ? (
            <button
              type="button"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              className="btn btn-primary btn-sm gap-1.5"
              data-testid="planning-runs-trigger-btn"
            >
              {triggerMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
              ) : (
                <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              {triggerMutation.isPending ? "Triggering…" : "Trigger planning run"}
            </button>
          ) : null
        }
      />

      {breakGlass ? (
        <div
          role="alert"
          className="rounded border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          data-testid="planning-runs-break-glass-banner"
        >
          <div className="font-semibold">Planning writes suspended</div>
          <div className="mt-1 text-xs leading-relaxed text-warning-fg/90">
            Break-glass is active. Triggering a new run is temporarily disabled.
            Contact admin once the underlying issue is resolved.
          </div>
        </div>
      ) : null}

      {triggerError ? (
        <div
          role="alert"
          className="rounded border border-danger/30 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{triggerError}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending}
                className="btn btn-xs"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => setTriggerError(null)}
                className="btn btn-ghost btn-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Run history"
        title={total === 0 ? "Planning runs" : `${total} planning run${total === 1 ? "" : "s"}`}
        description="Most recent first. Click a row to open the run detail."
        actions={
          <div
            role="tablist"
            aria-label="Filter by status"
            className="inline-flex items-center gap-1 rounded border border-border/70 bg-bg-raised p-0.5"
            data-testid="planning-runs-filter"
          >
            {FILTER_OPTIONS.map((opt) => {
              const active = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(opt.key)}
                  className={cn(
                    "rounded px-2.5 py-1 text-2xs font-semibold uppercase tracking-sops transition-colors",
                    active
                      ? "bg-accent text-accent-fg"
                      : "text-fg-muted hover:text-fg-strong",
                  )}
                  data-testid={`planning-runs-filter-${opt.key}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        }
      >
        {query.isLoading ? (
          <div
            className="space-y-2"
            aria-busy="true"
            aria-label="Loading planning runs…"
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 w-full animate-pulse rounded bg-bg-subtle"
              />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState
            title="Could not load planning runs"
            description="Check your connection and try refreshing."
            action={
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="btn btn-sm"
              >
                Try again
              </button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title={
              filter === "all"
                ? "No planning runs yet"
                : `No ${filter} runs`
            }
            description={
              filter === "all"
                ? "Trigger your first run to turn the active forecast into recommendations."
                : "Try a different filter to see other runs."
            }
            action={
              filter !== "all" ? (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="btn btn-sm"
                >
                  Show all runs
                </button>
              ) : canAuthor ? (
                <button
                  type="button"
                  onClick={() => triggerMutation.mutate()}
                  disabled={triggerMutation.isPending}
                  className="btn btn-primary btn-sm gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Trigger planning run
                </button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table
                className="w-full border-collapse text-sm"
                data-testid="planning-runs-table"
              >
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60 text-left">
                    <th className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Run date
                    </th>
                    <th className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Recommendations
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Exceptions
                    </th>
                    <th className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Triggered by
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const recs =
                      r.summary.purchase_recs_count +
                      r.summary.production_recs_count;
                    return (
                      <tr
                        key={r.run_id}
                        className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/50 cursor-pointer transition-colors"
                        data-testid="planning-runs-row"
                        data-run-id={r.run_id}
                        data-status={r.status}
                        onClick={() =>
                          router.push(
                            `/planning/runs/${encodeURIComponent(r.run_id)}`,
                          )
                        }
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/planning/runs/${encodeURIComponent(r.run_id)}`}
                            className="text-sm font-medium text-fg-strong hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {fmtRunDate(r.executed_at)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <RunStatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-fg">
                          {recs}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {r.summary.exceptions_count > 0 ? (
                            <span className="text-warning-fg font-semibold">
                              {r.summary.exceptions_count}
                            </span>
                          ) : (
                            <span className="text-fg-muted">0</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-fg-muted">
                          {actorLabel(r)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-border/40">
              {filteredRows.map((r) => {
                const recs =
                  r.summary.purchase_recs_count +
                  r.summary.production_recs_count;
                return (
                  <Link
                    key={r.run_id}
                    href={`/planning/runs/${encodeURIComponent(r.run_id)}`}
                    className="block py-3 px-1 hover:bg-bg-subtle/50 transition-colors"
                    data-testid="planning-runs-row"
                    data-run-id={r.run_id}
                    data-status={r.status}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-fg-strong">
                        {fmtRunDate(r.executed_at)}
                      </div>
                      <RunStatusBadge status={r.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-fg-muted">
                      <span>
                        <span className="font-mono tabular-nums text-fg">{recs}</span>{" "}
                        recs
                      </span>
                      {r.summary.exceptions_count > 0 ? (
                        <span className="text-warning-fg font-medium">
                          {r.summary.exceptions_count} exceptions
                        </span>
                      ) : null}
                      <span>by {actorLabel(r)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

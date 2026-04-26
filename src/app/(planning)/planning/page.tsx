"use client";

// ---------------------------------------------------------------------------
// Planning workspace landing — operational entry point showing current
// corridor state. Planners should be able to answer at a glance:
//   - Is forecast current?
//   - Is LionWheel sync healthy?
//   - Is demand coverage resolved?
//   - What did the last planning run produce?
//   - What needs attention right now?
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

interface ForecastVersionRow {
  version_id: string;
  cadence: string | null;
  horizon_start_at: string | null;
  horizon_weeks: number | null;
  status: string;
  published_at: string | null;
}

interface JobRow {
  job_name: string;
  last_ended_at: string | null;
  last_status: string | null;
  failed_count_24h: number;
}

interface DemandCoverage {
  as_of: string;
  total_lines: number;
  resolved_lines: number;
  unresolved_lines: number;
  bundle_lines: number;
  total_distinct_skus: number;
  resolved_distinct_skus: number;
  unresolved_distinct_skus: number;
  is_partial: boolean;
}

interface PlanningRunSummaryRow {
  run_id: string;
  executed_at: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: "draft" | "running" | "completed" | "failed" | "superseded";
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PlanningLandingPage() {
  const { session } = useSession();
  const canTrigger = session.role === "planner" || session.role === "admin";

  const forecastQuery = useQuery<{ rows: ForecastVersionRow[] }>({
    queryKey: ["planning", "landing", "forecast"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: ForecastVersionRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const jobsQuery = useQuery<{ rows: JobRow[] }>({
    queryKey: ["planning", "landing", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: JobRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const demandQuery = useQuery<DemandCoverage>({
    queryKey: ["planning", "landing", "demand-coverage"],
    queryFn: async () => {
      const res = await fetch("/api/planning/demand-coverage");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<DemandCoverage>;
    },
    staleTime: 3 * 60 * 1000,
  });

  const runsQuery = useQuery<{ rows: PlanningRunSummaryRow[]; total: number }>({
    queryKey: ["planning", "landing", "runs"],
    queryFn: async () => {
      const res = await fetch("/api/planning/runs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: PlanningRunSummaryRow[]; total: number }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob = jobsQuery.data?.rows?.find(
    (j) => j.job_name === "integration.lionwheel" || j.job_name === "lionwheel_poll",
  ) ?? null;
  const coverage = demandQuery.data ?? null;
  const latestRun = runsQuery.data?.rows?.[0] ?? null;
  const totalRuns = runsQuery.data?.total ?? 0;

  // Derive overall corridor health signal for the header.
  // Only evaluate once all relevant queries have settled — avoids false "Attention needed"
  // during initial load when latestForecast is null because the query hasn't returned yet.
  const queriesSettled =
    !forecastQuery.isLoading &&
    !jobsQuery.isLoading &&
    !demandQuery.isLoading &&
    !runsQuery.isLoading;
  const hasWarning =
    queriesSettled &&
    (Boolean(coverage?.is_partial) ||
      lionwheelJob?.last_status === "failed" ||
      latestRun?.status === "failed" ||
      !latestForecast);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning"
        title="Planning workspace"
        description="Current state of demand inputs, order sync, and planning recommendations."
        meta={
          !queriesSettled ? (
            <Badge tone="neutral" dotted>Checking…</Badge>
          ) : hasWarning ? (
            <Badge tone="warning" dotted>Attention needed</Badge>
          ) : (
            <Badge tone="success" dotted>Inputs healthy</Badge>
          )
        }
      />

      {/* Corridor state: 3-up context cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Forecast */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Forecast
          </div>
          {forecastQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : forecastQuery.isError ? (
            <div className="text-xs text-danger-fg">
              Could not load forecast data.
              <Link href="/planning/forecast" className="ml-1 text-3xs text-accent hover:underline">
                Go to forecasts →
              </Link>
            </div>
          ) : !latestForecast ? (
            <>
              <div className="text-xs font-medium text-warning-fg">
                No published forecast
              </div>
              <div className="mt-1 text-3xs text-fg-muted">
                Planning uses open orders only.{" "}
                <Link href="/planning/forecast" className="text-accent hover:underline">
                  Publish a forecast
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {latestForecast.cadence ?? "forecast"} · {latestForecast.horizon_weeks}w
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                Published {fmtDate(latestForecast.published_at)}
              </div>
              <div className="mt-1">
                <Link href="/planning/forecast" className="text-3xs text-accent hover:underline">
                  View forecasts →
                </Link>
              </div>
            </>
          )}
        </div>

        {/* LionWheel order sync */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Order sync (LionWheel)
          </div>
          {jobsQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : jobsQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load sync status.</div>
          ) : !lionwheelJob ? (
            <div className="text-xs text-fg-muted">
              No sync job found — LionWheel integration may not be configured.
            </div>
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
                {lionwheelJob.last_status === "failed" ? "Last sync failed" : "Synced"}
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

        {/* Demand coverage */}
        <div
          className={cn(
            "rounded-md border px-4 py-3",
            demandQuery.isLoading || !coverage || coverage.total_lines === 0
              ? "border-border/60 bg-bg-raised"
              : coverage.is_partial
                ? "border-warning/30 bg-warning-softer"
                : "border-success/30 bg-success-softer",
          )}
        >
          <div
            className={cn(
              "mb-1.5 text-3xs font-semibold uppercase tracking-sops",
              demandQuery.isLoading || !coverage || coverage.total_lines === 0
                ? "text-fg-subtle"
                : coverage.is_partial
                  ? "text-warning-fg"
                  : "text-success-fg",
            )}
          >
            Demand coverage
          </div>
          {demandQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : demandQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load demand coverage.</div>
          ) : !coverage ? (
            <div className="text-xs text-fg-muted">No demand coverage data — run a planning cycle to compute demand.</div>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {coverage.resolved_lines} / {coverage.total_lines} lines resolved
              </div>
              {coverage.total_lines === 0 ? (
                <div className="mt-0.5 text-3xs text-fg-muted">
                  No order lines — LionWheel sync may be pending
                </div>
              ) : coverage.unresolved_lines > 0 || coverage.bundle_lines > 0 ? (
                <div className="mt-0.5 text-3xs text-warning-fg">
                  {[
                    coverage.unresolved_lines > 0
                      ? `${coverage.unresolved_lines} unresolved (${coverage.unresolved_distinct_skus} SKUs)`
                      : null,
                    coverage.bundle_lines > 0
                      ? `${coverage.bundle_lines} bundle lines excluded`
                      : null,
                  ].filter(Boolean).join(" · ")}
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

      {/* Latest planning run */}
      <SectionCard
        eyebrow="Latest planning run"
        title={
          runsQuery.isLoading
            ? "Loading…"
            : latestRun
              ? `Latest run — ${
                  latestRun.status === "completed" ? "Completed"
                  : latestRun.status === "failed" ? "Failed"
                  : latestRun.status === "running" ? "Running"
                  : latestRun.status === "superseded" ? "Superseded"
                  : latestRun.status === "draft" ? "Queued"
                  : latestRun.status
                }`
              : "No runs yet"
        }
        contentClassName="px-4 py-3"
      >
        {runsQuery.isLoading ? (
          <div className="text-xs text-fg-muted">Loading runs…</div>
        ) : runsQuery.isError ? (
          <div className="text-xs text-danger-fg">
            Could not load planning runs. Check your connection and try refreshing.
          </div>
        ) : !latestRun ? (
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-fg-muted">
                No planning runs have been triggered yet.
              </div>
              {canTrigger ? (
                <div className="mt-1.5">
                  <Link
                    href="/planning/runs"
                    className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                  >
                    <Play className="h-3 w-3" strokeWidth={2.5} />
                    Trigger the first run
                  </Link>
                </div>
              ) : (
                <div className="mt-1 text-3xs text-fg-muted">
                  Ask a planner or admin to trigger a run.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              {/* Run status and timing */}
              <div className="flex flex-wrap items-center gap-2">
                {latestRun.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" strokeWidth={2} />
                ) : latestRun.status === "failed" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-danger-fg" strokeWidth={2} />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
                )}
                <span className="text-xs font-medium text-fg">
                  {latestRun.status === "completed"
                    ? "Completed"
                    : latestRun.status === "failed"
                      ? "Failed"
                      : latestRun.status === "running"
                        ? "Running…"
                        : latestRun.status === "superseded"
                          ? "Superseded"
                          : latestRun.status === "draft"
                            ? "Queued"
                            : latestRun.status}
                </span>
                <span className="text-3xs text-fg-muted">
                  {timeAgo(latestRun.executed_at)} · horizon starts {fmtDate(latestRun.planning_horizon_start_at)} · {latestRun.planning_horizon_weeks}w
                </span>
              </div>

              {/* Recommendation counts */}
              {latestRun.status === "completed" && (
                <div className="flex flex-wrap gap-2">
                  <Badge tone="info" dotted>
                    {latestRun.summary.purchase_recs_count} purchase rec{latestRun.summary.purchase_recs_count !== 1 ? "s" : ""}
                  </Badge>
                  <Badge tone="neutral" dotted>
                    {latestRun.summary.production_recs_count} production rec{latestRun.summary.production_recs_count !== 1 ? "s" : ""}
                  </Badge>
                  {latestRun.summary.exceptions_count > 0 ? (
                    <Badge tone="warning" dotted>
                      {latestRun.summary.exceptions_count} exception{latestRun.summary.exceptions_count !== 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              >
                Review run
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
              {canTrigger ? (
                <Link
                  href="/planning/runs"
                  className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
                >
                  <Play className="h-3 w-3" strokeWidth={2.5} />
                  New run
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {totalRuns > 1 ? (
          <div className="mt-3 border-t border-border/40 pt-3">
            <Link
              href="/planning/runs"
              className="text-3xs text-fg-muted hover:text-fg"
            >
              {totalRuns} total runs — view all →
            </Link>
          </div>
        ) : null}
      </SectionCard>

      {/* Navigation links */}
      <SectionCard eyebrow="Surfaces" title="Planning corridor" contentClassName="p-0">
        <ul className="divide-y divide-border/40">
          {[
            {
              label: "Forecast",
              href: "/planning/forecast",
              blurb: "Create, edit, and publish forecast versions (8-week horizon).",
            },
            {
              label: "Planning runs",
              href: "/planning/runs",
              blurb: "Review runs, approve purchase recommendations, convert to POs.",
            },
            {
              label: "BOM simulation",
              href: "/planning/boms",
              blurb: "Check material coverage against current stock for a given production quantity.",
            },
            {
              label: "Inventory Flow",
              href: "/planning/inventory-flow",
              blurb: "Daily FG projection — at-risk products surface, with 14 days daily detail and 6 weeks weekly outlook.",
            },
            {
              label: "Purchase orders",
              href: "/purchase-orders",
              blurb: "Browse open purchase orders converted from approved recommendations.",
            },
          ].map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-bg-subtle/40"
              >
                <div>
                  <div className="text-sm font-medium text-fg">{m.label}</div>
                  <div className="mt-0.5 text-3xs text-fg-muted">{m.blurb}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-faint" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}

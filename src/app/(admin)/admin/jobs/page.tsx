"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertOctagon, CalendarClock, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";

interface JobRow {
  job_name: string;
  last_started_at: string | null;
  last_ended_at: string | null;
  last_status: string | null;
  last_error: string | null;
  run_count_24h: number;
  failed_count_24h: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtTs(iso: string | null): string {
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

// Iter 5: guess expected interval for stale detection
function guessIntervalMs(jobName: string): number {
  const n = jobName.toLowerCase();
  if (n.includes("nightly") || n.includes("daily")) return 24 * 60 * 60 * 1000;
  if (n.includes("hourly")) return 60 * 60 * 1000;
  if (n.includes("5min") || n.includes("5m")) return 5 * 60 * 1000;
  if (n.includes("15min") || n.includes("15m")) return 15 * 60 * 1000;
  if (n.includes("30min") || n.includes("30m")) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

function isStale(row: JobRow): boolean {
  const ts = row.last_ended_at ?? row.last_started_at;
  if (!ts) return false;
  if (row.last_status === "running") return false;
  return Date.now() - new Date(ts).getTime() > 2 * guessIntervalMs(row.job_name);
}

function staleTooltip(row: JobRow): string {
  const ago = timeAgo(row.last_ended_at ?? row.last_started_at);
  const hours = Math.round(guessIntervalMs(row.job_name) / (60 * 60 * 1000));
  return `Expected every ${hours}h — last ran ${ago}`;
}

type StatusTone = "success" | "danger" | "info" | "warning" | "neutral";

function resolveStatusTone(row: JobRow): StatusTone {
  if (row.last_status === "succeeded") return "success";
  if (row.last_status === "failed") return "danger";
  if (row.last_status === "running") return "info";
  if (row.last_status === "aborted") return "warning";
  if (isStale(row)) return "warning";
  return "neutral";
}

function resolveStatusLabel(row: JobRow): string {
  if (row.last_status === "succeeded") return "Success";
  if (row.last_status === "failed") return "Failed";
  if (row.last_status === "running") return "Running";
  if (row.last_status === "aborted") return "Aborted";
  if (isStale(row)) return "Stale";
  if (!row.last_status) return "Never run";
  return row.last_status;
}

// Iter 3: overall health summary bar
interface HealthSummaryProps {
  rows: JobRow[];
  isFetching: boolean;
  secondsToNext: number;
  onRefresh: () => void;
}

function HealthSummaryBar({ rows, isFetching, secondsToNext, onRefresh }: HealthSummaryProps) {
  const total = rows.length;
  const failed = rows.filter((r) => r.last_status === "failed").length;
  const running = rows.filter((r) => r.last_status === "running").length;
  const staleCount = rows.filter((r) => isStale(r)).length;
  const healthy = rows.filter((r) => r.last_status === "succeeded" && !isStale(r)).length;
  const overallTone: StatusTone =
    failed > 0 ? "danger" : staleCount > 0 ? "warning" : "success";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border p-4",
        overallTone === "danger"
          ? "border-danger/40 bg-danger-softer"
          : overallTone === "warning"
            ? "border-warning/40 bg-warning-softer"
            : "border-success/40 bg-success-softer",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          overallTone === "danger"
            ? "bg-danger text-fg-inverted"
            : overallTone === "warning"
              ? "bg-warning text-fg-inverted"
              : "bg-success text-fg-inverted",
        )}
      >
        {overallTone === "success" ? (
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
        ) : overallTone === "warning" ? (
          <Clock className="h-4 w-4" strokeWidth={2} />
        ) : (
          <AlertOctagon className="h-4 w-4" strokeWidth={2} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-semibold",
            overallTone === "danger"
              ? "text-danger-fg"
              : overallTone === "warning"
                ? "text-warning-fg"
                : "text-success-fg",
          )}
        >
          {overallTone === "success"
            ? `All ${total} jobs healthy`
            : overallTone === "warning"
              ? `${staleCount} job${staleCount === 1 ? "" : "s"} stale — ${healthy}/${total} healthy`
              : `${failed} job${failed === 1 ? "" : "s"} failed — ${healthy}/${total} healthy`}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-2">
          {running > 0 && <span className="text-xs text-info-fg">{running} running</span>}
          {failed > 0 && <span className="text-xs text-danger-fg">{failed} failed</span>}
          {staleCount > 0 && <span className="text-xs text-warning-fg">{staleCount} stale</span>}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-fg-muted">
          {isFetching ? "Refreshing…" : `Next refresh in ${secondsToNext}s`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="btn btn-ghost btn-sm flex items-center gap-1.5"
          aria-label="Refresh now"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            strokeWidth={2}
          />
          Refresh
        </button>
      </div>
    </div>
  );
}

// Iters 2/4/5: job status card
function JobCard({ row }: { row: JobRow }) {
  const tone = resolveStatusTone(row);
  const label = resolveStatusLabel(row);
  const stale = isStale(row);
  const isFailed = row.last_status === "failed";
  const isRunning = row.last_status === "running";
  const [errorExpanded, setErrorExpanded] = useState(false);
  const errorText = row.last_error ?? "";
  const errorIsLong = errorText.length > 120;
  const rowBg = isFailed
    ? "bg-danger-softer/30 border-danger/30"
    : "bg-bg-card border-border/60";

  return (
    <div className={cn("rounded-lg border p-3 transition-colors hover:bg-bg-subtle/40", rowBg)}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium text-fg-strong">{row.job_name}</span>
            <Badge tone={tone} dotted className={isRunning ? "animate-pulse" : undefined}>
              {label}
            </Badge>
            {stale && !isFailed && (
              <span title={staleTooltip(row)} className="cursor-help">
                <Badge tone="warning">Stale</Badge>
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-fg-muted">
            <span>
              {"Last run: "}
              <span className="text-fg">
                {timeAgo(row.last_ended_at ?? row.last_started_at)}
              </span>
              {" "}
              <span className="text-fg-faint">
                {`(${fmtTs(row.last_ended_at ?? row.last_started_at)})`}
              </span>
            </span>
          </div>
          {isFailed && row.last_error && (
            <div className="mt-1.5 rounded border border-danger/30 bg-danger-softer/60 px-2 py-1 text-xs text-danger-fg">
              <span className="font-semibold">Error: </span>
              {errorIsLong && !errorExpanded
                ? `${errorText.slice(0, 120)}…`
                : errorText}
              {errorIsLong && (
                <button
                  type="button"
                  onClick={() => setErrorExpanded((v) => !v)}
                  className="ml-1.5 font-medium underline underline-offset-2 hover:no-underline"
                >
                  {errorExpanded ? "Show less" : "Show full error"}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <div className="text-center">
            <div className="tabular-nums font-semibold text-fg-strong">{row.run_count_24h}</div>
            <div className="text-3xs text-fg-muted">runs 24h</div>
          </div>
          <div className="text-center">
            <div
              className={cn(
                "tabular-nums font-semibold",
                Number(row.failed_count_24h) > 0 ? "text-danger-fg" : "text-fg-muted",
              )}
            >
              {row.failed_count_24h}
            </div>
            <div className="text-3xs text-fg-muted">failures 24h</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminJobsPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt, isFetching } =
    useQuery<{ rows: JobRow[] }>({
      queryKey: ["admin-jobs"],
      queryFn: async () => {
        const res = await fetch("/api/admin/jobs");
        if (!res.ok) throw new Error("Failed to load jobs");
        return res.json() as Promise<{ rows: JobRow[] }>;
      },
      refetchInterval: 60_000,
    });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsSinceUpdate = Math.max(0, Math.floor((now - dataUpdatedAt) / 1000));
  const secondsToNextRefresh = Math.max(0, 60 - secondsSinceUpdate);

  const rows = data?.rows ?? [];
  const totalJobs = rows.length;
  const failedJobs = rows.filter((r) => r.last_status === "failed").length;
  const runningJobs = rows.filter((r) => r.last_status === "running").length;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · jobs"
        title="Jobs Monitor"
        description="Last run status for all scheduled jobs. Auto-refreshes every 60 seconds."
        meta={
          data ? (
            <>
              <Badge tone="neutral" dotted>
                {totalJobs} {totalJobs === 1 ? "job" : "jobs"}
              </Badge>
              {failedJobs > 0 ? (
                <Badge tone="danger" dotted>{failedJobs} failed</Badge>
              ) : (
                <Badge tone="success" dotted>all healthy</Badge>
              )}
              {runningJobs > 0 && (
                <Badge tone="info" dotted className="animate-pulse">
                  {runningJobs} running
                </Badge>
              )}
              <Badge tone="neutral" variant="outline" dotted>
                {isFetching
                  ? "refreshing…"
                  : `next refresh in ${secondsToNextRefresh}s`}
              </Badge>
            </>
          ) : null
        }
      />

      {data && rows.length > 0 && (
        <HealthSummaryBar
          rows={rows}
          isFetching={isFetching}
          secondsToNext={secondsToNextRefresh}
          onRefresh={() => void refetch()}
        />
      )}

      <SectionCard eyebrow="Scheduled jobs" title="All jobs" contentClassName="p-3 sm:p-4">
        {isLoading && (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-bg-subtle" />
            ))}
          </div>
        )}
        {error && (
          <ErrorState
            title="Could not load jobs"
            description={(error as Error).message}
            action={
              <button type="button" onClick={() => void refetch()} className="btn btn-sm">
                Retry
              </button>
            }
          />
        )}
        {data && rows.length === 0 && (
          <EmptyState
            title="No scheduled jobs yet"
            description="Jobs are registered by W1 migrations / Edge Functions. Once a job runs at least once, it appears here."
            icon={<CalendarClock className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />}
          />
        )}
        {data && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => (
              <JobCard key={r.job_name} row={r} />
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

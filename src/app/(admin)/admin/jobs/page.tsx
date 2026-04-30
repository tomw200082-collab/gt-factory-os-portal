"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

interface JobRow {
  job_name: string;
  last_started_at: string | null;
  last_ended_at: string | null;
  last_status: string | null;
  last_error: string | null;
  run_count_24h: number;
  failed_count_24h: number;
}

function statusClass(s: string | null): string {
  if (s === "succeeded") return "text-success-fg";
  if (s === "failed") return "font-semibold text-danger-fg";
  if (s === "running") return "text-info-fg";
  if (s === "aborted") return "text-warning-fg";
  return "text-fg-muted";
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}


export default function AdminJobsPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt, isFetching } = useQuery<{ rows: JobRow[] }>({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json() as Promise<{ rows: JobRow[] }>;
    },
    refetchInterval: 60_000,
  });

  // Tick-down "next refresh in X" so the operator sees the auto-refresh
  // is actually working. Resets when dataUpdatedAt advances.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsSinceUpdate = Math.max(0, Math.floor((now - dataUpdatedAt) / 1000));
  const secondsToNextRefresh = Math.max(0, 60 - secondsSinceUpdate);

  // Aggregate health summary across all known jobs.
  const totalJobs = data?.rows.length ?? 0;
  const failedJobs = data?.rows.filter((r) => r.last_status === "failed").length ?? 0;
  const runningJobs = data?.rows.filter((r) => r.last_status === "running").length ?? 0;

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
                <Badge tone="danger" dotted>
                  {failedJobs} failed
                </Badge>
              ) : (
                <Badge tone="success" dotted>
                  all healthy
                </Badge>
              )}
              {runningJobs > 0 ? (
                <Badge tone="info" dotted>
                  {runningJobs} running
                </Badge>
              ) : null}
              <Badge tone="neutral" variant="outline" dotted>
                {isFetching ? "refreshing…" : `next refresh in ${secondsToNextRefresh}s`}
              </Badge>
            </>
          ) : null
        }
      />
      <SectionCard
        eyebrow="Scheduled jobs"
        title="All jobs"
        contentClassName="p-0"
        actions={
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn btn-ghost btn-sm"
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh now"}
          </button>
        }
      >
        {isLoading && (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load jobs</div>
              <div className="mt-1 text-xs">{(error as Error).message}</div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {data && data.rows.length === 0 && (
          <div className="p-8 text-center">
            <div className="mx-auto max-w-sm">
              <div className="text-sm font-semibold text-fg-strong">
                No scheduled jobs yet.
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                Jobs are registered by W1 migrations / Edge Functions. Once a
                job runs at least once, it appears here. Check that pg_cron
                is enabled and the Edge Function is deployed.
              </div>
            </div>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Job
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Last status
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Last started
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Last ended
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    24h runs
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    24h failures
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.job_name}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.job_name}
                    </td>
                    <td className={`px-3 py-2 text-xs ${statusClass(r.last_status)}`}>
                      {r.last_status ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtTs(r.last_started_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtTs(r.last_ended_at)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {r.run_count_24h}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs tabular-nums ${Number(r.failed_count_24h) > 0 ? "font-semibold text-danger-fg" : "text-fg-muted"}`}>
                      {r.failed_count_24h}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.some((r) => r.last_error) && (
              <div className="border-t border-border/40 p-4 space-y-2">
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Last error per job
                </div>
                {data.rows
                  .filter((r) => r.last_error)
                  .map((r) => (
                    <div key={r.job_name} className="text-xs">
                      <span className="font-mono text-fg">{r.job_name}:</span>{" "}
                      <span className="text-danger-fg">{r.last_error}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </>
  );
}

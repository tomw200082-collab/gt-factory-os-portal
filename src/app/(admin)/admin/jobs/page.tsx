"use client";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

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
  const { data, isLoading, error, refetch } = useQuery<{ rows: JobRow[] }>({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json() as Promise<{ rows: JobRow[] }>;
    },
    refetchInterval: 60_000,
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · jobs"
        title="Jobs Monitor"
        description="Last run status for all scheduled jobs. Auto-refreshes every 60 seconds."
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
          >
            Refresh now
          </button>
        }
      >
        {isLoading && (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        )}
        {error && (
          <div className="p-5 text-sm text-danger-fg">
            {(error as Error).message}
          </div>
        )}
        {data && data.rows.length === 0 && (
          <div className="p-5 text-sm text-fg-muted">No job runs recorded yet.</div>
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

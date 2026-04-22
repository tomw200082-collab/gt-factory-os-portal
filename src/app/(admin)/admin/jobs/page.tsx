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

const STATUS_COLORS: Record<string, string> = {
  succeeded: "text-green-700",
  failed: "text-red-700 font-semibold",
  running: "text-blue-700",
  aborted: "text-amber-700",
  skipped: "text-muted-foreground",
};

export default function AdminJobsPage() {
  const { data, isLoading, error, refetch } = useQuery<{ rows: JobRow[] }>({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin"
        title="Jobs Monitor"
        description="Last run status for all scheduled jobs. Refreshes every 60s."
      />
      <SectionCard eyebrow="Scheduled jobs" title="Job Status">
        <div className="flex justify-end mb-2">
          <button onClick={() => refetch()} className="text-sm text-muted-foreground underline">Refresh now</button>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">Error loading jobs.</p>}
        {data && data.rows.length === 0 && <p className="text-sm text-muted-foreground">No job runs recorded yet.</p>}
        {data && data.rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Job</th>
                <th className="pb-2 pr-4 font-medium">Last Status</th>
                <th className="pb-2 pr-4 font-medium">Last Run</th>
                <th className="pb-2 pr-4 font-medium">Ended</th>
                <th className="pb-2 pr-4 font-medium">24h Runs</th>
                <th className="pb-2 font-medium">24h Failures</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.job_name} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{r.job_name}</td>
                  <td className={`py-2 pr-4 text-xs ${STATUS_COLORS[r.last_status ?? ""] ?? ""}`}>{r.last_status ?? "—"}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{r.last_started_at ? new Date(r.last_started_at).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{r.last_ended_at ? new Date(r.last_ended_at).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-4 text-xs">{r.run_count_24h}</td>
                  <td className={`py-2 text-xs ${Number(r.failed_count_24h) > 0 ? "text-red-700 font-semibold" : ""}`}>{r.failed_count_24h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data?.rows.some(r => r.last_error) && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Last errors:</p>
            {data.rows.filter(r => r.last_error).map(r => (
              <p key={r.job_name} className="text-xs text-destructive"><span className="font-mono">{r.job_name}:</span> {r.last_error}</p>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

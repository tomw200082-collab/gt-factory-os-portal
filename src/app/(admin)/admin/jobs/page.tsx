"use client";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { SEED_JOBS } from "@/lib/fixtures/jobs";

const STATUS_TONE = {
  ok: "success",
  warn: "warning",
  fail: "danger",
  never_run: "neutral",
} as const;

export default function JobsMonitorPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="System"
        title="Jobs monitor"
        description="Scheduled job health. Read-only except for Run now, Disable, and View logs actions (not wired)."
      />

      <SectionCard>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Job</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Status</th>
                <th>Next run</th>
                <th>Enabled</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {SEED_JOBS.map((j) => (
                <tr key={j.id}>
                  <td>
                    <div className="font-medium">{j.job_name}</div>
                    <div className="font-mono text-2xs text-fg-subtle">{j.job_id}</div>
                  </td>
                  <td className="font-mono text-2xs">{j.schedule}</td>
                  <td>
                    <FreshnessBadge
                      label=""
                      lastAt={j.last_run_at}
                      warnAfterMinutes={120}
                      failAfterMinutes={24 * 60}
                    />
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[j.last_status]}>{j.last_status}</Badge>
                    {j.last_error ? (
                      <div className="mt-0.5 text-2xs text-fg-muted">{j.last_error}</div>
                    ) : null}
                  </td>
                  <td className="text-2xs text-fg-muted">
                    {j.next_run_at ? new Date(j.next_run_at).toLocaleString() : "—"}
                  </td>
                  <td>
                    <Badge tone={j.enabled ? "success" : "neutral"}>
                      {j.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </td>
                  <td>
                    <button className="btn btn-ghost text-xs" disabled>
                      Run now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

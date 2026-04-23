"use client";

// ---------------------------------------------------------------------------
// /stock/submissions — operator's own recent form submissions.
//
// Shows the last 20 form_submissions rows for the current user.
// Operators use this to answer "did my submission go through?" without
// needing to navigate the movement log.
//
// Status semantics:
//   pending   — submitted, awaiting admin approval (above-threshold adjustments)
//   posted    — accepted and posted to stock_ledger; stock has changed
//   rejected  — admin rejected; stock unchanged; rejection_reason shown
//   cancelled — cancelled before posting
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";

interface RecentSubmissionRow {
  submission_id: string;
  form_type: string;
  status: string;
  submitted_at: string;
  event_at: string;
  posted_at: string | null;
  rejection_reason: string | null;
}

interface RecentResponse {
  rows: RecentSubmissionRow[];
  count: number;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  goods_receipt: "Goods Receipt",
  waste_adjustment: "Waste / Adjustment",
  physical_count: "Physical Count",
  production_actual_submit: "Production Actual",
  forecast_save: "Forecast (save)",
  forecast_publish: "Forecast (publish)",
  planning_run_execute: "Planning Run",
  planning_rec_approve: "Rec Approve",
  planning_rec_dismiss: "Rec Dismiss",
  planning_rec_convert_to_po: "Convert to PO",
  integration_sku_map_approve: "SKU Alias Approve",
};

function fmtDate(iso: string): string {
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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "posted") {
    return <Badge tone="success" variant="solid">Posted</Badge>;
  }
  if (status === "pending") {
    return <Badge tone="warning" dotted>Pending approval</Badge>;
  }
  if (status === "rejected") {
    return <Badge tone="danger" variant="solid">Rejected</Badge>;
  }
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

export default function MySubmissionsPage() {
  const query = useQuery<RecentResponse>({
    queryKey: ["submissions", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/submissions/recent");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<RecentResponse>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const rows = query.data?.rows ?? [];

  return (
    <>
      <WorkflowHeader
        eyebrow="Stock"
        title="My recent submissions"
        description="Your last 20 form submissions and their posting status. 'Posted' means stock has changed. 'Pending approval' means an admin must review before stock is updated."
      />

      {query.isError ? (
        <div className="rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg">
          Could not load recent submissions. Check your connection and refresh.
        </div>
      ) : null}

      <SectionCard contentClassName="p-0">
        {query.isLoading ? (
          <div className="px-5 py-8 text-sm text-fg-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No submissions yet"
            description="When you submit a Goods Receipt, Waste Adjustment, or Physical Count, it will appear here."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((row) => (
              <li
                key={row.submission_id}
                className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg">
                      {FORM_TYPE_LABELS[row.form_type] ?? row.form_type}
                    </span>
                    <StatusBadge status={row.status} />
                  </div>
                  {row.rejection_reason ? (
                    <div className="text-xs text-danger-fg">
                      Rejected: {row.rejection_reason}
                    </div>
                  ) : null}
                  <div className="font-mono text-3xs text-fg-muted">
                    {row.submission_id}
                  </div>
                </div>
                <div
                  className={cn(
                    "shrink-0 text-right text-xs",
                    "text-fg-muted",
                  )}
                >
                  <div>{timeAgo(row.submitted_at)}</div>
                  <div className="mt-0.5 text-3xs text-fg-subtle">
                    {fmtDate(row.submitted_at)}
                  </div>
                  {row.posted_at ? (
                    <div className="mt-0.5 text-3xs text-success-fg">
                      Posted {timeAgo(row.posted_at)}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

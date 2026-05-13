"use client";
import { cn } from "@/lib/cn";
import type { ActivityRow as ActivityRowT } from "../_types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusColor(status: string): string {
  if (status === "posted" || status === "resolved" || status === "gi_draft_created") return "text-success-fg";
  if (status === "pending" || status === "acknowledged" || status === "pending_gi_action") return "text-warning-fg";
  if (status === "rejected") return "text-danger-fg";
  return "text-fg-muted";
}

export function ActivityRow({
  row,
  onClick,
}: {
  row: ActivityRowT;
  onClick: (row: ActivityRowT) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(row)}
        className={cn(
          "flex w-full flex-col gap-1.5 px-5 py-3 text-left",
          "hover:bg-bg-subtle/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          "sm:flex-row sm:items-start sm:justify-between"
        )}
      >
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-medium text-fg">
              {row.summary.headline}
            </span>
            <span className={cn("shrink-0 text-xs font-medium", statusColor(row.status))}>
              {row.status.replace(/_/g, " ")}
            </span>
          </div>
          {row.summary.secondary ? (
            <div className="truncate text-xs text-fg-muted">{row.summary.secondary}</div>
          ) : null}
          {row.rejection_reason ? (
            <div className="truncate text-xs text-danger-fg">Rejected: {row.rejection_reason}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-xs text-fg-muted">
          <div>{timeAgo(row.event_at)}</div>
          <div className="mt-0.5 text-xs text-fg-subtle">{fmtTime(row.event_at)}</div>
          {row.posted_at && row.posted_at !== row.event_at ? (
            <div className="mt-0.5 text-xs text-success-fg">Posted {timeAgo(row.posted_at)}</div>
          ) : null}
        </div>
      </button>
    </li>
  );
}

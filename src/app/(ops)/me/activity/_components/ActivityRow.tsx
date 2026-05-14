"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import type { ActivityRow as ActivityRowT, SourceKind } from "../_types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type StatusTone = "success" | "warning" | "danger" | "neutral";

function statusTone(status: string): StatusTone {
  if (status === "posted" || status === "resolved" || status === "gi_draft_created") return "success";
  if (status === "pending" || status === "acknowledged" || status === "pending_gi_action") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  const t = status.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Status text + glyph + tone — never color-alone (WCAG 1.4.1).
const STATUS_TONE: Record<StatusTone, { chip: string; glyph: string; srGlyph: string }> = {
  success: {
    chip: "border-success-border bg-success-softer text-success-fg",
    glyph: "●",
    srGlyph: "succeeded",
  },
  warning: {
    chip: "border-warning-border bg-warning-softer text-warning-fg",
    glyph: "◐",
    srGlyph: "in progress",
  },
  danger: {
    chip: "border-danger-border bg-danger-softer text-danger-fg",
    glyph: "✕",
    srGlyph: "failed",
  },
  neutral: {
    chip: "border-border bg-bg-subtle text-fg-muted",
    glyph: "•",
    srGlyph: "",
  },
};

// Source-kind accent bar — lets the eye scan by event type without reading.
const SOURCE_BAR: Record<SourceKind, string> = {
  form_submission:        "bg-accent",
  credit_decision:        "bg-info",
  exception_acknowledge:  "bg-warning",
  exception_resolve:      "bg-success",
};

export const ActivityRow = forwardRef<
  HTMLButtonElement,
  { row: ActivityRowT; onClick: (row: ActivityRowT, el: HTMLButtonElement) => void }
>(function ActivityRow({ row, onClick }, ref) {
  const tone = statusTone(row.status);
  const t = STATUS_TONE[tone];
  const showPostedLine = row.status === "posted" && !!row.posted_at;

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={(e) => onClick(row, e.currentTarget)}
        className={cn(
          "group relative flex w-full flex-col gap-1.5 px-5 py-3 pl-[18px] text-left",
          "hover:bg-bg-subtle/50 focus-visible:bg-bg-subtle/50",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
          "sm:flex-row sm:items-start sm:justify-between"
        )}
      >
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-y-2 left-2 w-[3px] rounded-sm", SOURCE_BAR[row.source_kind])}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-fg-strong">
              {row.summary.headline}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-medium",
                t.chip
              )}
            >
              <span aria-hidden className="text-[0.7em] leading-none">{t.glyph}</span>
              {statusLabel(row.status)}
              {t.srGlyph ? <span className="sr-only"> ({t.srGlyph})</span> : null}
            </span>
          </div>
          {row.summary.secondary ? (
            <div className="truncate text-xs text-fg-muted">{row.summary.secondary}</div>
          ) : null}
          {row.rejection_reason ? (
            <div className="truncate text-xs text-danger-fg">
              <span className="font-medium">Rejected:</span> {row.rejection_reason}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums text-fg-muted">
          <div>{timeAgo(row.event_at)}</div>
          <div className="mt-0.5 text-2xs text-fg-faint">{fmtTime(row.event_at)}</div>
          {showPostedLine ? (
            <div className="mt-1 text-2xs text-success-fg">
              Posted {timeAgo(row.posted_at!)}
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
});

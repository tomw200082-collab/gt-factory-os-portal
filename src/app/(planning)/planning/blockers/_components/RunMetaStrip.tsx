"use client";

// ---------------------------------------------------------------------------
// RunMetaStrip — header strip showing the planning run that produced the
// blockers in view: run_id (link), executed_at (relative + absolute on hover),
// status, and a "מציג ריצה היסטורית" badge when the run is not the latest
// completed run.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Badge } from "@/components/badges/StatusBadge";
import { fmtRelativeAgo } from "../_lib/format";
import type { BlockersRunMeta } from "../_lib/types";

interface RunMetaStripProps {
  run: BlockersRunMeta;
  /** True when the user explicitly filtered by a run_id query param that is
   *  not the latest completed run. Surfaces the historical-view badge.
   */
  isHistoricalView?: boolean;
}

export function RunMetaStrip({ run, isHistoricalView }: RunMetaStripProps) {
  if (!run.run_id) {
    return null;
  }
  const shortId = run.run_id.slice(0, 8);

  return (
    <div className="card p-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            ריצת תכנון:
          </span>
          <Link
            href={`/planning/runs/${encodeURIComponent(run.run_id)}`}
            className="font-mono text-accent hover:underline"
            title={run.run_id}
          >
            {shortId}
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            הורצה:
          </span>
          <span
            className="text-fg-muted tabular-nums"
            title={run.run_executed_at ?? undefined}
          >
            {fmtRelativeAgo(run.run_executed_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            סטטוס:
          </span>
          <span className="text-fg capitalize">
            {run.run_status ?? "—"}
          </span>
        </div>
        {run.planning_horizon_weeks != null ? (
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              אופק:
            </span>
            <span className="text-fg-muted tabular-nums">
              {run.planning_horizon_weeks} שבועות
              {run.planning_horizon_start_at
                ? ` (מ־${run.planning_horizon_start_at})`
                : ""}
            </span>
          </div>
        ) : null}
        {isHistoricalView ? (
          <div className="ms-auto">
            <Badge tone="warning" dotted>
              מציג ריצה היסטורית
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
}

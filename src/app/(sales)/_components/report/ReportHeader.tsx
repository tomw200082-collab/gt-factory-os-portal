"use client";

import { TriangleAlert } from "lucide-react";
import { REPORT_UI as L, UI } from "../../_lib/labels";
import type { Freshness } from "../../_lib/report/freshness";

/** The petrol band: the title, the freshness pill, and what every figure excludes. */
export function ReportHeader({ fresh }: { fresh: Freshness | null }) {
  const live = fresh && fresh.kind === "ready" && !fresh.stale && fresh.clock;
  return (
    <header className="s-opening s-opening-compact flex flex-col gap-2" data-testid="report-header">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {L.title}
        </h1>
        {live ? (
          <span className="s-rp-fresh" data-testid="report-fresh">
            <span className="s-live-dot" aria-hidden />
            <span className="s-nums">
              {fresh.ageMinutes === 0 || fresh.ageMinutes === null ? L.updatedNow(fresh.clock!) : L.updatedAgo(fresh.ageMinutes, fresh.clock!)}
            </span>
          </span>
        ) : null}
      </div>
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {L.exVat}
      </p>
    </header>
  );
}

/** Amber, above the report: what is on screen is the last verified version, and why it is not newer. */
export function StaleBand({ fresh }: { fresh: Freshness }) {
  const why = fresh.why === "failed" ? L.staleFailed : fresh.why === "running" ? L.staleRunning : L.staleDelayed;
  return (
    <div className="s-banner s-banner-review" role="status" data-testid="report-stale">
      <TriangleAlert size={18} aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold s-nums">
          {fresh.dateClock ? (
            <>
              {L.staleBandPrefix} <bdi dir="ltr">{fresh.dateClock}</bdi>
            </>
          ) : (
            L.staleBandNoTime
          )}
        </p>
        <p className="text-[13px]">{why}</p>
      </div>
    </div>
  );
}

/** A refresh that failed after one that worked: the numbers are still the last good ones, and it says so. */
export function RefreshFailed({ clock, onRetry }: { clock: string | null; onRetry: () => void }) {
  return (
    <div className="s-banner s-banner-retired items-center justify-between" role="status" data-testid="report-refresh-failed">
      <p className="text-[13px]">{clock ? L.refreshFailed(clock) : L.staleBandNoTime}</p>
      <button type="button" className="s-link" onClick={onRetry}>
        {UI.retry}
      </button>
    </div>
  );
}

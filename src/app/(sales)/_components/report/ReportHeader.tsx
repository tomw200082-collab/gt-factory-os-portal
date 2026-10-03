"use client";

import { TriangleAlert } from "lucide-react";
import { REPORT_UI as L } from "../../_lib/labels";
import { SBtnSpinner } from "../SBtnSpinner";
import type { Freshness } from "../../_lib/report/freshness";

/** The petrol band: the title, the freshness pill, and what every figure excludes. */
export function ReportHeader({ fresh, scope = true }: { fresh: Freshness | null; scope?: boolean }) {
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
      {scope ? (
        <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {L.exVat}
        </p>
      ) : null}
    </header>
  );
}

/** Amber, above the report: what is on screen is the last verified version, and why it is not newer. */
export function StaleBand({ fresh }: { fresh: Freshness }) {
  const why = fresh.why === "gate" ? L.staleFailedGate : fresh.why === "failed" ? L.staleFailed : fresh.why === "running" ? L.staleRunning : L.staleDelayed;
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

/** A refresh that failed after one that worked: the numbers are still the last good ones, and it says so, and that the page keeps trying. */
export function RefreshFailed({ clock, checkedAt, pending, onRetry }: { clock: string | null; checkedAt: string | null; pending: boolean; onRetry: () => void }) {
  return (
    <div className="s-banner s-banner-row s-banner-fail" role="status" data-testid="report-refresh-failed">
      <TriangleAlert size={18} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[13px] font-semibold">{clock ? L.refreshFailed(clock) : L.staleBandNoTime}</p>
        <p className="text-[12px]">
          {checkedAt ? `${L.checkedAt(checkedAt)} · ` : ""}
          {L.refreshAuto}
        </p>
      </div>
      <button type="button" className="s-btn s-btn-ghost s-btn-compact shrink-0" disabled={pending} aria-busy={pending} onClick={onRetry} data-testid="report-recheck">
        {pending ? <SBtnSpinner /> : null}
        {pending ? L.rechecking : L.recheck}
      </button>
    </div>
  );
}

"use client";

// The states a report spends real time in. None of them may read as zero sales: a skeleton is a
// placeholder, "not built yet" says so, and a failed read is an error with a way out. A chart with
// no data, or a row of zeros, is never the fallback.

import Link from "next/link";
import { ChartColumn, CircleAlert, Lock } from "lucide-react";
import { REPORT_UI as L, UI } from "../../_lib/labels";

export function ReportSkeleton() {
  return (
    <div data-testid="report-loading" className="flex flex-col gap-3">
      {/* the words are outside the busy region: a busy region is not read, and the line is the one thing that must be */}
      <p role="status" className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {L.loading}
      </p>
      <div aria-busy="true" aria-hidden className="flex flex-col gap-3">
        <div className="s-rp-seg" style={{ blockSize: 52 }} />
        <div className="s-rp-tiles">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="s-rp-skel animate-pulse" style={{ blockSize: 92, opacity: 1 - i * 0.12 }} />
          ))}
        </div>
        <div className="s-rp-skel animate-pulse" style={{ blockSize: 260 }} />
        <div className="s-rp-skel animate-pulse" style={{ blockSize: 160, opacity: 0.7 }} />
      </div>
    </div>
  );
}

/** The report has not been built yet. Not the same thing as a report with no sales. */
export function ReportNever({ why }: { why: "gate" | "failed" | "running" | null }) {
  return (
    <div data-testid="report-never" className="s-card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="s-empty-icon" aria-hidden>
        <ChartColumn size={26} />
      </span>
      <p className="text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
        {L.neverTitle}
      </p>
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {L.neverHint}
      </p>
      {why ? (
        <p className="text-[13px] font-medium" style={{ color: "hsl(var(--s-review))" }} data-testid="report-never-why">
          {why === "gate" ? L.neverFailedGate : why === "running" ? L.neverRunning : L.neverFailed}
        </p>
      ) : null}
    </div>
  );
}

/** A blob that arrived but is not the shape the screen reads: an error, not a report of zeros. */
export function ReportInvalid({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="report-invalid" role="alert" className="s-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="s-empty-icon s-empty-icon-alert" aria-hidden>
        <CircleAlert size={26} />
      </span>
      <div>
        <p className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {L.invalidTitle}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {L.invalidHint}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {L.invalidEscalate}
        </p>
      </div>
      <button type="button" className="s-btn s-btn-ghost" onClick={onRetry}>
        {UI.retry}
      </button>
    </div>
  );
}

/** The session ended (401): retrying would only repeat it. Reload takes the viewer through sign-in. */
export function ReportSignedOut() {
  return (
    <div data-testid="report-signed-out" role="alert" className="s-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="s-empty-icon s-empty-icon-alert" aria-hidden>
        <Lock size={26} />
      </span>
      <div>
        <p className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {L.authExpiredTitle}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {L.authExpiredHint}
        </p>
      </div>
      <button type="button" className="s-btn s-btn-ghost" onClick={() => window.location.reload()}>
        {L.reload}
      </button>
    </div>
  );
}

/** Not a manager: a card of its own, with the way back to the screen that is theirs. */
export function ReportNotYours() {
  return (
    <div data-testid="report-manager-only" className="s-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="s-empty-icon" aria-hidden>
        <Lock size={26} />
      </span>
      <div>
        <h2 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {L.managerOnly}
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {L.managerOnlyHint}
        </p>
      </div>
      <Link href="/sales/today" className="s-btn s-btn-ghost">
        {L.managerOnlyLink}
      </Link>
    </div>
  );
}

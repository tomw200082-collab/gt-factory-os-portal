"use client";

// The states a report spends real time in. None of them may read as zero sales: a skeleton is a
// placeholder, "not built yet" says so, and a failed read is an error with a way out. A chart with
// no data, or a row of zeros, is never the fallback.

import { ChartColumn, CircleAlert } from "lucide-react";
import { REPORT_UI as L, UI } from "../../_lib/labels";

export function ReportSkeleton() {
  return (
    <div data-testid="report-loading" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only" role="status">
        {L.loading}
      </span>
      <div aria-hidden className="s-rp-seg" style={{ blockSize: 52 }} />
      <div aria-hidden className="s-rp-tiles">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="s-rp-skel animate-pulse" style={{ blockSize: 92, opacity: 1 - i * 0.12 }} />
        ))}
      </div>
      <div aria-hidden className="s-rp-skel animate-pulse" style={{ blockSize: 260 }} />
      <div aria-hidden className="s-rp-skel animate-pulse" style={{ blockSize: 160, opacity: 0.7 }} />
    </div>
  );
}

/** The report has not been built yet. Not the same thing as a report with no sales. */
export function ReportNever() {
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
      </div>
      <button type="button" className="s-btn s-btn-ghost" onClick={onRetry}>
        {UI.retry}
      </button>
    </div>
  );
}

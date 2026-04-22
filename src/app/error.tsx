"use client";

// ---------------------------------------------------------------------------
// Segment-level error boundary.
//
// Covers every route group (ops, planning, planner, admin, inbox, shared).
// When a client component throws during render or in an event handler, Next
// swaps the tree under the nearest `error.tsx` with this component. The root
// <html> + <body> from `app/layout.tsx` stay mounted, so the top bar + side
// nav remain usable and the user can navigate out instead of being stuck.
//
// `reset()` re-attempts the render. Safe for transient errors (network blip,
// race); no-op for permanent errors (next render will just re-throw).
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { reportError } from "@/lib/obs/report";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "segment" });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl pt-8">
      <div
        className="rounded-md border border-danger/40 bg-danger-softer px-4 py-5"
        role="alert"
        data-testid="segment-error"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-fg"
            strokeWidth={2}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-danger-fg">
              Something went wrong on this screen.
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              The page couldn&apos;t render. Your form state may be lost. If
              this keeps happening, give the support code below to your ops
              lead.
            </p>
            <div className="mt-3 rounded border border-danger/30 bg-bg px-3 py-2 font-mono text-xs text-fg-muted">
              <div>
                <span className="text-fg-subtle">message:</span> {error.message}
              </div>
              {error.digest ? (
                <div>
                  <span className="text-fg-subtle">support code:</span>{" "}
                  {error.digest}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="btn btn-primary gap-1.5"
                data-testid="segment-error-retry"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                Try again
              </button>
              <Link href="/" className="btn btn-ghost gap-1.5">
                <Home className="h-3.5 w-3.5" strokeWidth={2} />
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

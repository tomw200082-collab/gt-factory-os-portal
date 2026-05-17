"use client";

// ---------------------------------------------------------------------------
// Empty / loading / error / no-run states for /planning/blockers.
//
// Tom hard rule: NO mock fallback rendering. Each non-data state renders an
// honest, distinct visual:
//   - BlockersLoadingSkeleton  — table/card-row shaped skeletons (animate-pulse)
//   - BlockersEmptyAllClear    — calm "all clear" card via shared EmptyState
//   - BlockersEmptyNoRunYet    — guidance + link to /planning/runs
//   - BlockersErrorBanner      — danger banner with retry hint, no fallback rows
//   - BlockersFilteredEmpty    — filter mismatch helper
//
// English/LTR per planning UX full-pass (DEC-1 + Tom approval 2026-05-08).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { CheckCircle2, ListChecks } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/feedback/states";

export function BlockersLoadingSkeleton() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading blockers…"
    >
      {/* desktop table skeleton */}
      <div className="hidden sm:block card overflow-hidden p-0">
        <div className="border-b border-border/60 bg-bg-subtle/40 px-3 py-2">
          <div className="h-3 w-40 animate-pulse rounded bg-bg-subtle" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-6 gap-3 border-b border-border/40 px-3 py-3 last:border-b-0"
          >
            <div className="h-4 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 animate-pulse rounded bg-bg-subtle" />
          </div>
        ))}
      </div>
      {/* mobile card skeleton */}
      <div className="sm:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-bg-subtle" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-bg-subtle" />
            </div>
            <div className="h-3 w-48 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-40 animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlockersEmptyAllClear() {
  return (
    <div data-testid="blockers-empty-all-clear">
      <EmptyState
        title="No blockers — all demand is covered by the last planning run."
        description="Every demand item in the latest run produced a usable purchase or production recommendation. No action is required."
        icon={
          <CheckCircle2
            className="h-5 w-5 text-success"
            strokeWidth={2}
            aria-hidden
          />
        }
        action={
          <Link
            href="/planning/production-plan"
            className="btn btn-sm"
            data-testid="blockers-empty-go-plan"
          >
            View production plan →
          </Link>
        }
      />
    </div>
  );
}

export function BlockersEmptyNoRunYet() {
  return (
    <div data-testid="blockers-empty-no-run">
      <EmptyState
        title="No planning run found — trigger a run to see blockers."
        description="Planning blockers are computed from a planning run. Run planning to populate this list."
        icon={
          <ListChecks
            className="h-5 w-5 text-fg-faint"
            strokeWidth={1.75}
            aria-hidden
          />
        }
        action={
          <Link
            href="/planning/runs"
            className="btn btn-sm"
            data-testid="blockers-empty-go-runs"
          >
            Go to runs →
          </Link>
        }
      />
    </div>
  );
}

export function BlockersErrorBanner({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded border border-danger/30 bg-danger-softer px-4 py-3"
      role="alert"
      data-testid="blockers-error-banner"
    >
      <ErrorState
        title="Could not load blockers"
        description="Check your connection and try again."
        onRetry={onRetry}
      />
    </div>
  );
}

export function BlockersFilteredEmpty() {
  return (
    <div data-testid="blockers-filtered-empty">
      <EmptyState
        title="No blockers match the current filters"
        description="Try removing a filter to see more blockers."
      />
    </div>
  );
}

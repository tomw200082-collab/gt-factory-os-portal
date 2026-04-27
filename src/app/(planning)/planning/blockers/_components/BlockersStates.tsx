"use client";

// ---------------------------------------------------------------------------
// Empty / loading / error / no-run states for /planning/blockers.
//
// Tom hard rule: NO mock fallback rendering. Each non-data state renders an
// honest, distinct visual:
//   - LoadingSkeleton    — table/card-row shaped skeletons
//   - EmptyAllClear      — "אין חסמים פעילים בריצת התכנון הנוכחית"
//   - EmptyNoRunYet      — "טרם הורצה ריצת תכנון מוצלחת" + link to /planning/runs
//   - ErrorState         — banner with retry hint, no fallback rows
// ---------------------------------------------------------------------------

import Link from "next/link";
import { AlertOctagon, CheckCircle2, ListChecks } from "lucide-react";

export function BlockersLoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="טוען חסמים…" dir="rtl">
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
    <div
      className="card flex flex-col items-center gap-3 px-6 py-12 text-center"
      dir="rtl"
      data-testid="blockers-empty-all-clear"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-success/30 bg-success-softer text-success">
        <CheckCircle2 className="h-6 w-6" strokeWidth={2} aria-hidden />
      </div>
      <div className="text-sm font-semibold text-fg-strong">
        אין חסמים פעילים בריצת התכנון הנוכחית
      </div>
      <div className="max-w-md text-xs text-fg-muted">
        כל הביקוש בריצה האחרונה הפך להמלצת רכש או ייצור שמישה. אין צורך בפעולה.
      </div>
    </div>
  );
}

export function BlockersEmptyNoRunYet() {
  return (
    <div
      className="card flex flex-col items-center gap-3 px-6 py-12 text-center"
      dir="rtl"
      data-testid="blockers-empty-no-run"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-bg-subtle text-fg-faint">
        <ListChecks className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="text-sm font-semibold text-fg-strong">
        טרם הורצה ריצת תכנון מוצלחת
      </div>
      <div className="max-w-md text-xs text-fg-muted">
        חסמי תכנון מחושבים מתוך ריצת תכנון. הרץ ריצה כדי לראות חסמים פעילים.
      </div>
      <Link
        href="/planning/runs"
        className="btn btn-sm"
        data-testid="blockers-empty-go-runs"
      >
        מעבר לריצות תכנון
      </Link>
    </div>
  );
}

export function BlockersErrorBanner() {
  return (
    <div
      className="rounded border border-danger/40 bg-danger-softer px-4 py-3"
      dir="rtl"
      role="alert"
      data-testid="blockers-error-banner"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded border border-danger/40 bg-danger-soft text-danger">
          <AlertOctagon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-danger-fg">
            לא ניתן לטעון את החסמים
          </div>
          <div className="mt-0.5 text-xs text-fg-muted">
            בדוק את החיבור ונסה שוב.
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlockersFilteredEmpty() {
  return (
    <div
      className="card flex flex-col items-center gap-2 px-6 py-10 text-center"
      dir="rtl"
      data-testid="blockers-filtered-empty"
    >
      <div className="text-sm font-semibold text-fg-strong">
        אין חסמים תואמים לסינון
      </div>
      <div className="max-w-md text-xs text-fg-muted">
        נסה להסיר חלק מהסינונים כדי לראות חסמים נוספים.
      </div>
    </div>
  );
}

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BaseStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

interface ErrorStateProps extends Partial<BaseStateProps> {
  /**
   * When provided, renders a standard "Try again" button so an error is
   * never a dead end. Callers typically pass `() => query.refetch()`.
   */
  onRetry?: () => void;
  retryLabel?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: BaseStateProps) {
  return (
    <div className="relative flex flex-col items-center gap-4 rounded border border-dashed border-border bg-bg-raised px-6 py-14 text-center">
      <div
        className="pointer-events-none absolute inset-0 rounded bg-grid bg-grid-fade opacity-40"
        aria-hidden
      />
      <div className="relative flex h-12 w-12 items-center justify-center rounded border border-border/80 bg-bg shadow-raised">
        {icon ?? (
          <Inbox className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />
        )}
      </div>
      <div className="relative max-w-md">
        <div className="text-sm font-semibold tracking-tightish text-fg-strong">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-xs leading-relaxed text-fg-muted">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="relative flex gap-2">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  title = "Loading",
  description,
}: Partial<BaseStateProps>) {
  return (
    <div className="flex flex-col items-center gap-4 rounded border border-border/60 bg-bg-raised px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" strokeWidth={1.75} />
      </div>
      <div className="max-w-md">
        <div className="text-sm font-semibold tracking-tightish text-fg-strong">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-xs text-fg-muted">{description}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  onRetry,
  retryLabel = "Try again",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded border border-danger/40 bg-danger-softer px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded border border-danger/40 bg-danger-soft text-danger">
        <AlertOctagon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="max-w-md">
        <div className="text-sm font-semibold tracking-tightish text-danger-fg">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-xs leading-relaxed text-fg-muted">
            {description}
          </div>
        ) : null}
      </div>
      {onRetry || action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-sm btn-outline"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              {retryLabel}
            </button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

const SUCCESS_TONES = {
  success: {
    card: "border-success/40 bg-success-softer",
    chip: "bg-success text-fg-inverted",
    accentBar: "bg-success",
    icon: "text-success",
    title: "text-success-fg",
  },
  warning: {
    card: "border-warning/40 bg-warning-softer",
    chip: "bg-warning text-fg-inverted",
    accentBar: "bg-warning",
    icon: "text-warning",
    title: "text-warning-fg",
  },
  info: {
    card: "border-info/40 bg-info-softer",
    chip: "bg-info text-fg-inverted",
    accentBar: "bg-info",
    icon: "text-info",
    title: "text-info-fg",
  },
} as const;

export function SuccessState({
  title,
  description,
  action,
  children,
  tone = "success",
}: BaseStateProps & {
  children?: ReactNode;
  tone?: "success" | "warning" | "info";
}) {
  const t = SUCCESS_TONES[tone];
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-lg border p-6 reveal",
        t.card
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", t.accentBar)} aria-hidden />
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-raised",
            t.chip
          )}
        >
          <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-lg font-semibold tracking-tightish", t.title)}>
            {title}
          </div>
          {description ? (
            <div className="mt-1 text-sm leading-relaxed text-fg-muted">
              {description}
            </div>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex flex-wrap gap-2 pl-14">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tranche 049 (VISUAL-014) — shared feedback components moved here from the
// dashboard page, visuals unchanged, so other surfaces can consume them.
// ---------------------------------------------------------------------------

/**
 * Shimmer skeleton block. A light sweep reads as "loading live data" far
 * better than a flat opacity pulse. Driven by the gt-shimmer keyframe in
 * globals.css. Moved from the dashboard (Iteration 6) unchanged.
 */
export function Skel({
  h,
  w,
  className,
}: {
  h?: number;
  w?: string | number;
  className?: string;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded bg-bg-muted", className)}
      style={{ height: h ?? 16, width: w ?? "100%" }}
    >
      <div
        className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-bg-raised/80 to-transparent motion-reduce:hidden"
        style={{ animation: "gt-shimmer 1.5s ease-in-out infinite" }}
        aria-hidden
      />
    </div>
  );
}

/** Three-cell shimmer row — the standard list-loading placeholder. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded border border-border/60 bg-bg-subtle px-3 py-3">
      <Skel h={12} w={80} />
      <Skel h={12} className="flex-1" />
      <Skel h={12} w={64} />
    </div>
  );
}

/**
 * All-clear ribbon — premium healthy/empty state used when a live block has
 * nothing to act on. Replaces the default dashed EmptyState in those
 * contexts with a calm, intentional success ribbon (left accent rail, soft
 * halo, success icon chip). Calm — not alarming, not blank.
 */
export function AllClearRibbon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="dash-allclear">
      <div className="dash-allclear-icon">
        <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-tightish text-success-fg">
          {title}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-fg-muted">
          {description}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline error row with a Retry affordance — for errors inside a
 * card where the full-height <ErrorState> block would be too heavy. Moved
 * from the dashboard unchanged (ErrorState has no inline variant, so this
 * stays a distinct component rather than forcing a regression).
 */
export function ErrorAlert({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded border border-danger/40 bg-danger-softer px-3 py-3 text-xs text-danger-fg"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="mt-0.5 leading-relaxed text-fg-muted">Try again.</div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-danger/40 bg-bg-raised px-2 py-1 text-3xs font-semibold uppercase tracking-sops text-danger-fg hover:bg-danger-softer"
      >
        <RefreshCw className="h-3 w-3" strokeWidth={2} />
        Retry
      </button>
    </div>
  );
}

export function StaleNotice({
  title,
  description,
  action,
}: BaseStateProps) {
  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded border border-warning/40 bg-warning-softer px-4 py-3.5 reveal">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-warning" aria-hidden />
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-warning/15 text-warning">
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-warning-fg">{title}</div>
        {description ? (
          <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

"use client";

// ---------------------------------------------------------------------------
// Auto-save indicator badge.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5).
//
// Visual states:
//   - idle          → small muted text "Auto-save on"
//   - saving        → spinner + "Saving…" (info tone)
//   - saved         → check icon + "saved {n}s ago" (success tone, ticks every
//                     5 seconds via lightweight setInterval)
//   - error         → alert icon + "Save failed" + Retry button (danger tone)
//
// Self-contained. The page passes state from useAutoSave().
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "../_lib/format";
import type { AutoSaveState } from "../_lib/use-auto-save";

interface AutoSaveIndicatorProps {
  state: AutoSaveState;
  lastSavedAt: Date | null;
  errorMessage: string | null;
  pendingCount: number;
  onRetry?: () => void;
  className?: string;
}

export function AutoSaveIndicator({
  state,
  lastSavedAt,
  errorMessage,
  pendingCount,
  onRetry,
  className,
}: AutoSaveIndicatorProps) {
  // Tick once every 5s so "saved 3s ago" → "saved 8s ago" updates without
  // flooding re-renders.
  const [, force] = useState(0);
  useEffect(() => {
    if (state !== "saved" || !lastSavedAt) return;
    const t = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [state, lastSavedAt]);

  if (state === "saving") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded border border-info/30 bg-info-softer px-2 py-1 text-3xs font-medium text-info-fg",
          className,
        )}
        data-testid="forecast-autosave-indicator"
        data-state="saving"
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
        Saving{pendingCount > 1 ? ` ${pendingCount} cells…` : "…"}
      </span>
    );
  }

  if (state === "error") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded border border-danger/30 bg-danger-softer px-2 py-1 text-3xs font-medium text-danger-fg",
          className,
        )}
        data-testid="forecast-autosave-indicator"
        data-state="error"
        title={errorMessage ?? "Save failed"}
        aria-live="polite"
      >
        <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
        Save failed
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        ) : null}
      </span>
    );
  }

  if (state === "saved" && lastSavedAt) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded border border-success/30 bg-success-softer px-2 py-1 text-3xs font-medium text-success-fg transition-colors duration-200",
          className,
        )}
        data-testid="forecast-autosave-indicator"
        data-state="saved"
        aria-live="polite"
      >
        <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
        {formatRelativeTime(lastSavedAt)}
      </span>
    );
  }

  // idle
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-border/60 bg-bg-subtle px-2 py-1 text-3xs font-medium text-fg-muted",
        className,
      )}
      data-testid="forecast-autosave-indicator"
      data-state="idle"
    >
      <Save className="h-3 w-3" strokeWidth={2} />
      Auto-save on
    </span>
  );
}

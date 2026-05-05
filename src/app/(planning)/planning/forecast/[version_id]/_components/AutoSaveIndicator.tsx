"use client";

// ---------------------------------------------------------------------------
// Auto-save indicator badge — refined micro-states (2026-05-05 polish).
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5).
//
// Sources consulted (2026-05-05 edit-chrome polish):
//   - GitLab Pajamas / Primer "Saving" pattern: 4 states (idle / saving /
//     saved-with-timestamp / error), spinner during in-flight, timestamp on
//     success.
//   - Notion / NN/g: indicators must be distinct from validation; reassure
//     user that progress will not be lost; auto-fade success after ~2s back
//     to idle so the chrome stays calm.
//
// Visual states (each fades+slides in 200ms):
//   - idle    → "Auto-save on" / muted border, no fill
//   - saving  → 3 bouncing dots + "Saving…" (accent tint)
//   - saved   → CheckCircle2 + "Saved Nm ago" (success tint, full timestamp
//                in tooltip), auto-fades to idle after ~2s
//   - error   → AlertOctagon + "Save failed" + Retry (danger tint)
//
// Self-contained. The page passes state from useAutoSave().
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { AlertOctagon, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutoSaveState } from "../_lib/use-auto-save";

interface AutoSaveIndicatorProps {
  state: AutoSaveState;
  lastSavedAt: Date | null;
  errorMessage: string | null;
  pendingCount: number;
  onRetry?: () => void;
  className?: string;
}

// Local relative-time formatter — kept inline so we don't reach into
// _lib/format.ts (Grid agent's territory).
function fmtRel(date: Date | null, now: Date = new Date()): string {
  if (!date) return "";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 2000) return "just now";
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function fmtFullTimestamp(date: Date | null): string | undefined {
  if (!date) return undefined;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

  // After "saved" success, auto-fade to a calm "idle-with-timestamp" mode
  // after 2s so the chrome doesn't keep shouting green. We do this by
  // visually treating "saved + age >= 2s" as a softer pseudo-state.
  const [, forceFadeTick] = useState(0);
  useEffect(() => {
    if (state !== "saved" || !lastSavedAt) return;
    const t = setTimeout(() => forceFadeTick((n) => n + 1), 2000);
    return () => clearTimeout(t);
  }, [state, lastSavedAt]);

  if (state === "saving") {
    return (
      <span
        key="saving"
        className={cn("fc-autosave", className)}
        data-testid="forecast-autosave-indicator"
        data-state="saving"
        aria-live="polite"
      >
        <span className="fc-autosave-dots" aria-hidden>
          <span className="fc-autosave-dot" />
          <span className="fc-autosave-dot" />
          <span className="fc-autosave-dot" />
        </span>
        <span>
          Saving{pendingCount > 1 ? ` ${pendingCount} cells` : ""}…
        </span>
      </span>
    );
  }

  if (state === "error") {
    return (
      <span
        key="error"
        className={cn("fc-autosave", className)}
        data-testid="forecast-autosave-indicator"
        data-state="error"
        title={errorMessage ?? "Save failed"}
        aria-live="polite"
      >
        <AlertOctagon className="h-3 w-3 shrink-0" strokeWidth={2.5} />
        <span>Save failed</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="ml-0.5 underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        ) : null}
      </span>
    );
  }

  if (state === "saved" && lastSavedAt) {
    const ageMs = Date.now() - lastSavedAt.getTime();
    const fresh = ageMs < 2000;
    if (fresh) {
      return (
        <span
          key="saved"
          className={cn("fc-autosave", className)}
          data-testid="forecast-autosave-indicator"
          data-state="saved"
          title={fmtFullTimestamp(lastSavedAt)}
          aria-live="polite"
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          <span>Saved</span>
        </span>
      );
    }
    // Older saved: render in idle skin but show "Saved Nm ago" so the
    // chrome stays calm yet still reassures.
    return (
      <span
        key="saved-fade"
        className={cn("fc-autosave", className)}
        data-testid="forecast-autosave-indicator"
        data-state="idle"
        title={fmtFullTimestamp(lastSavedAt)}
      >
        <Save className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
        <span>Saved {fmtRel(lastSavedAt)}</span>
      </span>
    );
  }

  // idle (no save yet)
  return (
    <span
      key="idle"
      className={cn("fc-autosave", className)}
      data-testid="forecast-autosave-indicator"
      data-state="idle"
    >
      <Save className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span>Auto-save on</span>
    </span>
  );
}

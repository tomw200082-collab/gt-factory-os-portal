"use client";

import { Eye, RotateCcw, X } from "lucide-react";
import { useReviewMode } from "@/lib/review-mode/store";
import { SCREEN_STATES, type ScreenState } from "@/lib/contracts/enums";
import { cn } from "@/lib/cn";

const LABELS: Record<ScreenState, string> = {
  empty: "Empty",
  loading: "Loading",
  validation_error: "Validation error",
  submission_pending: "Submission pending",
  success: "Success",
  approval_required: "Approval required",
  stale_conflict: "Stale / conflict",
};

const FIXTURE_SETS = ["default", "sparse", "stress", "failure"] as const;

export function ReviewModePanel() {
  const {
    open,
    forcedScreenState,
    fixtureSet,
    setOpen,
    setForcedScreenState,
    setFixtureSet,
    reset,
  } = useReviewMode();

  if (!open) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 w-[340px] overflow-hidden rounded-lg border border-accent/60 bg-bg-raised shadow-pop reveal"
      role="dialog"
      aria-label="Review mode panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-accent px-4 py-3 text-accent-fg">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" strokeWidth={2} />
          <div className="text-xs font-bold uppercase tracking-sops">
            Review mode
          </div>
        </div>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
          onClick={() => setOpen(false)}
          aria-label="Close review mode panel"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="space-y-5 p-4">
        <div>
          <div className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Force screen state
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setForcedScreenState(null)}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                forcedScreenState === null
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-subtle text-fg-muted hover:text-fg"
              )}
            >
              <span className="dot bg-success" aria-hidden />
              Auto
            </button>
            {SCREEN_STATES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForcedScreenState(s)}
                className={cn(
                  "inline-flex items-center rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  forcedScreenState === s
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-subtle text-fg-muted hover:text-fg"
                )}
              >
                {LABELS[s]}
              </button>
            ))}
          </div>
          <div className="mt-2 text-3xs leading-relaxed text-fg-subtle">
            Screens that opt into review mode will render this state regardless
            of normal flow.
          </div>
        </div>
        <div>
          <div className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Fixture set
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FIXTURE_SETS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFixtureSet(f)}
                className={cn(
                  "inline-flex items-center rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  fixtureSet === f
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-subtle text-fg-muted hover:text-fg"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="btn btn-outline btn-sm w-full justify-center gap-1.5"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2} />
          Reset review mode
        </button>
      </div>
    </div>
  );
}

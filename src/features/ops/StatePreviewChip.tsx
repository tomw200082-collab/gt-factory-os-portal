"use client";

import { useReviewMode } from "@/lib/review-mode/store";

export function StatePreviewChip() {
  const { forcedScreenState, setForcedScreenState } = useReviewMode();
  if (!forcedScreenState) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-accent bg-accent-soft px-3 py-1.5 text-xs text-accent">
      <span className="font-semibold uppercase">Review mode</span>
      <span>forced state: {forcedScreenState.replace("_", " ")}</span>
      <button
        type="button"
        onClick={() => setForcedScreenState(null)}
        className="ml-2 text-xs underline"
      >
        release
      </button>
    </div>
  );
}

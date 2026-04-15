"use client";

import { useReviewMode } from "./store";
import type { ScreenState } from "@/lib/contracts/enums";

/**
 * Returns the current screen state, honoring a review-mode override if set.
 * Pages opt in by passing their natural state and reading this value to render.
 */
export function useForcedOr(natural: ScreenState): ScreenState {
  const { forcedScreenState } = useReviewMode();
  return forcedScreenState ?? natural;
}

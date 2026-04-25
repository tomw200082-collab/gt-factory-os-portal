// src/lib/admin/recipe-readiness.ts
// Pure readiness functions. No React, no async, no fetch.
// Imports: types only; policy constants for thresholds.
//
// Time-injection contract: every function that needs "now" takes `nowMs:
// number` explicitly. Callers pass `Date.now()`. Tests pass a fixed
// timestamp for determinism. Do not call `Date.now()` inside this file.

import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";
import type {
  ComponentReadiness,
  LinePipState,
  RecipeHealthState,
  TrackHealth,
} from "./recipe-readiness.types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function priceAgeDays(
  updatedAtIso: string | null,
  nowMs: number,
): number | null {
  if (updatedAtIso === null) return null;
  const t = Date.parse(updatedAtIso);
  if (Number.isNaN(t)) return null;
  const ageMs = nowMs - t;
  if (ageMs <= 0) return 0;
  return Math.floor(ageMs / MS_PER_DAY);
}

export function formatPriceAge(
  updatedAtIso: string | null,
  nowMs: number,
): string {
  const days = priceAgeDays(updatedAtIso, nowMs);
  if (days === null) return "אין מחיר פעיל";
  if (days === 0) return "0 ימים";
  if (days === 1) return "יום 1";
  return `${days} ימים`;
}

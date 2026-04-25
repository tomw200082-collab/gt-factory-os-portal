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
  LineBlockerCategory,
  LinePipState,
  LineWarningCategory,
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

export interface ComputeLinePipStateInput {
  qty: string | number;
  component: ComponentReadiness;
  nowMs: number;
}

export function computeLinePipState(
  input: ComputeLinePipStateInput,
): LinePipState {
  const reasons: string[] = [];
  const blockerCategories: LineBlockerCategory[] = [];
  const warningCategories: LineWarningCategory[] = [];

  const qtyNum = Number(input.qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    reasons.push("כמות חייבת להיות חיובית");
    blockerCategories.push("invalid-qty");
  }
  if (input.component.component_status === "INACTIVE") {
    reasons.push(`החומר ${input.component.component_name} מסומן כלא פעיל`);
    blockerCategories.push("inactive-component");
  }
  if (blockerCategories.length > 0) {
    return {
      color: "red",
      reasons,
      warningCategories: [],
      blockerCategories,
      isHardBlock: true,
    };
  }

  if (input.component.primary_supplier_id === null) {
    reasons.push("אין ספק ראשי");
    warningCategories.push("missing-supplier");
  }
  if (input.component.active_price_value === null) {
    reasons.push("אין מחיר פעיל");
    warningCategories.push("no-active-price");
  } else {
    const days = priceAgeDays(
      input.component.active_price_updated_at,
      input.nowMs,
    );
    if (days !== null && days > RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS) {
      const strong = days > RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS;
      if (strong) {
        reasons.push(`מחיר ישן מאוד (${days} ימים)`);
        warningCategories.push("strong-stale-price");
      } else {
        reasons.push(`מחיר ישן (${days} ימים)`);
        warningCategories.push("stale-price");
      }
    }
  }
  if (warningCategories.length > 0) {
    return {
      color: "yellow",
      reasons,
      warningCategories,
      blockerCategories: [],
      isHardBlock: false,
    };
  }

  return {
    color: "green",
    reasons: [],
    warningCategories: [],
    blockerCategories: [],
    isHardBlock: false,
  };
}

export interface ComputeTrackHealthInput {
  hasActiveVersion: boolean;
  pips: LinePipState[];
  trackLabel: string; // for human-facing blocker messages
}

export function computeTrackHealth(
  input: ComputeTrackHealthInput,
): TrackHealth {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.hasActiveVersion) {
    blockers.push(`אין גרסה פעילה ל-${input.trackLabel}`);
  } else if (input.pips.length === 0) {
    blockers.push(`${input.trackLabel} ריק (0 שורות)`);
  }

  // Count per-category. Strong-stale-price collapses into the stale-price
  // bucket for the track-level summary; the line-level pip already
  // distinguishes the two.
  let invalidQtyCount = 0;
  let inactiveComponentCount = 0;
  let missingSupplierCount = 0;
  let noActivePriceCount = 0;
  let stalePriceCount = 0;

  for (const p of input.pips) {
    for (const b of p.blockerCategories) {
      if (b === "invalid-qty") invalidQtyCount++;
      else if (b === "inactive-component") inactiveComponentCount++;
    }
    for (const w of p.warningCategories) {
      if (w === "missing-supplier") missingSupplierCount++;
      else if (w === "no-active-price") noActivePriceCount++;
      else if (w === "stale-price" || w === "strong-stale-price") {
        stalePriceCount++;
      }
    }
  }

  if (invalidQtyCount > 0) {
    blockers.push(
      invalidQtyCount === 1
        ? "שורה אחת עם כמות לא תקינה"
        : `${invalidQtyCount} שורות עם כמות לא תקינה`,
    );
  }
  if (inactiveComponentCount > 0) {
    blockers.push(
      inactiveComponentCount === 1
        ? "חומר אחד מסומן כלא פעיל"
        : `${inactiveComponentCount} חומרים מסומנים כלא פעילים`,
    );
  }

  if (missingSupplierCount > 0) {
    warnings.push(
      missingSupplierCount === 1
        ? "חומר אחד חסר ספק ראשי"
        : `${missingSupplierCount} חומרים חסרי ספק ראשי`,
    );
  }
  if (noActivePriceCount > 0) {
    warnings.push(
      noActivePriceCount === 1
        ? "חומר אחד ללא מחיר פעיל"
        : `${noActivePriceCount} חומרים ללא מחיר פעיל`,
    );
  }
  if (stalePriceCount > 0) {
    warnings.push(
      stalePriceCount === 1
        ? "חומר אחד עם מחיר ישן"
        : `${stalePriceCount} חומרים עם מחיר ישן`,
    );
  }

  let color: TrackHealth["color"];
  if (blockers.length > 0) color = "red";
  else if (warnings.length > 0) color = "yellow";
  else color = "green";

  return {
    color,
    hasActiveVersion: input.hasActiveVersion,
    lineCount: input.pips.length,
    warnings,
    blockers,
  };
}

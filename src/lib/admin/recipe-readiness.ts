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
  if (days === null) return "No active price";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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
    reasons.push("Quantity must be positive");
    blockerCategories.push("invalid-qty");
  }
  if (input.component.component_status === "INACTIVE") {
    reasons.push(
      `Component ${input.component.component_name} is marked inactive`,
    );
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
    reasons.push("No primary supplier");
    warningCategories.push("missing-supplier");
  }
  if (input.component.active_price_value === null) {
    reasons.push("No active price");
    warningCategories.push("no-active-price");
  } else {
    const days = priceAgeDays(
      input.component.active_price_updated_at,
      input.nowMs,
    );
    if (days !== null && days > RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS) {
      const strong = days > RECIPE_READINESS_POLICY.PRICE_AGE_STRONG_WARN_DAYS;
      if (strong) {
        reasons.push(`Price is very stale (${days} days)`);
        warningCategories.push("strong-stale-price");
      } else {
        reasons.push(`Price is stale (${days} days)`);
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

function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export function computeTrackHealth(
  input: ComputeTrackHealthInput,
): TrackHealth {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.hasActiveVersion) {
    blockers.push(`No active version for ${input.trackLabel}`);
  } else if (input.pips.length === 0) {
    blockers.push(`${input.trackLabel} is empty (0 components)`);
  }

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
      plural(
        invalidQtyCount,
        "row with invalid quantity",
        "rows with invalid quantity",
      ),
    );
  }
  if (inactiveComponentCount > 0) {
    blockers.push(
      plural(
        inactiveComponentCount,
        "inactive component referenced",
        "inactive components referenced",
      ),
    );
  }

  if (missingSupplierCount > 0) {
    warnings.push(
      plural(
        missingSupplierCount,
        "component with no primary supplier",
        "components with no primary supplier",
      ),
    );
  }
  if (noActivePriceCount > 0) {
    warnings.push(
      plural(
        noActivePriceCount,
        "component with no active price",
        "components with no active price",
      ),
    );
  }
  if (stalePriceCount > 0) {
    warnings.push(
      plural(
        stalePriceCount,
        "component with stale price",
        "components with stale prices",
      ),
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

export interface ComputeRecipeHealthInput {
  base: TrackHealth;
  pack: TrackHealth;
}

const LABEL_BY_COLOR: Record<RecipeHealthState["color"], string> = {
  green: "Production-ready",
  yellow: "Production-ready with warnings",
  red: "Cannot publish",
};

export function computeRecipeHealthState(
  input: ComputeRecipeHealthInput,
): RecipeHealthState {
  const blockers = [...input.base.blockers, ...input.pack.blockers];
  const warnings = [...input.base.warnings, ...input.pack.warnings];

  let color: RecipeHealthState["color"];
  if (blockers.length > 0) color = "red";
  else if (warnings.length > 0) color = "yellow";
  else color = "green";

  return {
    color,
    label: LABEL_BY_COLOR[color],
    blockers,
    warnings,
    publishPermitted: color !== "red",
  };
}

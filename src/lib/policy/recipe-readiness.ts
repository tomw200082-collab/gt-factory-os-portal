// src/lib/policy/recipe-readiness.ts
// Single-edit-point thresholds for the recipe-readiness UI. Tom-approved
// 2026-04-25. To revise: change the numbers here, ship.
export const RECIPE_READINESS_POLICY = Object.freeze({
  PRICE_AGE_WARN_DAYS: 90,
  PRICE_AGE_STRONG_WARN_DAYS: 180,
} as const);

export type RecipeReadinessPolicy = typeof RECIPE_READINESS_POLICY;

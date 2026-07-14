// Pure helpers for the Production Report surface (Tranche 050).
//
//   - exceedsVarianceBand   — C8: is |output − planned| outside the ±2%
//                             on-target band? Drives the variance-reason
//                             prompt on submit.
//   - computeAfterBalance   — C10: Available − Required = After for one
//                             expected-consumption preview row; flags
//                             shortfall rows (After < 0).
//   - fmtShortfallMessage   — C10: plain-English line for a short component.
//   - VARIANCE_REASON_LABELS / varianceReasonLabel — C8/C12: human labels
//                             for the 7 structured variance reason codes
//                             (mirror of api/src/production-actuals/schemas.ts
//                             ProductionActualSubmitSchema.variance_reason_code).
//
// No React, no fetch — unit-tested in report-helpers.test.ts.

// Same band the variance display already uses (W4 contract §3 / helpers.ts
// on the plan board). Keep the three call sites numerically identical.
export const VARIANCE_ON_TARGET_THRESHOLD_PCT = 2.0;

// ---------------------------------------------------------------------------
// C8 — variance reason codes. Keyed enum mirrors the backend CHECK
// production_actual_variance_reason_code_chk.
// ---------------------------------------------------------------------------
export const VARIANCE_REASON_LABELS = {
  material_shortage: "Material shortage",
  equipment: "Equipment issue",
  quality_loss: "Quality loss",
  recipe_yield: "Recipe yield",
  extra_demand: "Extra demand",
  counting_error: "Counting error",
  other: "Other",
} as const;

export type VarianceReasonCode = keyof typeof VARIANCE_REASON_LABELS;

export const VARIANCE_REASON_CODES = Object.keys(
  VARIANCE_REASON_LABELS,
) as VarianceReasonCode[];

export function varianceReasonLabel(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return (VARIANCE_REASON_LABELS as Record<string, string>)[code] ?? code;
}

// ---------------------------------------------------------------------------
// C8 — band check. True only when both inputs parse, planned > 0, and the
// absolute variance exceeds planned × 2%. Unparseable / zero-planned input
// never triggers the prompt (the operator should not be nagged on garbage
// input — the backend validates authoritatively).
// ---------------------------------------------------------------------------
export function exceedsVarianceBand(
  outputQtyStr: string,
  plannedQtyStr: string,
): boolean {
  if (outputQtyStr.trim() === "" || plannedQtyStr.trim() === "") return false;
  const output = Number(outputQtyStr);
  const planned = Number(plannedQtyStr);
  if (!Number.isFinite(output) || !Number.isFinite(planned)) return false;
  if (planned <= 0) return false;
  const band = Math.abs(planned) * (VARIANCE_ON_TARGET_THRESHOLD_PCT / 100);
  return Math.abs(output - planned) > band;
}

// ---------------------------------------------------------------------------
// C10 — after-balance computation for one preview row.
// available_qty arrives as text (qty_8dp) from the open response;
// required arrives as the client-side preview string (may be "?" when the
// BOM math could not be computed). Returns null when either side cannot be
// parsed — the row then renders "—".
//
// Partial-materials reporting (2026-07-14): a shortage no longer blocks the
// report. When a component is short, the server consumes what is on hand and
// FLOORS the balance at 0 (never negative). This helper now also exposes:
//   - consumed:      what will actually be deducted = min(required, max(avail,0))
//   - flooredAfter:  the balance after, floored at 0 = max(available-required,0)
//   - shortBy:       the un-deductable remainder = max(required-max(avail,0),0)
// `after` (raw, may be negative) and `short` are retained for callers that
// still need the pre-floor delta. Quantities are rounded to 4dp to kill float
// dust before the sign check.
// ---------------------------------------------------------------------------
export interface AfterBalance {
  available: number;
  required: number;
  /** Raw available − required (may be negative). */
  after: number;
  /** True when the recipe needs more than is on hand. */
  short: boolean;
  /** What will actually be deducted: min(required, max(available, 0)). */
  consumed: number;
  /** Balance after the report, floored at 0: max(available − required, 0). */
  flooredAfter: number;
  /** The remainder that cannot be deducted: max(required − max(available,0), 0). */
  shortBy: number;
}

function round4(n: number): number {
  const r = Math.round(n * 1e4) / 1e4;
  // Normalize -0 (e.g. 0.3 − 0.30000000000000004) to 0.
  return r === 0 ? 0 : r;
}

export function computeAfterBalance(
  availableQtyStr: string | null | undefined,
  requiredQtyStr: string,
): AfterBalance | null {
  if (availableQtyStr === null || availableQtyStr === undefined) return null;
  const available = Number(availableQtyStr);
  const required = Number(requiredQtyStr);
  if (!Number.isFinite(available) || !Number.isFinite(required)) return null;
  const availFloored = Math.max(available, 0);
  const after = round4(available - required);
  return {
    available: round4(available),
    required: round4(required),
    after,
    short: after < 0,
    consumed: round4(Math.min(required, availFloored)),
    flooredAfter: round4(Math.max(available - required, 0)),
    shortBy: round4(Math.max(required - availFloored, 0)),
  };
}

// ---------------------------------------------------------------------------
// Plain-English shortfall line. Partial-materials reporting: the shortfall is
// deducted to 0 rather than blocking, so the copy reflects that outcome.
// "Short 4.5 KG of Sencha Tea — will be deducted to 0"
// Accepts either a positive shortfall or a negative after-delta (abs is taken).
// ---------------------------------------------------------------------------
function fmtQtyNum(n: number): string {
  const abs = Math.abs(n);
  return Number.isInteger(abs)
    ? abs.toFixed(0)
    : abs.toFixed(4).replace(/\.?0+$/, "");
}

export function fmtShortfallMessage(
  componentName: string,
  shortBy: number,
  uom: string | null,
): string {
  const qty = fmtQtyNum(shortBy);
  const unit = uom ? ` ${uom}` : "";
  return `Short ${qty}${unit} of ${componentName} — will be deducted to 0`;
}

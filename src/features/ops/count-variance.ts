/**
 * Pure decision logic for Physical Count variance branching.
 *
 * Extracted from the Physical Count form page so the branching rule
 * can be unit-tested without mounting the form component. The form
 * page imports {@link classifyCountVariance} and renders outcomes
 * from its return value.
 *
 * This file contains no React. No fetches. No side effects.
 * It models the MOCK/shell-side rule only — the real server-side rule
 * lives in Window 1's ledger/anchor layer and may differ in edge cases.
 */

export type CountOutcomeKind = "matched" | "auto" | "approval";

export interface CountVarianceInput {
  /** What the operator typed in the blind count form. Must be >= 0. */
  counted_quantity: number;
  /** What the system thought the quantity was. Only known post-submit. */
  system_quantity: number;
  /** Policy threshold — absolute delta (>=) below which auto-post applies. */
  auto_post_abs_floor: number;
  /** Policy threshold — percent variance (<=) which auto-post applies. */
  auto_post_pct_ceiling: number;
}

export interface CountOutcome {
  kind: CountOutcomeKind;
  /** counted - system. Positive = found stock, negative = shrinkage. */
  delta: number;
  /** Absolute percent variance against system_quantity, rounded to 2dp. */
  variance_pct: number;
}

/**
 * Decide the outcome of a submitted count against the system quantity.
 *
 * Rule (matches the shell fixture behavior):
 *  - `matched` when |delta| < 0.001
 *  - `auto`    when variance_pct <= auto_post_pct_ceiling
 *               OR |delta| <= auto_post_abs_floor
 *  - `approval` otherwise
 *
 * Both thresholds are honored: a small absolute delta always auto-posts
 * even if the percentage is large (e.g. counting 0.5 kg of mint when
 * system shows 0.1 kg — 400% variance but absolute is tiny).
 *
 * Zero system_quantity is handled: variance_pct becomes Infinity and
 * the absolute-floor branch still gates auto vs approval correctly.
 */
export function classifyCountVariance(input: CountVarianceInput): CountOutcome {
  const delta = input.counted_quantity - input.system_quantity;
  const absDelta = Math.abs(delta);
  const variance_pct =
    input.system_quantity === 0
      ? (absDelta === 0 ? 0 : Infinity)
      : Math.round((absDelta / input.system_quantity) * 10_000) / 100;

  if (absDelta < 0.001) {
    return { kind: "matched", delta: 0, variance_pct: 0 };
  }

  const withinPct = variance_pct <= input.auto_post_pct_ceiling;
  const withinAbs = absDelta <= input.auto_post_abs_floor;

  if (withinPct || withinAbs) {
    return { kind: "auto", delta, variance_pct };
  }

  return { kind: "approval", delta, variance_pct };
}

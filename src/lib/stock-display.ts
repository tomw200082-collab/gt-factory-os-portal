/**
 * Stock display helpers.
 *
 * Backbone of the "clamp on_hand to >= 0 in operator-facing surfaces"
 * rule. Truth surfaces (audit, exceptions, parity) keep the raw value;
 * these helpers exist for the display surfaces.
 *
 * Spec: PRODUCTION/docs/superpowers/specs/2026-05-13-display-clamp-physical-stock-truth-design.md
 */

function toNumber(val: number | string): number {
  return typeof val === 'number' ? val : Number(val);
}

export function clampedOnHand(val: number | string): number {
  const n = toNumber(val);
  if (Number.isNaN(n)) return NaN;
  return Math.max(0, n);
}

export function isBelowFloor(val: number | string): boolean {
  const n = toNumber(val);
  if (Number.isNaN(n)) return false;
  return n < 0;
}

export function floorGap(val: number | string): number {
  const n = toNumber(val);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, -n);
}

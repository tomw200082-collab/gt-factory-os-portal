// The orders timeline: the business circle's 24 months on a time axis
// (Tom, 2026-10-02: "the same as the circle, on a graph over time, with the
// trend, down to the orders, zoomable on the count scale").
//
// Same facts as the ring (buildRing): filled = clean orders, hollow = cancelled,
// open = open drafts from the river (F1). Time runs right to left, the newest
// month at the left, as a time axis does in a right-to-left interface.

import type { RingMonth } from "./ring";

export interface TimelineMonth extends RingMonth {
  total: number;
  /** trailing three-month average of clean orders; null for the first two months */
  trend: number | null;
}

export function timelineMonths(months: RingMonth[]): TimelineMonth[] {
  return months.map((m, i) => ({
    ...m,
    total: m.filled + m.hollow + m.open,
    trend: i >= 2 ? (months[i - 2].filled + months[i - 1].filled + m.filled) / 3 : null,
  }));
}

const SMALL = [1, 2, 3, 4, 5, 6, 8, 10];
const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** The smallest readable whole number at or above n: 7 → 8, 13 → 15, 41 → 50. */
export function niceCeil(n: number): number {
  if (n <= 1) return 1;
  if (n <= 10) return SMALL.find((s) => s >= n) ?? 10;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.round((STEPS.find((s) => s * p >= n) ?? 10) * p);
}

/** The scale's zoom steps, from "every month fits" down to two orders per height. */
export function zoomLevels(dataMax: number): number[] {
  const levels = [niceCeil(Math.max(1, dataMax))];
  let v = levels[0];
  while (v > 2) {
    const next = Math.max(2, Math.floor(v / 2));
    if (next >= v) break;
    levels.push(next);
    v = next;
  }
  return levels;
}

/** Axis labels in whole orders: 0, the middle when it is a whole step, and the top. */
export function yTicks(yMax: number): number[] {
  return [...new Set([0, Math.floor(yMax / 2), yMax])].filter((t) => t >= 0);
}

/** Column i of n (0 = oldest) between `left` and `right`, oldest at the right. */
export function columnX(i: number, n: number, left: number, right: number): { x: number; w: number } {
  const w = (right - left) / n;
  return { x: right - (i + 1) * w, w };
}

/** A column or segment with a rounded top and a square base (dataviz mark spec). */
export function barPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const f = (n: number) => Math.round(n * 100) / 100;
  return [
    `M ${f(x)} ${f(y + h)}`,
    `L ${f(x)} ${f(y + rr)}`,
    `Q ${f(x)} ${f(y)} ${f(x + rr)} ${f(y)}`,
    `L ${f(x + w - rr)} ${f(y)}`,
    `Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rr)}`,
    `L ${f(x + w)} ${f(y + h)}`,
    "Z",
  ].join(" ");
}

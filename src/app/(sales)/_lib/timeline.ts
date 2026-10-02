// The orders timeline: the business circle's 24 months on a time axis
// (Tom, 2026-10-02: "the same as the circle, on a graph over time, with the
// trend, down to the orders, zoomable on the count scale").
//
// Same facts as the ring (buildRing): filled = clean orders, hollow = cancelled,
// open = open drafts from the river (F1). Time runs right to left, the newest
// month at the left, as a time axis does in a right-to-left interface.

import { ymOf, type RingMonth } from "./ring";

export interface TimelineMonth extends RingMonth {
  total: number;
  /** the current month: still filling up, so it is drawn as such and kept out of every average */
  partial: boolean;
  /** trailing three-month average of clean orders; null for the first two months and the month in progress */
  trend: number | null;
}

/** `asOf` is the mirror's last good read: a month it did not see to the end is partial too, so a stale
 *  mirror never shows a drop it did not see (code review I-2). */
export function timelineMonths(months: RingMonth[], asOf?: string | null): TimelineMonth[] {
  const last = months.length - 1;
  const seenUpTo = asOf ? ymOf(asOf) : null;
  return months.map((m, i) => {
    const partial = i === last || (seenUpTo !== null && m.ym >= seenUpTo);
    return {
      ...m,
      total: m.filled + m.hollow + m.open,
      partial,
      trend: i >= 2 && !partial ? (months[i - 2].filled + months[i - 1].filled + m.filled) / 3 : null,
    };
  });
}

export interface TrendSummary {
  /** clean orders over the whole span */
  total: number;
  /** average clean orders a month: the last three full months, and the three before them */
  recent: number | null;
  prior: number | null;
  direction: "up" | "down" | "flat" | null;
  /** the change in whole percent; null when the months before had no orders */
  pct: number | null;
}

/** The headline: how many orders, and which way the last three full months lean against the three before.
 *  A change under ten percent is steady. The month in progress never counts: a partial month is not a drop. */
export function trendSummary(months: TimelineMonth[]): TrendSummary {
  const total = months.reduce((n, m) => n + m.filled, 0);
  const full = months.filter((m) => !m.partial);
  if (full.length < 6) return { total, recent: null, prior: null, direction: null, pct: null };
  const avg = (xs: TimelineMonth[]) => xs.reduce((n, m) => n + m.filled, 0) / xs.length;
  const recent = avg(full.slice(-3));
  const prior = avg(full.slice(-6, -3));
  if (recent === 0 && prior === 0) return { total, recent, prior, direction: null, pct: null };
  if (prior === 0) return { total, recent, prior, direction: "up", pct: null };
  const change = (recent - prior) / prior;
  const pct = Math.round(Math.abs(change) * 100);
  return { total, recent, prior, direction: Math.abs(change) < 0.1 ? "flat" : change > 0 ? "up" : "down", pct };
}

const num = (n: number) => String(Number(n.toFixed(1)));

/** A smooth curve through the points that never overshoots them (monotone cubic, Fritsch and Carlson):
 *  a flat stretch stays flat and the curve never dips below zero orders. Points run left to right. */
export function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${num(points[0][0])} ${num(points[0][1])}`;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let path = `M ${num(points[0][0])} ${num(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = (x1 - x0) / 3;
    path += ` C ${num(x0 + h)} ${num(y0 + m[i] * h)}, ${num(x1 - h)} ${num(y1 - m[i + 1] * h)}, ${num(x1)} ${num(y1)}`;
  }
  return path;
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

// The trend tab's numbers: the four hero tiles, the year-over-year bars and the
// years x months matrix. Pure: no DOM, no React.
//
// Ported from report_template.html (renderTrend). The twelve-month window is NP-13..NP-2
// against NP-25..NP-14, the annual rate is the mean of the last three full months times
// twelve, and the matrix grows over overlapping FULL months only. The Artifact's year
// rows were the constants 2024/2025/2026; here they come from the data.

import { heatOf, type Heat } from "./aggregate";
import { periodYears } from "./period";
import type { ReportData, Unit } from "./types";

/** Every month's total, in agorot or units. */
export function monthlyTotals(d: ReportData, unit: Unit): number[] {
  const all = new Array<number>(d.months.length).fill(0);
  for (const r of d.rows) all[r[0]] += unit === "rev" ? r[4] : r[3];
  return all;
}

export interface TrendTiles {
  /** the twelve closed months, and the twelve before them */
  t12: number;
  p12: number;
  /** percent, null when the base year had nothing */
  d12: number | null;
  /** the last full month, its index, and its change against the same month last year */
  lastFullIdx: number;
  lastFull: number;
  dj: number | null;
  /** mean of the last three full months x 12 */
  rate: number;
  /** the month in progress: shown by itself, never compared */
  partial: number;
}

export function trendTiles(d: ReportData, unit: Unit): TrendTiles {
  const all = monthlyTotals(d, unit);
  const np = all.length;
  const lastFullIdx = np - 2;
  const sum = (a: number, b: number) => {
    let x = 0;
    for (let i = Math.max(0, a); i <= b; i++) x += all[i];
    return x;
  };
  const t12 = sum(np - 13, np - 2);
  const p12 = sum(np - 25, np - 14);
  const base = all[lastFullIdx - 12];
  return {
    t12,
    p12,
    d12: p12 ? ((t12 - p12) / p12) * 100 : null,
    lastFullIdx,
    lastFull: all[lastFullIdx],
    dj: base ? ((all[lastFullIdx] - base) / base) * 100 : null,
    rate: (sum(np - 4, np - 2) / 3) * 12,
    partial: all[np - 1],
  };
}

export interface YoyBar {
  i: number;
  pct: number | null;
  partial: boolean;
}

/** One bar per month that has the same month a year earlier: months 12 to the one in progress. */
export function yoyBars(d: ReportData, unit: Unit): YoyBar[] {
  const all = monthlyTotals(d, unit);
  const bars: YoyBar[] = [];
  for (let i = 12; i < all.length; i++) {
    const p = all[i - 12];
    bars.push({ i, pct: p ? (100 * (all[i] - p)) / p : null, partial: i === d.partialIdx });
  }
  return bars;
}

export interface YearCell {
  /** calendar month, 1 to 12 */
  month: number;
  /** index into the months, -1 when the data does not hold that month */
  i: number;
  v: number | null;
  partial: boolean;
  heat: Heat | null;
}

export interface YearRow {
  year: string;
  cells: YearCell[];
  total: number;
  /** percent against the year before, over months both years have in full; null without any */
  growth: number | null;
}

export function yearMatrix(d: ReportData, unit: Unit): YearRow[] {
  const all = monthlyTotals(d, unit);
  const years = periodYears(d.months);
  const idx = (y: string, m: number) => d.months.indexOf(`${y}-${String(m).padStart(2, "0")}`);
  const val = (y: string, m: number): number | null => {
    const i = idx(y, m);
    return i >= 0 ? all[i] : null;
  };
  return years.map((year) => {
    const present = Array.from({ length: 12 }, (_, k) => val(year, k + 1)).filter((v): v is number => v !== null);
    const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 0;
    let total = 0;
    const cells: YearCell[] = Array.from({ length: 12 }, (_, k) => {
      const m = k + 1;
      const i = idx(year, m);
      const v = val(year, m);
      total += v ?? 0;
      return { month: m, i, v, partial: i === d.partialIdx, heat: v && avg ? heatOf(v, avg) : null };
    });
    const py = String(+year - 1);
    let cur = 0;
    let prv = 0;
    let cnt = 0;
    if (years.includes(py)) {
      for (let m = 1; m <= 12; m++) {
        const a = val(year, m);
        const b = val(py, m);
        if (a !== null && b !== null && idx(year, m) !== d.partialIdx) {
          cur += a;
          prv += b;
          cnt++;
        }
      }
    }
    return { year, cells, total, growth: cnt && prv ? (100 * (cur - prv)) / prv : null };
  });
}

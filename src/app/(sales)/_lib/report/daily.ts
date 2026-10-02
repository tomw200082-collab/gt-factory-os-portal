// The daily tab: day grid, hero numbers, weekday profile, month pace, chart series and the
// 14-day retro. Pure: no DOM, no React.
//
// Ported from report_template.html (daily, sameDowMed, revByMinute, renderDaily). All of it
// derives from `orders`, one row per kept order. A day with no orders is a real zero, because
// the Saturday gaps ARE the signal, and skipping them would fake a smooth business.
//
// The definitions that matter, unchanged:
//   - Friday and Saturday are rest days; the headline is the last CLOSED business day;
//   - "usual" for a day is the median of the four preceding same weekdays, zeros counted;
//   - today is read against the same hour (minute of the pull) on the four weekdays before;
//   - seven closed days against the seven before, never folding in the part-day;
//   - the month so far against the same number of days of the month before;
//   - the weekday profile is the median over the 91 days ending yesterday;
//   - the month's pace is the month so far plus each remaining weekday's own median.

import { REPORT_UI } from "../labels";
import type { ReportData } from "./types";

export const DOW_NAMES = REPORT_UI.weekdays;
const DAY_MS = 86_400_000;

export const dateOf = (d: Pick<ReportData, "epoch0">, e: number): Date => new Date((d.epoch0 + e) * DAY_MS);
/** 0 = Sunday ... 6 = Saturday. */
export const dowOf = (d: Pick<ReportData, "epoch0">, e: number): number => dateOf(d, e).getUTCDay();
/** Friday and Saturday. */
export const isOff = (d: Pick<ReportData, "epoch0">, e: number): boolean => dowOf(d, e) >= 5;
/** "27/9" */
export const dayLabel = (d: Pick<ReportData, "epoch0">, e: number): string => {
  const x = dateOf(d, e);
  return `${x.getUTCDate()}/${x.getUTCMonth() + 1}`;
};

export interface Daily {
  first: number;
  last: number;
  n: number;
  /** agorot per day, index = day - first */
  rev: Float64Array;
  cnt: Int32Array;
}

export function buildDaily(d: ReportData): Daily {
  let first = d.todayEpoch;
  if (d.orders.length) {
    first = d.orders[0][1];
    for (const o of d.orders) if (o[1] < first) first = o[1];
  }
  const last = d.todayEpoch;
  const n = Math.max(1, last - first + 1);
  const rev = new Float64Array(n);
  const cnt = new Int32Array(n);
  for (const o of d.orders) {
    const i = o[1] - first;
    if (i >= 0 && i < n) {
      rev[i] += o[2];
      cnt[i]++;
    }
  }
  return { first, last, n, rev, cnt };
}

export function median(arr: readonly number[]): number {
  if (!arr.length) return 0;
  const v = [...arr].sort((x, y) => x - y);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The median of the k preceding days of the same weekday: robust to one giant order. Null with no such day. */
export function sameDowMed(daily: Daily, e: number, k: number): number | null {
  const v: number[] = [];
  for (let i = 1; i <= k; i++) {
    const p = e - 7 * i - daily.first;
    if (p >= 0) v.push(daily.rev[p]);
  }
  return v.length ? median(v) : null;
}

/**
 * Revenue booked on day `e` up to `minute` of that day, inclusive. At 09:00 "today" is an hour
 * old; the only comparison that means anything is the same hour on comparable days.
 */
export function revByMinute(d: ReportData, e: number, minute: number): number {
  let s = 0;
  for (const o of d.orders) if (o[1] === e && o[4] <= minute) s += o[2];
  return s;
}

const sumDays = (daily: Daily, a: number, b: number): number => {
  let x = 0;
  for (let e = a; e <= b; e++) {
    const i = e - daily.first;
    if (i >= 0 && i < daily.n) x += daily.rev[i];
  }
  return x;
};

/** Yesterday, or the business day before it when yesterday is a rest day. */
export function lastBusinessDay(d: ReportData, daily: Daily): number {
  let yest = daily.last - 1;
  while (yest > daily.first && isOff(d, yest)) yest--;
  return yest;
}

/** The median weekday over a fixed 13 weeks ending yesterday, however long the chart's range is. */
export const PROFILE_DAYS = 91;

export function weekdayProfile(d: ReportData, daily: Daily): { byDow: number[][]; meds: number[] } {
  const byDow: number[][] = [[], [], [], [], [], [], []];
  for (let e = Math.max(daily.first, daily.last - PROFILE_DAYS); e <= daily.last - 1; e++) {
    byDow[dowOf(d, e)].push(daily.rev[e - daily.first] || 0);
  }
  return { byDow, meds: byDow.map(median) };
}

/**
 * Month so far plus every remaining weekday at its own median. A linear projection is wrong in
 * a business whose Sunday is large and whose Saturday is zero: it depends on which weekdays are left.
 */
export function paceTotal(
  mtd: number,
  mDays: number,
  monthLen: number,
  mStart: number,
  d: Pick<ReportData, "epoch0">,
  meds: readonly number[],
): { rest: number; total: number } {
  let rest = 0;
  for (let day = mDays + 1; day <= monthLen; day++) rest += meds[dowOf(d, mStart + day - 1)];
  return { rest, total: mtd + rest };
}

export interface DailyHero {
  today: number;
  yest: number;
  tRev: number;
  tCnt: number;
  yRev: number;
  yCnt: number;
  /** the usual for the last business day; null with no earlier same weekday */
  yBase: number | null;
  /** today's usual at this hour */
  tBase: number;
  /** seven closed days, and the seven before */
  w1: number;
  w0: number;
  mtd: number;
  mDays: number;
  pmSame: number;
  thisMonthLen: number;
  byDow: number[][];
  meds: number[];
  pace: { rest: number; total: number };
}

export function dailyHero(d: ReportData, daily: Daily = buildDaily(d)): DailyHero {
  const { first, last, rev, cnt } = daily;
  const today = last;
  const yest = lastBusinessDay(d, daily);
  const tRev = rev[today - first] || 0;
  const tCnt = cnt[today - first] || 0;
  const yRev = rev[yest - first] || 0;
  const yCnt = cnt[yest - first] || 0;
  const { byDow, meds } = weekdayProfile(d, daily);

  const cutMin = d.pulledTime ? +d.pulledTime.slice(0, 2) * 60 + +d.pulledTime.slice(3, 5) : 1439;
  const sameHour = [1, 2, 3, 4].map((k) => revByMinute(d, today - 7 * k, cutMin)).sort((a, b) => a - b);
  const tBase = (sameHour[1] + sameHour[2]) / 2; // median of the four

  // Seven CLOSED days: folding a one-hour-old day into a 7-day average drags it down by a
  // seventh and invents a slowdown every single morning.
  const w1 = sumDays(daily, last - 7, last - 1);
  const w0 = sumDays(daily, last - 14, last - 8);

  const md = dateOf(d, last);
  const mDays = md.getUTCDate();
  const mStart = last - mDays + 1; // the 1st of this month
  const mtd = sumDays(daily, mStart, last);
  const pmLen = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), 0)).getUTCDate();
  const pmStart = mStart - pmLen; // the 1st of last month
  const pmSame = sumDays(daily, pmStart, pmStart + Math.min(mDays, pmLen) - 1);
  const thisMonthLen = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + 1, 0)).getUTCDate();

  return {
    today,
    yest,
    tRev,
    tCnt,
    yRev,
    yCnt,
    yBase: sameDowMed(daily, yest, 4),
    tBase,
    w1,
    w0,
    mtd,
    mDays,
    pmSame,
    thisMonthLen,
    byDow,
    meds,
    pace: paceTotal(mtd, mDays, thisMonthLen, mStart, d, meds),
  };
}

export interface DailySeries {
  /** the first day shown */
  a0: number;
  days: number;
  vals: number[];
  /** the seven real days up to each day, including days before the window */
  ma: number[];
  /** the 90th percentile of the days with sales */
  p90: number;
  /** one day far above the everyday range: the axis is cut and the day drawn clipped */
  clipped: boolean;
  /** the axis top */
  mx: number;
  /** the tallest day, when it is worth naming (never when the axis is clipped) */
  peak: number | null;
}

export function dailySeries(d: ReportData, daily: Daily, range: number): DailySeries {
  const { first, last, rev } = daily;
  const days = Math.min(range, last - first + 1);
  const a0 = last - days + 1;
  const vals: number[] = [];
  for (let e = a0; e <= last; e++) vals.push(rev[e - first] || 0);
  // The average is taken over the seven real days before each point, including days that fall
  // before the visible window; otherwise the left edge of every range would show an average of
  // two or three days wearing a "7 days" label.
  const ma = vals.map((_, i) => {
    let s = 0;
    let k = 0;
    for (let j = a0 + i - 6; j <= a0 + i; j++) {
      const p = j - first;
      if (p >= 0) {
        s += rev[p];
        k++;
      }
    }
    return k ? s / k : 0;
  });
  // One giant order flattens twenty-nine normal days into a smear. Cap the axis at the
  // everyday range and draw the outlier clipped, with its real value on it.
  const nz = vals.filter((v) => v > 0).sort((a, b) => a - b);
  const p90 = nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.9))] : 0;
  const rawMx = Math.max(...vals);
  const clipped = p90 > 0 && rawMx > 3 * p90;
  const mx = (clipped ? p90 * 1.3 : Math.max(1, rawMx)) * 1.1;
  let pk = 0;
  for (let i = 1; i < days; i++) if (vals[i] > vals[pk]) pk = i;
  const peak = !clipped && vals[pk] > 0 && vals[pk] > 3 * (ma[pk] || 1) ? pk : null;
  return { a0, days, vals, ma, p90, clipped, mx, peak };
}

export type RetroChip = "neu" | "ok" | "warn" | "crit";

/**
 * A day against its usual. Day-to-day noise is not news: within 10% stays neutral, and a quiet
 * Shabbat is the calendar rather than a collapse, so a rest day is never painted red.
 */
export function retroChip(p: number, off: boolean): RetroChip {
  if (Math.abs(p) < 10) return "neu";
  if (p >= 0) return "ok";
  return p < -40 && !off ? "crit" : "warn";
}

export interface RetroRow {
  e: number;
  rev: number;
  cnt: number;
  /** revenue per order; null with no orders */
  avg: number | null;
  /** the usual for that weekday; null for today and when there is no earlier weekday */
  base: number | null;
  /** percent against the usual; null for today and when the usual is zero */
  p: number | null;
  chip: RetroChip | null;
  partial: boolean;
  off: boolean;
  /** the customer that made the day, and what it booked */
  top: [string, number] | null;
}

export function retroRows(d: ReportData, daily: Daily, n = 14): RetroRow[] {
  const { first, last, rev, cnt } = daily;
  const topOf = (e: number): [string, number] | null => {
    const m = new Map<number, number>();
    for (const o of d.orders) if (o[1] === e) m.set(o[0], (m.get(o[0]) || 0) + o[2]);
    let bk: number | null = null;
    let bv = 0;
    for (const [k, v] of m) {
      if (v > bv) {
        bv = v;
        bk = k;
      }
    }
    return bk === null ? null : [d.cust[bk][0], bv];
  };
  const rows: RetroRow[] = [];
  for (let e = last; e > last - n && e >= first; e--) {
    const v = rev[e - first] || 0;
    const c = cnt[e - first] || 0;
    const partial = e === last;
    const base = partial ? null : sameDowMed(daily, e, 4);
    const p = base ? ((v - base) / base) * 100 : null;
    const off = isOff(d, e);
    rows.push({
      e,
      rev: v,
      cnt: c,
      avg: c ? v / c : null,
      base,
      p,
      chip: partial || p === null ? null : retroChip(p, off),
      partial,
      off,
      top: topOf(e),
    });
  }
  return rows;
}

/** Percent change, null without a base. */
export const pctChange = (a: number, b: number | null): number | null => (b ? ((a - b) / b) * 100 : null);

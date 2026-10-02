// Periods, month labels and the prior-year map. Pure: no DOM, no React.
//
// Ported from report_template.html (periodMonths, priorMap, MLBL). The one change is
// that the years come from the data: the Artifact hard-coded 2024/2025/2026 and would
// have shipped a wrong year switch on the first of January.

import { REPORT_UI } from "../labels";
import type { Period, ReportData } from "./types";

export const MONTH_SHORT = REPORT_UI.monthsShort;
export const MONTH_NAMES = REPORT_UI.monthsFull;

/** "ינו׳ 24" for "2024-01". */
export function monthLabel(months: readonly string[], i: number): string {
  const [y, m] = months[i].split("-");
  return `${MONTH_SHORT[+m - 1]}׳ ${y.slice(2)}`;
}

/** The full month name: "אוגוסט". */
export function monthName(months: readonly string[], i: number): string {
  return MONTH_NAMES[+months[i].split("-")[1] - 1];
}

/** The calendar years the data touches, oldest first. */
export function periodYears(months: readonly string[]): string[] {
  const years: string[] = [];
  for (const m of months) {
    const y = m.slice(0, 4);
    if (!years.includes(y)) years.push(y);
  }
  return years;
}

/** The report opens on the year of the month in progress. */
export function defaultPeriod(d: Pick<ReportData, "months" | "partialIdx">): Period {
  return d.months[d.partialIdx].slice(0, 4);
}

/**
 * The month indexes a period covers. 'all' is every month; '12' is the twelve closed
 * months before the one in progress; a year is the months that start with it.
 */
export function periodMonths(months: readonly string[], period: Period): number[] {
  const np = months.length;
  if (period === "all") return months.map((_, i) => i);
  if (period === "12") {
    const out: number[] = [];
    for (let i = Math.max(0, np - 13); i <= np - 2; i++) out.push(i);
    return out;
  }
  const out: number[] = [];
  months.forEach((m, i) => {
    if (m.startsWith(period)) out.push(i);
  });
  return out;
}

/**
 * Month index → the same month a year earlier. Null as soon as one month of the period
 * has no prior year in the data, which is what switches the YoY column off.
 */
export function priorMap(months: readonly string[], ms: readonly number[]): Record<number, number> | null {
  const map: Record<number, number> = {};
  let complete = true;
  for (const i of ms) {
    const [y, mo] = months[i].split("-");
    const pi = months.indexOf(`${+y - 1}-${mo}`);
    map[i] = pi;
    if (pi < 0) complete = false;
  }
  return complete ? map : null;
}

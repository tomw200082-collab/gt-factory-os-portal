// The two-year business circle: facts and geometry (GT Pulse Unit B).
//
// The API sends monthly counts, never drawing coordinates; the drawing is
// here. Outer ring = the last 12 Israeli calendar months, inner ring = the 12
// before, both read clockwise from 12 o'clock so the current month ends at the
// top. Open drafts come only from the river's pending drafts: the circle's own
// `drafts` count includes completed drafts, which are also orders (design §2 F1).

import { UI } from "./labels";
import type { CircleMonth, PendingDraft } from "./types";

export interface RingMonth {
  ym: string;
  completed: number;
  refunded: number;
  cancelled: number;
  /** completed + refunded: clean orders, drawn filled */
  filled: number;
  /** cancelled, drawn hollow */
  hollow: number;
  /** open or invoice-sent drafts opened this month, drawn in amber */
  open: number;
}

export interface Ring {
  inner: RingMonth[];
  outer: RingMonth[];
}

const IL_MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" });

/** The Israeli calendar month of an instant, as YYYY-MM. */
export function ymOf(iso: string): string {
  return IL_MONTH.format(new Date(iso)).slice(0, 7);
}

export function buildRing(months: CircleMonth[], pending: PendingDraft[]): Ring {
  const sorted = [...months].sort((a, b) => a.ym.localeCompare(b.ym)).slice(-24);
  const openByMonth = new Map<string, number>();
  for (const d of pending) {
    const ym = ymOf(d.created_at);
    openByMonth.set(ym, (openByMonth.get(ym) ?? 0) + 1);
  }
  const all: RingMonth[] = sorted.map((m) => ({
    ym: m.ym,
    completed: m.completed,
    refunded: m.refunded,
    cancelled: m.cancelled,
    filled: m.completed + m.refunded,
    hollow: m.cancelled,
    open: openByMonth.get(m.ym) ?? 0,
  }));
  const split = Math.max(0, all.length - 12);
  return { inner: all.slice(0, split), outer: all.slice(split) };
}

/** Degrees, 0 at 3 o'clock, growing clockwise (SVG). Month i of 12 in its ring. */
export function monthAngles(i: number, gap = 1.6): { start: number; end: number; mid: number } {
  const start = -90 + i * 30 + gap / 2;
  const end = -90 + (i + 1) * 30 - gap / 2;
  return { start, end, mid: (start + end) / 2 };
}

function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Two decimals: enough for a pixel, short in a path string. */
export const round2 = (n: number) => Math.round(n * 100) / 100;
const f = round2;

/** An annular sector: the tap target of one month. */
export function sectorPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const [x1, y1] = point(cx, cy, rOuter, start);
  const [x2, y2] = point(cx, cy, rOuter, end);
  const [x3, y3] = point(cx, cy, rInner, end);
  const [x4, y4] = point(cx, cy, rInner, start);
  return `M ${f(x1)} ${f(y1)} A ${rOuter} ${rOuter} 0 0 1 ${f(x2)} ${f(y2)} L ${f(x3)} ${f(y3)} A ${rInner} ${rInner} 0 0 0 ${f(x4)} ${f(y4)} Z`;
}

/** Where the marks of one month sit: evenly along the sector's middle arc. */
export function markPoints(cx: number, cy: number, r: number, start: number, end: number, n: number): Array<[number, number]> {
  if (n <= 0) return [];
  const span = end - start;
  return Array.from({ length: n }, (_, k) => {
    const deg = start + (span * (k + 1)) / (n + 1);
    const [x, y] = point(cx, cy, r, deg);
    return [f(x), f(y)];
  });
}

// built once: a formatter costs far more than a format, and the charts name 48 months a render
const HE_MONTH_LONG = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });
const HE_MONTH_SHORT = new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" });

/** "ספטמבר 2026" */
export function monthLabel(ym: string): string {
  return HE_MONTH_LONG.format(new Date(`${ym}-15T12:00:00Z`));
}

/** A month as a screen reader says it, in the circle and on the timeline: "ספטמבר 2026: 3 הזמנות, אחת בוטלה" */
export function monthName(m: RingMonth): string {
  return `${monthLabel(m.ym)}: ${UI.monthCounts(m.filled, m.refunded, m.hollow, m.open)}`;
}

/** "ספט׳ 26", for the narrow grid */
export function monthShort(ym: string): { month: string; year: string } {
  return { month: HE_MONTH_SHORT.format(new Date(`${ym}-15T12:00:00Z`)), year: ym.slice(2, 4) };
}

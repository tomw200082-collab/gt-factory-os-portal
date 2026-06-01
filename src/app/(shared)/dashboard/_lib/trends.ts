// ---------------------------------------------------------------------------
// Dashboard trend aggregation — pure, framework-free helpers.
//
// Kept out of the chart components so the maths can be unit-tested in isolation
// and so the components stay purely presentational.
//
// HONESTY NOTE (tranche 039): production-actual and stock-ledger rows mix units
// of measure across items (kg, units, packs). Summing raw quantities across
// items would yield a meaningless figure, so these helpers aggregate the COUNT
// of postings per day — an unambiguous, UOM-agnostic activity signal — never a
// summed mixed-unit quantity. This matches the dashboard's "no invented values"
// discipline.
// ---------------------------------------------------------------------------

// Locale-independent month abbreviations so axis labels (and the tests that
// pin them) stay deterministic regardless of the runtime locale.
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface DayBucket {
  /** Local calendar-day key, `yyyy-mm-dd`. */
  key: string;
  /** Short axis label, e.g. `Jun 1`. */
  label: string;
  /** Count of postings on this day. */
  value: number;
}

export interface FlowDayBucket {
  key: string;
  label: string;
  /** Inbound postings on this day. */
  inbound: number;
  /** Outbound postings on this day. */
  outbound: number;
}

/** Local `yyyy-mm-dd` key for a Date (uses the host's local calendar day). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortLabel(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Parse a timestamp into a Date, or null when missing/invalid. */
function parseTs(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The last `n` calendar days ending on `today`, oldest → newest (inclusive of
 * today). Each entry carries its local day key and a short label.
 */
export function lastNDays(n: number, today: Date): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push({ key: localDayKey(d), label: shortLabel(d) });
  }
  return out;
}

/**
 * Bucket timestamps into per-day counts over the last `n` days. Days with no
 * postings are kept as zero so the chart shows the full window; timestamps
 * outside the window are ignored.
 */
export function dailyCounts(
  timestamps: (string | null | undefined)[],
  n: number,
  today: Date,
): DayBucket[] {
  const days = lastNDays(n, today);
  const index = new Map<string, number>();
  days.forEach((d, i) => index.set(d.key, i));
  const counts = new Array<number>(days.length).fill(0);

  for (const ts of timestamps) {
    const d = parseTs(ts);
    if (!d) continue;
    const i = index.get(localDayKey(d));
    if (i !== undefined) counts[i] += 1;
  }

  return days.map((d, i) => ({ key: d.key, label: d.label, value: counts[i] }));
}

/**
 * Bucket directional postings into per-day inbound/outbound counts over the
 * last `n` days. Days with no postings are kept as zero.
 */
export function dailyFlow(
  rows: { when: string | null | undefined; direction: "in" | "out" }[],
  n: number,
  today: Date,
): FlowDayBucket[] {
  const days = lastNDays(n, today);
  const index = new Map<string, number>();
  days.forEach((d, i) => index.set(d.key, i));
  const inbound = new Array<number>(days.length).fill(0);
  const outbound = new Array<number>(days.length).fill(0);

  for (const row of rows) {
    const d = parseTs(row.when);
    if (!d) continue;
    const i = index.get(localDayKey(d));
    if (i === undefined) continue;
    if (row.direction === "in") inbound[i] += 1;
    else outbound[i] += 1;
  }

  return days.map((d, i) => ({
    key: d.key,
    label: d.label,
    inbound: inbound[i],
    outbound: outbound[i],
  }));
}

export interface TrendDelta {
  /** Sum over the most recent half of the window. */
  current: number;
  /** Sum over the prior half of the window. */
  previous: number;
  /** Percent change current-vs-previous, or null when previous is zero. */
  pct: number | null;
  /** Direction of travel for a quick glance. */
  direction: "up" | "down" | "flat";
}

/**
 * Compare the most recent half of the window against the prior half. With the
 * default 14-day window this is the classic "last 7 days vs the 7 before".
 */
export function trendDelta(buckets: DayBucket[]): TrendDelta {
  const half = Math.floor(buckets.length / 2);
  const values = buckets.map((b) => b.value);
  const previous = values.slice(0, half).reduce((s, v) => s + v, 0);
  const current = values.slice(buckets.length - half).reduce((s, v) => s + v, 0);
  const pct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  return { current, previous, pct, direction };
}

/** Total postings across all buckets — used to decide empty-state rendering. */
export function bucketTotal(
  buckets: { value?: number; inbound?: number; outbound?: number }[],
): number {
  return buckets.reduce(
    (s, b) => s + (b.value ?? 0) + (b.inbound ?? 0) + (b.outbound ?? 0),
    0,
  );
}

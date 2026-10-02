// How old is the report, and can the screen vouch for it? Pure.
//
// The server says `stale` when the data is more than 45 minutes old. The page checks the same
// threshold on its own clock as well: a tab left open on a phone must not keep calling an
// hour-old report fresh just because its last refetch has not come back yet.

import type { ReportData, ReportPayload } from "./types";

export const STALE_MINUTES = 45;

export type StaleWhy = "failed" | "running" | "delayed";

export interface Freshness {
  kind: "never" | "ready";
  stale: boolean;
  /** whole minutes since the data time, never negative; null without a data time */
  ageMinutes: number | null;
  /** "09:15", Israel time */
  clock: string | null;
  /** "27/09 09:15", Israel time */
  dateClock: string | null;
  /** only when stale: the last refresh failed its reconciliation, is running, or is simply late */
  why: StaleWhy | null;
}

const IL_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function israelClock(ms: number): { clock: string; dateClock: string } {
  const p = Object.fromEntries(IL_PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const clock = `${p.hour}:${p.minute}`;
  return { clock, dateClock: `${p.day}/${p.month} ${clock}` };
}

export function freshnessOf(p: ReportPayload, now: number): Freshness {
  if (p.state === "never") return { kind: "never", stale: false, ageMinutes: null, clock: null, dateClock: null, why: null };
  const at = p.data_at ? Date.parse(p.data_at) : NaN;
  if (Number.isNaN(at)) {
    return { kind: "ready", stale: true, ageMinutes: null, clock: null, dateClock: null, why: whyOf(p) };
  }
  const ageMinutes = Math.max(0, Math.floor((now - at) / 60_000));
  const stale = p.stale || ageMinutes > STALE_MINUTES;
  return { kind: "ready", stale, ageMinutes, ...israelClock(at), why: stale ? whyOf(p) : null };
}

function whyOf(p: ReportPayload): StaleWhy {
  const s = p.last_attempt?.status;
  if (s === "failed") return "failed";
  if (s === "running") return "running";
  return "delayed";
}

/**
 * The contract's shape, checked once at the door. A malformed blob must read as an error, not as
 * a report of zeros: every computation below indexes these arrays without looking.
 */
export function validReportData(x: unknown): x is ReportData {
  if (!x || typeof x !== "object") return false;
  const d = x as Partial<ReportData>;
  return (
    Array.isArray(d.months) &&
    d.months.length >= 2 &&
    typeof d.partialIdx === "number" &&
    d.partialIdx >= 0 &&
    d.partialIdx < d.months.length &&
    typeof d.epoch0 === "number" &&
    typeof d.todayEpoch === "number" &&
    typeof d.pulledShort === "string" &&
    typeof d.pulledTime === "string" &&
    Array.isArray(d.cust) &&
    Array.isArray(d.sku) &&
    Array.isArray(d.rows) &&
    Array.isArray(d.orders) &&
    typeof d.chainMeta === "object" &&
    d.chainMeta !== null
  );
}

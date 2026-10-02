// How old is the report, and can the screen vouch for it? Pure.
//
// The server says `stale` when the data is more than 45 minutes old. The page checks the same
// threshold on its own clock as well: a tab left open on a phone must not keep calling an
// hour-old report fresh just because its last refetch has not come back yet.

import { REPORT_UI as L } from "../labels";
import { money } from "./format";
import type { HistoricSkuNote, ReportData, ReportPayload } from "./types";

export const STALE_MINUTES = 45;

/** `gate`: the reconciliation against Shopify refused the build. `failed`: it failed for any other reason. */
export type StaleWhy = "gate" | "failed" | "running" | "delayed";
const GATE_CODE = "SALES_REPORT_GATE";

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
  if (p.state === "never") {
    // nothing to show, but the last attempt may say why: only a failure or a build in flight is worth a line
    const s = p.last_attempt?.status;
    const why = s === "failed" || s === "running" ? whyOf(p) : null;
    return { kind: "never", stale: false, ageMinutes: null, clock: null, dateClock: null, why };
  }
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
  if (s === "failed") return p.last_attempt?.error_code === GATE_CODE ? "gate" : "failed";
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
    // the month in progress is always the last one: every "last full month" below counts on it
    d.partialIdx === d.months.length - 1 &&
    typeof d.epoch0 === "number" &&
    typeof d.todayEpoch === "number" &&
    typeof d.pulledShort === "string" &&
    typeof d.pulledTime === "string" &&
    // right keys with nothing in them is a hollow build, and it would read as a report of zeros
    Array.isArray(d.cust) &&
    d.cust.length > 0 &&
    Array.isArray(d.sku) &&
    d.sku.length > 0 &&
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    Array.isArray(d.orders) &&
    d.orders.length > 0 &&
    typeof d.chainMeta === "object" &&
    d.chainMeta !== null
  );
}

/** The neutral line about products outside the price list; null when there is nothing (sound) to say. */
export function historicNoteLine(note: HistoricSkuNote | undefined): string | null {
  if (!note || typeof note !== "object") return null;
  const m = /^\d{4}-(\d{2})$/.exec(String(note.month));
  if (!m || +m[1] < 1 || +m[1] > 12 || !Number.isFinite(note.amount_ag) || note.amount_ag <= 0) return null;
  return L.historicSku(L.monthsFull[+m[1] - 1], money(note.amount_ag));
}

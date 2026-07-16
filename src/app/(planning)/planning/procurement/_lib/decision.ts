// ---------------------------------------------------------------------------
// Procurement decision engine — v2 (Tranche 132, procurement-triage-decision-grade).
//
// Pure, framework-free classification of a proposed/approved purchase order into
// the operator's decision buckets:
//
//   must_today  🔴  — ordering any later than TODAY creates (or deepens) a real
//                     stockout on at least one line.
//   can_wait    🟡  — there is a concrete last-safe-order date in the future;
//                     ordering by then still arrives before stock hits zero.
//   handled     ✅  — already placed or skipped this session.
//
// v1 classified by `order_by_date` (the engine's release date, which protects
// the SAFETY FLOOR, not zero). Because the floor is breached chronically at
// lean stock levels, ~97% of POs since May landed in one bucket — the triage
// carried no signal. v2 reads each line's coverage_trace and computes actual
// exposure:
//
//   graceDays    = max(0, projected_on_hand_at_need) / avg_daily_demand
//   zeroDate     = need_date + graceDays          (≈ when stock hits ZERO)
//   lastSafe     = zeroDate − lead_time_days      (last day ordering still lands in time)
//   shortageDays = max(0, (today + lead_time) − zeroDate)
//                                                 (expected gap even if ordered TODAY)
//
// A PO is must_today when its earliest lastSafe is today or already past;
// otherwise it can wait until that date (shown to the operator). zeroDate is a
// deliberate extrapolation — demand is assumed to continue at the traced daily
// rate and receipts after the need date are ignored — so the UI presents these
// figures with a "~". Sessions/lines without a usable trace fall back to the
// v1 date/tier logic, so old data never breaks.
//
// The third operator decision — "count before you buy" — is a per-row flag,
// not a bucket: a line whose on-hand was never physically counted (or counted
// long ago) makes the shortage claim itself unverified. Flag only when the
// engine emitted count ages (trace_version 3+), so pre-0284 sessions show no
// noise.
//
// Decoupled from the app DTOs via a structural `DecisionInput` interface + a
// generic, so it is unit-testable in isolation and carries the full caller type
// (e.g. PurchaseSessionPo) straight through `classifyPo`.
// ---------------------------------------------------------------------------

import { parseCoverageTrace } from "./coverage-trace";

export type DecisionBucket = "must_today" | "can_wait" | "handled";

export type PoTierLike = "urgent" | "must" | "recommended";
export type PoStatusLike = "proposed" | "approved" | "placed" | "skipped";

/** The minimal line shape the decision engine reasons about (structurally
 *  satisfied by PurchaseSessionLine). */
export interface DecisionLineInput {
  line_label: string;
  is_dropped?: boolean;
  coverage_trace?: unknown;
}

/** The minimal PO shape the decision engine reasons about. `lines` is
 *  optional — without it (or without usable traces) classification falls back
 *  to the v1 order-by-date logic. */
export interface DecisionInput {
  status: PoStatusLike;
  tier: PoTierLike;
  order_by_date: string; // ISO date (YYYY-MM-DD)
  earliest_need_date: string | null;
  lines?: readonly DecisionLineInput[];
}

export type RowSeverity =
  | "shortage_now" // stock is at/below zero already — every day adds gap
  | "shortage_expected" // ordering today still leaves an expected gap
  | "order_today" // today is the last safe order day (no gap if sent now)
  | "can_wait" // a future last-safe-order date exists
  | "fallback" // no usable trace — classified by order_by_date/tier
  | "handled";

/** Per-line exposure derived from coverage_trace (null = no usable trace). */
export interface LineRisk {
  label: string;
  needDate: string;
  leadTimeDays: number;
  /** ≈ the day stock hits zero (extrapolated; see module header). */
  zeroDate: string;
  /** Last day an order still arrives before zeroDate. */
  lastSafeOrderDate: string;
  /** Expected days of stockout even when ordering today (0 = none). */
  shortageDays: number;
  severity: Exclude<RowSeverity, "fallback" | "handled">;
  /** Days since last physical count; null = never counted; undefined = the
   *  engine did not report count ages (pre-0284 trace). */
  countAgeDays: number | null | undefined;
  /** True when the line's on-hand deserves a recount before spending. */
  recount: boolean;
  ltSource: string | null | undefined;
  missingPrice: boolean;
}

export interface RecountInfo {
  /** Lines flagged "count before you buy". */
  lineCount: number;
  /** Driver label for the chip (worst line). */
  label: string;
  /** Worst age in days; null = never counted. */
  worstAgeDays: number | null;
}

export interface ClassifiedPo<T extends DecisionInput> {
  po: T;
  bucket: DecisionBucket;
  isOverdue: boolean;
  /** Whole days from today to order_by_date (negative = overdue). null if unparseable. */
  daysUntilOrderBy: number | null;
  whyNow: string;
  // --- v2 (Tranche 132) ---
  /** Worst severity across lines (or fallback/handled). */
  severity: RowSeverity;
  /** Expected stockout days even if ordered today (max across lines). */
  shortageDays: number;
  /** For can_wait: the last safe order date (ISO); null otherwise. */
  waitUntil: string | null;
  /** The line driving the classification (worst line), when trace math ran. */
  driverLabel: string | null;
  /** Lines that deserve a physical count before ordering; null = none. */
  recount: RecountInfo | null;
  /** True when at least one line was classified via trace math. */
  usedTraceMath: boolean;
  /** Per-line risk (active lines with usable traces only). */
  lineRisks: LineRisk[];
}

export interface DecisionGroups<T extends DecisionInput> {
  must_today: ClassifiedPo<T>[];
  can_wait: ClassifiedPo<T>[];
  handled: ClassifiedPo<T>[];
}

// A count older than this (days) — or missing entirely — makes an on-hand
// figure "unverified" for spending decisions. 2× the stale_count_days policy
// threshold (7): stale-but-recent counts stay quiet, genuinely old ones don't.
export const RECOUNT_AGE_DAYS = 14;

// --- date helpers ----------------------------------------------------------

/** Today as an ISO date string (YYYY-MM-DD) in local time. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole-day difference (b - a) for two YYYY-MM-DD strings; null if unparseable. */
function diffDays(aISO: string, bISO: string): number | null {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** ISO date n whole days after iso; null if unparseable. */
function addDaysISO(iso: string, n: number): string | null {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** DD/MM presentation of a YYYY-MM-DD string; passes through anything else. */
export function fmtDateHe(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

/** Grammatically-correct Hebrew day count: 1→יום, 2→יומיים, else N ימים. */
export function daysHe(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1) return "יום";
  if (abs === 2) return "יומיים";
  return `${abs} ימים`;
}

// --- per-line risk ---------------------------------------------------------

/** Derive a line's real exposure from its coverage_trace. Returns null when
 *  the trace is missing/unusable (the caller then falls back to v1 logic). */
export function assessLine(
  line: DecisionLineInput,
  today: string,
): LineRisk | null {
  const trace = parseCoverageTrace(line.coverage_trace);
  if (!trace || !trace.need_date || trace.lead_time_days == null) return null;

  const adu = trace.avg_daily_demand_inv;
  const poh = trace.projected_on_hand_at_need_inv;
  const lt = trace.lead_time_days;

  // Days of demand left above zero at the need date. poh<=0 (or an unusable
  // rate) means zero is hit on the need date itself.
  const graceDays =
    adu != null && adu > 0 && poh != null && poh > 0
      ? Math.floor(poh / adu)
      : 0;
  const zeroDate = addDaysISO(trace.need_date, graceDays);
  if (!zeroDate) return null;
  const lastSafe = addDaysISO(zeroDate, -lt);
  if (!lastSafe) return null;

  const arrivalIfToday = addDaysISO(today, lt);
  const shortageDays = arrivalIfToday
    ? Math.max(0, diffDays(zeroDate, arrivalIfToday) ?? 0)
    : 0;

  let severity: LineRisk["severity"];
  if (shortageDays > 0) {
    severity =
      (diffDays(today, zeroDate) ?? 1) <= 0 ? "shortage_now" : "shortage_expected";
  } else {
    severity =
      (diffDays(today, lastSafe) ?? 1) <= 0 ? "order_today" : "can_wait";
  }

  // Recount signal — only when the engine actually reported count ages
  // (trace_version 3+); pre-0284 traces stay silent instead of noisy.
  const hasCountSignal = "last_count_age_days" in trace;
  const countAgeDays = trace.last_count_age_days;
  const recount =
    hasCountSignal &&
    (countAgeDays == null || countAgeDays > RECOUNT_AGE_DAYS);

  return {
    label: line.line_label,
    needDate: trace.need_date,
    leadTimeDays: lt,
    zeroDate,
    lastSafeOrderDate: lastSafe,
    shortageDays,
    severity,
    countAgeDays: hasCountSignal ? (countAgeDays ?? null) : undefined,
    recount,
    ltSource: trace.lt_source,
    missingPrice: (trace.blocking_codes ?? []).includes("missing_price"),
  };
}

// --- why-now copy ----------------------------------------------------------

function whyNowFallback(
  bucket: DecisionBucket,
  input: DecisionInput,
  isOverdue: boolean,
  days: number | null,
): string {
  if (bucket === "handled") {
    // Tranche 130 renamed the placed-status label to "הועבר לביצוע" (it hands
    // to the office-manager queue, not a completed order) — match it here too
    // (ux-release-gate COPY-001 caught this row's whyNow line still saying
    // the old "הוזמן" while its status badge already says the new wording).
    return input.status === "placed" ? "הועבר לביצוע" : "דולג / בוטל";
  }

  const orderBy = fmtDateHe(input.order_by_date);
  const need = input.earliest_need_date
    ? ` · נדרש ${fmtDateHe(input.earliest_need_date)}`
    : "";

  if (isOverdue) {
    const late = days != null ? ` (${daysHe(days)})` : "";
    return `באיחור — היה צריך להזמין עד ${orderBy}${late}${need}`;
  }
  if (days === 0) {
    return `להזמין עד היום (${orderBy})${need}`;
  }
  if (bucket === "must_today" && input.tier === "urgent") {
    return `דחוף — להזמין עד ${orderBy}${need}`;
  }
  const lead = days != null ? ` בעוד ${daysHe(days)}` : "";
  return `אפשר להמתין — להזמין עד ${orderBy}${lead}${need}`;
}

function whyNowFromRisk(driver: LineRisk, extraCritical: number): string {
  const more =
    extraCritical > 0 ? ` · ‎+${extraCritical} שורות דחופות נוספות` : "";
  switch (driver.severity) {
    case "shortage_now":
      return `${driver.label} על אפס — גם בהזמנה היום צפוי פער של ~${daysHe(driver.shortageDays)}${more}`;
    case "shortage_expected":
      return `${driver.label} ייגמר ~${fmtDateHe(driver.zeroDate)} — הזמנה היום עדיין משאירה פער של ~${daysHe(driver.shortageDays)}${more}`;
    case "order_today":
      return `היום אחרון להזמין — ${driver.label} ייגמר ~${fmtDateHe(driver.zeroDate)} ואספקה אורכת ${daysHe(driver.leadTimeDays)}${more}`;
    case "can_wait":
      return "";
  }
}

// --- classification --------------------------------------------------------

export function classifyPo<T extends DecisionInput>(
  po: T,
  today: string = todayISO(),
): ClassifiedPo<T> {
  const daysUntilOrderBy = diffDays(today, po.order_by_date);

  if (po.status === "placed" || po.status === "skipped") {
    return {
      po,
      bucket: "handled",
      isOverdue: false,
      daysUntilOrderBy,
      whyNow: whyNowFallback("handled", po, false, null),
      severity: "handled",
      shortageDays: 0,
      waitUntil: null,
      driverLabel: null,
      recount: null,
      usedTraceMath: false,
      lineRisks: [],
    };
  }

  const activeLines = (po.lines ?? []).filter((l) => !l.is_dropped);
  const risks = activeLines
    .map((l) => assessLine(l, today))
    .filter((r): r is LineRisk => r != null);

  // Recount info is independent of the bucket: it qualifies the on-hand truth
  // behind whichever decision the row lands on.
  const recountLines = risks.filter((r) => r.recount);
  const recount: RecountInfo | null =
    recountLines.length === 0
      ? null
      : {
          lineCount: recountLines.length,
          // Worst = never counted first, then oldest.
          label: [...recountLines].sort((a, b) => {
            if ((a.countAgeDays == null) !== (b.countAgeDays == null))
              return a.countAgeDays == null ? -1 : 1;
            return (b.countAgeDays ?? 0) - (a.countAgeDays ?? 0);
          })[0].label,
          worstAgeDays: recountLines.some((r) => r.countAgeDays == null)
            ? null
            : Math.max(...recountLines.map((r) => r.countAgeDays ?? 0)),
        };

  if (risks.length === 0) {
    // v1 fallback — no usable trace on any line (old sessions, user-added
    // lines). must today: due on/before today, already overdue, or urgent.
    const isOverdue = daysUntilOrderBy != null && daysUntilOrderBy < 0;
    const mustToday =
      po.tier === "urgent" || (daysUntilOrderBy != null && daysUntilOrderBy <= 0);
    const bucket: DecisionBucket = mustToday ? "must_today" : "can_wait";
    return {
      po,
      bucket,
      isOverdue,
      daysUntilOrderBy,
      whyNow: whyNowFallback(bucket, po, isOverdue, daysUntilOrderBy),
      severity: "fallback",
      shortageDays: 0,
      waitUntil: bucket === "can_wait" ? po.order_by_date : null,
      driverLabel: null,
      recount,
      usedTraceMath: false,
      lineRisks: [],
    };
  }

  // Driver = the line with the earliest last-safe-order date (ties: deeper
  // expected shortage wins). ISO dates compare correctly as strings.
  const driver = [...risks].sort((a, b) => {
    if (a.lastSafeOrderDate < b.lastSafeOrderDate) return -1;
    if (a.lastSafeOrderDate > b.lastSafeOrderDate) return 1;
    return b.shortageDays - a.shortageDays;
  })[0];

  const shortageDays = Math.max(...risks.map((r) => r.shortageDays));
  const driverLastSafeInDays = diffDays(today, driver.lastSafeOrderDate) ?? 1;
  const mustToday = driverLastSafeInDays <= 0;
  const bucket: DecisionBucket = mustToday ? "must_today" : "can_wait";
  const criticalCount = risks.filter(
    (r) => r.severity !== "can_wait",
  ).length;

  const whyNow = mustToday
    ? whyNowFromRisk(driver, Math.max(0, criticalCount - 1))
    : `אפשר להמתין עד ${fmtDateHe(driver.lastSafeOrderDate)} (בעוד ${daysHe(driverLastSafeInDays)}) — הזמנה עד אז עדיין מגיעה לפני חוסר`;

  return {
    po,
    bucket,
    // "Late" now means real expected shortage, not a breached planning fence.
    isOverdue: shortageDays > 0,
    daysUntilOrderBy,
    whyNow,
    severity: mustToday ? driver.severity : "can_wait",
    shortageDays,
    waitUntil: mustToday ? null : driver.lastSafeOrderDate,
    driverLabel: driver.label,
    recount,
    usedTraceMath: true,
    lineRisks: risks,
  };
}

// --- grouping + sorting ----------------------------------------------------

function byUrgency<T extends DecisionInput>(
  a: ClassifiedPo<T>,
  b: ClassifiedPo<T>,
): number {
  // Deeper expected shortage first; then earlier wait-until/order-by; null
  // (unparseable) last.
  if (a.shortageDays !== b.shortageDays) return b.shortageDays - a.shortageDays;
  const ka = a.waitUntil ?? a.po.order_by_date;
  const kb = b.waitUntil ?? b.po.order_by_date;
  if (ka < kb) return -1;
  if (ka > kb) return 1;
  return 0;
}

export function groupByDecision<T extends DecisionInput>(
  pos: readonly T[],
  today: string = todayISO(),
): DecisionGroups<T> {
  const groups: DecisionGroups<T> = {
    must_today: [],
    can_wait: [],
    handled: [],
  };
  for (const po of pos) {
    const classified = classifyPo(po, today);
    groups[classified.bucket].push(classified);
  }
  // most-urgent first within each actionable bucket
  groups.must_today.sort(byUrgency);
  groups.can_wait.sort(byUrgency);
  return groups;
}

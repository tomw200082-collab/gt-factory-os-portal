// ---------------------------------------------------------------------------
// Procurement decision engine — Tranche 028 (procurement-unified-action-list).
//
// Pure, framework-free classification of a proposed/approved purchase order into
// the operator's decision buckets:
//
//   must_today  🔴  — order_by_date is today or already past, OR tier=urgent.
//                     Delaying risks a stockout; it has to go out now.
//   can_wait    🟡  — order_by_date is in the future; safe to leave for later.
//   handled     ✅  — already placed or skipped this session.
//
// Decoupled from the app DTOs via a structural `DecisionInput` interface + a
// generic, so it is unit-testable in isolation and carries the full caller type
// (e.g. PurchaseSessionPo) straight through `classifyPo`.
// ---------------------------------------------------------------------------

export type DecisionBucket = "must_today" | "can_wait" | "handled";

export type PoTierLike = "urgent" | "must" | "recommended";
export type PoStatusLike = "proposed" | "approved" | "placed" | "skipped";

/** The minimal PO shape the decision engine reasons about. */
export interface DecisionInput {
  status: PoStatusLike;
  tier: PoTierLike;
  order_by_date: string; // ISO date (YYYY-MM-DD)
  earliest_need_date: string | null;
}

export interface ClassifiedPo<T extends DecisionInput> {
  po: T;
  bucket: DecisionBucket;
  isOverdue: boolean;
  /** Whole days from today to order_by_date (negative = overdue). null if unparseable. */
  daysUntilOrderBy: number | null;
  whyNow: string;
}

export interface DecisionGroups<T extends DecisionInput> {
  must_today: ClassifiedPo<T>[];
  can_wait: ClassifiedPo<T>[];
  handled: ClassifiedPo<T>[];
}

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

/** DD/MM presentation of a YYYY-MM-DD string; passes through anything else. */
export function fmtDateHe(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

// --- classification --------------------------------------------------------

function whyNowLabel(
  bucket: DecisionBucket,
  input: DecisionInput,
  isOverdue: boolean,
  days: number | null,
): string {
  if (bucket === "handled") {
    return input.status === "placed" ? "הוזמן" : "דולג";
  }

  const orderBy = fmtDateHe(input.order_by_date);
  const need = input.earliest_need_date
    ? ` · חוסר צפוי ${fmtDateHe(input.earliest_need_date)}`
    : "";

  if (isOverdue) {
    const late = days != null ? ` (${Math.abs(days)} ימים)` : "";
    return `באיחור — היה צריך להזמין עד ${orderBy}${late}${need}`;
  }
  if (days === 0) {
    return `חייב לצאת היום — להזמין עד ${orderBy}${need}`;
  }
  if (bucket === "must_today" && input.tier === "urgent") {
    return `דחוף — להזמין עד ${orderBy}${need}`;
  }
  // can_wait
  const lead = days != null ? `בעוד ${days} ימים` : "";
  return `אפשר להמתין — להזמין עד ${orderBy} ${lead}${need}`.trim();
}

export function classifyPo<T extends DecisionInput>(
  po: T,
  today: string = todayISO(),
): ClassifiedPo<T> {
  if (po.status === "placed" || po.status === "skipped") {
    return {
      po,
      bucket: "handled",
      isOverdue: false,
      daysUntilOrderBy: diffDays(today, po.order_by_date),
      whyNow: whyNowLabel("handled", po, false, null),
    };
  }

  const days = diffDays(today, po.order_by_date);
  const isOverdue = days != null && days < 0;
  // must today: due on/before today, already overdue, or flagged urgent.
  const mustToday =
    po.tier === "urgent" || (days != null && days <= 0);
  const bucket: DecisionBucket = mustToday ? "must_today" : "can_wait";

  return {
    po,
    bucket,
    isOverdue,
    daysUntilOrderBy: days,
    whyNow: whyNowLabel(bucket, po, isOverdue, days),
  };
}

// --- grouping + sorting ----------------------------------------------------

function byOrderByAsc<T extends DecisionInput>(
  a: ClassifiedPo<T>,
  b: ClassifiedPo<T>,
): number {
  // null/unparseable sort last
  const da = a.daysUntilOrderBy;
  const db = b.daysUntilOrderBy;
  if (da == null && db == null) return 0;
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db;
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
  groups.must_today.sort(byOrderByAsc);
  groups.can_wait.sort(byOrderByAsc);
  return groups;
}

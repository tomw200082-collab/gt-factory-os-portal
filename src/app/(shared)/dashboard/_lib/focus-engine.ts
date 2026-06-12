// ---------------------------------------------------------------------------
// Focus Engine (Tranche 060, design-doc §4 Band 0).
//
// "ימקד אותי בכל יום מחדש" — the dashboard's first sentence must answer
// "what is today about?", and the answer must change with the factory's day.
//
// Deterministic, explainable, testable: a fixed rule cascade, no magic.
// Each rule names a verb + object; the winning rule's id is returned so
// tests (and future analytics) can assert WHY a sentence was chosen.
//
// Rule order = severity order:
//   1. critical-today rows        → name the worst blocker
//   2. Sunday, no purchase session → procurement-day call to action
//   3. supplier orders overdue/due → order now
//   4. slipped plans              → post or reschedule
//   5. today's production plan    → progress + next run (or "complete")
//   6. late POs                   → chase receipts
//   7. all clear                  → point FORWARD at the next commitment
// ---------------------------------------------------------------------------

export type FocusTone = "danger" | "warning" | "accent" | "success";

export interface FocusResult {
  sentence: string;
  tone: FocusTone;
  /** Deep link for the sentence (null when there is nothing to open). */
  href: string | null;
  /** Stable id of the winning rule — asserted by tests. */
  rule:
    | "loading"
    | "critical"
    | "procurement_day"
    | "procurement_due"
    | "slipped"
    | "plan_progress"
    | "plan_complete"
    | "late_pos"
    | "all_clear";
}

export interface FocusInputs {
  now: Date;
  /** Critical-today rows (worst first, as served). null while loading. */
  critical: { label: string }[] | null;
  /** Purchasing state — null when the role cannot see purchasing
   *  (operator/viewer) or while loading. */
  procurement: {
    sessionExists: boolean;
    overdue: number;
    dueToday: number;
    nextSupplier: string | null;
  } | null;
  /** Slipped-plan count. null while loading. */
  slipped: number | null;
  /** Today's production plan summary. null when no plan rows exist today. */
  todayPlan: { planned: number; done: number; nextItem: string | null } | null;
  /** Open POs past their expected receive date. null while loading. */
  latePos: number | null;
  /** Pre-composed forward pointer, e.g. "order-by Thursday (Tempo)". */
  nextCommitment: string | null;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function resolveFocus(inputs: FocusInputs): FocusResult {
  const { now, critical, procurement, slipped, todayPlan, latePos, nextCommitment } =
    inputs;

  // Rule 0 — never paint unknown as healthy.
  if (critical === null) {
    return {
      sentence: "Reading the floor state…",
      tone: "accent",
      href: null,
      rule: "loading",
    };
  }

  // Rule 1 — critical blockers.
  if (critical.length > 0) {
    const first = critical[0].label;
    return {
      sentence:
        critical.length === 1
          ? `${first} stops production today — start there.`
          : `${critical.length} critical issues stop production today — start with ${first}.`,
      tone: "danger",
      href: "#todays-work",
      rule: "critical",
    };
  }

  // Rule 2 — Sunday is procurement day (weekly session cadence).
  if (now.getDay() === 0 && procurement && !procurement.sessionExists) {
    return {
      sentence: "Procurement day — start the weekly session.",
      tone: "accent",
      href: "/planning/procurement",
      rule: "procurement_day",
    };
  }

  // Rule 3 — supplier orders that must be ordered now.
  if (procurement) {
    const due = procurement.overdue + procurement.dueToday;
    if (procurement.overdue > 0) {
      return {
        sentence: `${procurement.overdue} supplier ${plural(
          procurement.overdue,
          "order is",
          "orders are",
        )} overdue — order ${procurement.nextSupplier ?? "the oldest"} first.`,
        tone: "warning",
        href: "/planning/procurement",
        rule: "procurement_due",
      };
    }
    if (due > 0) {
      return {
        sentence: `${due} supplier ${plural(due, "order is", "orders are")} due today.`,
        tone: "warning",
        href: "/planning/procurement",
        rule: "procurement_due",
      };
    }
  }

  // Rule 4 — slipped plans.
  if ((slipped ?? 0) > 0) {
    const n = slipped as number;
    return {
      sentence: `${n} planned ${plural(n, "run has", "runs have")} no posted actual — post or reschedule.`,
      tone: "warning",
      href: "/planning/production-plan",
      rule: "slipped",
    };
  }

  // Rule 5 — today's production plan.
  if (todayPlan && todayPlan.planned > 0) {
    if (todayPlan.done >= todayPlan.planned) {
      return {
        sentence: `Today's plan is complete — ${todayPlan.done}/${todayPlan.planned} runs posted.`,
        tone: "success",
        href: "/planning/production-plan",
        rule: "plan_complete",
      };
    }
    return {
      sentence: todayPlan.nextItem
        ? `${todayPlan.planned} ${plural(todayPlan.planned, "run", "runs")} planned today · next: ${todayPlan.nextItem}.`
        : `${todayPlan.planned} ${plural(todayPlan.planned, "run", "runs")} planned today.`,
      tone: "accent",
      href: "/planning/production-plan",
      rule: "plan_progress",
    };
  }

  // Rule 6 — late purchase orders.
  if ((latePos ?? 0) > 0) {
    const n = latePos as number;
    return {
      sentence: `${n} purchase ${plural(n, "order is", "orders are")} past expected receipt — chase suppliers.`,
      tone: "warning",
      href: "/purchase-orders",
      rule: "late_pos",
    };
  }

  // Rule 7 — all clear: point forward, never just "nothing".
  return {
    sentence: nextCommitment
      ? `All clear — next: ${nextCommitment}.`
      : "All clear — nothing needs you right now.",
    tone: "success",
    href: null,
    rule: "all_clear",
  };
}

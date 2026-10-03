"use client";

import { UI } from "../_lib/labels";
import { fmtWorkLeft } from "../_lib/responseTime";
import type { SlaState } from "../_lib/types";

/**
 * The response clock on an untouched lead, in working hours (D-043, tranche 204).
 *
 * Three states: "בזמן", "עומד לעבור" (the last quarter of the allowed time) and "עבר",
 * with the working time left while there is some. It renders only while sla_state is
 * set, and the view sets that to null the moment a lead is first touched — that is how
 * the badge disappears.
 *
 * Tranche 164 had retired the calm state: one 24-hour clock made every imported lead
 * overdue and "בזמן" on everything said nothing (audit P1-3). Counted in working hours
 * the calm state belongs to a fresh lead only, and D-043 asks for all three. A server
 * before 0377 still sends "within"; that keeps rendering nothing, as it always did.
 */
export function SlaBadge({ state, minutesLeft = null }: { state: SlaState; minutesLeft?: number | null }) {
  if (state !== "on_time" && state !== "due_soon" && state !== "overdue") return null;
  const label = state === "on_time" ? UI.slaOnTime : state === "due_soon" ? UI.slaDueSoon : UI.slaOverdue;
  const left = state !== "overdue" && typeof minutesLeft === "number" && minutesLeft > 0 ? fmtWorkLeft(minutesLeft) : null;
  const tone = state === "on_time" ? "s-badge-sla-ok" : state === "due_soon" ? "s-badge-sla-soon" : "s-badge-sla-overdue";
  return (
    <span data-testid="sla-badge" data-state={state} className={`s-badge ${tone}`}>
      {left ? `${label} · ${left}` : label}
    </span>
  );
}

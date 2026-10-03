"use client";

import { UI } from "../_lib/labels";
import { fmtWorkLeft } from "../_lib/responseTime";
import type { SlaState } from "../_lib/types";

/**
 * The response clock on an untouched lead, in working hours (D-043, tranche 204).
 *
 * A pill only when it asks for action: "עומד לעבור" (the last quarter of the allowed time,
 * amber) and "עבר הזמן". On time gets no pill — a pill on every fresh card is a pill on
 * nothing (tranche 164, audit P1-3); it gets the quiet SlaTimeLeft line instead. The pill
 * holds one or two words so the business name and phone beside it never truncate.
 *
 * Renders only while sla_state is set; the view sets it to null at the first touch. A
 * server before 0377 sends "within", which renders nothing, as it always did.
 */
export function SlaBadge({ state }: { state: SlaState; minutesLeft?: number | null }) {
  if (state !== "due_soon" && state !== "overdue") return null;
  return (
    <span
      data-testid="sla-badge"
      data-state={state}
      className={`s-badge ${state === "due_soon" ? "s-badge-sla-soon" : "s-badge-sla-overdue"}`}
    >
      {state === "due_soon" ? UI.slaDueSoon : UI.slaOverdue}
    </span>
  );
}

/**
 * The working time left, as muted text for the card's meta line: "עוד 5 שעות עבודה".
 * Shown while the lead is on time or about to pass; nothing once past or touched.
 */
export function SlaTimeLeft({ state, minutesLeft, separator = false }: { state: SlaState; minutesLeft?: number | null; separator?: boolean }) {
  if ((state !== "on_time" && state !== "due_soon") || typeof minutesLeft !== "number" || minutesLeft <= 0) return null;
  return (
    <span data-testid="sla-left" data-state={state} className="s-sla-left">
      {separator ? " · " : ""}{fmtWorkLeft(minutesLeft)}
    </span>
  );
}

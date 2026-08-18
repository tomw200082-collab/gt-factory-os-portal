"use client";

import { UI } from "../_lib/labels";
import type { SlaState } from "../_lib/types";

/**
 * The clock on an untouched lead.
 *
 * Two rules, and the second one was learned the hard way. It renders only while
 * sla_state is set, and the view sets that to null the moment a lead is first
 * touched — that is how the badge disappears. And it renders **only when
 * overdue**: with an imported backlog every untouched lead is past its SLA, so
 * the "בזמן" variant appeared on 188 of 188 cards and said nothing at all
 * (audit P1-3). A timer on everything is a timer on nothing; this badge earns
 * its colour by being rare, which means the calm state gets no badge.
 */
export function SlaBadge({ state }: { state: SlaState }) {
  if (state !== "overdue") return null;
  return (
    <span data-testid="sla-badge" className="s-badge s-badge-sla-overdue">
      {UI.slaOverdue}
    </span>
  );
}

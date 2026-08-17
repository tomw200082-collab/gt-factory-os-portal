"use client";

import { UI } from "../_lib/labels";
import type { SlaState } from "../_lib/types";

/**
 * The clock on an untouched lead.
 *
 * It renders only while sla_state is set, and the view sets that to null the
 * moment a lead is first touched. A timer on everything is a timer on nothing,
 * so this badge earns its colour by being rare.
 */
export function SlaBadge({ state }: { state: SlaState }) {
  if (!state) return null;
  const overdue = state === "overdue";
  return (
    <span
      data-testid="sla-badge"
      className={`s-badge ${overdue ? "s-badge-sla-overdue" : "s-badge-sla-ok"}`}
    >
      {overdue ? UI.slaOverdue : UI.slaWithin}
    </span>
  );
}

"use client";

import { STATUS_LABELS } from "../_lib/labels";
import type { LeadStatus } from "../_lib/types";

/** The row's visual anchor — monday's one structural idea worth keeping. */
export function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <span data-testid={`status-pill-${status}`} className={`s-pill s-pill-${status}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

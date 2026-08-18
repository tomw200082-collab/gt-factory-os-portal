"use client";

// The bar that appears when rows are selected.
//
// Sticky at the bottom because that is where a thumb is, and because the
// selection it acts on is above it. It carries the one verb that makes a
// backlog distributable — and the date field beside it is not decoration:
// an assignment with no due date lands in a name but in nobody's queue.

import { useState } from "react";
import { UI } from "../_lib/labels";
import { toDateInputValue } from "../_lib/format";
import { AssigneePicker } from "./AssigneePicker";
import type { AssigneeEntry } from "../_lib/types";

export interface BulkBarProps {
  count: number;
  roster: AssigneeEntry[];
  busy?: boolean;
  onAssign: (email: string, nextTouchAt: string) => void;
  onClear: () => void;
}

export function BulkBar({ count, roster, busy, onAssign, onClear }: BulkBarProps) {
  const [assignee, setAssignee] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInputValue(new Date()));

  return (
    <div
      data-testid="bulk-bar"
      role="region"
      aria-label={UI.bulkBarLabel}
      className="s-card fixed inset-x-2 z-40 flex flex-wrap items-center gap-2 p-3"
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
        {UI.bulkSelected(count)}
      </span>

      <AssigneePicker
        value={assignee}
        roster={roster}
        disabled={busy}
        onChange={setAssignee}
      />

      <input
        type="date"
        className="s-input w-auto"
        aria-label={UI.saveDate}
        value={date}
        disabled={busy}
        onChange={(e) => setDate(e.target.value)}
      />

      <button
        type="button"
        data-testid="bulk-assign-confirm"
        className="s-btn s-btn-primary"
        disabled={busy || !assignee || !date}
        onClick={() => {
          if (!assignee || !date) return;
          onAssign(assignee, new Date(`${date}T09:00:00`).toISOString());
        }}
      >
        {busy ? UI.saving : UI.assignAction}
      </button>

      <button type="button" data-testid="bulk-clear" className="s-btn s-btn-ghost" onClick={onClear}>
        {UI.clearSelection}
      </button>
    </div>
  );
}

"use client";

// The bar that appears when rows are selected.
//
// Sticky at the bottom because that is where a thumb is, and because the
// selection it acts on is above it. It carries the one verb that makes a
// backlog distributable — and the date field beside it is not decoration:
// an assignment with no due date lands in a name but in nobody's queue.

import { useState } from "react";
import { useLockedWidth } from "@/components/ui/useLockedWidth";
import { UI } from "../_lib/labels";
import { toDateInputValue } from "../_lib/format";
import { AssigneePicker } from "./AssigneePicker";
import type { AssigneeEntry } from "../_lib/types";

export interface BulkBarProps {
  count: number;
  roster: AssigneeEntry[];
  busy?: boolean;
  /** A failed batch, said out loud. Without this the bar went spinner → idle
   *  with nothing changed and nothing stated, and the natural next move was to
   *  press the same button again (gate P0, INTER-002). */
  error?: string | null;
  onAssign: (email: string, nextTouchAt: string) => void;
  onClear: () => void;
}

export function BulkBar({ count, roster, busy, error = null, onAssign, onClear }: BulkBarProps) {
  const [assignee, setAssignee] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const assignRef = useLockedWidth<HTMLButtonElement>(Boolean(busy));

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
        aria-label={UI.bulkDateLabel}
        value={date}
        disabled={busy}
        onChange={(e) => setDate(e.target.value)}
      />

      <button
        ref={assignRef}
        type="button"
        data-testid="bulk-assign-confirm"
        // min-width holds the busy label and its ring (the lock covers only a shrink).
        className="s-btn s-btn-primary min-w-[6.5rem]"
        disabled={busy || !assignee || !date}
        aria-busy={busy || undefined}
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

      {error ? (
        <p
          role="alert"
          data-testid="bulk-error"
          className="w-full text-[12px]"
          style={{ color: "hsl(var(--s-sla-overdue))" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

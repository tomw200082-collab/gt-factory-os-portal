"use client";

// Give selected businesses an owner, in one call (T9: one bulk action, no
// per-org owner screen until the first sales_rep exists).
//
// It sits above the tab bar where the thumb is, like the leads bulk bar. No
// date here: an org owner is responsibility, not a due task.

import { useState } from "react";
import { UI } from "../_lib/labels";
import type { AssigneeEntry } from "../_lib/types";

export interface BulkOwnerBarProps {
  count: number;
  roster: AssigneeEntry[];
  busy?: boolean;
  error?: string | null;
  onAssign: (email: string) => void;
  onClear: () => void;
}

export function BulkOwnerBar({ count, roster, busy, error = null, onAssign, onClear }: BulkOwnerBarProps) {
  const [owner, setOwner] = useState("");
  const active = roster.filter((a) => a.active);
  const tooMany = count > 200;

  return (
    <div
      data-testid="bulk-owner-bar"
      role="region"
      aria-label={UI.bulkSelected(count)}
      className="s-card s-bulkbar fixed inset-x-2 z-40 flex flex-wrap items-center gap-2 p-3"
    >
      <span className="s-nums text-[13px] font-medium" style={{ color: "hsl(var(--s-fg))" }} aria-live="polite">
        {UI.bulkSelected(count)}
      </span>
      <select
        className="s-input min-w-0 flex-1 sm:flex-none sm:w-56"
        aria-label={UI.ownerPick}
        value={owner}
        disabled={busy}
        onChange={(e) => setOwner(e.target.value)}
      >
        <option value="">{UI.ownerPickPlaceholder}</option>
        {active.map((a) => (
          <option key={a.email} value={a.email}>
            {a.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="s-btn s-btn-primary"
        disabled={busy || !owner || count === 0 || tooMany}
        aria-busy={busy || undefined}
        onClick={() => owner && onAssign(owner)}
      >
        {busy ? UI.saving : UI.ownerAssign}
      </button>
      <button type="button" className="s-btn s-btn-ghost" onClick={onClear} disabled={busy}>
        {UI.clearSelection}
      </button>
      {tooMany || error ? (
        <p role="alert" className="w-full text-[12px]" style={{ color: "hsl(var(--s-danger-quiet))" }}>
          {tooMany ? UI.ownerTooMany : error}
        </p>
      ) : null}
    </div>
  );
}

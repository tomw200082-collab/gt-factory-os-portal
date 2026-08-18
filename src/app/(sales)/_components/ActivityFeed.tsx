"use client";

// Who did what, across every lead.
//
// The per-lead timeline has existed since v1; this is the read the admin never
// had (audit admin-F7). Supervising a second person used to mean opening their
// leads one at a time.

import { EVENT_LABELS, UI } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import type { ActivityRow } from "../_lib/types";

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
        {UI.activityEmpty}
      </p>
    );
  }

  return (
    <ul data-testid="activity-feed" className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.event_id}
          data-testid={`activity-${row.event_id}`}
          className="flex flex-wrap items-baseline gap-2 text-[13px]"
        >
          <span style={{ color: "hsl(var(--s-fg))" }}>{row.org_name}</span>
          <span style={{ color: "hsl(var(--s-fg-muted))" }}>
            {EVENT_LABELS[row.event_type] ?? row.event_type}
          </span>
          <span style={{ color: "hsl(var(--s-fg-faint))" }}>{row.actor}</span>
          <span className="s-nums" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {fmtRelative(row.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

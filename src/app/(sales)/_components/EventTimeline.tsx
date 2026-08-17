"use client";

// The lead's history, newest first.
//
// lead_event is append-only: a correction is another event, never an edit. So
// this is a record, not a view of current state — it is allowed to contradict
// itself over time, and that is the point.

import { fmtDateTime } from "../_lib/format";
import { CHANNEL_LABELS, EVENT_LABELS, OUTCOME_LABELS, STATUS_LABELS, UI } from "../_lib/labels";
import type { LeadEventRow, LeadStatus, OutcomeResult } from "../_lib/types";

function statusLabel(value: unknown): string {
  const key = String(value ?? "") as LeadStatus;
  return STATUS_LABELS[key] ?? String(value ?? "—");
}

/** One line of plain Hebrew describing what the payload actually says. */
function describe(event: LeadEventRow): string | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.event_type) {
    case "status_change": {
      const to = statusLabel(p.to);
      const reason = typeof p.reason === "string" && p.reason ? ` · ${p.reason}` : "";
      return `${statusLabel(p.from)} ← ${to}${reason}`;
    }
    case "note":
      return typeof p.note === "string" ? p.note : null;
    case "next_touch_set":
      return typeof p.at === "string" ? fmtDateTime(p.at) : null;
    case "assignment":
      return typeof p.assignee === "string" && p.assignee ? p.assignee : UI.noNextTouch;
    case "outreach":
      return typeof p.channel === "string" ? (CHANNEL_LABELS[p.channel] ?? p.channel) : null;
    case "outcome": {
      const result = String(p.result ?? "") as OutcomeResult;
      return OUTCOME_LABELS[result] ?? String(p.result ?? "");
    }
    case "converted":
      return typeof p.order_ref === "string" ? String(p.order_ref) : null;
    default:
      return null;
  }
}

export function EventTimeline({ events }: { events: LeadEventRow[] }) {
  if (events.length === 0) return null;
  return (
    <ol data-testid="event-timeline" className="flex flex-col gap-3">
      {events.map((event) => {
        const detail = describe(event);
        return (
          <li key={event.id} className="flex gap-2">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "hsl(var(--s-border-strong))" }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </p>
              {detail ? (
                <p className="break-words text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {detail}
                </p>
              ) : null}
              <p className="s-nums text-[11px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                {fmtDateTime(event.created_at)} · {event.actor}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

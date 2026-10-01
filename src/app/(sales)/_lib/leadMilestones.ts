import type { LeadEventRow } from "./types";

export type MilestoneKind = "created" | "outreach" | "answered" | "next_action" | "converted";
export interface LeadMilestone {
  kind: MilestoneKind;
  sourceEventId: string;
  at: string;
}

/** A short path through recorded facts, with an event behind every node. */
export function deriveLeadMilestones(events: LeadEventRow[]): LeadMilestone[] {
  const newestFirst = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = (kind: MilestoneKind, predicate: (event: LeadEventRow) => boolean): LeadMilestone | null => {
    const event = newestFirst.find(predicate);
    return event ? { kind, sourceEventId: event.id, at: event.created_at } : null;
  };
  const nodes = [
    latest("created", (event) => event.event_type === "created"),
    latest("outreach", (event) => event.event_type === "outreach" &&
      ["call", "whatsapp", "email"].includes(String(event.payload?.channel ?? ""))),
    latest("answered", (event) => event.event_type === "outcome" &&
      event.payload?.result === "answered_progressing" &&
      typeof event.payload?.note_event_id === "string" && Boolean(event.payload.note_event_id) &&
      ["call", "whatsapp", "email"].includes(String(event.payload?.channel ?? ""))),
    latest("next_action", (event) =>
      (event.event_type === "next_touch_set" && typeof event.payload?.at === "string") ||
      (event.event_type === "outcome" && typeof event.payload?.request_id === "string" &&
       typeof event.payload?.next_touch_at === "string")),
    latest("converted", (event) => event.event_type === "converted" &&
      typeof event.payload?.order_ref === "string" && Boolean(event.payload.order_ref.trim())),
  ];
  return nodes.filter((node): node is LeadMilestone => node !== null);
}

import type { LeadEventRow } from "./types";

/** The fields every Today row and lead row already carry (D1 mini rail). */
export interface RailRow {
  created_at: string;
  first_touch_at: string | null;
  next_touch_at: string | null;
  converted_order_ref: string | null;
}
export type RailKind = "created" | "outreach" | "next_action" | "converted";

/** Four nodes from the row itself — no extra query per card. A next touch
 *  counts only after a first contact: new leads carry an SLA next touch. */
export function railFromRow(row: RailRow): { kind: RailKind; reached: boolean }[] {
  return [
    { kind: "created", reached: true },
    { kind: "outreach", reached: Boolean(row.first_touch_at) },
    { kind: "next_action", reached: Boolean(row.first_touch_at && row.next_touch_at) },
    { kind: "converted", reached: Boolean(row.converted_order_ref) },
  ];
}

export interface FlowRow extends RailRow {
  status: string;
}

/** The Today flow (D1 hero): each open lead once, at its furthest node; a
 *  verified order lands in the last node whatever its status says. Lost and
 *  closed-without-order leads have left the path and are not counted. */
export function flowCounts(rows: FlowRow[]): Record<RailKind, number> {
  const counts: Record<RailKind, number> = { created: 0, outreach: 0, next_action: 0, converted: 0 };
  for (const row of rows) {
    if (row.converted_order_ref) counts.converted += 1;
    else if (row.status === "new" || row.status === "working") {
      counts[railFromRow(row).filter((node) => node.reached).at(-1)!.kind] += 1;
    }
  }
  return counts;
}

export type MilestoneKind ="created" | "outreach" | "answered" | "next_action" | "converted";
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

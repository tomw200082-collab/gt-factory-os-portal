// The business's next action, from state the session already reads (design §2 F4).
//
// The org payload has no next-action field, so this is derived, never invented:
// the open tasks tied to the org or to one of its leads, and the promised next
// touch of its open leads. The earliest wins. Nothing open means null.

import type { SalesLeadRow, SalesTaskRow } from "./types";

export interface NextAction {
  source: "task" | "touch";
  taskId: string | null;
  title: string;
  why: string;
  dueAt: string;
  overdue: boolean;
  leadId: string | null;
  leadName: string | null;
}

const OPEN_LEAD = new Set(["new", "working"]);

export function nextActionFor(
  orgId: string,
  tasks: SalesTaskRow[],
  leads: SalesLeadRow[],
  now: Date = new Date(),
): NextAction | null {
  const orgLeads = leads.filter((l) => l.org_id === orgId);
  const leadIds = new Set(orgLeads.map((l) => l.id));
  const nameOf = (id: string | null) => orgLeads.find((l) => l.id === id)?.contact_name ?? null;

  const candidates: NextAction[] = [];

  for (const t of tasks) {
    if (t.status !== "open") continue;
    if (t.org_id !== orgId && !(t.lead_id && leadIds.has(t.lead_id))) continue;
    candidates.push({
      source: "task",
      taskId: t.id,
      title: t.title,
      why: t.reason,
      dueAt: t.due_at,
      overdue: Date.parse(t.due_at) < now.getTime(),
      leadId: t.lead_id,
      leadName: nameOf(t.lead_id) ?? t.lead_context?.contact_name ?? null,
    });
  }

  for (const l of orgLeads) {
    if (!OPEN_LEAD.has(l.status) || !l.next_touch_at) continue;
    candidates.push({
      source: "touch",
      taskId: null,
      title: l.contact_name ?? l.org_name,
      why: "",
      dueAt: l.next_touch_at,
      overdue: Date.parse(l.next_touch_at) < now.getTime(),
      leadId: l.id,
      leadName: l.contact_name,
    });
  }

  if (candidates.length === 0) return null;
  // Earliest first; on a tie a task beats a bare promise, because it says why.
  candidates.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || (a.source === "task" ? -1 : 1));
  return candidates[0];
}

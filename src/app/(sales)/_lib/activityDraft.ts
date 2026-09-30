// A draft belongs to one signed-in salesperson and one lead in this tab.
// Saving is local until the agent explicitly submits the complete activity.
export interface ActivityDraft {
  request_id: string;
  note: string;
  kind: "" | "call" | "whatsapp" | "email" | "other" | "wait_review";
  due_at: string;
  result: "answered_progressing" | "no_answer" | "whatsapp_sent" | "email_sent";
  channel: "" | "call" | "whatsapp" | "email";
  attempted?: string;
}

function key(email: string, leadId: string): string {
  return `gt.sales.activity:${encodeURIComponent(email.trim().toLowerCase())}:${encodeURIComponent(leadId)}`;
}

function empty(): ActivityDraft {
  return { request_id: crypto.randomUUID(), note: "", kind: "", due_at: "", result: "answered_progressing", channel: "" };
}

function fields(draft: ActivityDraft): string {
  return JSON.stringify([draft.note.trim(), draft.kind, draft.due_at, draft.result, draft.channel]);
}

export function readActivityDraft(email: string, leadId: string): ActivityDraft {
  if (!email || !leadId || typeof window === "undefined") return empty();
  try {
    const saved = window.sessionStorage.getItem(key(email, leadId));
    if (saved) {
      const value = JSON.parse(saved) as ActivityDraft;
      if (typeof value.request_id === "string" && typeof value.note === "string" &&
          typeof value.kind === "string" && typeof value.due_at === "string") return value;
    }
  } catch { /* Restricted storage: the live form still works. */ }
  return empty();
}

export function saveActivityDraft(email: string, leadId: string, draft: ActivityDraft): ActivityDraft {
  const next = draft.attempted && draft.attempted !== fields(draft)
    ? { ...draft, request_id: crypto.randomUUID(), attempted: undefined } : draft;
  if (email && leadId && typeof window !== "undefined") {
    try { window.sessionStorage.setItem(key(email, leadId), JSON.stringify(next)); } catch { /* live form only */ }
  }
  return next;
}

/** A timeout retries the same input and ID; changing the input gets a fresh ID. */
export function markActivityAttempt(email: string, leadId: string, draft: ActivityDraft): ActivityDraft {
  const current = saveActivityDraft(email, leadId, draft);
  return saveActivityDraft(email, leadId, { ...current, attempted: fields(current) });
}

export function clearActivityDraft(email: string, leadId: string): void {
  if (!email || !leadId || typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(key(email, leadId)); } catch { /* restricted storage */ }
}

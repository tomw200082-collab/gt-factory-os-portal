// Quick WhatsApp messages by situation (tranche 203, Sales-Machine D-042).
//
// The server picks the situation (`conversation.suggested_situation`, computed in
// gt-factory-os api/src/sales/conversation.ts) and holds the texts
// (app_setting whatsapp_quick_messages) and the sender's signer. This file only fills
// the variables and builds the line a rep reads. Nothing here sends anything: the button
// opens wa.me in the rep's own WhatsApp.

import { fillTemplate, templateFor } from "./wa";
import { AUTO_KIND_LABELS, UI } from "./labels";
import { fmtDateTime } from "./format";
import type { LeadConversation, QuickSituation, SalesSettings, Situation } from "./types";

export const QUICK_SITUATIONS: QuickSituation[] = [
  "returning_customer",
  "tapped_order_no_order",
  "asked_more",
  "no_answer",
  "menu_no_reply",
  "no_auto",
];

/** The variables a quick message may carry. Latin tokens, kept out of UI on purpose. */
export const QUICK_VARIABLES = ["{{name}}", "{{rep}}", "{{business}}", "{{menu}}"] as const;

export interface QuickVars {
  name: string | null;
  rep: string;
  business: string | null;
  menu: string | null;
}

/** Same rules as the server's fillQuickMessage: a missing name leaves a clean greeting,
 *  a missing menu reads "התפריט". */
export function fillQuickMessage(template: string, v: QuickVars): string {
  const value: Record<string, string> = {
    name: v.name?.trim() ?? "",
    rep: v.rep.trim(),
    business: v.business?.trim() ?? "",
    menu: v.menu?.trim() || "התפריט",
  };
  return template
    .replace(/\{\{\s*(name|rep|business|menu)\s*\}\}/g, (_, k: string) => value[k])
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

/** A first name a message can open with: the first word of the name the lead gave. */
export function firstName(contactName: string | null | undefined): string | null {
  const w = (contactName ?? "").trim().split(/\s+/)[0] ?? "";
  return w.length >= 2 ? w : null;
}

export interface QuickLead {
  contact_name: string | null;
  org_name: string;
  is_existing_customer: boolean;
  conversation?: LeadConversation | null;
}

/** The server's suggestion; without one (an older API), the same first two rules. */
export function suggestedSituation(lead: QuickLead): Situation {
  if (lead.conversation?.suggested_situation) return lead.conversation.suggested_situation;
  return lead.is_existing_customer ? "returning_customer" : "no_auto";
}

export function isOptedOut(lead: QuickLead): boolean {
  return lead.conversation?.opted_out === true;
}

/**
 * The text the WhatsApp button opens with. The signer is the session's (the person
 * sending), never a fixed name. Only an API that has no quick messages yet falls back to
 * the old three templates, exactly as before.
 */
export function quickMessageFor(lead: QuickLead, settings: SalesSettings | null | undefined, situation: QuickSituation): string {
  if (!settings) return "";
  const messages = settings.whatsapp_quick_messages;
  if (!messages) {
    return fillTemplate(
      templateFor(settings.whatsapp_templates, { isExistingCustomer: lead.is_existing_customer, alreadyTouched: false }),
      lead.contact_name ?? lead.org_name,
    );
  }
  return fillQuickMessage(messages[situation] ?? "", {
    name: firstName(lead.contact_name),
    rep: settings.quick_message_signer ?? "",
    business: lead.org_name,
    menu: lead.conversation?.menu_label ?? null,
  });
}

const CLOCK = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jerusalem" });
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

/** 10:42 today, or a date and time on another day (Israel time). */
export function fmtWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return DAY.format(d) === DAY.format(now) ? CLOCK.format(d) : fmtDateTime(iso);
}

/** What an automatic message was, as a rep reads it: a first menu shows its menu. */
export function autoKindLabel(kind: string, menuLabel: string | null): string {
  if (kind === "first_menu" && menuLabel) return menuLabel;
  return AUTO_KIND_LABELS[kind] ?? AUTO_KIND_LABELS.wake;
}

/** "נקרא 10:42" / "נמסר 10:41" / "לא נמסר", or null when the status is not known. */
export function autoStatus(a: { delivered_at: string | null; read_at: string | null; failed: boolean }, now: Date = new Date()): string | null {
  if (a.read_at) return UI.autoRead(fmtWhen(a.read_at, now));
  if (a.delivered_at) return UI.autoDelivered(fmtWhen(a.delivered_at, now));
  if (a.failed) return UI.autoFailed;
  return null;
}

/** The drawer's compact line: the latest automatic message, its status, the last tap. */
export function autoSummary(c: LeadConversation | null | undefined, now: Date = new Date()): string | null {
  const last = c?.auto.at(-1);
  if (!c || !last) return null;
  const parts = [`${UI.autoSentPrefix} ${autoKindLabel(last.kind, c.menu_label)}`];
  const status = autoStatus(last, now);
  if (status) parts.push(status);
  const tap = c.taps.at(-1);
  if (tap?.title) parts.push(UI.autoTapped(tap.title));
  return parts.join(" · ");
}

/** A chip inserted at the cursor (replacing a selection); where the cursor lands after it. */
export function insertAtCursor(text: string, start: number, end: number, token: string): { text: string; cursor: number } {
  const a = Math.max(0, Math.min(start, text.length));
  const b = Math.max(a, Math.min(end, text.length));
  return { text: text.slice(0, a) + token + text.slice(b), cursor: a + token.length };
}

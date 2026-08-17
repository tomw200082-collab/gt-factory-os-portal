// Outbound link builders.
//
// Nothing here sends anything. Each returns a URL the user taps, which hands
// off to the phone's own dialler or WhatsApp with a message already typed —
// the send is always a human action. SALES_CUSTOMER_OUTREACH_WRITE_ENABLED
// stays false and no code path in this workspace contacts a lead directly.

import type { ShopifySnapshot, WhatsappTemplates } from "./types";

/** Replaces {{name}}; unknown placeholders are left visible rather than blanked. */
export function fillTemplate(template: string, name: string | null | undefined): string {
  return template.replace(/\{\{\s*name\s*\}\}/g, name?.trim() || "");
}

export function telHref(e164: string | null | undefined): string | null {
  if (!e164) return null;
  return `tel:${e164}`;
}

export function mailtoHref(email: string | null | undefined): string | null {
  if (!email) return null;
  return `mailto:${email}`;
}

/** wa.me wants bare digits — no plus, no separators. */
export function waHref(e164: string | null | undefined, text: string): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  if (!digits) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

/**
 * Which template a card should open with. A returning customer gets the warmer
 * one; a lead already in progress gets the reminder.
 */
export function templateFor(
  templates: WhatsappTemplates,
  opts: { isExistingCustomer?: boolean; alreadyTouched?: boolean },
): string {
  if (opts.isExistingCustomer) return templates.returning_customer;
  if (opts.alreadyTouched) return templates.reminder;
  return templates.new_lead;
}

/**
 * The snapshot rendered as label/value pairs, in the order they help a call:
 * how they are doing, what they were worth, how long since they last bought.
 *
 * Only keys actually present are returned. A snapshot is dated evidence, so a
 * missing figure stays missing — the UI never fills one in.
 */
export function snapshotFacts(
  snapshot: ShopifySnapshot | null | undefined,
): Array<{ key: keyof ShopifySnapshot; value: string }> {
  if (!snapshot) return [];
  const order: Array<keyof ShopifySnapshot> = [
    "status",
    "rev12",
    "orders",
    "days_since_last_order",
  ];
  return order
    .filter((key) => {
      const value = snapshot[key];
      return value !== undefined && value !== null && String(value).trim() !== "";
    })
    .map((key) => ({ key, value: String(snapshot[key]) }));
}

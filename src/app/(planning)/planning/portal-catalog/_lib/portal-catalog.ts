// ---------------------------------------------------------------------------
// Portal catalogue — the response shapes and the small pure helpers the page
// uses (Tranche 181).
//
// The shapes are the staff-route contract of the customer-portal API
// (gt-factory-os, migration 0357); the page reads them through the proxies
// under src/app/api/portal/catalog/.
// ---------------------------------------------------------------------------

import { post } from "@/lib/api/client";
import { waHref } from "@/app/(sales)/_lib/wa";

export type Category = "tea" | "matcha" | "odk" | "acc";

export interface CatalogRow {
  key: string;
  sku: string;
  category: Category;
  /** Shopify's names; null when Shopify did not answer. */
  title: string | null;
  variant_title: string | null;
  /** Stock truth, read-only; null when the SKU is not mapped. */
  on_hand: number | null;
  available: boolean;
  back_on: string | null;
  /** The date is before today in Israel: customers no longer see it. */
  back_on_passed: boolean;
  return_note: string | null;
  alternative_sku: string | null;
  note: string | null;
  changed_by: string | null;
  changed_at: string | null;
  /** The first change of the current "not available" run. */
  unavailable_since: string | null;
  /** Open "tell me when it is back" requests. */
  waiting: number;
  /** Newest first. */
  history: Change[];
}

export interface RestockRequest {
  id: string;
  display_name: string | null;
  branch: string | null;
  wa_phone: string;
}

/** A change is always the whole row: `back_on` YYYY-MM-DD as typed, `return_note` customer-visible (one line,
 *  at most {@link NOTE_MAX} characters), `note` internal. */
export type Availability = Pick<CatalogRow, "available" | "back_on" | "return_note" | "alternative_sku" | "note">;

/** One planner change, as stored (every change is its own row). */
export type Change = Availability & { changed_by: string; changed_at: string };

export const NOTE_MAX = 25;

/** The three one-tap messages (Tom, 2026-09-26; gt-factory-os gate record §5.4 U-06). */
export const PRESETS = ["חוזר בשבוע הבא", "בייצור, חוזר בקרוב", "בדרך מהספק, חוזר בקרוב"] as const;

/** The text a person sends when the product is back (gate record §5.4 U-11). */
export const RESTOCK_TEXT = "היי 🙂 {product} חזר למלאי ואפשר להזמין שוב בפורטל.";

export const bodyOf = (r: Availability): Availability => ({
  available: r.available,
  back_on: r.back_on,
  return_note: r.return_note,
  alternative_sku: r.alternative_sku,
  note: r.note,
});

/** Shopify's name, e.g. `DETOX 1000ml`; the SKU when Shopify did not answer. */
export function productName(r: Pick<CatalogRow, "sku" | "title" | "variant_title">): string {
  return [r.title ?? r.sku, r.variant_title].filter(Boolean).join(" ");
}

export const GROUPS: ReadonlyArray<[Category, string]> = [
  ["tea", "Tea concentrates"],
  ["matcha", "Matcha and powders"],
  ["odk", "Fruit purées"],
  ["acc", "Accessories"],
];

/**
 * The customer page's order (the API already lists teas as 1 L / 500 ml pairs).
 * A product that is available again while customers still wait leaves its group
 * for `back`, shown first, until every request is marked notified.
 */
export function groupRows(rows: CatalogRow[]) {
  const back = rows.filter((r) => r.available && r.waiting > 0);
  const groups = GROUPS.map(([category, label]) => ({
    category,
    label,
    rows: rows.filter((r) => r.category === category && !back.includes(r)),
  })).filter((g) => g.rows.length > 0);
  return { back, groups };
}

/** The other size of a tea; undefined for anything else. */
export function sibling(row: CatalogRow, rows: CatalogRow[]): CatalogRow | undefined {
  if (row.category !== "tea") return undefined;
  const [id, size] = row.key.split(":");
  return rows.find((r) => r.key === `${id}:${size === "1l" ? "05" : "1l"}`);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Not available since today" / "… for 1 day" / "… for N days", by calendar days. */
export function unavailableFor(since: string, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(since))) / 86_400_000);
  return days < 1 ? "Not available since today" : `Not available for ${days} day${days === 1 ? "" : "s"}`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** `2026-10-02` → `2 Oct 2026` (the typed day, never shifted by a time zone). */
export function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : DAY.format(d);
}

/** wa.me with the approved text typed (null without a phone); a person presses send. */
export function restockWaLink(phone: string, product: string): string | null {
  return waHref(phone, RESTOCK_TEXT.replace("{product}", product));
}

/** What a row says when the server refuses a change or a Mark notified. The API's `{ error }` arrives as `reason_code`. */
export function failureMessage({ status, reason_code }: { status: number; reason_code?: string }): string {
  if (status === 0) return "Could not reach the server. Check your connection and try again.";
  if (status === 403) return "Only a planner or an admin can change the portal catalogue.";
  if (status === 404) return "This is no longer there. Refresh the page.";
  if (status === 422) return `The change was not accepted${reason_code ? `: ${reason_code}` : "."}`;
  return `Could not save (HTTP ${status}). Try again.`;
}

/** POST through the shared client; a refusal or a network failure throws with {@link failureMessage}. */
export async function postCatalog(url: string, body: unknown): Promise<void> {
  const res = await post<unknown>(url, body);
  if (!res.ok) throw new Error(failureMessage(res));
}

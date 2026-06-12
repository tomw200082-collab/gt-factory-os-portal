// ---------------------------------------------------------------------------
// Bulk Count — pure domain helpers.
//
// Everything here is React-free so it can be unit tested directly
// (bulk-count.test.ts). The page component owns all state and IO; this
// module owns row shaping, filtering, sorting, sectioning, progress math,
// and the per-day localStorage persistence format.
//
// Data source contract: rows come from GET /api/stock (?item_type=FG and
// ?item_type=RM_PKG) — the same read model /inventory consumes. The bulk
// count surface deliberately NEVER reads calculated_on_hand / on_hand_*
// fields off those rows: the blind-count invariant (UI never renders an
// expected quantity) applies to this page exactly as it does to
// /stock/physical-count.
// ---------------------------------------------------------------------------

import { NO_GROUP } from "@/lib/taxonomy/groups";
import { UOMS, type Uom } from "@/lib/contracts/enums";

export type BulkItemType = "FG" | "RM" | "PKG";

/** Minimal /api/stock row shape this surface consumes. No on-hand fields —
 *  the blind-count invariant forbids rendering them, so we never model them. */
export interface BulkStockRow {
  item_type: string;
  item_id: string;
  display_name: string | null;
  base_uom: string | null;
  last_event_at: string | null;
  never_counted?: boolean;
  product_group_key?: string | null;
  material_group_key?: string | null;
  used_by_product_groups?: string[] | null;
}

/** Vocabulary namespace — FG rows classify against product groups ("pg"),
 *  RM/PKG rows against material groups ("mg"). Section keys are namespaced
 *  `${vocab}:${group_key}` so a product-group key can never collide with an
 *  identically named material-group key. */
export type GroupVocab = "pg" | "mg";

export interface BulkCountRow {
  /** Stable row key: `${item_type}:${item_id}` (matches valueMap keys on /inventory). */
  key: string;
  item_type: BulkItemType;
  item_id: string;
  name: string;
  default_uom: Uom;
  vocab: GroupVocab;
  /** Curated group key, or the NO_GROUP sentinel. */
  group_key: string;
  /** Namespaced section key: `${vocab}:${group_key}`. */
  section_key: string;
  /** Product-group keys whose active BOMs consume this component (RM/PKG only). */
  used_by: string[];
  last_event_at: string | null;
  never_counted: boolean;
}

export function toUom(raw: string | null | undefined): Uom {
  if (raw && (UOMS as readonly string[]).includes(raw)) return raw as Uom;
  return "UNIT";
}

/** Shape a raw stock row into a BulkCountRow. Returns null for item types
 *  the physical-count API does not accept. */
export function toBulkRow(row: BulkStockRow): BulkCountRow | null {
  if (row.item_type !== "FG" && row.item_type !== "RM" && row.item_type !== "PKG") {
    return null;
  }
  const item_type = row.item_type as BulkItemType;
  const vocab: GroupVocab = item_type === "FG" ? "pg" : "mg";
  const group_key =
    (item_type === "FG" ? row.product_group_key : row.material_group_key) ??
    NO_GROUP;
  return {
    key: `${item_type}:${row.item_id}`,
    item_type,
    item_id: row.item_id,
    name: row.display_name ?? row.item_id,
    default_uom: toUom(row.base_uom),
    vocab,
    group_key,
    section_key: `${vocab}:${group_key}`,
    used_by: row.used_by_product_groups ?? [],
    last_event_at: row.last_event_at,
    never_counted: row.never_counted ?? false,
  };
}

// ---------------------------------------------------------------------------
// Counted-this-session bookkeeping
// ---------------------------------------------------------------------------

export interface CountedEntry {
  qty: number;
  unit: string;
  /** "posted" — anchor replaced (auto or via approval). "pending" — held for
   *  planner approval (stock unchanged until approved). "rejected" — planner
   *  refused the count; the previous anchor stands and the item should be
   *  recounted. */
  status: "posted" | "pending" | "rejected";
  submission_id?: string;
  /** Server-computed delta string (e.g. "+5.00") when returned. */
  delta?: string;
  /** ISO timestamp of the submission. */
  at: string;
}

export type CountedMap = Record<string, CountedEntry>;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const STALE_DAYS = 14;

export function isStale(
  lastEventAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!lastEventAt) return false; // never-counted has its own filter
  const t = new Date(lastEventAt).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

export interface BulkFilters {
  search: string;
  /** "" = all types. */
  type: "" | BulkItemType;
  /** Selected product-group keys (raw, not namespaced; may include NO_GROUP). */
  productGroups: string[];
  /** Selected material-group keys (raw, not namespaced; may include NO_GROUP). */
  materialGroups: string[];
  /** RM/PKG rows: keep only components consumed by this product line ("" = off). */
  usedBy: string;
  /** "" = everything · "remaining" = not yet counted this session ·
   *  "counted" = counted this session. */
  view: "" | "remaining" | "counted";
  /** Keep only items that have never had any ledger event. */
  neverCountedOnly: boolean;
  /** Keep only items whose last movement is ≥ STALE_DAYS old. */
  staleOnly: boolean;
}

export const EMPTY_FILTERS: BulkFilters = {
  search: "",
  type: "",
  productGroups: [],
  materialGroups: [],
  usedBy: "",
  view: "",
  neverCountedOnly: false,
  staleOnly: false,
};

export function anyFilterActive(f: BulkFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.type !== "" ||
    f.productGroups.length > 0 ||
    f.materialGroups.length > 0 ||
    f.usedBy !== "" ||
    f.view !== "" ||
    f.neverCountedOnly ||
    f.staleOnly
  );
}

/**
 * Group-selection semantics: the two chip rows form ONE selection. While
 * anything is selected, a row passes only if its own vocabulary's selection
 * contains its group key. Selecting only material groups therefore hides all
 * FG rows ("show me just these shelves"), and vice versa.
 */
export function rowMatches(
  row: BulkCountRow,
  f: BulkFilters,
  counted: CountedMap,
  nowMs: number = Date.now(),
): boolean {
  if (f.type && row.item_type !== f.type) return false;

  const anyGroupSelected =
    f.productGroups.length > 0 || f.materialGroups.length > 0;
  if (anyGroupSelected) {
    const sel = row.vocab === "pg" ? f.productGroups : f.materialGroups;
    if (!sel.includes(row.group_key)) return false;
  }

  if (f.usedBy) {
    if (row.vocab !== "mg") return false;
    if (!row.used_by.includes(f.usedBy)) return false;
  }

  // A rejected count means the item still needs a recount — it stays in
  // "remaining" and out of "counted".
  const entry = counted[row.key];
  const isDone = entry !== undefined && entry.status !== "rejected";
  if (f.view === "remaining" && isDone) return false;
  if (f.view === "counted" && !isDone) return false;

  if (f.neverCountedOnly && !row.never_counted) return false;
  if (f.staleOnly && !isStale(row.last_event_at, nowMs)) return false;

  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = `${row.item_id} ${row.name}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sorting + sectioning
// ---------------------------------------------------------------------------

export type BulkSortKey = "name" | "sku" | "oldest";

export function compareRows(
  a: BulkCountRow,
  b: BulkCountRow,
  key: BulkSortKey,
): number {
  const byName = a.name.localeCompare(b.name);
  switch (key) {
    case "sku": {
      const d = a.item_id.localeCompare(b.item_id);
      return d !== 0 ? d : byName;
    }
    case "oldest": {
      // Items with no movement at all float to the top — they need a count
      // most. Then oldest movement first.
      const at = a.last_event_at ? new Date(a.last_event_at).getTime() : -1;
      const bt = b.last_event_at ? new Date(b.last_event_at).getTime() : -1;
      if (at !== bt) return at - bt;
      return byName;
    }
    case "name":
    default:
      return byName;
  }
}

export interface BulkSection {
  /** Namespaced section key (`${vocab}:${group_key}`). */
  key: string;
  vocab: GroupVocab;
  group_key: string;
  rows: BulkCountRow[];
}

/**
 * Bucket rows into group sections and order them for the factory walk:
 * section order comes from `orderOf(section_key)` (caller maps the curated
 * vocabulary display_order; NO_GROUP buckets go last), rows inside each
 * section follow `sort`.
 */
export function buildSections(
  rows: readonly BulkCountRow[],
  orderOf: (sectionKey: string) => number,
  sort: BulkSortKey,
): BulkSection[] {
  const map = new Map<string, BulkSection>();
  for (const r of rows) {
    const existing = map.get(r.section_key);
    if (existing) existing.rows.push(r);
    else {
      map.set(r.section_key, {
        key: r.section_key,
        vocab: r.vocab,
        group_key: r.group_key,
        rows: [r],
      });
    }
  }
  const sections = Array.from(map.values());
  for (const s of sections) s.rows.sort((a, b) => compareRows(a, b, sort));
  sections.sort((a, b) => orderOf(a.key) - orderOf(b.key));
  return sections;
}

export function progressOf(
  rows: readonly BulkCountRow[],
  counted: CountedMap,
): { done: number; total: number } {
  let done = 0;
  for (const r of rows) {
    const e = counted[r.key];
    // Rejected counts still need a recount — not done.
    if (e && e.status !== "rejected") done += 1;
  }
  return { done, total: rows.length };
}

// ---------------------------------------------------------------------------
// Per-day persistence — survive a refresh / accidental tab close mid-walk.
//
// Counts themselves are already safe in the ledger the moment they post;
// this only persists the LOCAL "already ticked off" markers so the operator
// does not re-count items after a reload. Keyed per calendar day so
// yesterday's session never bleeds into today's count.
// ---------------------------------------------------------------------------

export const STORAGE_PREFIX = "gt-bulk-count:v1:";

export function storageKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${STORAGE_PREFIX}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseStored(raw: string | null): CountedMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: CountedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as Partial<CountedEntry>;
      if (
        typeof e.qty !== "number" ||
        typeof e.unit !== "string" ||
        (e.status !== "posted" && e.status !== "pending" && e.status !== "rejected") ||
        typeof e.at !== "string"
      ) {
        continue;
      }
      out[k] = {
        qty: e.qty,
        unit: e.unit,
        status: e.status,
        at: e.at,
        ...(typeof e.submission_id === "string"
          ? { submission_id: e.submission_id }
          : {}),
        ...(typeof e.delta === "string" ? { delta: e.delta } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

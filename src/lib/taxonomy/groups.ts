"use client";

// ---------------------------------------------------------------------------
// Groups v1 taxonomy — shared module (Tranche 044).
//
// TypeScript mirrors of the backend Groups v1 read contract
// (gt-factory-os api/src/groups/schemas.ts, migrations 0231-0233) plus the
// portal-side helpers every group-aware surface shares:
//
//   - ProductGroup / MaterialGroup row types (verbatim field names)
//   - useGroups() — TanStack Query hook for GET /api/groups (~5min stale)
//   - groupLabel() — operator-facing Hebrew label with English fallback
//   - groupTone() — color_token → Badge tone mapping (exact BadgeTone names)
//   - NO_GROUP sentinel + label — rows with a null group key bucket here
//     honestly; they are never silently folded into another category
//   - stockRowGroupKey() — row → group-key classifier extracted from the
//     /inventory page so it is unit-testable (FG rows key on
//     product_group_key; RM/PKG rows key on material_group_key)
//
// All helpers below useGroups() are pure (no React) so they can be unit
// tested directly.
// ---------------------------------------------------------------------------

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { BadgeTone } from "@/components/ui/Badge";

// ---------------------------------------------------------------------------
// Types — mirror api/src/groups/schemas.ts verbatim. Do not invent fields.
// ---------------------------------------------------------------------------

export interface ProductGroup {
  key: string;
  name_en: string;
  name_he: string;
  display_order: number;
  color_token: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialGroup extends ProductGroup {
  /** Hint of the expected components.component_class of members
   *  (INGREDIENT / PACKAGING / PROCESS_SUPPLY). Informational only. */
  component_class_hint: string | null;
}

export interface GroupsResponse {
  product_groups: ProductGroup[];
  material_groups: MaterialGroup[];
}

/** Minimal shape every helper needs — both group kinds satisfy it. */
export interface GroupLike {
  key: string;
  name_en: string;
  name_he: string;
  color_token?: string;
}

// ---------------------------------------------------------------------------
// NO_GROUP sentinel — the honest bucket for unassigned rows.
// ---------------------------------------------------------------------------

/** Sentinel key for rows whose group key is null. Never a real DB key
 *  (real keys are lower_snake [a-z0-9_]+; the double underscore prefix is
 *  outside that namespace). */
export const NO_GROUP = "__no_group__" as const;

/** Operator-facing label for the NO_GROUP bucket. */
export const NO_GROUP_LABEL = "ללא קבוצה";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Operator-facing label for a group: name_he first (these are Hebrew
 * operator labels per the tranche contract), falling back to name_en,
 * then the raw key.
 */
export function groupLabel(g: GroupLike | null | undefined): string {
  if (!g) return NO_GROUP_LABEL;
  const he = g.name_he?.trim();
  if (he) return he;
  const en = g.name_en?.trim();
  if (en) return en;
  return g.key;
}

/**
 * Map a backend color_token onto the Badge tone vocabulary
 * (src/components/ui/Badge.tsx BadgeTone). The six curated tokens map
 * 1:1; anything unknown degrades to "neutral" rather than throwing.
 */
export function groupTone(colorToken: string | null | undefined): BadgeTone {
  switch (colorToken) {
    case "accent":
      return "accent";
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "info":
      return "info";
    case "danger":
      return "danger";
    case "neutral":
      return "neutral";
    default:
      return "neutral";
  }
}

/** The six curated color tokens offered by the /admin/groups create form. */
export const GROUP_COLOR_TOKENS = [
  "accent",
  "success",
  "warning",
  "info",
  "danger",
  "neutral",
] as const;

/** Minimal stock-row shape the classifier needs (subset of /api/stock rows). */
export interface GroupableStockRow {
  item_type: string;
  product_group_key?: string | null;
  material_group_key?: string | null;
}

/**
 * Row → group-key classifier for /inventory (and any stock-row surface).
 * FG rows resolve through items.product_group_key; RM/PKG rows through
 * components.material_group_key. Null/missing keys land in the NO_GROUP
 * bucket — never silently in some other category.
 */
export function stockRowGroupKey(row: GroupableStockRow): string {
  const key =
    row.item_type === "FG" ? row.product_group_key : row.material_group_key;
  return key ?? NO_GROUP;
}

/**
 * Resolve a group key (possibly the NO_GROUP sentinel) to its operator
 * label using a key→group lookup map. Unknown keys render verbatim so a
 * group created after the vocabulary was cached still shows something real.
 */
export function groupKeyLabel(
  key: string,
  byKey: ReadonlyMap<string, GroupLike>,
): string {
  if (key === NO_GROUP) return NO_GROUP_LABEL;
  const g = byKey.get(key);
  return g ? groupLabel(g) : key;
}

/** Build a key→group map from any group list. */
export function groupsByKey<T extends GroupLike>(
  groups: readonly T[] | undefined,
): Map<string, T> {
  const m = new Map<string, T>();
  for (const g of groups ?? []) m.set(g.key, g);
  return m;
}

// ---------------------------------------------------------------------------
// useGroups — TanStack hook for the shared vocabulary.
// ---------------------------------------------------------------------------

async function fetchGroups(): Promise<GroupsResponse> {
  const res = await fetch("/api/groups", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GROUPS_FETCH_${res.status}`);
  return (await res.json()) as GroupsResponse;
}

const GROUPS_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Shared group-vocabulary hook. The vocabulary changes rarely (admin-curated)
 * so a ~5min staleTime keeps every group-aware surface from re-fetching on
 * each mount. Mutating surfaces invalidate ["groups"] after writes.
 */
export function useGroups(): UseQueryResult<GroupsResponse> {
  return useQuery({
    queryKey: ["groups"] as const,
    queryFn: fetchGroups,
    staleTime: GROUPS_STALE_TIME_MS,
  });
}

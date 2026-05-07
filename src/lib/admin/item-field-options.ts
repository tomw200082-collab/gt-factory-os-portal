// ---------------------------------------------------------------------------
// Item-field option sets for the canonical product 360 surface.
//
// Some item fields are server-enforced enums (sales_uom is a FK to
// private_core.uom; supply_method is a CHECK constraint). Others are stored
// as free text in the database (family, product_group, item_type, pack_size)
// because the operational vocabulary co-evolves with the product line. To
// give Tom the consistency he asked for without a migration, we derive the
// option set from the existing items list at render time. That has three
// nice properties:
//
//   1. The dropdown always reflects the *current* operational vocabulary;
//      no hand-maintained allow-list to drift out of sync.
//   2. Counts surface "used by N items" so curators see which buckets are
//      load-bearing and which are typo orphans they should normalize away.
//   3. Admins can still curate via the +Add escape hatch in
//      <InlineEditSelectCell allowAdHoc>. Operators / planners cannot.
//
// When (later) a server-side enum table is introduced for any of these
// fields, swap the derivation here for a fetch and keep callers unchanged.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import {
  UOMS,
  SUPPLY_METHODS,
  type SupplyMethod,
} from "@/lib/contracts/enums";
import { fmtSupplyMethod } from "@/lib/display";
import type { InlineEditSelectOption } from "@/components/tables/InlineEditSelectCell";

// Minimal subset of the items row this hook depends on. We re-state it here
// so the hook is reusable across pages with different row shapes.
export interface FieldDerivationItem {
  family: string | null;
  product_group: string | null;
  item_type: string | null;
  pack_size: string | null;
  sales_uom: string | null;
  supply_method: string;
}

export interface ItemFieldOptionSets {
  family: InlineEditSelectOption[];
  product_group: InlineEditSelectOption[];
  item_type: InlineEditSelectOption[];
  pack_size: InlineEditSelectOption[];
  sales_uom: InlineEditSelectOption[];
  supply_method: InlineEditSelectOption[];
}

function distinctWithCounts(
  rows: ReadonlyArray<FieldDerivationItem>,
  pick: (r: FieldDerivationItem) => string | null,
): InlineEditSelectOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const out: InlineEditSelectOption[] = [];
  for (const [value, n] of counts) {
    out.push({
      value,
      label: value,
      meta: `used by ${n} item${n === 1 ? "" : "s"}`,
    });
  }
  out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  return out;
}

// Map a UoM code to a friendlier label. The dropdown still persists the
// canonical code; only the rendered label changes.
const UOM_LABELS: Record<string, string> = {
  KG: "Kilogram (KG)",
  L: "Liter (L)",
  UNIT: "Unit",
  G: "Gram (G)",
  MG: "Milligram (MG)",
  TON: "Metric ton",
  ML: "Milliliter (ML)",
  PCS: "Pieces (PCS)",
  BAG: "Bag",
  CASE: "Case",
  BOX: "Box",
  BOTTLE: "Bottle",
  TIN: "Tin",
};

const UOM_GROUPS: Record<string, string> = {
  KG: "Mass",
  G: "Mass",
  MG: "Mass",
  TON: "Mass",
  L: "Volume",
  ML: "Volume",
  UNIT: "Count",
  PCS: "Count",
  BAG: "Count",
  CASE: "Count",
  BOX: "Count",
  BOTTLE: "Count",
  TIN: "Count",
};

function uomOptions(rows: ReadonlyArray<FieldDerivationItem>): InlineEditSelectOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.sales_uom) continue;
    counts.set(r.sales_uom, (counts.get(r.sales_uom) ?? 0) + 1);
  }
  return UOMS.map((u) => {
    const n = counts.get(u);
    return {
      value: u,
      label: UOM_LABELS[u] ?? u,
      meta: n ? `used by ${n} item${n === 1 ? "" : "s"}` : "unused",
      group: UOM_GROUPS[u] ?? "Other",
    };
  });
}

function supplyMethodOptions(
  rows: ReadonlyArray<FieldDerivationItem>,
): InlineEditSelectOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.supply_method, (counts.get(r.supply_method) ?? 0) + 1);
  }
  return SUPPLY_METHODS.map((m: SupplyMethod) => {
    const n = counts.get(m);
    return {
      value: m,
      label: fmtSupplyMethod(m),
      meta: n ? `${n} item${n === 1 ? "" : "s"}` : "unused",
    };
  });
}

/**
 * Derive option sets for the dropdown-controlled item fields from the items
 * list. Memoized on the rows reference so callers can pass `query.data?.rows`
 * directly without recomputing on every render.
 */
export function useItemFieldOptions(
  rows: ReadonlyArray<FieldDerivationItem> | undefined,
): ItemFieldOptionSets {
  return useMemo(() => {
    const list = rows ?? [];
    return {
      family: distinctWithCounts(list, (r) => r.family),
      product_group: distinctWithCounts(list, (r) => r.product_group),
      item_type: distinctWithCounts(list, (r) => r.item_type),
      pack_size: distinctWithCounts(list, (r) => r.pack_size),
      sales_uom: uomOptions(list),
      supply_method: supplyMethodOptions(list),
    };
  }, [rows]);
}

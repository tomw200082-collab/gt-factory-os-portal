// ---------------------------------------------------------------------------
// Component-field option sets for the component detail admin surface.
//
// Strategy mirrors item-field-options.ts:
//   - component_group and category (component_class) are soft dropdowns —
//     derived from distinct values currently in use, with usage counts so
//     admins can spot typo-orphan buckets.
//   - inventory_uom / purchase_uom / bom_uom map to the UOMS enum (strict).
//     No ad-hoc UOM values are permitted; they are FKs to the uom table.
//   - criticality is a soft dropdown (operational vocabulary, not DB-enforced).
//   - component_name remains free-text.
//   - component_id, site_id, purchase_to_inv_factor, and all timestamp
//     fields are locked / display-only.
//
// When a server-side enum table is introduced for component_group or
// category, swap the derivation here for a fetch and keep callers unchanged.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { UOMS } from "@/lib/contracts/enums";
import type { InlineEditSelectOption } from "@/components/tables/InlineEditSelectCell";

// Minimal row shape this hook depends on.
export interface ComponentFieldDerivationRow {
  component_group: string | null;
  component_class: string | null;
  inventory_uom: string | null;
  criticality: string | null;
}

export interface ComponentFieldOptionSets {
  component_group: InlineEditSelectOption[];
  category: InlineEditSelectOption[];
  uom: InlineEditSelectOption[];
  criticality: InlineEditSelectOption[];
}

function distinctWithCounts(
  rows: ReadonlyArray<ComponentFieldDerivationRow>,
  pick: (r: ComponentFieldDerivationRow) => string | null,
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
      meta: `used by ${n} component${n === 1 ? "" : "s"}`,
    });
  }
  out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  return out;
}

// Map UoM codes to friendly labels — same labels as item-field-options for
// visual consistency. The dropdown persists the canonical code.
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

function uomOptions(
  rows: ReadonlyArray<ComponentFieldDerivationRow>,
): InlineEditSelectOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.inventory_uom) continue;
    counts.set(r.inventory_uom, (counts.get(r.inventory_uom) ?? 0) + 1);
  }
  return UOMS.map((u) => {
    const n = counts.get(u);
    return {
      value: u,
      label: UOM_LABELS[u] ?? u,
      meta: n ? `used by ${n} component${n === 1 ? "" : "s"}` : "unused",
      group: UOM_GROUPS[u] ?? "Other",
    };
  });
}

// Canonical criticality values. Not a DB-enforced CHECK constraint in v1,
// so we derive from existing data but also include the canonical operational
// set to ensure it is always offered.
const CANONICAL_CRITICALITIES = ["HIGH", "MEDIUM", "LOW"] as const;

function criticalityOptions(
  rows: ReadonlyArray<ComponentFieldDerivationRow>,
): InlineEditSelectOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.criticality) continue;
    const t = r.criticality.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // Seed the canonical set first, then add any extra values found in data.
  const seen = new Set<string>(CANONICAL_CRITICALITIES);
  const out: InlineEditSelectOption[] = CANONICAL_CRITICALITIES.map((c) => {
    const n = counts.get(c);
    return {
      value: c,
      label: c,
      meta: n ? `${n} component${n === 1 ? "" : "s"}` : "unused",
    };
  });
  for (const [value, n] of counts) {
    if (!seen.has(value)) {
      out.push({
        value,
        label: value,
        meta: `${n} component${n === 1 ? "" : "s"}`,
      });
      seen.add(value);
    }
  }
  return out;
}

/**
 * Derive option sets for the dropdown-controlled component fields from the
 * components list. Memoized on the rows reference.
 */
export function useComponentFieldOptions(
  rows: ReadonlyArray<ComponentFieldDerivationRow> | undefined,
): ComponentFieldOptionSets {
  return useMemo(() => {
    const list = rows ?? [];
    return {
      component_group: distinctWithCounts(list, (r) => r.component_group),
      category: distinctWithCounts(list, (r) => r.component_class),
      uom: uomOptions(list),
      criticality: criticalityOptions(list),
    };
  }, [rows]);
}

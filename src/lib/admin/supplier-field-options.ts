// ---------------------------------------------------------------------------
// Supplier-field option sets for the Supplier detail surface.
//
// Supplier-type, currency, and payment_terms are stored as free text in the
// database (no server-side enum). We derive the option set from the current
// suppliers list at render time so the dropdown always reflects the running
// operational vocabulary without a hand-maintained allow-list.
//
// lead_time_tier is a numeric field on individual supplier-items; the
// canonical lead-time tiering is rendered via LeadTimeChip (≤7d / ≤14d / >14d)
// rather than a discrete dropdown because the system stores raw day counts.
//
// When (later) a server-side enum table is introduced for any of these fields,
// swap the derivation here for a fetch and keep callers unchanged.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import type { InlineEditSelectOption } from "@/components/tables/InlineEditSelectCell";

/** Minimal row shape this hook depends on. */
export interface SupplierFieldDerivationRow {
  supplier_type: string | null;
  currency: string | null;
  payment_terms: string | null;
}

export interface SupplierFieldOptionSets {
  supplier_type: InlineEditSelectOption[];
  currency: InlineEditSelectOption[];
  payment_terms: InlineEditSelectOption[];
}

function distinctWithCounts(
  rows: ReadonlyArray<SupplierFieldDerivationRow>,
  pick: (r: SupplierFieldDerivationRow) => string | null,
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
      meta: `used by ${n} supplier${n === 1 ? "" : "s"}`,
    });
  }
  out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  return out;
}

/**
 * Derive option sets for the controlled-dropdown supplier fields from the
 * suppliers list. Memoized on the rows reference so callers can pass
 * `query.data?.rows` directly without recomputing on every render.
 */
export function useSupplierFieldOptions(
  rows: ReadonlyArray<SupplierFieldDerivationRow> | undefined,
): SupplierFieldOptionSets {
  return useMemo(() => {
    const list = rows ?? [];
    return {
      supplier_type: distinctWithCounts(list, (r) => r.supplier_type),
      currency: distinctWithCounts(list, (r) => r.currency),
      payment_terms: distinctWithCounts(list, (r) => r.payment_terms),
    };
  }, [rows]);
}

// ---------------------------------------------------------------------------
// useSupplierItemsByOrderable — Tranche 047 (D1, supplier comparison).
//
// Fetches /api/supplier-items per selected PO line (one cached query per
// orderable: ?component_id= for components, ?item_id= for BOUGHT_FINISHED
// items — the backend list endpoint requires exactly one of those filters).
//
// Returns a Map keyed by the editor's orderable key ("component:<id>" /
// "item:<id>"). A key is present in the map ONLY once its query has resolved
// successfully — callers use `has()` to distinguish "no mappings" from
// "still loading / failed", so the no-mapping warning never fires early.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ListEnvelope, SupplierItemRow } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load supplier catalog data (HTTP ${res.status}).`,
    );
  }
  return (await res.json()) as T;
}

function parseOrderableKey(
  key: string,
): { kind: "item" | "component"; id: string } | null {
  const sep = key.indexOf(":");
  if (sep <= 0) return null;
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if ((kind !== "item" && kind !== "component") || !id) return null;
  return { kind, id };
}

export interface UseSupplierItemsByOrderableResult {
  /** orderable_key → supplier_items rows. Key present only after a
   *  successful fetch (use `.has()` to gate "no mapping" warnings). */
  byOrderable: Map<string, SupplierItemRow[]>;
}

export function useSupplierItemsByOrderable(
  orderableKeys: string[],
): UseSupplierItemsByOrderableResult {
  // Unique, valid keys only — duplicate lines share one query.
  const uniqueKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const k of orderableKeys) {
      if (k && parseOrderableKey(k)) seen.add(k);
    }
    return [...seen].sort();
  }, [orderableKeys]);

  const results = useQueries({
    queries: uniqueKeys.map((key) => {
      const parsed = parseOrderableKey(key)!;
      const param =
        parsed.kind === "component"
          ? `component_id=${encodeURIComponent(parsed.id)}`
          : `item_id=${encodeURIComponent(parsed.id)}`;
      return {
        queryKey: ["master", "supplier-items", parsed.kind, parsed.id],
        queryFn: () =>
          fetchJson<ListEnvelope<SupplierItemRow>>(
            `/api/supplier-items?${param}`,
          ),
        staleTime: 60_000,
      };
    }),
  });

  // Rebuilt each render (cheap — a handful of lines per PO). Not memoized:
  // the deps would be a variable-length list of query results, which React's
  // useMemo contract does not allow.
  const byOrderable = new Map<string, SupplierItemRow[]>();
  uniqueKeys.forEach((key, i) => {
    const data = results[i]?.data;
    if (data) byOrderable.set(key, data.rows);
  });

  return { byOrderable };
}

// ---------------------------------------------------------------------------
// useOrderables — shared master-data hook for the PO editor.
//
// Tranche 027 (procurement-shared-line-editor): extracted from
// (po)/purchase-orders/new/page.tsx so the manual form and the planned
// procurement focus mode (T029) derive the supplier list and the unified
// orderable list (BOUGHT_FINISHED items + active components) identically.
//
// No behaviour change: same query keys, staleTime, sorting, and grouping the
// /new page used inline.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SearchableSelectOption } from "@/components/fields/SearchableSelect";
import {
  toUom,
  type ComponentRow,
  type ItemRow,
  type ListEnvelope,
  type OrderableRow,
  type SupplierRow,
} from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

export interface UseOrderablesResult {
  supplierOptions: SearchableSelectOption[];
  /** Tranche 047 (D2) — full supplier rows keyed by id, so the PO editor can
   *  read default_lead_time_days without a second suppliers fetch. */
  suppliersById: Map<string, SupplierRow>;
  orderableOptions: SearchableSelectOption[];
  orderableByKey: Map<string, OrderableRow>;
  suppliersLoading: boolean;
  itemsLoading: boolean;
  componentsLoading: boolean;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

export function useOrderables(): UseOrderablesResult {
  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["master", "suppliers", "ACTIVE"],
    queryFn: () => fetchJson("/api/suppliers?status=ACTIVE&limit=500"),
    staleTime: 60_000,
  });

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["master", "components", "ACTIVE"],
    queryFn: () => fetchJson("/api/components?status=ACTIVE&limit=1000"),
    staleTime: 60_000,
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "ACTIVE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
    staleTime: 60_000,
  });

  // Supplier options sorted alphabetically by official name.
  const supplierOptions: SearchableSelectOption[] = useMemo(() => {
    const rows = suppliersQuery.data?.rows ?? [];
    return rows
      .slice()
      .sort((a, b) =>
        a.supplier_name_official.localeCompare(b.supplier_name_official),
      )
      .map((s) => ({
        value: s.supplier_id,
        label: s.supplier_name_official,
        meta: s.supplier_id,
      }));
  }, [suppliersQuery.data]);

  const suppliersById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQuery.data?.rows ?? []) m.set(s.supplier_id, s);
    return m;
  }, [suppliersQuery.data]);

  // Unified orderable list: BOUGHT_FINISHED items + all active components,
  // grouped (Item / Component) for visual segmentation in the dropdown.
  const orderables: OrderableRow[] = useMemo(() => {
    const items = (itemsQuery.data?.rows ?? [])
      .filter((i) => i.supply_method === "BOUGHT_FINISHED")
      .map(
        (i): OrderableRow => ({
          kind: "item",
          id: i.item_id,
          label: i.item_name,
          meta: i.sku ?? i.item_id,
          default_uom: toUom(i.sales_uom),
        }),
      );
    const components = (componentsQuery.data?.rows ?? []).map(
      (c): OrderableRow => ({
        kind: "component",
        id: c.component_id,
        label: c.component_name,
        meta: c.component_id,
        default_uom: toUom(c.inventory_uom ?? c.purchase_uom ?? c.bom_uom),
      }),
    );
    return [...items, ...components].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [itemsQuery.data, componentsQuery.data]);

  const orderableOptions: SearchableSelectOption[] = useMemo(
    () =>
      orderables.map((r) => ({
        value: `${r.kind}:${r.id}`,
        label: r.label,
        meta: r.meta,
        group: r.kind === "item" ? "Finished goods" : "Components",
      })),
    [orderables],
  );

  const orderableByKey = useMemo(() => {
    const m = new Map<string, OrderableRow>();
    for (const r of orderables) m.set(`${r.kind}:${r.id}`, r);
    return m;
  }, [orderables]);

  function retry(): void {
    if (suppliersQuery.isError) void suppliersQuery.refetch();
    if (componentsQuery.isError) void componentsQuery.refetch();
    if (itemsQuery.isError) void itemsQuery.refetch();
  }

  return {
    supplierOptions,
    suppliersById,
    orderableOptions,
    orderableByKey,
    suppliersLoading: suppliersQuery.isLoading,
    itemsLoading: itemsQuery.isLoading,
    componentsLoading: componentsQuery.isLoading,
    isLoading:
      suppliersQuery.isLoading ||
      componentsQuery.isLoading ||
      itemsQuery.isLoading,
    isError:
      suppliersQuery.isError || componentsQuery.isError || itemsQuery.isError,
    retry,
  };
}

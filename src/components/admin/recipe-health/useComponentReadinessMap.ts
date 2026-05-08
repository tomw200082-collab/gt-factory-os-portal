// Per-component supplier_items fan-out hook.
// Given a list of component_ids, fires one query per unique id, projects
// each rowset into a ComponentReadiness, and exposes the result as a Map.

import { useQueries } from "@tanstack/react-query";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  supplier_name?: string | null;
  component_id: string;
  component_name?: string | null;
  component_status?: "ACTIVE" | "INACTIVE";
  is_primary: boolean;
  std_cost_per_inv_uom: string | null;
  updated_at: string | null;
}

function rowsToReadiness(
  componentId: string,
  rows: SupplierItemRow[],
): ComponentReadiness {
  const primary = rows.find((r) => r.is_primary) ?? null;
  const componentName = rows[0]?.component_name ?? componentId;
  const componentStatus: "ACTIVE" | "INACTIVE" =
    rows[0]?.component_status ?? "ACTIVE";
  return {
    component_id: componentId,
    component_name: componentName,
    component_status: componentStatus,
    primary_supplier_id: primary?.supplier_id ?? null,
    primary_supplier_name: primary?.supplier_name ?? null,
    active_price_value: primary?.std_cost_per_inv_uom ?? null,
    active_price_updated_at: primary?.updated_at ?? null,
  };
}

export interface ComponentReadinessMapResult {
  map: Map<string, ComponentReadiness>;
  isReady: boolean;
  isError: boolean;
  errorMessage: string | null;
}

export function useComponentReadinessMap(
  componentIds: string[],
): ComponentReadinessMapResult {
  const unique = Array.from(new Set(componentIds));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["supplier-items", "by-component", id],
      queryFn: async (): Promise<SupplierItemRow[]> => {
        const url = `/api/supplier-items?component_id=${encodeURIComponent(id)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `supplier-items ${id} — HTTP ${res.status}\n${body.slice(0, 200)}`,
          );
        }
        const body = await res.json();
        return (body.rows ?? []) as SupplierItemRow[];
      },
      staleTime: 30_000,
    })),
  });

  // isReady once nothing is still pending (success OR error both count as settled)
  const isReady = unique.length === 0 || results.every((r) => !r.isPending);
  const map = new Map<string, ComponentReadiness>();
  // Populate from settled queries — failed ones get a null-supplier placeholder
  // so that Fix buttons still appear and the drawer can surface the error.
  if (unique.length > 0) {
    unique.forEach((id, idx) => {
      const r = results[idx];
      if (r.isSuccess) {
        map.set(id, rowsToReadiness(id, (r.data ?? []) as SupplierItemRow[]));
      } else if (r.isError) {
        map.set(id, {
          component_id: id,
          component_name: id,
          component_status: "ACTIVE",
          primary_supplier_id: null,
          primary_supplier_name: null,
          active_price_value: null,
          active_price_updated_at: null,
        });
      }
    });
  }
  const firstError = results.find((r) => r.isError);
  return {
    map,
    isReady,
    isError: results.some((r) => r.isError),
    errorMessage:
      (firstError?.error as Error | undefined)?.message ?? null,
  };
}

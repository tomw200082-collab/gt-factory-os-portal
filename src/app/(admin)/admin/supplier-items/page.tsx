"use client";

// ---------------------------------------------------------------------------
// Admin · Supplier-items — read-only live view.
//
// Endgame Phase D1: un-quarantine against GET /api/v1/queries/supplier-items.
// Read-only v1. Admin role-gate at the layout level.
//
// The upstream endpoint requires a one-of filter (supplier_id | component_id
// | item_id). This page presents a supplier picker first (sourced from
// GET /api/suppliers) and fetches supplier-items scoped to the chosen
// supplier. Rows include is_primary flag + pack-conversion + lead days +
// MOQ, all v1-actionable planner review context.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  status: string;
}

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  component_id: string | null;
  item_id: string | null;
  relationship: string | null;
  is_primary: boolean;
  order_uom: string | null;
  inventory_uom: string | null;
  pack_conversion: string;
  lead_time_days: number | null;
  moq: string | null;
  payment_terms: string | null;
  safety_days: number;
  approval_status: string | null;
  source_basis: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

export default function AdminSupplierItemsPage(): JSX.Element {
  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", "all"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });

  const suppliers = suppliersQuery.data?.rows ?? [];
  const [supplierId, setSupplierId] = useState<string>("");
  const [query, setQuery] = useState("");

  const sortedSuppliers = useMemo(
    () =>
      [...suppliers].sort((a, b) =>
        a.supplier_name_official.localeCompare(b.supplier_name_official),
      ),
    [suppliers],
  );

  const supplierItemsQuery = useQuery<ListEnvelope<SupplierItemRow>>({
    queryKey: ["admin", "supplier-items", supplierId],
    queryFn: () => {
      const q = new URLSearchParams({
        supplier_id: supplierId,
        limit: "1000",
      });
      return fetchJson(`/api/supplier-items?${q.toString()}`);
    },
    enabled: !!supplierId,
  });

  const rows = supplierItemsQuery.data?.rows ?? [];
  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        (r.component_id ?? "").toLowerCase().includes(qLower) ||
        (r.item_id ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · read-only"
        title="Supplier items"
        description="Supplier-to-component (and supplier-to-item) mapping. Choose a supplier to view its catalog. CRUD actions ship post-launch; read-only v1."
        meta={
          <>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
      />

      <SectionCard title="Choose supplier" density="compact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Supplier
            </span>
            {suppliersQuery.isLoading ? (
              <div className="p-2 text-xs text-fg-muted">Loading suppliers…</div>
            ) : suppliersQuery.isError ? (
              <div className="p-2 text-xs text-danger-fg">
                {(suppliersQuery.error as Error).message}
              </div>
            ) : (
              <select
                className="input"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">— select —</option>
                {sortedSuppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name_official} · {s.supplier_id}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Filter (component / item id)
            </span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="client-side…"
              disabled={!supplierId}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Supplier-items"
        title={
          supplierId
            ? `Showing ${filtered.length} of ${rows.length}`
            : "Pick a supplier above to view its catalog"
        }
        contentClassName="p-0"
      >
        {!supplierId ? (
          <div className="p-5 text-sm text-fg-muted">
            No supplier chosen. The upstream endpoint requires a
            supplier/component/item filter — v1 uses the supplier pivot.
          </div>
        ) : supplierItemsQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : supplierItemsQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(supplierItemsQuery.error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No supplier-items for this supplier match filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Component / Item
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Relationship
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Order UoM
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Pack conv
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Lead days
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    MOQ
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Primary
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.supplier_item_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.component_id ?? r.item_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.relationship ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.order_uom ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                      {r.pack_conversion}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {r.lead_time_days ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                      {r.moq ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_primary ? (
                        <Badge tone="success" dotted>
                          Primary
                        </Badge>
                      ) : (
                        <span className="text-3xs text-fg-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

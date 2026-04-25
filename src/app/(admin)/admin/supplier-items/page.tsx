"use client";

// ---------------------------------------------------------------------------
// Admin · Supplier-items — AMMC v1 Slice 4.
//
// Keeps the supplier-picker-first structure from the prior read-only page
// (upstream endpoint requires one-of filter). Extensions:
//   - InlineEditCell on lead_time_days, moq, pack_conversion columns
//     (Enter saves via PATCH /api/supplier-items/:id with if_match_updated_at)
//   - is_primary radio-like toggle per row (promote this row to primary;
//     DB partial-unique index prevents conflicting primaries per
//     component_id / item_id and returns 409 UNIQUE_VIOLATION)
//   - "+ New supplier-item" button → opens <QuickCreateSupplierItem>
//     drawer prefilled with the selected supplier
//   - Readiness pill column — NOTE: list endpoint does not forward
//     include_readiness yet (deferred per A13; Slice 2 added v_supplier_item_readiness
//     but only /api/v1/queries/items/:id/readiness single-item endpoint is
//     wired in Slice 1). Column shows "—" until list-scoped endpoint lands.
//
// A13 on price: supplier_items.price does not exist as a column (see Slice 2
// checkpoint §6.1). Price is tracked via price_history. No inline-edit on
// price in this slice; surface covered by future price_history admin screen.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import {
  AdminMutationError,
  patchEntity,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  status: string;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
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
  readiness?: {
    is_ready?: boolean;
    blockers?: unknown[];
  } | null;
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
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", "all"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });
  const suppliers = suppliersQuery.data?.rows ?? [];

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const [supplierId, setSupplierId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

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

  // Single-row field update used by InlineEditCell.
  const fieldMutation = useMutation({
    mutationFn: async (args: {
      supplier_item_id: string;
      field: "lead_time_days" | "moq" | "pack_conversion";
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({
        kind: "success",
        message: `Updated ${vars.field} on row ${vars.supplier_item_id.slice(0, 8)}…`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "supplier-items"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  const promotePrimaryMutation = useMutation({
    mutationFn: async (args: {
      supplier_item_id: string;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { is_primary: true },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Promoted to primary." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "supplier-items"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Promote-primary failed: ${msg}` });
    },
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

  // Options maps for the QuickCreateSupplierItem drawer.
  const supplierOptions: EntityOption[] = useMemo(
    () =>
      suppliers.map((s) => ({
        id: s.supplier_id,
        label: s.supplier_name_official,
        sublabel: s.supplier_id,
      })),
    [suppliers],
  );
  const componentOptions: EntityOption[] = useMemo(
    () =>
      (componentsQuery.data?.rows ?? []).map((c) => ({
        id: c.component_id,
        label: c.component_name,
        sublabel: c.component_id,
      })),
    [componentsQuery.data],
  );
  const itemOptions: EntityOption[] = useMemo(
    () =>
      (itemsQuery.data?.rows ?? []).map((i) => ({
        id: i.item_id,
        label: i.item_name,
        sublabel: i.item_id,
      })),
    [itemsQuery.data],
  );

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · supplier-items"
        title="Supplier items"
        description="Map suppliers to the components and items they supply. Set lead times, MOQ, and pack sizes. Mark the primary supplier per item."
        meta={
          <>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
        actions={
          isAdmin && supplierId ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New supplier-item
            </button>
          ) : null
        }
      />

      {banner ? (
        <div
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          {banner.message}
        </div>
      ) : null}

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
              placeholder="Search items…"
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
            Select a supplier above to see their items.
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
                    Readiness
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
                      {isAdmin ? (
                        <InlineEditCell
                          value={r.pack_conversion}
                          type="number"
                          inputMode="decimal"
                          ifMatchUpdatedAt={r.updated_at}
                          onSave={async (newValue) => {
                            await fieldMutation.mutateAsync({
                              supplier_item_id: r.supplier_item_id,
                              field: "pack_conversion",
                              value: newValue,
                              updated_at: r.updated_at,
                            });
                          }}
                          ariaLabel={`Edit pack_conversion for ${
                            r.component_id ?? r.item_id ?? r.supplier_item_id
                          }`}
                        />
                      ) : (
                        r.pack_conversion
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {isAdmin ? (
                        <InlineEditCell
                          value={r.lead_time_days ?? ""}
                          type="number"
                          inputMode="numeric"
                          ifMatchUpdatedAt={r.updated_at}
                          onSave={async (newValue) => {
                            await fieldMutation.mutateAsync({
                              supplier_item_id: r.supplier_item_id,
                              field: "lead_time_days",
                              value: newValue,
                              updated_at: r.updated_at,
                            });
                          }}
                          ariaLabel={`Edit lead_time_days for ${
                            r.component_id ?? r.item_id ?? r.supplier_item_id
                          }`}
                        />
                      ) : (
                        (r.lead_time_days ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                      {isAdmin ? (
                        <InlineEditCell
                          value={r.moq ?? ""}
                          type="number"
                          inputMode="decimal"
                          ifMatchUpdatedAt={r.updated_at}
                          onSave={async (newValue) => {
                            await fieldMutation.mutateAsync({
                              supplier_item_id: r.supplier_item_id,
                              field: "moq",
                              value: newValue,
                              updated_at: r.updated_at,
                            });
                          }}
                          ariaLabel={`Edit moq for ${
                            r.component_id ?? r.item_id ?? r.supplier_item_id
                          }`}
                        />
                      ) : (
                        (r.moq ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ReadinessPill readiness={r.readiness} />
                    </td>
                    <td className="px-3 py-2">
                      {r.is_primary ? (
                        <Badge tone="success" dotted>
                          Primary
                        </Badge>
                      ) : isAdmin ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Promote this row to primary for ${
                                  r.component_id ?? r.item_id
                                }? Existing primary (if any) will be demoted.`,
                              )
                            )
                              return;
                            promotePrimaryMutation.mutate({
                              supplier_item_id: r.supplier_item_id,
                              updated_at: r.updated_at,
                            });
                          }}
                          disabled={promotePrimaryMutation.isPending}
                        >
                          Promote
                        </button>
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

      {isAdmin ? (
        <QuickCreateSupplierItem
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setBanner({
              kind: "success",
              message: "Created supplier-item. List refreshing…",
            });
            void queryClient.invalidateQueries({
              queryKey: ["admin", "supplier-items"],
            });
          }}
          suppliers={supplierOptions}
          components={componentOptions}
          items={itemOptions}
        />
      ) : null}
    </>
  );
}

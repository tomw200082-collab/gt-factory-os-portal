"use client";

// ---------------------------------------------------------------------------
// Admin · Supplier detail — AMMC v1 Slice 5.
//
// /admin/suppliers/[supplier_id]
//
// Sections:
//   - WorkflowHeader — supplier_name_official (title), supplier_id (eyebrow),
//     status badge (meta). No readiness pill — plan §E names 4 views
//     (item / component / bom_version / supplier_item); no v_supplier_readiness
//     in v1 per Slice 4 A13 §5.
//   - Overview — inline-edit scalars: name, short name, contact name/phone,
//     currency, payment_terms, default_lead_time_days, default_moq, notes.
//   - Supplier-items — list filtered by supplier_id with inline-edit (pack/
//     lead/moq) + is_primary + "+ Add supplier-item" drawer prefilled with
//     supplier_id.
//
// Read strategy (A13): single-row GET endpoint does not exist upstream. Fetch
// list (≤500 rows) and pick by id client-side.
// ---------------------------------------------------------------------------

import { useMemo, useState, use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowLeft, Power } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import {
  AdminMutationError,
  patchEntity,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
  supplier_type: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  currency: string | null;
  payment_terms: string | null;
  default_lead_time_days: number | null;
  default_moq: string | null;
  approval_status: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
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
  pack_conversion: string;
  lead_time_days: number | null;
  moq: string | null;
  approval_status: string | null;
  updated_at: string;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

interface PageProps {
  params: Promise<{ supplier_id: string }>;
}

export default function AdminSupplierDetailPage({
  params,
}: PageProps): JSX.Element {
  const { supplier_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [showCreate, setShowCreate] = useState(false);

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", "all-for-detail"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });

  const supplierItemsQuery = useQuery<ListEnvelope<SupplierItemRow>>({
    queryKey: ["admin", "supplier-items", "by-supplier", supplier_id],
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?supplier_id=${encodeURIComponent(supplier_id)}&limit=1000`,
      ),
  });

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const supplier = useMemo(() => {
    const rows = suppliersQuery.data?.rows ?? [];
    return rows.find((s) => s.supplier_id === supplier_id) ?? null;
  }, [suppliersQuery.data, supplier_id]);

  // --- Mutations ---------------------------------------------------------

  const fieldMutation = useMutation({
    mutationFn: async (args: {
      field: string;
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/suppliers/${encodeURIComponent(supplier_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/suppliers/${encodeURIComponent(supplier_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({
        kind: "success",
        message: `Status → ${vars.newStatus}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Status update failed: ${msg}` });
    },
  });

  const supplierItemFieldMutation = useMutation({
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
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "supplier-items"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Supplier-item update failed: ${msg}` });
    },
  });

  // --- Derived -----------------------------------------------------------

  const componentLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of componentsQuery.data?.rows ?? []) {
      m.set(c.component_id, c.component_name);
    }
    return m;
  }, [componentsQuery.data]);

  const itemLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of itemsQuery.data?.rows ?? []) {
      m.set(i.item_id, i.item_name);
    }
    return m;
  }, [itemsQuery.data]);

  const supplierOptions: EntityOption[] = useMemo(
    () =>
      (suppliersQuery.data?.rows ?? []).map((s) => ({
        id: s.supplier_id,
        label: s.supplier_name_official,
        sublabel: s.supplier_id,
      })),
    [suppliersQuery.data],
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

  // --- Render ------------------------------------------------------------

  if (suppliersQuery.isLoading) {
    return <div className="p-5 text-sm text-fg-muted">Loading supplier…</div>;
  }
  if (suppliersQuery.isError) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        {(suppliersQuery.error as Error).message}
      </div>
    );
  }
  if (!supplier) {
    notFound();
  }

  const ifMatch = supplier.updated_at;

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/suppliers"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          Suppliers
        </Link>
      </div>

      <WorkflowHeader
        eyebrow={`Admin · suppliers · ${supplier.supplier_id}`}
        title={supplier.supplier_name_official}
        description="Supplier detail — contact info, payment terms, and the items this supplier provides."
        meta={
          <>
            <StatusBadge status={supplier.status} />
            <Badge tone="neutral" dotted>
              {supplier.supplier_id}
            </Badge>
            {supplier.currency ? (
              <Badge tone="info" dotted>
                {supplier.currency}
              </Badge>
            ) : null}
          </>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost inline-flex items-center gap-1.5"
              onClick={() => {
                const next = supplier.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                if (!window.confirm(`Set status to ${next}?`)) return;
                setBanner(null);
                statusMutation.mutate({
                  newStatus: next,
                  updated_at: ifMatch,
                });
              }}
              disabled={statusMutation.isPending}
            >
              <Power className="h-3.5 w-3.5" strokeWidth={2} />
              {supplier.status === "ACTIVE" ? "Deactivate" : "Activate"}
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

      <SectionCard eyebrow="Overview" title="Supplier fields">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Official name">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.supplier_name_official}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "supplier_name_official",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.supplier_name_official
            )}
          </Field>
          <Field label="Short name">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.supplier_name_short ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "supplier_name_short",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.supplier_name_short ?? "—"
            )}
          </Field>
          <Field label="Contact name">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.primary_contact_name ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "primary_contact_name",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.primary_contact_name ?? "—"
            )}
          </Field>
          <Field label="Contact phone">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.primary_contact_phone ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "primary_contact_phone",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.primary_contact_phone ?? "—"
            )}
          </Field>
          <Field label="Payment terms">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.payment_terms ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "payment_terms",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.payment_terms ?? "—"
            )}
          </Field>
          <Field label="Lead time (days)">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.default_lead_time_days ?? ""}
                type="number"
                inputMode="numeric"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "default_lead_time_days",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.default_lead_time_days ?? "—"
            )}
          </Field>
          <Field label="Min order qty">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.default_moq ?? ""}
                type="number"
                inputMode="decimal"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "default_moq",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.default_moq ?? "—"
            )}
          </Field>
          <Field label="Currency">
            {isAdmin ? (
              <InlineEditCell
                value={supplier.currency ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "currency",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              supplier.currency ?? "—"
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Supplier-items"
        title={`${supplierItemsQuery.data?.rows.length ?? 0} rows for this supplier`}
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Add supplier-item
            </button>
          ) : null
        }
        contentClassName="p-0"
      >
        {supplierItemsQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : supplierItemsQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(supplierItemsQuery.error as Error).message}
          </div>
        ) : (supplierItemsQuery.data?.rows ?? []).length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No supplier-items yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>Target (component / item)</Th>
                  <Th>Relationship</Th>
                  <Th align="right">Pack conv</Th>
                  <Th align="right">Lead days</Th>
                  <Th align="right">MOQ</Th>
                  <Th>Primary</Th>
                  <Th>Approval</Th>
                </tr>
              </thead>
              <tbody>
                {(supplierItemsQuery.data?.rows ?? []).map((r) => {
                  const targetLabel = r.component_id
                    ? componentLookup.get(r.component_id) ?? r.component_id
                    : r.item_id
                      ? itemLookup.get(r.item_id) ?? r.item_id
                      : "—";
                  const targetId = r.component_id ?? r.item_id ?? "—";
                  return (
                    <tr
                      key={r.supplier_item_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{targetLabel}</div>
                        <div className="text-3xs font-mono text-fg-subtle">
                          {targetId}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {r.relationship ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                        {isAdmin ? (
                          <InlineEditCell
                            value={r.pack_conversion}
                            type="number"
                            inputMode="decimal"
                            ifMatchUpdatedAt={r.updated_at}
                            onSave={async (v) => {
                              await supplierItemFieldMutation.mutateAsync({
                                supplier_item_id: r.supplier_item_id,
                                field: "pack_conversion",
                                value: v,
                                updated_at: r.updated_at,
                              });
                            }}
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
                            onSave={async (v) => {
                              await supplierItemFieldMutation.mutateAsync({
                                supplier_item_id: r.supplier_item_id,
                                field: "lead_time_days",
                                value: v,
                                updated_at: r.updated_at,
                              });
                            }}
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
                            onSave={async (v) => {
                              await supplierItemFieldMutation.mutateAsync({
                                supplier_item_id: r.supplier_item_id,
                                field: "moq",
                                value: v,
                                updated_at: r.updated_at,
                              });
                            }}
                          />
                        ) : (
                          (r.moq ?? "—")
                        )}
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
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {r.approval_status ?? "—"}
                      </td>
                    </tr>
                  );
                })}
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
              message: "Created supplier-item.",
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 py-2">
      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <span className="text-sm text-fg">{children}</span>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

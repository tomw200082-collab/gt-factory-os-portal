"use client";

// ---------------------------------------------------------------------------
// Admin · Component detail — AMMC v1 Slice 5 (crystalline-drifting-dusk §C.2
// Entity list + detail / §D.3 readiness reads).
//
// /admin/components/[component_id]
//
// Sections:
//   - WorkflowHeader — component_name (title), component_id (eyebrow),
//     status badge + <ReadinessPill> (meta). Back link to /admin/components.
//   - <ReadinessCard> — consumes /api/components/:id/readiness
//     (v_component_readiness view, W1 canonical 0d406c8).
//   - Overview section — inline-edit scalar fields via <InlineEditCell>:
//     component_name, component_class, inventory_uom, purchase_uom, bom_uom,
//     lead_time_days, moq_purchase_uom, criticality, planning_policy_code.
//     PATCH /api/components/:id with if_match_updated_at via patchEntity().
//   - Supplier coverage section — supplier_items filtered to this component;
//     columns: supplier, price-col-N/A (v1), lead_time_days, moq, pack_conv,
//     is_primary, status. "+ Add supplier-item" opens QuickCreateSupplierItem
//     prefilled with defaultComponentId.
//   - BOM usage section — A13: no reverse-lookup endpoint (bom_lines requires
//     bom_version_id), so render a "open BOM editor to view" placeholder per
//     dispatch. Slice 6 will add reverse-lookup.
//
// Read strategy (A13): single-row GET endpoint for components does not exist
// upstream — list endpoint has no component_id filter. We fetch the list once
// (≤500 rows, cacheable via TanStack) and pick the row client-side. Readiness
// is a separate single-row endpoint.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowLeft, Power } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { ReadinessCard } from "@/components/readiness/ReadinessCard";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import {
  AdminMutationError,
  patchEntity,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { use } from "react";

interface ComponentRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  component_group: string | null;
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
  purchase_to_inv_factor: string;
  planning_policy_code: string | null;
  primary_supplier_id: string | null;
  lead_time_days: number | null;
  moq_purchase_uom: string | null;
  order_multiple_purchase_uom: string | null;
  criticality: string | null;
  planned_flag: boolean;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
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
  approval_status: string | null;
  updated_at: string;
}

interface ReadinessPayload {
  is_ready: boolean;
  readiness_summary?: string;
  blockers: Array<{
    code: string;
    label?: string;
    detail?: string;
  }>;
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
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

interface PageProps {
  params: Promise<{ component_id: string }>;
}

export default function AdminComponentDetailPage({
  params,
}: PageProps): JSX.Element {
  const { component_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [showCreate, setShowCreate] = useState(false);

  // --- Data --------------------------------------------------------------

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all-for-detail"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const readinessQuery = useQuery<ReadinessPayload>({
    queryKey: ["admin", "components", component_id, "readiness"],
    queryFn: () =>
      fetchJson(
        `/api/components/${encodeURIComponent(component_id)}/readiness`,
      ),
  });

  const supplierItemsQuery = useQuery<ListEnvelope<SupplierItemRow>>({
    queryKey: ["admin", "supplier-items", "by-component", component_id],
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?component_id=${encodeURIComponent(component_id)}&limit=1000`,
      ),
  });

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", "all"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const component = useMemo(() => {
    const rows = componentsQuery.data?.rows ?? [];
    return rows.find((c) => c.component_id === component_id) ?? null;
  }, [componentsQuery.data, component_id]);

  // --- Mutations ---------------------------------------------------------

  const fieldMutation = useMutation({
    mutationFn: async (args: {
      field: string;
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/components/${encodeURIComponent(component_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "components"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "components", component_id, "readiness"],
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

  const statusMutation = useMutation({
    mutationFn: async (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/components/${encodeURIComponent(component_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({
        kind: "success",
        message: `Status → ${vars.newStatus}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "components"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "components", component_id, "readiness"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["admin", "components", component_id, "readiness"],
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
      void queryClient.invalidateQueries({
        queryKey: ["admin", "components", component_id, "readiness"],
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

  // --- Derived data ------------------------------------------------------

  const supplierLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersQuery.data?.rows ?? []) {
      m.set(s.supplier_id, s.supplier_name_official);
    }
    return m;
  }, [suppliersQuery.data]);

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

  if (componentsQuery.isLoading) {
    return <div className="p-5 text-sm text-fg-muted">Loading component…</div>;
  }
  if (componentsQuery.isError) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        {(componentsQuery.error as Error).message}
      </div>
    );
  }
  if (!component) {
    // Missing row after load — treat as 404.
    notFound();
  }

  const ifMatch = component.updated_at;

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/components"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          Components
        </Link>
      </div>

      <WorkflowHeader
        eyebrow={`Admin · components · ${component.component_id}`}
        title={component.component_name}
        description={`Component detail — fields, supplier coverage, and BOM usage.${
          component.component_class ? ` Class: ${component.component_class}.` : ""
        }`}
        meta={
          <>
            <StatusBadge status={component.status} />
            <ReadinessPill readiness={readinessQuery.data} />
            <Badge tone="neutral" dotted>
              {component.component_id}
            </Badge>
          </>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost inline-flex items-center gap-1.5"
              onClick={() => {
                const next = component.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
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
              {component.status === "ACTIVE" ? "Deactivate" : "Activate"}
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

      {readinessQuery.data ? (
        <ReadinessCard
          entity="component"
          readiness={{
            is_ready: readinessQuery.data.is_ready,
            readiness_summary: readinessQuery.data.readiness_summary,
            blockers: (readinessQuery.data.blockers ?? []).map((b) => ({
              code: b.code,
              label: b.label ?? b.code,
              detail: b.detail,
            })),
          }}
        />
      ) : readinessQuery.isLoading ? (
        <SectionCard title="Component readiness">
          <p className="text-sm text-fg-muted">Loading readiness…</p>
        </SectionCard>
      ) : readinessQuery.isError ? (
        <SectionCard title="Component readiness" tone="warning">
          <p className="text-sm text-warning-fg">
            Could not load readiness: {(readinessQuery.error as Error).message}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard eyebrow="Overview" title="Component fields">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Name">
            {isAdmin ? (
              <InlineEditCell
                value={component.component_name}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "component_name",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.component_name
            )}
          </Field>
          <Field label="Class">
            {isAdmin ? (
              <InlineEditCell
                value={component.component_class ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "component_class",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.component_class ?? "—"
            )}
          </Field>
          <Field label="Inventory UOM">
            {isAdmin ? (
              <InlineEditCell
                value={component.inventory_uom ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "inventory_uom",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.inventory_uom ?? "—"
            )}
          </Field>
          <Field label="Purchase UOM">
            {isAdmin ? (
              <InlineEditCell
                value={component.purchase_uom ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "purchase_uom",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.purchase_uom ?? "—"
            )}
          </Field>
          <Field label="BOM UOM">
            {isAdmin ? (
              <InlineEditCell
                value={component.bom_uom ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "bom_uom",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.bom_uom ?? "—"
            )}
          </Field>
          <Field label="Lead time (days)">
            {isAdmin ? (
              <InlineEditCell
                value={component.lead_time_days ?? ""}
                type="number"
                inputMode="numeric"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "lead_time_days",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.lead_time_days ?? "—"
            )}
          </Field>
          <Field label="Min order qty">
            {isAdmin ? (
              <InlineEditCell
                value={component.moq_purchase_uom ?? ""}
                type="number"
                inputMode="decimal"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "moq_purchase_uom",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.moq_purchase_uom ?? "—"
            )}
          </Field>
          <Field label="Criticality">
            {isAdmin ? (
              <InlineEditCell
                value={component.criticality ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "criticality",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.criticality ?? "—"
            )}
          </Field>
          <Field label="Planning policy">
            {isAdmin ? (
              <InlineEditCell
                value={component.planning_policy_code ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await fieldMutation.mutateAsync({
                    field: "planning_policy_code",
                    value: v,
                    updated_at: ifMatch,
                  });
                }}
              />
            ) : (
              component.planning_policy_code ?? "—"
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Supplier coverage"
        title={`${supplierItemsQuery.data?.rows.length ?? 0} supplier-items for this component`}
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
            No supplier-items for this component yet.{" "}
            {isAdmin ? "Use “+ Add supplier-item” above to create one." : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>Supplier</Th>
                  <Th align="right">Pack conv</Th>
                  <Th align="right">Lead days</Th>
                  <Th align="right">MOQ</Th>
                  <Th>Primary</Th>
                  <Th>Approval</Th>
                </tr>
              </thead>
              <tbody>
                {(supplierItemsQuery.data?.rows ?? []).map((r) => (
                  <tr
                    key={r.supplier_item_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {supplierLookup.get(r.supplier_id) ?? "(unknown)"}
                      </div>
                      <div className="text-3xs font-mono text-fg-subtle">
                        {r.supplier_id}
                      </div>
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
                      ) : isAdmin ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Promote this supplier_item to primary? Existing primary (if any) will 409 — demote first.",
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
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.approval_status ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard eyebrow="BOM usage" title="Used in BOM versions">
        <p className="text-sm text-fg-muted">
          BOM usage lookup is not yet available here. To see which products use this component, open the product&apos;s BOM in the admin area.
        </p>
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
            void queryClient.invalidateQueries({
              queryKey: ["admin", "components", component_id, "readiness"],
            });
          }}
          suppliers={supplierOptions}
          components={componentOptions}
          items={itemOptions}
          defaultComponentId={component.component_id}
        />
      ) : null}
    </>
  );
}

// --- Small helpers --------------------------------------------------------

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

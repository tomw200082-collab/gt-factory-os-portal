"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Components · Detail — Tranche D (plan §F).
// Canonical URL /admin/masters/components/[component_id].
// ---------------------------------------------------------------------------

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  PendingTabPlaceholder,
  type LinkageGroup,
  type TabDescriptor,
  type FieldRow,
} from "@/components/patterns/DetailPage";
import { Badge } from "@/components/badges/StatusBadge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

// --- Types ---------------------------------------------------------------

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

interface ComponentsListResponse {
  rows: ComponentRow[];
  count: number;
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
  std_cost_per_inv_uom: string | null;
  approval_status: string | null;
  updated_at: string;
}

interface SupplierItemsListResponse {
  rows: SupplierItemRow[];
  count: number;
}

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: string;
  source: string;
  title: string;
  detail: string | null;
  status: string;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

interface ExceptionsListResponse {
  rows: ExceptionRow[];
  count: number;
}

// --- helpers -------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ComponentStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminComponentDetailPage({
  params,
}: {
  params: Promise<{ component_id: string }>;
}): JSX.Element {
  const { component_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editBanner, setEditBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const componentQuery = useQuery<ComponentsListResponse>({
    queryKey: ["admin", "masters", "component", component_id],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });
  const row = componentQuery.data?.rows.find(
    (r) => r.component_id === component_id,
  );

  const siQueryKey = ["admin", "masters", "component", component_id, "supplier-items"] as const;

  const supplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: siQueryKey,
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?component_id=${encodeURIComponent(component_id)}&limit=1000`,
      ),
  });

  const suppliersQuery = useQuery<{ rows: { supplier_id: string; supplier_name_official: string }[]; count: number }>({
    queryKey: ["admin", "suppliers", "all"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
    enabled: isAdmin,
  });

  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "component", component_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) => e.related_entity_id === component_id,
    ) ?? [];

  const primarySi =
    supplierItemsQuery.data?.rows.filter((si) => si.is_primary) ?? [];
  const allSi = supplierItemsQuery.data?.rows ?? [];

  const supplierOptions: EntityOption[] = useMemo(
    () =>
      (suppliersQuery.data?.rows ?? []).map((s) => ({
        id: s.supplier_id,
        label: s.supplier_name_official,
        sublabel: s.supplier_id,
      })),
    [suppliersQuery.data],
  );

  const fieldMutation = useMutation({
    mutationFn: async (args: {
      supplier_item_id: string;
      field: "lead_time_days" | "moq" | "pack_conversion" | "std_cost_per_inv_uom";
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setEditBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({ queryKey: siQueryKey });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setEditBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  const promotePrimaryMutation = useMutation({
    mutationFn: async (args: { supplier_item_id: string; updated_at: string }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { is_primary: true },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setEditBanner({ kind: "success", message: "Promoted to primary." });
      void queryClient.invalidateQueries({ queryKey: siQueryKey });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setEditBanner({ kind: "error", message: `Promote failed: ${msg}` });
    },
  });

  const headerMeta = row ? (
    <>
      <ComponentStatusBadge status={row.status} />
      {row.component_class ? (
        <Badge tone="neutral" dotted>
          {row.component_class}
        </Badge>
      ) : null}
      {row.component_group ? (
        <Badge tone="neutral">{row.component_group}</Badge>
      ) : null}
      {row.criticality ? (
        <Badge tone={row.criticality === "HIGH" ? "danger" : "neutral"}>
          {row.criticality}
        </Badge>
      ) : null}
    </>
  ) : null;

  // --- Tabs ----------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (componentQuery.isLoading) return <DetailTabLoading />;
      if (componentQuery.isError) {
        return <DetailTabError message={(componentQuery.error as Error).message} />;
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Component ${component_id} not found in the components list.`}
          />
        );
      }
      const rows: FieldRow[] = [
        { label: "component_id", value: row.component_id, mono: true },
        { label: "component_name", value: row.component_name },
        { label: "component_class", value: row.component_class },
        { label: "component_group", value: row.component_group },
        { label: "status", value: <ComponentStatusBadge status={row.status} /> },
        { label: "inventory_uom", value: row.inventory_uom, mono: true },
        { label: "purchase_uom", value: row.purchase_uom, mono: true },
        { label: "bom_uom", value: row.bom_uom, mono: true },
        {
          label: "purchase_to_inv_factor",
          value: row.purchase_to_inv_factor,
          mono: true,
        },
        {
          label: "planning_policy_code",
          value: row.planning_policy_code,
          mono: true,
        },
        {
          label: "primary_supplier_id",
          value: row.primary_supplier_id ? (
            <Link
              href={`/admin/masters/suppliers/${encodeURIComponent(row.primary_supplier_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {row.primary_supplier_id}
            </Link>
          ) : null,
          mono: true,
        },
        { label: "lead_time_days", value: row.lead_time_days ?? null },
        { label: "moq_purchase_uom", value: row.moq_purchase_uom, mono: true },
        {
          label: "order_multiple_purchase_uom",
          value: row.order_multiple_purchase_uom,
          mono: true,
        },
        { label: "criticality", value: row.criticality },
        { label: "planned_flag", value: row.planned_flag ? "true" : "false" },
        { label: "site_id", value: row.site_id, mono: true },
        { label: "created_at", value: fmtDateTime(row.created_at) },
        { label: "updated_at", value: fmtDateTime(row.updated_at) },
      ];
      return <DetailFieldGrid rows={rows} />;
    })(),
  };

  const usedInBomsTab: TabDescriptor = {
    key: "used-in-boms",
    label: "Used in BOMs",
    content: (
      <PendingTabPlaceholder
        reason="BOM usage lookup is not yet available here. To see which products use this component, open the product BOM in the admin area."
      />
    ),
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Supplier items",
    badge: allSi.length > 0 ? `${allSi.length}` : undefined,
    content: (() => {
      if (supplierItemsQuery.isLoading) return <DetailTabLoading />;
      if (supplierItemsQuery.isError) {
        return (
          <DetailTabError
            message={(supplierItemsQuery.error as Error).message}
          />
        );
      }
      return (
        <div className="space-y-3">
          {isAdmin ? (
            <div className="flex items-center justify-between px-1 pt-1">
              {editBanner ? (
                <div
                  className={
                    editBanner.kind === "success"
                      ? "text-xs text-success-fg"
                      : "text-xs text-danger-fg"
                  }
                >
                  {editBanner.message}
                </div>
              ) : (
                <div />
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                onClick={() => setShowAddSupplier(true)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Add supplier
              </button>
            </div>
          ) : null}
          {allSi.length === 0 ? (
            <DetailTabEmpty message="No supplier-items mapped to this component." />
          ) : (
            <SupplierItemsTable
              rows={allSi}
              isAdmin={isAdmin}
              onFieldSave={async (id, field, value, updated_at) => {
                setEditBanner(null);
                await fieldMutation.mutateAsync({ supplier_item_id: id, field, value, updated_at });
              }}
              onPromotePrimary={(id, updated_at) => {
                setEditBanner(null);
                if (!window.confirm("Promote this supplier to primary? Existing primary will be demoted.")) return;
                promotePrimaryMutation.mutate({ supplier_item_id: id, updated_at });
              }}
            />
          )}
        </div>
      );
    })(),
  };

  const primarySupplierTab: TabDescriptor = {
    key: "primary-supplier",
    label: "Primary supplier",
    content: (() => {
      if (supplierItemsQuery.isLoading) return <DetailTabLoading />;
      if (supplierItemsQuery.isError) {
        return (
          <DetailTabError
            message={(supplierItemsQuery.error as Error).message}
          />
        );
      }
      if (primarySi.length === 0) {
        return (
          <DetailTabEmpty message="No supplier-item is flagged primary for this component." />
        );
      }
      return <SupplierItemsTable rows={primarySi} isAdmin={false} onFieldSave={async () => {}} onPromotePrimary={() => {}} />;
    })(),
  };

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    badge:
      relatedExceptions.length > 0 ? `${relatedExceptions.length}` : undefined,
    content: (() => {
      if (exceptionsQuery.isLoading) return <DetailTabLoading />;
      if (exceptionsQuery.isError) {
        return (
          <DetailTabError
            message={(exceptionsQuery.error as Error).message}
          />
        );
      }
      if (relatedExceptions.length === 0) {
        return (
          <DetailTabEmpty message="No open or acknowledged exceptions linked to this component." />
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <ul className="divide-y divide-border/40">
            {relatedExceptions.map((e) => (
              <li
                key={e.exception_id}
                className="flex items-start gap-3 px-4 py-2 text-xs"
              >
                <SeverityBadge severity={e.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">{e.title}</div>
                  {e.detail ? (
                    <div className="truncate text-fg-muted">{e.detail}</div>
                  ) : null}
                  <div className="mt-0.5 text-3xs text-fg-faint">
                    {e.category} · {e.status} · {fmtDateTime(e.created_at)}
                  </div>
                </div>
                <Link
                  href={`/inbox?view=exceptions&exception_id=${encodeURIComponent(
                    e.exception_id,
                  )}`}
                  className="shrink-0 text-accent hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    })(),
  };

  const tabs: TabDescriptor[] = [
    overviewTab,
    usedInBomsTab,
    supplierItemsTab,
    primarySupplierTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  if (row?.primary_supplier_id) {
    linkages.push({
      label: "Primary supplier",
      items: [
        {
          label: row.primary_supplier_id,
          href: `/admin/masters/suppliers/${encodeURIComponent(row.primary_supplier_id)}`,
          badge: <Badge tone="success" dotted>primary</Badge>,
        },
      ],
    });
  }

  linkages.push({
    label: "All supplier-items",
    items: allSi.slice(0, 10).map((si) => ({
      label: si.supplier_id,
      href: `/admin/masters/suppliers/${encodeURIComponent(si.supplier_id)}`,
      subtitle: si.relationship ?? undefined,
      badge: si.is_primary ? (
        <Badge tone="success" dotted>
          primary
        </Badge>
      ) : undefined,
    })),
    emptyText: "No supplier-items mapped.",
  });

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions for this component.",
  });

  return (
    <>
      <DetailPage
        header={{
          eyebrow: "Admin · Components",
          title: row ? row.component_name : component_id,
          description: row ? `Component ${row.component_id}` : "Loading component…",
          meta: headerMeta,
          actions: (
            <Link href="/admin/components" className="btn btn-ghost btn-sm">
              Back to components
            </Link>
          ),
        }}
        tabs={tabs}
        linkages={linkages}
      />
      {isAdmin ? (
        <QuickCreateSupplierItem
          open={showAddSupplier}
          onClose={() => setShowAddSupplier(false)}
          onCreated={() => {
            setEditBanner({ kind: "success", message: "Supplier-item added." });
            void queryClient.invalidateQueries({ queryKey: siQueryKey });
          }}
          suppliers={supplierOptions}
          components={[]}
          items={[]}
          defaultComponentId={component_id}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// SupplierItemsTable — inline helper (duplicated from items detail for
// column drift independence). Promote to shared component in Tranche F.
// ---------------------------------------------------------------------------

function SupplierItemsTable({
  rows,
  isAdmin,
  onFieldSave,
  onPromotePrimary,
}: {
  rows: SupplierItemRow[];
  isAdmin: boolean;
  onFieldSave: (id: string, field: "lead_time_days" | "moq" | "std_cost_per_inv_uom", value: string | number, updated_at: string) => Promise<void>;
  onPromotePrimary: (id: string, updated_at: string) => void;
}): JSX.Element {
  return (
    <SectionCard density="compact" contentClassName="p-0">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Supplier
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Relationship
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Order UoM
            </th>
            <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Lead (days)
            </th>
            <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              MOQ
            </th>
            <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Std cost
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Primary
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.supplier_item_id}
              className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
            >
              <td className="px-3 py-2 font-mono text-xs text-fg">
                <Link
                  href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                  className="hover:text-accent"
                >
                  {r.supplier_id}
                </Link>
              </td>
              <td className="px-3 py-2 text-fg-muted">
                {r.relationship ?? "—"}
              </td>
              <td className="px-3 py-2 text-fg-muted">{r.order_uom ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                {isAdmin ? (
                  <InlineEditCell
                    value={r.lead_time_days ?? ""}
                    type="number"
                    inputMode="numeric"
                    ifMatchUpdatedAt={r.updated_at}
                    onSave={(v) => onFieldSave(r.supplier_item_id, "lead_time_days", v, r.updated_at)}
                    ariaLabel={`Edit lead_time_days for ${r.supplier_id}`}
                  />
                ) : (
                  r.lead_time_days ?? "—"
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                {isAdmin ? (
                  <InlineEditCell
                    value={r.moq ?? ""}
                    type="number"
                    inputMode="decimal"
                    ifMatchUpdatedAt={r.updated_at}
                    onSave={(v) => onFieldSave(r.supplier_item_id, "moq", v, r.updated_at)}
                    ariaLabel={`Edit moq for ${r.supplier_id}`}
                  />
                ) : (
                  r.moq ?? "—"
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                {isAdmin ? (
                  <InlineEditCell
                    value={r.std_cost_per_inv_uom ?? ""}
                    type="number"
                    inputMode="decimal"
                    ifMatchUpdatedAt={r.updated_at}
                    onSave={(v) => onFieldSave(r.supplier_item_id, "std_cost_per_inv_uom", v, r.updated_at)}
                    ariaLabel={`Edit cost for ${r.supplier_id}`}
                  />
                ) : (
                  r.std_cost_per_inv_uom ?? "—"
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
                    onClick={() => onPromotePrimary(r.supplier_item_id, r.updated_at)}
                  >
                    Promote
                  </button>
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

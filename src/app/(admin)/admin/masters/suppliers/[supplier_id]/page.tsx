"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Suppliers · Detail — Tranche D (plan §F).
// Canonical URL /admin/masters/suppliers/[supplier_id].
//
// 4 tabs:
//   - overview          LIVE   — supplier row fields via list + client-filter
//   - supplier-items    LIVE   — /api/supplier-items?supplier_id=<id>
//                                Loop 11: added inline cost edit per row
//                                (PATCH /api/supplier-items/:id with
//                                std_cost_per_inv_uom + if_match_updated_at).
//                                Loop 15: backend fix (commit 3b787a0) now
//                                returns std_cost_per_inv_uom in the GET list
//                                response; CostEditCell initializes with the
//                                current value and displays it in the table.
//                                updated_at IS returned and is used for
//                                optimistic concurrency.
//   - po-history        LIVE   — /api/purchase-orders?supplier_id=<id>
//   - exceptions        LIVE   — /api/exceptions client-filtered by
//                                related_entity_id
//
// Linkage card: components sourced (via supplier-items), recent POs, GI mapping.
// ---------------------------------------------------------------------------

import { use, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  type LinkageGroup,
  type TabDescriptor,
  type FieldRow,
} from "@/components/patterns/DetailPage";
import { Badge } from "@/components/badges/StatusBadge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { MasterSummaryCard, type CompletenessItem } from "@/components/admin/MasterSummaryCard";
import { ClassWEditDrawer } from "@/components/admin/ClassWEditDrawer";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import { type EntityOption } from "@/components/fields/EntityPickerPlus";
import { AdminMutationError, patchEntity, postStatus } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

// --- Types ---------------------------------------------------------------

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
  green_invoice_supplier_id: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface SuppliersListResponse {
  rows: SupplierRow[];
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
  lead_time_days: number | null;
  moq: string | null;
  approval_status: string | null;
  // Loop 13 backend fix (commit 3b787a0) added std_cost_per_inv_uom to the
  // GET /api/v1/queries/supplier-items response. Field is now included.
  // updated_at is used as if_match_updated_at for the PATCH.
  std_cost_per_inv_uom: string | null;
  updated_at: string;
}

interface SupplierItemsListResponse {
  rows: SupplierItemRow[];
  count: number;
}

interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  source_recommendation_id: string | null;
  created_at: string;
}

interface PurchaseOrdersListResponse {
  rows: PurchaseOrderRow[];
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

interface ComponentRow {
  component_id: string;
  component_name: string | null;
}

interface ItemRow {
  item_id: string;
  sku: string | null;
  item_name: string | null;
  supply_method: string;
}

interface ComponentsListResponse { rows: ComponentRow[]; count: number; }
interface ItemsListResponse { rows: ItemRow[]; count: number; }

// --- helpers -------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
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

function SupplierStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

function POStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "OPEN") return <Badge tone="info" dotted>Open</Badge>;
  if (status === "PARTIAL") return <Badge tone="warning" dotted>Partial</Badge>;
  if (status === "RECEIVED")
    return <Badge tone="success" variant="solid">Received</Badge>;
  if (status === "CANCELLED")
    return <Badge tone="neutral" dotted>Cancelled</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// ---------------------------------------------------------------------------
// Inline cost edit cell — Loop 11.
// Renders "—" by default (std_cost not in GET list response).
// On click, shows a number input. On save, PATCHes
//   /api/supplier-items/:supplier_item_id with
//   { std_cost_per_inv_uom, if_match_updated_at, idempotency_key }.
// On success, invalidates the supplier-items query cache so the table
// refreshes (which will show "—" again since the GET list does not return the
// cost column — the user gets confirmation via the success text).
// ---------------------------------------------------------------------------

interface CostPatchBody {
  std_cost_per_inv_uom: number | null;
  if_match_updated_at: string;
  idempotency_key: string;
}

async function patchSupplierItemCost(
  supplierItemId: string,
  body: CostPatchBody,
): Promise<void> {
  const res = await fetch(
    `/api/supplier-items/${encodeURIComponent(supplierItemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Could not save changes. Check your connection and try again.");
  }
}

function CostEditCell({
  supplierItemId,
  updatedAt,
  currentCost,
  queryKey,
}: {
  supplierItemId: string;
  updatedAt: string;
  currentCost: string | null;
  queryKey: readonly unknown[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentCost ?? "");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: CostPatchBody) =>
      patchSupplierItemCost(supplierItemId, body),
    onSuccess: () => {
      setSaved(true);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: queryKey as string[] });
    },
  });

  const handleSave = useCallback(() => {
    const trimmed = inputValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (isNaN(parsed as number) || (parsed as number) < 0)) {
      return; // invalid — don't submit
    }
    mutation.mutate({
      std_cost_per_inv_uom: parsed,
      if_match_updated_at: updatedAt,
      idempotency_key: crypto.randomUUID(),
    });
  }, [inputValue, updatedAt, mutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") { setEditing(false); setInputValue(currentCost ?? ""); setSaved(false); }
    },
    [handleSave, currentCost],
  );

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="0.0001"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.0000"
          autoFocus
          className="w-24 rounded border border-border px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-fg hover:opacity-80 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : "Save"}
        </button>
        <button
          onClick={() => { setEditing(false); setInputValue(currentCost ?? ""); }}
          className="rounded px-1 py-0.5 text-xs text-fg-muted hover:text-fg"
        >
          ✕
        </button>
        {mutation.isError ? (
          <span className="text-xs text-danger-fg" title={(mutation.error as Error).message}>
            Error
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {currentCost !== null && currentCost !== "" ? (
        <span className="font-mono text-xs text-fg">{currentCost}</span>
      ) : (
        <span className="text-fg-faint">—</span>
      )}
      {saved ? (
        <span className="text-xs text-success-fg">Saved</span>
      ) : null}
      <button
        onClick={() => { setEditing(true); setSaved(false); setInputValue(currentCost ?? ""); }}
        className="rounded px-1 py-0.5 text-3xs text-fg-subtle hover:bg-bg-subtle hover:text-fg"
      >
        Edit cost
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSupplierDetailPage({
  params,
}: {
  params: Promise<{ supplier_id: string }>;
}): JSX.Element {
  const { supplier_id } = use(params);
  const queryClient = useQueryClient();

  const supplierQuery = useQuery<SuppliersListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });
  const row = supplierQuery.data?.rows.find(
    (r) => r.supplier_id === supplier_id,
  );

  const supplierItemsQueryKey = [
    "admin",
    "masters",
    "supplier",
    supplier_id,
    "supplier-items",
  ] as const;

  const supplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: supplierItemsQueryKey,
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?supplier_id=${encodeURIComponent(supplier_id)}&limit=1000`,
      ),
  });

  const purchaseOrdersQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id, "purchase-orders"],
    queryFn: () =>
      fetchJson(
        `/api/purchase-orders?supplier_id=${encodeURIComponent(supplier_id)}&limit=500`,
      ),
  });

  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });

  const componentsQuery = useQuery<ComponentsListResponse>({
    queryKey: ["admin", "components", "all"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const itemsQuery = useQuery<ItemsListResponse>({
    queryKey: ["admin", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const [showAddSourcing, setShowAddSourcing] = useState(false);
  const [showStatusDrawer, setShowStatusDrawer] = useState(false);
  const [drawerStatusTarget, setDrawerStatusTarget] = useState<string>("");

  const { session } = useSession();
  const isAdmin = session.role === "admin";

  const supplierFieldMutation = useMutation({
    mutationFn: async (args: { field: string; value: unknown; updated_at: string }) =>
      patchEntity({
        url: `/api/suppliers/${encodeURIComponent(supplier_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "supplier", supplier_id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/suppliers/${encodeURIComponent(supplier_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setShowStatusDrawer(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "supplier", supplier_id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
    },
  });

  const supplierOptions: EntityOption[] = supplierQuery.data?.rows.map((s) => ({
    id: s.supplier_id,
    label: s.supplier_name_short ?? s.supplier_name_official,
    sublabel: s.supplier_id,
  })) ?? [];

  const componentOptions: EntityOption[] = componentsQuery.data?.rows.map((c) => ({
    id: c.component_id,
    label: c.component_name ?? c.component_id,
    sublabel: c.component_id,
  })) ?? [];

  const itemOptions: EntityOption[] = (itemsQuery.data?.rows ?? [])
    .filter((i) => i.supply_method === "BOUGHT_FINISHED")
    .map((i) => ({
      id: i.item_id,
      label: i.item_name ?? i.item_id,
      sublabel: i.sku ?? i.item_id,
    }));
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) =>
        e.related_entity_id === supplier_id ||
        (e.related_entity_type === "supplier" &&
          e.related_entity_id === supplier_id),
    ) ?? [];

  const allSi = supplierItemsQuery.data?.rows ?? [];
  const allPos = purchaseOrdersQuery.data?.rows ?? [];

  const completenessItems = useMemo((): CompletenessItem[] => {
    if (!row) return [];
    const hasContact = !!(row.primary_contact_name || row.primary_contact_phone);
    const hasSourcingLinks = allSi.length > 0;
    const hasCost = allSi.some((si) => si.std_cost_per_inv_uom && parseFloat(si.std_cost_per_inv_uom) > 0);
    return [
      { label: "Contact info", status: hasContact ? "ok" : "warn", detail: hasContact ? undefined : "No contact name or phone set" },
      { label: "Sourcing links", status: hasSourcingLinks ? "ok" : "warn", detail: hasSourcingLinks ? `${allSi.length} link(s)` : "No components or items linked" },
      { label: "Standard cost on any link", status: hasCost ? "ok" : "warn", detail: hasCost ? undefined : "No cost set on any sourcing link" },
    ];
  }, [row, allSi]);

  const headerMeta = row ? (
    <>
      <SupplierStatusBadge status={row.status} />
      {row.supplier_type ? (
        <Badge tone="neutral" dotted>
          {row.supplier_type}
        </Badge>
      ) : null}
      {row.currency ? (
        <Badge tone="neutral">{row.currency}</Badge>
      ) : null}
      {row.payment_terms ? (
        <Badge tone="neutral">{row.payment_terms}</Badge>
      ) : null}
    </>
  ) : null;

  // --- Tabs ----------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (supplierQuery.isLoading) return <DetailTabLoading />;
      if (supplierQuery.isError) {
        return <DetailTabError message={(supplierQuery.error as Error).message} />;
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Supplier ${supplier_id} not found in the suppliers list.`}
          />
        );
      }
      const classLFields: FieldRow[] = [
        { label: "Supplier code (locked)", value: row.supplier_id, mono: true },
        { label: "Official name (locked)", value: row.supplier_name_official },
        { label: "Currency (locked)", value: row.currency ?? "—", mono: true },
        { label: "Green Invoice ID (locked)", value: row.green_invoice_supplier_id ?? "—", mono: true },
        { label: "Approval status", value: row.approval_status ?? "—" },
        { label: "Site", value: row.site_id, mono: true },
        { label: "Created", value: fmtDateTime(row.created_at) },
        { label: "Last updated", value: fmtDateTime(row.updated_at) },
      ];
      return (
        <div className="space-y-4 p-1">
          <SectionCard title="Details" density="compact">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Short name</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.supplier_name_short ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "supplier_name_short", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit short name"
                  />
                ) : (
                  <span className="text-fg-strong font-medium">{row.supplier_name_short ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Type</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.supplier_type ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "supplier_type", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit supplier type"
                  />
                ) : (
                  <span className="text-fg">{row.supplier_type ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Primary contact</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.primary_contact_name ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "primary_contact_name", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit primary contact"
                  />
                ) : (
                  <span className="text-fg">{row.primary_contact_name ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Phone</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.primary_contact_phone ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "primary_contact_phone", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit phone"
                  />
                ) : (
                  <span className="text-fg">{row.primary_contact_phone ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Payment terms</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.payment_terms ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "payment_terms", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit payment terms"
                  />
                ) : (
                  <span className="text-fg">{row.payment_terms ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Default lead time (days)</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.default_lead_time_days !== null ? String(row.default_lead_time_days) : ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "default_lead_time_days", value: val ? Number(val) : null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit default lead time"
                  />
                ) : (
                  <span className="text-fg">{row.default_lead_time_days ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Default min. order qty</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.default_moq ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "default_moq", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit default MOQ"
                  />
                ) : (
                  <span className="text-fg">{row.default_moq ?? "—"}</span>
                )}
              </div>
            </div>
          </SectionCard>

          <details className="group rounded-md border border-border/50 bg-bg-subtle">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs text-fg-muted group-open:border-b group-open:border-border/50">
              Technical details (locked fields)
            </summary>
            <div className="px-3 py-2">
              <p className="mb-2 text-xs text-fg-subtle">These fields require a migration or integration update to change safely.</p>
              <DetailFieldGrid rows={classLFields} />
            </div>
          </details>

          {supplierFieldMutation.isError ? (
            <p className="text-xs text-danger-fg">
              {supplierFieldMutation.error instanceof AdminMutationError
                ? supplierFieldMutation.error.message
                : "Save failed. Please try again."}
            </p>
          ) : null}
        </div>
      );
    })(),
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Items supplied",
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
      const addButton = (
        <div className="flex justify-end px-4 pt-3 pb-2">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => setShowAddSourcing(true)}
          >
            + Add sourcing link
          </button>
        </div>
      );
      if (allSi.length === 0) {
        return (
          <div>
            {addButton}
            <DetailTabEmpty message="No items linked to this supplier yet. Use 'Add sourcing link' to connect raw materials or products." />
          </div>
        );
      }
      return (
        <div>
          {addButton}
        <SectionCard density="compact" contentClassName="p-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Kind
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Target
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Relationship
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Primary
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order UoM
                </th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Lead (days)
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Approval
                </th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Std cost (ILS)
                </th>
              </tr>
            </thead>
            <tbody>
              {allSi.map((r) => (
                <tr
                  key={r.supplier_item_id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 text-fg-muted">
                    {r.component_id ? "component" : r.item_id ? "item" : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-fg">
                    {r.component_id ? (
                      <Link
                        href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`}
                        className="hover:text-accent"
                      >
                        {r.component_id}
                      </Link>
                    ) : r.item_id ? (
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                        className="hover:text-accent"
                      >
                        {r.item_id}
                      </Link>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {r.relationship ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_primary ? (
                      <Badge tone="success" dotted>
                        primary
                      </Badge>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {r.order_uom ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                    {r.lead_time_days ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.approval_status ? (
                      <Badge tone="neutral">{r.approval_status}</Badge>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CostEditCell
                      supplierItemId={r.supplier_item_id}
                      updatedAt={r.updated_at}
                      currentCost={r.std_cost_per_inv_uom}
                      queryKey={supplierItemsQueryKey}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        </div>
      );
    })(),
  };

  const poHistoryTab: TabDescriptor = {
    key: "po-history",
    label: "PO history",
    badge: allPos.length > 0 ? `${allPos.length}` : undefined,
    content: (() => {
      if (purchaseOrdersQuery.isLoading) return <DetailTabLoading />;
      if (purchaseOrdersQuery.isError) {
        return (
          <DetailTabError
            message={(purchaseOrdersQuery.error as Error).message}
          />
        );
      }
      if (allPos.length === 0) {
        return (
          <DetailTabEmpty message="No purchase orders issued against this supplier yet." />
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  PO number
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order date
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Expected receive
                </th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Total net
                </th>
              </tr>
            </thead>
            <tbody>
              {allPos.map((p) => (
                <tr
                  key={p.po_id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/purchase-orders/${encodeURIComponent(p.po_id)}`}
                      className="text-fg hover:text-accent"
                    >
                      {p.po_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <POStatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {fmtDate(p.order_date)}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {fmtDate(p.expected_receive_date)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-fg">
                    {p.total_net}{" "}
                    <span className="text-fg-faint">{p.currency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      );
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
          <DetailTabEmpty message="No open or acknowledged exceptions linked to this supplier." />
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
    supplierItemsTab,
    poHistoryTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  // Components sourced from this supplier (derived from supplier-items).
  const sourcedComponents = Array.from(
    new Set(
      allSi.filter((si) => si.component_id).map((si) => si.component_id!),
    ),
  );
  linkages.push({
    label: "Components sourced",
    items: sourcedComponents.slice(0, 10).map((cid) => ({
      label: cid,
      href: `/admin/masters/components/${encodeURIComponent(cid)}`,
    })),
    emptyText: "No components sourced.",
  });

  linkages.push({
    label: "Recent POs",
    items: allPos.slice(0, 5).map((p) => ({
      label: p.po_number,
      href: `/purchase-orders/${encodeURIComponent(p.po_id)}`,
      subtitle: fmtDate(p.order_date),
      badge: <POStatusBadge status={p.status} />,
    })),
    emptyText: "No purchase orders yet.",
  });

  if (row?.green_invoice_supplier_id) {
    linkages.push({
      label: "Green Invoice mapping",
      items: [
        {
          label: row.green_invoice_supplier_id,
          href: `/admin/integrations`,
          subtitle: "gi_supplier_id",
          badge: <Badge tone="info" dotted>GI</Badge>,
        },
      ],
    });
  }

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions for this supplier.",
  });

  return (
    <>
      {row ? (
        <MasterSummaryCard
          name={row.supplier_name_short ?? row.supplier_name_official}
          code={row.supplier_id}
          entityType="Supplier"
          status={row.status}
          completeness={completenessItems}
          actions={
            isAdmin ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDrawerStatusTarget(row.status === "INACTIVE" ? "ACTIVE" : "INACTIVE");
                  setShowStatusDrawer(true);
                }}
              >
                {row.status === "INACTIVE" ? "Restore" : "Archive"}
              </button>
            ) : undefined
          }
        />
      ) : null}

      <ClassWEditDrawer
        open={showStatusDrawer}
        onClose={() => setShowStatusDrawer(false)}
        title={drawerStatusTarget === "INACTIVE" ? "Archive supplier" : "Restore supplier"}
        warning={
          drawerStatusTarget === "INACTIVE"
            ? "Archiving this supplier hides it from sourcing workflows and purchase order creation. Existing POs and sourcing links are not deleted."
            : "Restoring this supplier makes it available again for sourcing and purchase order creation."
        }
        onSave={async () => {
          if (!row) return;
          await statusMutation.mutateAsync({ newStatus: drawerStatusTarget, updated_at: row.updated_at });
        }}
        isSaving={statusMutation.isPending}
        error={statusMutation.isError ? (statusMutation.error as Error).message : null}
      >
        <p className="text-sm text-fg-muted">
          {drawerStatusTarget === "INACTIVE"
            ? "This will set the supplier status to Archived."
            : "This will set the supplier status to Active."}
        </p>
      </ClassWEditDrawer>

      <DetailPage
        header={{
          eyebrow: "Admin · Suppliers",
          title: row
            ? row.supplier_name_short ?? row.supplier_name_official
            : supplier_id,
          description: row ? `Supplier ${row.supplier_id}` : "Loading supplier…",
          meta: headerMeta,
          actions: (
            <Link href="/admin/suppliers" className="btn btn-ghost btn-sm">
              Back to suppliers
            </Link>
          ),
        }}
        tabs={tabs}
        linkages={linkages}
      />
      <QuickCreateSupplierItem
        open={showAddSourcing}
        onClose={() => setShowAddSourcing(false)}
        onCreated={() => {
          setShowAddSourcing(false);
          void queryClient.invalidateQueries({ queryKey: supplierItemsQueryKey as unknown as string[] });
        }}
        suppliers={supplierOptions}
        components={componentOptions}
        items={itemOptions}
        defaultSupplierId={supplier_id}
      />
    </>
  );
}

"use client";

// ---------------------------------------------------------------------------
// Admin · Components — AMMC v1 Slice 4.
//
// Extensions: + New component drawer, inline status toggle. Readiness pill
// column — note that the components-list endpoint does not yet forward
// `?include_readiness=true` (A13: Slice 2 delivered it for items only;
// v_component_readiness view exists per migration 0069 but the list-scoped
// endpoint extension is deferred). For Slice 4 we render "—" in the readiness
// column for components and surface per-row readiness on the detail page
// (Slice 5). This keeps the slice scope tight without inventing endpoints.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Power, X } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import { QuickCreateComponent } from "@/components/admin/quick-create/QuickCreateComponent";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { formatQty } from "@/lib/utils/format-quantity";
import {
  AdminMutationError,
  patchEntity,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import {
  bomsRepo,
  itemsRepo,
} from "@/lib/repositories";
import type {
  BomLineDto,
  ItemDto,
} from "@/lib/contracts/dto";

// API-shape rows. The live /api/suppliers and /api/supplier-items responses
// return plain DB rows wrapped in { rows, count }, distinct from the IDB DTOs
// (which carry an `audit` envelope). The supplier-assign workflow on this
// page reads/writes through the API so values stay in sync with production.
interface ApiSupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
}

interface ApiSupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  component_id: string | null;
  item_id: string | null;
  is_primary: boolean;
  approval_status: string | null;
  updated_at: string;
}

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
  readiness?: {
    is_ready?: boolean;
    blockers?: unknown[];
  } | null;
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

interface UsedInRow {
  headId: string;
  headName: string;
  qtyPerUnit: number;
  uom: string;
  bomType: string;
}

export default function AdminComponentsPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-fg-muted">Loading…</div>}>
      <ComponentsPageInner />
    </Suspense>
  );
}

function ComponentsPageInner(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [pendingSupplier, setPendingSupplier] = useState<string>("");
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", statusFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set("status", statusFilter);
      q.set("limit", "1000");
      return fetchJson(`/api/components?${q.toString()}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (args: {
      component_id: string;
      newStatus: string;
      updated_at: string;
    }) =>
      postStatus({
        url: `/api/components/${encodeURIComponent(args.component_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({
        kind: "success",
        message: `Status updated for ${vars.component_id} → ${vars.newStatus}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "components"] });
    },
    onError: (err: Error, vars) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({
        kind: "error",
        message: `Status update failed on ${vars.component_id}: ${msg}`,
      });
    },
  });

  const rows = componentsQuery.data?.rows ?? [];

  // Pre-select via ?component=<id> on first render after rows load.
  useEffect(() => {
    const wanted = searchParams.get("component");
    if (!wanted) return;
    if (selectedId) return;
    if (rows.some((r) => r.component_id === wanted)) {
      setSelectedId(wanted);
    }
  }, [rows, searchParams, selectedId]);

  const selectedComponent = useMemo(
    () => rows.find((r) => r.component_id === selectedId) ?? null,
    [rows, selectedId],
  );

  // Suppliers list — used by the picker AND by the table to resolve
  // primary_supplier_id -> human-readable name. Reads from the live API so
  // the dropdown shows the operator's real suppliers (not stale browser-IDB
  // fixtures). Filter out INACTIVE so deprecated suppliers can't be picked.
  const suppliersList = useQuery<ListEnvelope<ApiSupplierRow>>({
    queryKey: ["api", "suppliers", "list"],
    queryFn: () =>
      fetchJson<ListEnvelope<ApiSupplierRow>>(
        "/api/suppliers?status=ACTIVE&limit=1000",
      ),
  });

  // O(1) lookup of supplier name by id — operators read names, never IDs
  // (supplier_id is internal). Empty Map until suppliers load.
  const suppliersById = useMemo(() => {
    const m = new Map<string, ApiSupplierRow>();
    for (const s of suppliersList.data?.rows ?? []) m.set(s.supplier_id, s);
    return m;
  }, [suppliersList.data]);

  function supplierNameOf(id: string | null | undefined): string {
    if (!id) return "—";
    const s = suppliersById.get(id);
    return s?.supplier_name_short || s?.supplier_name_official || id;
  }

  // Items list (IDB) — used to resolve product names for "Used in".
  const itemsList = useQuery<ItemDto[]>({
    queryKey: ["idb", "items"],
    queryFn: () => itemsRepo.list(),
  });
  const itemsMap = useMemo(
    () => new Map((itemsList.data ?? []).map((i) => [i.item_id, i])),
    [itemsList.data],
  );

  // Primary supplier_item for the selected component — read from the live API.
  const primarySupplierItemQuery = useQuery<ApiSupplierItemRow | null>({
    queryKey: ["api", "supplier-items", "primary", selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const env = await fetchJson<ListEnvelope<ApiSupplierItemRow>>(
        `/api/supplier-items?component_id=${encodeURIComponent(
          selectedId,
        )}&limit=1000`,
      );
      return env.rows.find((s) => s.is_primary === true) ?? null;
    },
    enabled: !!selectedId,
  });

  const primarySupplier = useMemo(() => {
    const si = primarySupplierItemQuery.data;
    if (!si) return null;
    return (
      suppliersList.data?.rows.find((s) => s.supplier_id === si.supplier_id) ??
      null
    );
  }, [primarySupplierItemQuery.data, suppliersList.data]);

  // "Used in" — scan all active BOM heads' active versions for lines whose
  // final_component_id matches selectedId. Distinct rows per head (a head's
  // BASE vs PACK lives on separate heads, so two matches naturally surface
  // as two rows).
  const usedInQuery = useQuery<UsedInRow[]>({
    queryKey: ["idb", "used-in", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const heads = await bomsRepo.listHeads();
      const out: UsedInRow[] = [];
      for (const head of heads) {
        if (!head.active_version_id) continue;
        let lines: BomLineDto[] = [];
        try {
          lines = await bomsRepo.listLines(head.active_version_id);
        } catch {
          continue;
        }
        for (const line of lines) {
          if (line.final_component_id === selectedId) {
            const headName =
              itemsMap.get(head.parent_ref_id ?? "")?.item_name ??
              head.parent_name ??
              head.display_family ??
              "Recipe";
            out.push({
              headId: head.bom_head_id,
              headName,
              qtyPerUnit: Number(line.final_component_qty ?? 0),
              uom: line.component_uom ?? "UNIT",
              bomType: head.bom_kind,
            });
          }
        }
      }
      return out;
    },
    enabled: !!selectedId && itemsList.isFetched,
  });

  // Component field mutation — PATCHes the component's own scalar fields.
  // Mirrors the masters detail page pattern; live API → /api/v1/mutations/components/:id.
  const componentFieldMutation = useMutation({
    mutationFn: async (args: {
      field: "component_name" | "component_class" | "component_group" | "criticality";
      value: unknown;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/components/${encodeURIComponent(selectedId ?? "")}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "components"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  const supplierAssignMutation = useMutation({
    mutationFn: async (args: {
      componentId: string;
      newSupplierId: string;
      existing: ApiSupplierItemRow | null;
    }) => {
      // The supplier_items table has a partial unique index that allows at
      // most one is_primary=true row per component. To swap primary cleanly
      // we (1) demote the current primary if any, (2) create the new row as
      // primary. Trigger 0112 will auto-fill lead_time_days from the new
      // supplier's default, and the supplier-cascade trigger keeps the
      // component's lead_time_days in sync.
      if (args.existing) {
        await patchEntity({
          url: `/api/supplier-items/${encodeURIComponent(
            args.existing.supplier_item_id,
          )}`,
          fields: { is_primary: false },
          ifMatchUpdatedAt: args.existing.updated_at,
        });
      }
      // POST the new primary row. Mark approval_status='approved' so the
      // readiness gate sees a valid supplier link immediately. lead_time
      // and pack_conversion default safely on the server.
      const res = await fetch("/api/supplier-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          supplier_id: args.newSupplierId,
          component_id: args.componentId,
          item_id: null,
          is_primary: true,
          approval_status: "approved",
          pack_conversion: 1,
        }),
      });
      const created = (await res.json().catch(() => null)) as
        | { row?: ApiSupplierItemRow }
        | ApiSupplierItemRow
        | null;
      if (!res.ok) {
        const message =
          created && typeof created === "object" && "message" in created
            ? String((created as { message?: unknown }).message)
            : `Could not assign supplier (HTTP ${res.status}).`;
        const code =
          created && typeof created === "object" && "code" in created
            ? String((created as { code?: unknown }).code)
            : undefined;
        throw new AdminMutationError(res.status, message, code, created);
      }
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["api", "supplier-items"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["api", "supplier-items", "primary"],
      });
      setShowSupplierPicker(false);
      setPendingSupplier("");
      setBanner({
        kind: "success",
        message: "Primary supplier updated.",
      });
    },
    onError: (err: Error) => {
      setBanner({
        kind: "error",
        message: `Could not update primary supplier: ${err.message}`,
      });
    },
  });

  const handleSaveSupplier = () => {
    if (!selectedComponent || !pendingSupplier) return;
    supplierAssignMutation.mutate({
      componentId: selectedComponent.component_id,
      newSupplierId: pendingSupplier,
      existing: primarySupplierItemQuery.data ?? null,
    });
  };

  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.component_id.toLowerCase().includes(qLower) ||
        r.component_name.toLowerCase().includes(qLower) ||
        (r.component_class ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  const handleToggleStatus = (row: ComponentRow) => {
    if (!isAdmin) return;
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (!window.confirm(`Set ${row.component_id} status to ${next}?`)) return;
    setBanner(null);
    statusMutation.mutate({
      component_id: row.component_id,
      newStatus: next,
      updated_at: row.updated_at,
    });
  };

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · components"
        title="Components"
        description="Raw material and packaging component master. Click a row for details including supplier coverage and BOM usage."
        meta={
          <>
            <Badge tone="info" dotted>
              {componentsQuery.data?.count ?? 0} rows
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New component
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

      <SectionCard title="Filters" density="compact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="block sm:col-span-3">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search
            </span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search components…"
                dir="auto"
              />
              {query ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() => setQuery("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Status
            </span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">(all)</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="PENDING">PENDING</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Components master"
        title={`Showing ${filtered.length} of ${rows.length}`}
        contentClassName="p-0"
      >
        {componentsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : componentsQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load components</div>
              <div className="mt-1 text-xs">
                {(componentsQuery.error as Error).message}
              </div>
              <button
                type="button"
                onClick={() => componentsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            <div className="mx-auto max-w-sm text-center">
              <div className="text-sm font-semibold text-fg-strong">
                {rows.length === 0
                  ? "No components in the master yet."
                  : query
                  ? "No components match your search."
                  : "No components match these filters."}
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                {rows.length === 0
                  ? "Add a component with + New component."
                  : "Try clearing the search or relaxing the filters."}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {(query || statusFilter !== "ACTIVE") ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("ACTIVE");
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Reset filters
                  </button>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-1.5"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    New component
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Code
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Category
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Stock unit
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Primary supplier
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Lead time
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Readiness
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  {isAdmin ? (
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.component_id}
                    className={`cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 ${
                      r.component_id === selectedId
                        ? "bg-bg-subtle/60"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedId(r.component_id);
                      setShowSupplierPicker(false);
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.component_id}
                    </td>
                    <td className="px-3 py-2 text-fg-strong">
                      {r.component_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.component_class ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.inventory_uom ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.primary_supplier_id ? (
                        <Link
                          href={`/admin/masters/suppliers/${encodeURIComponent(r.primary_supplier_id)}`}
                          className="text-fg hover:text-accent"
                          title={r.primary_supplier_id}
                        >
                          {supplierNameOf(r.primary_supplier_id)}
                        </Link>
                      ) : (
                        <Badge tone="warning" dotted>No supplier</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {r.lead_time_days ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <ReadinessPill readiness={r.readiness} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    {isAdmin ? (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          title={`Toggle status (currently ${r.status})`}
                          className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(r);
                          }}
                          disabled={statusMutation.isPending}
                        >
                          <Power className="h-3 w-3" strokeWidth={2} />
                          {r.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selectedComponent ? (
        <SectionCard
          eyebrow="Component detail"
          title={selectedComponent.component_name}
          description={
            isAdmin
              ? "Click any editable field to change it. Saves immediately."
              : "Read-only — sign in as admin to edit."
          }
          actions={
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/masters/components/${encodeURIComponent(
                  selectedComponent.component_id,
                )}`}
                className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                title="Open full detail page (recipes, sourcing, exceptions)"
              >
                <ExternalLink className="h-3 w-3" strokeWidth={2} />
                Open full detail
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                onClick={() => {
                  setSelectedId(null);
                  setShowSupplierPicker(false);
                }}
                title="Close detail"
              >
                <X className="h-3 w-3" strokeWidth={2} />
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <Breadcrumbs
              items={[
                { label: "Admin", href: "/admin" },
                { label: "Components", href: "/admin/components" },
                { label: selectedComponent.component_name },
              ]}
            />

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Name
                </span>
                {isAdmin ? (
                  <InlineEditCell
                    value={selectedComponent.component_name}
                    ifMatchUpdatedAt={selectedComponent.updated_at}
                    ariaLabel="Edit component name"
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "component_name",
                        value: val,
                        updated_at: selectedComponent.updated_at,
                      }) as Promise<void>
                    }
                  />
                ) : (
                  <span className="text-fg-strong font-medium">
                    {selectedComponent.component_name}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Code (locked)
                </span>
                <span className="font-mono text-fg">
                  {selectedComponent.component_id}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Category
                </span>
                {isAdmin ? (
                  <InlineEditCell
                    value={selectedComponent.component_class ?? ""}
                    ifMatchUpdatedAt={selectedComponent.updated_at}
                    ariaLabel="Edit category"
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "component_class",
                        value: (val as string) || null,
                        updated_at: selectedComponent.updated_at,
                      }) as Promise<void>
                    }
                  />
                ) : (
                  <span className="text-fg">
                    {selectedComponent.component_class ?? "—"}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Group
                </span>
                {isAdmin ? (
                  <InlineEditCell
                    value={selectedComponent.component_group ?? ""}
                    ifMatchUpdatedAt={selectedComponent.updated_at}
                    ariaLabel="Edit group"
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "component_group",
                        value: (val as string) || null,
                        updated_at: selectedComponent.updated_at,
                      }) as Promise<void>
                    }
                  />
                ) : (
                  <span className="text-fg">
                    {selectedComponent.component_group ?? "—"}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Criticality
                </span>
                {isAdmin ? (
                  <InlineEditCell
                    value={selectedComponent.criticality ?? ""}
                    ifMatchUpdatedAt={selectedComponent.updated_at}
                    ariaLabel="Edit criticality"
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "criticality",
                        value: (val as string) || null,
                        updated_at: selectedComponent.updated_at,
                      }) as Promise<void>
                    }
                  />
                ) : (
                  <span className="text-fg">
                    {selectedComponent.criticality ?? "—"}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Stock unit (locked)
                </span>
                <span className="text-fg">
                  {selectedComponent.inventory_uom ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Purchase unit (locked)
                </span>
                <span className="text-fg">
                  {selectedComponent.purchase_uom ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Purchase → stock factor (locked)
                </span>
                <span className="text-fg">
                  {formatQty(
                    Number(selectedComponent.purchase_to_inv_factor ?? 1),
                    "RATIO",
                  )}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Lead time (days)
                </span>
                <span className="text-fg">
                  {selectedComponent.lead_time_days != null
                    ? formatQty(
                        Number(selectedComponent.lead_time_days),
                        "UNIT",
                      )
                    : "—"}
                </span>
                <span className="mt-0.5 block text-3xs text-fg-subtle">
                  Edit on the primary supplier link.
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  MOQ (purchase UOM)
                </span>
                <span className="text-fg">
                  {selectedComponent.moq_purchase_uom != null
                    ? formatQty(
                        Number(selectedComponent.moq_purchase_uom),
                        selectedComponent.purchase_uom ?? "UNIT",
                      )
                    : "—"}
                </span>
                <span className="mt-0.5 block text-3xs text-fg-subtle">
                  Edit on the primary supplier link.
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order multiple
                </span>
                <span className="text-fg">
                  {selectedComponent.order_multiple_purchase_uom != null
                    ? formatQty(
                        Number(selectedComponent.order_multiple_purchase_uom),
                        selectedComponent.purchase_uom ?? "UNIT",
                      )
                    : "—"}
                </span>
                <span className="mt-0.5 block text-3xs text-fg-subtle">
                  Edit on the primary supplier link.
                </span>
              </div>
            </div>

            {/* Primary supplier section */}
            <div className="border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-fg-strong">
                  Primary supplier
                </span>
                {isAdmin && !showSupplierPicker ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setShowSupplierPicker(true);
                      setPendingSupplier(
                        primarySupplierItemQuery.data?.supplier_id ?? "",
                      );
                    }}
                  >
                    {primarySupplier ? "Change" : "Assign supplier"}
                  </button>
                ) : null}
              </div>

              {primarySupplierItemQuery.isLoading ? (
                <span className="text-sm text-fg-muted">Loading…</span>
              ) : primarySupplier ? (
                <Link
                  href={`/admin/suppliers?supplier=${encodeURIComponent(
                    primarySupplier.supplier_id,
                  )}`}
                  className="text-sm text-accent hover:underline"
                >
                  {primarySupplier.supplier_name_official}
                </Link>
              ) : (
                <span className="text-sm text-fg-muted">
                  No supplier assigned
                </span>
              )}

              {showSupplierPicker ? (
                <div className="mt-3 space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Select supplier
                    </span>
                    <select
                      className="input w-full"
                      value={pendingSupplier}
                      onChange={(e) => setPendingSupplier(e.target.value)}
                    >
                      <option value="">Choose a supplier…</option>
                      {(suppliersList.data?.rows ?? []).map((s) => (
                        <option key={s.supplier_id} value={s.supplier_id}>
                          {s.supplier_name_official}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={handleSaveSupplier}
                      disabled={
                        !pendingSupplier ||
                        supplierAssignMutation.isPending
                      }
                    >
                      {supplierAssignMutation.isPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setShowSupplierPicker(false);
                        setPendingSupplier("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Used in section */}
            <div className="border-t border-border pt-4">
              {usedInQuery.isLoading ? (
                <span className="text-sm text-fg-muted">
                  Loading recipe usage…
                </span>
              ) : (
                <>
                  <div className="mb-2 text-sm font-medium text-fg-strong">
                    Used in {usedInQuery.data?.length ?? 0}{" "}
                    {(usedInQuery.data?.length ?? 0) === 1
                      ? "product"
                      : "products"}
                  </div>
                  {(usedInQuery.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-fg-muted">
                      Not used in any active recipe.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {usedInQuery.data!.map((row, idx) => (
                        <li
                          key={`${row.headId}-${idx}`}
                          className="flex items-center justify-between text-sm"
                        >
                          <Link
                            href={`/admin/boms?head=${encodeURIComponent(
                              row.headId,
                            )}`}
                            className="text-accent hover:underline"
                          >
                            {row.headName}
                          </Link>
                          <span className="ml-2 text-xs text-fg-muted">
                            {formatQty(row.qtyPerUnit, row.uom)} {row.uom}
                            {" · "}
                            <span className="font-mono">{row.bomType}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <QuickCreateComponent
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(newId) => {
          setBanner({
            kind: "success",
            message: `Created ${newId}. Open the detail page to add a supplier and set pricing.`,
          });
          setShowCreate(false);
          void queryClient.invalidateQueries({ queryKey: ["admin", "components"] });
        }}
      />
    </>
  );
}

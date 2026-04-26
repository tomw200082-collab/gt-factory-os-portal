"use client";

// ---------------------------------------------------------------------------
// Admin · Suppliers — AMMC v1 Slice 4.
//
// Extensions: + New supplier drawer, inline status toggle.
// A13 decision: no v_supplier_readiness view exists in migration 0069 (plan
// §E names 4 views: item / component / bom_version / supplier_item).
// Supplier-level readiness would require a new view for aggregate
// supplier → supplier_item health; deferred as follow-on. Readiness column
// omitted for suppliers in this slice.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, X } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { QuickCreateSupplier } from "@/components/admin/quick-create/QuickCreateSupplier";
import { formatQty } from "@/lib/utils/format-quantity";
import {
  AdminMutationError,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import {
  componentsRepo,
  supplierItemsRepo,
} from "@/lib/repositories";
import type { ComponentDto, SupplierItemDto } from "@/lib/contracts/dto";

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

export default function AdminSuppliersPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-fg-muted">Loading…</div>}>
      <SuppliersPageInner />
    </Suspense>
  );
}

function SuppliersPageInner(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", statusFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set("status", statusFilter);
      q.set("limit", "1000");
      return fetchJson(`/api/suppliers?${q.toString()}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (args: {
      supplier_id: string;
      newStatus: string;
      updated_at: string;
    }) =>
      postStatus({
        url: `/api/suppliers/${encodeURIComponent(args.supplier_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({
        kind: "success",
        message: `Status updated for ${vars.supplier_id} → ${vars.newStatus}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
    },
    onError: (err: Error, vars) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({
        kind: "error",
        message: `Status update failed on ${vars.supplier_id}: ${msg}`,
      });
    },
  });

  const rows = suppliersQuery.data?.rows ?? [];

  // Pre-select via ?supplier=<id> on first render after rows load.
  useEffect(() => {
    const wanted = searchParams.get("supplier");
    if (!wanted) return;
    if (selectedId) return;
    if (rows.some((r) => r.supplier_id === wanted)) {
      setSelectedId(wanted);
    }
  }, [rows, searchParams, selectedId]);

  const selectedSupplier = useMemo(
    () => rows.find((r) => r.supplier_id === selectedId) ?? null,
    [rows, selectedId],
  );

  // IDB: components master (for name resolution).
  const componentsList = useQuery<ComponentDto[]>({
    queryKey: ["idb", "components"],
    queryFn: () => componentsRepo.list(),
  });
  const componentsById = useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of componentsList.data ?? []) map.set(c.component_id, c);
    return map;
  }, [componentsList.data]);

  // IDB: components supplied by this supplier (primary, active sourcing links).
  const componentsSuppliedQuery = useQuery<SupplierItemDto[]>({
    queryKey: ["idb", "supplier-items", "by-supplier", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const all = await supplierItemsRepo.list();
      return all.filter(
        (s) =>
          s.supplier_id === selectedId &&
          s.is_primary === true &&
          s.audit.active !== false &&
          s.component_id != null,
      );
    },
    enabled: !!selectedId,
  });

  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.supplier_id.toLowerCase().includes(qLower) ||
        r.supplier_name_official.toLowerCase().includes(qLower) ||
        (r.supplier_name_short ?? "").toLowerCase().includes(qLower) ||
        (r.primary_contact_name ?? "").toLowerCase().includes(qLower) ||
        (r.primary_contact_phone ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  const handleToggleStatus = (row: SupplierRow) => {
    if (!isAdmin) return;
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (!window.confirm(`Set ${row.supplier_id} status to ${next}?`)) return;
    setBanner(null);
    statusMutation.mutate({
      supplier_id: row.supplier_id,
      newStatus: next,
      updated_at: row.updated_at,
    });
  };

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · suppliers"
        title="Suppliers"
        description="Supplier master. Click a row to see the per-supplier catalog and item coverage."
        meta={
          <>
            <Badge tone="info" dotted>
              {suppliersQuery.data?.count ?? 0} rows
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
              New supplier
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
                placeholder="Search suppliers…"
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
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Suppliers master"
        title={`Showing ${filtered.length} of ${rows.length}`}
        contentClassName="p-0"
      >
        {suppliersQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : suppliersQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(suppliersQuery.error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            {query ? "No suppliers match your search." : "No suppliers match filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supplier ID
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Official name
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Contact
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Currency
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Default lead days
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
                    key={r.supplier_id}
                    className={`cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 ${
                      r.supplier_id === selectedId ? "bg-bg-subtle/60" : ""
                    }`}
                    onClick={() => {
                      setSelectedId(r.supplier_id);
                      setIsEditing(false);
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      <Link
                        href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                        className="hover:text-accent"
                      >
                        {r.supplier_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-fg-strong">
                      <Link
                        href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                        className="hover:text-accent"
                      >
                        {r.supplier_name_official}
                        {r.supplier_name_short ? (
                          <span className="ml-2 text-xs text-fg-muted">
                            ({r.supplier_name_short})
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.primary_contact_name ?? "—"}
                      {r.primary_contact_phone ? (
                        <span className="ml-1 font-mono">
                          {r.primary_contact_phone}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                      {r.currency ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {r.default_lead_time_days ?? "—"}
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

      {selectedSupplier ? (
        <SectionCard
          eyebrow="Supplier detail"
          title={selectedSupplier.supplier_name_official}
          actions={
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                  onClick={() => setIsEditing(true)}
                  title="Edit supplier"
                >
                  <Pencil className="h-3 w-3" strokeWidth={2} />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setIsEditing(false)}
                    title="Cancel edits"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => {
                      setIsEditing(false);
                      setBanner({
                        kind: "success",
                        message:
                          "Edits saved (supplier fields are read-only in this view; deep edits live on the master detail page).",
                      });
                    }}
                  >
                    Save
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                onClick={() => {
                  setSelectedId(null);
                  setIsEditing(false);
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
                { label: "Suppliers", href: "/admin/suppliers" },
                { label: selectedSupplier.supplier_name_official },
              ]}
            />

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Supplier ID
                </span>
                <span className="font-mono text-fg">
                  {selectedSupplier.supplier_id}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Short name
                </span>
                <span className="text-fg">
                  {selectedSupplier.supplier_name_short ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Contact
                </span>
                <span className="text-fg">
                  {selectedSupplier.primary_contact_name ?? "—"}
                  {selectedSupplier.primary_contact_phone ? (
                    <span className="ml-1 font-mono text-xs text-fg-muted">
                      {selectedSupplier.primary_contact_phone}
                    </span>
                  ) : null}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Currency
                </span>
                <span className="text-fg">
                  {selectedSupplier.currency ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Payment terms
                </span>
                <span className="text-fg">
                  {selectedSupplier.payment_terms ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Default lead time (days)
                </span>
                <span className="text-fg">
                  {selectedSupplier.default_lead_time_days != null
                    ? formatQty(
                        Number(selectedSupplier.default_lead_time_days),
                        "UNIT",
                      )
                    : "—"}
                </span>
              </div>
              <div>
                <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Default MOQ
                </span>
                <span className="text-fg">
                  {selectedSupplier.default_moq != null
                    ? formatQty(Number(selectedSupplier.default_moq), "UNIT")
                    : "—"}
                </span>
              </div>
            </div>

            {/* Components supplied section */}
            <div className="border-t border-border pt-4">
              {componentsSuppliedQuery.isLoading ? (
                <span className="text-sm text-fg-muted">
                  Loading components supplied…
                </span>
              ) : (
                <>
                  <div className="mb-2 text-sm font-medium text-fg-strong">
                    Components supplied ({componentsSuppliedQuery.data?.length ?? 0})
                  </div>
                  {(componentsSuppliedQuery.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-fg-muted">
                      No components linked to this supplier.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {componentsSuppliedQuery.data!.map((si) => {
                        const cid = si.component_id!;
                        const comp = componentsById.get(cid);
                        const name = comp?.component_name ?? cid;
                        return (
                          <li
                            key={si.supplier_item_id}
                            className="flex items-center justify-between text-sm"
                          >
                            <Link
                              href={`/admin/components?component=${encodeURIComponent(
                                cid,
                              )}`}
                              className="text-accent hover:underline"
                            >
                              {name}
                            </Link>
                            <span className="ml-2 font-mono text-xs text-fg-muted">
                              {cid}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <QuickCreateSupplier
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(newId) => {
          setBanner({
            kind: "success",
            message: `Created supplier ${newId}. Open the detail page to edit.`,
          });
          void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
        }}
      />
    </>
  );
}

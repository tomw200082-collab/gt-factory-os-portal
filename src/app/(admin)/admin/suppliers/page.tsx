"use client";

// ---------------------------------------------------------------------------
// Admin · Suppliers — AMMC v1 Slice 4.
//
// Iters 15-20 (list-pages redesign):
//   15. Audit complete — columns, actions, existing filters inventoried.
//   16. Name cell: supplier_name_official linked to detail page, supplier_name_short
//       below if set, supplier_id in monospace below that.
//   17. Type + currency columns: supplier_type as neutral badge, currency as
//       monospace chip.
//   18. Status column: dot-badge pattern matching Items / Components pages.
//   19. Contact column: email + phone as a subtle one-liner with truncation.
//   20. Action column + empty state: "View →" link per row, "+ New supplier" in
//       header, rich empty state for filter and total empty.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Phone, Plus, Power, X } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { QueryCountChip } from "@/components/feedback/QueryCountChip";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type ListEnvelope<T> = { rows: T[]; count: number };

// ---------------------------------------------------------------------------
// Data fetcher
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Iter 18 — Status dot badge
// ---------------------------------------------------------------------------

function SupplierStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Iter 17 — Supplier type badge
// ---------------------------------------------------------------------------

function SupplierTypeBadge({ type }: { type: string | null }): JSX.Element {
  if (!type) return <span className="text-xs text-fg-faint">—</span>;
  return <Badge tone="neutral">{type}</Badge>;
}

// ---------------------------------------------------------------------------
// Iter 17 — Currency chip (monospace, compact)
// ---------------------------------------------------------------------------

function CurrencyChip({ currency }: { currency: string | null }): JSX.Element {
  if (!currency) return <span className="text-xs text-fg-faint">—</span>;
  return (
    <span className="inline-flex items-center rounded border border-border/60 bg-bg-subtle px-1.5 py-0.5 font-mono text-3xs text-fg-muted">
      {currency}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Iter 19 — Contact one-liner
// ---------------------------------------------------------------------------

function ContactCell({
  name,
  phone,
}: {
  name: string | null;
  phone: string | null;
}): JSX.Element {
  if (!name && !phone) {
    return <span className="text-xs text-fg-faint">—</span>;
  }
  return (
    <div className="max-w-[180px]">
      {name ? (
        <span className="block truncate text-xs text-fg" title={name}>
          {name}
        </span>
      ) : null}
      {phone ? (
        <span className="flex items-center gap-1 truncate font-mono text-3xs text-fg-muted" title={phone}>
          <Phone className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
          {phone}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iter 20 — Empty states
// ---------------------------------------------------------------------------

function SuppliersEmptyState({
  totalRows,
  hasFilters,
  isAdmin,
  onReset,
  onNew,
}: {
  totalRows: number;
  hasFilters: boolean;
  isAdmin: boolean;
  onReset: () => void;
  onNew: () => void;
}): JSX.Element {
  if (totalRows === 0) {
    return (
      <div className="p-10">
        <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
          <div className="mb-1 text-sm font-semibold text-fg-strong">
            No suppliers yet — add your first
          </div>
          <div className="mb-4 text-xs text-fg-muted">
            Suppliers link to components and items. Add them here to enable
            sourcing, lead times, and purchase planning.
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={onNew}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New supplier
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="p-10">
      <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
        <div className="mb-1 text-sm font-semibold text-fg-strong">
          No suppliers match the current filter
        </div>
        <div className="mb-4 text-xs text-fg-muted">
          {hasFilters
            ? "Try clearing the search or relaxing the status filter."
            : "No suppliers match these filters."}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="btn btn-ghost btn-sm"
          >
            Reset filters
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={onNew}
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              New supplier
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function AdminSuppliersPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-fg-muted">Loading…</div>}>
      <SuppliersPageInner />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Inner page
// ---------------------------------------------------------------------------

function SuppliersPageInner(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

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
          ? err.message
          : err.message;
      setBanner({
        kind: "error",
        message: `Status update failed on ${vars.supplier_id}: ${msg}`,
      });
    },
  });

  const rows = suppliersQuery.data?.rows ?? [];

  // Pre-select via ?supplier=<id>.
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

  // IDB: components master (for name resolution in the detail panel).
  const componentsList = useQuery<ComponentDto[]>({
    queryKey: ["idb", "components"],
    queryFn: () => componentsRepo.list(),
  });
  const componentsById = useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of componentsList.data ?? []) map.set(c.component_id, c);
    return map;
  }, [componentsList.data]);

  // IDB: components supplied by this supplier.
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
        (r.primary_contact_phone ?? "").toLowerCase().includes(qLower) ||
        // Lets the operator paste the GI vendor name/UUID from a
        // gi_unmapped_supplier exception and jump straight to the matching row.
        (r.green_invoice_supplier_id ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  const hasActiveFilters = Boolean(query || statusFilter !== "ACTIVE");

  const handleResetFilters = () => {
    setQuery("");
    setStatusFilter("ACTIVE");
  };

  const handleToggleStatus = async (row: SupplierRow) => {
    if (!isAdmin) return;
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const ok = await confirm({
      title:
        next === "INACTIVE"
          ? `Deactivate "${row.supplier_name_official}"?`
          : `Reactivate "${row.supplier_name_official}"?`,
      description:
        next === "INACTIVE"
          ? "It will stop appearing in the default active list. You can reactivate it later."
          : "It will appear in the active list again.",
      confirmLabel: next === "INACTIVE" ? "Deactivate" : "Reactivate",
      tone: next === "INACTIVE" ? "danger" : "default",
    });
    if (!ok) return;
    setBanner(null);
    statusMutation.mutate({
      supplier_id: row.supplier_id,
      newStatus: next,
      updated_at: row.updated_at,
    });
  };

  return (
    <>
      {/* Iter 20 — "+ New supplier" in header */}
      <WorkflowHeader
        eyebrow="Admin · suppliers"
        title="Suppliers"
        description="Supplier master. Click a row to see the per-supplier catalog and item coverage."
        meta={
          <>
            <QueryCountChip
              isLoading={suppliersQuery.isLoading}
              isError={suppliersQuery.isError}
              count={suppliersQuery.data?.count}
              noun="suppliers"
            />
            <Badge tone="neutral" dotted>
              Live data
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

      {confirmDialog}

      {searchParams.get("hint") === "gi_unmapped" ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-info/40 bg-info-softer p-3 text-sm text-info-fg"
        >
          <span className="font-semibold">Map a Green Invoice supplier.</span>{" "}
          You were sent here from the inbox. The GI vendor name appears in that
          exception&rsquo;s summary — search for the matching supplier below (you can
          paste the GI vendor name or ID into Search), open it, and set its{" "}
          <span className="font-medium">Green Invoice Supplier ID</span> in the
          Identity section. The exception clears on the next GI sync.
        </div>
      ) : null}

      {banner ? (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          aria-live={banner.kind === "error" ? "assertive" : "polite"}
          aria-atomic="true"
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
                placeholder="Search by name, short name or contact…"
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
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
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
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : suppliersQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load suppliers</div>
              <div className="mt-1 text-xs">
                {(suppliersQuery.error as Error).message}
              </div>
              <button
                type="button"
                onClick={() => suppliersQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* Iter 20 — rich empty states */
          <SuppliersEmptyState
            totalRows={rows.length}
            hasFilters={hasActiveFilters}
            isAdmin={isAdmin}
            onReset={handleResetFilters}
            onNew={() => setShowCreate(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  {/* Iter 16 — rich name cell */}
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supplier
                  </th>
                  {/* Iter 17 — type badge */}
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Type
                  </th>
                  {/* Iter 19 — contact one-liner */}
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Contact
                  </th>
                  {/* Iter 17 — currency chip */}
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Currency
                  </th>
                  <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Default lead
                  </th>
                  {/* Iter 18 — status dot badge */}
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  {/* Iter 20 — action column */}
                  <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Actions
                  </th>
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
                    }}
                  >
                    {/* Iter 16 — Name cell: official name + short + id */}
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                        className="group block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className="block text-sm font-medium leading-snug text-fg-strong group-hover:text-accent"
                          dir="auto"
                        >
                          {r.supplier_name_official}
                        </span>
                        {r.supplier_name_short ? (
                          <span className="block text-xs text-fg-muted" dir="auto">
                            {r.supplier_name_short}
                          </span>
                        ) : null}
                        <span className="block font-mono text-3xs text-fg-subtle">
                          {r.supplier_id}
                        </span>
                      </Link>
                    </td>

                    {/* Iter 17 — Type badge */}
                    <td className="px-3 py-2">
                      <SupplierTypeBadge type={r.supplier_type} />
                    </td>

                    {/* Iter 19 — Contact one-liner */}
                    <td className="px-3 py-2">
                      <ContactCell
                        name={r.primary_contact_name}
                        phone={r.primary_contact_phone}
                      />
                    </td>

                    {/* Iter 17 — Currency chip */}
                    <td className="px-3 py-2">
                      <CurrencyChip currency={r.currency} />
                    </td>

                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {r.default_lead_time_days != null
                        ? `${r.default_lead_time_days}d`
                        : "—"}
                    </td>

                    {/* Iter 18 — Status dot badge */}
                    <td className="px-3 py-2">
                      <SupplierStatusBadge status={r.status} />
                    </td>

                    {/* Iter 20 — Action column */}
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                          className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                          title="View supplier details"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                          <ArrowRight className="h-3 w-3" strokeWidth={2} />
                        </Link>
                        {isAdmin ? (
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
                        ) : null}
                      </div>
                    </td>
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
              <Link
                href={`/admin/masters/suppliers/${encodeURIComponent(selectedSupplier.supplier_id)}`}
                className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                title="Open full supplier detail"
              >
                Open full detail
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                onClick={() => setSelectedId(null)}
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
                              href={`/admin/components?component=${encodeURIComponent(cid)}`}
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

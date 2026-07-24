"use client";

// ---------------------------------------------------------------------------
// Admin · Supplier-items — AMMC v1 Slice 4.
//
// Redesigned in 9 iterations:
//   1. Audit — columns, filters, inline edits, actions inventoried.
//   2. Supplier filter: large "Select supplier" prompt card when no supplier
//      is selected (not just a dropdown).
//   3. Supplier context bar above table when supplier IS selected: name linked
//      to supplier detail, status badge, item count, switcher.
//   4. Component/item name cells show name + link to detail; ID in monospace.
//   5. Lead time: LeadTimeChip (green ≤7d / amber ≤14d / red >14d) +
//      "Set lead time" italic prompt for admins when unset.
//   6. Approval status: ApprovalBadge with contextual tones
//      (APPROVED=success, PENDING=warning, REJECTED=danger).
//   7. Primary column: "Primary" green badge or "Set as primary" button for
//      admins; "—" for non-admins.
//   8. Cost column: currency-formatted display + "last updated" relative
//      timestamp next to inline edit.
//   9. Empty state after supplier selected, no items: "No supplier items for
//      this supplier yet — add the first one." with "+ Add supplier item" CTA.
//
// Original: AMMC v1 Slice 4 with InlineEditCell on lead_time_days, moq,
// pack_conversion, std_cost_per_inv_uom, order_uom.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import { ClassWEditDrawer } from "@/components/admin/ClassWEditDrawer";
import { formatQty, formatPrice } from "@/lib/utils/format-quantity";
import {
  AdminMutationError,
  patchEntity,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  sku: string | null;
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
  std_cost_per_inv_uom: string | null;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

// Iter 5 — Lead time chip: green ≤7d, amber ≤14d, red >14d.
function LeadTimeChip({
  days,
  isAdmin,
}: {
  days: number | null;
  isAdmin: boolean;
}): JSX.Element {
  if (days === null) {
    return isAdmin ? (
      <span className="text-3xs italic text-fg-faint">Set lead time</span>
    ) : (
      <span className="font-mono text-xs text-fg-faint">—</span>
    );
  }
  const cls =
    days <= 7
      ? "bg-success-softer text-success-fg border-success/30"
      : days <= 14
        ? "bg-warning-softer text-warning-fg border-warning/30"
        : "bg-danger-softer text-danger-fg border-danger/30";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${cls}`}
      title={`Lead time: ${days} days`}
    >
      {days}d
    </span>
  );
}

// Iter 6 — Approval badge with contextual tones.
function ApprovalBadge({ status }: { status: string | null }): JSX.Element {
  if (!status) return <span className="text-xs text-fg-faint">—</span>;
  const upper = status.toUpperCase();
  if (upper === "APPROVED")
    return (
      <Badge tone="success" dotted>
        {status}
      </Badge>
    );
  if (upper.includes("PENDING"))
    return (
      <Badge tone="warning" dotted>
        {status}
      </Badge>
    );
  if (upper === "REJECTED")
    return (
      <Badge tone="danger" dotted>
        {status}
      </Badge>
    );
  return (
    <Badge tone="neutral" dotted>
      {status}
    </Badge>
  );
}

// Iter 8 — Relative timestamp for "last updated".
function relativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [archivingRow, setArchivingRow] = useState<SupplierItemRow | null>(
    null,
  );
  const { confirm, dialog: confirmDialog } = useConfirm();

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
      const q = new URLSearchParams({ supplier_id: supplierId, limit: "1000" });
      return fetchJson(`/api/supplier-items?${q.toString()}`);
    },
    enabled: !!supplierId,
  });

  // Name-lookup maps for display (iter 4).
  const componentsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of componentsQuery.data?.rows ?? [])
      map.set(c.component_id, c.component_name);
    return map;
  }, [componentsQuery.data]);

  const itemsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of itemsQuery.data?.rows ?? [])
      map.set(i.item_id, i.item_name);
    return map;
  }, [itemsQuery.data]);

  // Field-level inline edit mutation.
  const fieldMutation = useMutation({
    mutationFn: async (args: {
      supplier_item_id: string;
      field:
        | "lead_time_days"
        | "moq"
        | "pack_conversion"
        | "std_cost_per_inv_uom"
        | "order_uom"
        | "safety_days";
      value: string | number | null;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "supplier-items"],
      });
      // Tranche 141 — supplier_items is also read by QuickFixDrawer
      // (["supplier-items","by-component",id]) and admin/components'
      // inline panel (["api","supplier-items",…]); invalidate the shared
      // top-level prefixes so both refresh too.
      void queryClient.invalidateQueries({ queryKey: ["supplier-items"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "supplier-items"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  // Iter 7 — promote primary mutation.
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
      // Tranche 141 — same cross-namespace sync as fieldMutation above.
      void queryClient.invalidateQueries({ queryKey: ["supplier-items"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "supplier-items"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setBanner({ kind: "error", message: `Promote-primary failed: ${msg}` });
    },
  });

  // Approval status mutation.
  const approvalStatusMutation = useMutation({
    mutationFn: async (args: {
      supplier_item_id: string;
      approval_status: string;
      updated_at: string;
    }) => {
      const res = await fetch(
        `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            approval_status: args.approval_status,
            if_match_updated_at: args.updated_at,
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body && typeof body === "object" && "message" in body
            ? String((body as { message?: unknown }).message)
            : "Could not save changes. Check your connection and try again.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "supplier-items"],
      });
      // Tranche 141 — same cross-namespace sync as fieldMutation above.
      void queryClient.invalidateQueries({ queryKey: ["supplier-items"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "supplier-items"] });
    },
    onError: (err: Error) => {
      setBanner({
        kind: "error",
        message: `Status update failed: ${err.message}`,
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (args: { supplier_item_id: string; updated_at: string }) =>
      postStatus({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}/status`,
        status: "INACTIVE",
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setArchivingRow(null);
      setBanner({ kind: "success", message: "Sourcing link archived." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "supplier-items"],
      });
      // Tranche 141 — this is a soft-delete; without these, QuickFixDrawer
      // and admin/components' inline panel kept showing the archived
      // sourcing link as still active.
      void queryClient.invalidateQueries({ queryKey: ["supplier-items"] });
      void queryClient.invalidateQueries({ queryKey: ["api", "supplier-items"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setBanner({ kind: "error", message: `Archive failed: ${msg}` });
    },
  });

  const rows = supplierItemsQuery.data?.rows ?? [];
  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter((r) => {
      const name = r.component_id
        ? (componentsMap.get(r.component_id) ?? "")
        : r.item_id
          ? (itemsMap.get(r.item_id) ?? "")
          : "";
      return (
        (r.component_id ?? "").toLowerCase().includes(qLower) ||
        (r.item_id ?? "").toLowerCase().includes(qLower) ||
        name.toLowerCase().includes(qLower)
      );
    });
  }, [rows, query, componentsMap, itemsMap]);

  // Options for QuickCreate drawer.
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
        sublabel: i.sku ?? i.item_id,
      })),
    [itemsQuery.data],
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.supplier_id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  return (
    <>
      {confirmDialog}
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Supplier items", href: "/admin/supplier-items" },
          ...(selectedSupplier
            ? [{ label: selectedSupplier.supplier_name_official }]
            : []),
        ]}
      />

      <WorkflowHeader
        eyebrow="Admin · Masters"
        title="Sourcing links"
        description="Map suppliers to the components and items they supply. Set lead times, MOQ, and pack sizes. Mark the primary supplier per item."
        meta={
          <Badge tone="neutral" dotted>
            Live data
          </Badge>
        }
        actions={
          isAdmin && supplierId ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New sourcing link
            </button>
          ) : null
        }
      />

      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          {banner.message}
        </div>
      ) : null}

      {/* Iter 2 — Prominent "Select supplier" card when no supplier is selected */}
      {!supplierId ? (
        <div className="card overflow-hidden border-2 border-dashed border-border/60">
          <div className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-subtle">
              <Building2
                className="h-7 w-7 text-fg-faint"
                strokeWidth={1.5}
              />
            </div>
            <div>
              <div className="text-base font-semibold text-fg-strong">
                Select a supplier to view their catalog
              </div>
              <div className="mt-1 text-sm text-fg-muted">
                Sourcing links are organized by supplier. Choose one below to
                browse or edit the items they supply.
              </div>
            </div>
            <div className="w-full max-w-xs">
              {suppliersQuery.isLoading ? (
                <div className="p-2 text-xs text-fg-muted">
                  Loading suppliers…
                </div>
              ) : suppliersQuery.isError ? (
                <div className="space-y-2 p-2 text-xs text-danger-fg">
                  <div>{(suppliersQuery.error as Error).message}</div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void suppliersQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <select
                  className="input w-full text-sm"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  autoFocus
                >
                  <option value="">— choose supplier —</option>
                  {sortedSuppliers.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name_official}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {suppliersQuery.data ? (
              <div className="text-3xs text-fg-faint">
                {suppliersQuery.data.count ?? suppliers.length} suppliers
                available
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* Iter 3 — Supplier context bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-bg-raised px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Building2
                className="h-4 w-4 shrink-0 text-fg-faint"
                strokeWidth={1.5}
              />
              <Link
                href={`/admin/suppliers?supplier=${encodeURIComponent(supplierId)}`}
                className="truncate font-semibold text-primary hover:underline"
              >
                {selectedSupplier?.supplier_name_official ?? supplierId}
              </Link>
              {selectedSupplier ? (
                <Badge
                  tone={
                    selectedSupplier.status === "ACTIVE" ? "success" : "neutral"
                  }
                  dotted
                >
                  {selectedSupplier.status}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-fg-muted">
                <span className="font-semibold text-fg">{rows.length}</span>{" "}
                {rows.length === 1 ? "item" : "items"}
              </span>
              <div className="h-4 w-px bg-border/50" />
              <select
                className="input h-7 py-0 text-xs"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                aria-label="Switch supplier"
              >
                {sortedSuppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name_official}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search bar */}
          <SectionCard title="Filter" density="compact" contentClassName="p-3 sm:p-4">
            <label className="block max-w-sm">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Search by name or code
              </span>
              <input
                className="input w-full"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items…"
              />
            </label>
          </SectionCard>

          <SectionCard
            eyebrow="Sourcing links"
            title={`Showing ${filtered.length} of ${rows.length}`}
            contentClassName="p-0"
          >
            {supplierItemsQuery.isLoading ? (
              <div className="p-5">
                <div className="space-y-2" aria-busy="true" aria-live="polite">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                    >
                      <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                      <div className="h-4 flex-1 rounded bg-bg-subtle" />
                      <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                    </div>
                  ))}
                </div>
              </div>
            ) : supplierItemsQuery.isError ? (
              <div className="p-5">
                <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
                  <div className="font-semibold">
                    Could not load supplier-items
                  </div>
                  <div className="mt-1 text-xs">
                    {(supplierItemsQuery.error as Error).message}
                  </div>
                  <button
                    type="button"
                    onClick={() => supplierItemsQuery.refetch()}
                    className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              /* Iter 9 — Empty state after supplier selected */
              <div className="p-10 text-center">
                <div className="mx-auto max-w-sm">
                  <div className="text-sm font-semibold text-fg-strong">
                    {rows.length === 0
                      ? "No supplier items for this supplier yet"
                      : "No supplier-items match the filters."}
                  </div>
                  <div className="mt-1 text-xs text-fg-muted">
                    {rows.length === 0
                      ? "Add the first sourcing link to connect this supplier to the components or items they supply."
                      : "Try clearing the search or relaxing the filters."}
                  </div>
                  {rows.length === 0 && isAdmin ? (
                    <button
                      type="button"
                      className="btn-primary mt-4 inline-flex items-center gap-1.5"
                      onClick={() => setShowCreate(true)}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      Add supplier item
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60">
                      <Th>Component / Item</Th>
                      <Th>Relationship</Th>
                      <Th>Order UoM</Th>
                      <Th>Approval</Th>
                      <Th align="right">Pack conversion</Th>
                      <Th align="right">Lead time</Th>
                      <Th align="right">Min. order qty</Th>
                      <Th align="right">Safety days</Th>
                      <Th align="right">Std cost (ILS)</Th>
                      <Th>Readiness</Th>
                      <Th>Primary</Th>
                      {isAdmin ? <Th>{""}</Th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.supplier_item_id}
                        className={
                          r.is_primary
                            ? "border-b border-border/40 bg-success-softer/20 last:border-b-0"
                            : "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                        }
                      >
                        {/* Iter 4 — Component/item name cell with link */}
                        <td className="px-3 py-2 text-xs text-fg">
                          {(() => {
                            const id = r.component_id ?? r.item_id;
                            const name = r.component_id
                              ? componentsMap.get(r.component_id)
                              : r.item_id
                                ? itemsMap.get(r.item_id)
                                : undefined;
                            const href = r.component_id
                              ? `/admin/components?component=${encodeURIComponent(r.component_id)}`
                              : r.item_id
                                ? `/admin/items?item=${encodeURIComponent(r.item_id)}`
                                : null;
                            if (!id)
                              return (
                                <span className="text-fg-faint">—</span>
                              );
                            return (
                              <>
                                {href ? (
                                  <Link
                                    href={href}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {name ?? id}
                                  </Link>
                                ) : (
                                  <span className="font-medium">
                                    {name ?? id}
                                  </span>
                                )}
                                {name ? (
                                  <div className="font-mono text-3xs text-fg-subtle">
                                    {id}
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-xs text-fg-muted">
                          {r.relationship ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-fg-muted">
                          {isAdmin ? (
                            <InlineEditCell
                              value={r.order_uom ?? ""}
                              type="text"
                              ifMatchUpdatedAt={r.updated_at}
                              onSave={async (newValue) => {
                                await fieldMutation.mutateAsync({
                                  supplier_item_id: r.supplier_item_id,
                                  field: "order_uom",
                                  value: newValue === "" ? null : newValue,
                                  updated_at: r.updated_at,
                                });
                              }}
                              ariaLabel={`Edit order UoM for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                            />
                          ) : (
                            r.order_uom ?? "—"
                          )}
                        </td>
                        {/* Iter 6 — Approval badge + editable dropdown for admins */}
                        <td className="px-3 py-2 text-xs">
                          {isAdmin ? (
                            <select
                              className="rounded border border-border bg-bg-raised px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/50"
                              aria-label={`Approval status for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                              value={r.approval_status ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                approvalStatusMutation.mutate({
                                  supplier_item_id: r.supplier_item_id,
                                  approval_status: val,
                                  updated_at: r.updated_at,
                                });
                              }}
                            >
                              <option value="">— set —</option>
                              <option value="approved">Approved</option>
                              <option value="pending">Pending</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          ) : (
                            <ApprovalBadge status={r.approval_status} />
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted"
                          title="Pack conversion: units per order pack. Affects stock math."
                        >
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
                              ariaLabel={`Edit pack conversion for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                            />
                          ) : (
                            formatQty(
                              Number(r.pack_conversion ?? 0),
                              r.order_uom ?? "RATIO",
                            )
                          )}
                        </td>
                        {/* Iter 5 — Lead time chip */}
                        <td
                          className="px-3 py-2 text-right text-xs tabular-nums"
                          title="Lead time affects planning recommendations — change with care."
                        >
                          {isAdmin ? (
                            <div className="flex flex-col items-end gap-0.5">
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
                                ariaLabel={`Edit lead time for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                              />
                              <LeadTimeChip
                                days={r.lead_time_days}
                                isAdmin={isAdmin}
                              />
                            </div>
                          ) : (
                            <LeadTimeChip
                              days={r.lead_time_days}
                              isAdmin={false}
                            />
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted"
                          title="Min. order qty affects planning recommendations — change with care."
                        >
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
                              ariaLabel={`Edit MOQ for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                            />
                          ) : r.moq != null ? (
                            formatQty(Number(r.moq), r.order_uom ?? "UNIT")
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                          {isAdmin ? (
                            <InlineEditCell
                              value={r.safety_days ?? 0}
                              type="number"
                              inputMode="numeric"
                              ifMatchUpdatedAt={r.updated_at}
                              onSave={async (newValue) => {
                                const clamped = Math.max(
                                  0,
                                  Math.round(Number(newValue) || 0),
                                );
                                await fieldMutation.mutateAsync({
                                  supplier_item_id: r.supplier_item_id,
                                  field: "safety_days",
                                  value: clamped,
                                  updated_at: r.updated_at,
                                });
                              }}
                              ariaLabel={`Edit safety days for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                            />
                          ) : (
                            <SafetyDaysChip days={r.safety_days} />
                          )}
                        </td>
                        {/* Iter 8 — Cost with currency formatting + last-updated timestamp */}
                        <td
                          className="px-3 py-2 text-right text-xs tabular-nums"
                          title="Standard cost — affects BOM costing rollups. Change with care."
                        >
                          {isAdmin ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <InlineEditCell
                                value={r.std_cost_per_inv_uom ?? ""}
                                type="number"
                                inputMode="decimal"
                                ifMatchUpdatedAt={r.updated_at}
                                onSave={async (newValue) => {
                                  await fieldMutation.mutateAsync({
                                    supplier_item_id: r.supplier_item_id,
                                    field: "std_cost_per_inv_uom",
                                    value: newValue,
                                    updated_at: r.updated_at,
                                  });
                                }}
                                ariaLabel={`Edit standard cost for ${r.component_id ?? r.item_id ?? r.supplier_item_id}`}
                              />
                              {r.std_cost_per_inv_uom != null ? (
                                <span className="font-mono text-success-fg">
                                  {formatPrice(
                                    Number(r.std_cost_per_inv_uom),
                                  )}
                                </span>
                              ) : null}
                              <span
                                className="text-3xs text-fg-faint"
                                title={r.updated_at}
                              >
                                {relativeTime(r.updated_at)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-mono font-medium">
                                {r.std_cost_per_inv_uom != null
                                  ? formatPrice(
                                      Number(r.std_cost_per_inv_uom),
                                    )
                                  : "—"}
                              </span>
                              {r.std_cost_per_inv_uom != null ? (
                                <span
                                  className="text-3xs text-fg-faint"
                                  title={r.updated_at}
                                >
                                  {relativeTime(r.updated_at)}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <ReadinessPill readiness={r.readiness} />
                        </td>
                        {/* Iter 7 — Primary badge or "Set as primary" button */}
                        <td className="px-3 py-2">
                          {r.is_primary ? (
                            <Badge tone="success" dotted>
                              Primary
                            </Badge>
                          ) : isAdmin ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-xs text-fg-muted hover:text-fg"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `Set as the primary source for ${r.component_id ?? r.item_id}?`,
                                  description:
                                    "The existing primary (if any) will be demoted. This affects planning cost and lead time for this item.",
                                  confirmLabel: "Set as primary",
                                });
                                if (!ok) return;
                                promotePrimaryMutation.mutate({
                                  supplier_item_id: r.supplier_item_id,
                                  updated_at: r.updated_at,
                                });
                              }}
                              disabled={promotePrimaryMutation.isPending}
                              title="Set this row as the primary supplier for this component/item"
                            >
                              Set as primary
                            </button>
                          ) : (
                            <span className="text-3xs text-fg-subtle">—</span>
                          )}
                        </td>
                        {isAdmin ? (
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-fg-subtle hover:text-danger-fg"
                              onClick={() => setArchivingRow(r)}
                            >
                              Archive
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
        </>
      )}

      {isAdmin ? (
        <QuickCreateSupplierItem
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setBanner({
              kind: "success",
              message: "Created sourcing link. List refreshing…",
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

      <ClassWEditDrawer
        open={archivingRow !== null}
        onClose={() => setArchivingRow(null)}
        title="Archive sourcing link"
        warning="Archiving this link removes it from planning and ordering workflows. If it is the primary link, planning will lose cost and lead time data for this component."
        onSave={async () => {
          if (!archivingRow) return;
          await archiveMutation.mutateAsync({
            supplier_item_id: archivingRow.supplier_item_id,
            updated_at: archivingRow.updated_at,
          });
        }}
        isSaving={archiveMutation.isPending}
        error={
          archiveMutation.isError
            ? (archiveMutation.error as Error).message
            : null
        }
      >
        <p className="text-sm text-fg-muted">
          {archivingRow
            ? `Sourcing link: ${archivingRow.supplier_id} → ${archivingRow.component_id ?? archivingRow.item_id ?? archivingRow.supplier_item_id}`
            : null}
        </p>
      </ClassWEditDrawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout helper
// ---------------------------------------------------------------------------

function SafetyDaysChip({ days }: { days: number }): JSX.Element {
  if (days === 0) return <span className="text-fg-faint text-xs">0d</span>;
  if (days <= 6) return <span className="rounded-full bg-warning-softer px-2 py-0.5 text-xs font-medium text-warning-fg">{days}d</span>;
  return <span className="rounded-full bg-success-softer px-2 py-0.5 text-xs font-medium text-success-fg">{days}d</span>;
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
      scope="col"
      className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

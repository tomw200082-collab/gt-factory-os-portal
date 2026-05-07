"use client";

// ---------------------------------------------------------------------------
// Admin · Items — list page.
//
// Iters 1-7 (list-pages redesign):
//   1. Audit complete — columns, filters, status badges, actions inventoried.
//   2. Name cell: item_name (large, dir="auto") + item_id in monospace below,
//      both linked to /admin/masters/items/{item_id}.
//   3. Supply method column: styled Badge (info=MANUFACTURED, neutral=BOUGHT_FINISHED,
//      warning=REPACK) instead of raw fmtSupplyMethod text.
//   4. Status column: dot badge — ACTIVE=success, PENDING=warning, INACTIVE=neutral.
//   5. Health column: compact completeness signal — Ready / Needs BOM /
//      Missing supplier / Blocker derived from existing readiness payload.
//   6. Empty state: filter empty → card with "Reset filters" CTA; total empty →
//      "Get started — create your first item."
//   7. Action column: "View →" link per row; "+ New item" in header. Status
//      toggle labelled clearly.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Power } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { QuickCreateItem } from "@/components/admin/quick-create/QuickCreateItem";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { formatQty } from "@/lib/utils/format-quantity";
import {
  AdminMutationError,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadinessPayload {
  is_ready: boolean;
  readiness_summary?: string;
  blockers: unknown[];
}

interface ItemRow {
  item_id: string;
  item_name: string;
  sku: string | null;
  family: string | null;
  pack_size: string | null;
  sales_uom: string | null;
  supply_method: string;
  item_type: string | null;
  status: string;
  primary_bom_head_id: string | null;
  base_bom_head_id: string | null;
  case_pack: number | null;
  product_group: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
  readiness?: ReadinessPayload | null;
  base_fill_qty_per_unit?: number | null;
  shelf_life_days?: number | null;
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
// Iter 4 — Status dot badge
// ---------------------------------------------------------------------------

function ItemStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Iter 3 — Supply method styled badge
// ---------------------------------------------------------------------------

function SupplyMethodBadge({ method }: { method: string }): JSX.Element {
  if (method === "MANUFACTURED") {
    return <Badge tone="info">Manufactured</Badge>;
  }
  if (method === "REPACK") {
    return <Badge tone="warning">Repack</Badge>;
  }
  if (method === "BOUGHT_FINISHED") {
    return <Badge tone="neutral">Purchased finished</Badge>;
  }
  return <Badge tone="neutral">{method}</Badge>;
}

// ---------------------------------------------------------------------------
// Iter 5 — Health signal pill derived from readiness payload
// ---------------------------------------------------------------------------

function HealthPill({
  readiness,
  supplyMethod,
  primaryBomHeadId,
}: {
  readiness?: ReadinessPayload | null;
  supplyMethod: string;
  primaryBomHeadId: string | null;
}): JSX.Element {
  // If we have real readiness data from the API, use it.
  if (readiness != null) {
    const blockers = readiness.blockers ?? [];
    if (blockers.length > 0) {
      return <Badge tone="danger" dotted>Blocker</Badge>;
    }
    if (readiness.is_ready) {
      return <Badge tone="success" dotted>Ready</Badge>;
    }
    // Not blocked, not ready — check what the summary says.
    const summary = (readiness.readiness_summary ?? "").toLowerCase();
    if (summary.includes("supplier")) {
      return <Badge tone="warning" dotted>Missing supplier</Badge>;
    }
    return <Badge tone="warning" dotted>Needs setup</Badge>;
  }

  // Fallback: derive cheaply from what the list row carries.
  if (
    supplyMethod === "MANUFACTURED" ||
    supplyMethod === "REPACK"
  ) {
    if (!primaryBomHeadId) {
      return <Badge tone="warning" dotted>Needs BOM</Badge>;
    }
  }
  return <Badge tone="neutral" dotted>—</Badge>;
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function AdminItemsPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-fg-muted">Loading…</div>}>
      <ItemsPageInner />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Iter 6 — Empty states (filter + total)
// ---------------------------------------------------------------------------

function ItemsEmptyState({
  totalRows,
  hasFilters,
  isAdmin,
  onReset,
}: {
  totalRows: number;
  hasFilters: boolean;
  isAdmin: boolean;
  onReset: () => void;
}): JSX.Element {
  if (totalRows === 0) {
    // Total empty — no items at all.
    return (
      <div className="p-10">
        <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
          <div className="mb-1 text-sm font-semibold text-fg-strong">
            Get started — create your first item
          </div>
          <div className="mb-4 text-xs text-fg-muted">
            Items are finished goods or bought-finished products. Add them here
            to unlock stock tracking, BOM links, and planning.
          </div>
          {isAdmin ? (
            <Link
              href="/admin/products/new"
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New product
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  // Filter empty.
  return (
    <div className="p-10">
      <div className="mx-auto max-w-sm rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center">
        <div className="mb-1 text-sm font-semibold text-fg-strong">
          No items match the current filter
        </div>
        <div className="mb-4 text-xs text-fg-muted">
          {hasFilters
            ? "Try clearing the search or relaxing the status / supply method filter."
            : "No items match these filters."}
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
            <Link
              href="/admin/products/new"
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              New product
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner page
// ---------------------------------------------------------------------------

function ItemsPageInner(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const preselectId = searchParams?.get("item") ?? null;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [supplyFilter, setSupplyFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(preselectId);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", statusFilter, supplyFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set("status", statusFilter);
      if (supplyFilter) q.set("supply_method", supplyFilter);
      q.set("include_readiness", "true");
      q.set("limit", "1000");
      return fetchJson(`/api/items?${q.toString()}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (args: {
      item_id: string;
      newStatus: string;
      updated_at: string;
    }) =>
      postStatus({
        url: `/api/items/${encodeURIComponent(args.item_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({
        kind: "success",
        message: `Status updated for ${vars.item_id} → ${vars.newStatus}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
    },
    onError: (err: Error, vars) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({
        kind: "error",
        message: `Status update failed on ${vars.item_id}: ${msg}`,
      });
    },
  });

  const rows = itemsQuery.data?.rows ?? [];

  useEffect(() => {
    if (!preselectId || rows.length === 0) return;
    const el = rowRefs.current.get(preselectId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(preselectId);
      const t = window.setTimeout(() => setHighlightedId(null), 2500);
      return () => window.clearTimeout(t);
    }
  }, [preselectId, rows]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.item_id.toLowerCase().includes(qLower) ||
        r.item_name.toLowerCase().includes(qLower) ||
        (r.sku ?? "").toLowerCase().includes(qLower) ||
        (r.family ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  const hasActiveFilters = Boolean(query || statusFilter !== "ACTIVE" || supplyFilter);

  const handleResetFilters = () => {
    setQuery("");
    setStatusFilter("ACTIVE");
    setSupplyFilter("");
  };

  const handleToggleStatus = (row: ItemRow) => {
    if (!isAdmin) return;
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (!window.confirm(`Set ${row.item_id} status to ${next}?`)) return;
    setBanner(null);
    statusMutation.mutate({
      item_id: row.item_id,
      newStatus: next,
      updated_at: row.updated_at,
    });
  };

  const selectedItem = preselectId
    ? rows.find((r) => r.item_id === preselectId) ?? null
    : null;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Items", href: "/admin/items" },
          ...(selectedItem ? [{ label: selectedItem.item_name }] : []),
        ]}
      />

      {/* Iter 7 — "+ New item" in header */}
      <WorkflowHeader
        eyebrow="Admin · items"
        title="Items"
        description="Finished goods and bought-finished item master. Click a row to open details."
        meta={
          <>
            <Badge tone="info" dotted>
              {itemsQuery.data?.count ?? 0} items
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCreate(true)}
                title="Quick create — minimum fields only."
              >
                Quick create
              </button>
              <Link
                href="/admin/products/new"
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                New item
              </Link>
            </div>
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
          <div className="block sm:col-span-2">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search
            </span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, SKU or ID…"
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
              <option value="PENDING">Pending</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Supply method
            </span>
            <select
              className="input"
              value={supplyFilter}
              onChange={(e) => setSupplyFilter(e.target.value)}
            >
              <option value="">(all)</option>
              <option value="MANUFACTURED">Manufactured</option>
              <option value="BOUGHT_FINISHED">Purchased finished</option>
              <option value="REPACK">Repack</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Items master"
        title={`Showing ${filtered.length} of ${rows.length}`}
        contentClassName="p-0"
      >
        {itemsQuery.isLoading ? (
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
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : itemsQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load items</div>
              <div className="mt-1 text-xs">
                {(itemsQuery.error as Error).message}
              </div>
              <button
                type="button"
                onClick={() => itemsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* Iter 6 — rich empty states */
          <ItemsEmptyState
            totalRows={rows.length}
            hasFilters={hasActiveFilters}
            isAdmin={isAdmin}
            onReset={handleResetFilters}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  {/* Iter 2 — Name cell (item_name + id) */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Family
                  </th>
                  {/* Iter 3 — Supply method badge */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supply method
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Sales unit
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Case pack
                  </th>
                  {/* Iter 5 — Health column */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Health
                  </th>
                  {/* Iter 4 — Status dot badge */}
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  {/* Iter 7 — Action column */}
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.item_id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(r.item_id, el);
                      else rowRefs.current.delete(r.item_id);
                    }}
                    className={
                      "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 " +
                      (highlightedId === r.item_id ? "bg-accent-softer/60" : "")
                    }
                  >
                    {/* Iter 2 — Rich name cell */}
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                        className="group block"
                      >
                        <span
                          className="block text-sm font-medium leading-snug text-fg-strong group-hover:text-accent"
                          dir="auto"
                        >
                          {r.item_name}
                        </span>
                        <span className="block font-mono text-3xs text-fg-subtle">
                          {r.item_id}
                          {r.sku && r.sku !== r.item_id ? (
                            <span className="ml-1.5 text-fg-faint">· {r.sku}</span>
                          ) : null}
                        </span>
                      </Link>
                    </td>

                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.family ?? "—"}
                    </td>

                    {/* Iter 3 — Supply method badge */}
                    <td className="px-3 py-2">
                      <SupplyMethodBadge method={r.supply_method} />
                    </td>

                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.sales_uom ?? "—"}
                    </td>

                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.case_pack != null && r.sales_uom
                        ? formatQty(r.case_pack, r.sales_uom)
                        : r.case_pack != null
                        ? r.case_pack
                        : "—"}
                    </td>

                    {/* Iter 5 — Health pill */}
                    <td className="px-3 py-2">
                      <HealthPill
                        readiness={r.readiness}
                        supplyMethod={r.supply_method}
                        primaryBomHeadId={r.primary_bom_head_id}
                      />
                    </td>

                    {/* Iter 4 — Status dot badge */}
                    <td className="px-3 py-2">
                      <ItemStatusBadge status={r.status} />
                    </td>

                    {/* Iter 7 — Action column */}
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                          className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                          title="View item details"
                        >
                          View
                          <ArrowRight className="h-3 w-3" strokeWidth={2} />
                        </Link>
                        {isAdmin ? (
                          <button
                            type="button"
                            title={`Toggle status (currently ${r.status})`}
                            className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                            onClick={() => handleToggleStatus(r)}
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

      <QuickCreateItem
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(newId) => {
          setBanner({
            kind: "success",
            message: `Created item ${newId}. Open the detail page to edit.`,
          });
          void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
        }}
      />
    </>
  );
}

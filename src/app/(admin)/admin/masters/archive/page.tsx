"use client";

// ---------------------------------------------------------------------------
// Admin: Masters: Archive -- UX iters 6-9
//   6. Restore button per row (admin-only) with inline confirmation
//   7. Row layout: name prominent, id as font-mono text-3xs secondary
//   8. InlineRestoreConfirm widget with confirm/cancel
//   9. Per-tab empty state with Archive icon + better messaging
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, X } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { AdminMutationError, patchEntity, postStatus } from "@/lib/admin/mutations";
import { formatIls } from "@/lib/utils/format-money";
import { fmtNumStr } from "@/lib/utils/format-quantity";

// --- Types ------------------------------------------------------------------

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  updated_at: string;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  status: string;
  updated_at: string;
}

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
  updated_at: string;
}

// Backend migration 0302 — api_read.v_unused_components.
// Components no live BOM consumes: orphaned raw/packaging stock that would
// otherwise rot invisibly. Not the same thing as an archived component —
// these are usually still ACTIVE, they just have nothing left to go into.
interface UnusedComponentRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  component_group: string | null;
  status: string;
  primary_supplier_id: string | null;
  supplier_name: string | null;
  qty_on_hand: string;
  inventory_uom: string | null;
  est_value_ils: string;
  expiry_date: string | null;
  days_to_expiry: number | null;
  last_movement_at: string | null;
  open_po_lines: number;
  last_used_by: string[];
  updated_at: string;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Restore = status change, which is its own endpoint (POST .../:id/status).
// This used to PATCH the entity with { status, if_match_updated_at }, but the
// PATCH schema has no `status` field (zod strips it) and requires an
// idempotency_key it was never sent — so every Restore button on this page
// returned 422 and nothing was ever restored. postStatus hits the right
// endpoint with the right body and mints the key, the same way
// /admin/items does it.
async function restoreToActive(baseUrl: string, ifMatchUpdatedAt: string): Promise<void> {
  await postStatus({ url: `${baseUrl}/status`, status: "ACTIVE", ifMatchUpdatedAt });
}

// 0302 — inline expiry edit. patchEntity mints the idempotency_key and folds in
// if_match_updated_at, and throws AdminMutationError carrying the server's
// conflict code, so the caller can tell STALE_ROW from a network failure.
async function patchExpiryDate(
  componentId: string,
  expiryDate: string | null,
  ifMatchUpdatedAt: string,
): Promise<void> {
  await patchEntity({
    url: `/api/components/${encodeURIComponent(componentId)}`,
    fields: { expiry_date: expiryDate },
    ifMatchUpdatedAt,
  });
}

function fmtDate(iso: string): string {
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

// ---------------------------------------------------------------------------
// Iter 8 -- InlineRestoreConfirm
// ---------------------------------------------------------------------------

function InlineRestoreConfirm({
  entityLabel,
  onConfirm,
  onCancel,
  isPending,
}: {
  entityLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success-softer px-2 py-1 text-xs text-success-fg">
      <span>Restore this {entityLabel}? It will become ACTIVE again.</span>
      <button
        type="button"
        className="font-semibold underline hover:no-underline"
        disabled={isPending}
        onClick={onConfirm}
      >
        {isPending ? "Restoring…" : "Yes, restore"}
      </button>
      <button
        type="button"
        className="text-fg-muted hover:text-fg"
        disabled={isPending}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

type EntityTab = "items" | "components" | "suppliers" | "unused";

// ---------------------------------------------------------------------------
// 0302 -- UnusedComponentRowView
// One row of the "Unused components" tab. expiry_date is inline-editable for
// admins (native date input -- no picker dependency), read-only for everyone
// else. The row tints when stock is expired or close to it, so a bookkeeper
// scanning the list sees what needs disposing first.
// ---------------------------------------------------------------------------

function UnusedComponentRowView({
  row,
  isAdmin,
  onSaveExpiry,
  isSaving,
}: {
  row: UnusedComponentRow;
  isAdmin: boolean;
  onSaveExpiry: (componentId: string, value: string | null, updatedAt: string) => void;
  isSaving: boolean;
}): JSX.Element {
  const days = row.days_to_expiry;
  const isExpired = days !== null && days < 0;
  const isSoon = days !== null && days >= 0 && days < 30;

  const tint = isExpired
    ? "bg-danger-softer/50"
    : isSoon
      ? "bg-warning-softer/50"
      : "";

  return (
    <tr className={`border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 ${tint}`}>
      <td className="px-3 py-2">
        <div className="text-sm font-medium text-fg">{row.component_name}</div>
        <div className="font-mono text-3xs text-fg-subtle">{row.component_id}</div>
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-fg">
        {fmtNumStr(row.qty_on_hand)}
        <span className="ml-1 text-3xs text-fg-subtle">{row.inventory_uom ?? ""}</span>
      </td>
      <td className="px-3 py-2 text-right text-xs font-medium tabular-nums text-fg">
        {formatIls(row.est_value_ils)}
      </td>
      <td className="px-3 py-2 text-xs text-fg-muted">
        {row.supplier_name ?? row.primary_supplier_id ?? "—"}
      </td>
      <td className="px-3 py-2 text-xs text-fg-subtle">
        {row.last_movement_at ? fmtDate(row.last_movement_at) : "Never"}
      </td>
      <td className="px-3 py-2">
        {isAdmin ? (
          <input
            type="date"
            aria-label={`Expiry date for ${row.component_name}`}
            defaultValue={row.expiry_date ?? ""}
            disabled={isSaving}
            className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs text-fg disabled:opacity-50"
            onBlur={(e) => {
              const next = e.target.value === "" ? null : e.target.value;
              if (next !== (row.expiry_date ?? null)) {
                onSaveExpiry(row.component_id, next, row.updated_at);
              }
            }}
          />
        ) : (
          <span className="text-xs text-fg-muted">{row.expiry_date ?? "—"}</span>
        )}
        {isExpired ? (
          <div className="mt-0.5 text-3xs font-medium text-danger-fg">
            Expired {Math.abs(days)}d ago
          </div>
        ) : isSoon ? (
          <div className="mt-0.5 text-3xs font-medium text-warning-fg">In {days}d</div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
        {row.open_po_lines > 0 ? row.open_po_lines : "—"}
      </td>
      <td className="px-3 py-2 text-3xs text-fg-subtle">
        {row.last_used_by.length > 0 ? (
          <span className="font-mono">{row.last_used_by.join(", ")}</span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMastersArchivePage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const [activeTab, setActiveTab] = useState<EntityTab>("items");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [banner, setBanner] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);
  const queryClient = useQueryClient();

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "archive", "items"],
    queryFn: () => fetchJson("/api/items?status=INACTIVE&limit=500"),
    staleTime: 60_000,
  });

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "archive", "components"],
    queryFn: () => fetchJson("/api/components?status=INACTIVE&limit=500"),
    staleTime: 60_000,
  });

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "archive", "suppliers"],
    queryFn: () => fetchJson("/api/suppliers?status=INACTIVE&limit=500"),
    staleTime: 60_000,
  });

  // 0302 -- components no live BOM consumes
  const unusedQuery = useQuery<ListEnvelope<UnusedComponentRow>>({
    queryKey: ["admin", "archive", "unused"],
    queryFn: () => fetchJson("/api/components/unused?limit=500"),
    staleTime: 60_000,
  });

  // Iter 6 -- restore mutations
  const restoreItemMutation = useMutation({
    mutationFn: (args: { item_id: string; updated_at: string }) =>
      restoreToActive(`/api/items/${encodeURIComponent(args.item_id)}`, args.updated_at),
    onSuccess: () => {
      setConfirmId(null);
      setBanner({ kind: "success", message: "Item restored and set to Active." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "items"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
    },
    onError: () => {
      setConfirmId(null);
      setBanner({
        kind: "error",
        message: "Could not restore this item. Refresh and try again.",
      });
    },
  });

  const restoreComponentMutation = useMutation({
    mutationFn: (args: { component_id: string; updated_at: string }) =>
      restoreToActive(`/api/components/${encodeURIComponent(args.component_id)}`, args.updated_at),
    onSuccess: () => {
      setConfirmId(null);
      setBanner({ kind: "success", message: "Component restored and set to Active." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "components"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
    },
    onError: () => {
      setConfirmId(null);
      setBanner({
        kind: "error",
        message: "Could not restore this component. Refresh and try again.",
      });
    },
  });

  const restoreSupplierMutation = useMutation({
    mutationFn: (args: { supplier_id: string; updated_at: string }) =>
      restoreToActive(`/api/suppliers/${encodeURIComponent(args.supplier_id)}`, args.updated_at),
    onSuccess: () => {
      setConfirmId(null);
      setBanner({ kind: "success", message: "Supplier restored and set to Active." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "suppliers"] });
    },
    onError: () => {
      setConfirmId(null);
      setBanner({
        kind: "error",
        message: "Could not restore this supplier. Refresh and try again.",
      });
    },
  });

  // 0302 -- inline expiry save
  const expiryMutation = useMutation({
    mutationFn: (args: { component_id: string; expiry_date: string | null; updated_at: string }) =>
      patchExpiryDate(args.component_id, args.expiry_date, args.updated_at),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Expiry date saved." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "unused"] });
    },
    onError: (err: Error) => {
      const stale = err instanceof AdminMutationError && err.code === "STALE_ROW";
      setBanner({
        kind: "error",
        message: stale
          ? "Someone else changed this component while you were editing. Refresh to see their change, then set the expiry date again."
          : `Could not save the expiry date (${err.message}). Refresh and try again.`,
      });
    },
  });

  const archivedItems = itemsQuery.data?.rows ?? [];
  const archivedComponents = componentsQuery.data?.rows ?? [];
  const archivedSuppliers = suppliersQuery.data?.rows ?? [];
  const unusedComponents = unusedQuery.data?.rows ?? [];

  const unusedTotalValue = useMemo(
    () => unusedComponents.reduce((sum, r) => sum + (Number(r.est_value_ils) || 0), 0),
    [unusedComponents],
  );

  const tabs: { key: EntityTab; label: string; count: number }[] = [
    { key: "items", label: "Items", count: archivedItems.length },
    { key: "components", label: "Components", count: archivedComponents.length },
    { key: "suppliers", label: "Suppliers", count: archivedSuppliers.length },
    { key: "unused", label: "Unused components", count: unusedComponents.length },
  ];

  return (
    <>
      <WorkflowHeader
        size="section"
        eyebrow="Admin · Masters"
        title="Archive"
        description="Archived master records — review and restore as needed. Records here are hidden from operational workflows."
        meta={<Badge tone="neutral">read-only</Badge>}
      />

      {banner ? (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          aria-live={banner.kind === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={
            banner.kind === "success"
              ? "flex items-start justify-between gap-3 rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "flex items-start justify-between gap-3 rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          <span>{banner.message}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            aria-label="Dismiss"
            onClick={() => setBanner(null)}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-border/60">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setActiveTab(t.key); setConfirmId(null); }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-b-2 border-accent text-accent"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
            {t.count > 0 ? (
              <span className="ml-1.5 rounded-full bg-bg-subtle px-1.5 py-0.5 text-3xs text-fg-muted">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === "items" ? (
        <ArchiveSection
          isLoading={itemsQuery.isLoading}
          isError={itemsQuery.isError}
          errorMessage={itemsQuery.isError ? (itemsQuery.error as Error).message : ""}
          emptyMessage="No archived items."
          emptyDetail="Items you deactivate will appear here."
        >
          {archivedItems.map((r) => (
            <tr key={r.item_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
              <td className="px-3 py-2">
                <div className="text-sm font-medium text-fg">
                  <Link href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`} className="hover:text-accent hover:underline">
                    {r.item_name}
                  </Link>
                </div>
                <div className="font-mono text-3xs text-fg-subtle">{r.item_id}</div>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{r.supply_method}</td>
              <td className="px-3 py-2 text-xs text-fg-subtle">{fmtDate(r.updated_at)}</td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  confirmId === r.item_id ? (
                    <InlineRestoreConfirm
                      entityLabel="item"
                      onConfirm={() => restoreItemMutation.mutate({ item_id: r.item_id, updated_at: r.updated_at })}
                      onCancel={() => setConfirmId(null)}
                      isPending={restoreItemMutation.isPending}
                    />
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      onClick={() => setConfirmId(r.item_id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                  )
                ) : (
                  <Link href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`} className="btn btn-ghost btn-sm">
                    View
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </ArchiveSection>
      ) : activeTab === "components" ? (
        <ArchiveSection
          isLoading={componentsQuery.isLoading}
          isError={componentsQuery.isError}
          errorMessage={componentsQuery.isError ? (componentsQuery.error as Error).message : ""}
          emptyMessage="No archived components."
          emptyDetail="Components you deactivate will appear here."
        >
          {archivedComponents.map((r) => (
            <tr key={r.component_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
              <td className="px-3 py-2">
                <div className="text-sm font-medium text-fg">
                  <Link href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`} className="hover:text-accent hover:underline">
                    {r.component_name}
                  </Link>
                </div>
                <div className="font-mono text-3xs text-fg-subtle">{r.component_id}</div>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted" />
              <td className="px-3 py-2 text-xs text-fg-subtle">{fmtDate(r.updated_at)}</td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  confirmId === r.component_id ? (
                    <InlineRestoreConfirm
                      entityLabel="component"
                      onConfirm={() => restoreComponentMutation.mutate({ component_id: r.component_id, updated_at: r.updated_at })}
                      onCancel={() => setConfirmId(null)}
                      isPending={restoreComponentMutation.isPending}
                    />
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      onClick={() => setConfirmId(r.component_id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                  )
                ) : (
                  <Link href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`} className="btn btn-ghost btn-sm">
                    View
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </ArchiveSection>
      ) : activeTab === "suppliers" ? (
        <ArchiveSection
          isLoading={suppliersQuery.isLoading}
          isError={suppliersQuery.isError}
          errorMessage={suppliersQuery.isError ? (suppliersQuery.error as Error).message : ""}
          emptyMessage="No archived suppliers."
          emptyDetail="Suppliers you deactivate will appear here."
        >
          {archivedSuppliers.map((r) => (
            <tr key={r.supplier_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
              <td className="px-3 py-2">
                <div className="text-sm font-medium text-fg">
                  <Link href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`} className="hover:text-accent hover:underline">
                    {r.supplier_name_short ?? r.supplier_name_official}
                  </Link>
                </div>
                <div className="font-mono text-3xs text-fg-subtle">{r.supplier_id}</div>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{r.supplier_name_official}</td>
              <td className="px-3 py-2 text-xs text-fg-subtle">{fmtDate(r.updated_at)}</td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  confirmId === r.supplier_id ? (
                    <InlineRestoreConfirm
                      entityLabel="supplier"
                      onConfirm={() => restoreSupplierMutation.mutate({ supplier_id: r.supplier_id, updated_at: r.updated_at })}
                      onCancel={() => setConfirmId(null)}
                      isPending={restoreSupplierMutation.isPending}
                    />
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      onClick={() => setConfirmId(r.supplier_id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                  )
                ) : (
                  <Link href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`} className="btn btn-ghost btn-sm">
                    View
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </ArchiveSection>
      ) : null}

      {activeTab === "unused" ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
            <p className="text-xs text-fg-muted">
              Components no live recipe uses any more. Their stock is still on the
              shelf and still counted — sell it, return it to the supplier, or
              write it off.
            </p>
            {unusedComponents.length > 0 ? (
              <p className="text-xs font-medium text-fg">
                Total tied up:{" "}
                <span className="tabular-nums">{formatIls(unusedTotalValue)}</span>
              </p>
            ) : null}
          </div>
          <ArchiveSection
            isLoading={unusedQuery.isLoading}
            isError={unusedQuery.isError}
            errorMessage={unusedQuery.isError ? (unusedQuery.error as Error).message : ""}
            emptyMessage="No unused components."
            emptyDetail="Every component is still consumed by at least one live recipe."
            columns={[
              { label: "Component" },
              { label: "On hand", align: "right" },
              { label: "Est. value", align: "right" },
              { label: "Supplier" },
              { label: "Last movement" },
              { label: "Expiry" },
              { label: "Open POs", align: "right" },
              { label: "Last used by" },
            ]}
          >
            {unusedComponents.map((r) => (
              <UnusedComponentRowView
                key={r.component_id}
                row={r}
                isAdmin={isAdmin}
                isSaving={
                  expiryMutation.isPending &&
                  expiryMutation.variables?.component_id === r.component_id
                }
                onSaveExpiry={(component_id, expiry_date, updated_at) =>
                  expiryMutation.mutate({ component_id, expiry_date, updated_at })
                }
              />
            ))}
          </ArchiveSection>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// ArchiveSection -- table shell with loading/error/empty states
// Iter 9: per-tab empty state with Archive icon
// ---------------------------------------------------------------------------

const DEFAULT_ARCHIVE_COLUMNS: ArchiveColumn[] = [
  { label: "Name" },
  { label: "Detail" },
  { label: "Archived" },
  { label: "", spacer: true },
];

type ArchiveColumn = { label: string; align?: "right"; spacer?: boolean };

function ArchiveSection({
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  emptyDetail,
  columns = DEFAULT_ARCHIVE_COLUMNS,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  emptyMessage: string;
  emptyDetail?: string;
  /** Defaults to the 4-column shell the items/components/suppliers tabs use. */
  columns?: ArchiveColumn[];
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="p-5">
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
            >
              <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
              <div className="h-4 flex-1 rounded bg-bg-subtle" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-5">
        <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <div className="font-semibold">Could not load archive</div>
          <div className="mt-1 text-xs">{errorMessage}</div>
        </div>
      </div>
    );
  }
  const rows = Array.isArray(children) ? children : [children];
  const hasRows = rows.length > 0 && rows.some(Boolean);
  if (!hasRows) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-fg-muted">
        <Archive className="h-8 w-8 text-fg-subtle/60" />
        <div className="text-sm font-medium">{emptyMessage}</div>
        {emptyDetail ? <div className="text-xs text-fg-subtle">{emptyDetail}</div> : null}
      </div>
    );
  }
  return (
    <SectionCard density="compact" contentClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              {columns.map((c, i) =>
                c.spacer ? (
                  <th key={i} className="px-3 py-2" />
                ) : (
                  <th
                    key={i}
                    scope="col"
                    className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {c.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </SectionCard>
  );
}

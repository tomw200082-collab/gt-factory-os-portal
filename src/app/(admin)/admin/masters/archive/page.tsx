"use client";

// ---------------------------------------------------------------------------
// Admin: Masters: Archive -- UX iters 6-9
//   6. Restore button per row (admin-only) with inline confirmation
//   7. Row layout: name prominent, id as font-mono text-3xs secondary
//   8. InlineRestoreConfirm widget with confirm/cancel
//   9. Per-tab empty state with Archive icon + better messaging
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";

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

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function patchStatus(
  url: string,
  newStatus: string,
  ifMatchUpdatedAt: string,
): Promise<void> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status: newStatus, if_match_updated_at: ifMatchUpdatedAt }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error((json as { message?: string } | null)?.message ?? `HTTP ${res.status}`);
  }
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

type EntityTab = "items" | "components" | "suppliers";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMastersArchivePage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const [activeTab, setActiveTab] = useState<EntityTab>("items");
  const [confirmId, setConfirmId] = useState<string | null>(null);
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

  // Iter 6 -- restore mutations
  const restoreItemMutation = useMutation({
    mutationFn: (args: { item_id: string; updated_at: string }) =>
      patchStatus(`/api/items/${encodeURIComponent(args.item_id)}`, "ACTIVE", args.updated_at),
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "items"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
    },
  });

  const restoreComponentMutation = useMutation({
    mutationFn: (args: { component_id: string; updated_at: string }) =>
      patchStatus(`/api/components/${encodeURIComponent(args.component_id)}`, "ACTIVE", args.updated_at),
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "components"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
    },
  });

  const restoreSupplierMutation = useMutation({
    mutationFn: (args: { supplier_id: string; updated_at: string }) =>
      patchStatus(`/api/suppliers/${encodeURIComponent(args.supplier_id)}`, "ACTIVE", args.updated_at),
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "archive", "suppliers"] });
    },
  });

  const archivedItems = itemsQuery.data?.rows ?? [];
  const archivedComponents = componentsQuery.data?.rows ?? [];
  const archivedSuppliers = suppliersQuery.data?.rows ?? [];

  const tabs: { key: EntityTab; label: string; count: number }[] = [
    { key: "items", label: "Items", count: archivedItems.length },
    { key: "components", label: "Components", count: archivedComponents.length },
    { key: "suppliers", label: "Suppliers", count: archivedSuppliers.length },
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
      ) : (
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
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ArchiveSection -- table shell with loading/error/empty states
// Iter 9: per-tab empty state with Archive icon
// ---------------------------------------------------------------------------

function ArchiveSection({
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  emptyDetail,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  emptyMessage: string;
  emptyDetail?: string;
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
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Name</th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Detail</th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Archived</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </SectionCard>
  );
}

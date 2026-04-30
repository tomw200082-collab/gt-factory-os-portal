"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Archive — shows all INACTIVE items, components, and
// suppliers so they can be reviewed and restored if needed.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

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

type EntityTab = "items" | "components" | "suppliers";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMastersArchivePage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<EntityTab>("items");

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
            onClick={() => setActiveTab(t.key)}
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
        >
          {archivedItems.map((r) => (
            <tr key={r.item_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.item_id}</td>
              <td className="px-3 py-2 text-sm text-fg">
                <Link href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`} className="hover:text-accent hover:underline">
                  {r.item_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{r.supply_method}</td>
              <td className="px-3 py-2 text-xs text-fg-subtle">{fmtDate(r.updated_at)}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`} className="btn btn-ghost btn-sm">
                  View / Restore
                </Link>
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
        >
          {archivedComponents.map((r) => (
            <tr key={r.component_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.component_id}</td>
              <td className="px-3 py-2 text-sm text-fg">
                <Link href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`} className="hover:text-accent hover:underline">
                  {r.component_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted" />
              <td className="px-3 py-2 text-xs text-fg-subtle">{fmtDate(r.updated_at)}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`} className="btn btn-ghost btn-sm">
                  View / Restore
                </Link>
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
        >
          {archivedSuppliers.map((r) => (
            <tr key={r.supplier_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.supplier_id}</td>
              <td className="px-3 py-2 text-sm text-fg">
                <Link href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`} className="hover:text-accent hover:underline">
                  {r.supplier_name_short ?? r.supplier_name_official}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{r.supplier_name_official}</td>
              <td className="px-3 py-2 text-xs text-fg-subtle">{fmtDate(r.updated_at)}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`} className="btn btn-ghost btn-sm">
                  View / Restore
                </Link>
              </td>
            </tr>
          ))}
        </ArchiveSection>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ArchiveSection — table shell with loading/error/empty states
// ---------------------------------------------------------------------------

function ArchiveSection({
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  emptyMessage: string;
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
    return <div className="p-6 text-sm text-fg-muted">{emptyMessage}</div>;
  }
  return (
    <SectionCard density="compact" contentClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Code</th>
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

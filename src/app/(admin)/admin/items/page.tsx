"use client";

// ---------------------------------------------------------------------------
// Admin · Items — AMMC v1 Slice 4 (crystalline-drifting-dusk §G Slice 4).
//
// Extensions over the prior read-only list:
//   - Readiness pill column (consumes ?include_readiness=true from list GET)
//   - "+ New item" button in the header → opens <QuickCreateItem> drawer
//   - Inline status toggle action per row (POST /api/items/[id]/status)
//   - List query invalidation on every create / status change
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import { QuickCreateItem } from "@/components/admin/quick-create/QuickCreateItem";
import {
  AdminMutationError,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

const SUPPLY_METHOD_LABELS: Record<string, string> = {
  MANUFACTURED: "Manufactured",
  REPACK: "Repack",
  BOUGHT_FINISHED: "Purchased finished",
};
function fmtSupplyMethod(s: string): string {
  return SUPPLY_METHOD_LABELS[s] ?? s;
}

interface ReadinessPayload {
  is_ready: boolean;
  readiness_summary?: string;
  blockers: unknown[];
}

interface ItemRow {
  item_id: string;
  item_name: string;
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

export default function AdminItemsPage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [supplyFilter, setSupplyFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
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

  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.item_id.toLowerCase().includes(qLower) ||
        r.item_name.toLowerCase().includes(qLower) ||
        (r.family ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

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

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · items"
        title="Items"
        description="Finished goods and bought-finished item master. Click a row for details or use + New Item to add an item."
        meta={
          <>
            <Badge tone="info" dotted>
              {itemsQuery.data?.count ?? 0} rows
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
                title="Quick create — minimum fields only. The wizard is the guided flow."
              >
                Quick create
              </button>
              <Link
                href="/admin/products/new"
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                New product
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
                placeholder="Search items…"
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
              <option value="MANUFACTURED">MANUFACTURED</option>
              <option value="BOUGHT_FINISHED">BOUGHT_FINISHED</option>
              <option value="REPACK">REPACK</option>
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
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : itemsQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(itemsQuery.error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">{query ? "No items match your search." : "No items match filters."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item ID
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Family
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supply
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Sales UoM
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
                    key={r.item_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                        className="hover:text-accent"
                      >
                        {r.item_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-fg-strong">
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                        className="hover:text-accent"
                      >
                        {r.item_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.family ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                      {r.supply_method ? fmtSupplyMethod(r.supply_method) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.sales_uom ?? "—"}
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
                          onClick={() => handleToggleStatus(r)}
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

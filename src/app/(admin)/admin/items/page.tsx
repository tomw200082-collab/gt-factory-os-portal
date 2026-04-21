"use client";

// ---------------------------------------------------------------------------
// Admin · Items — read-only live view.
//
// Endgame Phase D1 (crystalline-drifting-dusk §B.D1): un-quarantine the
// admin items page against live API GET /api/v1/queries/items (via the
// portal proxy at /api/items). v1 is strictly read-only — no edit buttons.
// CRUD UIs for items ship post-launch per plan §A.2.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

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
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

export default function AdminItemsPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [supplyFilter, setSupplyFilter] = useState<string>("");

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", statusFilter, supplyFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set("status", statusFilter);
      if (supplyFilter) q.set("supply_method", supplyFilter);
      q.set("limit", "1000");
      return fetchJson(`/api/items?${q.toString()}`);
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

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · read-only"
        title="Items"
        description="Finished-goods and bought-finished master data. CRUD actions ship post-launch; this view is read-only."
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
      />

      <SectionCard title="Filters" density="compact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search (id / name / family)
            </span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter client-side…"
            />
          </label>
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
          <div className="p-5 text-sm text-fg-muted">No items match filters.</div>
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
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.item_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.item_id}
                    </td>
                    <td className="px-3 py-2 text-fg-strong">{r.item_name}</td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.family ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                      {r.supply_method}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.sales_uom ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

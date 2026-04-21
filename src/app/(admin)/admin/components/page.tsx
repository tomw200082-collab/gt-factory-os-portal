"use client";

// ---------------------------------------------------------------------------
// Admin · Components — read-only live view.
//
// Endgame Phase D1: un-quarantine against GET /api/v1/queries/components.
// Read-only v1. Admin role-gate at the layout level.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

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

export default function AdminComponentsPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", statusFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set("status", statusFilter);
      q.set("limit", "1000");
      return fetchJson(`/api/components?${q.toString()}`);
    },
  });

  const rows = componentsQuery.data?.rows ?? [];
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

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · read-only"
        title="Components"
        description="Raw-material and packaging master data. CRUD actions ship post-launch; this view is read-only."
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
      />

      <SectionCard title="Filters" density="compact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search (id / name / class)
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
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Components master"
        title={`Showing ${filtered.length} of ${rows.length}`}
        contentClassName="p-0"
      >
        {componentsQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : componentsQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(componentsQuery.error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No components match filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Component ID
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Class
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Inv UoM
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Primary supplier
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Lead days
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.component_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
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
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                      {r.primary_supplier_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                      {r.lead_time_days ?? "—"}
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

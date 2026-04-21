"use client";

// ---------------------------------------------------------------------------
// Admin · Suppliers — read-only live view.
//
// Endgame Phase D1: un-quarantine against GET /api/v1/queries/suppliers.
// Read-only v1. Admin role-gate at the layout level.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

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
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

export default function AdminSuppliersPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", statusFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set("status", statusFilter);
      q.set("limit", "1000");
      return fetchJson(`/api/suppliers?${q.toString()}`);
    },
  });

  const rows = suppliersQuery.data?.rows ?? [];
  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.supplier_id.toLowerCase().includes(qLower) ||
        r.supplier_name_official.toLowerCase().includes(qLower) ||
        (r.supplier_name_short ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · read-only"
        title="Suppliers"
        description="Supplier master. CRUD actions ship post-launch; this view is read-only."
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
      />

      <SectionCard title="Filters" density="compact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search (id / name)
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
            No suppliers match filters.
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.supplier_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.supplier_id}
                    </td>
                    <td className="px-3 py-2 text-fg-strong">
                      {r.supplier_name_official}
                      {r.supplier_name_short ? (
                        <span className="ml-2 text-xs text-fg-muted">
                          ({r.supplier_name_short})
                        </span>
                      ) : null}
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

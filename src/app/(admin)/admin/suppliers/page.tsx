"use client";

// ---------------------------------------------------------------------------
// Admin · Suppliers — AMMC v1 Slice 4.
//
// Extensions: + New supplier drawer, inline status toggle.
// A13 decision: no v_supplier_readiness view exists in migration 0069 (plan
// §E names 4 views: item / component / bom_version / supplier_item).
// Supplier-level readiness would require a new view for aggregate
// supplier → supplier_item health; deferred as follow-on. Readiness column
// omitted for suppliers in this slice.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { QuickCreateSupplier } from "@/components/admin/quick-create/QuickCreateSupplier";
import {
  AdminMutationError,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

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
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

export default function AdminSuppliersPage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [showCreate, setShowCreate] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

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
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({
        kind: "error",
        message: `Status update failed on ${vars.supplier_id}: ${msg}`,
      });
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

  const handleToggleStatus = (row: SupplierRow) => {
    if (!isAdmin) return;
    const next = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (!window.confirm(`Set ${row.supplier_id} status to ${next}?`)) return;
    setBanner(null);
    statusMutation.mutate({
      supplier_id: row.supplier_id,
      newStatus: next,
      updated_at: row.updated_at,
    });
  };

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · suppliers"
        title="Suppliers"
        description="Supplier master. AMMC v1 Slice 4: + New drawer, status toggle. Per-supplier catalog + readiness land in Slice 5."
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

      <QuickCreateSupplier
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(newId) => {
          setBanner({
            kind: "success",
            message: `Created supplier ${newId}. Detail edits land in Slice 5.`,
          });
          void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
        }}
      />
    </>
  );
}

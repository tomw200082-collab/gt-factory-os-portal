"use client";

// ---------------------------------------------------------------------------
// Planner · Purchase Orders — read-only live view.
//
// Endgame Phase C2 (crystalline-drifting-dusk §B.C2):
//   - Read-only list backed by GET /api/v1/queries/purchase-orders
//     (via portal proxy at /api/purchase-orders).
//   - Columns: po_number, supplier_id, status, order_date,
//     expected_receive_date, total_net, source_recommendation_id
//     (rendered as "from recommendation" badge when populated),
//     created_at.
//   - Status filter bar (OPEN | PARTIAL | RECEIVED | CANCELLED | all).
//   - Sort: created_at desc (server returns in that order).
//   - No edit actions. No "Convert to PO" button here — that lives on
//     /runs/[run_id] rec detail (C1 commit 2ec7899). v1 strictly
//     read-only per plan §D.2 + §A.2 (admin CRUD UIs post-launch).
// ---------------------------------------------------------------------------

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";

// Mirror of api/src/purchase-orders/schemas.ts. Keep byte-aligned with
// upstream; drift is a bug.
interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
  order_date: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  total_gross: string | null;
  notes: string | null;
  site_id: string;
  source_run_id: string | null;
  source_recommendation_id: string | null;
  created_by_user_id: string;
  created_by_snapshot: string;
  created_at: string;
  updated_at: string;
}

interface PurchaseOrdersListResponse {
  rows: PurchaseOrderRow[];
  count: number;
}

type POStatus = "OPEN" | "PARTIAL" | "RECEIVED" | "CANCELLED";
const STATUS_OPTIONS: POStatus[] = ["OPEN", "PARTIAL", "RECEIVED", "CANCELLED"];

function fmtMoney(value: string | null | undefined, currency: string): string {
  if (!value) return "—";
  const n = Number(value);
  if (isNaN(n)) return value;
  if (n === 0) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${value} ${currency}`;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Failed to load purchase orders. Check your connection and try refreshing.");
  }
  return (await res.json()) as T;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function POStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "OPEN") return <Badge tone="info" dotted>Open</Badge>;
  if (status === "PARTIAL") return <Badge tone="warning" dotted>Partial</Badge>;
  if (status === "RECEIVED")
    return <Badge tone="success" variant="solid">Received</Badge>;
  if (status === "CANCELLED")
    return <Badge tone="neutral" dotted>Cancelled</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

export default function PurchaseOrdersListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialStatuses = searchParams.getAll("status").filter(
    (s): s is POStatus => STATUS_OPTIONS.includes(s as POStatus),
  );
  const [statusFilter, setStatusFilter] = useState<POStatus[] | null>(
    initialStatuses.length > 0 ? initialStatuses : ["OPEN", "PARTIAL"],
  );
  const [query, setQuery] = useState("");

  const applyStatusFilter = useCallback((s: POStatus[] | null) => {
    setStatusFilter(s);
    const params = new URLSearchParams();
    for (const [key, val] of searchParams.entries()) {
      if (key !== "status") params.append(key, val);
    }
    if (s && s.length > 0) {
      s.forEach((status) => params.append("status", status));
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const posQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["planner", "purchase-orders", statusFilter ? [...statusFilter].sort().join(",") : "all"],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter && statusFilter.length > 0) {
        statusFilter.forEach((s) => q.append("status", s));
      }
      q.set("limit", "500");
      return fetchJson(`/api/purchase-orders?${q.toString()}`);
    },
  });

  // Separate "all" query used only for stats (avoids distorting stats when a filter is active).
  const allPosQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["planner", "purchase-orders", "all"],
    queryFn: () => fetchJson(`/api/purchase-orders?limit=500`),
    staleTime: 60_000,
  });
  const allRows = allPosQuery.data?.rows ?? [];
  const stats = useMemo(() => {
    const openRows = allRows.filter((r) => r.status === "OPEN");
    const partialRows = allRows.filter((r) => r.status === "PARTIAL");
    const receivedRows = allRows.filter((r) => r.status === "RECEIVED");
    const openValue = openRows.reduce((s, r) => s + Number(r.total_net ?? 0), 0);
    const partialValue = partialRows.reduce((s, r) => s + Number(r.total_net ?? 0), 0);
    const currency = allRows[0]?.currency ?? "ILS";
    return {
      openCount: openRows.length, partialCount: partialRows.length,
      receivedCount: receivedRows.length,
      openValue, partialValue, currency,
    };
  }, [allRows]);

  const rows = posQuery.data?.rows ?? [];
  const total = posQuery.data?.count ?? 0;

  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.po_number.toLowerCase().includes(qLower) ||
        r.po_id.toLowerCase().includes(qLower) ||
        r.supplier_id.toLowerCase().includes(qLower) ||
        (r.supplier_name ?? "").toLowerCase().includes(qLower) ||
        (r.notes ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace · read-only"
        title="Purchase orders"
        description="Live read of private_core.purchase_orders. POs are created from the Convert-to-PO action on an approved recommendation (see a run detail). This view is read-only in v1; admin CRUD UIs ship post-launch."
        meta={
          <>
            <Badge tone="info" dotted>
              {total} PO{total === 1 ? "" : "s"}
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
        }
      />

      {allPosQuery.data && (
        <div className="flex flex-wrap gap-3 mb-1" data-testid="po-stats-bar">
          <button
            type="button"
            onClick={() => {
              const isOnlyOpen = statusFilter?.length === 1 && statusFilter.includes("OPEN");
              applyStatusFilter(isOnlyOpen ? null : ["OPEN"]);
            }}
            className={cn(
              "flex flex-col gap-0.5 rounded-md border px-4 py-2.5 text-left transition-colors",
              statusFilter?.length === 1 && statusFilter.includes("OPEN")
                ? "border-info/50 bg-info-softer"
                : "border-border/60 bg-bg-raised hover:border-border-strong",
            )}
          >
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Open</span>
            <span className="text-lg font-bold tabular-nums text-fg">{stats.openCount}</span>
            <span className="text-3xs text-fg-faint">{fmtMoney(String(stats.openValue), stats.currency)}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const isOnlyPartial = statusFilter?.length === 1 && statusFilter.includes("PARTIAL");
              applyStatusFilter(isOnlyPartial ? null : ["PARTIAL"]);
            }}
            className={cn(
              "flex flex-col gap-0.5 rounded-md border px-4 py-2.5 text-left transition-colors",
              statusFilter?.length === 1 && statusFilter.includes("PARTIAL")
                ? "border-warning/50 bg-warning/5"
                : "border-border/60 bg-bg-raised hover:border-border-strong",
            )}
          >
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Partial</span>
            <span className="text-lg font-bold tabular-nums text-warning-fg">{stats.partialCount}</span>
            <span className="text-3xs text-fg-faint">{fmtMoney(String(stats.partialValue), stats.currency)}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const isOnlyReceived = statusFilter?.length === 1 && statusFilter.includes("RECEIVED");
              applyStatusFilter(isOnlyReceived ? null : ["RECEIVED"]);
            }}
            className={cn(
              "flex flex-col gap-0.5 rounded-md border px-4 py-2.5 text-left transition-colors",
              statusFilter?.length === 1 && statusFilter.includes("RECEIVED")
                ? "border-success/50 bg-success/5"
                : "border-border/60 bg-bg-raised hover:border-border-strong",
            )}
          >
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Received</span>
            <span className="text-lg font-bold tabular-nums text-success-fg">{stats.receivedCount}</span>
          </button>
        </div>
      )}

      <SectionCard contentClassName="p-0">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="po-list-filter-bar"
        >
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Status
          </span>
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter !== null && statusFilter.includes(s);
            return (
              <button
                key={s}
                type="button"
                data-testid={`po-list-filter-status-${s}`}
                aria-pressed={active}
                onClick={() => {
                  if (active) {
                    const next = (statusFilter ?? []).filter((x) => x !== s);
                    applyStatusFilter(next.length > 0 ? next : null);
                  } else {
                    applyStatusFilter([s]);
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  active
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {s}
              </button>
            );
          })}
          <button
            type="button"
            className="btn btn-sm"
            data-testid="po-list-filter-clear"
            onClick={() => applyStatusFilter(null)}
          >
            All
          </button>
          <input
            className="input input-sm ml-auto max-w-xs"
            placeholder="Search po_number / supplier / notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {posQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : posQuery.isError ? (
          <div
            className="p-5 text-sm text-danger-fg"
            data-testid="po-list-error"
          >
            Failed to load purchase orders. Check your connection and try refreshing.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                rows.length === 0
                  ? "No purchase orders yet."
                  : "No POs match the current filter."
              }
              description={
                rows.length === 0
                  ? "POs are created by clicking Convert to PO on an approved recommendation."
                  : "Clear the filter or widen the search."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-sm"
              data-testid="po-list-table"
            >
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    PO number
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supplier
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Order date
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Expected receive
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Total net
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Source
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.po_id}
                    className="cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    data-testid="po-list-row"
                    data-po-id={r.po_id}
                    data-status={r.status}
                    onClick={() => router.push(`/purchase-orders/${encodeURIComponent(r.po_id)}`)}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      <Link
                        href={`/purchase-orders/${encodeURIComponent(r.po_id)}`}
                        className="hover:text-accent"
                      >
                        {r.po_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.supplier_name ?? (
                        <span className="font-mono">{r.supplier_id}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <POStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDate(r.order_date)}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDate(r.expected_receive_date)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-fg">
                      {fmtMoney(r.total_net, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.source_recommendation_id ? (
                        <Badge tone="info" dotted>
                          from recommendation
                        </Badge>
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDateTime(r.created_at)}
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

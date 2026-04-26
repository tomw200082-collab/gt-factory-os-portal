"use client";

// ---------------------------------------------------------------------------
// Planner · Purchase Orders — read-only live view + manual creation entry.
//
// Endgame Phase C2 (crystalline-drifting-dusk §B.C2) + 2026-04-26 manual-PO
// amendment (CLAUDE.md §"PO workflow" updated to permit planner/admin manual
// creation alongside the recommendation-bridge path):
//   - Read-only list backed by GET /api/v1/queries/purchase-orders
//     (via portal proxy at /api/purchase-orders).
//   - Columns: po_number, supplier_id, status, order_date,
//     expected_receive_date, total_net, source (recommendation / manual),
//     created_at.
//   - Status filter bar (OPEN | PARTIAL | RECEIVED | CANCELLED | all).
//   - Sort: created_at desc (server returns in that order).
//   - Two PO creation paths (planner/admin only):
//     1. "מתוך המלצת רכש" → /planning/runs (recommendation-bridge)
//     2. "הזמנה ידנית" → /purchase-orders/new (manual creation)
//     Operators and viewers do NOT see the creation dropdown.
// ---------------------------------------------------------------------------

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";
import { useCapability } from "@/lib/auth/role-gate";

// Mirror of api/src/purchase-orders/schemas.ts. Keep byte-aligned with
// upstream; drift is a bug.
// source_type added 2026-04-26: 'recommendation' | 'manual' | undefined (older
// rows may not return this field; render gracefully when undefined).
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
  source_type?: "recommendation" | "manual";
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

// Derive a human-readable source label from source_type.
// source_recommendation_id is used as a fallback for pre-amendment rows that
// don't yet carry source_type.
function sourceLabel(row: PurchaseOrderRow): string | null {
  if (row.source_type === "manual") return "ידני";
  if (row.source_type === "recommendation") return "המלצת רכש";
  // Legacy rows: infer from presence of source_recommendation_id.
  if (row.source_recommendation_id) return "המלצת רכש";
  return null;
}

// ---------------------------------------------------------------------------
// New PO dropdown — planner/admin only. Two options:
//   1. מתוך המלצת רכש → /planning/runs
//   2. הזמנה ידנית    → /purchase-orders/new
// ---------------------------------------------------------------------------
function NewPoDropdown(): JSX.Element | null {
  const canCreate = useCapability("planning:execute");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!canCreate) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="po-list-new-po-trigger"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft/80 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        + הזמנת רכש חדשה
        <svg
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-md border border-border bg-bg-raised shadow-lg"
        >
          <Link
            href="/planning/runs"
            role="menuitem"
            data-testid="po-list-new-from-recommendation"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-fg hover:bg-bg-subtle/60 transition-colors first:rounded-t-md"
          >
            <span className="text-fg-muted text-xs">1.</span>
            מתוך המלצת רכש
          </Link>
          <button
            type="button"
            role="menuitem"
            data-testid="po-list-new-manual"
            onClick={() => { setOpen(false); router.push("/purchase-orders/new"); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-fg hover:bg-bg-subtle/60 transition-colors last:rounded-b-md text-left"
          >
            <span className="text-fg-muted text-xs">2.</span>
            הזמנה ידנית
          </button>
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrdersListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // canCreate is not used directly here — it's checked inside NewPoDropdown.
  // We read it here so the query is available for the empty-state button.
  const canCreate = useCapability("planning:execute");
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
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD for ISO date comparison
    const base = !query ? rows : rows.filter((r) => {
      const qLower = query.toLowerCase();
      return (
        r.po_number.toLowerCase().includes(qLower) ||
        r.po_id.toLowerCase().includes(qLower) ||
        r.supplier_id.toLowerCase().includes(qLower) ||
        (r.supplier_name ?? "").toLowerCase().includes(qLower) ||
        (r.notes ?? "").toLowerCase().includes(qLower)
      );
    });
    const isActive = (r: PurchaseOrderRow) => r.status === "OPEN" || r.status === "PARTIAL";
    const isOverdue = (r: PurchaseOrderRow) => isActive(r) && !!r.expected_receive_date && r.expected_receive_date < today;
    return [...base].sort((a, b) => {
      const aOv = isOverdue(a), bOv = isOverdue(b);
      if (aOv && !bOv) return -1;
      if (!aOv && bOv) return 1;
      const aDate = a.expected_receive_date ?? "9999-99-99";
      const bDate = b.expected_receive_date ?? "9999-99-99";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.po_number.localeCompare(b.po_number);
    });
  }, [rows, query]);

  return (
    <>
      <WorkflowHeader
        eyebrow="הזמנות רכש"
        title="הזמנות רכש"
        description="Live read of private_core.purchase_orders. POs are created from an approved recommendation or manually by planners and admins."
        meta={
          <>
            <Badge tone="info" dotted>
              {total} PO{total === 1 ? "" : "s"}
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
            {/* Two PO creation paths (planner/admin only): recommendation-bridge
                and manual. NewPoDropdown renders null for operator/viewer. */}
            <NewPoDropdown />
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
            {rows.length === 0 ? (
              <EmptyState
                title="אין הזמנות רכש פתוחות"
                description="To create a PO from a recommendation, go to planning runs."
                action={canCreate ? <NewPoDropdown /> : undefined}
              />
            ) : (
              <EmptyState
                title="No POs match the current filter."
                description="Clear the filter or widen the search."
              />
            )}
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
                    <td className="px-3 py-2 text-xs">
                      {r.expected_receive_date ? (() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const isLate = (r.status === "OPEN" || r.status === "PARTIAL") && r.expected_receive_date < today;
                        const daysLate = isLate
                          ? Math.floor((Date.now() - new Date(r.expected_receive_date).getTime()) / 86400000)
                          : 0;
                        return (
                          <>
                            <span className={isLate ? "text-danger-fg font-medium" : "text-fg-muted"}>
                              {fmtDate(r.expected_receive_date)}
                            </span>
                            {isLate && (
                              <div className="text-3xs text-danger-fg/80">
                                Late by {daysLate} day{daysLate === 1 ? "" : "s"}
                              </div>
                            )}
                          </>
                        );
                      })() : <span className="text-fg-faint">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-fg">
                      {fmtMoney(r.total_net, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {(() => {
                        const lbl = sourceLabel(r);
                        if (!lbl) return <span className="text-fg-faint">—</span>;
                        if (lbl === "המלצת רכש") return <Badge tone="info" dotted>המלצת רכש</Badge>;
                        if (lbl === "ידני") return <Badge tone="warning" dotted>ידני</Badge>;
                        return <span className="text-fg-faint">{lbl}</span>;
                      })()}
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

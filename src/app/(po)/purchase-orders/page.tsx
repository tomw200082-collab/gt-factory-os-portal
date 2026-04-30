"use client";

// ---------------------------------------------------------------------------
// Planner · Purchase Orders — read-only live list with manual creation entry.
//
// Endgame Phase C2 (crystalline-drifting-dusk §B.C2) + 2026-04-26 manual-PO
// amendment + 2026-04-27 English UX redesign:
//   - Read-only list backed by GET /api/v1/queries/purchase-orders
//     (via portal proxy at /api/purchase-orders).
//   - Stat tiles: Open / Partial / Late (derived) / Received — clickable
//     filter chips.
//   - Status filter row + search.
//   - Default sort: late first → expected receive date → po_number.
//   - Two PO creation paths (planner/admin only):
//       1. From recommendation → /planning/runs (recommendation-bridge)
//       2. Manual entry        → /purchase-orders/new (manual creation)
//     Operators and viewers do NOT see the creation dropdown.
// ---------------------------------------------------------------------------

import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  ClipboardList,
  FilePlus2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";
import { useCapability } from "@/lib/auth/role-gate";

// ---------------------------------------------------------------------------
// Types — mirror of api/src/purchase-orders/schemas.ts.
// source_type added 2026-04-26: 'recommendation' | 'manual' | undefined
// (older rows may not return this field — we infer from
// source_recommendation_id when missing).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Formatting helpers — locale forced to en-US for stable, predictable display
// regardless of browser locale (Tom is on Hebrew browser locale; the previous
// undefined-locale call rendered Hebrew month abbreviations like "באפר׳").
// ---------------------------------------------------------------------------
function fmtMoney(value: string | null | undefined, currency: string): string {
  if (!value) return "—";
  const n = Number(value);
  if (isNaN(n)) return value;
  if (n === 0) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${value} ${currency}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
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
    return new Date(iso).toLocaleString("en-US", {
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      "Failed to load purchase orders. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as T;
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

// Derive a human-readable source label from source_type. Falls back to
// inferring from source_recommendation_id for pre-amendment rows.
function sourceKind(row: PurchaseOrderRow): "recommendation" | "manual" | null {
  if (row.source_type === "manual") return "manual";
  if (row.source_type === "recommendation") return "recommendation";
  if (row.source_recommendation_id) return "recommendation";
  return null;
}

function SourceBadge({ row }: { row: PurchaseOrderRow }): JSX.Element {
  const kind = sourceKind(row);
  if (kind === "recommendation") {
    return <Badge tone="info" dotted>Recommendation</Badge>;
  }
  if (kind === "manual") {
    return <Badge tone="warning" dotted>Manual</Badge>;
  }
  return <span className="text-fg-faint">—</span>;
}

// ---------------------------------------------------------------------------
// New PO dropdown — planner/admin only. Two options:
//   1. From recommendation → /planning/runs
//   2. Manual entry        → /purchase-orders/new
// ---------------------------------------------------------------------------
function NewPoDropdown(): JSX.Element | null {
  const canCreate = useCapability("planning:execute");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!canCreate) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="po-list-new-po-trigger"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition-colors",
          "hover:bg-accent-soft/80 hover:border-accent/60",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        New purchase order
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[280px] rounded-md border border-border bg-bg-raised shadow-pop animate-fade-in-up overflow-hidden"
        >
          <Link
            href="/planning/runs"
            role="menuitem"
            data-testid="po-list-new-from-recommendation"
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 px-4 py-3 text-sm text-fg hover:bg-bg-subtle/60 transition-colors border-b border-border/40"
          >
            <Sparkles
              className="h-4 w-4 shrink-0 mt-0.5 text-accent"
              aria-hidden
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold">From recommendation</span>
              <span className="text-3xs text-fg-faint">
                Convert an approved planning recommendation into a PO.
              </span>
            </div>
          </Link>
          <button
            type="button"
            role="menuitem"
            data-testid="po-list-new-manual"
            onClick={() => {
              setOpen(false);
              router.push("/purchase-orders/new");
            }}
            className="flex w-full items-start gap-3 px-4 py-3 text-sm text-fg hover:bg-bg-subtle/60 transition-colors text-left"
          >
            <FilePlus2
              className="h-4 w-4 shrink-0 mt-0.5 text-warning-fg"
              aria-hidden
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold">Manual entry</span>
              <span className="text-3xs text-fg-faint">
                Create a PO directly without a recommendation. Reason required.
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile — clickable filter chip.
// ---------------------------------------------------------------------------
interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  sublabel?: string;
  active: boolean;
  tone: "info" | "warning" | "danger" | "success";
  onClick: () => void;
  testId?: string;
}

function KpiTile({
  icon,
  label,
  count,
  sublabel,
  active,
  tone,
  onClick,
  testId,
}: KpiTileProps): JSX.Element {
  const toneClasses = {
    info: {
      activeBorder: "border-info/50 bg-info-softer",
      countText: "text-fg",
      iconText: "text-info-fg",
    },
    warning: {
      activeBorder: "border-warning/50 bg-warning/5",
      countText: "text-warning-fg",
      iconText: "text-warning-fg",
    },
    danger: {
      activeBorder: "border-danger/50 bg-danger/5",
      countText: "text-danger-fg",
      iconText: "text-danger-fg",
    },
    success: {
      activeBorder: "border-success/50 bg-success/5",
      countText: "text-success-fg",
      iconText: "text-success-fg",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={cn(
        "group flex flex-col gap-1 rounded-md border px-4 py-3 text-left transition-colors min-w-[140px]",
        active
          ? toneClasses.activeBorder
          : "border-border/60 bg-bg-raised hover:border-border-strong",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("inline-flex", toneClasses.iconText)}>{icon}</span>
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {label}
        </span>
      </div>
      <span
        className={cn(
          "text-2xl font-bold tabular-nums leading-none",
          toneClasses.countText,
        )}
      >
        {count}
      </span>
      {sublabel && (
        <span className="text-3xs text-fg-faint tabular-nums">{sublabel}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PurchaseOrdersListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const canCreate = useCapability("planning:execute");

  const initialStatuses = searchParams.getAll("status").filter(
    (s): s is POStatus => STATUS_OPTIONS.includes(s as POStatus),
  );
  const [statusFilter, setStatusFilter] = useState<POStatus[] | null>(
    initialStatuses.length > 0 ? initialStatuses : ["OPEN", "PARTIAL"],
  );
  const [lateOnly, setLateOnly] = useState(false);
  const [query, setQuery] = useState("");

  const applyStatusFilter = useCallback(
    (s: POStatus[] | null) => {
      setStatusFilter(s);
      setLateOnly(false);
      const params = new URLSearchParams();
      for (const [key, val] of searchParams.entries()) {
        if (key !== "status") params.append(key, val);
      }
      if (s && s.length > 0) {
        s.forEach((status) => params.append("status", status));
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const posQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: [
      "planner",
      "purchase-orders",
      statusFilter ? [...statusFilter].sort().join(",") : "all",
    ],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter && statusFilter.length > 0) {
        statusFilter.forEach((s) => q.append("status", s));
      }
      q.set("limit", "500");
      return fetchJson(`/api/purchase-orders?${q.toString()}`);
    },
  });

  // "All" query used for stats — independent of current filter so the tiles
  // always show full ground truth.
  const allPosQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["planner", "purchase-orders", "all"],
    queryFn: () => fetchJson(`/api/purchase-orders?limit=500`),
    staleTime: 60_000,
  });

  const allRows = allPosQuery.data?.rows ?? [];

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const openRows = allRows.filter((r) => r.status === "OPEN");
    const partialRows = allRows.filter((r) => r.status === "PARTIAL");
    const receivedRows = allRows.filter((r) => r.status === "RECEIVED");
    const lateRows = allRows.filter(
      (r) =>
        (r.status === "OPEN" || r.status === "PARTIAL") &&
        !!r.expected_receive_date &&
        r.expected_receive_date < today,
    );
    const openValue = openRows.reduce(
      (s, r) => s + Number(r.total_net ?? 0),
      0,
    );
    const partialValue = partialRows.reduce(
      (s, r) => s + Number(r.total_net ?? 0),
      0,
    );
    const currency = allRows[0]?.currency ?? "ILS";
    return {
      openCount: openRows.length,
      partialCount: partialRows.length,
      receivedCount: receivedRows.length,
      lateCount: lateRows.length,
      openValue,
      partialValue,
      currency,
    };
  }, [allRows]);

  const rows = posQuery.data?.rows ?? [];
  const total = posQuery.data?.count ?? 0;

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const queryFiltered = !query
      ? rows
      : rows.filter((r) => {
          const qLower = query.toLowerCase();
          return (
            r.po_number.toLowerCase().includes(qLower) ||
            r.po_id.toLowerCase().includes(qLower) ||
            r.supplier_id.toLowerCase().includes(qLower) ||
            (r.supplier_name ?? "").toLowerCase().includes(qLower) ||
            (r.notes ?? "").toLowerCase().includes(qLower)
          );
        });
    const isActive = (r: PurchaseOrderRow) =>
      r.status === "OPEN" || r.status === "PARTIAL";
    const isOverdue = (r: PurchaseOrderRow) =>
      isActive(r) &&
      !!r.expected_receive_date &&
      r.expected_receive_date < today;
    const lateFiltered = lateOnly
      ? queryFiltered.filter(isOverdue)
      : queryFiltered;
    return [...lateFiltered].sort((a, b) => {
      const aOv = isOverdue(a),
        bOv = isOverdue(b);
      if (aOv && !bOv) return -1;
      if (!aOv && bOv) return 1;
      const aDate = a.expected_receive_date ?? "9999-99-99";
      const bDate = b.expected_receive_date ?? "9999-99-99";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.po_number.localeCompare(b.po_number);
    });
  }, [rows, query, lateOnly]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Purchase Orders"
        title="Purchase Orders"
        description="Live read of approved purchase orders. Created from approved planning recommendations or manually by planners and admins."
        meta={
          <>
            <Badge tone="info" dotted>
              {total} PO{total === 1 ? "" : "s"}
            </Badge>
            <Badge tone="neutral" dotted>
              Live
            </Badge>
            <NewPoDropdown />
          </>
        }
      />

      {/* KPI tile row — 4 tiles: Open / Partial / Late / Received */}
      {allPosQuery.data && (
        <div
          className="flex flex-wrap gap-3 mb-2"
          data-testid="po-stats-bar"
        >
          <KpiTile
            icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />}
            label="Open"
            count={stats.openCount}
            sublabel={fmtMoney(String(stats.openValue), stats.currency)}
            tone="info"
            active={
              statusFilter?.length === 1 &&
              statusFilter.includes("OPEN") &&
              !lateOnly
            }
            onClick={() => {
              const isOnlyOpen =
                statusFilter?.length === 1 &&
                statusFilter.includes("OPEN") &&
                !lateOnly;
              applyStatusFilter(isOnlyOpen ? null : ["OPEN"]);
            }}
            testId="po-stat-open"
          />
          <KpiTile
            icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
            label="Partial"
            count={stats.partialCount}
            sublabel={fmtMoney(String(stats.partialValue), stats.currency)}
            tone="warning"
            active={
              statusFilter?.length === 1 &&
              statusFilter.includes("PARTIAL") &&
              !lateOnly
            }
            onClick={() => {
              const isOnlyPartial =
                statusFilter?.length === 1 &&
                statusFilter.includes("PARTIAL") &&
                !lateOnly;
              applyStatusFilter(isOnlyPartial ? null : ["PARTIAL"]);
            }}
            testId="po-stat-partial"
          />
          <KpiTile
            icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            label="Late"
            count={stats.lateCount}
            sublabel="Past expected receive"
            tone="danger"
            active={lateOnly}
            onClick={() => {
              if (lateOnly) {
                setLateOnly(false);
              } else {
                setStatusFilter(["OPEN", "PARTIAL"]);
                setLateOnly(true);
                const params = new URLSearchParams();
                for (const [key, val] of searchParams.entries()) {
                  if (key !== "status") params.append(key, val);
                }
                params.append("status", "OPEN");
                params.append("status", "PARTIAL");
                router.replace(`?${params.toString()}`, { scroll: false });
              }
            }}
            testId="po-stat-late"
          />
          <KpiTile
            icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />}
            label="Received"
            count={stats.receivedCount}
            tone="success"
            active={
              statusFilter?.length === 1 &&
              statusFilter.includes("RECEIVED") &&
              !lateOnly
            }
            onClick={() => {
              const isOnlyReceived =
                statusFilter?.length === 1 &&
                statusFilter.includes("RECEIVED") &&
                !lateOnly;
              applyStatusFilter(isOnlyReceived ? null : ["RECEIVED"]);
            }}
            testId="po-stat-received"
          />
        </div>
      )}

      <SectionCard contentClassName="p-0">
        {/* Filter row */}
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="po-list-filter-bar"
        >
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Status
          </span>
          {STATUS_OPTIONS.map((s) => {
            const active =
              statusFilter !== null && statusFilter.includes(s);
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
          {lateOnly && (
            <button
              type="button"
              onClick={() => setLateOnly(false)}
              className="inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger/5 px-2 py-1 text-3xs font-semibold uppercase tracking-sops text-danger-fg hover:bg-danger/10 transition-colors"
              aria-label="Clear late filter"
            >
              Late only ×
            </button>
          )}

          <div className="ml-auto relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted pointer-events-none"
              aria-hidden
            />
            <input
              className="input input-sm pl-8 w-full sm:w-72"
              placeholder="Search PO number, supplier, notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {posQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : posQuery.isError ? (
          <div className="p-5">
            <div
              className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
              data-testid="po-list-error"
            >
              <div className="font-semibold">Could not load purchase orders</div>
              <div className="mt-1 text-xs">
                Check your connection. The list will refresh when the API is reachable.
              </div>
              <button
                type="button"
                onClick={() => void posQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            {rows.length === 0 ? (
              <EmptyState
                title="No purchase orders yet"
                description="Approve a planning recommendation to convert it into a PO, or use Manual entry for an exception order."
                action={canCreate ? <NewPoDropdown /> : undefined}
              />
            ) : lateOnly ? (
              <EmptyState
                title="No late purchase orders"
                description="Nothing is past its expected receive date. Clear the Late filter to see all matching orders."
              />
            ) : (
              <EmptyState
                title="No purchase orders match the current filter"
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
                  <th className="px-4 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    PO number
                  </th>
                  <th className="px-3 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Supplier
                  </th>
                  <th className="px-3 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Order date
                  </th>
                  <th className="px-3 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Expected
                  </th>
                  <th className="px-3 py-2.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Total net
                  </th>
                  <th className="px-3 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Source
                  </th>
                  <th className="px-3 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const isLate =
                    (r.status === "OPEN" || r.status === "PARTIAL") &&
                    !!r.expected_receive_date &&
                    r.expected_receive_date < today;
                  const daysLate = isLate
                    ? Math.floor(
                        (Date.now() -
                          new Date(r.expected_receive_date!).getTime()) /
                          86400000,
                      )
                    : 0;
                  return (
                    <tr
                      key={r.po_id}
                      className={cn(
                        "cursor-pointer border-b border-border/40 last:border-b-0 transition-colors",
                        "hover:bg-bg-subtle/40",
                        isLate && "bg-danger/[0.02]",
                      )}
                      data-testid="po-list-row"
                      data-po-id={r.po_id}
                      data-status={r.status}
                      onClick={() =>
                        router.push(
                          `/purchase-orders/${encodeURIComponent(r.po_id)}`,
                        )
                      }
                    >
                      <td className="px-4 py-2.5 font-mono text-xs">
                        <Link
                          href={`/purchase-orders/${encodeURIComponent(r.po_id)}`}
                          className="font-semibold text-fg hover:text-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.po_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-fg">
                        {r.supplier_name ?? (
                          <span className="font-mono text-fg-muted">
                            {r.supplier_id}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <POStatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-fg-muted tabular-nums">
                        {fmtDate(r.order_date)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {r.expected_receive_date ? (
                          <div className="flex flex-col">
                            <span
                              className={cn(
                                "tabular-nums",
                                isLate
                                  ? "font-semibold text-danger-fg"
                                  : "text-fg-muted",
                              )}
                            >
                              {fmtDate(r.expected_receive_date)}
                            </span>
                            {isLate && (
                              <span className="text-3xs font-semibold text-danger-fg">
                                {daysLate} day{daysLate === 1 ? "" : "s"} late
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-fg tabular-nums">
                        {fmtMoney(r.total_net, r.currency)}
                      </td>
                      <td className="px-3 py-2.5">
                        <SourceBadge row={r} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-fg-muted tabular-nums">
                        {fmtDateTime(r.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

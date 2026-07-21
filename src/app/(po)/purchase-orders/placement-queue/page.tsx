"use client";

// ---------------------------------------------------------------------------
// Placement queue — /purchase-orders/placement-queue (tranche 086 Part A).
//
// The office manager's (bookkeeping) "orders to place" worklist: POs the
// planner approved into APPROVED_TO_ORDER. She enters supplier-confirmed price
// + payment terms per PO and places the order (→ OPEN), which then flows to
// goods receipt. Hebrew + RTL operator surface (authorized in CLAUDE.md).
//
// Gate: planning:execute (planner + admin). There is no separate bookkeeper
// role in the locked role lattice; the office manager signs in as planner.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  ClipboardCheck,
  CheckCircle2,
  X,
  Ban,
  Search,
} from "lucide-react";
import { RoleGate } from "@/lib/auth/role-gate";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { ApiError, usePlacementQueue, type QueuePo } from "./_lib/api";
import { PlacementRow } from "./_components/PlacementRow";

// Filter/sort (Tom-directed 2026-07-16 — every corridor page needs them).
// Client-side over the already-fetched queue; the default order-by-date sort
// (urgency-first, set by usePlacementQueue) stays the default sort key here.
type SortKey = "order_by_date" | "amount_desc" | "supplier";

const SORTERS: Record<SortKey, (a: QueuePo, b: QueuePo) => number> = {
  order_by_date: (a, b) => {
    const ax = a.order_by_date ?? "9999-12-31";
    const bx = b.order_by_date ?? "9999-12-31";
    return ax < bx ? -1 : ax > bx ? 1 : a.po_number.localeCompare(b.po_number);
  },
  amount_desc: (a, b) => Number(b.total_net) - Number(a.total_net),
  supplier: (a, b) =>
    (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "", "he"),
};

function QueueInner(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = usePlacementQueue();
  const rows = data?.rows ?? [];
  const todayIso = new Date().toISOString().slice(0, 10);
  // Always computed from the FULL queue — a supplier filter must never shrink
  // the reported overdue count, or it would hide real exposure behind an
  // active filter (same correctness rule as the procurement ActionList).
  const overdueCount = rows.filter(
    (po) => !!po.order_by_date && po.order_by_date < todayIso,
  ).length;

  const [supplierQuery, setSupplierQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("order_by_date");
  const isFiltered = supplierQuery.trim() !== "";
  const visibleRows = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    return rows
      .filter((po) => !q || (po.supplier_name ?? "").toLowerCase().includes(q))
      .sort(SORTERS[sortKey]);
  }, [rows, supplierQuery, sortKey]);
  // Durable success confirmation: a placed PO's row unmounts (it leaves the
  // queue), so the page owns the "order placed" banner.
  const [placed, setPlaced] = useState<{
    po_id: string;
    po_number: string;
  } | null>(null);
  // Durable discard confirmation — the cancelled row unmounts on refetch, so
  // the page owns the "order removed from queue" banner (Tom-directed).
  // ux-release-gate 2026-07-21 FLOW-105: po_id captured too, so the banner
  // can link to the PO where the reason persists in the notes.
  const [cancelled, setCancelled] = useState<{
    po_id: string;
    po_number: string;
    reason: string;
  } | null>(null);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <WorkflowHeader
        size="section"
        eyebrow="רכש"
        title="הזמנות לביצוע"
        description="הזמנות שאושרו וממתינות לביצוע מול הספק. הזינו מחיר ותנאי תשלום לכל הזמנה, ובצעו אותה — היא תיפתח ותעבור לקבלת סחורה."
      />

      {placed ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-success/40 bg-success-softer px-4 py-3 text-sm text-success-fg"
          data-testid="placement-queue-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            ההזמנה <span className="font-semibold">{placed.po_number}</span>{" "}
            בוצעה ונפתחה.{" "}
            <Link
              href={`/purchase-orders/${encodeURIComponent(placed.po_id)}`}
              className="font-medium underline-offset-2 hover:underline"
              data-testid="placement-queue-success-po-link"
            >
              צפה בהזמנה
            </Link>{" "}
            ·{" "}
            <Link
              href="/stock/receipts"
              className="font-medium underline-offset-2 hover:underline"
              data-testid="placement-queue-success-receipts-link"
            >
              קבלת סחורה ←
            </Link>
          </span>
          <button
            type="button"
            onClick={() => setPlaced(null)}
            className="shrink-0 rounded p-0.5 text-success-fg hover:bg-success/10"
            aria-label="סגירת ההודעה"
            data-testid="placement-queue-success-dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {cancelled ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-border/60 bg-bg-subtle/60 px-4 py-3 text-sm text-fg"
          data-testid="placement-queue-cancelled"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span className="min-w-0 flex-1">
            ההזמנה <span className="font-semibold">{cancelled.po_number}</span>{" "}
            בוטלה והוסרה מהתור.{" "}
            <span className="text-fg-muted">סיבה: {cancelled.reason}</span>{" "}
            ·{" "}
            <Link
              href={`/purchase-orders/${encodeURIComponent(cancelled.po_id)}`}
              className="font-medium underline-offset-2 hover:underline"
              data-testid="placement-queue-cancelled-po-link"
            >
              צפה בהזמנה
            </Link>
          </span>
          <button
            type="button"
            onClick={() => setCancelled(null)}
            className="shrink-0 rounded p-0.5 text-fg-muted hover:bg-bg-subtle"
            aria-label="סגירת ההודעה"
            data-testid="placement-queue-cancelled-dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div
          className="space-y-3"
          aria-busy="true"
          data-testid="placement-queue-loading"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="card h-16 animate-pulse bg-bg-subtle/40 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          data-testid="placement-queue-error"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="flex-1">
            {error instanceof ApiError
              ? error.message
              : "לא ניתן לטעון את תור ההזמנות."}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex min-h-[44px] items-center gap-1 rounded px-1 text-xs font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            נסה שוב
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div
          className="card flex flex-col items-center gap-2 p-8 text-center"
          data-testid="placement-queue-empty"
        >
          <ClipboardCheck className="h-6 w-6 text-fg-muted" aria-hidden />
          <div className="text-sm font-semibold text-fg">אין הזמנות לביצוע</div>
          <div className="max-w-md text-xs text-fg-muted">
            כשתאושר הזמנת רכש היא תופיע כאן, ותוכלי להזין מחיר ותנאי תשלום ולבצע
            אותה מול הספק.
          </div>
          {/* DR-018 FLOW-004 (Tranche 124) — this empty state was
              indistinguishable from an upstream-bug state (it masked the
              live trigger bug on 2026-07-03 until someone thought to ask).
              Give the office manager an explicit "this might be a bug, not
              a real empty queue" escape hatch. */}
          <div className="max-w-md text-xs text-fg-faint">
            אם ידוע לך שאושרו הזמנות ואינן מופיעות כאן, פנו למנהל התכנון.
          </div>
        </div>
      ) : (
        <>
          {/* DR-018 FLOW-006 (Tranche 124) — no aging/overdue signal at the
              page level; an office manager had to open every row to notice
              a missed order_by_date. */}
          {overdueCount > 0 && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
              data-testid="placement-queue-overdue-banner"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {rows.length} הזמנות ממתינות — {overdueCount} באיחור
              </span>
            </div>
          )}

          {/* Filter + sort (Tom-directed 2026-07-16) */}
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-bg-subtle/20 px-3 py-2"
            data-testid="placement-queue-filter-bar"
          >
            <div className="relative flex-1 min-w-[10rem]">
              <Search
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
                aria-hidden
              />
              <input
                type="search"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                placeholder="סינון לפי ספק…"
                aria-label="סינון לפי ספק"
                className="input w-full py-1.5 pr-8 text-xs"
                data-testid="placement-queue-filter-supplier"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="מיון"
              className="input w-40 py-1.5 text-xs"
              data-testid="placement-queue-sort"
            >
              <option value="order_by_date">מיין: דחיפות (ברירת מחדל)</option>
              <option value="amount_desc">מיין: סכום (גבוה תחילה)</option>
              <option value="supplier">מיין: ספק (א-ת)</option>
            </select>
            {isFiltered && (
              <button
                type="button"
                onClick={() => setSupplierQuery("")}
                // ux-release-gate 2026-07-21 INT-103: real touch target,
                // matching the ActionList twin (INTER-204 pattern).
                className="inline-flex min-h-[2rem] items-center px-2 text-3xs font-medium text-accent hover:underline"
                data-testid="placement-queue-filter-clear"
              >
                נקה סינון
              </button>
            )}
          </div>

          {/* ux-release-gate 2026-07-21 A11Y-103: announce filter results —
              mirrors the ActionList A11Y-005 region. */}
          <div
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {isFiltered
              ? visibleRows.length === 0
                ? "אין הזמנות התואמות את הסינון"
                : `${visibleRows.length} הזמנות מוצגות`
              : ""}
          </div>

          {isFiltered && visibleRows.length === 0 && (
            <div className="rounded-md border border-border/60 bg-bg-subtle/30 px-4 py-6 text-center text-xs text-fg-muted">
              אין הזמנות התואמות את הסינון.
            </div>
          )}

          <ul className="space-y-3" data-testid="placement-queue-list">
            {visibleRows.map((po) => (
              <PlacementRow
                key={po.po_id}
                po={po}
                onPlaced={(p) => {
                  setCancelled(null);
                  setPlaced({ po_id: p.po_id, po_number: p.po_number });
                }}
                onCancelled={(p, reason) => {
                  setPlaced(null);
                  setCancelled({
                    po_id: p.po_id,
                    po_number: p.po_number,
                    reason,
                  });
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PlacementQueuePage(): JSX.Element {
  return (
    <RoleGate minimum="planning:execute">
      <QueueInner />
    </RoleGate>
  );
}

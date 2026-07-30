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
//
// Tranche 154 (ux-release-gate 2026-07-30) — the organizing unit of this page
// is THE PHONE CALL. One supplier group = one call. Groups are therefore kept
// but ordered by their most urgent member, and each group header carries that
// urgency, so scanning top-to-bottom is scanning calls by priority. Inside a
// group the row is deliberately quieter than its header: the supplier name
// appears exactly once (the P0 fix), and the row leads with a status chip.
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
  Phone,
} from "lucide-react";
import { RoleGate } from "@/lib/auth/role-gate";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { formatIls } from "@/lib/utils/format-money";
import { ApiError, usePlacementQueue, type QueuePo, type QueueScope } from "./_lib/api";
import { PlacementRow, StatusChip, poUrgencyRank } from "./_components/PlacementRow";

// Filter/sort (Tom-directed 2026-07-16 — every corridor page needs them).
// Client-side over the already-fetched queue; the default order-by-date sort
// (urgency-first, set by usePlacementQueue) stays the default sort key here.
type SortKey = "scheduled_order_date" | "amount_desc" | "supplier";

const SORTERS: Record<SortKey, (a: QueuePo, b: QueuePo) => number> = {
  scheduled_order_date: (a, b) => {
    if (a.priority_bucket !== b.priority_bucket) {
      return a.priority_bucket - b.priority_bucket;
    }
    const ax = a.scheduled_order_date ?? "0000-00-00";
    const bx = b.scheduled_order_date ?? "0000-00-00";
    return ax < bx ? -1 : ax > bx ? 1 : a.po_number.localeCompare(b.po_number);
  },
  amount_desc: (a, b) => Number(b.total_net) - Number(a.total_net),
  supplier: (a, b) =>
    (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "", "he"),
};

const SCOPE_HELP: Record<QueueScope, string> = {
  now: "הזמנות ללא תאריך ביצוע, הזמנות באיחור, והזמנות לביצוע היום.",
  "7d": "הזמנות שתאריך הביצוע שלהן חל בשבעת הימים הקרובים.",
  all: "כל ההזמנות שממתינות לביצוע, כולל עתידיות.",
};

// ux-release-gate 2026-07-30 COPY-101 (downgraded to P2 on backend evidence):
// `split_po_id` is a friendly PO number today — migration 0298 mints the
// sibling via fn_allocate_po_number, and po_id == po_number in v1. The portal
// depends on that identity silently, so guard it: if the backend ever returns
// an opaque identifier, the operator gets a readable label instead of a UUID.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function splitPoLabel(id: string): string {
  return UUID_RE.test(id) ? "הזמנה חדשה" : id;
}

interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  rows: QueuePo[];
  total: number;
  /** The group's worst member — the reason to call this supplier first. */
  lead: QueuePo;
}

function QueueInner(): JSX.Element {
  const [scope, setScope] = useState<QueueScope>("now");
  const { data, isLoading, isError, error, refetch } = usePlacementQueue(scope);
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  // Always computed from the FULL queue — a supplier filter must never shrink
  // the reported overdue count, or it would hide real exposure behind an
  // active filter (same correctness rule as the procurement ActionList).
  const overdueCount =
    data?.counts?.overdue ?? rows.filter((po) => po.due_state === "overdue").length;

  const [supplierQuery, setSupplierQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scheduled_order_date");
  const isFiltered = supplierQuery.trim() !== "";
  const visibleRows = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    return rows
      .filter((po) => !q || (po.supplier_name ?? "").toLowerCase().includes(q))
      .sort(SORTERS[sortKey]);
  }, [rows, supplierQuery, sortKey]);

  const groupedVisibleRows = useMemo(() => {
    const groups = new Map<string, SupplierGroup>();
    for (const po of visibleRows) {
      const key = po.supplier_id || po.supplier_name || "unknown";
      const current =
        groups.get(key) ??
        {
          supplierId: key,
          supplierName: po.supplier_name ?? "ספק לא ידוע",
          rows: [],
          total: 0,
          lead: po,
        };
      current.rows.push(po);
      current.total += Number(po.total_net);
      // The group inherits its most urgent member — that member is why this
      // call happens now (tranche 154 decision 1; gate FLOW-110).
      if (poUrgencyRank(po) < poUrgencyRank(current.lead)) current.lead = po;
      groups.set(key, current);
    }
    const out = Array.from(groups.values());
    // Group order follows the operator's explicit sort choice; only the
    // default (by-date) sort is re-expressed as "most urgent call first".
    if (sortKey === "supplier") {
      out.sort((a, b) => a.supplierName.localeCompare(b.supplierName, "he"));
    } else if (sortKey === "amount_desc") {
      out.sort((a, b) => b.total - a.total);
    } else {
      out.sort(
        (a, b) =>
          poUrgencyRank(a.lead) - poUrgencyRank(b.lead) ||
          (a.lead.scheduled_order_date ?? "9999-99-99").localeCompare(
            b.lead.scheduled_order_date ?? "9999-99-99",
          ) ||
          a.supplierName.localeCompare(b.supplierName, "he"),
      );
    }
    return out;
  }, [visibleRows, sortKey]);

  // Durable success confirmation: a placed PO's row unmounts (it leaves the
  // queue), so the page owns the "order placed" banner.
  const [placed, setPlaced] = useState<{
    po_id: string;
    po_number: string;
    // Tranche 150: the sibling PO created for the part the supplier could not
    // supply. Named in the banner so the remainder never goes unnoticed.
    split_po_id?: string | null;
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

  // Scope counts, used both on the tabs and by the scope-aware empty state.
  const scopeCounts: Record<QueueScope, number> = {
    now: data?.counts?.now ?? rows.length,
    "7d": data?.counts?.next_7_days ?? 0,
    all: data?.total_count ?? rows.length,
  };
  // ux-release-gate 2026-07-30 FLOW-111: when the selected scope is empty but
  // another one is not, "אין הזמנות לביצוע" is a false dead-end. Name the
  // scope that does have work and offer one tap to get there.
  const fallbackScope: QueueScope | null =
    rows.length > 0
      ? null
      : scope !== "all" && scopeCounts.all > 0
        ? "all"
        : scope === "now" && scopeCounts["7d"] > 0
          ? "7d"
          : null;

  const controlBar = (
    <div
      className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-bg-subtle/25 p-3"
      data-testid="placement-queue-controls"
    >
      {/* FLOW-111 / COPY-112: what each tab means is stated BEFORE the choice,
          not in a muted line underneath it. */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
        data-testid="placement-queue-scope-bar"
      >
        <span className="eyebrow-strong shrink-0">מה להציג</span>
        <div className="segmented" role="group" aria-label="טווח ההזמנות המוצג">
          {(
            [
              ["now", "עכשיו"],
              ["7d", "7 ימים"],
              ["all", "הכול"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              data-active={scope === value}
              aria-pressed={scope === value}
              title={SCOPE_HELP[value]}
              className="segmented-option min-h-[44px]"
              data-testid={`placement-queue-scope-${value}`}
            >
              {label}
              <span className="font-mono tabular-nums opacity-70">
                {scopeCounts[value]}
              </span>
            </button>
          ))}
        </div>
        {/* Full width on a phone — squeezed beside the tabs it collapsed into
            a one-word-per-line column. */}
        <p className="w-full min-w-0 text-xs text-fg-muted sm:w-auto sm:flex-1">
          {SCOPE_HELP[scope]}
        </p>
      </div>

      {/* Filter + sort (Tom-directed 2026-07-16). VIS-107: one control zone,
          one border — these were two stacked bordered bars. */}
      <div
        className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5"
        data-testid="placement-queue-filter-bar"
      >
        <div className="relative min-w-[10rem] flex-1">
          <Search
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
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
          className="input w-44 py-1.5 text-xs"
          data-testid="placement-queue-sort"
        >
          <option value="scheduled_order_date">מיין: הכי דחוף קודם</option>
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
    </div>
  );

  return (
    // VIS-102: `lang="he"` makes Chromium render every descendant
    // <input type="date"> as DD/MM/YYYY instead of the browser-UI-locale
    // mm/dd/yyyy that was appearing inside this Hebrew page.
    <div dir="rtl" lang="he" className="flex flex-col gap-5">
      <WorkflowHeader
        size="section"
        eyebrow="רכש"
        title="הזמנות לביצוע"
        description="כל שורה כאן היא הזמנה שאושרה וממתינה לשיחה עם הספק. ההזמנות מקובצות לפי ספק — קבוצה אחת = שיחה אחת — והדחופות ביותר מופיעות למעלה."
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
            {placed.split_po_id ? (
              <>
                {" · "}
                <span data-testid="placement-queue-success-split">
                  היתרה שלא סופקה נפתחה כהזמנה{" "}
                  <Link
                    href={`/purchase-orders/${encodeURIComponent(placed.split_po_id)}`}
                    className="font-medium underline-offset-2 hover:underline"
                    data-testid="placement-queue-success-split-link"
                  >
                    {splitPoLabel(placed.split_po_id)}
                  </Link>{" "}
                  וממתינה לביצוע — אפשר להפנות אותה לספק אחר מהתור.
                </span>
              </>
            ) : null}
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
            </Link>{" "}
            ·{" "}
            {/* Tranche 155 (FLOW-203): the placement banner routes onward to
                goods receipt; this one ended at the banner, even though a
                discarded order usually means going back to re-plan it. */}
            <Link
              href="/planning/procurement"
              className="font-medium underline-offset-2 hover:underline"
              data-testid="placement-queue-cancelled-procurement-link"
            >
              חזרה לרכש ←
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
          role="status"
          aria-busy="true"
          data-testid="placement-queue-loading"
        >
          <span className="sr-only">טוען את תור ההזמנות…</span>
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
      ) : (
        <>
          {/* DR-018 FLOW-006 (Tranche 124) — no aging/overdue signal at the
              page level; an office manager had to open every row to notice
              a missed order_by_date.
              VIS-110: this is a business heads-up, not a system fault. Danger
              tokens are reserved here for API/validation failures (the error
              banner above) and for destructive confirmations; a full-width
              summary banner uses warning so the two never read alike. Per-row
              status chips keep danger for the single worst state — a chip is
              never mistaken for an error banner. */}
          {overdueCount > 0 && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
              data-testid="placement-queue-overdue-banner"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {rows.length} הזמנות ממתינות לביצוע — {overdueCount} כבר באיחור.
                התחילי מהן.
              </span>
            </div>
          )}

          {/* The control bar renders even when the current scope is empty —
              previously the tabs disappeared behind the empty state, so an
              operator whose "עכשיו" was empty could not discover that "7 ימים"
              had work (FLOW-111). */}
          {controlBar}

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

          {rows.length === 0 ? (
            <div
              className="card flex flex-col items-center gap-2 p-8 text-center"
              data-testid="placement-queue-empty"
            >
              <ClipboardCheck className="h-6 w-6 text-fg-muted" aria-hidden />
              <div className="text-sm font-semibold text-fg">
                {fallbackScope
                  ? "אין הזמנות לביצוע בטווח הזה"
                  : "אין הזמנות לביצוע"}
              </div>
              {fallbackScope ? (
                <>
                  <div className="max-w-md text-xs text-fg-muted">
                    {fallbackScope === "7d"
                      ? `יש ${scopeCounts["7d"]} הזמנות שתאריך הביצוע שלהן בשבוע הקרוב.`
                      : `יש ${scopeCounts.all} הזמנות שממתינות לביצוע בטווחים אחרים.`}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScope(fallbackScope)}
                    className="btn btn-sm btn-primary min-h-[44px]"
                    data-testid="placement-queue-empty-jump"
                  >
                    {fallbackScope === "7d"
                      ? "הצג את 7 הימים הקרובים"
                      : "הצג את כל ההזמנות"}
                  </button>
                </>
              ) : (
                <>
                  <div className="max-w-md text-xs text-fg-muted">
                    כשתאושר הזמנת רכש היא תופיע כאן, ותוכלי להזין מחיר ותנאי
                    תשלום ולבצע אותה מול הספק.
                  </div>
                  {/* DR-018 FLOW-004 (Tranche 124) — this empty state was
                      indistinguishable from an upstream-bug state (it masked the
                      live trigger bug on 2026-07-03 until someone thought to ask).
                      Give the office manager an explicit "this might be a bug, not
                      a real empty queue" escape hatch. */}
                  <div className="max-w-md text-xs text-fg-muted">
                    אם ידוע לך שאושרו הזמנות ואינן מופיעות כאן, פנו למנהל התכנון.
                  </div>
                </>
              )}
            </div>
          ) : isFiltered && visibleRows.length === 0 ? (
            <div className="rounded-md border border-border/60 bg-bg-subtle/30 px-4 py-6 text-center text-xs text-fg-muted">
              אין הזמנות התואמות את הסינון.
            </div>
          ) : (
            <div className="space-y-5" data-testid="placement-queue-list">
              {groupedVisibleRows.map((group) => (
                <section
                  key={group.supplierId}
                  aria-labelledby={`supplier-heading-${group.supplierId}`}
                  data-testid={`placement-queue-supplier-${group.supplierId}`}
                >
                  {/* VIS-101 / VIS-106 — the supplier name lives HERE and
                      nowhere else on the page. It is the call target, so it is
                      the strongest label in the group; the rows below are
                      deliberately quieter. */}
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/50 pb-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <Phone
                        className="h-3.5 w-3.5 shrink-0 self-center text-fg-muted"
                        aria-hidden
                      />
                      <h2
                        id={`supplier-heading-${group.supplierId}`}
                        className="truncate text-base font-semibold text-fg-strong"
                      >
                        {group.supplierName}
                      </h2>
                      {/* VIS-108 (merged ×5): the accent pill that used to sit
                          here was a non-interactive span dressed as a CTA. It
                          is replaced by real information — the reason this
                          call is ranked where it is. */}
                      <StatusChip po={group.lead} />
                    </div>
                    <p className="eyebrow-strong shrink-0">
                      {group.rows.length}{" "}
                      {group.rows.length === 1 ? "הזמנה" : "הזמנות"} ·{" "}
                      <span className="font-mono tabular-nums normal-case">
                        {formatIls(group.total)}
                      </span>
                    </p>
                  </div>
                  <ul className="space-y-2.5">
                    {group.rows.map((po) => (
                      <PlacementRow
                        key={po.po_id}
                        po={po}
                        onPlaced={(p, splitPoId) => {
                          setCancelled(null);
                          setPlaced({
                            po_id: p.po_id,
                            po_number: p.po_number,
                            split_po_id: splitPoId ?? null,
                          });
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
                </section>
              ))}
            </div>
          )}
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

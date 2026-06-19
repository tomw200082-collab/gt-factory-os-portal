"use client";

// Movement Log — Stock Ledger UX page
// 20 expert UX/UI iterations applied 2026-05-07. Working with the existing
// /api/stock/ledger response shape; no new business_context fields yet
// (those land with Tranche 1 API rewrite). UI register: English / LTR.
//
// Iteration log:
//   1. Sticky day-grouping headers — chronological hierarchy + count-per-day.
//   2. Smart relative date formatting — Today / Yesterday / Wed / dd Mmm yyyy.
//   3. Quantity column typography — tabular-nums, sign explicit, qty / unit split.
//   4. Movement-type pills — text + glyph + color, semantic by direction.
//   5. Reversal-row left-border accent + ↶ glyph next to qty.
//   6. SKU mono small + tooltip — compensates for missing item_name in API.
//   7. PO chip enhancement — supplier badge + status pill, both clickable.
//   8. Multi-pill Status column — text + glyph, never color-only.
//   9. Trust strip header — total-in-scope + event_at vs posted_at semantic.
//  10. Unified search input — client-side filter across SKU/type/notes/reporter.
//  11. Advanced filters collapsed by default — progressive disclosure.
//  12. Density toggle — comfortable / compact, persisted in row height.
//  13. Pagination polish — page X of Y, range summary, jump-to-first/last.
//  14. Skeleton matches table column structure — preserves layout, no jump.
//  15. Empty-state operational guidance — clear next-action wording per context.
//  16. Error state — retry button + technical-details disclosure.
//  17. Focus-visible 2px accent rings throughout — WCAG 2.2 keyboard support.
//  18. ARIA — aria-busy on loading, role/label on buttons, aria-pressed chips.
//  19. Mobile card layout at <md — touch targets ≥44px, no horizontal scroll.
//  20. Click row → side drawer with full row detail incl. raw IDs collapsed.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { useSession } from "@/lib/auth/session-provider";
import { friendlyReverseError } from "@/lib/copy/physical-count-errors";
import { cn } from "@/lib/cn";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pcundo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

interface LedgerRow {
  movement_id: string;
  movement_type: string;
  item_type: string;
  item_id: string;
  qty_delta: string;
  uom: string;
  event_at: string;
  posted_at?: string | null;
  post_status: string;
  reported_by_user_id: string | null;
  reported_by_snapshot: string | null;
  source_event_id: string | null;
  source_channel?: string | null;
  notes: string | null;
  // Tranche 1 enrichment (additive 2026-05-07).
  item_name?: string | null;
  lw_task_id?: string | null;
  wp_order_id?: string | null;
  lw_destination_city?: string | null;
  lw_destination_recipient_name?: string | null;
  recipient_hidden_reason?: "unauthorized_role" | "source_unavailable" | null;
  related_po_line_id?: string | null;
  po_id?: string | null;
  po_number?: string | null;
  supplier_name?: string | null;
  related_movement_id?: string | null;
  original_event_at?: string | null;
  original_movement_type?: string | null;
  // Physical-count synthetic-row context (0240 / Phase B). Counts are
  // anchor-first, surfaced as COUNT_ADJUST / COUNT_ADJUST_REVERSAL rows.
  pc_submission_id?: string | null;
  pc_reversed?: boolean | null;
  pc_reversible?: boolean | null;
}

interface LedgerResponse {
  rows: LedgerRow[];
  total?: number;
  total_matching?: number;
  count?: number;
}

interface PurchaseOrderHeaderLite {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
}

interface PurchaseOrderDetailResponse {
  row: PurchaseOrderHeaderLite;
}

const PAGE_SIZE = 100;

// === Iteration 4 — movement-type registry =================================
type MvKind = "in" | "out" | "audit" | "reversal" | "unknown";

interface MvMeta {
  label: string;
  kind: MvKind;
  glyph: string;
}

const MOVEMENT_REGISTRY: Record<string, MvMeta> = {
  GR_POSTED:              { label: "Goods Receipt",          kind: "in",       glyph: "↓" },
  GR_REVERSAL:            { label: "GR Reversal",            kind: "reversal", glyph: "↶" },
  WASTE_POSTED:           { label: "Waste / Adjustment",     kind: "out",      glyph: "✕" },
  WASTE_REVERSAL:         { label: "Waste Reversal",         kind: "reversal", glyph: "↶" },
  LIONWHEEL_PICK:         { label: "Shipment Pick",          kind: "out",      glyph: "→" },
  LIONWHEEL_UNPICK:       { label: "Shipment Pick Reversal", kind: "reversal", glyph: "↶" },
  FG_OUT_PICK:            { label: "Shipment Pick",          kind: "out",      glyph: "→" },
  FG_OUT_PICK_REVERSAL:   { label: "Shipment Pick Reversal", kind: "reversal", glyph: "↶" },
  production_output:      { label: "Production Output",      kind: "in",       glyph: "↑" },
  production_consumption: { label: "Production Consumption", kind: "out",      glyph: "↓" },
  production_scrap:       { label: "Production Scrap",       kind: "audit",    glyph: "·" },
  COUNT_ADJUST:           { label: "Count Adjustment",       kind: "audit",    glyph: "=" },
  COUNT_ADJUST_REVERSAL:  { label: "Count Undo",             kind: "reversal", glyph: "↶" },
};

function mvMeta(raw: string): MvMeta {
  return (
    MOVEMENT_REGISTRY[raw] ?? {
      label: raw
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      kind: "unknown",
      glyph: "?",
    }
  );
}

function kindPillClass(kind: MvKind): string {
  switch (kind) {
    case "in":
      return "bg-success-softer text-success-fg ring-1 ring-success/20";
    case "out":
      return "bg-bg-subtle text-fg ring-1 ring-border";
    case "audit":
      return "bg-info-softer text-info-fg ring-1 ring-info/20";
    case "reversal":
      return "bg-info-softer text-info-fg ring-1 ring-info/30";
    default:
      return "bg-bg-subtle text-fg-subtle ring-1 ring-border";
  }
}

const ITEM_TYPES = ["FG", "RM", "PKG"] as const;

const MOVEMENT_KIND_FILTERS: { value: string; label: string; kind: MvKind }[] = [
  { value: "GR_POSTED",         label: "Goods Receipt", kind: "in" },
  { value: "WASTE_POSTED",      label: "Waste",         kind: "out" },
  { value: "LIONWHEEL_PICK",    label: "Shipments",     kind: "out" },
  { value: "production_output", label: "Production",    kind: "in" },
  { value: "COUNT_ADJUST",      label: "Counts",        kind: "audit" },
  { value: "GR_REVERSAL",       label: "Reversals",     kind: "reversal" },
];

interface Filters {
  item_id: string;
  item_type: string;
  movement_type: string;
  from_date: string;
  to_date: string;
  search: string;
}

const EMPTY_FILTERS: Filters = {
  item_id: "",
  item_type: "",
  movement_type: "",
  from_date: "",
  to_date: "",
  search: "",
};

function buildQuery(filters: Filters, poId: string, offset: number): string {
  const params = new URLSearchParams();
  if (filters.item_id) params.set("item_id", filters.item_id);
  if (filters.item_type) params.set("item_type", filters.item_type);
  if (filters.movement_type) params.set("movement_type", filters.movement_type);
  if (filters.from_date) params.set("from", `${filters.from_date}T00:00:00Z`);
  if (filters.to_date) params.set("to", `${filters.to_date}T23:59:59Z`);
  if (poId) params.set("po_id", poId);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

async function fetchLedger(
  filters: Filters,
  poId: string,
  offset: number,
): Promise<LedgerResponse> {
  const qs = buildQuery(filters, poId, offset);
  const res = await fetch(`/api/stock/ledger?${qs}`);
  if (!res.ok) throw new Error(`LEDGER_FETCH_${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { rows: data, total: data.length };
  return data as LedgerResponse;
}

async function fetchPoHeader(
  poId: string,
): Promise<PurchaseOrderDetailResponse> {
  const res = await fetch(`/api/purchase-orders/${encodeURIComponent(poId)}`);
  if (!res.ok) throw new Error("PO header lookup failed");
  return (await res.json()) as PurchaseOrderDetailResponse;
}

// === Iteration 2 — smart date helpers =====================================
function smartDateHeader(iso: string): { primary: string; aria: string } {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const daysDiff = Math.floor(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  const fullDate = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (sameDay(d, today)) return { primary: `Today · ${fullDate}`, aria: fullDate };
  if (sameDay(d, yest)) return { primary: `Yesterday · ${fullDate}`, aria: fullDate };
  if (daysDiff < 7) {
    return {
      primary: d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }),
      aria: fullDate,
    };
  }
  return {
    primary: d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    aria: fullDate,
  };
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function dateBucketKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// === Iteration 3 — quantity formatter =====================================
function fmtQty(value: string): { display: string; isZero: boolean } {
  const n = Number(value);
  if (isNaN(n)) return { display: value, isZero: false };
  const isZero = Math.abs(n) < 0.0000001;
  const display = isZero ? "0.000" : `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
  return { display, isZero };
}

// === Iteration 8 — Status pill ============================================
function StatusPill({ status }: { status: string }) {
  const upper = status.toUpperCase();
  if (upper === "POSTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-softer px-2 py-0.5 text-2xs font-medium text-success-fg ring-1 ring-success/20">
        <span aria-hidden>✓</span>
        Posted
      </span>
    );
  }
  if (upper === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-2xs font-medium text-fg-muted ring-1 ring-border">
        <span aria-hidden>◷</span>
        Pending
      </span>
    );
  }
  if (upper === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-softer px-2 py-0.5 text-2xs font-medium text-danger-fg ring-1 ring-danger/30">
        <span aria-hidden>✗</span>
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-2xs font-medium text-fg-subtle ring-1 ring-border">
      {status}
    </span>
  );
}

// === Iteration 4 — Movement-type pill =====================================
function MovementPill({ raw }: { raw: string }) {
  const meta = mvMeta(raw);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium",
        kindPillClass(meta.kind),
      )}
      title={`${meta.label} (raw: ${raw})`}
    >
      <span aria-hidden className="font-mono">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  );
}

// === Iteration 3 + 5 — Quantity cell ======================================
function QtyDeltaCell({
  value,
  uom,
  isReversal,
}: {
  value: string;
  uom: string;
  isReversal: boolean;
}) {
  const { display, isZero } = fmtQty(value);
  return (
    <span className="inline-flex items-baseline gap-1 font-medium tabular-nums">
      {isReversal ? (
        <span aria-hidden className="text-info-fg">
          ↶
        </span>
      ) : null}
      <span className={cn("text-sm", isZero ? "text-fg-muted" : "text-fg")}>
        {display}
      </span>
      <span className="text-2xs uppercase text-fg-subtle">{uom}</span>
    </span>
  );
}

// === Iteration 20 — Details drawer ========================================
function DetailsDrawer({
  row,
  onClose,
  onReversed,
}: {
  row: LedgerRow | null;
  onClose: () => void;
  /** Called after a successful undo so the parent can refresh + close. */
  onReversed: () => void;
}) {
  const { session } = useSession();
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoErr, setUndoErr] = useState<string | null>(null);

  // Reset the undo sub-form whenever the drawer target changes.
  useEffect(() => {
    setUndoOpen(false);
    setUndoReason("");
    setUndoBusy(false);
    setUndoErr(null);
  }, [row?.movement_id]);

  useEffect(() => {
    if (!row) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  async function doUndo() {
    if (!row?.pc_submission_id) return;
    const reason = undoReason.trim();
    if (!reason) return;
    setUndoBusy(true);
    setUndoErr(null);
    try {
      const res = await fetch(
        `/api/physical-count/${encodeURIComponent(row.pc_submission_id)}/reverse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotency_key: newIdempotencyKey(), reason }),
        },
      );
      if (res.ok) {
        onReversed();
        return;
      }
      const body = await res.json().catch(() => null);
      setUndoErr(friendlyReverseError(res.status, body));
    } catch {
      setUndoErr("Network error — the count was not undone.");
    } finally {
      setUndoBusy(false);
    }
  }

  if (!row) return null;
  // The Undo affordance is for posted counts that are still the latest anchor.
  const canUndo =
    row.movement_type === "COUNT_ADJUST" &&
    row.pc_reversible === true &&
    (session.role === "operator" ||
      session.role === "planner" ||
      session.role === "admin");
  const meta = mvMeta(row.movement_type);
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-bg shadow-xl sm:w-[28rem]"
        role="dialog"
        aria-modal="true"
        aria-label="Movement details"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
              Movement
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <MovementPill raw={row.movement_type} />
              <StatusPill status={row.post_status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4 text-sm">
          <section>
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
              Item
            </h3>
            {row.item_name ? (
              <div className="text-sm font-medium text-fg">{row.item_name}</div>
            ) : null}
            <div className="font-mono text-xs text-fg-muted">{row.item_id}</div>
            <div className="mt-1 text-xs text-fg-muted">Type: {row.item_type}</div>
          </section>

          {/* Iteration 25 — Order / Source section */}
          {(row.wp_order_id ||
            row.lw_task_id ||
            row.po_number ||
            row.supplier_name ||
            row.original_event_at) ? (
            <section>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                Order / Source
              </h3>
              <dl className="space-y-1.5 text-xs">
                {row.wp_order_id ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Order</dt>
                    <dd className="font-mono text-fg">{row.wp_order_id}</dd>
                  </div>
                ) : null}
                {row.lw_task_id ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">LionWheel task</dt>
                    <dd className="font-mono text-fg">#{row.lw_task_id}</dd>
                  </div>
                ) : null}
                {row.lw_destination_recipient_name ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Recipient</dt>
                    <dd className="text-fg">
                      {row.lw_destination_recipient_name}
                    </dd>
                  </div>
                ) : row.recipient_hidden_reason === "unauthorized_role" ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Recipient</dt>
                    <dd className="text-fg-subtle">
                      hidden by your role
                    </dd>
                  </div>
                ) : null}
                {row.lw_destination_city ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">City</dt>
                    <dd className="text-fg">{row.lw_destination_city}</dd>
                  </div>
                ) : null}
                {row.po_number ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Purchase order</dt>
                    <dd className="font-mono text-fg">{row.po_number}</dd>
                  </div>
                ) : null}
                {row.supplier_name ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Supplier</dt>
                    <dd className="text-fg">{row.supplier_name}</dd>
                  </div>
                ) : null}
                {row.original_event_at ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Reverses</dt>
                    <dd className="text-fg">
                      {formatFullDateTime(row.original_event_at)}
                      {row.original_movement_type ? (
                        <span className="ml-1 text-fg-subtle">
                          (
                          {mvMeta(row.original_movement_type).label}
                          )
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section>
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
              Quantity
            </h3>
            <QtyDeltaCell
              value={row.qty_delta}
              uom={row.uom}
              isReversal={meta.kind === "reversal"}
            />
          </section>

          <section>
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
              Time
            </h3>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Event at (physical)</dt>
                <dd className="text-fg tabular-nums">
                  {formatFullDateTime(row.event_at)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-2xs text-fg-subtle">
              Event time is when the movement physically occurred. Posted time
              is when it was recorded.
            </p>
          </section>

          <section>
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
              Reporter
            </h3>
            <div className="text-fg">
              {row.reported_by_snapshot ?? (
                <span className="text-fg-subtle">— (unattributed)</span>
              )}
            </div>
          </section>

          {row.notes ? (
            <section>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                Notes
              </h3>
              <div className="whitespace-pre-wrap rounded border border-border/70 bg-bg-subtle/40 px-3 py-2 text-xs text-fg-muted">
                {row.notes}
              </div>
            </section>
          ) : null}

          {/* Count undo (0240 / Phase B) — restores the stock value this
              count set, identical to the API the count form rides on. */}
          {row.movement_type === "COUNT_ADJUST" && row.pc_reversed ? (
            <section
              className="rounded-md border border-border/70 bg-bg-subtle/40 px-3 py-2.5 text-xs text-fg-muted"
              data-testid="movement-log-count-reversed"
            >
              <span className="font-medium text-fg">This count was undone.</span>{" "}
              The stock level was restored to its previous value — see the
              matching “Count Undo” entry in the log.
            </section>
          ) : canUndo ? (
            <section data-testid="movement-log-count-undo">
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                Undo this count
              </h3>
              {!undoOpen ? (
                <>
                  <p className="mb-2 text-2xs text-fg-subtle">
                    Restores the stock level to the value before this count.
                    Operators can undo their own count within 30 minutes;
                    planners and admins can undo the latest count anytime.
                  </p>
                  <button
                    type="button"
                    className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    onClick={() => setUndoOpen(true)}
                    data-testid="movement-log-undo-open"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden>↶</span>
                      Undo count
                    </span>
                  </button>
                </>
              ) : (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning-softer/40 p-3">
                  <label className="block text-2xs font-semibold text-fg">
                    Reason <span className="font-normal text-danger-fg">*</span>
                    <textarea
                      className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                      rows={2}
                      value={undoReason}
                      onChange={(e) => setUndoReason(e.target.value)}
                      placeholder="Why is this count being undone? (kept on the audit trail)"
                      disabled={undoBusy}
                      data-testid="movement-log-undo-reason"
                    />
                  </label>
                  {undoErr ? (
                    <p className="text-2xs text-danger-fg" role="alert" data-testid="movement-log-undo-error">
                      {undoErr}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => void doUndo()}
                      disabled={undoBusy || !undoReason.trim()}
                      data-testid="movement-log-undo-confirm"
                    >
                      {undoBusy ? "Undoing…" : "Confirm undo"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setUndoOpen(false);
                        setUndoErr(null);
                      }}
                      disabled={undoBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <details className="rounded border border-border/70 bg-bg-subtle/30">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg">
              Technical details
            </summary>
            <dl className="space-y-1 px-3 pb-3 pt-1 font-mono text-2xs text-fg-subtle">
              <div>movement_id: {row.movement_id}</div>
              <div>movement_type: {row.movement_type}</div>
              <div>post_status: {row.post_status}</div>
              {row.source_event_id ? (
                <div>source_event_id: {row.source_event_id}</div>
              ) : null}
              {row.reported_by_user_id ? (
                <div>reported_by_user_id: {row.reported_by_user_id}</div>
              ) : null}
            </dl>
          </details>
        </div>
      </div>
    </>
  );
}

// === Iteration 21 — Business-context line =================================
// One line per row that captures "which business event this movement
// belongs to". Server-enriched fields (Tranche 1 API) drive this; older
// rows whose enrichment is null fall back to a neutral "—".
function businessContext(row: LedgerRow): {
  primary: string | null;
  secondary: string | null;
} {
  // Shipment context (LW pick/unpick, future FG_OUT_PICK)
  if (row.wp_order_id || row.lw_task_id) {
    const pieces: string[] = [];
    if (row.wp_order_id) pieces.push(row.wp_order_id);
    else if (row.lw_task_id) pieces.push(`Task #${row.lw_task_id}`);
    const recipient = row.lw_destination_recipient_name;
    const city = row.lw_destination_city;
    if (recipient) pieces.push(recipient);
    else if (row.recipient_hidden_reason === "unauthorized_role")
      pieces.push("(recipient hidden)");
    if (city) pieces.push(city);
    return {
      primary: pieces[0] ?? null,
      secondary: pieces.slice(1).join(" · ") || null,
    };
  }
  // PO context (GR / GR reversal)
  if (row.po_number || row.supplier_name) {
    const pieces: string[] = [];
    if (row.po_number) pieces.push(row.po_number);
    if (row.supplier_name) pieces.push(row.supplier_name);
    return {
      primary: pieces[0] ?? null,
      secondary: pieces.slice(1).join(" · ") || null,
    };
  }
  // Reversal pointing back at an original
  if (row.original_event_at) {
    const d = new Date(row.original_event_at);
    return {
      primary: `↶ Reversal of ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
      secondary: row.original_movement_type ? mvMeta(row.original_movement_type).label : null,
    };
  }
  return { primary: null, secondary: null };
}

function ItemDisplay({ row, mono = false }: { row: LedgerRow; mono?: boolean }) {
  const name = row.item_name ?? null;
  const sku = row.item_id;
  return (
    <span
      className="inline-flex flex-col items-start"
      title={`${name ? name + " · " : ""}${sku} (${row.item_type})`}
    >
      {name ? (
        <span className="text-sm leading-tight text-fg">{name}</span>
      ) : null}
      <span
        className={cn(
          "leading-tight text-2xs",
          mono ? "font-mono" : "font-mono",
          name ? "text-fg-subtle" : "text-fg",
        )}
      >
        {sku}
        <span className="ml-1.5 uppercase text-fg-subtle">{row.item_type}</span>
      </span>
    </span>
  );
}

// === Iteration 19 — Mobile card ===========================================
function MovementCardMobile({
  row,
  onOpen,
}: {
  row: LedgerRow;
  onOpen: () => void;
}) {
  const meta = mvMeta(row.movement_type);
  const isReversal = meta.kind === "reversal";
  const ctx = businessContext(row);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border bg-bg px-3 py-3 text-left transition hover:bg-bg-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        isReversal
          ? "border-l-4 border-l-info/60 border-y-border/70 border-r-border/70"
          : "border-border/70",
      )}
      aria-label={`Open details for ${meta.label} on ${row.item_name ?? row.item_id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <MovementPill raw={row.movement_type} />
        <span className="font-mono text-2xs tabular-nums text-fg-subtle">
          {formatTimeOnly(row.event_at)}
        </span>
      </div>
      {ctx.primary ? (
        <div className="flex flex-wrap items-baseline gap-1.5 text-2xs">
          <span className="font-medium text-fg">{ctx.primary}</span>
          {ctx.secondary ? (
            <span className="text-fg-subtle">{ctx.secondary}</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <ItemDisplay row={row} />
        <QtyDeltaCell
          value={row.qty_delta}
          uom={row.uom}
          isReversal={isReversal}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-2xs text-fg-subtle">
        <span className="truncate">{row.reported_by_snapshot ?? "—"}</span>
        <StatusPill status={row.post_status} />
      </div>
    </button>
  );
}

// === Iteration 1 — Sticky day header ======================================
function DayHeader({ iso, count }: { iso: string; count: number }) {
  const { primary, aria } = smartDateHeader(iso);
  return (
    <div
      className="sticky top-0 z-10 -mx-4 mb-1 flex items-baseline justify-between gap-3 border-b border-border/70 bg-bg/95 px-4 py-2 text-xs font-medium tracking-tight backdrop-blur-sm sm:-mx-5 sm:px-5"
      role="heading"
      aria-level={3}
      aria-label={`${aria} · ${count} entries`}
    >
      <span className="text-fg">{primary}</span>
      <span className="text-2xs text-fg-subtle">
        {count} {count === 1 ? "entry" : "entries"}
      </span>
    </div>
  );
}

// === Iteration 9 — Trust strip ============================================
function TrustStrip({ totalRows }: { totalRows: number }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-info/20 bg-info-softer/40 px-3 py-2 text-2xs text-info-fg"
      role="note"
    >
      <span>
        <strong className="font-semibold">Source:</strong> Stock Ledger
      </span>
      <span>
        <strong className="font-semibold tabular-nums">
          {totalRows.toLocaleString()}
        </strong>{" "}
        movements in scope
      </span>
      <span className="text-fg-muted">
        Event time = when it happened · Posted time = when it was recorded
      </span>
    </div>
  );
}

// === Iteration 14 — Skeleton ==============================================
function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2" aria-busy="true" aria-live="polite">
      <div className="hidden md:block">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 border-b border-border/30 py-3"
          >
            <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
            <div className="h-5 w-32 shrink-0 rounded-full bg-bg-subtle" />
            <div className="h-4 w-40 shrink-0 rounded bg-bg-subtle" />
            <div className="h-4 flex-1 rounded bg-bg-subtle" />
            <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
            <div className="h-5 w-20 shrink-0 rounded-full bg-bg-subtle" />
          </div>
        ))}
      </div>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: Math.max(3, Math.floor(rows / 2)) }).map(
          (_, i) => (
            <div
              key={i}
              className="flex animate-pulse flex-col gap-2 rounded-lg border border-border/40 p-3"
            >
              <div className="flex justify-between">
                <div className="h-4 w-24 rounded-full bg-bg-subtle" />
                <div className="h-3 w-12 rounded bg-bg-subtle" />
              </div>
              <div className="h-3 w-full rounded bg-bg-subtle" />
              <div className="h-3 w-2/3 rounded bg-bg-subtle" />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// === Page =================================================================
export default function MovementLogPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlPoId = searchParams?.get("po_id") ?? "";
  const urlItemId = searchParams?.get("item_id") ?? "";

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [activeKind, setActiveKind] = useState<string>("");
  const [drawerRow, setDrawerRow] = useState<LedgerRow | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [urlPoId]);

  // Tranche 041 — StockTruthDrawer deep-links ?item_id=; seed the item filter
  // on mount (same pattern as ?po_id=) so the list lands pre-filtered.
  useEffect(() => {
    if (!urlItemId) return;
    setFilters((prev) => ({ ...prev, item_id: urlItemId }));
    setAppliedFilters((prev) => ({ ...prev, item_id: urlItemId }));
    setOffset(0);
  }, [urlItemId]);

  const poHeaderQuery = useQuery<PurchaseOrderDetailResponse>({
    queryKey: ["stock-ledger", "po-header", urlPoId],
    queryFn: () => fetchPoHeader(urlPoId),
    enabled: Boolean(urlPoId),
    staleTime: 60_000,
    retry: 0,
  });
  const poHeader = poHeaderQuery.data?.row ?? null;
  const poDisplay = useMemo(() => {
    if (!urlPoId) return "";
    if (poHeader?.po_number) return poHeader.po_number;
    return urlPoId;
  }, [urlPoId, poHeader]);

  const effectiveFilters = useMemo<Filters>(() => {
    const f = { ...appliedFilters };
    if (activeKind) f.movement_type = activeKind;
    return f;
  }, [appliedFilters, activeKind]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["stock-ledger", effectiveFilters, urlPoId, offset],
    queryFn: () => fetchLedger(effectiveFilters, urlPoId, offset),
    staleTime: 30_000,
  });

  const allRows = data?.rows ?? [];
  const total =
    data?.total_matching ?? data?.total ?? data?.count ?? allRows.length;

  // Iteration 10 + 24 — client-side search across loaded rows.
  // Now searches across enrichment fields too (item_name, wp_order_id,
  // lw_task_id, recipient, city, supplier, po_number) so a planner can
  // type "GT12651" or "WHITE SANGRIA" or "PO-2026" and find rows.
  const rows = useMemo(() => {
    if (!filters.search.trim()) return allRows;
    const q = filters.search.trim().toLowerCase();
    return allRows.filter((r) =>
      [
        r.item_id,
        r.item_name ?? "",
        r.item_type,
        r.movement_type,
        r.uom,
        r.notes ?? "",
        r.reported_by_snapshot ?? "",
        r.source_event_id ?? "",
        r.wp_order_id ?? "",
        r.lw_task_id ?? "",
        r.lw_destination_recipient_name ?? "",
        r.lw_destination_city ?? "",
        r.po_number ?? "",
        r.supplier_name ?? "",
        mvMeta(r.movement_type).label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allRows, filters.search]);

  // Iteration 1 — group rows by day; rows arrive event_at desc so insertion
  // order preserves chronology.
  const dayGroups = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const r of rows) {
      const k = dateBucketKey(r.event_at);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return Array.from(map.entries());
  }, [rows]);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(activeKind) ||
    Boolean(appliedFilters.item_id) ||
    Boolean(appliedFilters.item_type) ||
    Boolean(appliedFilters.from_date) ||
    Boolean(appliedFilters.to_date);

  function applyFilters() {
    setAppliedFilters(filters);
    setOffset(0);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setActiveKind("");
    setOffset(0);
  }

  function clearPoFilter() {
    router.replace("/stock/movement-log");
    setOffset(0);
  }

  // Tranche 041 — clear the deep-linked item filter (mirrors clearPoFilter,
  // preserving any PO filter still in the URL).
  function clearItemFilter() {
    setFilters((prev) => ({ ...prev, item_id: "" }));
    setAppliedFilters((prev) => ({ ...prev, item_id: "" }));
    router.replace(
      urlPoId
        ? `/stock/movement-log?po_id=${encodeURIComponent(urlPoId)}`
        : "/stock/movement-log",
    );
    setOffset(0);
  }

  function handleFieldChange(field: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  // Iteration 22 — date filters auto-apply.
  // The original UX hid date inputs inside collapsed Advanced Filters and
  // required Apply; users (Tom 2026-05-07) reported "changing date does
  // nothing." This handler updates state AND re-applies immediately, with
  // no Apply click required.
  function handleDateChange(field: "from_date" | "to_date", value: string) {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      setAppliedFilters(next);
      setOffset(0);
      return next;
    });
  }

  function toggleKind(value: string) {
    setActiveKind((prev) => (prev === value ? "" : value));
    setOffset(0);
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <WorkflowHeader
        size="section"
        eyebrow="Stock"
        title="Movement Log"
        description="Ledger history for all stock movements. Search, filter by type or date, click a row for full details."
      >
        <TrustStrip totalRows={total} />
      </WorkflowHeader>

      {urlPoId ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info-softer/30 px-4 py-3 text-sm"
          role="note"
          aria-live="polite"
          data-testid="movement-log-po-filter-chip"
        >
          <span className="text-fg-muted">Filtered by PO</span>
          <span
            className="font-mono text-fg"
            data-testid="movement-log-po-filter-value"
          >
            {poDisplay}
          </span>
          {poHeader?.supplier_name ? (
            <span className="rounded bg-bg-subtle/60 px-2 py-0.5 text-2xs font-medium text-fg ring-1 ring-border">
              {poHeader.supplier_name}
            </span>
          ) : null}
          {poHeader?.status ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-info-softer px-2 py-0.5 text-2xs font-medium text-info-fg ring-1 ring-info/20">
              {poHeader.status}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {poHeader ? (
              <Link
                href={`/purchase-orders/${encodeURIComponent(urlPoId)}`}
                className="btn btn-ghost btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                data-testid="movement-log-po-filter-back-link"
              >
                Open PO →
              </Link>
            ) : null}
            <button
              type="button"
              onClick={clearPoFilter}
              className="btn btn-ghost btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              data-testid="movement-log-po-filter-clear"
            >
              Clear filter
            </button>
          </div>
        </div>
      ) : null}

      {/* Tranche 041 — deep-linked ?item_id= filter chip (same affordance
          as the PO chip above). */}
      {urlItemId && appliedFilters.item_id === urlItemId ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info-softer/30 px-4 py-3 text-sm"
          role="note"
          aria-live="polite"
          data-testid="movement-log-item-filter-chip"
        >
          <span className="text-fg-muted">Filtered by item</span>
          <span
            className="font-mono text-fg"
            data-testid="movement-log-item-filter-value"
          >
            {urlItemId}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearItemFilter}
              className="btn btn-ghost btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              data-testid="movement-log-item-filter-clear"
            >
              Clear filter
            </button>
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Filter"
        title="Search Movements"
        density={density}
        actions={
          <div
            className="hidden items-center gap-1 rounded-md border border-border/70 bg-bg-subtle/40 p-0.5 sm:inline-flex"
            role="radiogroup"
            aria-label="Density"
          >
            <button
              type="button"
              role="radio"
              aria-checked={density === "comfortable"}
              onClick={() => setDensity("comfortable")}
              className={cn(
                "rounded-sm px-2 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                density === "comfortable"
                  ? "bg-bg text-fg shadow-sm"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              Comfortable
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={density === "compact"}
              onClick={() => setDensity("compact")}
              className={cn(
                "rounded-sm px-2 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                density === "compact"
                  ? "bg-bg text-fg shadow-sm"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              Compact
            </button>
          </div>
        }
      >
        {/* Iteration 10 — unified search */}
        <div className="mb-3">
          <label
            className="mb-1 block text-xs font-medium text-fg-muted"
            htmlFor="ml-search"
          >
            Search this page
          </label>
          <div className="relative">
            <input
              id="ml-search"
              type="search"
              value={filters.search}
              onChange={(e) => handleFieldChange("search", e.target.value)}
              placeholder="Item, order #, customer, city, supplier, PO…"
              className="w-full rounded border border-border bg-bg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              aria-describedby="ml-search-hint"
            />
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-subtle"
              aria-hidden
            >
              ⌕
            </span>
            {filters.search ? (
              <button
                type="button"
                onClick={() => handleFieldChange("search", "")}
                className="absolute inset-y-0 right-2 my-auto rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                aria-label="Clear search"
              >
                ✕
              </button>
            ) : null}
          </div>
          <p id="ml-search-hint" className="mt-1 text-2xs text-fg-subtle">
            Filters the rows currently loaded on this page.
          </p>
        </div>

        {/* Iteration 4 — kind chips */}
        <div
          className="mb-3 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Movement type quick filters"
        >
          <button
            type="button"
            onClick={() => toggleKind("")}
            aria-pressed={activeKind === ""}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              activeKind === ""
                ? "bg-fg text-bg ring-1 ring-fg"
                : "bg-bg-subtle text-fg-muted ring-1 ring-border hover:text-fg",
            )}
          >
            All
          </button>
          {MOVEMENT_KIND_FILTERS.map((m) => {
            const active = activeKind === m.value;
            const meta = mvMeta(m.value);
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => toggleKind(m.value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  active
                    ? "bg-fg text-bg ring-1 ring-fg"
                    : cn(kindPillClass(m.kind), "hover:opacity-90"),
                )}
              >
                <span aria-hidden className="font-mono">
                  {meta.glyph}
                </span>
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Iteration 11 — collapsed advanced filters */}
        <details
          className="rounded border border-border/70 bg-bg-subtle/30"
          open={advancedOpen}
          onToggle={(e) =>
            setAdvancedOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg">
            Advanced filters
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-border/50 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Item SKU
              </label>
              <input
                type="text"
                value={filters.item_id}
                onChange={(e) => handleFieldChange("item_id", e.target.value)}
                placeholder="e.g. SKU-001"
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Item Type
              </label>
              <select
                value={filters.item_type}
                onChange={(e) =>
                  handleFieldChange("item_type", e.target.value)
                }
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">All</option>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                From
              </label>
              <input
                type="date"
                value={filters.from_date}
                onChange={(e) => handleDateChange("from_date", e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                To
              </label>
              <input
                type="date"
                value={filters.to_date}
                onChange={(e) => handleDateChange("to_date", e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
        </details>

        {/* Iteration 23 — quick date range up front (no Advanced unfold needed) */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="ml-from-quick">
              From date
            </label>
            <input
              id="ml-from-quick"
              type="date"
              value={filters.from_date}
              onChange={(e) => handleDateChange("from_date", e.target.value)}
              className="rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="ml-to-quick">
              To date
            </label>
            <input
              id="ml-to-quick"
              type="date"
              value={filters.to_date}
              onChange={(e) => handleDateChange("to_date", e.target.value)}
              className="rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          {(filters.from_date || filters.to_date) ? (
            <button
              type="button"
              onClick={() => {
                handleDateChange("from_date", "");
                handleDateChange("to_date", "");
              }}
              className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              Clear dates
            </button>
          ) : null}
          <span className="text-2xs text-fg-subtle">Date filters apply automatically.</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={applyFilters}
            className="btn btn-primary btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Apply
          </button>
          <button
            onClick={clearFilters}
            className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Clear
          </button>
          {isFetching && !isLoading ? (
            <span
              className="ml-1 inline-flex items-center gap-1.5 text-2xs text-fg-subtle"
              aria-live="polite"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-info"
              />
              Refreshing
            </span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Results"
        title="Ledger Entries"
        density={density}
        description={
          rows.length > 0
            ? `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()}`
            : undefined
        }
      >
        {isLoading && (
          <SkeletonTable rows={density === "compact" ? 6 : 8} />
        )}

        {error && (
          <div
            className="rounded-md border border-danger/40 bg-danger-softer/40 px-4 py-3 text-sm text-danger-fg"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden>✗</span>
              <div className="flex-1">
                <div className="font-semibold">Could not load movement log</div>
                <p className="mt-1 text-xs text-fg-muted">
                  Check your connection. The ledger will reload once the API
                  is reachable.
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-2xs text-fg-subtle">
                    Technical details
                  </summary>
                  <code className="mt-1 block break-all font-mono text-2xs text-fg-muted">
                    {(error as Error).message}
                  </code>
                </details>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-danger/40 bg-bg px-2 py-0.5 text-2xs font-medium text-danger-fg hover:bg-danger-softer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle text-fg-subtle"
              aria-hidden
            >
              <span className="text-xl">∅</span>
            </div>
            <div className="text-sm font-medium text-fg">
              {urlPoId
                ? `No movements found for PO ${poDisplay}`
                : "No movements match these filters"}
            </div>
            <p className="max-w-md text-xs text-fg-muted">
              {urlPoId
                ? "The PO may not have ledger postings yet, or any over-receipts may have been routed to exceptions."
                : "Try widening your date range, removing the type chip, or clearing the search box above."}
            </p>
            <div className="mt-1 flex gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  Reset filters
                </button>
              )}
              {urlPoId && (
                <button
                  type="button"
                  onClick={clearPoFilter}
                  className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  Clear PO filter
                </button>
              )}
            </div>
          </div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <div className="space-y-4">
            {/* Desktop: table grouped by day */}
            <div className="hidden md:block" data-testid="movement-log-desktop">
              {dayGroups.map(([day, dayRows], groupIdx) => (
                <div key={day} className={groupIdx > 0 ? "mt-6" : ""}>
                  <DayHeader
                    iso={dayRows[0].event_at}
                    count={dayRows.length}
                  />
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Item</th>
                        <th className="py-2 pr-4">Order / Source</th>
                        <th className="py-2 pr-4 text-right">Qty Δ</th>
                        <th className="py-2 pr-4">Submitted by</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {dayRows.map((row) => {
                        const meta = mvMeta(row.movement_type);
                        const isReversal = meta.kind === "reversal";
                        const ctx = businessContext(row);
                        return (
                          <tr
                            key={row.movement_id}
                            className={cn(
                              "group cursor-pointer transition hover:bg-bg-subtle/40 focus-within:bg-bg-subtle/40",
                              isReversal && "border-l-4 border-l-info/40",
                              density === "compact" ? "h-10" : "h-14",
                            )}
                            onClick={() => setDrawerRow(row)}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open details for ${meta.label} on ${row.item_name ?? row.item_id}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDrawerRow(row);
                              }
                            }}
                          >
                            <td className="whitespace-nowrap pr-4 font-mono text-xs tabular-nums text-fg-muted">
                              {formatTimeOnly(row.event_at)}
                            </td>
                            <td className="pr-4">
                              <MovementPill raw={row.movement_type} />
                            </td>
                            <td className="pr-4">
                              <ItemDisplay row={row} />
                            </td>
                            <td className="pr-4 text-xs">
                              {ctx.primary ? (
                                <span className="inline-flex flex-col items-start leading-tight">
                                  <span className="font-medium text-fg">
                                    {ctx.primary}
                                  </span>
                                  {ctx.secondary ? (
                                    <span className="text-2xs text-fg-subtle">
                                      {ctx.secondary}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-fg-subtle">—</span>
                              )}
                            </td>
                            <td className="pr-4 text-right">
                              <QtyDeltaCell
                                value={row.qty_delta}
                                uom={row.uom}
                                isReversal={isReversal}
                              />
                            </td>
                            <td className="pr-4 text-xs text-fg-muted">
                              {row.reported_by_snapshot ?? (
                                <span className="text-fg-subtle">—</span>
                              )}
                            </td>
                            <td>
                              <StatusPill status={row.post_status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Mobile: cards grouped by day */}
            <div className="md:hidden" data-testid="movement-log-mobile">
              {dayGroups.map(([day, dayRows], groupIdx) => (
                <div
                  key={day}
                  className={cn("space-y-2", groupIdx > 0 && "mt-5")}
                >
                  <DayHeader
                    iso={dayRows[0].event_at}
                    count={dayRows.length}
                  />
                  {dayRows.map((row) => (
                    <MovementCardMobile
                      key={row.movement_id}
                      row={row}
                      onOpen={() => setDrawerRow(row)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Iteration 13 — pagination polish */}
            <div className="flex flex-col items-stretch gap-2 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-2xs text-fg-muted">
                Page{" "}
                <span className="font-medium tabular-nums text-fg">
                  {currentPage}
                </span>{" "}
                of{" "}
                <span className="font-medium tabular-nums text-fg">
                  {totalPages}
                </span>{" "}
                · Showing{" "}
                <span className="tabular-nums">
                  {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="tabular-nums">{total.toLocaleString()}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(0)}
                  className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="First page"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() =>
                    setOffset(Math.max(0, (totalPages - 1) * PAGE_SIZE))
                  }
                  className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Last page"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <DetailsDrawer
        row={drawerRow}
        onClose={() => setDrawerRow(null)}
        onReversed={() => {
          setDrawerRow(null);
          void refetch();
        }}
      />
    </div>
  );
}

"use client";

// ---------------------------------------------------------------------------
// /planning/purchase-session — Weekly Procurement Session
//
// The planner's once-a-week procurement ritual. The daily-MRP purchase
// engine produces one consolidated PO draft per supplier; the planner
// reviews, edits, approves (which generates a ready-to-send Hebrew order
// document for the supplier), and places the order (which creates the
// real PO record and notifies downstream tracking).
//
// Tiers vs the weekly release fence:
//   urgent       — order date already passed / stock already short
//   must         — must be ordered before the next session
//   recommended  — worth pulling forward to consolidate
//
// English-only UI per portal_ux_standard.md §1 (locked 2026-04-30). The
// rendered order-document body remains Hebrew because it is a supplier-
// facing artifact, wrapped in <article lang="he" dir="rtl"> with an
// English caption above it. No mock data — every loading / empty / error
// state is honest.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useMemo, useState } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { cn } from "@/lib/cn";
import {
  useCurrentSession,
  useStartSession,
  useEditPo,
  useApprovePo,
  usePlacePo,
  useSkipPo,
} from "./_lib/api";
import type {
  PurchaseSession,
  PurchaseSessionPo,
  PurchaseSessionLine,
  PoTier,
  PoStatus,
} from "./_lib/types";
import { TierCardSkeleton } from "./_components/TierCardSkeleton";
import { ProgressBreakdown } from "./_components/ProgressBreakdown";

// ---------------------------------------------------------------------------
// Label maps — English per portal_ux_standard.md §1
// ---------------------------------------------------------------------------
const TIER_LABEL: Record<PoTier, string> = {
  urgent: "Urgent",
  must: "Must this week",
  recommended: "Recommended to advance",
};
const STATUS_LABEL: Record<PoStatus, string> = {
  proposed: "Proposed",
  approved: "Approved — pending place",
  placed: "Placed",
  skipped: "Skipped",
};
const SESSION_STATUS_LABEL: Record<"completed" | "superseded", string> = {
  completed: "Completed",
  superseded: "Superseded",
};
const TIER_ORDER: PoTier[] = ["urgent", "must", "recommended"];

function fmtMoney(n: number): string {
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  const [whole, frac] = fixed.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac} ₪`;
}
function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

// ===========================================================================
// Page
// ===========================================================================
export default function PurchaseSessionPage() {
  const { data, isLoading, isError, error, refetch } = useCurrentSession();
  const startMut = useStartSession();

  const session = data?.session ?? null;

  function handleStart() {
    if (
      session?.status === "open" &&
      !window.confirm(
        "A purchase session is already open. Starting a new one will close it and discard any unsaved actions. Continue?",
      )
    ) {
      return;
    }
    startMut.mutate({ session_type: "weekly" });
  }

  return (
    <div className="space-y-5">
      <WorkflowHeader
        eyebrow="Planning"
        title="Purchase Session"
        description="The weekly procurement ritual: review consolidated supplier POs, approve, and place. One PO draft per supplier."
        backHref="/planning"
        backLabel="Planning overview"
        meta={
          <button
            type="button"
            onClick={handleStart}
            disabled={startMut.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              "bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-60",
            )}
            data-testid="purchase-session-start"
            title={
              startMut.isPending
                ? "Generating the next purchase session"
                : session
                  ? "Close the open session and run a new one"
                  : "Run the weekly purchase engine and start a new session"
            }
          >
            {startMut.isPending
              ? "Starting…"
              : session
                ? "Start New Session"
                : "Start Session"}
          </button>
        }
      />

      {startMut.isError ? (
        <ErrorBanner
          message={(startMut.error as Error).message}
          onRetry={handleStart}
        />
      ) : null}

      {isLoading ? (
        <TierCardSkeleton count={3} />
      ) : isError ? (
        <ErrorBanner
          message={
            (error as Error)?.message ?? "Could not load the purchase session."
          }
          onRetry={() => void refetch()}
        />
      ) : !session ? (
        <EmptyNoSession />
      ) : (
        <SessionBody session={session} />
      )}
    </div>
  );
}

// ===========================================================================
// Session body
// ===========================================================================
function SessionBody({ session }: { session: PurchaseSession }) {
  const byTier = useMemo(() => {
    const m: Record<PoTier, PurchaseSessionPo[]> = {
      urgent: [],
      must: [],
      recommended: [],
    };
    for (const po of session.pos) m[po.tier].push(po);
    return m;
  }, [session.pos]);

  const placed = session.totals.by_status.placed;
  const skipped = session.totals.by_status.skipped;
  const total = session.totals.po_count;
  const pending = Math.max(0, total - placed - skipped);
  const sessionComplete = total > 0 && pending === 0;

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="card p-4 space-y-3" data-testid="purchase-session-summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-fg">
            Session dated{" "}
            <span className="font-semibold">{session.session_date}</span>
            {session.status !== "open" ? (
              <span className="ml-2 text-fg-muted">
                ({SESSION_STATUS_LABEL[session.status]})
              </span>
            ) : null}
          </div>
          <div className="flex items-baseline gap-3 text-xs">
            {session.release_fence ? (
              <span className="text-fg-muted">
                Release fence:{" "}
                <span className="font-mono tabular-nums text-fg">
                  {session.release_fence}
                </span>
              </span>
            ) : null}
            <span className="font-mono tabular-nums text-sm font-semibold text-fg">
              {fmtMoney(session.totals.total_cost)}
            </span>
          </div>
        </div>

        <ProgressBreakdown placed={placed} skipped={skipped} pending={pending} />

        {/* Tier counts */}
        <div className="flex flex-wrap gap-2">
          {TIER_ORDER.map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold",
                tierChipClass(t),
              )}
            >
              {`${TIER_LABEL[t]}: ${session.totals.by_tier[t]}`}
            </span>
          ))}
        </div>
      </div>

      {/* Session-complete banner */}
      {sessionComplete ? (
        <div
          className="rounded-lg border border-success/40 bg-success-softer px-3 py-2 text-xs text-success-fg"
          data-testid="purchase-session-complete"
          role="status"
        >
          <span className="font-semibold">Session complete</span> — all purchase
          orders for this horizon are placed or skipped. Start a new session
          when you&apos;re ready for next week.
        </div>
      ) : null}

      {/* Warnings */}
      {session.warnings.length > 0 ? (
        <div className="space-y-2" data-testid="purchase-session-warnings">
          {session.warnings.map((w, i) => (
            <div
              key={`${w.code}-${i}`}
              className="rounded-lg border border-warning/40 bg-warning-softer px-3 py-2 text-xs text-warning-fg"
            >
              <span className="font-semibold">{warningTitle(w.code)}: </span>
              {w.detail}
            </div>
          ))}
        </div>
      ) : null}

      {/* Tier sections */}
      {total === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-6 text-center text-sm text-fg-muted">
          <div>
            The engine ran successfully — no purchase orders need action within
            this horizon. Open the purchase calendar to see the wider window,
            or start a new session next week.
          </div>
          <Link
            href="/planning/purchase-calendar"
            className="btn btn-sm btn-outline"
          >
            Open Purchase Calendar →
          </Link>
        </div>
      ) : (
        TIER_ORDER.map((t) =>
          byTier[t].length > 0 ? (
            <section key={t} className="space-y-2">
              <h2 className="text-sm font-semibold text-fg-strong">
                {TIER_LABEL[t]}{" "}
                <span className="text-fg-muted">({byTier[t].length})</span>
              </h2>
              <div className="space-y-3">
                {byTier[t].map((po) => (
                  <PoCard
                    key={po.session_po_id}
                    po={po}
                    sessionOpen={session.status === "open"}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}

// ===========================================================================
// PO card
// ===========================================================================
function PoCard({
  po,
  sessionOpen,
}: {
  po: PurchaseSessionPo;
  sessionOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(po.status === "proposed");
  const [editing, setEditing] = useState(false);
  // line_id -> draft final_qty (string for the input)
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [draftDrop, setDraftDrop] = useState<Record<string, boolean>>({});
  const [placeDate, setPlaceDate] = useState<string>(
    po.earliest_need_date ?? "",
  );
  const [showPlace, setShowPlace] = useState(false);
  const [copied, setCopied] = useState(false);

  const editMut = useEditPo();
  const approveMut = useApprovePo();
  const placeMut = usePlacePo();
  const skipMut = useSkipPo();

  const busy =
    editMut.isPending ||
    approveMut.isPending ||
    placeMut.isPending ||
    skipMut.isPending;

  const actionError =
    (editMut.error as Error | null)?.message ??
    (approveMut.error as Error | null)?.message ??
    (placeMut.error as Error | null)?.message ??
    (skipMut.error as Error | null)?.message ??
    null;

  const canMutate =
    sessionOpen && (po.status === "proposed" || po.status === "approved");

  function beginEdit() {
    const q: Record<string, string> = {};
    const d: Record<string, boolean> = {};
    for (const l of po.lines) {
      q[l.session_po_line_id] = String(l.final_qty);
      d[l.session_po_line_id] = l.is_dropped;
    }
    setDraftQty(q);
    setDraftDrop(d);
    setEditing(true);
  }

  function saveEdit() {
    const lines = po.lines.map((l) => {
      // Guard the free-text qty input: an empty, non-numeric, or negative
      // draft must not reach the API (Number("") is 0, Number("x") is NaN
      // which JSON-encodes to null). Fall back to the current quantity.
      const raw = draftQty[l.session_po_line_id];
      const parsed = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
      const finalQty =
        Number.isFinite(parsed) && parsed >= 0 ? parsed : l.final_qty;
      return {
        session_po_line_id: l.session_po_line_id,
        final_qty: finalQty,
        is_dropped: draftDrop[l.session_po_line_id] ?? l.is_dropped,
      };
    });
    editMut.mutate(
      { poId: po.session_po_id, lines },
      { onSuccess: () => setEditing(false) },
    );
  }

  async function copyDoc() {
    if (!po.order_document_text) return;
    try {
      await navigator.clipboard.writeText(po.order_document_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the <pre> is selectable as a fallback
    }
  }

  const activeLines = po.lines.filter((l) => !l.is_dropped && l.final_qty > 0);

  return (
    <div
      className="card p-4 space-y-3"
      data-testid={`purchase-po-${po.session_po_id}`}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`po-detail-${po.session_po_id}`}
          className="text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-fg-strong">
              <bdi>{po.supplier_snapshot}</bdi>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-3xs font-semibold",
                tierChipClass(po.tier),
              )}
            >
              {TIER_LABEL[po.tier]}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-3xs font-semibold",
                statusChipClass(po.status),
              )}
            >
              {STATUS_LABEL[po.status]}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-fg-muted">
            {`${activeLines.length} component${activeLines.length === 1 ? "" : "s"} · order by ${po.order_by_date}`}
            {po.covered_through_date
              ? ` · covers until ${po.covered_through_date}`
              : ""}
          </div>
        </button>
        <div className="text-right">
          <div className="font-mono tabular-nums text-sm font-semibold text-fg">
            {fmtMoney(po.total_cost)}
          </div>
          {po.po_id ? (
            <div className="text-3xs text-success-fg">{`PO: ${po.po_id}`}</div>
          ) : null}
        </div>
      </div>

      {/* Blocking issues */}
      {po.blocking_issues.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning-softer px-2 py-1 text-3xs text-warning-fg">
          {`Review ${po.blocking_issues.length} blocking issue${po.blocking_issues.length === 1 ? "" : "s"} before approval.`}
        </div>
      ) : null}

      {expanded ? (
        <div id={`po-detail-${po.session_po_id}`} className="space-y-3">
          {/* Lines table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border/60 text-3xs uppercase tracking-sops text-fg-subtle">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Component</th>
                  <th className="px-2 py-1 text-right font-semibold">Recommended</th>
                  <th className="px-2 py-1 text-right font-semibold">Final qty</th>
                  <th className="px-2 py-1 text-left font-semibold">UOM</th>
                  <th className="px-2 py-1 text-right font-semibold">Line cost</th>
                  {editing ? (
                    <th className="px-2 py-1 text-left font-semibold">Drop</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <LineRow
                    key={l.session_po_line_id}
                    line={l}
                    editing={editing}
                    draftQty={draftQty[l.session_po_line_id]}
                    draftDrop={draftDrop[l.session_po_line_id]}
                    onQty={(v) =>
                      setDraftQty((p) => ({
                        ...p,
                        [l.session_po_line_id]: v,
                      }))
                    }
                    onDrop={(v) =>
                      setDraftDrop((p) => ({
                        ...p,
                        [l.session_po_line_id]: v,
                      }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Order document (after approval).
              The body is generated in Hebrew because it is sent to the
              supplier. The surrounding chrome is English; the bidi context
              is made explicit via <article lang="he" dir="rtl">. */}
          {po.order_document_text ? (
            <section
              dir="ltr"
              aria-label="Order document"
              data-testid={`purchase-po-doc-${po.session_po_id}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order document (Hebrew, sent to supplier)
                </h3>
                <button
                  type="button"
                  onClick={copyDoc}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-3xs text-fg-muted hover:text-fg"
                  title="Copy order document to clipboard"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <article
                lang="he"
                dir="rtl"
                className="mt-1 whitespace-pre-wrap rounded-lg bg-bg-subtle p-3 text-xs text-fg"
              >
                {po.order_document_text}
              </article>
            </section>
          ) : null}

          {/* Action error */}
          {actionError ? <ErrorBanner message={actionError} /> : null}

          {/* Actions */}
          {canMutate ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {editing ? (
                <>
                  <ActionButton
                    onClick={saveEdit}
                    disabled={busy}
                    variant="primary"
                    label={editMut.isPending ? "Saving…" : "Save changes"}
                    title="Save the edited quantities for this PO"
                  />
                  <ActionButton
                    onClick={() => setEditing(false)}
                    disabled={busy}
                    variant="ghost"
                    label="Cancel"
                    title="Discard your edits and return to the read-only view"
                  />
                </>
              ) : (
                <>
                  <ActionButton
                    onClick={beginEdit}
                    disabled={busy}
                    variant="ghost"
                    label="Edit lines"
                    title="Adjust quantities or drop lines before approval"
                  />
                  {po.status === "proposed" ? (
                    <ActionButton
                      onClick={() =>
                        approveMut.mutate({ poId: po.session_po_id })
                      }
                      disabled={busy}
                      variant="primary"
                      label={
                        approveMut.isPending
                          ? "Approving…"
                          : "Approve & Generate Document"
                      }
                      title="Lock the PO and generate the supplier-facing Hebrew order document"
                    />
                  ) : null}
                  {po.status === "approved" ? (
                    <ActionButton
                      onClick={() => setShowPlace((v) => !v)}
                      disabled={busy}
                      variant="primary"
                      label="Place Order"
                      title="Record the PO as placed and notify downstream tracking"
                    />
                  ) : null}
                  <ActionButton
                    onClick={() => skipMut.mutate({ poId: po.session_po_id })}
                    disabled={busy}
                    variant="ghost"
                    label={skipMut.isPending ? "Skipping…" : "Skip"}
                    title="Skip this PO in the current session (it will not be ordered now)"
                  />
                </>
              )}
            </div>
          ) : null}

          {/* Place confirmation */}
          {showPlace && po.status === "approved" ? (
            <div
              className="rounded-lg border border-border/60 bg-bg-subtle p-3 space-y-2"
              data-testid={`purchase-po-place-confirm-${po.session_po_id}`}
            >
              <div className="text-xs font-semibold text-fg">Place this order?</div>
              <div className="text-xs text-fg-muted">
                This records the PO as placed and notifies downstream tracking.
                You will not be able to re-edit lines after placement.
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                Expected receive date:
                <input
                  type="date"
                  value={placeDate}
                  onChange={(e) => setPlaceDate(e.target.value)}
                  className="rounded border border-border/60 bg-bg px-2 py-0.5 text-xs"
                />
              </label>
              <div className="flex gap-2">
                <ActionButton
                  onClick={() =>
                    placeMut.mutate({
                      poId: po.session_po_id,
                      expected_receive_date: placeDate || undefined,
                    })
                  }
                  disabled={busy}
                  variant="primary"
                  label={placeMut.isPending ? "Placing…" : "Place Order"}
                  title="Confirm placement and create the real PO record"
                />
                <ActionButton
                  onClick={() => setShowPlace(false)}
                  disabled={busy}
                  variant="ghost"
                  label="Cancel"
                  title="Close this dialog without placing the order"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line row
// ---------------------------------------------------------------------------
function LineRow({
  line,
  editing,
  draftQty,
  draftDrop,
  onQty,
  onDrop,
}: {
  line: PurchaseSessionLine;
  editing: boolean;
  draftQty: string | undefined;
  draftDrop: boolean | undefined;
  onQty: (v: string) => void;
  onDrop: (v: boolean) => void;
}) {
  const dropped = editing ? (draftDrop ?? line.is_dropped) : line.is_dropped;
  return (
    <tr
      className={cn(
        "border-b border-border/30",
        dropped ? "opacity-40 line-through" : "",
      )}
    >
      <td className="px-2 py-1 text-left text-fg">
        <bdi>{line.line_label}</bdi>
        {line.is_user_added ? (
          <span className="ml-1 text-3xs text-accent">(added)</span>
        ) : null}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-fg-subtle">
        {fmtQty(line.recommended_qty)}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-fg">
        {editing ? (
          <input
            type="number"
            min={0}
            step="any"
            value={draftQty ?? String(line.final_qty)}
            onChange={(e) => onQty(e.target.value)}
            className="w-20 rounded border border-border/60 bg-bg px-1 py-0.5 text-xs text-right"
            aria-label="Final quantity"
          />
        ) : (
          fmtQty(line.final_qty)
        )}
      </td>
      <td className="px-2 py-1 text-left text-fg-muted">{line.uom}</td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-fg">
        {fmtMoney(line.line_cost)}
      </td>
      {editing ? (
        <td className="px-2 py-1 text-left">
          <input
            type="checkbox"
            checked={draftDrop ?? line.is_dropped}
            onChange={(e) => onDrop(e.target.checked)}
            aria-label="Drop this line"
          />
        </td>
      ) : null}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------
function ActionButton({
  onClick,
  disabled,
  variant,
  label,
  title,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: "primary" | "ghost";
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60",
        variant === "primary"
          ? "bg-accent text-accent-fg hover:bg-accent/90"
          : "border border-border/60 text-fg-muted hover:text-fg hover:border-border",
      )}
    >
      {label}
    </button>
  );
}

function tierChipClass(t: PoTier): string {
  if (t === "urgent") return "bg-danger-softer text-danger-fg";
  if (t === "must") return "bg-warning-softer text-warning-fg";
  return "bg-info-softer text-info-fg";
}
function statusChipClass(s: PoStatus): string {
  if (s === "placed") return "bg-success-softer text-success-fg";
  if (s === "approved") return "bg-info-softer text-info-fg";
  if (s === "skipped") return "bg-bg-subtle text-fg-subtle";
  return "bg-bg-subtle text-fg-muted";
}
function warningTitle(code: string): string {
  if (code === "stale_stock_input") return "Stock input is stale";
  if (code === "components_without_supplier")
    return "Components without supplier";
  if (code === "no_orders_needed") return "No orders needed";
  return "Heads up";
}

function EmptyNoSession() {
  return (
    <div
      className="card flex flex-col items-center gap-2 p-6 text-center text-sm text-fg-muted"
      data-testid="purchase-session-empty"
    >
      <div className="text-sm font-semibold text-fg-strong">
        No purchase session yet
      </div>
      <div className="max-w-md text-xs text-fg-muted">
        Start a session to run the weekly purchase engine and generate the
        consolidated PO drafts.
      </div>
    </div>
  );
}
function ErrorBanner({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      className="rounded-lg border border-danger/40 bg-danger-softer px-3 py-2 text-xs text-danger-fg"
      role="alert"
    >
      <div>{message}</div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-sm btn-outline mt-2"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

"use client";

// ---------------------------------------------------------------------------
// /planning/purchase-session — Weekly Procurement Session
//
// The planner's once-a-week procurement ritual. The daily-MRP purchase
// engine produces one consolidated PO draft per supplier; the planner
// reviews, edits, approves (which generates a ready-to-send Hebrew order
// document), and confirms placement (which creates the real PO).
//
// Tiers vs the weekly release fence:
//   urgent       — order date already passed / stock already short
//   must         — must be ordered before the next session
//   recommended  — worth pulling forward to consolidate
//
// Hebrew operator UI (planning corridor convention). No mock data — every
// loading / empty / error state is honest.
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

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------
const TIER_LABEL: Record<PoTier, string> = {
  urgent: "דחוף",
  must: "חובה השבוע",
  recommended: "מומלץ להקדים",
};
const STATUS_LABEL: Record<PoStatus, string> = {
  proposed: "מוצע",
  approved: "אושר — מוכן לשליחה",
  placed: "בוצע",
  skipped: "דולג",
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

  // Starting a new session while one is still open supersedes it — confirm
  // first so a stray click cannot discard an in-progress review.
  function handleStart() {
    if (
      session?.status === "open" &&
      !window.confirm(
        "קיים מושב רכש פתוח. הרצת מושב חדש תחליף אותו וכל פעולה שלא נשמרה תאבד. להמשיך?",
      )
    ) {
      return;
    }
    startMut.mutate({ session_type: "weekly" });
  }

  return (
    <div className="space-y-5">
      <WorkflowHeader
        eyebrow="מרחב התכנון"
        title="מושב הרכש השבועי"
        description="פעם בשבוע: סקירה, אישור וביצוע של כל הזמנות הרכש במרוכז — הזמנה אחת מאוחדת לכל ספק."
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
          >
            {startMut.isPending
              ? "מריץ…"
              : session
                ? "הרצת מושב חדש"
                : "התחל מושב רכש"}
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
        <LoadingState />
      ) : isError ? (
        <ErrorBanner
          message={
            (error as Error)?.message ?? "לא ניתן לטעון את מושב הרכש."
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
  const resolved = placed + skipped;
  const total = session.totals.po_count;

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="card p-4 space-y-3" data-testid="purchase-session-summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-fg">
            מושב מתאריך{" "}
            <span className="font-semibold">{session.session_date}</span>
            {session.status !== "open" ? (
              <span className="mr-2 text-fg-muted">
                ({session.status === "completed" ? "הושלם" : "הוחלף"})
              </span>
            ) : null}
          </div>
          <div className="text-xs text-fg-muted">
            {session.release_fence
              ? `גדר השחרור: ${session.release_fence}`
              : null}
          </div>
        </div>

        {/* Progress meter */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-fg-muted">
              {`${resolved} מתוך ${total} הזמנות טופלו`}
            </span>
            <span className="font-mono tabular-nums text-fg">
              {fmtMoney(session.totals.total_cost)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
            <div
              className="h-full bg-accent/70"
              style={{
                width: `${total > 0 ? Math.round((resolved / total) * 100) : 0}%`,
              }}
              aria-hidden
            />
          </div>
        </div>

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
          <div>המנוע רץ בהצלחה — אין כרגע הזמנות רכש שדורשות פעולה בתוך האופק.</div>
          <Link href="/planning/purchase-calendar" className="btn btn-sm btn-outline">
            ללוח הרכש ←
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

  const canMutate = sessionOpen && (po.status === "proposed" || po.status === "approved");

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
      const finalQty = Number.isFinite(parsed) && parsed >= 0 ? parsed : l.final_qty;
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
          className="text-right"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg-strong">
              {po.supplier_snapshot}
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
            {`${activeLines.length} פריטים · להזמין עד ${po.order_by_date}`}
            {po.covered_through_date
              ? ` · מכוסה עד ${po.covered_through_date}`
              : ""}
          </div>
        </button>
        <div className="text-left">
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
          {po.blocking_issues.length} התראות על שורות — בדקו לפני אישור.
        </div>
      ) : null}

      {expanded ? (
        <div id={`po-detail-${po.session_po_id}`} className="space-y-3">
          {/* Lines table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border/60 text-3xs uppercase tracking-sops text-fg-subtle">
                <tr>
                  <th className="px-2 py-1 text-right font-semibold">פריט</th>
                  <th className="px-2 py-1 text-left font-semibold">מומלץ</th>
                  <th className="px-2 py-1 text-left font-semibold">כמות</th>
                  <th className="px-2 py-1 text-left font-semibold">יחידה</th>
                  <th className="px-2 py-1 text-left font-semibold">עלות</th>
                  {editing ? (
                    <th className="px-2 py-1 text-left font-semibold">הסר</th>
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

          {/* Order document (after approval) */}
          {po.order_document_text ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  מסמך הזמנה — מוכן לשליחה לספק
                </span>
                <button
                  type="button"
                  onClick={copyDoc}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-3xs text-fg-muted hover:text-fg"
                >
                  {copied ? "הועתק ✓" : "העתק"}
                </button>
              </div>
              <pre
                dir="rtl"
                className="whitespace-pre-wrap rounded-lg bg-bg-subtle p-3 text-xs text-fg"
              >
                {po.order_document_text}
              </pre>
            </div>
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
                    label={editMut.isPending ? "שומר…" : "שמור שינויים"}
                  />
                  <ActionButton
                    onClick={() => setEditing(false)}
                    disabled={busy}
                    variant="ghost"
                    label="ביטול"
                  />
                </>
              ) : (
                <>
                  <ActionButton
                    onClick={beginEdit}
                    disabled={busy}
                    variant="ghost"
                    label="עריכה"
                  />
                  {po.status === "proposed" ? (
                    <ActionButton
                      onClick={() =>
                        approveMut.mutate({ poId: po.session_po_id })
                      }
                      disabled={busy}
                      variant="primary"
                      label={approveMut.isPending ? "מאשר…" : "אשר והפק מסמך"}
                    />
                  ) : null}
                  {po.status === "approved" ? (
                    <ActionButton
                      onClick={() => setShowPlace((v) => !v)}
                      disabled={busy}
                      variant="primary"
                      label="סמן כבוצע"
                    />
                  ) : null}
                  <ActionButton
                    onClick={() => skipMut.mutate({ poId: po.session_po_id })}
                    disabled={busy}
                    variant="ghost"
                    label={skipMut.isPending ? "מדלג…" : "דלג"}
                  />
                </>
              )}
            </div>
          ) : null}

          {/* Place confirmation */}
          {showPlace && po.status === "approved" ? (
            <div className="rounded-lg border border-border/60 bg-bg-subtle p-3 space-y-2">
              <div className="text-xs text-fg">
                אישור שההזמנה נשלחה לספק. רשומת ה-PO תיווצר במערכת.
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                תאריך אספקה צפוי:
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
                  label={placeMut.isPending ? "יוצר PO…" : "אישור — ההזמנה בוצעה"}
                />
                <ActionButton
                  onClick={() => setShowPlace(false)}
                  disabled={busy}
                  variant="ghost"
                  label="ביטול"
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
      <td className="px-2 py-1 text-right text-fg">
        {line.line_label}
        {line.is_user_added ? (
          <span className="mr-1 text-3xs text-accent">(נוסף)</span>
        ) : null}
      </td>
      <td className="px-2 py-1 text-left font-mono tabular-nums text-fg-subtle">
        {fmtQty(line.recommended_qty)}
      </td>
      <td className="px-2 py-1 text-left font-mono tabular-nums text-fg">
        {editing ? (
          <input
            type="number"
            min={0}
            step="any"
            value={draftQty ?? String(line.final_qty)}
            onChange={(e) => onQty(e.target.value)}
            className="w-20 rounded border border-border/60 bg-bg px-1 py-0.5 text-xs"
          />
        ) : (
          fmtQty(line.final_qty)
        )}
      </td>
      <td className="px-2 py-1 text-left text-fg-muted">{line.uom}</td>
      <td className="px-2 py-1 text-left font-mono tabular-nums text-fg">
        {fmtMoney(line.line_cost)}
      </td>
      {editing ? (
        <td className="px-2 py-1 text-left">
          <input
            type="checkbox"
            checked={draftDrop ?? line.is_dropped}
            onChange={(e) => onDrop(e.target.checked)}
            aria-label="הסר שורה"
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
}: {
  onClick: () => void;
  disabled: boolean;
  variant: "primary" | "ghost";
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
  if (code === "stale_stock_input") return "מלאי לא מעודכן";
  if (code === "components_without_supplier") return "רכיבים ללא ספק";
  if (code === "no_orders_needed") return "אין הזמנות נדרשות";
  return "שים לב";
}

function LoadingState() {
  return (
    <div className="card p-6 text-center text-sm text-fg-muted">
      טוען את מושב הרכש…
    </div>
  );
}
function EmptyNoSession() {
  return (
    <div className="card p-6 text-center text-sm text-fg-muted">
      עדיין לא הורץ מושב רכש. לחצו על &quot;התחל מושב רכש&quot; כדי להפיק את
      רשימת ההזמנות לשבוע.
    </div>
  );
}
function ErrorBanner({
  message,
  onRetry,
  retryLabel = "נסו שוב",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger-softer px-3 py-2 text-xs text-danger-fg">
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

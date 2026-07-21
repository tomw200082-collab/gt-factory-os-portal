"use client";

// ---------------------------------------------------------------------------
// FocusCard — a single purchase order, rendered for the focus-mode walk-through
// (Tranche 029). A polished, one-at-a-time version of the classic session
// PoCard: review + adjust lines, approve (generate the Hebrew order document),
// then place (create the real PO). Reuses the existing session mutations.
//
// State machine (driven by live po.status):
//   proposed → "הפק מסמך הזמנה"  (approve — generates the Hebrew order document)
//   approved → order document + expected-date + "העבר לביצוע רכש" (place —
//              hands the order to the office manager's placement queue; it is
//              NOT yet placed with the supplier, so the label must not read as
//              "done" — Tom-directed 2026-07-16, ux-release-gate FLOW-6)
//   placed   → "הועבר לביצוע" + PO ref (parent auto-advances)
// "דלג" is available until resolved. Line edit (final_qty + drop) is inline.
// ---------------------------------------------------------------------------

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  FileText,
  Pencil,
  Plus,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatIls } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";
import {
  useApprovePo,
  useEditPo,
  usePlacePo,
  useSkipPo,
} from "../../purchase-session/_lib/api";
import type {
  PlaceLinePrice,
  PoStatus,
  PurchaseSessionPo,
} from "../../purchase-session/_lib/types";
import { AddLineForm } from "./AddLineForm";
import {
  buildCoverageReasoning,
  parseCoverageTrace,
} from "../_lib/coverage-trace";

const STATUS_LABEL: Record<PoStatus, string> = {
  proposed: "מוצע",
  approved: "אושר — מוכן לשליחה",
  placed: "הועבר לביצוע",
  skipped: "דולג / בוטל",
};

// Preset cancel reasons (Tom-directed 2026-07-16 — same catalogue as the
// placement-queue discard panel, tranche 130, for corridor-wide consistency).
const CANCEL_REASONS = [
  "כבר לא נדרש",
  "כפילות",
  "המלצת המנוע שגויה",
  "לבחון שוב בסבב הבא",
] as const;
const STATUS_TONE: Record<PoStatus, BadgeTone> = {
  proposed: "neutral",
  approved: "info",
  placed: "success",
  skipped: "muted",
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// CoverageReasonRow — the "why this quantity" line. Decodes the per-line
// coverage_trace the session engine already returns (demand vs on-hand vs
// incoming → projected balance at need date) so the recommended quantity reads
// as an auditable subtraction instead of an unexplained number. Figures are in
// inventory units. Renders only when the trace carries usable signal.
// ---------------------------------------------------------------------------
function fmtTraceNum(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function CoverageReasonRow({
  trace,
  colSpan,
}: {
  trace: unknown;
  colSpan: number;
}): JSX.Element | null {
  const r = buildCoverageReasoning(parseCoverageTrace(trace));
  if (!r || !r.hasSignal) return null;
  const tone =
    r.severity === "stockout"
      ? "text-danger-fg"
      : r.severity === "below_safety"
        ? "text-warning-fg"
        : "text-fg-faint";
  const headline =
    r.severity === "stockout"
      ? r.needDate
        ? `צפוי להיגמר לפני ${r.needDate}`
        : "המלאי צפוי להיגמר"
      : r.severity === "below_safety"
        ? "יורד מתחת לרצפת הביטחון"
        : "כיסוי מספק";
  return (
    <tr
      className="border-b border-border/20 bg-bg-subtle/20"
      data-testid="focus-line-coverage"
    >
      <td colSpan={colSpan} className="px-3 py-1.5">
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xs text-fg-muted"
          dir="rtl"
        >
          <span className={cn("font-semibold", tone)}>{headline}</span>
          {r.demand != null && (
            <span>
              ביקוש{" "}
              <span className="font-mono tabular-nums text-fg">
                {fmtTraceNum(r.demand)}
              </span>
            </span>
          )}
          {r.onHand != null && (
            <span>
              במלאי{" "}
              <span className="font-mono tabular-nums text-fg">
                {fmtTraceNum(r.onHand)}
              </span>
            </span>
          )}
          {r.incoming != null && r.incoming > 0 && (
            <span>
              בדרך{" "}
              <span className="font-mono tabular-nums text-fg">
                {fmtTraceNum(r.incoming)}
              </span>
            </span>
          )}
          {r.projectedAtNeed != null && (
            <span>
              צפי במועד{" "}
              <span
                className={cn(
                  "font-mono tabular-nums",
                  r.wouldRunOut
                    ? "text-danger-fg font-semibold"
                    : "text-fg",
                )}
              >
                {fmtTraceNum(r.projectedAtNeed)}
              </span>
            </span>
          )}
          {r.coverDays != null && (
            <span className="text-fg-faint">
              מספיק ל-{fmtTraceNum(r.coverDays)} ימים
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export interface FocusResolveResult {
  kind: "placed" | "skipped";
  poId?: string | null;
}

export interface FocusCardProps {
  po: PurchaseSessionPo;
  whyNow: string;
  isOverdue: boolean;
  /** Called after a successful place or skip so the parent can auto-advance. */
  onResolve: (result: FocusResolveResult) => void;
  /** Reports whether the card holds unsaved line-quantity edits (INTER-004). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function FocusCard({
  po,
  whyNow,
  isOverdue,
  onResolve,
  onDirtyChange,
}: FocusCardProps): JSX.Element {
  const editMut = useEditPo();
  const approveMut = useApprovePo();
  const placeMut = usePlacePo();
  const skipMut = useSkipPo();

  const [editing, setEditing] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [draftDrop, setDraftDrop] = useState<Record<string, boolean>>({});
  // INTER-005: block save (instead of silently reverting) when a non-dropped
  // line has an invalid quantity.
  const [editError, setEditError] = useState<string | null>(null);
  const [placeDate, setPlaceDate] = useState<string>(
    po.earliest_need_date ?? "",
  );
  const [copied, setCopied] = useState(false);
  // Price Truth (Tranche 043) — optional per-line price actually paid (per
  // order UOM), keyed by session_po_line_id; sent only at place time for the
  // lines the planner edited. The confirm checkbox authorizes catalog
  // write-back for small deltas and appears only when a price was edited.
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({});
  const [confirmPriceUpdate, setConfirmPriceUpdate] = useState(true);

  // Cancel-with-reason (Tom-directed 2026-07-16): distinct from the quick,
  // reason-less "דחה" (defer) — "דחה" auto-resurfaces next session because the
  // engine recomputes from live net demand every week; this is the deliberate
  // alternative for a PO that should be declined WITH an audit trail. Same
  // backend action (skip → status='skipped'), now passing skip_reason (the
  // column + write path already existed server-side — the UI never collected
  // it until now).
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDetail, setCancelDetail] = useState("");
  const composedCancelReason =
    cancelReason === "אחר" ? cancelDetail.trim() : cancelReason;

  const primaryRef = useRef<HTMLButtonElement>(null);
  // ux-release-gate 2026-07-21 A11Y-102: move focus into the cancel panel
  // when it opens — otherwise keyboard/AT users are left on the trigger with
  // no announcement that a panel appeared.
  const cancelSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (cancelling) cancelSelectRef.current?.focus();
  }, [cancelling]);

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

  // Autofocus the primary CTA whenever the order or its status changes, so the
  // keyboard-driven planner can just press Enter to advance the state machine.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [po.session_po_id, po.status]);

  // Reset the edited prices when moving to another order in the walk-through.
  useEffect(() => {
    setDraftPrice({});
    setConfirmPriceUpdate(true);
  }, [po.session_po_id]);

  // INTER-004: report unsaved line-quantity/drop edits so FocusMode can confirm
  // before closing instead of silently discarding them.
  // ux-release-gate 2026-07-21 INT-101: an armed cancel panel (reason picked
  // or typed) is unsaved work too — without this, overlay-close discarded the
  // typed reason silently.
  const cancelDirty =
    cancelling && (cancelReason !== "" || cancelDetail.trim() !== "");
  const isDirty =
    cancelDirty ||
    (editing &&
      po.lines.some((l) => {
        const q = draftQty[l.session_po_line_id];
        const dropped = draftDrop[l.session_po_line_id] ?? l.is_dropped;
        return (
          (q !== undefined && q !== String(l.final_qty)) ||
          dropped !== l.is_dropped
        );
      }));
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function beginEdit(): void {
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

  function saveEdit(): void {
    let invalid = false;
    const lines = po.lines.map((l) => {
      const dropped = draftDrop[l.session_po_line_id] ?? l.is_dropped;
      const raw = draftQty[l.session_po_line_id];
      const parsed =
        raw === undefined || raw.trim() === "" ? NaN : Number(raw);
      const valid = Number.isFinite(parsed) && parsed >= 0;
      // A dropped line's quantity is irrelevant; only validate kept lines.
      if (!dropped && !valid) invalid = true;
      return {
        session_po_line_id: l.session_po_line_id,
        final_qty: valid ? parsed : l.final_qty,
        is_dropped: dropped,
      };
    });
    if (invalid) {
      // Don't silently revert to the old quantity — block and tell the planner.
      setEditError("יש כמות לא תקינה. הזן מספר אפס ומעלה, או סמן את השורה כהוסרה.");
      return;
    }
    setEditError(null);
    editMut.mutate(
      { poId: po.session_po_id, lines },
      { onSuccess: () => setEditing(false) },
    );
  }

  async function copyDoc(): Promise<void> {
    if (!po.order_document_text) return;
    try {
      await navigator.clipboard.writeText(po.order_document_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the <pre> stays selectable as a fallback
    }
  }

  const activeLines = po.lines.filter((l) => !l.is_dropped && l.final_qty > 0);

  const isResolved = po.status === "placed" || po.status === "skipped";

  // Price Truth (Tranche 043) — the prices the planner actually edited (valid
  // numbers >= 0 only). Empty array → nothing is sent at place.
  const editedLinePrices: PlaceLinePrice[] = po.lines.flatMap((l) => {
    const raw = draftPrice[l.session_po_line_id];
    if (raw === undefined || raw.trim() === "") return [];
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return [];
    return [{ session_po_line_id: l.session_po_line_id, unit_price_net: n }];
  });

  return (
    <div className="space-y-5" data-testid={`focus-card-${po.session_po_id}`}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-fg">{po.supplier_snapshot}</h2>
          {/* Tranche 132 ux-release-gate FLOW-002: the SQL tier badge
              (urgent/must/recommended) contradicted the shortage-math `whyNow`
              text below it whenever the two disagreed — ActionList already
              dropped this badge for the same reason; FocusCard renders the
              same PO and must not reintroduce the conflicting signal. */}
          <Badge tone={STATUS_TONE[po.status]} size="xs">
            {STATUS_LABEL[po.status]}
          </Badge>
          {isOverdue && (
            <Badge tone="danger" size="xs" dot animated>
              באיחור
            </Badge>
          )}
        </div>
        <div
          className={cn(
            "text-sm",
            isOverdue ? "text-danger-fg font-medium" : "text-fg-muted",
          )}
        >
          {whyNow}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
          <span className="tabular-nums">
            {activeLines.length} פריט{activeLines.length === 1 ? "" : "ים"}
          </span>
          <span className="font-mono tabular-nums text-base font-semibold text-fg">
            {formatIls(po.total_cost)}
          </span>
          {po.order_by_date && (
            <span
              className={cn(
                "tabular-nums",
                isOverdue && "text-danger-fg font-medium",
              )}
            >
              להזמין עד {po.order_by_date}
            </span>
          )}
          {po.earliest_need_date && (
            <span className="tabular-nums">נדרש {po.earliest_need_date}</span>
          )}
          {po.covered_through_date && (
            <span className="tabular-nums">מכוסה עד {po.covered_through_date}</span>
          )}
        </div>
      </div>

      {/* Blocking issues */}
      {po.blocking_issues.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{po.blocking_issues.length} התראות על שורות — בדקו לפני אישור.</span>
        </div>
      )}

      {/* Lines */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-bg-subtle/40 px-3 py-2">
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            שורות ההזמנה
          </span>
          {po.status !== "placed" &&
            (editing ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={busy}
                    className="btn btn-xs btn-accent"
                    data-testid="focus-save-lines"
                  >
                    {editMut.isPending ? "שומר…" : "שמור"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEditError(null);
                    }}
                    disabled={busy}
                    className="btn btn-xs btn-ghost"
                  >
                    ביטול
                  </button>
                </div>
                {editError && (
                  <p
                    className="text-3xs text-danger-fg"
                    role="alert"
                    data-testid="focus-edit-error"
                  >
                    {editError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={beginEdit}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg transition-colors"
                  data-testid="focus-edit-lines"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                  ערוך כמויות
                </button>
                <button
                  type="button"
                  onClick={() => setAddingLine((v) => !v)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-accent hover:text-accent/80 transition-colors"
                  data-testid="focus-add-line-toggle"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  הוסף שורה
                </button>
              </div>
            ))}
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-xs">
          {/* ux-release-gate 2026-07-21 A11Y-104: fg-muted, not fg-subtle —
              these headers are real informational text and fg-subtle's light
              theme sits at 3.09:1, under AA at this size. */}
          <thead className="border-b border-border/40 text-3xs uppercase tracking-sops text-fg-muted">
            <tr>
              <th className="px-3 py-1.5 text-right font-semibold">פריט</th>
              <th className="px-3 py-1.5 text-left font-semibold">מומלץ</th>
              <th className="px-3 py-1.5 text-left font-semibold">כמות</th>
              <th className="px-3 py-1.5 text-left font-semibold">יחידה</th>
              <th className="px-3 py-1.5 text-left font-semibold">עלות</th>
              {!isResolved && (
                <th className="px-3 py-1.5 text-left font-semibold">
                  מחיר ליחידה (₪)
                </th>
              )}
              {editing && (
                <th className="px-3 py-1.5 text-left font-semibold">הסר</th>
              )}
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => {
              const dropped = editing
                ? (draftDrop[l.session_po_line_id] ?? l.is_dropped)
                : l.is_dropped;
              return (
                <Fragment key={l.session_po_line_id}>
                <tr
                  className={cn(
                    "border-b border-border/20",
                    dropped && "opacity-40 line-through",
                  )}
                >
                  <td className="px-3 py-1.5 text-right text-fg">
                    {l.line_label}
                    {l.is_user_added && (
                      <span className="mr-1 text-3xs text-accent">(נוסף)</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-left font-mono tabular-nums text-fg-muted">
                    {fmtQty(l.recommended_qty)}
                  </td>
                  <td className="px-3 py-1.5 text-left font-mono tabular-nums text-fg">
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={draftQty[l.session_po_line_id] ?? String(l.final_qty)}
                        onChange={(e) => {
                          setEditError(null);
                          setDraftQty((p) => ({
                            ...p,
                            [l.session_po_line_id]: e.target.value,
                          }));
                        }}
                        className="w-20 rounded border border-border/60 bg-bg px-1 py-0.5 text-xs"
                        aria-label={`כמות עבור ${l.line_label}`}
                      />
                    ) : (
                      fmtQty(l.final_qty)
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-left text-fg-muted">{l.uom}</td>
                  <td className="px-3 py-1.5 text-left font-mono tabular-nums text-fg">
                    {formatIls(l.line_cost)}
                  </td>
                  {!isResolved && (
                    <td className="px-3 py-1.5 text-left">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={draftPrice[l.session_po_line_id] ?? ""}
                        onChange={(e) =>
                          setDraftPrice((p) => ({
                            ...p,
                            [l.session_po_line_id]: e.target.value,
                          }))
                        }
                        placeholder={fmtQty(l.unit_cost)}
                        className="w-20 rounded border border-border/60 bg-bg px-1 py-0.5 text-xs font-mono tabular-nums"
                        aria-label={`מחיר ליחידה עבור ${l.line_label}`}
                        data-testid={`focus-line-price-${l.session_po_line_id}`}
                        disabled={busy || dropped}
                      />
                    </td>
                  )}
                  {editing && (
                    <td className="px-3 py-1.5 text-left">
                      <input
                        type="checkbox"
                        checked={draftDrop[l.session_po_line_id] ?? l.is_dropped}
                        onChange={(e) =>
                          setDraftDrop((p) => ({
                            ...p,
                            [l.session_po_line_id]: e.target.checked,
                          }))
                        }
                        aria-label={`הסר ${l.line_label}`}
                      />
                    </td>
                  )}
                </tr>
                {!dropped && (
                  <CoverageReasonRow
                    trace={l.coverage_trace}
                    colSpan={
                      5 + (!isResolved ? 1 : 0) + (editing ? 1 : 0)
                    }
                  />
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Printable order sheet — detailed Hebrew order with spec + labels */}
      <Link
        href={`/planning/procurement/${po.session_po_id}/sheet`}
        className="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg transition-colors"
        data-testid="focus-open-sheet"
      >
        <FileText className="h-3 w-3" aria-hidden /> גיליון הזמנה להדפסה
      </Link>

      {/* Ad-hoc add line (Tranche 030) */}
      {addingLine && po.status !== "placed" && po.status !== "skipped" && (
        <AddLineForm
          busy={editMut.isPending}
          onCancel={() => setAddingLine(false)}
          onAdd={(line) =>
            editMut.mutate(
              { poId: po.session_po_id, add_lines: [line] },
              { onSuccess: () => setAddingLine(false) },
            )
          }
        />
      )}

      {/* Order document (after approval) */}
      {po.order_document_text && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              מסמך הזמנה — מוכן לשליחה לספק
            </span>
            <button
              type="button"
              onClick={() => void copyDoc()}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-3xs text-fg-muted hover:text-fg transition-colors"
              data-testid="focus-copy-doc"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" aria-hidden /> הועתק
                </>
              ) : (
                <>
                  <ClipboardCopy className="h-3 w-3" aria-hidden /> העתק
                </>
              )}
            </button>
          </div>
          <pre
            dir="rtl"
            className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-3 text-xs text-fg"
          >
            {po.order_document_text}
          </pre>
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger-fg"
          data-testid="focus-action-error"
        >
          {actionError}
        </div>
      )}

      {/* Placed success */}
      {po.status === "placed" && (
        <div
          className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-softer px-4 py-3 text-sm text-success-fg"
          data-testid="focus-placed"
        >
          <Check className="h-5 w-5 shrink-0" aria-hidden />
          <span>
            ההזמנה הועברה לתור הביצוע של מנהלת החשבונות.
            {po.po_id && (
              <span className="font-mono text-xs">
                {" "}·{" "}
                <Link
                  href={`/purchase-orders/${po.po_id}`}
                  className="underline-offset-2 hover:underline"
                  data-testid="focus-placed-po-link"
                >
                  PO {po.po_id.slice(0, 8)}…
                </Link>
              </span>
            )}
          </span>
        </div>
      )}

      {/* Cancel-with-reason panel */}
      {cancelling && po.status !== "placed" && po.status !== "skipped" && (
        <div
          className="space-y-3 rounded-lg border border-danger/30 bg-danger-softer/40 p-4"
          data-testid={`focus-cancel-panel-${po.session_po_id}`}
          // ux-release-gate 2026-07-21 INT-101: Escape dismisses THIS panel
          // only. stopPropagation keeps the event from reaching FocusMode's
          // window-level Escape handler (React delegates at the root, which
          // sits below window in the bubble path), which would close the
          // whole overlay and discard the typed reason.
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setCancelling(false);
              setCancelReason("");
              setCancelDetail("");
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`focus-cancel-reason-${po.session_po_id}`}
              className="text-xs font-medium text-fg"
            >
              סיבת ביטול
            </label>
            <select
              ref={cancelSelectRef}
              id={`focus-cancel-reason-${po.session_po_id}`}
              className="input w-48"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              data-testid={`focus-cancel-reason-${po.session_po_id}`}
            >
              <option value="">— בחר/י —</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="אחר">אחר…</option>
            </select>
            {cancelReason === "אחר" ? (
              <input
                type="text"
                className="input w-48"
                placeholder="פרט/י סיבה"
                value={cancelDetail}
                onChange={(e) => setCancelDetail(e.target.value)}
                aria-label="פירוט סיבת הביטול"
                data-testid={`focus-cancel-detail-${po.session_po_id}`}
              />
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCancelling(false);
                setCancelReason("");
                setCancelDetail("");
              }}
              disabled={busy}
              className="btn btn-ghost btn-sm"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() =>
                skipMut.mutate(
                  {
                    poId: po.session_po_id,
                    skip_reason: composedCancelReason,
                  },
                  { onSuccess: () => onResolve({ kind: "skipped" }) },
                )
              }
              disabled={!composedCancelReason || busy}
              title={!composedCancelReason ? "יש לבחור סיבת ביטול" : undefined}
              className="btn btn-sm border border-danger/50 bg-danger-softer text-danger-fg hover:bg-danger/10"
              data-testid={`focus-cancel-submit-${po.session_po_id}`}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden />
              בטל הזמנה
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {po.status !== "placed" && po.status !== "skipped" && !editing && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
          {po.status === "approved" && (
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              תאריך אספקה צפוי
              <input
                type="date"
                value={placeDate}
                onChange={(e) => setPlaceDate(e.target.value)}
                className="input"
                data-testid="focus-place-date"
              />
            </label>
          )}

          {/* Price write-back confirm — only when a price was edited */}
          {po.status === "approved" && editedLinePrices.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={confirmPriceUpdate}
                onChange={(e) => setConfirmPriceUpdate(e.target.checked)}
                disabled={busy}
                data-testid="focus-confirm-price-update"
              />
              עדכן מחיר קטלוג לפי ההזמנה
            </label>
          )}

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                skipMut.mutate(
                  { poId: po.session_po_id },
                  { onSuccess: () => onResolve({ kind: "skipped" }) },
                )
              }
              disabled={busy}
              className="btn btn-sm btn-ghost"
              title="דחייה מהירה — ההזמנה תוצע שוב אוטומטית בסבב הבא אם הצורך עדיין קיים"
              data-testid="focus-skip"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden />
              דלג
            </button>

            <button
              type="button"
              onClick={() => setCancelling(true)}
              disabled={busy}
              aria-expanded={cancelling}
              className="btn btn-sm btn-ghost text-danger-fg hover:bg-danger-softer"
              title="כמו דלג, אבל עם סיבה מתועדת לביקורת — לשימוש כשרוצים לתעד למה"
              data-testid="focus-cancel-toggle"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden />
              בטל עם סיבה
            </button>

            {po.status === "proposed" && (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => approveMut.mutate({ poId: po.session_po_id })}
                disabled={busy}
                className="btn btn-accent"
                data-testid="focus-approve"
              >
                {approveMut.isPending ? "מפיק מסמך…" : "הפק מסמך הזמנה"}
              </button>
            )}

            {po.status === "approved" && (
              <button
                ref={primaryRef}
                type="button"
                onClick={() =>
                  placeMut.mutate(
                    {
                      poId: po.session_po_id,
                      expected_receive_date: placeDate || undefined,
                      line_prices:
                        editedLinePrices.length > 0
                          ? editedLinePrices
                          : undefined,
                      confirm_price_update:
                        editedLinePrices.length > 0
                          ? confirmPriceUpdate
                          : undefined,
                    },
                    {
                      onSuccess: (data) =>
                        onResolve({ kind: "placed", poId: data.po.po_id }),
                    },
                  )
                }
                disabled={busy}
                className="btn btn-accent"
                data-testid="focus-place"
              >
                {placeMut.isPending ? "מעביר…" : "העבר לביצוע רכש"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

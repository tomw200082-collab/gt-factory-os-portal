"use client";

// ---------------------------------------------------------------------------
// FocusCard — a single purchase order, rendered for the focus-mode walk-through
// (Tranche 029). A polished, one-at-a-time version of the classic session
// PoCard: review + adjust lines, approve (generate the Hebrew order document),
// then place (create the real PO). Reuses the existing session mutations.
//
// State machine (driven by live po.status):
//   proposed → "אשר והפק מסמך"  (approve)
//   approved → order document + expected-date + "סמן כבוצע — צור הזמנה" (place)
//   placed   → success + PO ref (parent auto-advances)
// "דלג" is available until resolved. Line edit (final_qty + drop) is inline.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Pencil,
  Plus,
  SkipForward,
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
  PoTier,
  PurchaseSessionPo,
} from "../../purchase-session/_lib/types";
import { AddLineForm } from "./AddLineForm";

const TIER_LABEL: Record<PoTier, string> = {
  urgent: "דחוף",
  must: "חובה השבוע",
  recommended: "מומלץ להקדים",
};
const TIER_TONE: Record<PoTier, BadgeTone> = {
  urgent: "danger",
  must: "warning",
  recommended: "neutral",
};
const STATUS_LABEL: Record<PoStatus, string> = {
  proposed: "מוצע",
  approved: "אושר — מוכן לשליחה",
  placed: "בוצע",
  skipped: "דולג",
};
const STATUS_TONE: Record<PoStatus, BadgeTone> = {
  proposed: "neutral",
  approved: "info",
  placed: "success",
  skipped: "muted",
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
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
}

export function FocusCard({
  po,
  whyNow,
  isOverdue,
  onResolve,
}: FocusCardProps): JSX.Element {
  const editMut = useEditPo();
  const approveMut = useApprovePo();
  const placeMut = usePlacePo();
  const skipMut = useSkipPo();

  const [editing, setEditing] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [draftDrop, setDraftDrop] = useState<Record<string, boolean>>({});
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

  const primaryRef = useRef<HTMLButtonElement>(null);

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
    const lines = po.lines.map((l) => {
      const raw = draftQty[l.session_po_line_id];
      const parsed =
        raw === undefined || raw.trim() === "" ? NaN : Number(raw);
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
          <Badge tone={TIER_TONE[po.tier]} size="xs">
            {TIER_LABEL[po.tier]}
          </Badge>
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
        <div className="flex items-center gap-3 text-xs text-fg-faint">
          <span className="tabular-nums">
            {activeLines.length} פריט{activeLines.length === 1 ? "" : "ים"}
          </span>
          <span className="font-mono tabular-nums text-base font-semibold text-fg">
            {formatIls(po.total_cost)}
          </span>
          {po.covered_through_date && <span>מכוסה עד {po.covered_through_date}</span>}
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
                  onClick={() => setEditing(false)}
                  disabled={busy}
                  className="btn btn-xs btn-ghost"
                >
                  ביטול
                </button>
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
          <thead className="border-b border-border/40 text-3xs uppercase tracking-sops text-fg-subtle">
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
                <tr
                  key={l.session_po_line_id}
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
                  <td className="px-3 py-1.5 text-left font-mono tabular-nums text-fg-subtle">
                    {fmtQty(l.recommended_qty)}
                  </td>
                  <td className="px-3 py-1.5 text-left font-mono tabular-nums text-fg">
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={draftQty[l.session_po_line_id] ?? String(l.final_qty)}
                        onChange={(e) =>
                          setDraftQty((p) => ({
                            ...p,
                            [l.session_po_line_id]: e.target.value,
                          }))
                        }
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
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

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
            ההזמנה נוצרה.
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
              data-testid="focus-skip"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden />
              דלג
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
                {approveMut.isPending ? "מאשר…" : "אשר והפק מסמך"}
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
                {placeMut.isPending ? "יוצר PO…" : "סמן כבוצע — צור הזמנה"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

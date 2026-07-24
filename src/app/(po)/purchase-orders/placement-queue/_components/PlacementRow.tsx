"use client";

// ---------------------------------------------------------------------------
// PlacementRow — tranche 086 Part A. One APPROVED_TO_ORDER purchase order in
// the office-manager queue. Collapsed: supplier · PO# · total · expected date.
// Expanded: the PO's open lines with an editable unit price each, a payment-
// terms picker, and the terminal "בצע הזמנה" action (place → OPEN).
//
// Hebrew + RTL operator surface (authorized in CLAUDE.md for this route).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  Loader2,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  XCircle,
  Ban,
} from "lucide-react";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { formatIls } from "@/lib/utils/format-money";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { PAYMENT_TERMS, paymentTermByCode } from "@/lib/payment-terms";
import { SupplierCallLink } from "@/components/purchase/SupplierCallLink";
import { SwitchSupplierControl } from "@/components/purchase/SwitchSupplierControl";
import {
  usePoLines,
  usePlaceOrder,
  useCancelOrder,
  useSwitchSupplier,
  type QueuePo,
  type QueuePoLine,
} from "../_lib/api";

// Preset discard reasons (Tom-directed 2026-07-16). "אחר" requires free text.
const CANCEL_REASONS = [
  "כבר לא נדרש",
  "כפילות",
  "הוזמן בערוץ אחר",
  "הספק לא זמין",
  "מחיר/תנאים לא מתאימים",
] as const;

function lineName(l: QueuePoLine): string {
  return (
    l.component_name ?? l.item_name ?? l.component_id ?? l.item_id ?? "פריט"
  );
}

export function PlacementRow({
  po,
  onPlaced,
  onCancelled,
}: {
  po: QueuePo;
  // Called after a successful place so the page can show a durable success
  // banner — the row itself unmounts when the queue refetch drops this PO.
  onPlaced?: (po: QueuePo) => void;
  // Called after a successful discard (cancel-with-reason) for the same
  // durable-banner reason — the row unmounts when the queue refetch drops it.
  onCancelled?: (po: QueuePo, reason: string) => void;
}): JSX.Element {
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const linesQuery = usePoLines(po.po_id, open);
  const placeMut = usePlaceOrder();
  const cancelMut = useCancelOrder();
  const switchMut = useSwitchSupplier();
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Cancel-with-reason (Tom-directed 2026-07-16). Opens inline (not the lines
  // panel) so the office manager can clear stale orders without expanding each.
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDetail, setCancelDetail] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const composedReason =
    cancelReason === "אחר" ? cancelDetail.trim() : cancelReason;

  async function handleCancel(): Promise<void> {
    setCancelError(null);
    if (!composedReason) {
      setCancelError("יש לבחור סיבה לביטול.");
      return;
    }
    const ok = await confirm({
      title: `לבטל את ההזמנה ${po.po_number}?`,
      description: `ההזמנה תוסר מתור הביצוע ותסומן כמבוטלת. הסיבה תישמר בהערות ההזמנה: "${composedReason}". שחזור הזמנה שבוטלה נעשה רק דרך מנהל המערכת.`,
      confirmLabel: "בטל הזמנה",
      cancelLabel: "חזרה",
      tone: "danger",
      srFallbackDescription: "אשר/י ביטול הזמנה זו.",
    });
    if (!ok) return;
    cancelMut.mutate(
      { poId: po.po_id, po_number: po.po_number, reason: composedReason },
      {
        onSuccess: () => {
          setCancelling(false);
          onCancelled?.(po, composedReason);
        },
        onError: (e: Error) => setCancelError(e.message),
      },
    );
  }

  const [termCode, setTermCode] = useState<string>("");
  const [customTerm, setCustomTerm] = useState<string>("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // FLOW-003: supplier-confirmed arrival date (prefilled with the planner's
  // planned date; the office manager confirms/overrides it with the supplier).
  const [confirmedDate, setConfirmedDate] = useState<string>(
    po.expected_receive_date ?? "",
  );
  const [copied, setCopied] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);

  const lines = (linesQuery.data?.rows ?? []).filter(
    (l) => l.line_status === "OPEN" || l.line_status === "PARTIAL",
  );

  function priceFor(l: QueuePoLine): string {
    if (l.po_line_id in prices) return prices[l.po_line_id];
    return l.unit_price_net != null ? fmtNumStr(l.unit_price_net) : "";
  }

  const term = termCode === "custom" ? null : paymentTermByCode(termCode);
  const termLabel = termCode === "custom" ? customTerm.trim() : term?.label ?? "";

  // DR-018 INTER-003 (Tranche 124) — "בצע הזמנה" was clickable with missing
  // prices/terms; validation only fired post-click (handlePlace below stays
  // as a backstop for any state this misses).
  const canPlace =
    lines.length > 0 &&
    !!termLabel &&
    lines.every((l) => Number(priceFor(l)) > 0);

  const totalPreview = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const l of lines) {
      const p = Number(priceFor(l));
      const q = Number(l.ordered_qty);
      if (Number.isFinite(p) && p > 0 && Number.isFinite(q)) {
        sum += p * q;
        any = true;
      }
    }
    return any ? sum : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, prices]);

  async function handlePlace(): Promise<void> {
    setErrorMsg(null);
    if (!termLabel) {
      setErrorMsg("יש לבחור תנאי תשלום.");
      return;
    }
    if (lines.length === 0) {
      setErrorMsg("אין שורות פתוחות בהזמנה זו.");
      return;
    }
    const line_prices: { po_line_id: string; unit_price_net: number }[] = [];
    for (const l of lines) {
      const p = Number(priceFor(l));
      if (!Number.isFinite(p) || p <= 0) {
        setErrorMsg(`יש להזין מחיר חיובי לכל השורות (חסר: ${lineName(l)}).`);
        return;
      }
      line_prices.push({ po_line_id: l.po_line_id, unit_price_net: p });
    }
    // DR-018 INTER-005 (Tranche 124) — a blank confirmedDate was silently
    // omitted from the confirm dialog, reopening the no-ETA double-order
    // trap at the human step. Surface it explicitly instead.
    const ok = await confirm({
      title: `לבצע את ההזמנה ${po.po_number}?`,
      description: `ההזמנה תבוצע מול הספק עם תנאי תשלום "${termLabel}"${
        totalPreview != null ? ` · ${formatIls(totalPreview)}` : ""
      }${confirmedDate ? ` · צפי הגעה ${confirmedDate}` : ""}. לאחר הביצוע ההזמנה תהיה פתוחה ומוכנה לקבלת סחורה — לא ניתן לבטל הזמנה שבוצעה דרך המערכת, ושינויים בכמויות יחייבו תיאום מול הספק.${
        !confirmedDate
          ? " לא הוזן תאריך אספקה — ההזמנה תיפתח ללא צפי הגעה, ויש להוסיף אותו ידנית אחר כך."
          : ""
      }`,
      confirmLabel: "בצע הזמנה",
      cancelLabel: "ביטול",
      srFallbackDescription: "אשר/י פעולה זו.",
    });
    if (!ok) return;
    placeMut.mutate(
      {
        poId: po.po_id,
        payment_terms: termLabel || null,
        payment_terms_net_days: term?.net_days ?? null,
        payment_terms_eom: term?.eom ?? null,
        line_prices,
        confirm_price_update: true,
        expected_receive_date: confirmedDate || null,
      },
      {
        // On success the queue refetch drops this PO (no longer
        // APPROVED_TO_ORDER), so the row unmounts. Collapse defensively and
        // hand the success up to the page for a durable confirmation banner.
        onSuccess: () => {
          setOpen(false);
          onPlaced?.(po);
        },
        onError: (e: Error) => setErrorMsg(e.message),
      },
    );
  }

  return (
    <li className="card overflow-hidden" data-testid={`placement-row-${po.po_id}`}>
      {dialog}
      {/* Header — expand (tap) + discard (cancel-with-reason). Two sibling
          buttons, never nested, so both stay keyboard-reachable. */}
      <div className="flex items-stretch">
      <button
        type="button"
        onClick={() => {
          // ux-release-gate 2026-07-21 INT-102: expand and cancel panels are
          // mutually exclusive — never show "בצע הזמנה" and "בטל הזמנה"
          // stacked in the same row.
          setOpen((v) => !v);
          setCancelling(false);
          setCancelError(null);
        }}
        aria-expanded={open}
        className="flex min-h-[56px] flex-1 items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-bg-subtle/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-testid={`placement-row-toggle-${po.po_id}`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg-strong">
            {po.supplier_name ?? "ספק לא ידוע"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
            <span className="font-mono">{po.po_number}</span>
            <span className="font-mono tabular-nums text-fg">
              {formatIls(Number(po.total_net))}
            </span>
            {po.order_by_date ? (
              <span
                className={
                  po.order_by_date < todayIso
                    ? "font-semibold text-danger-fg"
                    : "font-medium text-fg"
                }
              >
                · להזמין עד {po.order_by_date}
                {po.order_by_date < todayIso ? " (באיחור)" : ""}
              </span>
            ) : null}
            {po.expected_receive_date ? (
              <span>· צפי הגעה {po.expected_receive_date}</span>
            ) : null}
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setCancelling((v) => !v);
          setCancelError(null);
          // INT-102: see the expand toggle — the two panels never co-exist.
          setOpen(false);
        }}
        aria-expanded={cancelling}
        aria-label={`בטל את ההזמנה ${po.po_number}`}
        title="בטל הזמנה"
        className="flex shrink-0 items-center gap-1.5 border-r border-border/60 px-3 text-fg-muted transition-colors hover:bg-danger-softer hover:text-danger-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        data-testid={`placement-cancel-toggle-${po.po_id}`}
      >
        <XCircle className="h-4 w-4" aria-hidden />
        {/* ux-release-gate 2026-07-21 VIS-101: same trigger grammar as the
            FocusCard cancel — visible label where there is room. */}
        <span className="hidden text-xs font-medium sm:inline">
          בטל עם סיבה
        </span>
      </button>
      </div>

      {/* Cancel-with-reason panel */}
      {cancelling ? (
        <div
          className="space-y-3 border-t border-danger/30 bg-danger-softer/40 p-4"
          data-testid={`placement-cancel-panel-${po.po_id}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`placement-cancel-reason-${po.po_id}`}
              className="text-sm font-medium text-fg"
            >
              סיבת ביטול
            </label>
            <select
              id={`placement-cancel-reason-${po.po_id}`}
              className="input w-52"
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                setCancelError(null);
              }}
              data-testid={`placement-cancel-reason-${po.po_id}`}
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
                className="input w-52"
                placeholder="פרט/י סיבה"
                value={cancelDetail}
                onChange={(e) => {
                  setCancelDetail(e.target.value);
                  setCancelError(null);
                }}
                data-testid={`placement-cancel-detail-${po.po_id}`}
                aria-label="פירוט סיבת הביטול"
              />
            ) : null}
          </div>

          <div
            role="alert"
            aria-live="assertive"
            className={
              cancelError
                ? "flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
                : "sr-only"
            }
            data-testid={`placement-cancel-error-${po.po_id}`}
          >
            {cancelError ? (
              <>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{cancelError}</span>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCancelling(false);
                setCancelError(null);
              }}
              disabled={cancelMut.isPending}
              className="btn btn-ghost btn-sm"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={!composedReason || cancelMut.isPending}
              title={!composedReason ? "יש לבחור סיבת ביטול" : undefined}
              className="btn btn-sm border border-danger/50 bg-danger-softer text-danger-fg hover:bg-danger/10"
              data-testid={`placement-cancel-submit-${po.po_id}`}
            >
              {cancelMut.isPending ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <Ban className="h-4 w-4" aria-hidden />
              )}
              בטל הזמנה
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="border-t border-border/60 p-4">
          {linesQuery.isLoading ? (
            <div
              className="space-y-2"
              aria-busy="true"
              data-testid={`placement-lines-loading-${po.po_id}`}
            >
              <div className="h-10 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-10 w-2/3 animate-pulse rounded bg-bg-subtle" />
            </div>
          ) : linesQuery.isError ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
            >
              לא ניתן לטעון את שורות ההזמנה.{" "}
              <button
                type="button"
                onClick={() => void linesQuery.refetch()}
                className="inline-flex min-h-[44px] items-center rounded px-1 font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                נסה שוב
              </button>
            </div>
          ) : lines.length === 0 ? (
            <div className="text-sm text-fg-muted">
              אין שורות פתוחות בהזמנה זו.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tranche 140 raw-material-first: the materials below are the
                  heroes; the supplier is a labelled attribute with a
                  click-to-call so the office manager phones them in one tap. */}
              <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-bg-subtle/30 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-fg-muted">ספק:</span>
                  <span className="text-sm font-medium text-fg">
                    {po.supplier_name ?? "ספק לא ידוע"}
                  </span>
                  <SupplierCallLink
                    phone={po.supplier_phone}
                    supplierName={po.supplier_name ?? undefined}
                  />
                </div>
                {/* Tranche 140: switch the whole order to another supplier that
                    can fulfil every material — for when the current one is out
                    / unreachable. Optional reason. */}
                <SwitchSupplierControl
                  candidates={po.candidate_suppliers ?? []}
                  materialLabel={`הזמנה ${po.po_number}`}
                  isPending={switchMut.isPending}
                  error={switchError}
                  onResetError={() => setSwitchError(null)}
                  onSwitch={({ target_supplier_id, reason }) => {
                    setSwitchError(null);
                    switchMut.mutate(
                      { poId: po.po_id, target_supplier_id, reason },
                      {
                        onError: (err) =>
                          setSwitchError(
                            err instanceof Error
                              ? err.message
                              : "החלפת הספק נכשלה.",
                          ),
                      },
                    );
                  }}
                />
              </div>

              {/* Lines + per-line price */}
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li
                    key={l.po_line_id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg-strong">
                        {lineName(l)}
                      </div>
                      <div className="text-xs text-fg-muted">
                        כמות:{" "}
                        <span className="font-mono tabular-nums">
                          {fmtNumStr(l.ordered_qty)} {l.uom}
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5">
                      <span className="text-xs text-fg-muted">מחיר ליח׳ ₪</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        required
                        className="input w-28 text-left tabular-nums"
                        value={priceFor(l)}
                        onChange={(e) =>
                          setPrices((prev) => ({
                            ...prev,
                            [l.po_line_id]: e.target.value,
                          }))
                        }
                        data-testid={`placement-price-${l.po_line_id}`}
                        aria-label={`מחיר ליחידה עבור ${lineName(l)}`}
                      />
                    </label>
                  </li>
                ))}
              </ul>

              {/* Paste-ready Hebrew order message (from the originating session PO) */}
              {po.order_document_text ? (
                <div className="rounded-md border border-border/60 bg-bg-subtle/40 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-fg-muted">
                      הודעת הזמנה לספק
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(po.order_document_text ?? "")
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          });
                      }}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded px-2 text-xs font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      data-testid={`placement-copy-doc-${po.po_id}`}
                    >
                      <span aria-live="polite">{copied ? "הועתק" : "העתק"}</span>
                      {copied ? <span aria-hidden>✓</span> : null}
                    </button>
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-fg">
                    {po.order_document_text}
                  </pre>
                </div>
              ) : null}

              {/* FLOW-003: supplier-confirmed arrival date */}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`placement-eta-${po.po_id}`}
                  className="text-sm font-medium text-fg"
                >
                  תאריך אספקה מאושר
                </label>
                <input
                  id={`placement-eta-${po.po_id}`}
                  type="date"
                  className="input w-44"
                  value={confirmedDate}
                  min={todayIso}
                  onChange={(e) => setConfirmedDate(e.target.value)}
                  data-testid={`placement-eta-${po.po_id}`}
                />
              </div>

              {/* Payment terms */}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`placement-terms-${po.po_id}`}
                  className="text-sm font-medium text-fg"
                >
                  תנאי תשלום
                </label>
                <select
                  id={`placement-terms-${po.po_id}`}
                  className="input w-40"
                  value={termCode}
                  required
                  onChange={(e) => setTermCode(e.target.value)}
                  data-testid={`placement-terms-${po.po_id}`}
                >
                  <option value="">— בחר/י —</option>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                  <option value="custom">אחר…</option>
                </select>
                {termCode === "custom" ? (
                  <input
                    type="text"
                    className="input w-40"
                    placeholder="תנאי תשלום מותאם"
                    value={customTerm}
                    onChange={(e) => setCustomTerm(e.target.value)}
                    data-testid={`placement-terms-custom-${po.po_id}`}
                    aria-label="תנאי תשלום מותאם"
                  />
                ) : null}
                {totalPreview != null ? (
                  <span className="ms-auto text-sm text-fg-muted">
                    סה״כ:{" "}
                    <span className="font-mono tabular-nums text-fg">
                      {formatIls(totalPreview)}
                    </span>
                  </span>
                ) : null}
              </div>

              {/* A11Y-010: always mounted so AT announces every error as a text
                  mutation (not a node remount that some screen readers miss). */}
              <div
                role="alert"
                aria-live="assertive"
                className={
                  errorMsg
                    ? "flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
                    : "sr-only"
                }
                data-testid={`placement-error-${po.po_id}`}
              >
                {errorMsg ? (
                  <>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{errorMsg}</span>
                  </>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handlePlace()}
                  disabled={!canPlace || placeMut.isPending}
                  title={!canPlace ? "יש להזין מחיר לכל השורות ולבחור תנאי תשלום" : undefined}
                  className="btn btn-primary"
                  data-testid={`placement-submit-${po.po_id}`}
                >
                  {placeMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <PackageCheck className="h-4 w-4" aria-hidden />
                  )}
                  בצע הזמנה
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

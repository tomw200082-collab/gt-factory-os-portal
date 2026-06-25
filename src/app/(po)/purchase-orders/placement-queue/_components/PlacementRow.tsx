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
} from "lucide-react";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { formatIls } from "@/lib/utils/format-money";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { PAYMENT_TERMS, paymentTermByCode } from "@/lib/payment-terms";
import {
  usePoLines,
  usePlaceOrder,
  type QueuePo,
  type QueuePoLine,
} from "../_lib/api";

function lineName(l: QueuePoLine): string {
  return (
    l.component_name ?? l.item_name ?? l.component_id ?? l.item_id ?? "פריט"
  );
}

export function PlacementRow({
  po,
  onPlaced,
}: {
  po: QueuePo;
  // Called after a successful place so the page can show a durable success
  // banner — the row itself unmounts when the queue refetch drops this PO.
  onPlaced?: (po: QueuePo) => void;
}): JSX.Element {
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const linesQuery = usePoLines(po.po_id, open);
  const placeMut = usePlaceOrder();

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
    const ok = await confirm({
      title: `לבצע את ההזמנה ${po.po_number}?`,
      description: `ההזמנה תבוצע מול הספק עם תנאי תשלום "${termLabel}"${
        totalPreview != null ? ` · ${formatIls(totalPreview)}` : ""
      }${confirmedDate ? ` · צפי הגעה ${confirmedDate}` : ""}. לאחר הביצוע ההזמנה תהיה פתוחה ומוכנה לקבלת סחורה — שינויים בכמויות יחייבו תיאום מול הספק.`,
      confirmLabel: "בצע הזמנה",
      cancelLabel: "ביטול",
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
      {/* Header — tap to expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-bg-subtle/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger-fg"
            >
              לא ניתן לטעון את שורות ההזמנה.{" "}
              <button
                type="button"
                onClick={() => void linesQuery.refetch()}
                className="font-medium underline hover:no-underline"
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
                        min="0"
                        step="0.01"
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
                      className="text-xs font-medium underline hover:no-underline"
                      data-testid={`placement-copy-doc-${po.po_id}`}
                    >
                      {copied ? "הועתק ✓" : "העתק"}
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

              {errorMsg ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger-fg"
                  data-testid={`placement-error-${po.po_id}`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{errorMsg}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handlePlace()}
                  disabled={placeMut.isPending}
                  className="btn btn-primary"
                  data-testid={`placement-submit-${po.po_id}`}
                >
                  {placeMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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

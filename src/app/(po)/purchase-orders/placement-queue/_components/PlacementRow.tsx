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
  useScheduleOrder,
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

// Tranche 150 — why the supplier could not supply part of the order. These are
// about the SUPPLIER's inability, which is a different question from the
// discard reasons above (those are about us no longer wanting it).
const SPLIT_REASONS = [
  "אין במלאי אצל הספק",
  "הספק לא מספק את הכמות המלאה",
  "מחיר גבוה מדי לשורה הזו",
  "זמן אספקה ארוך מדי",
] as const;

/** Per-line supply outcome. `full` is the default so the common case — the
 *  supplier had everything — costs the office manager nothing. */
type ScheduleRiskReason =
  | "PLANNER_ACCEPTED_RISK"
  | "SUPPLIER_CONSTRAINT"
  | "CASHFLOW"
  | "STORAGE_CONSTRAINT"
  | "OTHER";

const SCHEDULE_RISK_REASONS: Array<{ value: ScheduleRiskReason; label: string }> = [
  { value: "PLANNER_ACCEPTED_RISK", label: "אישור סיכון של מתכנן" },
  { value: "SUPPLIER_CONSTRAINT", label: "אילוץ ספק" },
  { value: "CASHFLOW", label: "תזרים מזומנים" },
  { value: "STORAGE_CONSTRAINT", label: "מגבלת אחסון" },
  { value: "OTHER", label: "אחר" },
];

function nextProcurementWorkdayIso(fromIso: string): string {
  const d = new Date(`${fromIso}T12:00:00Z`);
  for (let i = 0; i < 10; i += 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow >= 0 && dow <= 4) return d.toISOString().slice(0, 10);
  }
  return fromIso;
}

type LineState = "full" | "partial" | "none";

function lineName(l: QueuePoLine): string {
  return (
    l.component_name ?? l.item_name ?? l.component_id ?? l.item_id ?? "פריט"
  );
}

function dueLabel(po: QueuePo): string {
  switch (po.due_state) {
    case "needs_schedule":
      return "דורש תזמון";
    case "overdue":
      return "באיחור";
    case "today":
      return "לביצוע היום";
    case "next_7_days":
      return "ב-7 ימים הקרובים";
    case "later":
      return "עתידי";
    default:
      return "מתוזמן";
  }
}

function riskLabel(po: QueuePo): string | null {
  switch (po.risk_state) {
    case "needs_schedule":
      return "אין תאריך ביצוע";
    case "after_safe_date":
      return "אחרי המועד הבטוח";
    case "safe_date_passed":
      return "המועד הבטוח עבר";
    default:
      return null;
  }
}

export function PlacementRow({
  po,
  onPlaced,
  onCancelled,
}: {
  po: QueuePo;
  // Called after a successful place so the page can show a durable success
  // banner — the row itself unmounts when the queue refetch drops this PO.
  // Tranche 150: `splitPoId` is the sibling PO holding the remainder on a
  // partial placement (null on a full one) so the banner can name it.
  onPlaced?: (po: QueuePo, splitPoId?: string | null) => void;
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
  const scheduleMut = useScheduleOrder();
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

  function handleSchedule(): void {
    setScheduleError(null);
    if (!scheduleDate) {
      setScheduleError("יש לבחור תאריך ביצוע.");
      return;
    }
    if (scheduleDate < todayIso) {
      setScheduleError("לא ניתן לתזמן לעבר.");
      return;
    }
    if (scheduleDateAfterSafe && !scheduleNote.trim()) {
      setScheduleError("תזמון אחרי המועד הבטוח דורש סיבת חריגה.");
      return;
    }
    scheduleMut.mutate(
      {
        poId: po.po_id,
        scheduled_order_date: scheduleDate,
        planned_receive_date: plannedDate || null,
        expected_updated_at: po.updated_at,
        risk_override_ack: scheduleDateAfterSafe,
        risk_reason: scheduleDateAfterSafe ? scheduleRiskReason : undefined,
        risk_note: scheduleDateAfterSafe ? scheduleNote.trim() : undefined,
      },
      {
        onSuccess: () => {
          setScheduling(false);
          setScheduleError(null);
        },
        onError: (e: Error) => setScheduleError(e.message),
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
    po.expected_receive_date ?? po.planned_receive_date ?? "",
  );
  const [copied, setCopied] = useState(false);
  const todayIso = po.as_of_date || new Date().toISOString().slice(0, 10);
  const [scheduling, setScheduling] = useState(
    po.due_state === "needs_schedule" || po.risk_state !== "ok",
  );
  const [scheduleDate, setScheduleDate] = useState<string>(
    po.scheduled_order_date ?? todayIso,
  );
  const [plannedDate, setPlannedDate] = useState<string>(
    po.planned_receive_date ?? "",
  );
  const [scheduleNote, setScheduleNote] = useState("");
  const [scheduleRiskReason, setScheduleRiskReason] = useState<ScheduleRiskReason>(
    "PLANNER_ACCEPTED_RISK",
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const scheduleRiskLabel = riskLabel(po);
  const needsSchedule = po.due_state === "needs_schedule" || !po.scheduled_order_date;
  const futureSchedule = !!po.scheduled_order_date && po.scheduled_order_date > todayIso;
  const scheduleDateAfterSafe =
    !!scheduleDate && !!po.latest_safe_order_date && scheduleDate > po.latest_safe_order_date;
  const canAttemptPlacementToday = !needsSchedule && !futureSchedule;

  const lines = (linesQuery.data?.rows ?? []).filter(
    (l) => l.line_status === "OPEN" || l.line_status === "PARTIAL",
  );

  function priceFor(l: QueuePoLine): string {
    if (l.po_line_id in prices) return prices[l.po_line_id];
    return l.unit_price_net != null ? fmtNumStr(l.unit_price_net) : "";
  }

  // ── Tranche 150: partial placement ──────────────────────────────────────
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});
  const [partialQtys, setPartialQtys] = useState<Record<string, string>>({});
  const [splitPreset, setSplitPreset] = useState<string>("");
  const [splitFreeText, setSplitFreeText] = useState<string>("");

  function stateFor(l: QueuePoLine): LineState {
    return lineStates[l.po_line_id] ?? "full";
  }
  /** The amount the supplier DID supply, for the placed side of the split. */
  function suppliedQty(l: QueuePoLine): number {
    const ordered = Number(l.ordered_qty);
    const st = stateFor(l);
    if (st === "none") return 0;
    if (st === "full") return ordered;
    const partial = Number(partialQtys[l.po_line_id]);
    return Number.isFinite(partial) ? partial : NaN;
  }
  function partialInvalid(l: QueuePoLine): boolean {
    if (stateFor(l) !== "partial") return false;
    const q = suppliedQty(l);
    const ordered = Number(l.ordered_qty);
    return !Number.isFinite(q) || q <= 0 || q >= ordered;
  }

  function setLineState(l: QueuePoLine, next: LineState): void {
    setLineStates((prev) => ({ ...prev, [l.po_line_id]: next }));
    // Seed the partial box with the full amount so the office manager edits a
    // number down rather than typing one from scratch.
    if (next === "partial" && !(l.po_line_id in partialQtys)) {
      setPartialQtys((prev) => ({
        ...prev,
        [l.po_line_id]: fmtNumStr(l.ordered_qty),
      }));
    }
  }

  const splitReason =
    splitPreset === "אחר" ? splitFreeText.trim() : splitPreset.trim();

  /** What the supplier could NOT supply, in the backend's payload shape. */
  const unplacedLines = useMemo(() => {
    const out: { po_line_id: string; unplaced_qty: number }[] = [];
    for (const l of lines) {
      const ordered = Number(l.ordered_qty);
      const st = stateFor(l);
      if (st === "full") continue;
      if (st === "none") {
        out.push({ po_line_id: l.po_line_id, unplaced_qty: ordered });
        continue;
      }
      const supplied = suppliedQty(l);
      if (Number.isFinite(supplied) && supplied > 0 && supplied < ordered) {
        out.push({ po_line_id: l.po_line_id, unplaced_qty: ordered - supplied });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, lineStates, partialQtys]);

  const hasSplit = unplacedLines.length > 0;
  // Nothing left to place is a CANCELLATION, not a partial placement — the
  // backend refuses it (NOTHING_PLACED) and the right path is the existing
  // discard-with-reason. Caught here so the office manager is told, not 409'd.
  const nothingPlaced =
    lines.length > 0 && lines.every((l) => stateFor(l) === "none");
  const anyPartialInvalid = lines.some((l) => partialInvalid(l));

  /** Lines still being placed, for the itemised confirm (DR-019 P0). */
  const placedSummary = useMemo(
    () =>
      lines
        .filter((l) => stateFor(l) !== "none")
        .map(
          (l) =>
            `${lineName(l)} ${fmtNumStr(String(suppliedQty(l)))} ${l.uom}`,
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, lineStates, partialQtys],
  );
  const splitSummary = useMemo(
    () =>
      unplacedLines.map((u) => {
        const l = lines.find((x) => x.po_line_id === u.po_line_id);
        return `${l ? lineName(l) : "פריט"} ${fmtNumStr(String(u.unplaced_qty))} ${l?.uom ?? ""}`;
      }),
    [unplacedLines, lines],
  );

  const term = termCode === "custom" ? null : paymentTermByCode(termCode);
  const termLabel = termCode === "custom" ? customTerm.trim() : term?.label ?? "";

  // DR-018 INTER-003 (Tranche 124) — "בצע הזמנה" was clickable with missing
  // prices/terms; validation only fired post-click (handlePlace below stays
  // as a backstop for any state this misses).
  const canPlace =
    canAttemptPlacementToday &&
    lines.length > 0 &&
    !!termLabel &&
    !!confirmedDate &&
    lines.every((l) => Number(priceFor(l)) > 0) &&
    // Tranche 150: a split needs a reason and a sane partial quantity, and
    // "nothing placed at all" is a discard rather than a placement.
    !nothingPlaced &&
    !anyPartialInvalid &&
    (!hasSplit || !!splitReason);

  /** Why `בצע הזמנה` is blocked, for the disabled-button tooltip. */
  const blockedReason = needsSchedule
    ? "יש לתזמן את ההזמנה לפני ביצוע."
    : futureSchedule
      ? "ההזמנה מתוזמנת לעתיד. כדי לבצע מוקדם יש לשנות את המועד להיום."
      : !confirmedDate
        ? "יש להזין תאריך אספקה מאושר מהספק."
      : nothingPlaced
    ? "כל השורות מסומנות כ-לא הוזמן — זהו ביטול הזמנה, השתמשי ב״בטל הזמנה״."
    : anyPartialInvalid
      ? "יש להזין כמות חלקית גדולה מאפס וקטנה מהכמות שהוזמנה."
      : hasSplit && !splitReason
        ? "יש לבחור סיבה לביצוע החלקי."
        // The price/terms wording is the DR-018 INTER-003 contract — it names
        // both requirements at once, and a test pins it. Only the tranche-150
        // gates above get their own, more specific message.
        : "יש להזין מחיר לכל השורות ולבחור תנאי תשלום";

  const totalPreview = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const l of lines) {
      const p = Number(priceFor(l));
      const q = suppliedQty(l);
      if (Number.isFinite(p) && p > 0 && Number.isFinite(q)) {
        sum += p * q;
        any = true;
      }
    }
    return any ? sum : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, prices, lineStates, partialQtys]);

  async function handlePlace(): Promise<void> {
    setErrorMsg(null);
    if (needsSchedule) {
      setErrorMsg("יש לתזמן את ההזמנה לפני ביצוע מול הספק.");
      setScheduling(true);
      return;
    }
    if (futureSchedule) {
      setErrorMsg("ההזמנה מתוזמנת לעתיד. כדי לבצע אותה עכשיו יש לשנות את המועד להיום.");
      setScheduling(true);
      return;
    }
    if (!termLabel) {
      setErrorMsg("יש לבחור תנאי תשלום.");
      return;
    }
    if (!confirmedDate) {
      setErrorMsg("יש להזין תאריך אספקה מאושר מהספק לפני ביצוע ההזמנה.");
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
    // Tranche 150 backstops, mirroring the disabled-button gate above.
    if (nothingPlaced) {
      setErrorMsg(
        "כל השורות מסומנות כ-לא הוזמן. זהו ביטול הזמנה — השתמשי ב״בטל הזמנה״ עם סיבה.",
      );
      return;
    }
    if (anyPartialInvalid) {
      setErrorMsg(
        "כמות חלקית חייבת להיות גדולה מאפס וקטנה מהכמות שהוזמנה.",
      );
      return;
    }
    if (hasSplit && !splitReason) {
      setErrorMsg("יש לבחור סיבה לביצוע החלקי.");
      return;
    }
    // DR-018 INTER-005 (Tranche 124) — a blank confirmedDate was silently
    // omitted from the confirm dialog, reopening the no-ETA double-order
    // trap at the human step. Surface it explicitly instead.
    // DR-019 P0: the confirm must itemise exactly what is being placed and,
    // on a partial placement, exactly what splits off — the previous attempt
    // at this UI hid quantity overrides behind a generic sentence.
    const splitBlock = hasSplit
      ? `\n\nמבוצע כעת (${placedSummary.length}): ${placedSummary.join(" · ")}\nלא סופק — יעבור להזמנה חדשה (${splitSummary.length}): ${splitSummary.join(" · ")}\nסיבה: ${splitReason}\n\nהיתרה תיפתח כהזמנה נפרדת הממתינה לביצוע, ותוכלי להפנות אותה לספק אחר מתוך התור. עד שתבוצע היא לא נחשבת כסחורה בדרך.`
      : "";
    const ok = await confirm({
      title: hasSplit
        ? `לבצע חלקית את ההזמנה ${po.po_number}?`
        : `לבצע את ההזמנה ${po.po_number}?`,
      description: `ההזמנה תבוצע מול הספק עם תנאי תשלום "${termLabel}"${
        totalPreview != null ? ` · ${formatIls(totalPreview)}` : ""
      }${confirmedDate ? ` · צפי הגעה ${confirmedDate}` : ""}. לאחר הביצוע ההזמנה תהיה פתוחה ומוכנה לקבלת סחורה — לא ניתן לבטל הזמנה שבוצעה דרך המערכת, ושינויים בכמויות יחייבו תיאום מול הספק.${
        !confirmedDate
          ? " לא הוזן תאריך אספקה — ההזמנה תיפתח ללא צפי הגעה, ויש להוסיף אותו ידנית אחר כך."
          : ""
      }${splitBlock}`,
      confirmLabel: hasSplit ? "בצע חלקית" : "בצע הזמנה",
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
        expected_receive_date: confirmedDate,
        // Tranche 150: omitted entirely on a full placement.
        unplaced_lines: hasSplit ? unplacedLines : undefined,
        split_reason: hasSplit ? splitReason : undefined,
      },
      {
        // On success the queue refetch drops this PO (no longer
        // APPROVED_TO_ORDER), so the row unmounts. Collapse defensively and
        // hand the success up to the page for a durable confirmation banner.
        onSuccess: (result) => {
          setOpen(false);
          onPlaced?.(po, result?.split_po_id ?? null);
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
          setScheduling(false);
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
            <span
              className={
                po.due_state === "overdue" || po.risk_state !== "ok"
                  ? "font-semibold text-danger-fg"
                  : "font-medium text-fg"
              }
            >
              · {dueLabel(po)}
              {po.scheduled_order_date ? ` · ${po.scheduled_order_date}` : ""}
            </span>
            {po.latest_safe_order_date ? (
              <span>· מועד בטוח אחרון {po.latest_safe_order_date}</span>
            ) : null}
            {scheduleRiskLabel ? (
              <span className="font-semibold text-danger-fg">· {scheduleRiskLabel}</span>
            ) : null}
            {po.planned_receive_date ? (
              <span>· הגעה מתוכננת {po.planned_receive_date}</span>
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
          setScheduling((v) => !v);
          setScheduleError(null);
          setOpen(false);
          setCancelling(false);
        }}
        aria-expanded={scheduling}
        aria-label={`שנה מועד להזמנה ${po.po_number}`}
        title="שנה מועד"
        className="flex shrink-0 items-center gap-1.5 border-r border-border/60 px-3 text-fg-muted transition-colors hover:bg-accent-softer hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-testid={`placement-schedule-toggle-${po.po_id}`}
      >
        <span className="text-xs font-medium">שנה מועד</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setCancelling((v) => !v);
          setCancelError(null);
          setScheduling(false);
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

      {scheduling ? (
        <div
          className="space-y-3 border-t border-accent/30 bg-accent-softer/30 p-4"
          data-testid={`placement-schedule-panel-${po.po_id}`}
        >
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              className="btn btn-sm min-h-[44px]"
              onClick={() => {
                setScheduleDate(nextProcurementWorkdayIso(todayIso));
                setScheduleError(null);
              }}
            >
              יום עבודה הבא
            </button>
            <label className="flex flex-col gap-1 text-sm font-medium text-fg">
              תאריך ביצוע מתוכנן
              <input
                type="date"
                className="input w-44"
                min={todayIso}
                value={scheduleDate}
                onChange={(e) => {
                  setScheduleDate(e.target.value);
                  setScheduleError(null);
                }}
                data-testid={`placement-schedule-date-${po.po_id}`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-fg">
              הגעה מתוכננת פנימית
              <input
                type="date"
                className="input w-44"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                data-testid={`placement-planned-receive-date-${po.po_id}`}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm min-h-[44px]"
              onClick={() => {
                setScheduleDate(todayIso);
                setScheduleError(null);
              }}
            >
              העבר להיום
            </button>
            {po.latest_safe_order_date ? (
              <button
                type="button"
                className="btn btn-sm min-h-[44px]"
                onClick={() => {
                  setScheduleDate(po.latest_safe_order_date ?? todayIso);
                  setScheduleError(null);
                }}
              >
                המועד הבטוח
              </button>
            ) : null}
          </div>

          <p className="text-xs text-fg-muted">
            המועד הבטוח האחרון הוא מידע נעול מהשרת:{" "}
            <span className="font-semibold text-fg">
              {po.latest_safe_order_date ?? "לא ידוע"}
            </span>
            . הזמנה עתידית לא תבוצע עד שמעבירים אותה להיום.
          </p>

          {scheduleDateAfterSafe ? (
            <div className="space-y-2">
            <label className="block text-sm font-medium text-danger-fg">
              סיבת סיכון
              <select
                className="input mt-1 w-full"
                value={scheduleRiskReason}
                onChange={(e) => {
                  setScheduleRiskReason(e.target.value as ScheduleRiskReason);
                  setScheduleError(null);
                }}
                data-testid={`placement-schedule-risk-reason-${po.po_id}`}
              >
                {SCHEDULE_RISK_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-danger-fg">
              סיבת חריגה מתאריך בטוח
              <textarea
                className="input mt-1 min-h-20 w-full"
                value={scheduleNote}
                onChange={(e) => {
                  setScheduleNote(e.target.value);
                  setScheduleError(null);
                }}
                placeholder="למשל: תיאום מול ספק, מגבלת אחסון, או החלטת מנהל."
                data-testid={`placement-schedule-risk-note-${po.po_id}`}
              />
            </label>
            </div>
          ) : null}

          {scheduleError ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
              data-testid={`placement-schedule-error-${po.po_id}`}
            >
              {scheduleError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setScheduling(false)}
              disabled={scheduleMut.isPending}
            >
              חזרה
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSchedule}
              disabled={scheduleMut.isPending || !scheduleDate}
              data-testid={`placement-schedule-submit-${po.po_id}`}
            >
              {scheduleMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              שמור מועד
            </button>
          </div>
        </div>
      ) : null}

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

                    {/* Tranche 150 — what the supplier actually supplied.
                        Defaults to "במלואו", so the common case adds no work. */}
                    <div
                      className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto"
                      role="group"
                      aria-label={`מה סופק עבור ${lineName(l)}`}
                    >
                      {(
                        [
                          ["full", "במלואו"],
                          ["partial", "חלקית"],
                          ["none", "לא הוזמן"],
                        ] as const
                      ).map(([value, label]) => {
                        const active = stateFor(l) === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setLineState(l, value)}
                            aria-pressed={active}
                            disabled={placeMut.isPending}
                            data-testid={`placement-supply-${value}-${l.po_line_id}`}
                            className={
                              active
                                ? value === "full"
                                  ? "btn btn-xs border-success/50 bg-success-softer text-success-fg"
                                  : value === "partial"
                                    ? "btn btn-xs border-warning/50 bg-warning-softer text-warning-fg"
                                    : "btn btn-xs border-danger/50 bg-danger-softer text-danger-fg"
                                : "btn btn-ghost btn-xs text-fg-muted"
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                      {stateFor(l) === "partial" ? (
                        <label className="flex items-center gap-1.5">
                          <span className="text-xs text-fg-muted">סופק</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            className="input w-24 text-left tabular-nums"
                            value={partialQtys[l.po_line_id] ?? ""}
                            onChange={(e) =>
                              setPartialQtys((prev) => ({
                                ...prev,
                                [l.po_line_id]: e.target.value,
                              }))
                            }
                            disabled={placeMut.isPending}
                            data-testid={`placement-supplied-${l.po_line_id}`}
                            aria-label={`כמות שסופקה עבור ${lineName(l)}`}
                            aria-invalid={partialInvalid(l) || undefined}
                          />
                          <span className="text-xs text-fg-muted">{l.uom}</span>
                        </label>
                      ) : null}
                    </div>
                    {partialInvalid(l) ? (
                      <p
                        className="w-full text-xs font-medium text-danger-fg"
                        role="alert"
                        data-testid={`placement-supplied-error-${l.po_line_id}`}
                      >
                        הכמות שסופקה חייבת להיות גדולה מאפס וקטנה מ-
                        {fmtNumStr(l.ordered_qty)} {l.uom}. אם סופק הכול — בחרי
                        ״במלואו״; אם כלום — ״לא הוזמן״.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {/* Tranche 150 — one reason for the whole split (a split is one
                  supplier conversation, not a per-component fact). */}
              {hasSplit ? (
                <div
                  className="rounded-md border border-warning/40 bg-warning-softer/40 p-3"
                  data-testid="placement-split-panel"
                >
                  <div className="mb-1.5 flex items-start gap-1.5">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <p className="text-xs text-warning-fg">
                      {splitSummary.length === 1
                        ? "פריט אחד לא סופק ויעבור להזמנה חדשה: "
                        : `${splitSummary.length} פריטים לא סופקו ויעברו להזמנה חדשה: `}
                      <span className="font-medium">
                        {splitSummary.join(" · ")}
                      </span>
                    </p>
                  </div>
                  <label
                    htmlFor={`split-reason-${po.po_id}`}
                    className="mb-1 block text-xs font-medium text-fg"
                  >
                    סיבה לביצוע החלקי (חובה)
                  </label>
                  <select
                    id={`split-reason-${po.po_id}`}
                    className="input h-10 w-full"
                    value={splitPreset}
                    onChange={(e) => setSplitPreset(e.target.value)}
                    disabled={placeMut.isPending}
                    data-testid="placement-split-reason"
                  >
                    <option value="">— בחרי סיבה —</option>
                    {SPLIT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    <option value="אחר">אחר (פירוט חופשי)</option>
                  </select>
                  {splitPreset === "אחר" ? (
                    <input
                      type="text"
                      className="input mt-1.5 h-10 w-full"
                      value={splitFreeText}
                      onChange={(e) => setSplitFreeText(e.target.value)}
                      placeholder="פירוט הסיבה"
                      disabled={placeMut.isPending}
                      data-testid="placement-split-reason-text"
                      aria-label="פירוט הסיבה לביצוע החלקי"
                    />
                  ) : null}
                </div>
              ) : null}

              {/* All lines marked not-supplied is a discard, not a placement. */}
              {nothingPlaced ? (
                <p
                  className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-xs text-danger-fg"
                  role="alert"
                  data-testid="placement-nothing-placed"
                >
                  כל השורות מסומנות כ״לא הוזמן״ — זהו ביטול הזמנה ולא ביצוע
                  חלקי. השתמשי ב״בטל הזמנה״ עם סיבה.
                </p>
              ) : null}

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
                  required
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
                  title={!canPlace ? blockedReason : undefined}
                  className="btn btn-primary"
                  data-testid={`placement-submit-${po.po_id}`}
                >
                  {placeMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <PackageCheck className="h-4 w-4" aria-hidden />
                  )}
                  {hasSplit ? "בצע חלקית" : "בצע הזמנה"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

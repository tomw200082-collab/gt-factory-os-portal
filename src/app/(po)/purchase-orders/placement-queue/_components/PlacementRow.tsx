"use client";

// ---------------------------------------------------------------------------
// PlacementRow — tranche 086 Part A. One APPROVED_TO_ORDER purchase order in
// the office-manager queue. Collapsed: supplier · PO# · total · expected date.
// Expanded: the PO's open lines with an editable unit price each, a payment-
// terms picker, and the terminal "בצע הזמנה" action (place → OPEN).
//
// Hebrew + RTL operator surface (authorized in CLAUDE.md for this route).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  XCircle,
  Ban,
  Calendar,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  PhoneCall,
} from "lucide-react";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { formatIls } from "@/lib/utils/format-money";
import { formatIsraeliDate } from "@/lib/utils/format-date";
import { fmtNumStr, uomLabelHe } from "@/lib/utils/format-quantity";
import { PAYMENT_TERMS, paymentTermByCode } from "@/lib/payment-terms";
import {
  PLACEMENT_CANCEL_REASONS,
  CANCEL_REASON_OTHER,
} from "@/lib/purchase/cancel-reasons";
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
// Tranche 156 (COPY-110): the list moved to src/lib/purchase/cancel-reasons.ts
// so this surface and the planner's FocusCard stop inventing their own wording
// for the same reasons. See that file for why they are two subsets, not one list.
const CANCEL_REASONS = PLACEMENT_CANCEL_REASONS;

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

// ux-release-gate 2026-07-30 COPY-109: internal identifiers must never stand in
// for an item name — they used to leak into the placement confirm dialog
// whenever both human names were null (carried from DR-018 COPY-008).
function lineName(l: QueuePoLine): string {
  return l.component_name ?? l.item_name ?? "פריט";
}

/** Quantity + unit, in Hebrew (COPY-108: "KG" no longer leaks into the copy). */
function qtyLabel(qty: string | number, uom: string | null | undefined): string {
  const unit = uomLabelHe(uom);
  return unit ? `${fmtNumStr(qty)} ${unit}` : fmtNumStr(qty);
}

/**
 * How urgent this order is, lowest = most urgent. One ordering used by three
 * things that must agree: the row's own status chip, the supplier group's
 * headline state, and the order the groups appear in (tranche 154 decision 1).
 */
export function poUrgencyRank(po: QueuePo): number {
  if (po.due_state === "overdue" || po.risk_state === "safe_date_passed") return 0;
  if (po.risk_state === "after_safe_date") return 1;
  if (po.due_state === "needs_schedule" || po.risk_state === "needs_schedule") return 2;
  if (po.due_state === "today") return 3;
  if (po.due_state === "next_7_days") return 4;
  return 5;
}

interface StatusPresentation {
  label: string;
  /** Tone classes over the base `.chip`. */
  tone: string;
  Icon: typeof AlertTriangle;
  /** The inline-start rail on the row — urgency readable before any text. */
  rail: string;
}

// ux-release-gate 2026-07-30 VIS-104: urgency used to be the third or fourth
// token in a six-part dot-separated string. It is now the first thing in the
// row, as a chip — colour plus an icon plus a word, never colour alone.
function statusPresentation(po: QueuePo): StatusPresentation {
  switch (poUrgencyRank(po)) {
    case 0:
      return {
        label: "באיחור",
        tone: "chip-danger",
        Icon: AlertTriangle,
        rail: "border-s-danger/70",
      };
    case 1:
      return {
        label: "אחרי המועד האחרון",
        tone: "chip-danger",
        Icon: CalendarX,
        rail: "border-s-danger/70",
      };
    case 2:
      return {
        label: "חסר תאריך ביצוע",
        tone: "chip-warning",
        Icon: CalendarClock,
        rail: "border-s-warning/70",
      };
    case 3:
      return {
        label: "לביצוע היום",
        tone: "chip-accent",
        Icon: PhoneCall,
        rail: "border-s-accent/70",
      };
    case 4:
      return {
        label: "בשבוע הקרוב",
        tone: "",
        Icon: Calendar,
        rail: "border-s-border",
      };
    default:
      return {
        label: "בהמשך",
        tone: "",
        Icon: Calendar,
        rail: "border-s-border",
      };
  }
}

/**
 * The chosen date, echoed in Israeli DD/MM/YYYY next to a native date input.
 *
 * ux-release-gate 2026-07-30 VIS-102 proposed `lang="he"` on the RTL root to
 * make `<input type="date">` render DD/MM/YYYY. It does not: Chromium formats
 * date inputs from the BROWSER's locale and ignores the document language, so
 * on an en-US browser the widget still shows 08/09/2026 for the 9th of August
 * — the exact ambiguity the finding was about. The `lang` attribute is correct
 * and stays, but the guarantee has to come from us. This echo is unambiguous
 * whatever the widget does. `aria-hidden` because the input already announces
 * its own value.
 */
function DateEcho({ value }: { value: string }): JSX.Element | null {
  if (!value) return null;
  return (
    <span
      className="font-mono text-xs tabular-nums text-fg-muted"
      aria-hidden
      data-testid="date-echo"
    >
      {formatIsraeliDate(value)}
    </span>
  );
}

/**
 * The order's state, as one readable badge. Exported because the supplier
 * group header shows its most urgent member's state — that is the reason the
 * call is ranked where it is.
 *
 * `.chip` is authored for English (uppercase + tracking); Hebrew takes neither,
 * so the tone classes are composed with `normal-case tracking-normal` rather
 * than by touching the frozen stylesheet.
 */
export function StatusChip({ po }: { po: QueuePo }): JSX.Element {
  const { label, tone, Icon } = statusPresentation(po);
  return (
    <span
      className={`chip ${tone} shrink-0 gap-1 whitespace-nowrap normal-case tracking-normal`}
      data-testid={`placement-status-chip-${po.po_id}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
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
    cancelReason === CANCEL_REASON_OTHER ? cancelDetail.trim() : cancelReason;

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
          // INTER-102: acknowledge the save, visibly and for screen readers.
          setJustScheduled(true);
          if (scheduledTimer.current) clearTimeout(scheduledTimer.current);
          scheduledTimer.current = setTimeout(() => setJustScheduled(false), 6000);
          // INTER-106: scheduling was a dead end — the panel closed and nothing
          // pointed at the next step. Advance straight into the pricing panel,
          // which is what the operator opened the row to reach.
          setOpen(true);
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
  // ux-release-gate 2026-07-30 VIS-109: this used to open on mount for every
  // unscheduled / at-risk order. With two such orders in a queue, the two open
  // panels pushed the remaining rows below the fold on a phone and the queue
  // could not be scanned at all. The row now advertises its state in the
  // collapsed header instead, and the operator opens the panel when she means to.
  const [scheduling, setScheduling] = useState(false);
  // INTER-102: saving a date used to close the panel with no acknowledgement —
  // indistinguishable from pressing "חזרה" and discarding the edit.
  const [justScheduled, setJustScheduled] = useState(false);
  const scheduledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (scheduledTimer.current) clearTimeout(scheduledTimer.current);
    },
    [],
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
  const supplierName = po.supplier_name ?? "הספק";
  const status = statusPresentation(po);
  const panelId = `placement-panel-${po.po_id}`;
  const needsSchedule = po.due_state === "needs_schedule" || !po.scheduled_order_date;
  const futureSchedule = !!po.scheduled_order_date && po.scheduled_order_date > todayIso;
  const scheduleDateAfterSafe =
    !!scheduleDate && !!po.latest_safe_order_date && scheduleDate > po.latest_safe_order_date;
  /** Why "שמור מועד" is blocked — shown as text, not only as a title. */
  const scheduleBlockedReason = !scheduleDate
    ? "יש לבחור תאריך ביצוע."
    : scheduleDate < todayIso
      ? "לא ניתן לתזמן לתאריך שכבר עבר."
      : scheduleDateAfterSafe && !scheduleNote.trim()
        ? "יש לרשום הסבר קצר לביצוע אחרי המועד האחרון."
        : null;
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
  /**
   * Tranche 156 (Tom, 2026-07-30): "there must be an option to cancel, and to
   * enter an order of more than what was set — up to 15% more than what the
   * procurement page set."
   *
   * So the middle state is no longer "less than ordered" — it is "whatever the
   * supplier actually confirmed", anywhere in (0, ordered × 1.15]. One input,
   * one number, no new mode to learn: below the ordered amount the remainder
   * splits onto a sibling PO exactly as before; above it, the line's quantity
   * is raised via the existing line_qty_overrides contract (0261). Past +15%
   * the money and stock impact stops being a placement decision, so it is
   * refused and pointed at the planner rather than silently accepted.
   */
  const OVER_SUPPLY_LIMIT = 1.15;

  function maxSuppliedQty(l: QueuePoLine): number {
    return Number(l.ordered_qty) * OVER_SUPPLY_LIMIT;
  }

  function partialInvalid(l: QueuePoLine): boolean {
    if (stateFor(l) !== "partial") return false;
    const q = suppliedQty(l);
    // Float tolerance: 15% of a 3-decimal quantity is not always exact.
    return !Number.isFinite(q) || q <= 0 || q > maxSuppliedQty(l) + 1e-6;
  }

  function setLineState(l: QueuePoLine, next: LineState): void {
    setLineStates((prev) => ({ ...prev, [l.po_line_id]: next }));
    // Seed the box with the full amount so the office manager edits a number
    // up or down rather than typing one from scratch.
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

  /** Lines the supplier over-delivered, as the backend's qty-override shape. */
  const qtyOverrides = useMemo(() => {
    const out: { po_line_id: string; ordered_qty: number }[] = [];
    for (const l of lines) {
      if (stateFor(l) !== "partial") continue;
      const supplied = suppliedQty(l);
      const ordered = Number(l.ordered_qty);
      if (
        Number.isFinite(supplied) &&
        supplied > ordered &&
        supplied <= maxSuppliedQty(l) + 1e-6
      ) {
        out.push({ po_line_id: l.po_line_id, ordered_qty: supplied });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, lineStates, partialQtys]);

  const hasOverSupply = qtyOverrides.length > 0;
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
        .map((l) => `${lineName(l)} ${qtyLabel(suppliedQty(l), l.uom)}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, lineStates, partialQtys],
  );
  const splitSummary = useMemo(
    () =>
      unplacedLines.map((u) => {
        const l = lines.find((x) => x.po_line_id === u.po_line_id);
        return `${l ? lineName(l) : "פריט"} ${qtyLabel(u.unplaced_qty, l?.uom)}`;
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
    ? "כל השורות מסומנות כ״לא יסופק״ — זהו ביטול הזמנה, השתמשי ב״בטל עם סיבה״."
    : anyPartialInvalid
      ? "הכמות שהספק אישר חייבת להיות גדולה מאפס, ולא יותר מ-15% מעל הכמות שאושרה בדף הרכש."
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
        "כל השורות מסומנות כ״לא יסופק״. זהו ביטול הזמנה — השתמשי ב״בטל עם סיבה״.",
      );
      return;
    }
    if (anyPartialInvalid) {
      setErrorMsg(
        "הכמות שהספק אישר חייבת להיות גדולה מאפס, ולא יותר מ-15% מעל הכמות שאושרה בדף הרכש. אם הספק שינה יותר מזה — פנו למנהל התכנון.",
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
    // Tranche 156: DR-019's rule applies to over-supply exactly as it does to a
    // split — a confirm dialog that hides a quantity change is the bug that
    // sank PR #164. Name each raised line and by how much.
    const overBlock = hasOverSupply
      ? `\n\nמעל הכמות שאושרה (${qtyOverrides.length}): ${qtyOverrides
          .map((o) => {
            const l = lines.find((x) => x.po_line_id === o.po_line_id);
            const ordered = Number(l?.ordered_qty ?? 0);
            const pct = ordered > 0 ? Math.round(((o.ordered_qty - ordered) / ordered) * 100) : 0;
            return `${l ? lineName(l) : "פריט"} ${qtyLabel(o.ordered_qty, l?.uom)} (+${pct}% מול ${qtyLabel(ordered, l?.uom)})`;
          })
          .join(" · ")}\nההזמנה תעודכן לכמות שהספק אישר, והעלות תגדל בהתאם.`
      : "";
    const ok = await confirm({
      // ux-release-gate 2026-07-30 INTER-103: a terminal money action must name
      // the supplier it commits to, not only the PO number — the operator is
      // working several grouped orders in one sitting.
      title: hasSplit
        ? `לבצע חלקית את ההזמנה ${po.po_number} מול ${supplierName}?`
        : `לבצע את ההזמנה ${po.po_number} מול ${supplierName}?`,
      // COPY-111 (prior COPY-205): the old text claimed "לא ניתן לבטל הזמנה
      // שבוצעה דרך המערכת". That is false — the backend cancels OPEN orders —
      // and a safe-direction lie is still a lie: it made operators hesitate to
      // place orders they were unsure about. State the real cost instead.
      description: `ההזמנה תבוצע מול ${supplierName} בתנאי תשלום "${termLabel}"${
        totalPreview != null ? ` · ${formatIls(totalPreview)}` : ""
      }${
        confirmedDate ? ` · צפי הגעה ${formatIsraeliDate(confirmedDate)}` : ""
      }. לאחר הביצוע ההזמנה תהיה פתוחה וממתינה לקבלת סחורה. שינוי כמויות או ביטול בשלב הזה אפשריים, אך מחייבים תיאום מול הספק ומול מנהל התכנון.${
        !confirmedDate
          ? " לא הוזן תאריך אספקה — ההזמנה תיפתח ללא צפי הגעה, ויש להוסיף אותו ידנית אחר כך."
          : ""
      }${overBlock}${splitBlock}`,
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
        // Tranche 156: the supplier sent more than approved (≤ +15%).
        line_qty_overrides: hasOverSupply ? qtyOverrides : undefined,
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
    <li
      // The rail carries the row's urgency at the RTL start edge, so a queue is
      // scannable by colour band before a single word is read. It is never the
      // only signal — the same state is a chip with an icon and a word below.
      className={`card overflow-hidden border-s-[3px] ${status.rail}`}
      data-testid={`placement-row-${po.po_id}`}
    >
      {dialog}
      {/* Header — expand (tap) + reschedule + discard. Sibling buttons, never
          nested, so all three stay keyboard-reachable. */}
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
        // A11Y-109: name the region this disclosure controls.
        aria-controls={panelId}
        disabled={placeMut.isPending}
        className="flex min-h-[56px] flex-1 items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-bg-subtle/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none"
        data-testid={`placement-row-toggle-${po.po_id}`}
      >
        <div className="min-w-0 flex-1">
          {/* VIS-101 (P0) — the supplier name is NOT repeated here. It is the
              group heading directly above this row; printing it twice at the
              same weight was what made the page unreadable.
              VIS-104 — three zones: state, then identity, then dates. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusChip po={po} />
            <span className="font-mono text-sm font-semibold tabular-nums text-fg-strong">
              {po.po_number}
            </span>
            <span className="font-mono text-sm tabular-nums text-fg">
              {formatIls(Number(po.total_net))}
            </span>
            {justScheduled ? (
              <span
                className="chip chip-success gap-1 normal-case tracking-normal"
                data-testid={`placement-schedule-saved-${po.po_id}`}
              >
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                המועד נשמר
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
            {po.scheduled_order_date ? (
              <span>
                להזמין עד{" "}
                <span className="font-mono tabular-nums">
                  {formatIsraeliDate(po.scheduled_order_date)}
                </span>
              </span>
            ) : null}
            {po.latest_safe_order_date ? (
              <span>
                · מועד אחרון{" "}
                <span className="font-mono tabular-nums">
                  {formatIsraeliDate(po.latest_safe_order_date)}
                </span>
              </span>
            ) : null}
            {po.planned_receive_date ? (
              <span>
                · הגעה מתוכננת{" "}
                <span className="font-mono tabular-nums">
                  {formatIsraeliDate(po.planned_receive_date)}
                </span>
              </span>
            ) : null}
          </div>
          {/* FLOW-112 / USBL-102 — the three header buttons used to be equal
              peers on every row, so a row that needs scheduling looked exactly
              like one ready to place, and the prerequisite was only discovered
              after entering prices. Say the next step on the row itself. */}
          {!open && !scheduling && !cancelling ? (
            <p
              className="mt-1 text-xs font-medium text-fg"
              data-testid={`placement-row-hint-${po.po_id}`}
            >
              {needsSchedule
                ? "← קודם קבעי תאריך ביצוע (״שנה מועד״)"
                : futureSchedule
                  ? "← מתוזמנת לתאריך עתידי. להזמין מוקדם — ״שנה מועד״"
                  : "← פתחי להזנת מחיר ותנאי תשלום"}
            </p>
          ) : null}
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
        // INTER-105: locked while a placement is in flight, matching the
        // per-line supply controls — a mid-mutation panel switch was possible.
        disabled={placeMut.isPending}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 border-r border-border/60 px-3 text-fg-muted transition-colors hover:bg-accent-softer hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45"
        data-testid={`placement-schedule-toggle-${po.po_id}`}
      >
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden text-xs font-medium sm:inline">שנה מועד</span>
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
        disabled={placeMut.isPending}
        // USBL-101: this opens the destructive path and used to look exactly
        // like its two neutral neighbours. The icon carries the danger signal
        // so the trigger is distinguishable at a glance, while the label stays
        // muted — differentiated, but still secondary to placing the order.
        // A11Y-108: 44px wide even in the icon-only mobile state.
        className="group/cancel flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 border-r border-border/60 px-3 text-fg-muted transition-colors hover:bg-danger-softer hover:text-danger-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:pointer-events-none disabled:opacity-45"
        data-testid={`placement-cancel-toggle-${po.po_id}`}
      >
        <XCircle
          className="h-4 w-4 shrink-0 text-danger-fg/75 transition-colors group-hover/cancel:text-danger-fg"
          aria-hidden
        />
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
          {/* VIS-105 — this was one flex-wrap row that interleaved quick-fill
              buttons between two unrelated date fields; in RTL the reading
              order came out as button → field → field → button, with nothing
              tying a button to the field it fills. Two fieldsets, each with
              its own shortcuts. */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">
              מתי מזמינים מהספק{" "}
              <span className="text-danger-fg" aria-hidden>
                *
              </span>
              <span className="sr-only">(שדה חובה)</span>
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="input w-44"
                min={todayIso}
                required
                aria-label="תאריך ביצוע ההזמנה"
                value={scheduleDate}
                onChange={(e) => {
                  setScheduleDate(e.target.value);
                  setScheduleError(null);
                }}
                data-testid={`placement-schedule-date-${po.po_id}`}
              />
              <DateEcho value={scheduleDate} />
              <button
                type="button"
                className="btn btn-sm min-h-[44px]"
                onClick={() => {
                  setScheduleDate(todayIso);
                  setScheduleError(null);
                }}
              >
                היום
              </button>
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
              {po.latest_safe_order_date ? (
                <button
                  type="button"
                  className="btn btn-sm min-h-[44px]"
                  onClick={() => {
                    setScheduleDate(po.latest_safe_order_date ?? todayIso);
                    setScheduleError(null);
                  }}
                >
                  המועד האחרון
                </button>
              ) : null}
            </div>
            {/* COPY-102 — was "המועד הבטוח האחרון הוא מידע נעול מהשרת". */}
            <p className="text-xs text-fg-muted">
              המועד האחרון להזמנה לפי התכנון:{" "}
              <span className="font-mono font-semibold tabular-nums text-fg">
                {po.latest_safe_order_date
                  ? formatIsraeliDate(po.latest_safe_order_date)
                  : "לא ידוע"}
              </span>
              . הזמנה שמתוזמנת לתאריך עתידי לא תבוצע עד שמעבירים אותה להיום.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            {/* COPY-104 — was "הגעה מתוכננת פנימית"; "פנימית" meant nothing to
                the operator, and this field is the planner's estimate, not the
                supplier's commitment (that one is entered at placement). */}
            <legend className="text-sm font-medium text-fg">
              הגעה צפויה לפי התכנון
              <span className="mr-1 text-xs font-normal text-fg-muted">
                (לא חובה — הספק מאשר תאריך בעת ביצוע ההזמנה)
              </span>
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="input w-44"
                aria-label="הגעה צפויה לפי התכנון"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                data-testid={`placement-planned-receive-date-${po.po_id}`}
              />
              <DateEcho value={plannedDate} />
            </div>
          </fieldset>

          {scheduleDateAfterSafe ? (
            <div className="space-y-2 rounded-md border border-warning/40 bg-warning-softer/50 p-3">
              <p className="flex items-start gap-1.5 text-xs font-medium text-warning-fg">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                התאריך שבחרת מאוחר מהמועד האחרון לפי התכנון. אפשר להמשיך, אבל צריך
                לרשום למה.
              </p>
              {/* COPY-106 — was "סיבת סיכון". */}
              <label
                htmlFor={`placement-schedule-risk-reason-${po.po_id}`}
                className="block text-sm font-medium text-fg"
              >
                מדוע מזמינים אחרי המועד האחרון?
                <select
                  id={`placement-schedule-risk-reason-${po.po_id}`}
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
              {/* COPY-107 — was "סיבת חריגה מתאריך בטוח". */}
              <label
                htmlFor={`placement-schedule-risk-note-${po.po_id}`}
                className="block text-sm font-medium text-fg"
              >
                הסבר קצר{" "}
                <span className="text-danger-fg" aria-hidden>
                  *
                </span>
                <span className="sr-only">(שדה חובה)</span>
                <textarea
                  id={`placement-schedule-risk-note-${po.po_id}`}
                  className="input mt-1 min-h-20 w-full"
                  required
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

          {/* A11Y-105 — primary first in the DOM. Under `dir="rtl"` the first
              child renders at the right (start) edge, so visual order and tab
              order now agree, and Tab no longer lands on "חזרה" first. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm min-h-[44px]"
              onClick={handleSchedule}
              // INTER-104 — the late-reason requirement used to fire only after
              // the click, unlike every other gate on this surface.
              disabled={scheduleMut.isPending || !!scheduleBlockedReason}
              title={scheduleBlockedReason ?? undefined}
              data-testid={`placement-schedule-submit-${po.po_id}`}
            >
              {scheduleMut.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  <span className="sr-only">שומר…</span>
                </>
              ) : null}
              שמור מועד
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm min-h-[44px]"
              onClick={() => setScheduling(false)}
              disabled={scheduleMut.isPending}
            >
              חזרה
            </button>
          </div>
          {scheduleBlockedReason ? (
            // A11Y-101 pattern: a disabled button cannot hold focus, so the
            // reason must be readable without hovering it.
            <p className="text-xs text-fg-muted" aria-live="polite">
              {scheduleBlockedReason}
            </p>
          ) : null}
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

          {/* A11Y-105 asked for primary-first ordering in both panel footers.
              Applied to the schedule panel; deliberately NOT applied here. The
              primary action in this panel is destructive, and having Tab and
              the RTL start edge both land on "חזרה" first is the guard, not an
              oversight. Interaction + a11y agreed on the split. */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCancelling(false);
                setCancelError(null);
              }}
              disabled={cancelMut.isPending}
              className="btn btn-ghost btn-sm min-h-[44px]"
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
        <div id={panelId} className="border-t border-border/60 p-4">
          {linesQuery.isLoading ? (
            // A11Y-104: aria-busy on a bare div announces nothing. Give the
            // region a status role and a sentence to announce.
            <div
              className="space-y-2"
              role="status"
              aria-busy="true"
              data-testid={`placement-lines-loading-${po.po_id}`}
            >
              <span className="sr-only">טוען את שורות ההזמנה…</span>
              <div className="h-10 w-full animate-pulse rounded bg-bg-subtle motion-reduce:animate-none" />
              <div className="h-10 w-2/3 animate-pulse rounded bg-bg-subtle motion-reduce:animate-none" />
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

              {/* INTER-101 — the paste-ready order message used to sit BELOW
                  the price fields. That inverts a real supplier call: this is
                  what she sends to open the conversation; the prices below are
                  what she writes down from the answer. Opener first. */}
              {po.order_document_text ? (
                <div className="rounded-md border border-border/60 bg-bg-subtle/40 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fg">
                      1 · שלחי לספק את ההזמנה
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
                      <span aria-live="polite">
                        {copied ? "הועתק" : "העתק הודעה"}
                      </span>
                      {copied ? <span aria-hidden>✓</span> : null}
                    </button>
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-fg">
                    {po.order_document_text}
                  </pre>
                </div>
              ) : null}

              {/* Lines + per-line price — what the supplier answered. */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-fg">
                  {po.order_document_text ? "2 · " : ""}רשמי מה הספק אישר
                </p>
                <ul className="space-y-2">
                {lines.map((l) => {
                  const errorId = `placement-supplied-error-${l.po_line_id}`;
                  const invalid = partialInvalid(l);
                  return (
                  <li
                    key={l.po_line_id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-bg-subtle/20 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg-strong">
                        {lineName(l)}
                      </div>
                      <div className="text-xs text-fg-muted">
                        הוזמן:{" "}
                        <span className="font-mono tabular-nums">
                          {qtyLabel(l.ordered_qty, l.uom)}
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5">
                      {/* USBL-103 — `required` drove no visible marker, so the
                          operator learned which fields were mandatory only by
                          the submit button staying disabled. */}
                      <span className="text-xs text-fg-muted">
                        מחיר ליח׳ ₪
                        <span className="text-danger-fg" aria-hidden>
                          {" *"}
                        </span>
                      </span>
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
                        aria-label={`מחיר ליחידה עבור ${lineName(l)} (שדה חובה)`}
                      />
                    </label>

                    {/* Tranche 150 — what the supplier actually supplied.
                        Defaults to "סופק במלואו", so the common case adds no work.
                        A11Y-102 — these were three `aria-pressed` buttons in a
                        `role="group"`, which a screen reader announces as three
                        independent toggles with no hint that choosing one clears
                        the others. Real radios in a fieldset: native semantics,
                        native arrow-key behaviour, no roving tabindex to maintain. */}
                    <fieldset className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                      <legend className="sr-only">{`מה סופק עבור ${lineName(l)}`}</legend>
                      {(
                        [
                          ["full", "סופק במלואו"],
                          ["partial", "כמות אחרת"],
                          // COPY-105 — was "לא הוזמן", which contradicted the
                          // question: the order WAS placed; this line is the one
                          // the supplier cannot supply.
                          ["none", "לא יסופק"],
                        ] as const
                      ).map(([value, label]) => {
                        const active = stateFor(l) === value;
                        return (
                          // The testid sits on the label, not the visually
                          // hidden input, so a click driver targets something
                          // that is actually on screen.
                          <label
                            key={value}
                            className="cursor-pointer"
                            data-testid={`placement-supply-${value}-${l.po_line_id}`}
                          >
                            <input
                              type="radio"
                              name={`placement-supply-${l.po_line_id}`}
                              value={value}
                              checked={active}
                              onChange={() => setLineState(l, value)}
                              disabled={placeMut.isPending}
                              className="peer sr-only"
                              data-testid={`placement-supply-input-${value}-${l.po_line_id}`}
                            />
                            <span
                              className={`${
                                active
                                  ? value === "full"
                                    ? "btn btn-xs border-success/50 bg-success-softer text-success-fg"
                                    : value === "partial"
                                      ? "btn btn-xs border-warning/50 bg-warning-softer text-warning-fg"
                                      : "btn btn-xs border-danger/50 bg-danger-softer text-danger-fg"
                                  : "btn btn-ghost btn-xs text-fg-muted"
                              } peer-focus-visible:ring-2 peer-focus-visible:ring-accent/55 peer-focus-visible:ring-offset-1 peer-disabled:opacity-45`}
                            >
                              {label}
                            </span>
                          </label>
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
                            max={fmtNumStr(maxSuppliedQty(l))}
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
                            aria-invalid={invalid || undefined}
                            // A11Y-103 — the error text existed but was never
                            // tied to the field, so tabbing back to a flagged
                            // input announced nothing.
                            aria-describedby={invalid ? errorId : undefined}
                          />
                          <span className="text-xs text-fg-muted">
                            {uomLabelHe(l.uom)}
                          </span>
                          {/* Tranche 156: the ceiling is stated where the number
                              is typed, so she never discovers it by being
                              refused after the fact. */}
                          <span className="text-2xs text-fg-muted">
                            עד {qtyLabel(maxSuppliedQty(l), l.uom)} (15% מעל
                            המאושר)
                          </span>
                        </label>
                      ) : null}
                    </fieldset>
                    {invalid ? (
                      <p
                        id={errorId}
                        className="w-full text-xs font-medium text-danger-fg"
                        role="alert"
                        data-testid={errorId}
                      >
                        הכמות חייבת להיות גדולה מאפס ולא יותר מ-
                        {qtyLabel(maxSuppliedQty(l), l.uom)} — 15% מעל הכמות
                        שאושרה בדף הרכש ({qtyLabel(l.ordered_qty, l.uom)}). אם
                        הספק שינה יותר מזה, פנו למנהל התכנון. אם סופק בדיוק
                        המאושר — בחרי ״סופק במלואו״; אם כלום — ״לא יסופק״.
                      </p>
                    ) : null}
                  </li>
                  );
                })}
                </ul>
              </div>

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
                  כל השורות מסומנות כ״לא יסופק״ — זהו ביטול הזמנה ולא ביצוע
                  חלקי. השתמשי ב״בטל עם סיבה״.
                </p>
              ) : null}

              {/* FLOW-003: supplier-confirmed arrival date */}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`placement-eta-${po.po_id}`}
                  className="text-sm font-medium text-fg"
                >
                  תאריך אספקה שהספק אישר
                  <span className="text-danger-fg" aria-hidden>
                    {" *"}
                  </span>
                  <span className="sr-only">(שדה חובה)</span>
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
                <DateEcho value={confirmedDate} />
                {/* FLOW-116 — this field is pre-filled from the planner's
                    estimate, so it is never blank and the "confirm it with the
                    supplier" step could be skipped without noticing. Name the
                    source of the value that is sitting there. */}
                {po.planned_receive_date &&
                confirmedDate === po.planned_receive_date ? (
                  <span className="text-xs text-fg-muted">
                    זהו התאריך המתוכנן — עדכני לפי מה שהספק אישר בשיחה.
                  </span>
                ) : null}
              </div>

              {/* Payment terms */}
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`placement-terms-${po.po_id}`}
                  className="text-sm font-medium text-fg"
                >
                  תנאי תשלום
                  <span className="text-danger-fg" aria-hidden>
                    {" *"}
                  </span>
                  <span className="sr-only">(שדה חובה)</span>
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

              {/* A11Y-101 — the blocking reason used to live only in a `title`
                  on a `disabled` button. A disabled button is removed from the
                  tab sequence, so neither a keyboard user nor a screen reader
                  could ever reach the one sentence explaining what was missing.
                  The button now stays focusable via `aria-disabled` (with a
                  click guard), and the reason is on-screen text. */}
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {!canPlace && !placeMut.isPending ? (
                  <p
                    id={`placement-blocked-${po.po_id}`}
                    className="flex-1 text-xs text-fg-muted"
                    data-testid={`placement-blocked-${po.po_id}`}
                  >
                    {blockedReason}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (!canPlace) return;
                    void handlePlace();
                  }}
                  aria-disabled={!canPlace || undefined}
                  disabled={placeMut.isPending}
                  aria-describedby={
                    !canPlace ? `placement-blocked-${po.po_id}` : undefined
                  }
                  title={!canPlace ? blockedReason : undefined}
                  className={`btn btn-primary min-h-[44px] ${
                    !canPlace ? "opacity-45" : ""
                  }`}
                  data-testid={`placement-submit-${po.po_id}`}
                >
                  {placeMut.isPending ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                      {/* A11Y-107 — the spinner is aria-hidden and the label
                          does not change, so pressing gave AT no confirmation. */}
                      <span className="sr-only">מבצע…</span>
                    </>
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

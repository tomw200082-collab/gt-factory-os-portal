// ---------------------------------------------------------------------------
// Payment-terms vocabulary — tranche 086 (cash-flow-ready foundation).
//
// A small constant (NOT a DB master table). Each term resolves to a due-date
// rule: `net_days` + `eom` (end-of-month basis). A future cash-flow / treasury
// view computes a supplier due date = (eom ? endOfMonth(basis) : basis) +
// net_days, where basis is the receipt/invoice date. We DO NOT compute that
// here — we only capture the structured values so the PO snapshot is
// cash-flow-ready (see purchase_orders.payment_terms{,_net_days,_eom}).
//
// Israeli reality:
//   - מזומן (cash) → net_days 0
//   - שוטף+N (EOM_N) → N days from END of the invoice month (eom = true)
//   - נטו N (NET_N) → N days from the invoice date (eom = false)
//
// A custom free-text term is allowed (label only; net_days/eom = null).
// ---------------------------------------------------------------------------

export interface PaymentTerm {
  /** Stable machine code. */
  code: string;
  /** Hebrew operator label (also stored as the PO `payment_terms` snapshot). */
  label: string;
  /** Days until due. */
  net_days: number;
  /** When true, count net_days from the END of the basis month (שוטף). */
  eom: boolean;
}

export const PAYMENT_TERMS: readonly PaymentTerm[] = [
  { code: "CASH", label: "מזומן", net_days: 0, eom: false },
  { code: "EOM_30", label: "שוטף+30", net_days: 30, eom: true },
  { code: "EOM_60", label: "שוטף+60", net_days: 60, eom: true },
  { code: "EOM_90", label: "שוטף+90", net_days: 90, eom: true },
  { code: "NET_14", label: "נטו 14", net_days: 14, eom: false },
  { code: "NET_30", label: "נטו 30", net_days: 30, eom: false },
  { code: "NET_45", label: "נטו 45", net_days: 45, eom: false },
  { code: "NET_60", label: "נטו 60", net_days: 60, eom: false },
] as const;

export function paymentTermByCode(code: string): PaymentTerm | undefined {
  return PAYMENT_TERMS.find((t) => t.code === code);
}

// Best-effort map a supplier's free-text payment_terms (e.g. "NET_30",
// "שוטף + 30", "שוטף+60", "cash", "מזומן") onto a vocabulary entry, so the
// placement form can default the term. Returns null when nothing matches —
// the office manager then picks from the list or types a custom term.
export function matchSupplierTerm(raw: string | null | undefined): PaymentTerm | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;
  // Cash / immediate.
  if (/(^|[^0-9])(cash|מזומן|immediate)([^0-9]|$)/.test(s) || s === "net_0" || s === "net 0") {
    return paymentTermByCode("CASH") ?? null;
  }
  // Pull the first number (the N in NET N / שוטף+N).
  const num = s.match(/\d+/);
  if (!num) return null;
  const n = Number(num[0]);
  // EOM family: "שוטף" or "eom" or "end of month".
  const isEom = /שוטף|eom|end.?of.?month/.test(s);
  const want = PAYMENT_TERMS.find((t) => t.net_days === n && t.eom === isEom);
  if (want) return want;
  // Fall back to the same net_days in the other family rather than nothing.
  return PAYMENT_TERMS.find((t) => t.net_days === n) ?? null;
}

// Date, formatting, and variance helpers shared by page.tsx and _components.
//
// Variance formula (W4 contract):
//   variance_qty  = output_qty − planned_qty   (no scrap — prod reporting v1)
//   variance_pct  = variance_qty / planned_qty * 100
//   variance_sign = on_target if |variance_qty| ≤ planned_qty × 2%

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Sunday-first per the operator week convention.
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - d.getDay());
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

export const DAY_NAMES = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function fmtDayHeader(d: Date): { dayName: string; dateLabel: string } {
  return {
    dayName: DAY_NAMES[d.getDay()],
    dateLabel: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
  };
}

export function fmtWeekRange(start: Date, end: Date): string {
  const s = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`;
  const sameMonth = start.getMonth() === end.getMonth();
  const e = sameMonth
    ? `${end.getDate()}, ${end.getFullYear()}`
    : `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  return `Week of ${s}–${e}`;
}

function fmtNumber(n: number): string {
  return Number.isInteger(n)
    ? n.toFixed(0)
    : n.toFixed(2).replace(/\.?0+$/, "");
}

export function fmtQty(s: string, uom: string | null): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  const formatted = fmtNumber(n);
  return uom ? `${formatted} ${uom}` : formatted;
}

const VARIANCE_ON_TARGET_THRESHOLD_PCT = 2.0;

export type VarianceSign = "on_target" | "over" | "under";

export function computeVarianceSign(
  varianceQtyStr: string,
  plannedQtyStr: string,
): VarianceSign {
  const variance = parseFloat(varianceQtyStr);
  const planned = parseFloat(plannedQtyStr);
  if (!Number.isFinite(variance) || !Number.isFinite(planned)) return "on_target";
  if (planned <= 0) return variance === 0 ? "on_target" : "over";
  const band = Math.abs(planned) * (VARIANCE_ON_TARGET_THRESHOLD_PCT / 100);
  if (variance > band) return "over";
  if (variance < -band) return "under";
  return "on_target";
}

export function fmtVarianceQty(varianceQtyStr: string): string {
  const n = parseFloat(varianceQtyStr);
  if (!Number.isFinite(n)) return varianceQtyStr;
  if (n === 0) return "0";
  const formatted = fmtNumber(Math.abs(n));
  return n > 0 ? `+${formatted}` : `−${formatted}`;
}

export function fmtVariancePct(variancePctStr: string | null): string {
  if (variancePctStr === null) return "—";
  const n = parseFloat(variancePctStr);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0.0%";
  const abs = Math.abs(n);
  return `${n > 0 ? "+" : "−"}${abs.toFixed(1)}%`;
}

export const VARIANCE_SIGN_LABEL: Record<VarianceSign, string> = {
  on_target: "On target",
  over: "Over",
  under: "Under",
};

// Deep entry point for the variance-display decision. Callers used to import
// computeVarianceSign + fmtVarianceQty + fmtVariancePct + VARIANCE_SIGN_LABEL
// and hand-assemble them (sign, then qty, then pct, then label, then tone) at
// every site that shows a variance. `describeVariance` hides that assembly —
// and the formula + on-target band — behind one call returning everything a
// display needs. The primitives above remain the internal building blocks;
// this just stops the caller from having to know how they fit together.
// (Tone/colour stays a UI concern: callers branch on `isOnTarget`.)
export interface VarianceDescriptor {
  sign: VarianceSign;
  /** sign === "on_target" — for success-vs-warning tone selection at the call site. */
  isOnTarget: boolean;
  /** "On target" | "Over" | "Under". */
  signLabel: string;
  /** Signed quantity, e.g. "+135", "−2", "0". */
  qtyText: string;
  /** Signed percentage, e.g. "+67.5%", "−4.0%", "—" when unknown. */
  pctText: string;
}

export function describeVariance(
  varianceQtyStr: string,
  variancePctStr: string | null,
  plannedQtyStr: string,
): VarianceDescriptor {
  const sign = computeVarianceSign(varianceQtyStr, plannedQtyStr);
  return {
    sign,
    isOnTarget: sign === "on_target",
    signLabel: VARIANCE_SIGN_LABEL[sign],
    qtyText: fmtVarianceQty(varianceQtyStr),
    pctText: fmtVariancePct(variancePctStr),
  };
}

export const VARIANCE_TOOLTIP =
  "Variance compares what was produced to what was planned. " +
  "Scrap is not counted as output. " +
  "Stock has already been updated from this production report.";

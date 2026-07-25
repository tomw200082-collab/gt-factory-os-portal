/**
 * Format a numeric quantity for display, based on UOM.
 * Hard rule: never more than 4 decimal places anywhere in the portal UI.
 * Trailing zeros are stripped: 0.500 → "0.5", 1.000 → "1".
 */
function stripTrailingZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Format a raw numeric string (or number) for display, rounded to the
 * portal's 4-decimal hard rule, trailing zeros stripped. Use for quantities
 * that come back from the API as 8-dp NUMERIC strings like
 * "440.00000000" → "440", "1.50000000" → "1.5", "0.12340000" → "0.1234",
 * "12.34567891" → "12.3457". Without the round-to-4dp step, an unrounded
 * 8-dp value renders at full precision and can overflow fixed-width qty
 * displays (e.g. PickRow's number button) — the box then clips it, which
 * reads to the operator as a cut-off number rather than a wrong one.
 * Safe for null/undefined (returns "") and non-numeric input (returned as-is).
 */
export function fmtNumStr(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return stripTrailingZeros(n.toFixed(4));
}

export function formatQty(value: number, uom: string): string {
  const u = uom.toUpperCase()
  if (['UNIT', 'PCS', 'BAG', 'CASE', 'BOX', 'BOTTLE', 'TIN'].includes(u)) {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : stripTrailingZeros(value.toFixed(3))
  }
  if (['L', 'ML', 'KG', 'G', 'MG', 'TON'].includes(u)) {
    return stripTrailingZeros(value.toFixed(3))
  }
  return stripTrailingZeros(value.toFixed(4))
}

export function formatPrice(value: number): string {
  return `₪${value.toFixed(2)}`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

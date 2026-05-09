/**
 * Format a numeric quantity for display, based on UOM.
 * Hard rule: never more than 4 decimal places anywhere in the portal UI.
 * Trailing zeros are stripped: 0.500 → "0.5", 1.000 → "1".
 */
function stripTrailingZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Strip trailing decimal zeros from a raw numeric string (or number).
 * Use for quantities that come back from the API as NUMERIC strings like
 * "440.00000000" → "440", "1.50000000" → "1.5", "0.12340000" → "0.1234".
 * Safe for null/undefined (returns "").
 */
export function fmtNumStr(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
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

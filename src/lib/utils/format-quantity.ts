/**
 * Format a numeric quantity for display, based on UOM.
 * Hard rule: never more than 4 decimal places anywhere in the portal UI.
 * Trailing zeros are stripped: 0.500 → "0.5", 1.000 → "1".
 */
function stripTrailingZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function formatQty(value: number, uom: string): string {
  const u = uom.toUpperCase()
  if (['UNIT', 'PCS', 'BAG', 'CASE', 'BOX', 'BOTTLE', 'TIN'].includes(u)) {
    return Math.round(value).toLocaleString()
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

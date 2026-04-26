/**
 * Format a numeric quantity for display, based on UOM.
 * Hard rule: never more than 4 decimal places anywhere in the portal UI.
 */
export function formatQty(value: number, uom: string): string {
  const u = uom.toUpperCase()
  if (['UNIT', 'PCS', 'BAG', 'CASE', 'BOX', 'BOTTLE', 'TIN'].includes(u)) {
    return Math.round(value).toLocaleString()
  }
  if (['L', 'ML', 'KG', 'G', 'MG', 'TON'].includes(u)) {
    return value.toFixed(3)
  }
  return value.toFixed(4)
}

export function formatPrice(value: number): string {
  return `₪${value.toFixed(2)}`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

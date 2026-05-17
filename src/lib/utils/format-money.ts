// Canonical money / percentage formatting for the portal.
//
// One ILS formatter, used everywhere a monetary value is shown, so the same
// number never renders two different ways across surfaces. Accepts the raw
// NUMERIC strings the API returns ("1234.5600") as well as plain numbers, and
// renders a NULL / non-finite value as an em dash.
//
//   formatIls("1234.56")  → "₪1,234.56"
//   formatIls(0)          → "₪0.00"
//   formatIls(null)       → "—"

function toFiniteNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const EM_DASH = "—";

// ILS amount, grouped thousands, exactly 2 decimals.
export function formatIls(value: string | number | null | undefined): string {
  const n = toFiniteNumber(value);
  if (n === null) return EM_DASH;
  return `₪${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Percentage, fixed decimal places (default 1).
export function formatPct(
  value: string | number | null | undefined,
  decimals = 1,
): string {
  const n = toFiniteNumber(value);
  if (n === null) return EM_DASH;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

// Whole-number quantity, grouped thousands, no decimals.
export function formatQtyInt(
  value: string | number | null | undefined,
): string {
  const n = toFiniteNumber(value);
  if (n === null) return EM_DASH;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

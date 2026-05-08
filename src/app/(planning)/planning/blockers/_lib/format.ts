// ---------------------------------------------------------------------------
// Small formatters for blocker rows.
//
// Consistent with sibling surfaces (Recommendation Drill-Down, Inventory Flow).
// English/LTR output. U+2014 em dash for null. tabular-nums-friendly.
// ---------------------------------------------------------------------------

const EM_DASH = "—";

/**
 * Format a date-only ISO string ("2026-04-30") or full ISO timestamp as a
 * short d/m display ("30/4").
 */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  try {
    // Date-only strings (YYYY-MM-DD) parse as UTC midnight; Israel is +02/+03.
    // For short DD/M display the timezone shift never crosses a day boundary
    // for dates emitted in the planning_horizon range (which are already
    // local-business dates). Use UTC accessors to avoid an off-by-one shift
    // for date-only values.
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const onlyDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const day = onlyDateMatch ? d.getUTCDate() : d.getDate();
    const month = (onlyDateMatch ? d.getUTCMonth() : d.getMonth()) + 1;
    return `${day}/${month}`;
  } catch {
    return iso;
  }
}

/**
 * Format an ISO timestamp as an English-relative ago string.
 * Examples: "just now", "7m ago", "3h ago", "2d ago".
 */
export function fmtRelativeAgo(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms)) return iso;
    const mins = Math.floor(ms / 60000);
    if (mins < 0) return "just now";
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

/**
 * Format a qty_8dp string into a readable number.
 * Trims trailing zeros, integer-formatted when whole.
 */
export function fmtQty(s: string | null | undefined): string {
  if (s == null || s === "") return EM_DASH;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  if (Number.isInteger(n)) return n.toString();
  // up to 2 decimal places, trimmed
  return n.toFixed(2).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// format.ts — pure number / date formatters for Inventory Flow.
//
// Discipline:
//   - Tabular numerics in display (caller adds `tabular-nums` Tailwind class).
//   - Em-dash for zero / null (visually quiet — "nothing here").
//   - Proper minus sign for negatives.
//   - Compact form for >= 10k.
//   - Locale-aware date helpers.
//
// Pure module — no React, no Tanstack, no DOM.
// ---------------------------------------------------------------------------

const EM_DASH = "—";
const MINUS = "−"; // U+2212 — typographic minus, not hyphen

/**
 * Quantity formatter for grid cells.
 *
 *   0     -> em-dash (visually quiet, signals "no qty")
 *   null  -> em-dash
 *  -3.5   -> "−3.5"  (proper minus)
 *   42    -> "42"
 *   1234  -> "1,234"
 *   12500 -> "12.5K"
 *   1.2M  -> "1.2M"
 */
export function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EM_DASH;
  if (n === 0) return EM_DASH;

  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : "";

  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    // 12500 -> "12.5K"
    return `${sign}${(abs / 1000).toFixed(1)}K`;
  }
  if (abs >= 1000) {
    // 1234 -> "1,234"
    return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  // < 1000: 0–2 decimal places (drop trailing zeros)
  if (Number.isInteger(abs)) {
    return `${sign}${abs.toString()}`;
  }
  // 1 or 2 decimals
  const rounded = Math.round(abs * 100) / 100;
  if (Number.isInteger(rounded)) {
    return `${sign}${rounded.toString()}`;
  }
  return `${sign}${rounded.toFixed(rounded * 10 % 1 === 0 ? 1 : 2)}`;
}

/** Formatter for the "days of cover" hero KPI (1 decimal). */
export function fmtDaysOfCover(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EM_DASH;
  if (n >= 999) return "999+";
  return n.toFixed(n < 10 ? 1 : 0);
}

/** Locale-aware date display, e.g. "Apr 26". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Long form, e.g. "Wed, Apr 26". */
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Two-line column-header pieces — top is weekday letter ("Sun"), bottom is
 * day-of-month ("26").
 */
export function fmtDayHeader(iso: string): { top: string; bottom: string } {
  try {
    const d = new Date(`${iso}T00:00:00`);
    const top = d.toLocaleDateString(undefined, { weekday: "short" });
    const bottom = d.getDate().toString();
    return { top, bottom };
  } catch {
    return { top: "?", bottom: "?" };
  }
}

/** Single-letter weekday ("S","M","T","W","T","F","S") for mobile mini-strip. */
export function fmtDayLetter(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "narrow" });
  } catch {
    return "?";
  }
}

/**
 * "in N days" relative to today (for hero KPI). Today = 0.
 * Positive only — past dates collapse to "today".
 */
export function fmtDaysFromNow(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  try {
    const target = new Date(`${iso}T00:00:00`).getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today.getTime()) / (24 * 3600 * 1000));
    if (diff <= 0) return "today";
    if (diff === 1) return "tomorrow";
    return `in ${diff} days`;
  } catch {
    return iso;
  }
}

/** Percent display for unknown-SKU banner: 0.183 -> "18%" (no decimals; conservative). */
export function fmtPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${Math.round(fraction * 100)}%`;
}

/** Friendly "X minutes ago" for FreshnessBadge fallback or hero subtitle. */
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  try {
    const then = new Date(iso).getTime();
    const min = Math.floor((Date.now() - then) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return iso;
  }
}

/**
 * Today as YYYY-MM-DD in local Asia/Jerusalem-ish wall-clock — for matching
 * day strings from the API. The backend keys days in Asia/Jerusalem (contract
 * §2 row L8) so we use the user's local machine date here. If the operator's
 * laptop drifts out of TZ this is a soft visual issue, not a correctness
 * issue (the data itself is timezone-correct on the server).
 */
export function todayIsoLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

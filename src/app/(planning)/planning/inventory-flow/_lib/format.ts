// ---------------------------------------------------------------------------
// format.ts — pure number / date formatters for Inventory Flow.
//
// Discipline:
//   - Tabular numerics in display (caller adds `tabular-nums` Tailwind class).
//   - Em-dash for zero / null (visually quiet — "nothing here").
//   - Proper minus sign for negatives.
//   - EXACT integer display for quantities (Tom mandate 2026-05-05): never
//     abbreviate to K / M; always print full digits with thousands separator.
//   - Locale-aware date helpers.
//
// Pure module — no React, no Tanstack, no DOM.
// ---------------------------------------------------------------------------

const EM_DASH = "—";
const MINUS = "−"; // U+2212 — typographic minus, not hyphen

/**
 * Quantity formatter for grid cells.
 *
 * Tom mandate 2026-05-05: "תמיד יהיה כתוב את המספר מלאי המדוייק. לא עיגול"
 * — always show the EXACT stock number; never abbreviate to K/M.
 *
 *   0       -> em-dash (visually quiet, signals "no qty")
 *   null    -> em-dash
 *  -3.5     -> "−3.5"   (proper minus; small fractions kept as signal)
 *   42      -> "42"
 *   1234    -> "1,234"
 *   12500   -> "12,500"
 *   −42.75  -> "−43"    (rounded to integer for |n| ≥ 10)
 *   −4.5    -> "−4.5"   (decimal preserved for |n| < 10)
 */
export function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EM_DASH;
  if (n === 0) return EM_DASH;

  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : "";

  // Preserve decimals when |n| < 10 (small fractional values are signal):
  if (abs < 10 && !Number.isInteger(abs)) {
    const rounded = Math.round(abs * 10) / 10;
    return `${sign}${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
  }
  // Otherwise round to integer with thousands separator:
  return `${sign}${Math.round(abs).toLocaleString("en-US")}`;
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

// ---------------------------------------------------------------------------
// "Operational Clarity" redesign 2026-05-04 — additional formatters
// ---------------------------------------------------------------------------

/**
 * Exact integer display with thousands separator.
 *
 * Tom mandate 2026-05-05: "תמיד יהיה כתוב את המספר מלאי המדוייק. לא עיגול"
 * — every quantity number on the inventory-flow page must show the EXACT
 * integer value, never rounded into K/M abbreviations.
 *
 * Function name preserved for caller compatibility; output is no longer
 * "compact" in the K/M sense — it is exact (with thousands separator).
 *
 *   0        -> "0"
 *   42       -> "42"
 *   1234     -> "1,234"
 *   12500    -> "12,500"
 *   −389.75  -> "−390"   (rounded to integer for cell display)
 *   −1158    -> "−1,158"
 *   null     -> "—"      (em-dash)
 */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return EM_DASH;
  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : "";
  const rounded = Math.round(abs);
  return `${sign}${rounded.toLocaleString("en-US")}`;
}

/**
 * Semantic days-cover label for the row hero in the sticky panel.
 *
 *   < 0   -> "STOCKOUT"
 *   < 7   -> "Nd cover"      (e.g. "5d cover")
 *   7-13  -> "1w cover"
 *   14-20 -> "2w cover"
 *   21-27 -> "3w cover"
 *   ≥ 28  -> ">3w cover"
 *
 * Returned as { value, sub } so the caller can render the value larger
 * than the trailing "cover" label.
 */
export function formatDaysCover(
  n: number | null | undefined,
): { value: string; sub: string } {
  if (n == null || !Number.isFinite(n)) {
    return { value: EM_DASH, sub: "" };
  }
  if (n < 0) {
    return { value: "STOCKOUT", sub: "" };
  }
  if (n < 7) {
    return { value: `${Math.max(0, Math.floor(n))}d`, sub: "cover" };
  }
  if (n < 14) {
    return { value: "1w", sub: "cover" };
  }
  if (n < 21) {
    return { value: "2w", sub: "cover" };
  }
  if (n < 28) {
    return { value: "3w", sub: "cover" };
  }
  return { value: ">3w", sub: "cover" };
}

/**
 * Two-line day-cell column header in the new "Operational Clarity" style.
 *
 *   Line 1: weekday short uppercase ("MON", "TUE", …) or "TODAY"
 *   Line 2: day-of-month integer ("4", "12", …)
 *
 * Non-working days: caller should render an em-dash separately; this
 * function returns the underlying weekday/day-of-month regardless.
 */
export function formatDayHeader2(
  iso: string,
  isToday: boolean,
): { weekday: string; dom: string } {
  try {
    const d = new Date(`${iso}T00:00:00`);
    const weekday = isToday
      ? "TODAY"
      : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    const dom = d.getDate().toString();
    return { weekday, dom };
  } catch {
    return { weekday: isToday ? "TODAY" : "?", dom: "?" };
  }
}

/**
 * Map a `days_cover_with_production` (or fallback) numeric to the same
 * tier-fg text token used by the day cells. Used to color the days-cover
 * hero in the sticky panel so the row's overall risk reads at a glance.
 *
 * Tom-locked thresholds (mirrors the server's `cell_tier_with_production`):
 *   < 0   -> critical_stockout
 *   < 7   -> at_risk
 *   < 14  -> low
 *   < 21  -> medium
 *   ≥ 21  -> healthy
 */
export function daysCoverTierClass(
  n: number | null | undefined,
): string {
  if (n == null || !Number.isFinite(n)) return "text-fg-muted";
  if (n < 0) return "text-tier-critical-bg";
  if (n < 7) return "text-tier-at-risk-bg";
  if (n < 14) return "text-tier-low-bg";
  if (n < 21) return "text-tier-medium-bg";
  return "text-tier-healthy-bg";
}

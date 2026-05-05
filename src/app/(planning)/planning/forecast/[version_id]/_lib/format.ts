// ---------------------------------------------------------------------------
// Forecast version detail — format helpers.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5 of
// docs/forecast_monthly_cadence_refactor_plan_2026-05-02.md).
//
// Tom-locked rules enforced here:
//   - Integer display only — every quantity rendered as
//     `Math.floor(qty).toLocaleString('en-US')`. No `.00000000` ever.
//   - Month column labels are clear "May 2026" / "Jun 2026" English LTR.
//     No ambiguous "26 מאי" duplicates. Year + month-name in one tile.
//   - English/LTR matches portal global standard locked 2026-05-01.
// ---------------------------------------------------------------------------

/**
 * Format a YYYY-MM-DD bucket key into a clear month + year label.
 * Examples: "2026-05-01" → "May 2026"; "2026-06-01" → "Jun 2026".
 *
 * Uses UTC to avoid local-tz drift (the bucket is a calendar-month anchor,
 * not a moment in local time).
 */
export function formatMonth(bucketKey: string): {
  label: string;
  shortLabel: string;
  year: number;
  month: number;
} {
  const d = new Date(bucketKey + "T00:00:00.000Z");
  return {
    // "May 2026" — full month name, 4-digit year, English LTR.
    label: d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
    // Same shape; alias for callers that semantically want a "short" label.
    shortLabel: d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
  };
}

/**
 * Split a YYYY-MM-DD monthly bucket key into the two-line header layout used
 * in the grid header: line 1 = "MAY" (uppercase, 9px tracking-wide); line 2
 * = "2026" (year, 13px medium). For weekly cadence, returns "MAY" / "04".
 *
 * Tom-locked grid pass 2026-05-05: month header hierarchy is the primary
 * column anchor; the two-line split lets the eye land on the month-name
 * first and the year second without crowding either line.
 *
 * Pure UTC formatting — same rule as formatMonth so we never drift across
 * tz boundaries when the planner travels.
 */
export function formatMonthHeader2(
  bucketKey: string,
  cadence: "monthly" | "weekly" | "daily" = "monthly",
): { primary: string; secondary: string; year: number; month: number; day: number } {
  const d = new Date(bucketKey + "T00:00:00.000Z");
  const monthShort = d
    .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (cadence === "weekly" || cadence === "daily") {
    return {
      primary: monthShort,
      secondary: String(day).padStart(2, "0"),
      year,
      month,
      day,
    };
  }
  return {
    primary: monthShort,
    secondary: String(year),
    year,
    month,
    day,
  };
}

/**
 * Compute the index of "today" in a bucket array — used to render the
 * TODAY pill + accent vertical band in the header. Returns -1 when today
 * doesn't fall in any bucket of the visible horizon.
 *
 * For monthly cadence: matches by year+month (any day of the bucket month
 * = today). For weekly cadence: matches by 7-day window starting at the
 * bucket key. For daily cadence: matches by exact YYYY-MM-DD.
 */
export function findTodayBucketIndex(
  buckets: { key: string }[],
  cadence: "monthly" | "weekly" | "daily",
  now: Date = new Date(),
): number {
  // Use UTC components so we line up with the bucket-key UTC anchors.
  const todayY = now.getUTCFullYear();
  const todayM = now.getUTCMonth() + 1;
  const todayD = now.getUTCDate();
  const todayMs = Date.UTC(todayY, todayM - 1, todayD);
  for (let i = 0; i < buckets.length; i++) {
    const d = new Date(buckets[i]!.key + "T00:00:00.000Z");
    const by = d.getUTCFullYear();
    const bm = d.getUTCMonth() + 1;
    if (cadence === "monthly") {
      if (by === todayY && bm === todayM) return i;
      continue;
    }
    if (cadence === "weekly") {
      const startMs = d.getTime();
      const endMs = startMs + 7 * 24 * 3600 * 1000;
      if (todayMs >= startMs && todayMs < endMs) return i;
      continue;
    }
    // daily
    if (
      by === todayY &&
      bm === todayM &&
      d.getUTCDate() === todayD
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Frozen-past detection for a bucket — true when the bucket month / week /
 * day ended strictly before today. Used to render the `bg-hatch-history`
 * treatment in the grid header column.
 *
 * NOTE: this does NOT change editability — Tom-locked amendment 2026-05-02
 * keeps every bucket editable. The hatch is a *visual* "this is past" cue
 * only, layered behind a still-editable input.
 */
export function isFrozenPast(
  bucketKey: string,
  cadence: "monthly" | "weekly" | "daily",
  now: Date = new Date(),
): boolean {
  const d = new Date(bucketKey + "T00:00:00.000Z");
  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (cadence === "monthly") {
    // Bucket "ended" once the calendar reaches the next month's day-1.
    const nextMonth = new Date(d);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    nextMonth.setUTCDate(1);
    return nextMonth.getTime() <= todayMs;
  }
  if (cadence === "weekly") {
    return d.getTime() + 7 * 24 * 3600 * 1000 <= todayMs;
  }
  // daily
  return d.getTime() < todayMs;
}

/**
 * Format a forecast quantity for display.
 *
 * EXACT-NUMBER policy (Tom mandate, mirrored from inventory-flow):
 *   - No rounding besides the floor at the integer boundary (the underlying
 *     qty_8dp may carry .000…01 noise from prior weekly→monthly conversions).
 *   - No "K" / "M" abbreviation. A 12,345 forecast renders as "12,345", never
 *     "12K" — the planner needs the exact number she typed.
 *   - Always en-US thousands separator.
 *
 * Rules:
 *   - null / undefined / non-finite / "" → "—"
 *   - 0 → "—" (sparse forecast UX: empty state hint, not literal zero)
 *   - positive → integer with thousands separator: 1234 → "1,234"
 *
 * Storage stays qty_8dp (numeric(24,8)) for chain compatibility; the trim
 * to integer happens at the render boundary only.
 */
export function formatQty(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n) || n <= 0) return "—";
  return Math.floor(n).toLocaleString("en-US");
}

/**
 * Stricter integer formatter — used inside KPI tiles AND row-total / column-
 * total hero cells where 0 is meaningful (e.g., "Items in forecast: 0" should
 * render as "0", not "—"). Same exact-number policy as formatQty: no
 * rounding, no abbreviation, en-US thousands separator.
 */
export function formatInt(raw: number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  if (!Number.isFinite(raw)) return "—";
  return Math.floor(raw).toLocaleString("en-US");
}

/**
 * Exact-number formatter that ALWAYS prints a thousands-separated integer,
 * including 0. Unlike formatQty (which renders 0 as em-dash for sparse-cell
 * UX), this is the right call for row totals and column totals where the
 * sum semantic is "the actual integer value, including zero".
 *
 * Sources consulted (grid pass 2026-05-05):
 *   - LogRocket / Pencil & Paper enterprise data-table guides — "summary
 *     rows must show the exact number, never an abbreviation".
 *   - Theresa Neil "Designing Web Interfaces" — Harvest-style live row
 *     totals always print exactly.
 */
export function formatExactInt(raw: number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  if (!Number.isFinite(raw)) return "—";
  return Math.floor(raw).toLocaleString("en-US");
}

/**
 * Compute month buckets for a forecast version.
 *
 * Plan-of-record §Chunk 4 / Task 4.3.2 + §Chunk 2.5 (monthly disaggregation
 * lives at read time in v_planning_demand + fn_compute_daily_fg_projection;
 * the portal stores monthly bucket keys verbatim as YYYY-MM-01).
 *
 * For cadence='monthly' with horizon_weeks=N (semantically N monthly
 * buckets per Tom-lock 2026-05-02):
 *   - bucket[0] = horizon_start_at (always first-of-month for monthly)
 *   - bucket[i] = horizon_start_at + i months (always first-of-month)
 *
 * For cadence='weekly' (legacy 22 forecasts coexist per SC-F1):
 *   - bucket[0] = horizon_start_at (Monday)
 *   - bucket[i] = horizon_start_at + i*7 days
 *
 * For cadence='daily': not implemented in v1 wizard; returns daily buckets
 * for completeness only.
 *
 * Tom-locked amendment 2026-05-02 (post-Wave-2 click-through smoke):
 * the frozen-month UX restriction is removed. Every bucket in the horizon
 * is editable. The data-layer freeze (forecast_versions.published_at +
 * frozen-via-publish gating in the publish handler) is unchanged — only the
 * portal-side read-only UX is gone. Consequently, computeMonthBuckets no
 * longer emits a `frozen` field; callers no longer branch on it.
 */
export interface MonthBucket {
  key: string; // YYYY-MM-DD
  label: string; // "May 2026" (monthly) / "May 04" (weekly)
  cadence: "monthly" | "weekly" | "daily";
}

export function computeMonthBuckets(
  cadence: "monthly" | "weekly" | "daily",
  horizonStartAt: string,
  horizonCount: number,
): MonthBucket[] {
  const start = new Date(horizonStartAt + "T00:00:00.000Z");

  const out: MonthBucket[] = [];
  for (let i = 0; i < horizonCount; i++) {
    const d = new Date(start);
    if (cadence === "monthly") {
      d.setUTCMonth(d.getUTCMonth() + i);
      d.setUTCDate(1);
    } else if (cadence === "weekly") {
      d.setUTCDate(d.getUTCDate() + i * 7);
    } else {
      // daily
      d.setUTCDate(d.getUTCDate() + i);
    }
    const key = d.toISOString().substring(0, 10);
    const label =
      cadence === "monthly"
        ? d.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })
        : d.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            timeZone: "UTC",
          });
    out.push({ key, label, cadence });
  }
  return out;
}

/**
 * Relative time formatter: "saved 3s ago" / "saved 2m ago" / "just saved".
 * Used by AutoSaveIndicator. Pure client-side helper.
 */
export function formatRelativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 2000) return "just saved";
  if (diffMs < 60 * 1000) {
    return `saved ${Math.floor(diffMs / 1000)}s ago`;
  }
  if (diffMs < 60 * 60 * 1000) {
    return `saved ${Math.floor(diffMs / (60 * 1000))}m ago`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    return `saved ${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
  }
  return `saved ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  })}`;
}

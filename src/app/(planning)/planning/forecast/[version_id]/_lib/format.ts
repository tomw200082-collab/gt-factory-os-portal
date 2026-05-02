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
 * Format a forecast quantity for display.
 *
 * Rules (Tom-locked):
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
 * Stricter integer formatter — used inside KPI tiles where 0 is meaningful
 * (e.g., "Items in forecast: 0" should render as "0", not "—").
 */
export function formatInt(raw: number | null | undefined): string {
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

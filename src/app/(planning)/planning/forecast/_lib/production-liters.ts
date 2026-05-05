// ---------------------------------------------------------------------------
// Forecast list — production-liters helpers.
//
// 2026-05-05 list-card polish (Tom directive: per-month liters + MoM growth
// + horizon summary on each forecast list card).
//
// Data shape comes from the upstream
//   GET /api/v1/queries/forecasts/versions/:version_id/production-liters
// handler (api/src/forecasts/handler.reads.ts → handleForecastProductionLiters).
//
// Per-month liters = SUM(forecast_quantity * items.base_fill_qty_per_unit)
// — items without a configured base_fill_qty_per_unit (i.e. BOUGHT_FINISHED
// or unconfigured MANUFACTURED/REPACK) contribute zero. This matches the
// physical reality on the factory floor: only items that consume base
// liquid count toward "production liters".
// ---------------------------------------------------------------------------

export interface MonthlyLitersRowApi {
  month_start: string; // "YYYY-MM-DD"
  liters: string;      // numeric serialized as text
}

export interface ProductionLitersResponseApi {
  version_id: string;
  monthly_liters: MonthlyLitersRowApi[];
}

// Aligned per-block view: one entry per horizon block, in order.
//   - liters: the liters total for that month (0 if no data)
//   - mom: MoM growth ratio vs the immediately-previous block in the
//          aligned series (null for the first block, or when prev is 0).
export interface AlignedMonthlyLiters {
  monthStart: string | null; // ISO date or null when out of horizon
  liters: number;
  mom: number | null;        // signed ratio: 0.084 = +8.4%; null if undefined
}

// Horizon summary derived for the kpi cluster next to the hero label.
export interface HorizonLitersSummary {
  totalLiters: number;
  monthCount: number;       // number of horizon blocks (incl. zero-liter ones)
  avgLitersPerMonth: number;
  peakMonth: { monthStart: string; liters: number } | null;
  // Last-vs-first growth ratio across the horizon (signed); null if first is 0
  // or horizon is single-month.
  horizonGrowth: number | null;
}

// — formatters —

/**
 * Format an integer number of liters with a thousands separator and " L"
 * suffix. Tom-locked rule: no K abbreviation; exact integers only.
 * Half-liter SKUs roll up to whole-liter sums in practice (per the data),
 * but we still floor any sub-1 fraction off the display to keep blocks
 * narrow. The full numeric value is preserved in the title attribute.
 */
export function formatLiters(liters: number): string {
  if (!Number.isFinite(liters)) return "—";
  // Round to nearest whole liter for display; we don't show decimals on the
  // list cards (Tom-locked: integer-only numbers in this view).
  const rounded = Math.round(liters);
  return `${rounded.toLocaleString("en-US")} L`;
}

/**
 * Format a MoM growth ratio as "+8.4%" / "-3.1%". Returns "—" when null.
 * Treats |x| < 0.01 (1%) as flat per Tom directive.
 */
export function formatMomPct(ratio: number | null): {
  label: string;
  tone: "up" | "down" | "flat" | "none";
} {
  if (ratio === null || !Number.isFinite(ratio))
    return { label: "—", tone: "none" };
  if (Math.abs(ratio) < 0.01) return { label: "0.0%", tone: "flat" };
  const sign = ratio > 0 ? "+" : "−";
  const abs = Math.abs(ratio) * 100;
  return {
    label: `${sign}${abs.toFixed(1)}%`,
    tone: ratio > 0 ? "up" : "down",
  };
}

// — alignment + math —

/**
 * Align the API response into the same series of horizon blocks the card
 * renders (8 max for monthly, 6 max for weekly). Empty months are zero.
 *
 * `horizonStartIso` is the version's horizon_start_at; `cadence` controls
 * stride; `blockCount` is how many blocks to emit (matches what the card
 * already renders, so each block's index lines up).
 *
 * For weekly cadence this returns one entry per week — the card itself
 * decides whether to show those (production-liters MoM only makes sense on
 * the monthly cadence; weekly horizons just show liters totals).
 */
export function alignMonthlyLiters(
  rows: MonthlyLitersRowApi[],
  horizonStartIso: string,
  cadence: "monthly" | "weekly" | "daily",
  blockCount: number,
): AlignedMonthlyLiters[] {
  const byKey = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r.liters);
    if (Number.isFinite(n)) byKey.set(r.month_start, n);
  }

  const out: AlignedMonthlyLiters[] = [];
  if (!horizonStartIso || blockCount < 1) return out;

  let prev: number | null = null;
  try {
    const start = new Date(horizonStartIso);
    for (let i = 0; i < blockCount; i++) {
      const d = new Date(start);
      if (cadence === "monthly") {
        d.setMonth(d.getMonth() + i);
        // Snap to first-of-month UTC date string (matches period_bucket_key).
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const monthStart = `${y}-${m}-01`;
        const liters = byKey.get(monthStart) ?? 0;
        const mom =
          prev === null
            ? null
            : prev === 0
              ? null
              : (liters - prev) / prev;
        out.push({ monthStart, liters, mom });
        prev = liters;
      } else {
        d.setDate(d.getDate() + i * 7);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const weekStart = `${y}-${m}-${day}`;
        // Weekly buckets — the API may not produce these in v1 (forecasts are
        // monthly-cadence operationally), so most weekly horizons will be 0.
        const liters = byKey.get(weekStart) ?? 0;
        const mom =
          prev === null
            ? null
            : prev === 0
              ? null
              : (liters - prev) / prev;
        out.push({ monthStart: weekStart, liters, mom });
        prev = liters;
      }
    }
  } catch {
    /* ignore — return what we have */
  }
  return out;
}

/**
 * Summary derived across the aligned horizon.
 */
export function summarizeHorizon(
  aligned: AlignedMonthlyLiters[],
): HorizonLitersSummary {
  if (aligned.length === 0) {
    return {
      totalLiters: 0,
      monthCount: 0,
      avgLitersPerMonth: 0,
      peakMonth: null,
      horizonGrowth: null,
    };
  }
  let total = 0;
  let peak: { monthStart: string; liters: number } | null = null;
  for (const a of aligned) {
    total += a.liters;
    if (a.monthStart && (!peak || a.liters > peak.liters)) {
      peak = { monthStart: a.monthStart, liters: a.liters };
    }
  }
  const monthCount = aligned.length;
  const avg = monthCount > 0 ? total / monthCount : 0;
  const first = aligned[0]?.liters ?? 0;
  const last = aligned[aligned.length - 1]?.liters ?? 0;
  const horizonGrowth =
    monthCount < 2 ? null : first === 0 ? null : (last - first) / first;
  return {
    totalLiters: total,
    monthCount,
    avgLitersPerMonth: avg,
    peakMonth: peak,
    horizonGrowth,
  };
}

/**
 * Bar-width fraction for a block's tier bar. Scales by liters / peakLiters,
 * with a min of 0.20 so smaller months still register visually. Returns
 * 0 when there are no liters at all in the horizon.
 */
export function barWidthFraction(
  liters: number,
  peakLiters: number,
): number {
  if (peakLiters <= 0) return 0;
  const raw = liters / peakLiters;
  return Math.max(0.2, Math.min(1, raw));
}

/**
 * Short month label "JUL" for the peak microcard. Falls back to "—" on parse
 * failure. Locale-controlled to en-US so the list page reads consistently
 * regardless of OS locale (the list-card surface is English-only per
 * Tom-locked rule 2026-05-01).
 */
export function shortMonthLabel(monthStart: string | null): string {
  if (!monthStart) return "—";
  try {
    const d = new Date(monthStart);
    return d
      .toLocaleDateString("en-US", { month: "short" })
      .toUpperCase();
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// Input-integrity parsing — Tranche 132.
//
// The session engine (backend 0284) stores an `input_integrity` snapshot on
// every purchase_session: how old the demand forecast is and whether it covers
// the horizon, how fresh the physical counts behind the buy-list's on-hand
// figures are, and the rebuild-verifier drift. The API forwards it as
// `unknown`; this module parses it defensively (null on pre-0284 sessions)
// and derives the compact tone-per-signal model the freshness strip renders.
// It also decodes the 0235 `firmed_window` snapshot (how many weeks of firmed
// production plan actually fed component demand).
// ---------------------------------------------------------------------------

export interface ForecastIntegrity {
  ageDays: number | null;
  coverageEnd: string | null; // ISO date the published forecast covers through
  horizonEnd: string | null; // ISO date the session horizon runs through
  uncoveredDays: number | null; // horizon days past the forecast's coverage
}

export interface CountsIntegrity {
  targets: number;
  fresh: number;
  stale: number;
  neverCounted: number;
  thresholdDays: number;
  oldestAgeDays: number | null;
}

export interface SessionIntegrity {
  forecast: ForecastIntegrity | null;
  counts: CountsIntegrity | null;
  verifierDrift: number | null;
}

export interface FirmedWindow {
  firmedWeeks: string[]; // ISO Mondays of the firmed production weeks
  windowEnd: string | null;
  firmedRows: number | null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function parseInputIntegrity(raw: unknown): SessionIntegrity | null {
  const o = rec(raw);
  if (!o) return null;
  const fc = rec(o.forecast);
  const cn = rec(o.counts);
  const forecast: ForecastIntegrity | null = fc
    ? {
        ageDays: num(fc.age_days),
        coverageEnd: str(fc.coverage_end),
        horizonEnd: str(fc.horizon_end),
        uncoveredDays: num(fc.uncovered_days),
      }
    : null;
  const counts: CountsIntegrity | null = cn
    ? {
        targets: num(cn.targets) ?? 0,
        fresh: num(cn.fresh) ?? 0,
        stale: num(cn.stale) ?? 0,
        neverCounted: num(cn.never_counted) ?? 0,
        thresholdDays: num(cn.threshold_days) ?? 7,
        oldestAgeDays: num(cn.oldest_age_days),
      }
    : null;
  if (!forecast && !counts && !("verifier_drift" in o)) return null;
  return { forecast, counts, verifierDrift: num(o.verifier_drift) };
}

export function parseFirmedWindow(raw: unknown): FirmedWindow | null {
  const o = rec(raw);
  if (!o) return null;
  const weeks = Array.isArray(o.firmed_weeks_iso_monday)
    ? o.firmed_weeks_iso_monday.filter((w): w is string => typeof w === "string")
    : [];
  if (weeks.length === 0 && !("window_end" in o)) return null;
  return {
    firmedWeeks: weeks,
    windowEnd: str(o.window_end),
    firmedRows: num(o.firmed_plan_rows),
  };
}

// --- signal tones (what deserves attention vs quiet confirmation) ----------

export type SignalTone = "ok" | "warn" | "bad";

/** Forecast older than this (days) is a warning — a monthly cadence means
 *  ~31 is expected; beyond that the demand input is going stale. */
export const FORECAST_WARN_AGE_DAYS = 31;

export function forecastTone(f: ForecastIntegrity | null): SignalTone | null {
  if (!f || (f.ageDays == null && f.uncoveredDays == null)) return null;
  if ((f.ageDays ?? 0) > FORECAST_WARN_AGE_DAYS || (f.uncoveredDays ?? 0) > 0)
    return "warn";
  return "ok";
}

export function countsTone(c: CountsIntegrity | null): SignalTone | null {
  if (!c || c.targets === 0) return null;
  if (c.fresh === c.targets) return "ok";
  // Everything unverified is worse than partially verified.
  return c.fresh === 0 ? "bad" : "warn";
}

export function driftTone(drift: number | null): SignalTone {
  return drift === 0 ? "ok" : "bad";
}

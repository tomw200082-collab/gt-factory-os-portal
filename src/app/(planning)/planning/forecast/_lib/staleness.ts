// ---------------------------------------------------------------------------
// Tranche 065 (FLOW-F01) — pure staleness classification for the forecast
// list banner. Computed from already-fetched version metadata only; no
// extra query.
//
//   none    — no published forecast exists: planning has nothing to work from.
//   covered — the active forecast's horizon covers the current date.
//   stale   — a published forecast exists but its horizon does NOT cover the
//             current date (elapsed, or — edge case — not started yet), so
//             planning recommendations may be stale.
//
// Cadence-aware horizon math (post-tranche-063 review fix): the backend's
// `horizon_weeks` column counts BUCKETS, not calendar weeks — on the live
// monthly cadence `horizon_weeks = 2` means two calendar months. Treating
// it as 14 days would mark a perfectly valid monthly forecast "stale"
// mid-month. Weekly/daily cadences keep week-denominated math.
//
// When several published versions exist (shouldn't normally happen), the one
// whose horizon ends latest decides — the most generous honest answer.
// ---------------------------------------------------------------------------

export interface StalenessVersionInput {
  version_id: string;
  status: string;
  cadence?: "monthly" | "weekly" | "daily" | string;
  horizon_start_at: string;
  horizon_weeks: number;
}

export type ForecastStaleness =
  | { kind: "none" }
  | { kind: "covered"; versionId: string; horizonEnd: Date }
  | { kind: "stale"; versionId: string; horizonEnd: Date };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function horizonEndOf(v: StalenessVersionInput): Date | null {
  const start = new Date(v.horizon_start_at);
  if (!Number.isFinite(start.getTime())) return null;
  const buckets = Number(v.horizon_weeks);
  if (!Number.isFinite(buckets) || buckets <= 0) return null;
  if (v.cadence === "monthly") {
    // N monthly buckets — horizon ends at the same day-of-month N months
    // later (UTC), matching the backend's bucket interpretation.
    const end = new Date(start.getTime());
    end.setUTCMonth(end.getUTCMonth() + buckets);
    return end;
  }
  return new Date(start.getTime() + buckets * WEEK_MS);
}

export function forecastStaleness(
  versions: readonly StalenessVersionInput[],
  now: Date = new Date(),
): ForecastStaleness {
  let best: { v: StalenessVersionInput; end: Date } | null = null;
  for (const v of versions) {
    if (v.status !== "published") continue;
    const end = horizonEndOf(v);
    if (!end) continue;
    if (!best || end.getTime() > best.end.getTime()) best = { v, end };
  }
  if (!best) return { kind: "none" };
  const start = new Date(best.v.horizon_start_at).getTime();
  const covered = now.getTime() >= start && now.getTime() < best.end.getTime();
  return covered
    ? { kind: "covered", versionId: best.v.version_id, horizonEnd: best.end }
    : { kind: "stale", versionId: best.v.version_id, horizonEnd: best.end };
}

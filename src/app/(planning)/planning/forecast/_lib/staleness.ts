// ---------------------------------------------------------------------------
// Tranche 063 (FLOW-F01) — pure staleness classification for the forecast
// list banner. Computed from already-fetched version metadata only; no
// extra query.
//
//   none    — no published forecast exists: planning has nothing to work from.
//   covered — the active forecast's horizon covers the current date.
//   stale   — a published forecast exists but its horizon does NOT cover the
//             current date (elapsed, or — edge case — not started yet), so
//             planning recommendations may be stale.
//
// When several published versions exist (shouldn't normally happen), the one
// whose horizon ends latest decides — the most generous honest answer.
// ---------------------------------------------------------------------------

export interface StalenessVersionInput {
  version_id: string;
  status: string;
  horizon_start_at: string;
  horizon_weeks: number;
}

export type ForecastStaleness =
  | { kind: "none" }
  | { kind: "covered"; versionId: string; horizonEnd: Date }
  | { kind: "stale"; versionId: string; horizonEnd: Date };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function horizonEndOf(v: StalenessVersionInput): Date | null {
  const start = new Date(v.horizon_start_at).getTime();
  if (!Number.isFinite(start)) return null;
  const weeks = Number(v.horizon_weeks);
  if (!Number.isFinite(weeks) || weeks <= 0) return null;
  return new Date(start + weeks * WEEK_MS);
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

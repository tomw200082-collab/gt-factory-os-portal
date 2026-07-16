// ---------------------------------------------------------------------------
// Input-integrity parsing tests — Tranche 132.
//
//   I1 — parses a live-shaped 0284 payload (forecast + counts + drift)
//   I2 — null / malformed / pre-0284 payloads → null (no crash, no noise)
//   I3 — tone rules: fresh forecast ok, old or under-covering forecast warns
//   I4 — tone rules: counts all-fresh ok, partial warn, none-fresh bad
//   I5 — firmed-window parse extracts the firmed weeks
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  countsTone,
  driftTone,
  forecastTone,
  parseFirmedWindow,
  parseInputIntegrity,
} from "./integrity";

// Shape captured from the live off_cycle verification session (2026-07-16).
const LIVE = {
  counts: {
    fresh: 4,
    stale: 19,
    targets: 33,
    never_counted: 10,
    threshold_days: 7,
    oldest_age_days: 66,
  },
  forecast: {
    age_days: 38,
    version_id: "369f5cb1-b4b6-46fe-9ace-b4bf6111fc01",
    horizon_end: "2026-09-09",
    coverage_end: "2026-08-02",
    published_at: "2026-06-08T12:32:36.035+00:00",
    uncovered_days: 38,
  },
  generated_at: "2026-07-16T16:15:58.541517+00:00",
  verifier_drift: 0,
};

describe("parseInputIntegrity", () => {
  it("I1 parses the live 0284 payload", () => {
    const p = parseInputIntegrity(LIVE);
    expect(p).not.toBeNull();
    expect(p?.forecast?.ageDays).toBe(38);
    expect(p?.forecast?.uncoveredDays).toBe(38);
    expect(p?.forecast?.coverageEnd).toBe("2026-08-02");
    expect(p?.counts?.targets).toBe(33);
    expect(p?.counts?.fresh).toBe(4);
    expect(p?.counts?.neverCounted).toBe(10);
    expect(p?.verifierDrift).toBe(0);
  });

  it("I2 returns null on null / malformed / empty payloads", () => {
    expect(parseInputIntegrity(null)).toBeNull();
    expect(parseInputIntegrity(undefined)).toBeNull();
    expect(parseInputIntegrity("nope")).toBeNull();
    expect(parseInputIntegrity([])).toBeNull();
    expect(parseInputIntegrity({})).toBeNull();
  });

  it("I3 forecast tone: fresh ok; old or under-covering warns", () => {
    expect(
      forecastTone({ ageDays: 10, coverageEnd: null, horizonEnd: null, uncoveredDays: 0 }),
    ).toBe("ok");
    expect(
      forecastTone({ ageDays: 38, coverageEnd: null, horizonEnd: null, uncoveredDays: 0 }),
    ).toBe("warn");
    expect(
      forecastTone({ ageDays: 5, coverageEnd: null, horizonEnd: null, uncoveredDays: 12 }),
    ).toBe("warn");
    expect(forecastTone(null)).toBeNull();
  });

  it("I4 counts tone: all fresh ok, some fresh warn, none fresh bad", () => {
    const base = { stale: 0, neverCounted: 0, thresholdDays: 7, oldestAgeDays: null };
    expect(countsTone({ ...base, targets: 5, fresh: 5 })).toBe("ok");
    expect(countsTone({ ...base, targets: 5, fresh: 2, stale: 3 })).toBe("warn");
    expect(countsTone({ ...base, targets: 5, fresh: 0, stale: 5 })).toBe("bad");
    expect(countsTone(null)).toBeNull();
    expect(driftTone(0)).toBe("ok");
    expect(driftTone(3)).toBe("bad");
    expect(driftTone(null)).toBe("bad");
  });

  it("I5 firmed-window parse extracts the firmed weeks", () => {
    const fw = parseFirmedWindow({
      window_start: "2026-07-16",
      window_end: "2026-09-09",
      firmed_plan_rows: 29,
      firmed_weeks_iso_monday: ["2026-07-13", "2026-07-20", "2026-07-27"],
    });
    expect(fw?.firmedWeeks).toHaveLength(3);
    expect(fw?.windowEnd).toBe("2026-09-09");
    expect(fw?.firmedRows).toBe(29);
    expect(parseFirmedWindow(null)).toBeNull();
  });
});

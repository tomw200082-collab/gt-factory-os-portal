// ---------------------------------------------------------------------------
// Tranche 065 (FLOW-F01) — unit tests for the forecast-list staleness
// classifier behind the banner: none / covered / stale.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  forecastStaleness,
  horizonEndOf,
  type StalenessVersionInput,
} from "./staleness";

const NOW = new Date("2026-06-12T12:00:00Z");

function version(
  overrides?: Partial<StalenessVersionInput>,
): StalenessVersionInput {
  return {
    version_id: "v1",
    status: "published",
    horizon_start_at: "2026-06-01T00:00:00Z",
    horizon_weeks: 4,
    ...overrides,
  };
}

describe("forecastStaleness (Tranche 065 FLOW-F01)", () => {
  it("F1 no versions → none", () => {
    expect(forecastStaleness([], NOW)).toEqual({ kind: "none" });
  });

  it("F2 only drafts / archived → none (planning has nothing to work from)", () => {
    const r = forecastStaleness(
      [version({ status: "draft" }), version({ status: "superseded" })],
      NOW,
    );
    expect(r.kind).toBe("none");
  });

  it("F3 active horizon covering today → covered", () => {
    const r = forecastStaleness([version()], NOW);
    expect(r.kind).toBe("covered");
    if (r.kind === "covered") {
      expect(r.versionId).toBe("v1");
      expect(r.horizonEnd.toISOString()).toBe("2026-06-29T00:00:00.000Z");
    }
  });

  it("F4 horizon elapsed → stale", () => {
    const r = forecastStaleness(
      [version({ horizon_start_at: "2026-04-01T00:00:00Z", horizon_weeks: 4 })],
      NOW,
    );
    expect(r.kind).toBe("stale");
  });

  it("F5 horizon not started yet → stale (does not cover the current period)", () => {
    const r = forecastStaleness(
      [version({ horizon_start_at: "2026-07-01T00:00:00Z" })],
      NOW,
    );
    expect(r.kind).toBe("stale");
  });

  it("F6 several published versions → the latest horizon end decides", () => {
    const r = forecastStaleness(
      [
        version({
          version_id: "old",
          horizon_start_at: "2026-04-01T00:00:00Z",
        }),
        version({
          version_id: "current",
          horizon_start_at: "2026-06-08T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(r.kind).toBe("covered");
    if (r.kind === "covered") expect(r.versionId).toBe("current");
  });

  it("F7 unparseable horizon metadata is skipped, not crashed on", () => {
    expect(
      horizonEndOf(version({ horizon_start_at: "not-a-date" })),
    ).toBeNull();
    const r = forecastStaleness(
      [version({ horizon_start_at: "not-a-date" })],
      NOW,
    );
    expect(r.kind).toBe("none");
  });

  it("F8 boundary: exactly at horizon end is no longer covered", () => {
    const r = forecastStaleness(
      [version({ horizon_start_at: "2026-05-15T12:00:00Z", horizon_weeks: 4 })],
      new Date("2026-06-12T12:00:00Z"),
    );
    expect(r.kind).toBe("stale");
  });

  // -------------------------------------------------------------------------
  // Monthly cadence — horizon_weeks counts MONTHLY BUCKETS on the live
  // monthly cadence (HORIZON_WEEKS_V1 = 2 means two calendar months).
  // -------------------------------------------------------------------------

  it("M1 monthly: horizon_weeks=2 covers the whole second month, not 14 days", () => {
    const r = forecastStaleness(
      [
        version({
          cadence: "monthly",
          horizon_start_at: "2026-05-01T00:00:00Z",
          horizon_weeks: 2,
        }),
      ],
      NOW, // 2026-06-12 — week-math would have expired on 2026-05-15
    );
    expect(r.kind).toBe("covered");
    if (r.kind === "covered") {
      expect(r.horizonEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    }
  });

  it("M2 monthly: horizon elapsed after N months → stale", () => {
    const r = forecastStaleness(
      [
        version({
          cadence: "monthly",
          horizon_start_at: "2026-03-01T00:00:00Z",
          horizon_weeks: 2,
        }),
      ],
      NOW, // ended 2026-05-01
    );
    expect(r.kind).toBe("stale");
  });

  it("M3 weekly cadence keeps week-denominated math", () => {
    expect(
      horizonEndOf(
        version({
          cadence: "weekly",
          horizon_start_at: "2026-06-01T00:00:00Z",
          horizon_weeks: 2,
        }),
      )?.toISOString(),
    ).toBe("2026-06-15T00:00:00.000Z");
  });
});

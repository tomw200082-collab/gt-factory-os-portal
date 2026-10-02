// The two-year circle's facts and geometry (GT Pulse Unit B, tranche 191).
import { describe, it, expect } from "vitest";
import { buildRing, monthAngles, monthLabel, ymOf } from "@/app/(sales)/_lib/ring";
import { circle } from "./_orgFixtures";

describe("buildRing", () => {
  it("splits 24 months into the last 12 (outer) and the 12 before (inner), oldest first", () => {
    const ring = buildRing(circle().months, []);
    expect(ring.inner).toHaveLength(12);
    expect(ring.outer).toHaveLength(12);
    expect(ring.inner[0].ym).toBe("2024-11");
    expect(ring.outer[11].ym).toBe("2026-10");
  });

  it("draws orders and refunds filled and cancellations hollow", () => {
    const m = buildRing(circle().months, []).outer.find((x) => x.ym === "2026-07")!;
    expect(m.filled).toBe(m.completed + m.refunded);
    expect(m.hollow).toBe(m.cancelled);
  });

  it("never draws the server's draft count, which includes completed drafts (F1)", () => {
    const ring = buildRing(circle().months, []);
    expect([...ring.inner, ...ring.outer].every((m) => m.open === 0)).toBe(true);
  });

  it("draws an open draft in the Israeli month it was opened in", () => {
    const ring = buildRing(circle().months, [
      { gid: "gid://shopify/DraftOrder/1", name: "#D1", draft_status: "OPEN", created_at: "2026-08-31T22:30:00Z", age_days: 30 },
    ]);
    // 22:30 UTC on 31 August is 01:30 on 1 September in Israel
    expect(ring.outer.find((m) => m.ym === "2026-09")!.open).toBe(1);
    expect(ring.outer.find((m) => m.ym === "2026-08")!.open).toBe(0);
  });

  it("orders months even when the server's are shuffled", () => {
    const shuffled = [...circle().months].reverse();
    expect(buildRing(shuffled, []).outer[11].ym).toBe("2026-10");
  });
});

describe("geometry", () => {
  it("reads clockwise from 12 o'clock with the newest month ending at the top", () => {
    const first = monthAngles(0);
    const last = monthAngles(11);
    // a hairline gap separates months, so the edges sit within a degree of 12 o'clock
    expect(Math.abs(first.start + 90)).toBeLessThan(1);
    expect(Math.abs(last.end - 270)).toBeLessThan(1);
    expect(first.end - first.start).toBeLessThan(30);
  });
});

describe("labels", () => {
  it("names a month in Hebrew with its year", () => {
    expect(monthLabel("2026-09")).toMatch(/ספטמבר/);
    expect(monthLabel("2026-09")).toMatch(/2026/);
  });
  it("puts an instant in its Israeli month", () => {
    expect(ymOf("2026-06-30T23:30:00Z")).toBe("2026-07");
  });
});

// ---------------------------------------------------------------------------
// Focus-queue engine unit tests — Tranche 029.
//
// Coverage:
//   Q1 — buildFocusQueue orders must_today (most-overdue first) then can_wait
//   Q2 — buildFocusQueue excludes handled (placed/skipped) orders
//   Q3 — nextUnresolvedId advances to the next still-open order
//   Q4 — nextUnresolvedId skips resolved orders along the way
//   Q5 — nextUnresolvedId returns null when nothing remains
//   Q6 — allResolved / positionOf
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  allResolved,
  buildFocusQueue,
  isResolved,
  nextUnresolvedId,
  positionOf,
  remainingCount,
  type QueuePo,
} from "./focus-queue";

const TODAY = "2026-05-29";

function po(id: string, overrides: Partial<QueuePo> = {}): QueuePo {
  return {
    session_po_id: id,
    status: "proposed",
    tier: "must",
    order_by_date: "2026-06-05",
    earliest_need_date: null,
    ...overrides,
  };
}

describe("buildFocusQueue", () => {
  it("Q1 orders must_today (most-overdue first) then can_wait", () => {
    const q = buildFocusQueue(
      [
        po("a", { order_by_date: "2026-06-10" }), // can_wait
        po("b", { order_by_date: "2026-05-20" }), // overdue -9
        po("c", { order_by_date: "2026-05-28" }), // overdue -1
      ],
      TODAY,
    );
    expect(q).toEqual(["b", "c", "a"]);
  });

  it("Q2 excludes placed/skipped orders", () => {
    const q = buildFocusQueue(
      [
        po("a", { status: "placed", order_by_date: "2026-05-20" }),
        po("b", { status: "skipped", order_by_date: "2026-05-21" }),
        po("c", { status: "approved", order_by_date: "2026-05-22" }),
      ],
      TODAY,
    );
    expect(q).toEqual(["c"]);
  });
});

describe("nextUnresolvedId", () => {
  const queue = ["a", "b", "c"];

  it("Q3 advances to the next open order", () => {
    const status = { a: "approved", b: "proposed", c: "proposed" } as const;
    expect(nextUnresolvedId(queue, "a", status)).toBe("b");
  });

  it("Q4 skips a now-resolved order in the middle", () => {
    const status = { a: "placed", b: "placed", c: "proposed" } as const;
    expect(nextUnresolvedId(queue, "a", status)).toBe("c");
  });

  it("Q5 returns null when nothing is left", () => {
    const status = { a: "placed", b: "skipped", c: "placed" } as const;
    expect(nextUnresolvedId(queue, "a", status)).toBeNull();
  });

  it("Q3b from null starts at the first unresolved", () => {
    const status = { a: "placed", b: "proposed", c: "proposed" } as const;
    expect(nextUnresolvedId(queue, null, status)).toBe("b");
  });
});

describe("helpers", () => {
  it("Q6 isResolved / allResolved / positionOf", () => {
    expect(isResolved("placed")).toBe(true);
    expect(isResolved("skipped")).toBe(true);
    expect(isResolved("proposed")).toBe(false);

    const queue = ["a", "b"];
    expect(allResolved(queue, { a: "placed", b: "skipped" })).toBe(true);
    expect(allResolved(queue, { a: "placed", b: "approved" })).toBe(false);

    expect(positionOf(queue, "b")).toBe(2);
    expect(positionOf(queue, "x")).toBe(0);
    expect(positionOf(queue, null)).toBe(0);
  });

  it("Q7 remainingCount counts only unresolved queued orders", () => {
    const queue = ["a", "b", "c"];
    expect(remainingCount(queue, { a: "placed", b: "proposed", c: "approved" })).toBe(2);
    expect(remainingCount(queue, { a: "placed", b: "skipped", c: "placed" })).toBe(0);
    // missing status is treated as not-remaining (unknown/absent)
    expect(remainingCount(["a", "z"], { a: "approved" })).toBe(1);
  });
});

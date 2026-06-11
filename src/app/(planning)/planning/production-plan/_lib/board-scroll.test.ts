// Tranche 054 (FLOW-001) — unit tests for the board scroll geometry helpers.

import { describe, it, expect } from "vitest";
import {
  boardOverflows,
  centeredScrollLeft,
  isLaneOutOfView,
} from "./board-scroll";

describe("boardOverflows", () => {
  it("returns false when content fits exactly", () => {
    expect(boardOverflows(1000, 1000)).toBe(false);
  });

  it("absorbs subpixel rounding (1px tolerance)", () => {
    expect(boardOverflows(1000, 1001)).toBe(false);
  });

  it("returns true when content is wider than the container", () => {
    expect(boardOverflows(390, 1100)).toBe(true);
  });

  it("returns false when content is narrower than the container", () => {
    expect(boardOverflows(1400, 1100)).toBe(false);
  });
});

describe("centeredScrollLeft", () => {
  // Phone-ish board: 7 lanes × 150px (140 min + gap share) in a 390px viewport.
  const base = { containerWidth: 390, scrollWidth: 1050 };

  it("centers a middle lane", () => {
    // Lane 4 of 7: left = 450, width = 150 → lane center 525.
    const left = centeredScrollLeft({ ...base, laneLeft: 450, laneWidth: 150 });
    // 525 - 390/2 = 330.
    expect(left).toBe(330);
  });

  it("clamps to 0 for the first lane", () => {
    const left = centeredScrollLeft({ ...base, laneLeft: 0, laneWidth: 150 });
    expect(left).toBe(0);
  });

  it("clamps to max scroll for the last lane", () => {
    // Lane 7: left = 900. Unclamped target = 900 + 75 - 195 = 780;
    // max = 1050 - 390 = 660.
    const left = centeredScrollLeft({ ...base, laneLeft: 900, laneWidth: 150 });
    expect(left).toBe(660);
  });

  it("returns 0 when the board does not overflow (max clamp is 0)", () => {
    const left = centeredScrollLeft({
      containerWidth: 1400,
      scrollWidth: 1100,
      laneLeft: 600,
      laneWidth: 150,
    });
    expect(left).toBe(0);
  });

  it("rounds fractional targets to whole pixels", () => {
    const left = centeredScrollLeft({
      ...base,
      laneLeft: 450.4,
      laneWidth: 150.5,
    });
    expect(Number.isInteger(left)).toBe(true);
  });
});

describe("isLaneOutOfView", () => {
  const lane = { containerWidth: 390, laneLeft: 450, laneWidth: 150 };

  it("is out of view when fully to the right of the viewport", () => {
    // Viewport [0, 390); lane starts at 450.
    expect(isLaneOutOfView(0, lane)).toBe(true);
  });

  it("is out of view when fully to the left of the viewport", () => {
    // Viewport [600, 990); lane ends at 600 (edge-adjacent counts as out).
    expect(isLaneOutOfView(600, lane)).toBe(true);
  });

  it("is in view when fully visible", () => {
    // Viewport [330, 720) fully contains [450, 600).
    expect(isLaneOutOfView(330, lane)).toBe(false);
  });

  it("counts a partially visible lane as in view", () => {
    // Viewport [500, 890): lane [450, 600) overlaps by 100px.
    expect(isLaneOutOfView(500, lane)).toBe(false);
    // Viewport [100, 490): lane peeks in by 40px.
    expect(isLaneOutOfView(100, lane)).toBe(false);
  });
});

// describeVariance — locks the deepened variance-display interface.
//
// describeVariance is the single deep entry point that replaced callers
// hand-assembling computeVarianceSign + fmtVarianceQty + fmtVariancePct +
// VARIANCE_SIGN_LABEL at every variance site (see ProductionJobCard).
//
// INVARIANT (the deepening must not re-shallow or drift behaviour): every
// field of the descriptor MUST equal the output of the legacy primitive it
// composes. These tests assert exactly that, so a future change to either the
// primitives or describeVariance can't silently diverge.

import { describe, expect, it } from "vitest";
import {
  describeVariance,
  computeVarianceSign,
  fmtVarianceQty,
  fmtVariancePct,
  VARIANCE_SIGN_LABEL,
} from "./helpers";

// (varianceQty, variancePct, plannedQty)
const CASES: ReadonlyArray<[string, string | null, string]> = [
  ["-2", "-4.0", "50"], // under (within? -4% > 2% band → under)
  ["-109", "-36.33", "300"], // under, large
  ["+135", "67.5", "200"], // over
  ["0", "0", "100"], // on target
  ["1", "1.0", "100"], // within 2% band → on target
  ["5", null, "100"], // null pct → "—"
  ["3", "0", "0"], // planned 0 edge
];

describe("describeVariance", () => {
  it.each(CASES)(
    "composes the legacy primitives for (qty=%s, pct=%s, planned=%s)",
    (vQty, vPct, planned) => {
      const d = describeVariance(vQty, vPct, planned);
      const sign = computeVarianceSign(vQty, planned);

      // Behaviour held: each field equals its legacy primitive output.
      expect(d.sign).toBe(sign);
      expect(d.signLabel).toBe(VARIANCE_SIGN_LABEL[sign]);
      expect(d.qtyText).toBe(fmtVarianceQty(vQty));
      expect(d.pctText).toBe(fmtVariancePct(vPct));
      expect(d.isOnTarget).toBe(sign === "on_target");
    },
  );

  it("flags on-target correctly within the 2% band", () => {
    const d = describeVariance("1", "1.0", "100"); // 1% ≤ 2% band
    expect(d.isOnTarget).toBe(true);
    expect(d.signLabel).toBe("On target");
  });

  it("marks over/under outside the band", () => {
    expect(describeVariance("135", "67.5", "200").sign).toBe("over");
    expect(describeVariance("-109", "-36.33", "300").sign).toBe("under");
  });

  it("renders an unknown percentage as an em-dash", () => {
    expect(describeVariance("5", null, "100").pctText).toBe("—");
  });
});

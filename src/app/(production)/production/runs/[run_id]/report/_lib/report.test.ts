import { describe, expect, it } from "vitest";

import {
  buildConsumptionDecisions,
  buildReportBody,
  coerceOptionalNumber,
  coerceOptionalText,
  coerceScrap,
  explanationsSatisfied,
  isOutputValid,
  parseQty,
  type BuildReportArgs,
  type ConsumptionPreviewLine,
} from "./report";

const baseArgs: BuildReportArgs = {
  output: "150",
  scrap: "",
  outputUom: "UNIT",
  qcBrix: "",
  qcPh: "",
  qcSampleTaken: false,
  qcNote: "",
  notes: "",
  idempotencyKey: "idem-1",
  eventAt: "2026-07-24T10:00:00.000Z",
};

describe("parseQty", () => {
  it("parses a numeric string", () => {
    expect(parseQty("150")).toBe(150);
    expect(parseQty("12.5")).toBe(12.5);
  });
  it("returns NaN for blank or unparseable input", () => {
    expect(Number.isNaN(parseQty(""))).toBe(true);
    expect(Number.isNaN(parseQty("   "))).toBe(true);
    expect(Number.isNaN(parseQty("abc"))).toBe(true);
  });
});

describe("isOutputValid — the only submit gate", () => {
  it("accepts a positive number", () => {
    expect(isOutputValid("1")).toBe(true);
    expect(isOutputValid("0.25")).toBe(true);
  });
  it("rejects zero, blank, negative, and junk", () => {
    expect(isOutputValid("0")).toBe(false);
    expect(isOutputValid("")).toBe(false);
    expect(isOutputValid("-3")).toBe(false);
    expect(isOutputValid("abc")).toBe(false);
  });
});

describe("coerceOptionalNumber — Brix / pH", () => {
  it("blank → null", () => {
    expect(coerceOptionalNumber("")).toBeNull();
    expect(coerceOptionalNumber("   ")).toBeNull();
  });
  it("unparseable → null", () => {
    expect(coerceOptionalNumber("abc")).toBeNull();
  });
  it("keeps a finite number (including 0)", () => {
    expect(coerceOptionalNumber("12.4")).toBe(12.4);
    expect(coerceOptionalNumber("0")).toBe(0);
  });
});

describe("coerceScrap — optional, defaults to 0", () => {
  it("blank, negative, unparseable → 0", () => {
    expect(coerceScrap("")).toBe(0);
    expect(coerceScrap("-2")).toBe(0);
    expect(coerceScrap("abc")).toBe(0);
  });
  it("keeps a positive number", () => {
    expect(coerceScrap("3")).toBe(3);
  });
});

describe("coerceOptionalText", () => {
  it("empty / whitespace → null", () => {
    expect(coerceOptionalText("")).toBeNull();
    expect(coerceOptionalText("   ")).toBeNull();
  });
  it("trims and keeps content", () => {
    expect(coerceOptionalText("  hello  ")).toBe("hello");
  });
});

describe("buildReportBody", () => {
  it("output-only: scrap 0, every optional field null, sample null", () => {
    const body = buildReportBody(baseArgs);
    expect(body).toEqual({
      idempotency_key: "idem-1",
      event_at: "2026-07-24T10:00:00.000Z",
      output_qty: 150,
      scrap_qty: 0,
      output_uom: "UNIT",
      qc_brix: null,
      qc_ph: null,
      qc_sample_taken: null,
      qc_note: null,
      notes: null,
      // Nothing was flagged on the summary step, so no decision travels back
      // and the backend applies the on-hand cap exactly as before.
      consumption_decisions: [],
    });
  });

  it("carries QC values when filled, and true when the sample toggle is on", () => {
    const body = buildReportBody({
      ...baseArgs,
      scrap: "4",
      qcBrix: "12.5",
      qcPh: "3.4",
      qcSampleTaken: true,
      qcNote: "  cloudy  ",
      notes: "  ran long  ",
    });
    expect(body.scrap_qty).toBe(4);
    expect(body.qc_brix).toBe(12.5);
    expect(body.qc_ph).toBe(3.4);
    expect(body.qc_sample_taken).toBe(true);
    expect(body.qc_note).toBe("cloudy");
    expect(body.notes).toBe("ran long");
  });

  it("omits output_uom when none is supplied", () => {
    const body = buildReportBody({ ...baseArgs, outputUom: null });
    expect("output_uom" in body).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The summary step's gate
// ---------------------------------------------------------------------------

function line(
  overrides: Partial<ConsumptionPreviewLine> = {},
): ConsumptionPreviewLine {
  return {
    component_id: "PKG-BOTTLE-500ML",
    component_name: "Dark Glass Bottle (500ml)",
    source: "pack",
    item_type: "PKG",
    uom: "UNIT",
    picked_qty: null,
    required_qty: "143",
    basis: "RECIPE",
    wanted_qty: "143",
    on_hand_qty: "450",
    on_hand_after_qty: "307",
    capped_qty: "143",
    would_go_negative: false,
    variance_ratio: null,
    needs_explanation: false,
    ...overrides,
  };
}

describe("buildConsumptionDecisions", () => {
  it("sends nothing when the operator touched nothing", () => {
    // An untouched summary must leave behaviour exactly as it was before the
    // step existed — the cap still applies.
    expect(buildConsumptionDecisions([line(), line({ component_id: "RM-TEA" })], {}, {})).toEqual([]);
  });

  it("carries a confirmed below-zero take", () => {
    const l = line({ component_id: "PKG-LABEL", would_go_negative: true });
    const out = buildConsumptionDecisions([l], { "pack:PKG-LABEL": true }, {});
    expect(out).toEqual([
      {
        component_id: "PKG-LABEL",
        source: "pack",
        confirm_negative: true,
        explanation: null,
      },
    ]);
  });

  it("carries an explanation and trims it", () => {
    const l = line({ component_id: "RM-TEA", source: "base", needs_explanation: true });
    const out = buildConsumptionDecisions([l], {}, { "base:RM-TEA": "  double batch  " });
    expect(out[0].explanation).toBe("double batch");
    expect(out[0].confirm_negative).toBe(false);
  });

  it("ignores a whitespace-only explanation", () => {
    const l = line({ component_id: "RM-TEA", source: "base", needs_explanation: true });
    expect(buildConsumptionDecisions([l], {}, { "base:RM-TEA": "   " })).toEqual([]);
  });

  it("keys on source as well as component, so the base and pack sides stay apart", () => {
    const base = line({ component_id: "RM-DUAL", source: "base", would_go_negative: true });
    const pack = line({ component_id: "RM-DUAL", source: "pack", would_go_negative: true });
    const out = buildConsumptionDecisions([base, pack], { "base:RM-DUAL": true }, {});
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("base");
  });
});

describe("explanationsSatisfied", () => {
  it("passes when no line asks for one", () => {
    expect(explanationsSatisfied([line(), line({ component_id: "RM-TEA" })], {})).toBe(true);
  });

  it("blocks while a far-off line is unexplained", () => {
    const l = line({ component_id: "RM-TEA", source: "base", needs_explanation: true });
    expect(explanationsSatisfied([l], {})).toBe(false);
    expect(explanationsSatisfied([l], { "base:RM-TEA": "  " })).toBe(false);
    expect(explanationsSatisfied([l], { "base:RM-TEA": "spillage" })).toBe(true);
  });

  it("never blocks on a below-zero line — that decision has a safe default", () => {
    // Blocking here would strand the operator on the floor; leaving the tick
    // off simply stops the take at zero.
    const l = line({ would_go_negative: true });
    expect(explanationsSatisfied([l], {})).toBe(true);
  });

  it("does not block while the preview is still loading", () => {
    expect(explanationsSatisfied(undefined, {})).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildReportBody,
  coerceOptionalNumber,
  coerceOptionalText,
  coerceScrap,
  isOutputValid,
  parseQty,
  type BuildReportArgs,
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

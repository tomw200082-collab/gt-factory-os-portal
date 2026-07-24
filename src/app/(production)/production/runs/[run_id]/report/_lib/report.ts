// ---------------------------------------------------------------------------
// End-of-run report — pure logic. Payload build, the single "output must be a
// positive number" gate, and the optional-field coercion (empty text → null so
// nothing but output can ever block Denis).
//
// No React, no I/O — the crypto key + timestamp are INJECTED into
// buildReportBody so the module is deterministic and unit-testable. The
// ReportForm owns the input strings in React state and calls these helpers; it
// never re-implements the coercion itself.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Production-run report contract — inlined TS interfaces.
//
// Mirror of api/src/production-runs/schemas.ts (the report mutation). Inlined
// per repo convention (the portal never imports from the backend tree; drift is
// a bug). POST /api/production-runs/[run_id]/report proxies 1:1 to
// /api/v1/mutations/production-runs/:run_id/report. Only output_qty is required;
// every other field is optional and NULL-coerced when the operator leaves it
// blank.
// ---------------------------------------------------------------------------

export interface ReportSubmitBody {
  idempotency_key: string;
  event_at: string;
  output_qty: number;
  scrap_qty: number;
  output_uom?: string;
  qc_brix: number | null;
  qc_ph: number | null;
  qc_sample_taken: boolean | null;
  qc_note: string | null;
  notes: string | null;
}

export interface ReportSuccess {
  run_id: string;
  submission_id: string;
  status: "posted";
  item_id: string;
  output_qty: string | number;
  scrap_qty: string | number;
  output_uom: string;
  run_status: string;
  linked_plan_id: string | null;
  idempotent_replay: boolean;
}

/** 409 conflict body shape (RUN_NOT_REPORTABLE / RUN_ALREADY_REPORTED /
 *  STALE_BOM_VERSION). */
export interface ReportConflict {
  reason_code: string;
  detail?: string;
  offending_field?: string;
}

/** Parse a NUMERIC-as-text input to a finite number, or NaN when the field is
 *  blank or unparseable. */
export function parseQty(text: string): number {
  if (text.trim() === "") return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

/** The ONLY submit gate: output must parse to a number strictly greater than 0.
 *  Everything else is optional and never blocks. */
export function isOutputValid(text: string): boolean {
  const n = parseQty(text);
  return Number.isFinite(n) && n > 0;
}

/** Optional number field (Brix / pH): blank or unparseable → null; else the
 *  finite number. */
export function coerceOptionalNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Scrap: optional, defaults to 0. Blank, unparseable or negative → 0. */
export function coerceScrap(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Optional free-text field: trimmed; empty → null. */
export function coerceOptionalText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

export interface BuildReportArgs {
  output: string;
  scrap: string;
  outputUom?: string | null;
  qcBrix: string;
  qcPh: string;
  qcSampleTaken: boolean;
  qcNote: string;
  notes: string;
  idempotencyKey: string;
  eventAt: string;
}

/** Build the full POST body. Pure: the idempotency key and event timestamp are
 *  supplied by the caller (crypto.randomUUID / new Date at the edge), never
 *  generated here. A sample-taken toggle left OFF stays `null` ("not answered")
 *  rather than `false`, matching the optional-QC contract. */
export function buildReportBody(args: BuildReportArgs): ReportSubmitBody {
  return {
    idempotency_key: args.idempotencyKey,
    event_at: args.eventAt,
    output_qty: parseQty(args.output),
    scrap_qty: coerceScrap(args.scrap),
    ...(args.outputUom ? { output_uom: args.outputUom } : {}),
    qc_brix: coerceOptionalNumber(args.qcBrix),
    qc_ph: coerceOptionalNumber(args.qcPh),
    qc_sample_taken: args.qcSampleTaken ? true : null,
    qc_note: coerceOptionalText(args.qcNote),
    notes: coerceOptionalText(args.notes),
  };
}

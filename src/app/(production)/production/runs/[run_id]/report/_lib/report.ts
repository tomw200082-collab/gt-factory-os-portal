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

/** One reconciled material on the summary step: what was collected, what the
 *  recipe expects for the reported output, and what that does to the balance.
 *  Mirror of ConsumptionPreviewLine in api/src/production-runs/schemas.ts. */
export interface ConsumptionPreviewLine {
  component_id: string;
  component_name: string | null;
  source: "base" | "pack";
  item_type: "RM" | "PKG";
  uom: string;
  /** Net collected. Null = never collected, so the recipe supplied the number. */
  picked_qty: string | null;
  /** Recipe at the reported output. Null = collected but off-recipe. */
  required_qty: string | null;
  basis: "PICKED" | "RECIPE";
  wanted_qty: string;
  on_hand_qty: string;
  on_hand_after_qty: string;
  /** What posts if the operator leaves the on-hand cap in force. */
  capped_qty: string;
  would_go_negative: boolean;
  variance_ratio: string | null;
  needs_explanation: boolean;
}

export interface ConsumptionPreview {
  run_id: string;
  item_id: string | null;
  output_qty: string;
  variance_explanation_factor: number;
  lines: ConsumptionPreviewLine[];
  requires_explanation_count: number;
  would_go_negative_count: number;
}

/** An operator decision carried back with the report, per material. */
export interface ConsumptionDecision {
  component_id: string;
  source: "base" | "pack";
  confirm_negative: boolean;
  explanation: string | null;
}

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
  consumption_decisions: ConsumptionDecision[];
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
  // Components whose net collected quantity exceeded on-hand, so only part of
  // it could come off stock (0297). The backend never blocks on this — it is a
  // signal that the projection is behind reality, and the operator is the only
  // person present who can say so while the memory is fresh.
  shortfalls?: Array<{
    component_id: string;
    component_name: string | null;
    picked_qty: string;
    available_qty: string;
    consumed_qty: string;
    shortfall_qty: string;
  }>;
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
  consumptionDecisions?: ConsumptionDecision[];
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
    consumption_decisions: args.consumptionDecisions ?? [],
  };
}

// ---------------------------------------------------------------------------
// The summary step's gate
// ---------------------------------------------------------------------------

/** Only the lines the operator actually decided something about travel back.
 *  A line nobody touched carries no decision, so the backend applies the
 *  on-hand cap exactly as it did before this step existed. */
export function buildConsumptionDecisions(
  lines: readonly ConsumptionPreviewLine[],
  confirmedNegatives: Readonly<Record<string, boolean>>,
  explanations: Readonly<Record<string, string>>,
): ConsumptionDecision[] {
  const out: ConsumptionDecision[] = [];
  for (const line of lines) {
    const key = `${line.source}:${line.component_id}`;
    const confirmNegative = confirmedNegatives[key] === true;
    const explanation = (explanations[key] ?? "").trim();
    if (!confirmNegative && explanation === "") continue;
    out.push({
      component_id: line.component_id,
      source: line.source,
      confirm_negative: confirmNegative,
      explanation: explanation === "" ? null : explanation,
    });
  }
  return out;
}

/** A factor-of-two gap between what was collected and what the finished
 *  product says was needed is more often a typed digit than a real over-take,
 *  so the run does not close until the operator says which.
 *
 *  Going below zero deliberately does NOT block: it is a real state — units get
 *  made before the packaging for them is booked in — and the untick simply
 *  stops the take at zero. Blocking there would strand the operator on the
 *  floor over a decision that has a safe default. */
export function explanationsSatisfied(
  lines: readonly ConsumptionPreviewLine[] | undefined,
  explanations: Readonly<Record<string, string>>,
): boolean {
  if (!lines) return true;
  return lines.every(
    (l) =>
      !l.needs_explanation ||
      (explanations[`${l.source}:${l.component_id}`] ?? "").trim() !== "",
  );
}

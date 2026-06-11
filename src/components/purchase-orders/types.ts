// ---------------------------------------------------------------------------
// Purchase-order editor — shared types, pure helpers, and validation.
//
// Tranche 027 (procurement-shared-line-editor): extracted verbatim from
// (po)/purchase-orders/new/page.tsx so the planned procurement focus mode can
// reuse the same editor. No behaviour change — the manual-PO form keeps using
// these exactly as before.
//
// Mode semantics:
//   "manual"         — standalone ad-hoc PO (the /new form). manual_reason is
//                      required (>= 5 chars) for traceability.
//   "recommendation" — planning-backed PO (focus mode, wired in T029).
//                      manual_reason is not collected or validated.
// ---------------------------------------------------------------------------

import { UOMS, type Uom } from "@/lib/contracts/enums";

export type PoEditorMode = "manual" | "recommendation";

// --- Master-data row shapes (mirrors of upstream query schemas) ------------

export interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  status: string;
}

export interface ComponentRow {
  component_id: string;
  component_name: string;
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
}

export interface ItemRow {
  item_id: string;
  item_name: string;
  sku: string | null;
  status: string;
  supply_method: string;
  sales_uom: string | null;
}

export type ListEnvelope<T> = { rows: T[]; count: number };

// --- Editor working shapes -------------------------------------------------

export interface OrderableRow {
  kind: "item" | "component";
  id: string;
  label: string;
  meta: string;
  default_uom: Uom;
}

export interface LineDraft {
  // "item:<id>" | "component:<id>"
  orderable_key: string;
  quantity: string;
  uom: Uom;
  // Price Truth (Tranche 043) — optional caller-entered net price per ORDER
  // UOM, kept as string input state like `quantity`. Never required; when
  // blank the backend falls back to the catalog (supplier-item) cost.
  unit_price_net?: string;
}

export interface ValidationErrors {
  supplier_id?: string;
  expected_receive_date?: string;
  manual_reason?: string;
  lines?: string;
  line_items?: Record<
    number,
    {
      orderable_key?: string;
      quantity?: string;
      uom?: string;
      unit_price_net?: string;
    }
  >;
  general?: string;
}

/** The full set of editable values the PoLineEditor renders. */
export interface PoDraft {
  supplierId: string;
  expectedDate: string;
  manualReason: string;
  notes: string;
  lines: LineDraft[];
}

// --- Pure helpers ----------------------------------------------------------

export function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function toUom(raw: string | null | undefined): Uom {
  if (raw && (UOMS as readonly string[]).includes(raw)) return raw as Uom;
  return "UNIT";
}

export function emptyLine(): LineDraft {
  return { orderable_key: "", quantity: "", uom: "UNIT" };
}

// --- Shared client-side validation -----------------------------------------
// Mirrors the original /new validate() exactly; the only mode-dependent rule
// is manual_reason, which is skipped entirely in "recommendation" mode.

export function validatePoDraft(
  draft: PoDraft,
  mode: PoEditorMode,
): ValidationErrors {
  const errs: ValidationErrors = {};
  const lineErrors: Record<
    number,
    {
      orderable_key?: string;
      quantity?: string;
      uom?: string;
      unit_price_net?: string;
    }
  > = {};

  if (!draft.supplierId.trim()) errs.supplier_id = "Required.";
  if (!draft.expectedDate.trim()) errs.expected_receive_date = "Required.";

  if (mode === "manual") {
    if (!draft.manualReason.trim()) {
      errs.manual_reason = "Required.";
    } else if (draft.manualReason.trim().length < 5) {
      errs.manual_reason = "Reason must be at least 5 characters.";
    }
  }

  if (draft.lines.length === 0) {
    errs.lines = "At least one line is required.";
  } else {
    for (let i = 0; i < draft.lines.length; i++) {
      const l = draft.lines[i];
      const le: {
        orderable_key?: string;
        quantity?: string;
        uom?: string;
        unit_price_net?: string;
      } = {};
      if (!l.orderable_key) le.orderable_key = "Required.";
      if (!l.quantity.trim()) {
        le.quantity = "Required.";
      } else {
        const n = Number(l.quantity);
        if (isNaN(n) || n <= 0) le.quantity = "Must be greater than 0.";
      }
      if (!l.uom) le.uom = "Required.";
      // Price Truth (Tranche 043) — the price is OPTIONAL everywhere. Only
      // validate when the operator actually typed something: numeric, >= 0.
      const priceRaw = (l.unit_price_net ?? "").trim();
      if (priceRaw !== "") {
        const p = Number(priceRaw);
        if (isNaN(p) || p < 0) le.unit_price_net = "Must be 0 or more.";
      }
      if (Object.keys(le).length > 0) lineErrors[i] = le;
    }
  }
  if (Object.keys(lineErrors).length > 0) errs.line_items = lineErrors;
  return errs;
}

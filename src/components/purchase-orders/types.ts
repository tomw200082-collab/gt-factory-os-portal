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
  // Tranche 047 (D2) — supplier-level fallback lead time, exposed by the
  // suppliers LIST endpoint. Optional on the wire for forward/backward compat.
  default_lead_time_days?: number | null;
}

// Tranche 047 (D1) — mirror of api/src/supplier-items/schemas.ts SupplierItemRow
// (fields the PO editor consumes; numeric columns arrive as ::text strings).
export interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  component_id: string | null;
  item_id: string | null;
  is_primary: boolean;
  order_uom: string | null;
  inventory_uom: string | null;
  pack_conversion: string;
  lead_time_days: number | null;
  moq: string | null;
  approval_status: string | null;
  std_cost_per_inv_uom: string | null;
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
  // Tranche 047 (D1) — optional pin to a specific supplier_items row, set by
  // the supplier comparison strip. The create API accepts it (Price Truth
  // 0229 pin); the pin must belong to the PO header supplier to resolve.
  supplier_item_id?: string;
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

// --- Tranche 047 (D1/D2) — supplier-item helpers ----------------------------
// approval_status='approved' is the locked contract convention (migration
// 0067/0069); the manual-PO function only resolves approved rows (0229).

export function approvedSupplierItems(
  rows: SupplierItemRow[],
): SupplierItemRow[] {
  return rows.filter((r) => r.approval_status === "approved");
}

/** Catalog cost per ORDER UOM: std_cost_per_inv_uom × pack_conversion.
 *  Returns null when either factor is missing or non-numeric. */
export function costPerOrderUom(si: SupplierItemRow): number | null {
  if (si.std_cost_per_inv_uom == null) return null;
  const cost = Number(si.std_cost_per_inv_uom);
  const pack = Number(si.pack_conversion);
  if (!isFinite(cost) || !isFinite(pack)) return null;
  return cost * pack;
}

/** One approved row per supplier, primary first (mirrors the backend's
 *  `order by is_primary desc` default pick). */
export function dedupeBySupplier(rows: SupplierItemRow[]): SupplierItemRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.supplier_item_id.localeCompare(b.supplier_item_id);
  });
  const seen = new Set<string>();
  const out: SupplierItemRow[] = [];
  for (const r of sorted) {
    if (seen.has(r.supplier_id)) continue;
    seen.add(r.supplier_id);
    out.push(r);
  }
  return out;
}

// --- Tranche 065 (FLOW-N01) — draft summary ---------------------------------
// Pure rollup for the read-only summary card on the manual-PO form. A line
// counts once an orderable is chosen; it contributes to the total only when
// it carries both a positive quantity and a non-negative entered price.
// totalValue is null when no line carries a usable price (the card then
// omits the money figure instead of showing a misleading ₪0.00).

export interface PoDraftSummary {
  lineCount: number;
  pricedLineCount: number;
  totalValue: number | null;
}

export function summarizePoDraft(lines: LineDraft[]): PoDraftSummary {
  let lineCount = 0;
  let pricedLineCount = 0;
  let totalValue = 0;
  for (const l of lines) {
    if (!l.orderable_key) continue;
    lineCount++;
    const qty = Number(l.quantity);
    const priceRaw = (l.unit_price_net ?? "").trim();
    if (priceRaw === "") continue;
    const price = Number(priceRaw);
    if (
      Number.isFinite(qty) &&
      qty > 0 &&
      Number.isFinite(price) &&
      price >= 0
    ) {
      pricedLineCount++;
      totalValue += qty * price;
    }
  }
  return {
    lineCount,
    pricedLineCount,
    totalValue: pricedLineCount > 0 ? totalValue : null,
  };
}

// --- Price/cost accuracy — per-line price insight ---------------------------
// Pure rollup that powers the per-line "Line total" preview and the
// price-variance signal in the editor. Both are derived entirely from values
// already in the line draft plus the resolved catalog cost — no backend call.
//
// Purpose: give the operator immediate cost feedback while typing and catch a
// fat-fingered unit price (e.g. 125 instead of 12.5) BEFORE it becomes PO
// truth and writes back to the supplier-item catalog. Variance is the signed
// fraction (entered − catalog) / catalog, bucketed so normal price movement
// stays quiet and gross errors stand out.

export type PriceVarianceLevel = "none" | "info" | "warn" | "high";

export interface LinePriceInsight {
  /** Parsed entered price, or null when blank / not a valid non-negative number. */
  enteredPrice: number | null;
  /** Price used for the line total: entered when given, else the catalog cost. */
  effectiveUnitPrice: number | null;
  effectiveSource: "entered" | "catalog" | null;
  /** quantity × effectiveUnitPrice, or null when either is missing. */
  lineTotal: number | null;
  /** Signed fraction vs catalog (0.18 = +18%); null when not comparable. */
  variancePct: number | null;
  varianceLevel: PriceVarianceLevel;
}

export function computeLinePriceInsight(
  quantityRaw: string,
  unitPriceRaw: string | undefined,
  catalogCost: number | null,
): LinePriceInsight {
  const qty = Number((quantityRaw ?? "").trim());
  const hasQty = Number.isFinite(qty) && qty > 0;

  const priceStr = (unitPriceRaw ?? "").trim();
  const enteredParsed = priceStr === "" ? NaN : Number(priceStr);
  const enteredPrice =
    Number.isFinite(enteredParsed) && enteredParsed >= 0 ? enteredParsed : null;

  const catalog =
    catalogCost != null && Number.isFinite(catalogCost) && catalogCost >= 0
      ? catalogCost
      : null;

  const effectiveUnitPrice = enteredPrice ?? catalog;
  const effectiveSource: LinePriceInsight["effectiveSource"] =
    enteredPrice != null ? "entered" : catalog != null ? "catalog" : null;

  const lineTotal =
    hasQty && effectiveUnitPrice != null ? qty * effectiveUnitPrice : null;

  let variancePct: number | null = null;
  let varianceLevel: PriceVarianceLevel = "none";
  if (enteredPrice != null && catalog != null && catalog > 0) {
    variancePct = (enteredPrice - catalog) / catalog;
    const abs = Math.abs(variancePct);
    if (abs < 0.05) varianceLevel = "none";
    else if (abs < 0.5) varianceLevel = "info";
    else if (abs < 2) varianceLevel = "warn";
    else varianceLevel = "high";
  }

  return {
    enteredPrice,
    effectiveUnitPrice,
    effectiveSource,
    lineTotal,
    variancePct,
    varianceLevel,
  };
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

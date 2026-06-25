"use client";

// ---------------------------------------------------------------------------
// PoLineEditor — shared, mode-aware purchase-order field + line editor.
//
// Tranche 027 (procurement-shared-line-editor): extracted from
// (po)/purchase-orders/new/page.tsx with zero behaviour change to the manual
// form. The owning page keeps submit / success / error-mapping / RoleGate; this
// component renders the controlled fields and lines and reports changes up.
//
// In "manual" mode it renders the manual-reason section (required upstream); in
// "recommendation" mode that section is hidden (planning-backed PO needs no
// reason). The recommendation mode is consumed by the procurement focus mode in
// Tranche 029 — not used yet by the /new page.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { AlertTriangle, FilePlus2, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/fields/SearchableSelect";
import { cn } from "@/lib/cn";
import {
  approvedSupplierItems,
  computeLinePriceInsight,
  costPerOrderUom,
  dedupeBySupplier,
  type LineDraft,
  type OrderableRow,
  type PoEditorMode,
  type SupplierItemRow,
  type ValidationErrors,
} from "./types";

// Tranche 047 (D1) — small format helpers for the supplier comparison strip.
function fmtIls(n: number): string {
  return `₪${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtQty(raw: string): string {
  const n = Number(raw);
  if (!isFinite(n)) return raw;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Chip caption: "₪12.50 · 7d lead · MOQ 24" — unknown segments omitted. */
function chipDetails(si: SupplierItemRow): string {
  const parts: string[] = [];
  const cost = costPerOrderUom(si);
  if (cost != null) parts.push(fmtIls(cost));
  if (si.lead_time_days != null) parts.push(`${si.lead_time_days}d lead`);
  if (si.moq != null) parts.push(`MOQ ${fmtQty(si.moq)}`);
  return parts.join(" · ");
}

const REQUIRED_LABEL = (
  <span className="ml-0.5 text-danger-fg" aria-hidden>
    *
  </span>
);

export interface PoLineEditorProps {
  mode: PoEditorMode;

  // Controlled values
  supplierId: string;
  expectedDate: string;
  manualReason: string;
  notes: string;
  lines: LineDraft[];

  // Change handlers (owned by the parent page)
  onSupplierChange: (value: string) => void;
  onExpectedDateChange: (value: string) => void;
  onManualReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onAddLine: () => void;
  onRemoveLine: (idx: number) => void;
  onUpdateLine: (idx: number, patch: Partial<LineDraft>) => void;

  errors: ValidationErrors;
  disabled: boolean;

  // Master data (from useOrderables)
  supplierOptions: SearchableSelectOption[];
  orderableOptions: SearchableSelectOption[];
  orderableByKey: Map<string, OrderableRow>;
  suppliersLoading: boolean;
  itemsLoading: boolean;
  componentsLoading: boolean;

  // Tranche 047 (D1) — supplier_items rows per orderable_key (from
  // useSupplierItemsByOrderable). Optional: callers that do not pass it get
  // the pre-047 editor unchanged (no comparison strip / warnings / hints).
  supplierItemsByOrderable?: Map<string, SupplierItemRow[]>;
  // Tranche 047 (D2) — helper text under the expected-date field, e.g.
  // "based on 7-day lead time". Owned by the parent page.
  expectedDateHint?: string | null;
}

export function PoLineEditor(props: PoLineEditorProps): JSX.Element {
  const {
    mode,
    supplierId,
    expectedDate,
    manualReason,
    notes,
    lines,
    onSupplierChange,
    onExpectedDateChange,
    onManualReasonChange,
    onNotesChange,
    onAddLine,
    onRemoveLine,
    onUpdateLine,
    errors,
    disabled,
    supplierOptions,
    orderableOptions,
    orderableByKey,
    suppliersLoading,
    itemsLoading,
    componentsLoading,
    supplierItemsByOrderable,
    expectedDateHint,
  } = props;

  const isManual = mode === "manual";

  // Tranche 047 (D1) — supplier display names for chips + warnings.
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of supplierOptions) m.set(o.value, o.label);
    return m;
  }, [supplierOptions]);

  return (
    <div className="space-y-5">
      {/* Section 1 — Order details */}
      <SectionCard>
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-base font-bold text-fg">Order details</h2>
          <p className="mt-0.5 text-3xs text-fg-faint">
            {isManual
              ? "Who you are ordering from, when you expect it, and why this is a manual order."
              : "Who you are ordering from and when you expect it."}
          </p>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Supplier + Date — two-column on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="po-new-supplier-trigger"
                className="block text-sm font-semibold text-fg"
              >
                Supplier
                {REQUIRED_LABEL}
              </label>
              <SearchableSelect
                value={supplierId}
                onChange={onSupplierChange}
                options={supplierOptions}
                placeholder="— Select supplier —"
                searchPlaceholder="Search by supplier name…"
                emptyMessage="No suppliers match"
                loading={suppliersLoading}
                disabled={disabled}
                invalid={!!errors.supplier_id}
                testId="po-new-supplier"
                ariaLabel="Supplier"
              />
              {errors.supplier_id && (
                <div className="text-xs text-danger-fg">
                  {errors.supplier_id}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="po-new-expected-date"
                className="block text-sm font-semibold text-fg"
              >
                Expected delivery date
                {REQUIRED_LABEL}
              </label>
              <input
                id="po-new-expected-date"
                data-testid="po-new-expected-date"
                type="date"
                value={expectedDate}
                onChange={(e) => onExpectedDateChange(e.target.value)}
                className={cn(
                  "input w-full",
                  errors.expected_receive_date && "border-danger/60",
                )}
                disabled={disabled}
              />
              {errors.expected_receive_date && (
                <div className="text-xs text-danger-fg">
                  {errors.expected_receive_date}
                </div>
              )}
              {!errors.expected_receive_date && expectedDateHint && (
                <p
                  className="text-3xs text-fg-faint"
                  data-testid="po-new-expected-date-hint"
                >
                  {expectedDateHint}
                </p>
              )}
            </div>
          </div>

          {/* Reason — full width, manual mode only */}
          {isManual && (
            <div className="space-y-1">
              <label
                htmlFor="po-new-reason"
                className="block text-sm font-semibold text-fg"
              >
                Reason for manual order
                <span className="ml-1 text-3xs font-normal text-fg-faint">
                  (optional)
                </span>
              </label>
              <textarea
                id="po-new-reason"
                data-testid="po-new-reason"
                value={manualReason}
                onChange={(e) => onManualReasonChange(e.target.value)}
                placeholder="Why is this PO being created without a planning recommendation?"
                rows={3}
                className={cn(
                  "input w-full resize-none",
                  errors.manual_reason && "border-danger/60",
                )}
                disabled={disabled}
              />
              <p className="text-3xs text-fg-faint">
                Optional. If provided, it is recorded on the PO for audit.
              </p>
              {errors.manual_reason && (
                <div className="text-xs text-danger-fg">
                  {errors.manual_reason}
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Section 2 — Order lines */}
      <SectionCard>
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-fg">Order lines</h2>
            <p className="mt-0.5 text-3xs text-fg-faint">
              Items or components to purchase. Quantity is in the unit you pick
              on each line.
            </p>
          </div>
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle tabular-nums">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="px-6 py-4 space-y-3">
          {errors.lines && (
            <div className="text-xs text-danger-fg">{errors.lines}</div>
          )}

          {lines.map((line, idx) => {
            const lineErr = errors.line_items?.[idx];
            const selectedOrderable = orderableByKey.get(line.orderable_key);

            // Tranche 047 (D1) — supplier comparison data for this line.
            // siResolved distinguishes "fetched, no rows" from "loading /
            // failed / feature not wired" so warnings never fire early.
            const siRows = supplierItemsByOrderable?.get(line.orderable_key);
            const siResolved = siRows !== undefined;
            const approved = siRows ? approvedSupplierItems(siRows) : [];
            const supplierChoices = dedupeBySupplier(approved);
            const showStrip = supplierChoices.length > 1;
            const pinnedSi = line.supplier_item_id
              ? (approved.find(
                  (r) => r.supplier_item_id === line.supplier_item_id,
                ) ?? null)
              : null;
            const headerSi = supplierId
              ? (supplierChoices.find((r) => r.supplier_id === supplierId) ??
                null)
              : null;
            const defaultChip =
              supplierChoices.find((r) => r.is_primary) ??
              supplierChoices[0] ??
              null;
            const selectedChip = pinnedSi ?? defaultChip;
            // Drives the price placeholder + MOQ hint: explicit pin wins,
            // then the header supplier's mapping, then the primary supplier.
            const effectiveSi = pinnedSi ?? headerSi ?? defaultChip;
            const effectiveCost = effectiveSi
              ? costPerOrderUom(effectiveSi)
              : null;
            const headerHasNoMapping =
              siResolved &&
              !!supplierId &&
              !approved.some((r) => r.supplier_id === supplierId);

            return (
              <div
                key={idx}
                className={cn(
                  "rounded-md border bg-bg-subtle/30 p-4 space-y-3 transition-colors",
                  lineErr
                    ? "border-danger/40"
                    : "border-border/60 hover:border-border",
                )}
                data-testid={`po-new-line-${idx}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle tabular-nums">
                    Line {idx + 1}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      className="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-muted hover:text-danger-fg transition-colors"
                      aria-label={`Remove line ${idx + 1}`}
                      data-testid={`po-new-line-remove-${idx}`}
                      disabled={disabled}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Remove
                    </button>
                  )}
                </div>

                {/* Item / component picker */}
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-fg">
                    Item or component
                    {REQUIRED_LABEL}
                  </label>
                  <SearchableSelect
                    value={line.orderable_key}
                    onChange={(v) => onUpdateLine(idx, { orderable_key: v })}
                    options={orderableOptions}
                    placeholder="— Select item or component —"
                    searchPlaceholder="Search by name or SKU…"
                    emptyMessage="No items or components match"
                    loading={itemsLoading || componentsLoading}
                    disabled={disabled}
                    invalid={!!lineErr?.orderable_key}
                    testId={`po-new-line-item-${idx}`}
                    ariaLabel={`Line ${idx + 1} item or component`}
                  />
                  {lineErr?.orderable_key && (
                    <div className="text-xs text-danger-fg">
                      {lineErr.orderable_key}
                    </div>
                  )}
                </div>

                {/* Quantity + UoM */}
                <div className="grid grid-cols-[1fr,auto] gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor={`po-new-line-qty-${idx}`}
                      className="block text-sm font-semibold text-fg"
                    >
                      Quantity
                      {REQUIRED_LABEL}
                    </label>
                    <input
                      id={`po-new-line-qty-${idx}`}
                      data-testid={`po-new-line-qty-${idx}`}
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      step="any"
                      value={line.quantity}
                      onChange={(e) =>
                        onUpdateLine(idx, { quantity: e.target.value })
                      }
                      className={cn(
                        "input w-full tabular-nums",
                        lineErr?.quantity && "border-danger/60",
                      )}
                      disabled={disabled}
                    />
                    {lineErr?.quantity && (
                      <div className="text-xs text-danger-fg">
                        {lineErr.quantity}
                      </div>
                    )}
                    {/* Tranche 047 (D1c) — MOQ hint when known. The supplier-
                        items API carries no order-multiple field, so the hint
                        is MOQ-only. */}
                    {!lineErr?.quantity && effectiveSi?.moq != null && (
                      <p
                        className="text-3xs text-fg-faint tabular-nums"
                        data-testid={`po-new-line-moq-${idx}`}
                      >
                        MOQ {fmtQty(effectiveSi.moq)}
                        {effectiveSi.order_uom
                          ? ` ${effectiveSi.order_uom}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`po-new-line-uom-${idx}`}
                      className="block text-sm font-semibold text-fg"
                    >
                      UoM
                      {REQUIRED_LABEL}
                    </label>
                    <select
                      id={`po-new-line-uom-${idx}`}
                      data-testid={`po-new-line-uom-${idx}`}
                      value={line.uom}
                      onChange={(e) =>
                        onUpdateLine(idx, { uom: e.target.value as Uom })
                      }
                      className={cn(
                        "input w-24",
                        lineErr?.uom && "border-danger/60",
                      )}
                      disabled={disabled}
                    >
                      {UOMS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    {lineErr?.uom && (
                      <div className="text-xs text-danger-fg">
                        {lineErr.uom}
                      </div>
                    )}
                  </div>
                </div>

                {/* Unit price — optional (Tranche 043, Price Truth) */}
                <div className="space-y-1">
                  <label
                    htmlFor={`po-new-line-price-${idx}`}
                    className="block text-sm font-semibold text-fg"
                  >
                    Unit price (₪, per order unit)
                    <span className="ml-1 text-3xs font-normal text-fg-faint">
                      (optional)
                    </span>
                  </label>
                  <input
                    id={`po-new-line-price-${idx}`}
                    data-testid={`po-new-line-price-${idx}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={line.unit_price_net ?? ""}
                    onChange={(e) =>
                      onUpdateLine(idx, { unit_price_net: e.target.value })
                    }
                    placeholder={
                      effectiveCost != null
                        ? `Catalog: ${fmtIls(effectiveCost)} per ${effectiveSi?.order_uom ?? "order unit"}`
                        : "Leave blank to use the catalog cost"
                    }
                    className={cn(
                      "input w-full tabular-nums",
                      lineErr?.unit_price_net && "border-danger/60",
                    )}
                    disabled={disabled}
                  />
                  {lineErr?.unit_price_net && (
                    <div className="text-xs text-danger-fg">
                      {lineErr.unit_price_net}
                    </div>
                  )}
                  {/* Price/cost accuracy — live line total + variance vs the
                      catalog cost. Surfaces the resulting spend per line while
                      typing and flags a unit price that is far from the catalog
                      so a typo is caught before it becomes PO truth. */}
                  {(() => {
                    const insight = computeLinePriceInsight(
                      line.quantity,
                      line.unit_price_net,
                      effectiveCost,
                    );
                    if (
                      insight.lineTotal == null &&
                      insight.varianceLevel === "none"
                    ) {
                      return null;
                    }
                    const v = insight.variancePct;
                    const showVariance =
                      v != null && insight.varianceLevel !== "none";
                    const pct = v != null ? Math.round(Math.abs(v) * 100) : 0;
                    const sign = v != null && v >= 0 ? "+" : "−";
                    return (
                      <div
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"
                        data-testid={`po-new-line-price-insight-${idx}`}
                      >
                        {insight.lineTotal != null && (
                          <span className="text-3xs text-fg-muted">
                            Line total{" "}
                            <span className="font-mono tabular-nums font-semibold text-fg">
                              {fmtIls(insight.lineTotal)}
                            </span>
                            {insight.effectiveSource === "catalog" && (
                              <span className="text-fg-faint">
                                {" "}
                                · using catalog cost
                              </span>
                            )}
                          </span>
                        )}
                        {showVariance && effectiveCost != null && (
                          <span
                            data-testid={`po-new-line-price-variance-${idx}`}
                            data-variance-level={insight.varianceLevel}
                            title={
                              insight.varianceLevel === "high"
                                ? `This is far from the catalog cost of ${fmtIls(effectiveCost)} — double-check for a typo.`
                                : `Catalog cost is ${fmtIls(effectiveCost)} per ${effectiveSi?.order_uom ?? "order unit"}.`
                            }
                            className={cn(
                              "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-3xs font-semibold tabular-nums",
                              insight.varianceLevel === "high"
                                ? "border-danger/50 bg-danger/5 text-danger-fg"
                                : insight.varianceLevel === "warn"
                                  ? "border-warning/50 bg-warning/5 text-warning-fg"
                                  : "border-border/70 bg-bg-raised text-fg-muted",
                            )}
                          >
                            {insight.varianceLevel !== "info" && (
                              <AlertTriangle
                                className="h-3 w-3"
                                aria-hidden
                              />
                            )}
                            {sign}
                            {pct}% vs catalog {fmtIls(effectiveCost)}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Tranche 047 (D1b) — header supplier has no approved
                    mapping for this line: warn before the 409 at submit. */}
                {headerHasNoMapping && (
                  <div
                    role="alert"
                    className="flex items-start gap-1.5 rounded-sm border border-warning/50 bg-warning/5 px-2.5 py-1.5 text-xs text-warning-fg"
                    data-testid={`po-new-line-no-mapping-${idx}`}
                  >
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 mt-0.5"
                      aria-hidden
                    />
                    <span>
                      {supplierNameById.get(supplierId) ??
                        "The selected supplier"}{" "}
                      has no mapping for this item — submitting will fail.
                    </span>
                  </div>
                )}

                {/* Tranche 047 (D1a) — compact supplier comparison strip.
                    Renders only when >1 approved supplier supplies the line.
                    Selecting a chip pins the line's supplier_item_id. */}
                {showStrip && (
                  <div
                    className="space-y-1"
                    data-testid={`po-new-line-suppliers-${idx}`}
                  >
                    <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      {supplierChoices.length} approved suppliers
                    </div>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="radiogroup"
                      aria-label={`Line ${idx + 1} supplier comparison`}
                    >
                      {supplierChoices.map((si) => {
                        const selected =
                          selectedChip?.supplier_item_id ===
                          si.supplier_item_id;
                        const details = chipDetails(si);
                        return (
                          <button
                            key={si.supplier_item_id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() =>
                              onUpdateLine(idx, {
                                supplier_item_id: si.supplier_item_id,
                              })
                            }
                            data-testid={`po-new-line-supplier-chip-${idx}-${si.supplier_item_id}`}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs transition-colors",
                              selected
                                ? "border-accent/50 bg-accent-soft font-semibold text-accent"
                                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                            )}
                          >
                            <span>
                              {supplierNameById.get(si.supplier_id) ??
                                si.supplier_id}
                            </span>
                            {details && (
                              <span
                                className={cn(
                                  "font-normal tabular-nums",
                                  selected ? "text-accent/80" : "text-fg-faint",
                                )}
                              >
                                {details}
                              </span>
                            )}
                            {si.is_primary && (
                              <span className="text-[9px] font-semibold uppercase tracking-sops opacity-70">
                                primary
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected item meta strip — quiet helper text */}
                {selectedOrderable && (
                  <div className="text-3xs text-fg-faint font-mono">
                    <span className="uppercase tracking-sops">
                      {selectedOrderable.kind}
                    </span>
                    {" · "}
                    {selectedOrderable.meta}
                    {" · default "}
                    {selectedOrderable.default_uom}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAddLine}
            className="inline-flex min-h-[32px] items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
            data-testid="po-new-add-line"
            disabled={disabled}
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
            Add line
          </button>
        </div>
      </SectionCard>

      {/* Section 3 — Notes (optional) */}
      <SectionCard>
        <div className="px-6 py-5 space-y-1">
          <label
            htmlFor="po-new-notes"
            className="block text-xs font-semibold text-fg"
          >
            Notes
            <span className="ml-1 text-3xs font-normal text-fg-faint">
              (optional)
            </span>
          </label>
          <textarea
            id="po-new-notes"
            data-testid="po-new-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={2}
            placeholder="Anything else the receiving team should know…"
            className="input w-full resize-none"
            disabled={disabled}
          />
        </div>
      </SectionCard>
    </div>
  );
}

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

import { FilePlus2, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/fields/SearchableSelect";
import { cn } from "@/lib/cn";
import type {
  LineDraft,
  OrderableRow,
  PoEditorMode,
  ValidationErrors,
} from "./types";

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
  } = props;

  const isManual = mode === "manual";

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
                {REQUIRED_LABEL}
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
                Minimum 5 characters. This is recorded on the PO for audit.
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
                    placeholder="Leave blank to use the catalog cost"
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
                </div>

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
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
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

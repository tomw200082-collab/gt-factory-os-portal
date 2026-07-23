"use client";

// ---------------------------------------------------------------------------
// AddLineForm — ad-hoc "add a line" inside the session (Tranche 030).
//
// A compact one-line composer built on the SHARED useOrderables hook from
// Tranche 027 (the same searchable item/component source the manual-PO form
// uses), so adding something the plan missed reuses the exact orderable list.
// Emits a session LineAdd; the parent commits it via useEditPo add_lines.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { SearchableSelect } from "@/components/fields/SearchableSelect";
import { useOrderables } from "@/components/purchase-orders/useOrderables";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import { cn } from "@/lib/cn";
import type { LineAdd } from "../../purchase-session/_lib/types";

export interface AddLineFormProps {
  onAdd: (line: LineAdd) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function AddLineForm({
  onAdd,
  onCancel,
  busy = false,
}: AddLineFormProps): JSX.Element {
  const { orderableOptions, orderableByKey, itemsLoading, componentsLoading } =
    useOrderables();

  const [orderableKey, setOrderableKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState<Uom>("UNIT");
  const [touched, setTouched] = useState(false);

  const selected = useMemo(
    () => orderableByKey.get(orderableKey) ?? null,
    [orderableByKey, orderableKey],
  );

  const qtyNum = Number(quantity);
  const qtyValid = quantity.trim() !== "" && Number.isFinite(qtyNum) && qtyNum > 0;
  const orderableValid = orderableKey !== "";

  function pick(value: string): void {
    setOrderableKey(value);
    const row = orderableByKey.get(value);
    if (row) setUom(row.default_uom);
  }

  function submit(): void {
    setTouched(true);
    if (!selected || !qtyValid) return;
    const base =
      selected.kind === "component"
        ? { component_id: selected.id }
        : { item_id: selected.id };
    onAdd({ ...base, final_qty: qtyNum });
    // reset for a possible next add
    setOrderableKey("");
    setQuantity("");
    setUom("UNIT");
    setTouched(false);
  }

  return (
    <div
      className="rounded-lg border border-accent/30 bg-accent-soft/30 p-3 space-y-3"
      data-testid="add-line-form"
    >
      <div className="flex items-center justify-between">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          הוספת שורה
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg transition-colors"
          aria-label="בטל הוספת שורה"
          data-testid="add-line-cancel"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-1">
        <SearchableSelect
          value={orderableKey}
          onChange={pick}
          options={orderableOptions}
          placeholder="— בחרו פריט או רכיב —"
          searchPlaceholder="חיפוש לפי שם או מק״ט…"
          emptyMessage="אין התאמות"
          loading={itemsLoading || componentsLoading}
          disabled={busy}
          invalid={touched && !orderableValid}
          testId="add-line-orderable"
          ariaLabel="פריט או רכיב"
          describedBy={
            touched && !orderableValid ? "add-line-orderable-error" : undefined
          }
        />
        {touched && !orderableValid && (
          <div id="add-line-orderable-error" className="text-xs text-danger-fg">
            יש לבחור פריט או רכיב.
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr,auto] gap-2">
        <div className="space-y-1">
          <input
            type="number"
            inputMode="decimal"
            min="0.0001"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="כמות"
            className={cn(
              "input w-full tabular-nums",
              touched && !qtyValid && "border-danger/60",
            )}
            disabled={busy}
            data-testid="add-line-qty"
            aria-label="כמות"
            aria-invalid={touched && !qtyValid ? true : undefined}
            aria-describedby={touched && !qtyValid ? "add-line-qty-error" : undefined}
          />
          {touched && !qtyValid && (
            <div id="add-line-qty-error" className="text-xs text-danger-fg">
              כמות חייבת להיות גדולה מ-0.
            </div>
          )}
        </div>
        <select
          value={uom}
          onChange={(e) => setUom(e.target.value as Uom)}
          className="input w-24"
          disabled={busy}
          data-testid="add-line-uom"
          aria-label="יחידת מידה"
        >
          {UOMS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="text-3xs text-fg-faint font-mono">
          <span className="tracking-sops">
            {selected.kind === "component" ? "רכיב" : "פריט"}
          </span>
          {" · "}
          {selected.meta}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn btn-sm btn-accent"
          data-testid="add-line-submit"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {busy ? "מוסיף…" : "הוסף שורה"}
        </button>
      </div>
    </div>
  );
}

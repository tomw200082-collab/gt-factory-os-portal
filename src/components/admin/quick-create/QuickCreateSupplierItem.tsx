"use client";

// ---------------------------------------------------------------------------
// <QuickCreateSupplierItem> — AMMC v1 Slice 3.
//
// Minimum-field Quick-Create drawer for a new supplier_items row. Demonstrates
// the drawer-stack pattern: the supplier picker hosts a `+ New supplier` row
// that pushes a nested <QuickCreateSupplier> drawer on top.
//
// Fields:
//   - supplier_id       (EntityPickerPlus, required)
//   - component_id XOR item_id (one or the other, required)
//   - price             (number, >= 0)
//   - lead_time_days    (integer, >= 0)
//   - moq               (number, >= 0)
//   - pack_conversion   (number, > 0)
//   - is_primary        (boolean, default false)
//
// Accepts `options` props rather than fetching its own lists — this keeps
// the Quick-Create self-contained and makes testing trivial. In Slice 4,
// callers (entity detail pages) will pass options already loaded via their
// own TanStack Query hooks.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/overlays/Drawer";
import { EntityPickerPlus, type EntityOption } from "@/components/fields/EntityPickerPlus";
import { QuickCreateSupplier } from "./QuickCreateSupplier";
import { quickCreatePost, QK } from "./shared";

// Polymorphic XOR: exactly one of component_id / item_id must be set.
const QuickCreateSupplierItemSchema = z
  .object({
    supplier_id: z.string().trim().min(1, "supplier_id is required"),
    component_id: z.string().trim().optional(),
    item_id: z.string().trim().optional(),
    price: z.coerce.number().nonnegative("price must be >= 0"),
    lead_time_days: z.coerce
      .number()
      .int("lead_time_days must be an integer")
      .nonnegative("lead_time_days must be >= 0"),
    moq: z.coerce.number().nonnegative("moq must be >= 0"),
    pack_conversion: z.coerce.number().positive("pack_conversion must be > 0"),
    is_primary: z.boolean(),
  })
  .refine(
    (v) =>
      (v.component_id && !v.item_id) || (!v.component_id && v.item_id),
    {
      message: "Exactly one of component_id or item_id must be set",
      path: ["component_id"],
    },
  );

export type QuickCreateSupplierItemValues = z.infer<
  typeof QuickCreateSupplierItemSchema
>;

export interface QuickCreateSupplierItemProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newId: string) => void;
  /** Suppliers dropdown options. Caller is responsible for fetching. */
  suppliers: EntityOption[];
  /** Components dropdown options. */
  components: EntityOption[];
  /** Items dropdown options (for BOUGHT_FINISHED polymorphic supplier_items). */
  items: EntityOption[];
  /** Optional prefill — e.g. opened from a component's detail page. */
  defaultComponentId?: string;
  defaultItemId?: string;
}

export function QuickCreateSupplierItem({
  open,
  onClose,
  onCreated,
  suppliers,
  components,
  items,
  defaultComponentId,
  defaultItemId,
}: QuickCreateSupplierItemProps): JSX.Element {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<
    | { kind: "endpoint_pending" }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  // Nested drawer state — opens on top when the supplier picker fires onCreateNew.
  const [supplierDrawerOpen, setSupplierDrawerOpen] = useState(false);

  // Local suppliers list — augmented when a nested QuickCreateSupplier completes.
  // (Real Slice 4 implementation will rely on TanStack invalidation; this local
  // augment just makes the new row pickable immediately without waiting for the
  // parent list to refetch.)
  const [localSuppliers, setLocalSuppliers] = useState<EntityOption[]>(suppliers);

  // Target-type toggle — component vs item (BOUGHT_FINISHED).
  const [targetType, setTargetType] = useState<"component" | "item">(
    defaultItemId ? "item" : "component",
  );

  const form = useForm<QuickCreateSupplierItemValues>({
    resolver: zodResolver(QuickCreateSupplierItemSchema),
    defaultValues: {
      supplier_id: "",
      component_id: defaultComponentId ?? "",
      item_id: defaultItemId ?? "",
      price: 0,
      lead_time_days: 0,
      moq: 0,
      pack_conversion: 1,
      is_primary: false,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setBanner(null);
    setSubmitting(true);
    // Strip the unused side of the XOR before POSTing.
    const body = {
      supplier_id: values.supplier_id,
      component_id: targetType === "component" ? values.component_id : null,
      item_id: targetType === "item" ? values.item_id : null,
      price: values.price,
      lead_time_days: values.lead_time_days,
      moq: values.moq,
      pack_conversion: values.pack_conversion,
      is_primary: values.is_primary,
    };
    const result = await quickCreatePost<string>({
      url: "/api/supplier-items",
      body,
      idField: "supplier_item_id",
    });
    setSubmitting(false);

    if (result.kind === "ok") {
      await queryClient.invalidateQueries({ queryKey: QK.supplierItems });
      form.reset();
      onCreated(result.id);
      onClose();
      return;
    }
    if (result.kind === "endpoint_pending") {
      setBanner({ kind: "endpoint_pending" });
      return;
    }
    setBanner({ kind: "error", message: result.message });
  });

  return (
    <>
      <Drawer
        open={open}
        onClose={() => {
          if (!submitting) onClose();
        }}
        title="New supplier-item"
        description="Link a supplier to a component or a BOUGHT_FINISHED item, with commercial data."
        width="lg"
      >
        {banner?.kind === "endpoint_pending" ? (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning-softer p-3 text-xs text-warning-fg">
            Server endpoint not yet available.
          </div>
        ) : null}
        {banner?.kind === "error" ? (
          <div className="mb-4 rounded-md border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {banner.message}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              supplier_id
            </span>
            <Controller
              control={form.control}
              name="supplier_id"
              render={({ field, fieldState }) => (
                <EntityPickerPlus
                  value={field.value}
                  onChange={(opt) => field.onChange(opt?.id ?? "")}
                  options={localSuppliers}
                  placeholder="Pick a supplier"
                  entityName="supplier"
                  onCreateNew={() => setSupplierDrawerOpen(true)}
                  errored={!!fieldState.error}
                />
              )}
            />
            {form.formState.errors.supplier_id ? (
              <span className="mt-1 block text-xs text-danger-fg">
                {form.formState.errors.supplier_id.message}
              </span>
            ) : null}
          </div>

          <div>
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              target type
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={
                  targetType === "component"
                    ? "btn-primary"
                    : "btn btn-ghost"
                }
                onClick={() => {
                  setTargetType("component");
                  form.setValue("item_id", "");
                }}
              >
                Component
              </button>
              <button
                type="button"
                className={targetType === "item" ? "btn-primary" : "btn btn-ghost"}
                onClick={() => {
                  setTargetType("item");
                  form.setValue("component_id", "");
                }}
              >
                Item (BOUGHT_FINISHED)
              </button>
            </div>
          </div>

          {targetType === "component" ? (
            <div>
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                component_id
              </span>
              <Controller
                control={form.control}
                name="component_id"
                render={({ field, fieldState }) => (
                  <EntityPickerPlus
                    value={field.value ?? ""}
                    onChange={(opt) => field.onChange(opt?.id ?? "")}
                    options={components}
                    placeholder="Pick a component"
                    errored={!!fieldState.error}
                  />
                )}
              />
              {form.formState.errors.component_id ? (
                <span className="mt-1 block text-xs text-danger-fg">
                  {form.formState.errors.component_id.message}
                </span>
              ) : null}
            </div>
          ) : (
            <div>
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                item_id
              </span>
              <Controller
                control={form.control}
                name="item_id"
                render={({ field, fieldState }) => (
                  <EntityPickerPlus
                    value={field.value ?? ""}
                    onChange={(opt) => field.onChange(opt?.id ?? "")}
                    options={items}
                    placeholder="Pick a BOUGHT_FINISHED item"
                    errored={!!fieldState.error}
                  />
                )}
              />
              {form.formState.errors.item_id ? (
                <span className="mt-1 block text-xs text-danger-fg">
                  {form.formState.errors.item_id.message}
                </span>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                price
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input"
                {...form.register("price")}
              />
              {form.formState.errors.price ? (
                <span className="mt-1 block text-xs text-danger-fg">
                  {form.formState.errors.price.message}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                lead_time_days
              </span>
              <input
                type="number"
                step="1"
                min="0"
                className="input"
                {...form.register("lead_time_days")}
              />
              {form.formState.errors.lead_time_days ? (
                <span className="mt-1 block text-xs text-danger-fg">
                  {form.formState.errors.lead_time_days.message}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                moq
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input"
                {...form.register("moq")}
              />
              {form.formState.errors.moq ? (
                <span className="mt-1 block text-xs text-danger-fg">
                  {form.formState.errors.moq.message}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                pack_conversion
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input"
                {...form.register("pack_conversion")}
              />
              {form.formState.errors.pack_conversion ? (
                <span className="mt-1 block text-xs text-danger-fg">
                  {form.formState.errors.pack_conversion.message}
                </span>
              ) : null}
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("is_primary")} />
            <span>Mark as primary supplier for this target</span>
          </label>

          <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save & select"}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Nested Quick-Create drawer — opens on top of this one via stack context. */}
      <QuickCreateSupplier
        open={supplierDrawerOpen}
        onClose={() => setSupplierDrawerOpen(false)}
        onCreated={(newId) => {
          // Locally augment the suppliers list so the new row is pickable
          // immediately, and auto-select it.
          setLocalSuppliers((prev) =>
            prev.some((s) => s.id === newId)
              ? prev
              : [...prev, { id: newId, label: newId, sublabel: "new" }],
          );
          form.setValue("supplier_id", newId, {
            shouldValidate: true,
            shouldDirty: true,
          });
        }}
      />
    </>
  );
}

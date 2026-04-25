"use client";

// ---------------------------------------------------------------------------
// <QuickCreateSupplierItem> — AMMC v1 Slice 3 / corridor 7 label hardening.
// Fields use product-first labels (not DB column names).
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
    supplier_id: z.string().trim().min(1, "Supplier is required"),
    component_id: z.string().trim().optional(),
    item_id: z.string().trim().optional(),
    price: z.coerce.number().nonnegative("Unit price must be 0 or more"),
    lead_time_days: z.coerce
      .number()
      .int("Lead time must be a whole number of days")
      .nonnegative("Lead time must be 0 or more"),
    moq: z.coerce.number().nonnegative("Min. order quantity must be 0 or more"),
    pack_conversion: z.coerce.number().positive("Pack conversion must be greater than 0"),
    is_primary: z.boolean(),
  })
  .refine(
    (v) =>
      (v.component_id && !v.item_id) || (!v.component_id && v.item_id),
    {
      message: "Select either a raw material or a purchased product",
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
  /** Optional prefill — e.g. opened from a supplier's detail page. */
  defaultSupplierId?: string;
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
  defaultSupplierId,
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
  const [localSuppliers, setLocalSuppliers] = useState<EntityOption[]>(suppliers);

  // Target-type toggle — component vs item (BOUGHT_FINISHED).
  const [targetType, setTargetType] = useState<"component" | "item">(
    defaultItemId ? "item" : "component",
  );

  const form = useForm<QuickCreateSupplierItemValues>({
    resolver: zodResolver(QuickCreateSupplierItemSchema),
    defaultValues: {
      supplier_id: defaultSupplierId ?? "",
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
        title="Add sourcing link"
        description="Connect a supplier to a raw material or purchased product, and enter the commercial terms."
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
              Supplier
            </span>
            <Controller
              control={form.control}
              name="supplier_id"
              render={({ field, fieldState }) => (
                <EntityPickerPlus
                  value={field.value}
                  onChange={(opt) => field.onChange(opt?.id ?? "")}
                  options={localSuppliers}
                  placeholder="Search suppliers…"
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
              What does this supplier provide?
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
                Raw material / packaging
              </button>
              <button
                type="button"
                className={targetType === "item" ? "btn-primary" : "btn btn-ghost"}
                onClick={() => {
                  setTargetType("item");
                  form.setValue("component_id", "");
                }}
              >
                Purchased finished product
              </button>
            </div>
          </div>

          {targetType === "component" ? (
            <div>
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Raw material / component
              </span>
              <Controller
                control={form.control}
                name="component_id"
                render={({ field, fieldState }) => (
                  <EntityPickerPlus
                    value={field.value ?? ""}
                    onChange={(opt) => field.onChange(opt?.id ?? "")}
                    options={components}
                    placeholder="Search raw materials…"
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
                Product (purchased finished)
              </span>
              <Controller
                control={form.control}
                name="item_id"
                render={({ field, fieldState }) => (
                  <EntityPickerPlus
                    value={field.value ?? ""}
                    onChange={(opt) => field.onChange(opt?.id ?? "")}
                    options={items}
                    placeholder="Search products…"
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
                Unit price (ILS)
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input"
                placeholder="0.00"
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
                Lead time (days)
              </span>
              <input
                type="number"
                step="1"
                min="0"
                className="input"
                placeholder="0"
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
                Min. order quantity
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input"
                placeholder="0"
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
                Pack conversion
              </span>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                className="input"
                placeholder="1"
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
            <span>Set as primary supplier for this item</span>
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
              {submitting ? "Saving…" : "Save sourcing link"}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Nested Quick-Create drawer — opens on top of this one via stack context. */}
      <QuickCreateSupplier
        open={supplierDrawerOpen}
        onClose={() => setSupplierDrawerOpen(false)}
        onCreated={(newId) => {
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

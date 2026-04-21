"use client";

// ---------------------------------------------------------------------------
// <QuickCreateComponent> — AMMC v1 Slice 3.
//
// Minimum-field Quick-Create drawer for a new components row. Fields:
//   - component_id    (text, required)
//   - component_name  (text, required)
//   - component_class (text, required — free-text in v1; enum constraint is
//                      a Slice 2 backend concern)
//   - inventory_uom   (text, required)
//
// Posts to /api/components (Slice 4 will wire the proxy).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/overlays/Drawer";
import { quickCreatePost, QK } from "./shared";

const QuickCreateComponentSchema = z.object({
  component_id: z
    .string()
    .trim()
    .min(1, "component_id is required")
    .max(64, "component_id too long"),
  component_name: z
    .string()
    .trim()
    .min(1, "component_name is required")
    .max(256, "component_name too long"),
  component_class: z
    .string()
    .trim()
    .min(1, "component_class is required")
    .max(64, "component_class too long"),
  inventory_uom: z
    .string()
    .trim()
    .min(1, "inventory_uom is required")
    .max(32, "inventory_uom too long"),
});

export type QuickCreateComponentValues = z.infer<
  typeof QuickCreateComponentSchema
>;

export interface QuickCreateComponentProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newId: string) => void;
}

export function QuickCreateComponent({
  open,
  onClose,
  onCreated,
}: QuickCreateComponentProps): JSX.Element {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<
    | { kind: "endpoint_pending" }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<QuickCreateComponentValues>({
    resolver: zodResolver(QuickCreateComponentSchema),
    defaultValues: {
      component_id: "",
      component_name: "",
      component_class: "",
      inventory_uom: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setBanner(null);
    setSubmitting(true);
    const result = await quickCreatePost<string>({
      url: "/api/components",
      body: values,
      idField: "component_id",
    });
    setSubmitting(false);

    if (result.kind === "ok") {
      await queryClient.invalidateQueries({ queryKey: QK.components });
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
    <Drawer
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="New component"
      description="Minimum fields to create a components row. Supplier mapping + BOM linkage are separate flows."
      width="md"
    >
      {banner?.kind === "endpoint_pending" ? (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning-softer p-3 text-xs text-warning-fg">
          Server endpoint not yet available — Slice 4 pending.
        </div>
      ) : null}
      {banner?.kind === "error" ? (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
          {banner.message}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            component_id
          </span>
          <input
            className="input"
            placeholder="e.g. RM-SUGAR"
            {...form.register("component_id")}
          />
          {form.formState.errors.component_id ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.component_id.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            component_name
          </span>
          <input
            className="input"
            placeholder="Display name"
            {...form.register("component_name")}
          />
          {form.formState.errors.component_name ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.component_name.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            component_class
          </span>
          <input
            className="input"
            placeholder="e.g. RAW_MATERIAL / PACKAGING"
            {...form.register("component_class")}
          />
          {form.formState.errors.component_class ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.component_class.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            inventory_uom
          </span>
          <input
            className="input"
            placeholder="e.g. KG / L / UNIT"
            {...form.register("inventory_uom")}
          />
          {form.formState.errors.inventory_uom ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.inventory_uom.message}
            </span>
          ) : null}
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
  );
}

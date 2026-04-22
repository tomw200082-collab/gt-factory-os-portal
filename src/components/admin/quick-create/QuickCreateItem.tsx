"use client";

// ---------------------------------------------------------------------------
// <QuickCreateItem> — AMMC v1 Slice 3.
//
// Minimum-field Quick-Create drawer for a new items row. Fields:
//   - item_id         (text, required, uppercase/slug-ish)
//   - item_name       (text, required)
//   - supply_method   (enum: MANUFACTURED | BOUGHT_FINISHED | REPACK)
//   - sales_uom       (text, required, short)
//
// Posts to /api/items (Slice 4 will wire the proxy; until then we render a
// graceful "endpoint pending" banner instead of crashing).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/overlays/Drawer";
import { quickCreatePost, QK } from "./shared";

const SUPPLY_METHODS = ["MANUFACTURED", "BOUGHT_FINISHED", "REPACK"] as const;

const QuickCreateItemSchema = z.object({
  item_id: z
    .string()
    .trim()
    .min(1, "item_id is required")
    .max(64, "item_id must be 64 chars or fewer"),
  item_name: z
    .string()
    .trim()
    .min(1, "item_name is required")
    .max(256, "item_name must be 256 chars or fewer"),
  supply_method: z.enum(SUPPLY_METHODS),
  sales_uom: z
    .string()
    .trim()
    .min(1, "sales_uom is required")
    .max(32, "sales_uom too long"),
});

export type QuickCreateItemValues = z.infer<typeof QuickCreateItemSchema>;

export interface QuickCreateItemProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newId: string) => void;
  /** Optional default supply_method (e.g. BOUGHT_FINISHED for FG flow). */
  defaultSupplyMethod?: (typeof SUPPLY_METHODS)[number];
}

export function QuickCreateItem({
  open,
  onClose,
  onCreated,
  defaultSupplyMethod,
}: QuickCreateItemProps): JSX.Element {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<
    | { kind: "endpoint_pending" }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<QuickCreateItemValues>({
    resolver: zodResolver(QuickCreateItemSchema),
    defaultValues: {
      item_id: "",
      item_name: "",
      supply_method: defaultSupplyMethod ?? "MANUFACTURED",
      sales_uom: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setBanner(null);
    setSubmitting(true);
    const result = await quickCreatePost<string>({
      url: "/api/items",
      body: values,
      idField: "item_id",
    });
    setSubmitting(false);

    if (result.kind === "ok") {
      await queryClient.invalidateQueries({ queryKey: QK.items });
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
      title="New item"
      description="Minimum fields to create a new items row. Extended fields can be edited afterwards from /admin/items."
      width="md"
    >
      {banner?.kind === "endpoint_pending" ? (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning-softer p-3 text-xs text-warning-fg">
          Server endpoint not yet available. The form validates client-side
          but the POST cannot land until the proxy route is wired.
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
            item_id
          </span>
          <input
            className="input"
            placeholder="e.g. GT-LUI-LOW-1L"
            {...form.register("item_id")}
          />
          {form.formState.errors.item_id ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.item_id.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            item_name
          </span>
          <input
            className="input"
            placeholder="Display name"
            {...form.register("item_name")}
          />
          {form.formState.errors.item_name ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.item_name.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            supply_method
          </span>
          <select className="input" {...form.register("supply_method")}>
            {SUPPLY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            sales_uom
          </span>
          <input
            className="input"
            placeholder="e.g. BOTTLE"
            {...form.register("sales_uom")}
          />
          {form.formState.errors.sales_uom ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.sales_uom.message}
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

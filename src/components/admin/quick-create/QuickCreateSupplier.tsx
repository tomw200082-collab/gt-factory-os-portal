"use client";

// ---------------------------------------------------------------------------
// <QuickCreateSupplier> — AMMC v1 Slice 3.
//
// Minimum-field Quick-Create drawer for a new suppliers row. Fields:
//   - supplier_id              (text, required)
//   - supplier_name_official   (text, required)
//   - status                   (enum: ACTIVE | INACTIVE, default ACTIVE)
//
// Posts to /api/suppliers (Slice 4 will wire the proxy).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/overlays/Drawer";
import { quickCreatePost, QK } from "./shared";

const SUPPLIER_STATUS = ["ACTIVE", "INACTIVE"] as const;

const QuickCreateSupplierSchema = z.object({
  supplier_id: z
    .string()
    .trim()
    .min(1, "supplier_id is required")
    .max(64, "supplier_id too long"),
  supplier_name_official: z
    .string()
    .trim()
    .min(1, "supplier_name_official is required")
    .max(256, "supplier_name_official too long"),
  status: z.enum(SUPPLIER_STATUS),
});

export type QuickCreateSupplierValues = z.infer<
  typeof QuickCreateSupplierSchema
>;

export interface QuickCreateSupplierProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newId: string) => void;
}

export function QuickCreateSupplier({
  open,
  onClose,
  onCreated,
}: QuickCreateSupplierProps): JSX.Element {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<
    | { kind: "endpoint_pending" }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<QuickCreateSupplierValues>({
    resolver: zodResolver(QuickCreateSupplierSchema),
    defaultValues: {
      supplier_id: "",
      supplier_name_official: "",
      status: "ACTIVE",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setBanner(null);
    setSubmitting(true);
    const result = await quickCreatePost<string>({
      url: "/api/suppliers",
      body: values,
      idField: "supplier_id",
    });
    setSubmitting(false);

    if (result.kind === "ok") {
      await queryClient.invalidateQueries({ queryKey: QK.suppliers });
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
      title="New supplier"
      description="Minimum fields to create a suppliers row. Contacts + payment terms can be filled in afterwards."
      width="md"
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
        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            supplier_id
          </span>
          <input
            className="input"
            placeholder="e.g. SUP-ACME"
            {...form.register("supplier_id")}
          />
          {form.formState.errors.supplier_id ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.supplier_id.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            supplier_name_official
          </span>
          <input
            className="input"
            placeholder="Legal / official name"
            {...form.register("supplier_name_official")}
          />
          {form.formState.errors.supplier_name_official ? (
            <span className="mt-1 block text-xs text-danger-fg">
              {form.formState.errors.supplier_name_official.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            status
          </span>
          <select className="input" {...form.register("status")}>
            {SUPPLIER_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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

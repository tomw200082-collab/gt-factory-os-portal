// BomLineAddDrawer — minimal modal that POSTs a new line to the DRAFT
// version. Body shape per
// src/app/api/boms/versions/[version_id]/lines/route.ts:
//   { final_component_id, final_component_qty, idempotency_key }

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface BomLineAddDrawerProps {
  versionId: string;
  open: boolean;
  onClose: () => void;
}

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function BomLineAddDrawer({
  versionId,
  open,
  onClose,
}: BomLineAddDrawerProps): JSX.Element | null {
  const qc = useQueryClient();
  const [componentId, setComponentId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);

  const post = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/lines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_component_id: componentId,
            final_component_qty: qty,
            idempotency_key: randomKey(),
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Add failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
        );
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] });
      setComponentId("");
      setQty("");
      setError(null);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Add component"
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4"
    >
      <form
        className="w-full max-w-md rounded-md border border-border bg-bg-raised p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          post.mutate();
        }}
      >
        <h2 className="mb-1 text-base font-semibold text-fg-strong">
          Add component
        </h2>
        <p className="mb-4 text-xs text-fg-muted">
          Add a new line to this DRAFT version. The line will be created
          with the quantity you provide.
        </p>
        <label className="mb-3 block text-sm">
          <span className="text-fg-strong">Component ID</span>
          <input
            name="component_id"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            className="mt-1 block w-full rounded-sm border border-border bg-bg px-2.5 py-1.5 font-mono text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent-ring"
            placeholder="e.g. RM-LEMON-01"
          />
        </label>
        <label className="mb-3 block text-sm">
          <span className="text-fg-strong">Quantity (per batch)</span>
          <input
            name="qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="mt-1 block w-full rounded-sm border border-border bg-bg px-2.5 py-1.5 font-mono tabular-nums text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent-ring"
            placeholder="0.000"
          />
        </label>
        {error && (
          <div className="mb-3 rounded-sm border border-danger-border bg-danger-soft p-2 text-xs text-danger-fg">
            {error}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={post.isPending || !componentId || !qty}
            className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {post.isPending ? "Adding…" : "Add component"}
          </button>
        </div>
      </form>
    </div>
  );
}

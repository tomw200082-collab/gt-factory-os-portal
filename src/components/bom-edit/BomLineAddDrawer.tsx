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
      if (!res.ok) throw new Error(`post: ${res.status}`);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        className="rounded-md bg-white p-4 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          post.mutate();
        }}
      >
        <h2 className="mb-2 font-semibold">הוספת רכיב</h2>
        <label className="mb-2 block">
          Component
          <input
            name="component_id"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            className="mt-1 block w-full rounded border px-2 py-1"
          />
        </label>
        <label className="mb-2 block">
          Qty
          <input
            name="qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="mt-1 block w-full rounded border px-2 py-1"
          />
        </label>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-3 py-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-white"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

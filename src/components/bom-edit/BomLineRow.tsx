// BomLineRow — one row in the lines table. Display + qty edit + delete.
// Pip is computed from the same pure function as the Recipe-Health card.

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import type {
  ComponentReadiness,
  LinePipState,
} from "@/lib/admin/recipe-readiness.types";
import { computeLinePipState } from "@/lib/admin/recipe-readiness";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";

interface BomLineRowProps {
  line: BomLineDataRow;
  versionId: string;
  readiness: ComponentReadiness | null;
  editable: boolean;
  /** Optional: opens the QuickFixDrawer for this line (Chunk 5). */
  onOpenQuickFix?: (componentId: string) => void;
}

const PIP_CLASS: Record<LinePipState["color"], string> = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
};

export function BomLineRow({
  line,
  versionId,
  readiness,
  editable,
  onOpenQuickFix,
}: BomLineRowProps): JSX.Element {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pip: LinePipState = readiness
    ? computeLinePipState({
        qty: line.qty,
        component: readiness,
        nowMs: Date.now(),
      })
    : {
        color: "yellow",
        reasons: ["טוען…"],
        warningCategories: ["missing-supplier"],
        blockerCategories: [],
        isHardBlock: false,
      };

  const patch = useMutation({
    mutationFn: async (qty: string) =>
      patchEntity({
        url: `/api/boms/versions/${encodeURIComponent(versionId)}/lines/${encodeURIComponent(line.bom_line_id)}`,
        fields: { final_component_qty: qty },
        ifMatchUpdatedAt: line.updated_at,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] });
      setEditing(false);
      setError(null);
    },
    onError: (e: Error) => {
      if (e instanceof AdminMutationError && e.code === "STALE_ROW") {
        setError("STALE_ROW — רענן את הדף ונסה שוב");
      } else {
        setError(e.message);
      }
    },
  });

  function randomKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/lines/${encodeURIComponent(line.bom_line_id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotency_key: randomKey() }),
        },
      );
      if (!res.ok) throw new Error(`delete: ${res.status}`);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] }),
  });

  return (
    <tr data-testid={`bom-line-row-${line.bom_line_id}`}>
      <td className="px-2 py-1">
        {readiness?.component_name ?? line.component_id}
      </td>
      <td className="px-2 py-1">
        {editable ? (
          editing ? (
            <input
              role="textbox"
              defaultValue={line.qty}
              onBlur={(e) => patch.mutate(e.currentTarget.value)}
              autoFocus
              className="rounded border px-1"
              inputMode="decimal"
            />
          ) : (
            <button
              type="button"
              aria-label={`qty-edit-${line.bom_line_id}`}
              onClick={() => setEditing(true)}
              className="rounded px-1 hover:bg-gray-100"
            >
              {line.qty}
            </button>
          )
        ) : (
          <span>{line.qty}</span>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
      <td className="px-2 py-1 text-gray-500">—</td>
      <td className="px-2 py-1">
        <span
          aria-label={`readiness-pip-${pip.color}`}
          className={PIP_CLASS[pip.color]}
        >
          {pip.color === "green" ? "🟢" : pip.color === "yellow" ? "🟡" : "🔴"}
        </span>
        {pip.reasons.length > 0 && (
          <span className="ml-1 text-xs text-gray-600">
            {pip.reasons.join(", ")}
          </span>
        )}
        {editable &&
          pip.color !== "green" &&
          onOpenQuickFix &&
          readiness && (
            <button
              type="button"
              onClick={() => onOpenQuickFix(readiness.component_id)}
              className="ml-2 rounded border px-2 py-0.5 text-xs"
            >
              Fix
            </button>
          )}
      </td>
      <td className="px-2 py-1">
        {editable && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded border px-2 py-0.5 text-xs"
          >
            🗑 Delete
          </button>
        )}
        {editable && confirmDelete && (
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => del.mutate()}
              className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded border px-2 py-0.5 text-xs"
            >
              Cancel
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

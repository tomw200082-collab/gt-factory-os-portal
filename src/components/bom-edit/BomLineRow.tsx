// BomLineRow — one row in the lines table. Display + qty edit + delete.
// Pip is computed from the same pure function as the Recipe-Health card.

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
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
  /** Optional: opens the QuickFixDrawer for this line. */
  onOpenQuickFix?: (componentId: string) => void;
}

const PIP_TONE: Record<
  LinePipState["color"],
  { dot: string; chip: string; label: string }
> = {
  green: {
    dot: "bg-success",
    chip: "bg-success-soft text-success-fg",
    label: "Ready",
  },
  yellow: {
    dot: "bg-warning",
    chip: "bg-warning-soft text-warning-fg",
    label: "Warning",
  },
  red: {
    dot: "bg-danger",
    chip: "bg-danger-soft text-danger-fg",
    label: "Blocked",
  },
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
        qty: line.final_component_qty,
        component: readiness,
        nowMs: Date.now(),
      })
    : {
        color: "yellow",
        reasons: ["Loading…"],
        warningCategories: ["missing-supplier"],
        blockerCategories: [],
        isHardBlock: false,
      };
  const tone = PIP_TONE[pip.color];

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
        setError("Row was updated by another user — refresh the page");
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
      if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] }),
  });

  const componentDisplay =
    readiness?.component_name ??
    line.final_component_name ??
    line.final_component_id;

  return (
    <tr
      data-testid={`bom-line-row-${line.bom_line_id}`}
      className="border-b border-border last:border-b-0 hover:bg-bg-subtle/40"
    >
      <td className="px-4 py-2.5">
        <div className="text-sm font-medium text-fg">{componentDisplay}</div>
        <div className="font-mono text-3xs text-fg-subtle">
          {line.final_component_id}
        </div>
      </td>
      <td className="px-2 py-2.5">
        {editable ? (
          editing ? (
            <input
              role="textbox"
              defaultValue={line.final_component_qty}
              onBlur={(e) => patch.mutate(e.currentTarget.value)}
              autoFocus
              className="w-24 rounded-sm border border-accent bg-bg-raised px-2 py-1 text-sm font-mono tabular-nums text-fg shadow-sm focus:outline-none focus:ring-1 focus:ring-accent-ring"
              inputMode="decimal"
            />
          ) : (
            <button
              type="button"
              aria-label={`qty-edit-${line.bom_line_id}`}
              onClick={() => setEditing(true)}
              className="group inline-flex items-center gap-1.5 rounded-sm border border-dashed border-accent/40 px-1.5 py-0.5 font-mono tabular-nums text-sm text-fg hover:border-accent hover:bg-accent-softer"
            >
              {line.final_component_qty}
              <Pencil
                className="h-3 w-3 text-accent/60 group-hover:text-accent"
                strokeWidth={2}
              />
            </button>
          )
        ) : (
          <span className="font-mono tabular-nums text-sm text-fg">
            {line.final_component_qty}
          </span>
        )}
        {error && (
          <div className="mt-1 text-3xs text-danger-fg">{error}</div>
        )}
      </td>
      <td className="px-2 py-2.5 text-xs text-fg-muted">
        {line.component_uom ?? "—"}
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-label={`readiness-pip-${pip.color}`}
            className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-3xs font-semibold uppercase tracking-sops ${tone.chip}`}
            title={pip.reasons.join(" · ")}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
            />
            {tone.label}
          </span>
          {pip.reasons.length > 0 && (
            <span className="truncate text-3xs text-fg-muted">
              {pip.reasons[0]}
            </span>
          )}
          {editable &&
            pip.color !== "green" &&
            onOpenQuickFix &&
            readiness && (
              <button
                type="button"
                onClick={() => onOpenQuickFix(readiness.component_id)}
                className="ml-auto rounded-sm border border-border bg-bg-raised px-2 py-0.5 text-3xs font-medium text-fg hover:border-accent hover:bg-accent-softer hover:text-accent"
              >
                Fix
              </button>
            )}
        </div>
      </td>
      <td className="px-2 py-2.5 text-right">
        {editable && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`delete-${line.bom_line_id}`}
            className="rounded-sm p-1 text-fg-muted hover:bg-danger-soft hover:text-danger-fg"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
        {editable && confirmDelete && (
          <span className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => del.mutate()}
              className="rounded-sm bg-danger px-2 py-0.5 text-3xs font-medium text-danger-soft hover:bg-danger/90"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-sm border border-border bg-bg-raised px-2 py-0.5 text-3xs text-fg hover:bg-bg-subtle"
            >
              Cancel
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

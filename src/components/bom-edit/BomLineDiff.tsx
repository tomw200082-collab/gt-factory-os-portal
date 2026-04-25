// BomLineDiff — "Changes from v{active}" collapsible. Pure client-side
// classification of added / removed / qty-changed lines.

"use client";

import { useState } from "react";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";

interface ChangedLine {
  component_id: string;
  oldQty: string;
  newQty: string;
}

export interface DiffResult {
  added: BomLineDataRow[];
  removed: BomLineDataRow[];
  changed: ChangedLine[];
}

export function computeBomDiff(
  draft: BomLineDataRow[],
  active: BomLineDataRow[],
): DiffResult {
  const draftByComp = new Map(draft.map((l) => [l.final_component_id, l]));
  const activeByComp = new Map(active.map((l) => [l.final_component_id, l]));
  const added: BomLineDataRow[] = [];
  const removed: BomLineDataRow[] = [];
  const changed: ChangedLine[] = [];
  for (const [c, d] of draftByComp) {
    const a = activeByComp.get(c);
    if (!a) added.push(d);
    else if (a.final_component_qty !== d.final_component_qty)
      changed.push({
        component_id: c,
        oldQty: a.final_component_qty,
        newQty: d.final_component_qty,
      });
  }
  for (const [c, a] of activeByComp) {
    if (!draftByComp.has(c)) removed.push(a);
  }
  return { added, removed, changed };
}

interface BomLineDiffProps {
  draftLines: BomLineDataRow[];
  activeLines: BomLineDataRow[];
  activeVersionLabel: string | null;
}

export function BomLineDiff({
  draftLines,
  activeLines,
  activeVersionLabel,
}: BomLineDiffProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const diff = computeBomDiff(draftLines, activeLines);
  const totalChanges = diff.added.length + diff.removed.length + diff.changed.length;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        Changes from {activeVersionLabel ?? "active version"}
        {totalChanges > 0 && (
          <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-accent">
            {totalChanges}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1 text-xs">
          {diff.added.map((l) => (
            <div
              key={l.bom_line_id}
              className="flex items-center gap-1.5 text-success-fg"
            >
              <span
                className="rounded-sm bg-success-soft px-1.5 py-0.5 font-mono text-3xs font-semibold"
                aria-hidden
              >
                +
              </span>
              <span>
                {l.final_component_name || l.final_component_id} ·{" "}
                <span className="font-mono tabular-nums">
                  {l.final_component_qty}
                </span>
              </span>
            </div>
          ))}
          {diff.removed.map((l) => (
            <div
              key={l.bom_line_id}
              className="flex items-center gap-1.5 text-danger-fg"
            >
              <span
                className="rounded-sm bg-danger-soft px-1.5 py-0.5 font-mono text-3xs font-semibold"
                aria-hidden
              >
                −
              </span>
              <span>
                {l.final_component_name || l.final_component_id} ·{" "}
                <span className="font-mono tabular-nums">
                  {l.final_component_qty}
                </span>
              </span>
            </div>
          ))}
          {diff.changed.map((c) => (
            <div
              key={c.component_id}
              className="flex items-center gap-1.5 text-warning-fg"
            >
              <span
                className="rounded-sm bg-warning-soft px-1.5 py-0.5 font-mono text-3xs font-semibold"
                aria-hidden
              >
                Δ
              </span>
              <span>
                {c.component_id} ·{" "}
                <span className="font-mono tabular-nums">
                  {c.oldQty} → {c.newQty}
                </span>
              </span>
            </div>
          ))}
          {totalChanges === 0 && (
            <div className="text-fg-muted">No changes from active version</div>
          )}
        </div>
      )}
    </section>
  );
}

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
  return (
    <section className="my-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-blue-700 underline"
      >
        {open ? "▼" : "▶"} Changes from {activeVersionLabel ?? "v?"}
      </button>
      {open && (
        <div className="mt-2 text-sm">
          {diff.added.map((l) => (
            <div key={l.bom_line_id} className="text-green-700">
              + {l.final_component_name || l.final_component_id} (
              {l.final_component_qty})
            </div>
          ))}
          {diff.removed.map((l) => (
            <div key={l.bom_line_id} className="text-red-700">
              − {l.final_component_name || l.final_component_id} (
              {l.final_component_qty})
            </div>
          ))}
          {diff.changed.map((c) => (
            <div key={c.component_id} className="text-yellow-800">
              ~ {c.component_id} ({c.oldQty} → {c.newQty})
            </div>
          ))}
          {diff.added.length === 0 &&
            diff.removed.length === 0 &&
            diff.changed.length === 0 && (
              <div className="text-gray-500">אין שינויים</div>
            )}
        </div>
      )}
    </section>
  );
}

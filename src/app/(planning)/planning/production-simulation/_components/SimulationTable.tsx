"use client";

import { formatQty } from "@/lib/utils/format-quantity";
import { cn } from "@/lib/cn";

export interface SimulationLine {
  id: string;
  componentId: string;
  componentName: string;
  type: "BASE" | "PACK";
  qtyPerUnit: number;
  requiredQty: number;
  uom: string;
}

interface SimulationTableProps {
  lines: SimulationLine[];
}

const TYPE_BADGE: Record<SimulationLine["type"], string> = {
  BASE: "bg-info-softer text-info-fg border-info/30",
  PACK: "bg-bg-muted text-fg-muted border-border/70",
};

export function SimulationTable({ lines }: SimulationTableProps) {
  if (lines.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-fg-muted">
        No component lines to display for this simulation.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-bg-subtle/60 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          <tr>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-left">Component</th>
            <th className="px-4 py-2 text-right">Per finished unit</th>
            <th className="px-4 py-2 text-right">Required</th>
            <th className="px-4 py-2 text-left">UOM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {lines.map((l) => (
            <tr key={l.id} data-testid="simulation-line-row">
              <td className="px-4 py-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops",
                    TYPE_BADGE[l.type],
                  )}
                >
                  {l.type}
                </span>
              </td>
              <td className="px-4 py-2 font-medium text-fg-strong">
                {l.componentName}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-fg">
                {formatQty(l.qtyPerUnit, l.uom)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-fg-strong">
                {formatQty(l.requiredQty, l.uom)}
              </td>
              <td className="px-4 py-2 text-fg-muted">{l.uom}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

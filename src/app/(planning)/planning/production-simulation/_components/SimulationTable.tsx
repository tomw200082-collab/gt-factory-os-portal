"use client";

import { formatQty } from "@/lib/utils/format-quantity";
import { cn } from "@/lib/cn";

export interface SimulationLine {
  id: string;
  componentId: string;
  componentName: string;
  /**
   * Per-line classification.
   *
   * Sourced from `components.component_class` (the only per-component
   * classifier we have on the contract) joined onto each simulator line
   * by component_id. Free-text on the contract — we render whatever the
   * component master holds. `null` means the component has no class set.
   *
   * Earlier versions of this page tagged every line with the head's
   * `bom_kind` ("PACK" / "BASE"), which was wrong: a single combined
   * recipe head can return liquid ingredients AND packaging, and the
   * head's bom_kind reflects its role in a 2-tier factoring rather than
   * the nature of any individual line's component.
   */
  componentClass: string | null;
  qtyPerUnit: number;
  requiredQty: number;
  uom: string;
  /**
   * Optional per-line stock coverage. Populated when the net-requirements
   * endpoint returns data for this component. Null when no stock data is
   * available for the component (covered separately in the StockCoverage
   * panel).
   */
  coverage?: {
    availableQty: number;
    netShortageQty: number;
    status: "covered" | "partial" | "not_covered" | "no_stock_data";
  } | null;
}

interface SimulationTableProps {
  lines: SimulationLine[];
  /**
   * Rendering mode.
   *  - "scaled" (default): standard table with a "Per finished unit" column.
   *    Used for the main combined PACK + BASE results scaled to the
   *    operator's target output.
   *  - "unscaled": the lines represent ONE reference batch of a BOM (e.g.
   *    a BASE recipe at its natural batch size). The "Per finished unit"
   *    column is hidden because there are no "finished units" in this
   *    context — only batch quantities. The "Required" column header is
   *    relabelled to "Batch quantity".
   */
  mode?: "scaled" | "unscaled";
}

function classBadgeTone(c: string | null): string {
  if (!c) return "bg-bg-muted text-fg-muted border-border/70";
  const u = c.toUpperCase();
  // Tint liquid/raw-material classes with info, packaging with neutral.
  if (
    u.includes("LIQUID") ||
    u.includes("RAW") ||
    u.includes("INGREDIENT") ||
    u.includes("BASE")
  ) {
    return "bg-info-softer text-info-fg border-info/30";
  }
  if (u.includes("PACK") || u.includes("BOTTLE") || u.includes("LABEL") || u.includes("CAP") || u.includes("CARTON")) {
    return "bg-bg-muted text-fg-muted border-border/70";
  }
  return "bg-bg-muted text-fg-muted border-border/70";
}

export function SimulationTable({ lines, mode = "scaled" }: SimulationTableProps) {
  if (lines.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-fg-muted">
        No component lines to display for this simulation.
      </div>
    );
  }

  const isUnscaled = mode === "unscaled";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-bg-subtle/60 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          <tr>
            <th className="px-4 py-2 text-left">Class</th>
            <th className="px-4 py-2 text-left">Component</th>
            {!isUnscaled && (
              <th className="px-4 py-2 text-right">Per finished unit</th>
            )}
            <th className="px-4 py-2 text-right">
              {isUnscaled ? "Batch quantity" : "Required"}
            </th>
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
                    classBadgeTone(l.componentClass),
                  )}
                  title={l.componentClass ?? "No component class set"}
                >
                  {l.componentClass ?? "—"}
                </span>
              </td>
              <td className="px-4 py-2 font-medium text-fg-strong">
                {l.componentName}
              </td>
              {!isUnscaled && (
                <td className="px-4 py-2 text-right tabular-nums text-fg">
                  {formatQty(l.qtyPerUnit, l.uom)}
                </td>
              )}
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

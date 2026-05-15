"use client";

import { CheckCircle2, AlertTriangle, MinusCircle, HelpCircle } from "lucide-react";
import { formatQty } from "@/lib/utils/format-quantity";
import { cn } from "@/lib/cn";

export type CoverageStatus =
  | "covered"
  | "partial"
  | "not_covered"
  | "no_stock_data";

export type MaterialGroup = "ingredient" | "packaging" | "other";

export interface SimulationLine {
  id: string;
  componentId: string;
  componentName: string;
  componentClass: string | null;
  /** Bucket the component falls in — drives the grouped table sections. */
  group: MaterialGroup;
  /** Quantity of this component per ONE finished unit (the recipe ratio). */
  qtyPerUnit: number;
  /** Total quantity needed for the whole simulated run. */
  requiredQty: number;
  uom: string;
  /** On-hand vs required, when net-requirements returned data for it. */
  coverage: {
    availableQty: number;
    netShortageQty: number;
    status: CoverageStatus;
  } | null;
}

const GROUP_ORDER: MaterialGroup[] = ["ingredient", "packaging", "other"];

const GROUP_LABEL: Record<MaterialGroup, string> = {
  ingredient: "Ingredients & raw materials",
  packaging: "Packaging",
  other: "Other components",
};

function CoverageCell({ status }: { status: CoverageStatus }) {
  const map: Record<
    CoverageStatus,
    { icon: JSX.Element; label: string; cls: string }
  > = {
    covered: {
      icon: <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />,
      label: "Covered",
      cls: "text-success-fg",
    },
    partial: {
      icon: <MinusCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />,
      label: "Partial",
      cls: "text-warning-fg",
    },
    not_covered: {
      icon: <AlertTriangle className="h-4 w-4" strokeWidth={2.25} aria-hidden />,
      label: "Short",
      cls: "text-danger-fg",
    },
    no_stock_data: {
      icon: <HelpCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />,
      label: "No data",
      cls: "text-fg-faint",
    },
  };
  const c = map[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", c.cls)}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

export function SimulationTable({ lines }: { lines: SimulationLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="px-5 py-4 text-sm text-fg-muted">
        This recipe returned no component lines.
      </div>
    );
  }

  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    rows: lines.filter((l) => l.group === g),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/70 text-2xs font-bold uppercase tracking-sops text-fg-subtle">
            <th className="px-5 py-3 text-left">Component</th>
            <th className="px-5 py-3 text-right">Per unit</th>
            <th className="px-5 py-3 text-right">Required</th>
            <th className="px-5 py-3 text-right">On hand</th>
            <th className="px-5 py-3 text-left">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ group, rows }) => (
            <GroupSection key={group} group={group} rows={rows} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupSection({
  group,
  rows,
}: {
  group: MaterialGroup;
  rows: SimulationLine[];
}) {
  return (
    <>
      <tr className="bg-bg-subtle/70">
        <th
          colSpan={5}
          className="px-5 py-2 text-left text-xs font-bold uppercase tracking-sops text-fg-strong"
        >
          {GROUP_LABEL[group]}
          <span className="ml-2 font-semibold text-fg-faint">{rows.length}</span>
        </th>
      </tr>
      {rows.map((l) => {
        const cov = l.coverage;
        const isShort =
          cov?.status === "partial" || cov?.status === "not_covered";
        return (
          <tr
            key={l.id}
            data-testid="simulation-line-row"
            className={cn(
              "border-b border-border/40 last:border-0",
              isShort && "bg-danger-softer/25",
            )}
          >
            <td className="px-5 py-3">
              <div className="text-sm font-semibold text-fg-strong">
                {l.componentName}
              </div>
              <div className="font-mono text-2xs text-fg-faint">
                {l.componentClass ? `${l.componentClass} · ` : ""}
                {l.componentId}
              </div>
            </td>
            <td className="whitespace-nowrap px-5 py-3 text-right text-sm tabular-nums text-fg-muted">
              {formatQty(l.qtyPerUnit, l.uom)}{" "}
              <span className="text-2xs text-fg-faint">{l.uom}</span>
            </td>
            <td className="whitespace-nowrap px-5 py-3 text-right">
              <span className="text-lg font-bold tabular-nums text-fg-strong">
                {formatQty(l.requiredQty, l.uom)}
              </span>{" "}
              <span className="text-xs font-semibold text-fg-muted">
                {l.uom}
              </span>
            </td>
            <td className="whitespace-nowrap px-5 py-3 text-right text-sm tabular-nums text-fg-muted">
              {cov && cov.status !== "no_stock_data"
                ? formatQty(cov.availableQty, l.uom)
                : "—"}
            </td>
            <td className="px-5 py-3">
              {cov ? (
                <div className="flex flex-col gap-0.5">
                  <CoverageCell status={cov.status} />
                  {cov.netShortageQty > 0 ? (
                    <span className="text-2xs font-semibold text-danger-fg">
                      Short {formatQty(cov.netShortageQty, l.uom)} {l.uom}
                    </span>
                  ) : null}
                </div>
              ) : (
                <CoverageCell status="no_stock_data" />
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

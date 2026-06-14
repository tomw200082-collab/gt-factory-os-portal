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

// Coverage accent — a left strip on mobile cards, a left border + tint on
// desktop rows. Same emphasis vocabulary as the date-range plan views.
const COVERAGE_STRIP: Record<CoverageStatus, string> = {
  not_covered: "bg-danger",
  partial: "bg-warning",
  no_stock_data: "bg-fg-faint",
  covered: "bg-success/60",
};

const COVERAGE_ROW: Record<CoverageStatus, string> = {
  not_covered: "border-l-2 border-l-danger bg-danger-softer/30",
  partial: "border-l-2 border-l-warning bg-warning-softer/25",
  no_stock_data: "border-l-2 border-l-fg-faint/50 bg-bg-subtle/50",
  covered: "border-l-2 border-l-transparent",
};

/** A line's effective coverage status — null coverage means no stock data. */
function lineStatus(l: SimulationLine): CoverageStatus {
  return l.coverage?.status ?? "no_stock_data";
}

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
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold",
        c.cls,
      )}
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
    <>
      {/* Desktop — dense table. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/70 text-2xs font-bold uppercase tracking-sops text-fg-subtle">
              <th scope="col" className="px-5 py-3 text-left">Component</th>
              <th scope="col" className="px-5 py-3 text-right">Per unit</th>
              <th scope="col" className="px-5 py-3 text-right">Required</th>
              <th scope="col" className="px-5 py-3 text-right">On hand</th>
              <th scope="col" className="px-5 py-3 text-left">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ group, rows }) => (
              <GroupSection key={group} group={group} rows={rows} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — stacked cards, grouped by material type. */}
      <div className="flex flex-col gap-4 p-3 lg:hidden">
        {groups.map(({ group, rows }) => (
          <div key={group} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2 px-0.5">
              <span className="text-xs font-bold uppercase tracking-sops text-fg-strong">
                {GROUP_LABEL[group]}
              </span>
              <span className="text-2xs font-semibold text-fg-faint">
                {rows.length}
              </span>
            </div>
            {rows.map((l) => (
              <LineCard key={l.id} line={l} />
            ))}
          </div>
        ))}
      </div>
    </>
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
        const status = lineStatus(l);
        return (
          <tr
            key={l.id}
            data-testid="simulation-line-row"
            className={cn(
              "border-b border-border/40 last:border-0",
              COVERAGE_ROW[status],
            )}
          >
            <td className="px-5 py-3">
              <div className="text-sm font-semibold text-fg-strong">
                <bdi>{l.componentName}</bdi>
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
              <div className="flex flex-col gap-0.5">
                <CoverageCell status={status} />
                {cov && cov.netShortageQty > 0 ? (
                  <span className="text-2xs font-semibold text-danger-fg">
                    Short {formatQty(cov.netShortageQty, l.uom)} {l.uom}
                  </span>
                ) : null}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function MiniStat({
  label,
  value,
  uom,
  tone,
}: {
  label: string;
  value: string;
  uom: string;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-3xs font-bold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <span className={cn("truncate text-sm font-bold tabular-nums", tone)}>
        {value}
        {value !== "—" ? (
          <span className="text-2xs font-medium text-fg-faint"> {uom}</span>
        ) : null}
      </span>
    </div>
  );
}

function LineCard({ line: l }: { line: SimulationLine }) {
  const cov = l.coverage;
  const status = lineStatus(l);
  return (
    <div
      data-testid="simulation-line-card"
      className="flex overflow-hidden rounded-md border border-border/60 bg-bg-raised shadow-raised"
    >
      <span
        className={cn("w-1 shrink-0", COVERAGE_STRIP[status])}
        aria-hidden
      />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg-strong">
              <bdi>{l.componentName}</bdi>
            </div>
            <div className="truncate font-mono text-3xs text-fg-faint">
              {l.componentClass ? `${l.componentClass} · ` : ""}
              {l.componentId}
            </div>
          </div>
          <CoverageCell status={status} />
        </div>

        {cov && cov.netShortageQty > 0 ? (
          <div className="mt-2 rounded border border-danger/30 bg-danger-softer/30 px-2 py-1 text-2xs font-semibold text-danger-fg">
            Short {formatQty(cov.netShortageQty, l.uom)} {l.uom}
          </div>
        ) : null}

        <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-md border border-border/50 bg-bg-subtle/40 px-2.5 py-2">
          <MiniStat
            label="Per unit"
            value={formatQty(l.qtyPerUnit, l.uom)}
            uom={l.uom}
            tone="text-fg-muted"
          />
          <MiniStat
            label="Required"
            value={formatQty(l.requiredQty, l.uom)}
            uom={l.uom}
            tone="text-fg-strong"
          />
          <MiniStat
            label="On hand"
            value={
              cov && cov.status !== "no_stock_data"
                ? formatQty(cov.availableQty, l.uom)
                : "—"
            }
            uom={l.uom}
            tone="text-fg-muted"
          />
        </div>
      </div>
    </div>
  );
}

"use client";

// The controls of the report: only the ones that act on the tab in front of you. The Artifact
// showed every control on every tab, and half of them did nothing there.

import type { ReactNode } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import type { Period, Unit } from "../../_lib/report/types";

export type ViewMode = "summary" | "months";

function Group({ label, children, fit = true, testId }: { label: string; children: ReactNode; fit?: boolean; testId?: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className={`s-rp-seg ${fit ? "s-rp-seg-fit" : ""}`}>
      {children}
    </div>
  );
}

export function PeriodControl({ years, value, onChange }: { years: readonly string[]; value: Period; onChange: (p: Period) => void }) {
  // newest year first, then the closed twelve months, then everything: the Artifact's order
  const options: Array<[Period, string]> = [...[...years].reverse().map((y): [Period, string] => [y, y]), ["12", L.period12], ["all", L.periodAll]];
  return (
    <Group label={L.periodLabel} testId="report-period">
      {options.map(([p, label]) => (
        <button key={p} type="button" aria-pressed={value === p} data-testid={`report-period-${p}`} onClick={() => onChange(p)}>
          {label}
        </button>
      ))}
    </Group>
  );
}

export function UnitControl({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <Group label={L.unitLabel} testId="report-unit">
      <button type="button" aria-pressed={value === "rev"} data-testid="report-unit-rev" onClick={() => onChange("rev")}>
        {L.unitRev}
      </button>
      <button type="button" aria-pressed={value === "units"} data-testid="report-unit-units" onClick={() => onChange("units")}>
        {L.unitUnits}
      </button>
    </Group>
  );
}

export function ViewControl({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <Group label={L.viewLabel} testId="report-view">
      <button type="button" aria-pressed={value === "summary"} data-testid="report-view-summary" onClick={() => onChange("summary")}>
        {L.viewSummary}
      </button>
      <button type="button" aria-pressed={value === "months"} data-testid="report-view-months" onClick={() => onChange("months")}>
        {L.viewMonths}
      </button>
    </Group>
  );
}

export function RangeControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Group label={L.rangeLabel} testId="report-range">
      {([30, 90, 365] as const).map((n) => (
        <button key={n} type="button" aria-pressed={value === n} data-testid={`report-range-${n}`} onClick={() => onChange(n)}>
          {L.ranges[n]}
        </button>
      ))}
    </Group>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="w-full sm:w-[260px]">
      <input
        type="search"
        className="s-input"
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid="report-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function HeatToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="s-rp-tool" aria-pressed={on} title={L.heatHint} data-testid="report-heat" onClick={() => onChange(!on)}>
      {L.heat}
    </button>
  );
}

/** The bar a tab opens on: groups side by side where they fit, the search on a row of its own on a phone. */
export function ControlsBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="report-controls">
      {children}
    </div>
  );
}

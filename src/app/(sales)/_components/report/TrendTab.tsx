"use client";

import { useMemo } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { matrixCsvRows } from "../../_lib/report/csv";
import { amount, pctChip } from "../../_lib/report/format";
import { monthLabel, monthName } from "../../_lib/report/period";
import { monthlyTotals, trendTiles, yearMatrix, yoyBars } from "../../_lib/report/trend";
import type { ReportData, Unit } from "../../_lib/report/types";
import { CopyCsv } from "./CopyCsv";
import { HeroTiles, type Tile } from "./HeroTiles";
import { MonthlyChart } from "./MonthlyChart";
import { ControlsBar, UnitControl } from "./ReportControls";
import { YearMatrix } from "./YearMatrix";
import { YoyChart } from "./YoyChart";

/** The trend tab: four figures, the 25-month line, growth per month and the years x months matrix. Only the unit applies here. */
export function TrendTab({ d, unit, onUnit }: { d: ReportData; unit: Unit; onUnit: (u: Unit) => void }) {
  const all = useMemo(() => monthlyTotals(d, unit), [d, unit]);
  const t = useMemo(() => trendTiles(d, unit), [d, unit]);
  const bars = useMemo(() => yoyBars(d, unit), [d, unit]);
  const matrix = useMemo(() => yearMatrix(d, unit), [d, unit]);
  const np = d.months.length;

  const chip = (p: number | null, text: (pct: string) => string): Tile["delta"] => {
    const c = pctChip(p);
    return c ? { text: text(c.text), tone: c.tone } : null;
  };
  const tiles: Tile[] = [
    { label: L.trendTile12, value: amount(t.t12, unit), delta: chip(t.d12, L.trendTile12Delta) },
    { label: L.trendTileLast(monthName(d.months, t.lastFullIdx)), value: amount(t.lastFull, unit), delta: chip(t.dj, L.trendTileLastDelta) },
    { label: L.trendTileRate, value: amount(t.rate, unit), delta: { text: L.trendTileRateSub, tone: "mt" } },
    { label: L.trendTilePartial(monthName(d.months, np - 1), d.pulledShort), value: amount(t.partial, unit), delta: { text: L.trendTilePartialSub, tone: "mt" } },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="report-tab-trend">
      <ControlsBar>
        <UnitControl value={unit} onChange={onUnit} />
        <CopyCsv rows={() => matrixCsvRows(matrix, unit)} />
      </ControlsBar>

      <HeroTiles tiles={tiles} testId="trend-tiles" />

      <section className="s-card flex flex-col gap-2 p-4" aria-labelledby="rp-monthly">
        <h2 id="rp-monthly" className="s-section-heading">
          {unit === "rev" ? L.chartMonthlyTitle(np) : L.chartMonthlyTitleUnits(np)}
        </h2>
        <div className="s-rp-legend">
          <span>
            <span className="s-rp-sw" aria-hidden />
            {unit === "rev" ? L.chartMonthlyRev : L.chartMonthlyUnits}
          </span>
          <span>
            <span className="s-rp-sw s-rp-sw-prior" aria-hidden />
            {L.chartPriorYear}
          </span>
          <span style={{ color: "hsl(var(--s-review))" }}>{L.chartPartialNote(monthLabel(d.months, d.partialIdx))}</span>
        </div>
        <MonthlyChart months={d.months} all={all} unit={unit} partialIdx={d.partialIdx} />
        <p className="s-rp-note">{L.chartTapHint}</p>
      </section>

      <section className="s-card flex flex-col gap-2 p-4" aria-labelledby="rp-yoy">
        <h2 id="rp-yoy" className="s-section-heading">
          {L.chartYoyTitle}
        </h2>
        <p className="s-rp-note">{L.chartYoyHint}</p>
        <YoyChart months={d.months} bars={bars} />
      </section>

      <section className="s-card flex flex-col gap-2 p-4" aria-labelledby="rp-matrix">
        <h2 id="rp-matrix" className="s-section-heading">
          {L.matrixTitle}
        </h2>
        <YearMatrix rows={matrix} unit={unit} />
        <p className="s-rp-note">{L.matrixNote(`${d.pulled} ${d.pulledTime}`)}</p>
      </section>
    </div>
  );
}

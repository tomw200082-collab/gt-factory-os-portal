"use client";

import { useMemo } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { retroCsvRows } from "../../_lib/report/csv";
import { buildDaily, dailyHero, dailySeries, dayLabel, DOW_NAMES, dowOf, pctChange, retroRows } from "../../_lib/report/daily";
import { money, pctChip } from "../../_lib/report/format";
import type { ReportData } from "../../_lib/report/types";
import { CopyCsv } from "./CopyCsv";
import { DailyChart } from "./DailyChart";
import { HeroTiles, type Tile } from "./HeroTiles";
import { ControlsBar, RangeControl } from "./ReportControls";
import { RetroTable } from "./RetroTable";

/** The daily tab: the last closed business day, today against its usual hour, the month's pace, and the last 14 days. Only the chart's range applies here. */
export function DailyTab({ d, range, onRange }: { d: ReportData; range: number; onRange: (n: number) => void }) {
  const daily = useMemo(() => buildDaily(d), [d]);
  const h = useMemo(() => dailyHero(d, daily), [d, daily]);
  const series = useMemo(() => dailySeries(d, daily, range), [d, daily, range]);
  const retro = useMemo(() => retroRows(d, daily, 14), [d, daily]);

  const delta = (a: number, b: number | null): Tile["delta"] => {
    const c = pctChip(pctChange(a, b));
    return c ? { text: c.text, tone: c.tone } : null;
  };
  // Today is partial, so it is never given a delta against full days; and the headline is the
  // last CLOSED business day, because "yesterday" on a Sunday is Shabbat.
  const tiles: Tile[] = [
    {
      label: L.dailyTileYest(DOW_NAMES[dowOf(d, h.yest)], dayLabel(d, h.yest)),
      value: money(h.yRev),
      delta: h.yBase ? delta(h.yRev, h.yBase) : { text: L.dailyOrdersSub(h.yCnt), tone: "mt" },
    },
    {
      label: L.dailyTileToday(d.pulledTime),
      value: money(h.tRev),
      delta: h.tBase ? delta(h.tRev, h.tBase) : { text: L.dailyOrdersPartialSub(h.tCnt), tone: "mt" },
    },
    { label: L.dailyTileWeek, value: money(h.w1 / 7), delta: delta(h.w1, h.w0) },
    { label: L.dailyTileMonth, value: money(h.mtd), delta: delta(h.mtd, h.pmSame) },
  ];
  const left = h.thisMonthLen - h.mDays;
  const mxd = Math.max(1, ...h.meds);

  return (
    <div className="flex flex-col gap-4" data-testid="report-tab-daily">
      <ControlsBar>
        <RangeControl value={range} onChange={onRange} />
        <CopyCsv rows={() => retroCsvRows(retro, d)} />
      </ControlsBar>

      <HeroTiles tiles={tiles} testId="daily-tiles" />

      <section className="s-card flex flex-col gap-3 p-4" aria-labelledby="rp-pace" data-testid="report-pace">
        <h2 id="rp-pace" className="s-section-heading">
          {L.paceTitle}
        </h2>
        <dl className="s-rp-pace">
          <dt>{L.paceTodaySame(d.pulledTime, DOW_NAMES[dowOf(d, h.today)])}</dt>
          <dd data-testid="pace-today-base">{h.tBase ? money(h.tBase) : "—"}</dd>
          <dt>{L.paceYestUsual(DOW_NAMES[dowOf(d, h.yest)])}</dt>
          <dd data-testid="pace-yest-base">{h.yBase === null ? "—" : money(h.yBase)}</dd>
          <dt>{L.pacePrevWeek}</dt>
          <dd data-testid="pace-prev-week">{money(h.w0 / 7)}</dd>
          <dt>{L.paceSameDays(h.mDays)}</dt>
          <dd data-testid="pace-same-days">{money(h.pmSame)}</dd>
          <dt className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {L.paceForecast}
          </dt>
          <dd className="s-rp-pace-total" data-testid="pace-forecast">
            {money(h.pace.total)}
          </dd>
        </dl>
        <p className="s-rp-note">{L.paceExplain(left)}</p>
      </section>

      <section className="s-card flex flex-col gap-2 p-4" aria-labelledby="rp-daily">
        <h2 id="rp-daily" className="s-section-heading">
          {L.chartDailyTitle}
        </h2>
        <div className="s-rp-legend">
          <span>
            <span className="s-rp-sw s-rp-sw-bar" aria-hidden />
            {L.chartDailyLegendBar}
          </span>
          <span>
            <span className="s-rp-sw" aria-hidden />
            {L.chartDailyLegendMa}
          </span>
          <span>
            <span className="s-rp-sw s-rp-sw-off" aria-hidden />
            {L.chartDailyLegendOff}
          </span>
        </div>
        <DailyChart d={d} daily={daily} series={series} />
      </section>

      <section className="s-card flex flex-col gap-2 p-4" aria-labelledby="rp-weekday">
        <h2 id="rp-weekday" className="s-section-heading">
          {L.weekdayTitle}
        </h2>
        <p className="s-rp-note">{L.weekdayHint}</p>
        <dl className="s-rp-dow" data-testid="weekday-profile">
          {h.meds.map((v, i) => (
            <div key={i} className="contents">
              <dt style={{ color: "hsl(var(--s-fg-muted))", whiteSpace: "nowrap" }}>{L.weekdayRow(DOW_NAMES[i])}</dt>
              <dd className="m-0">
                <span className="s-rp-dow-track">
                  <span className={`s-rp-dow-fill ${i >= 5 ? "s-rp-dow-fill-off" : ""}`} style={{ inlineSize: `${((v / mxd) * 100).toFixed(1)}%` }} />
                </span>
              </dd>
              <dd className="m-0 s-nums" dir="ltr" style={{ textAlign: "end", whiteSpace: "nowrap", fontWeight: 600 }}>
                {money(v)} <small style={{ fontWeight: 400, color: "hsl(var(--s-fg-faint))" }}>· {L.weekdayDays(h.byDow[i].length)}</small>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="s-card flex flex-col gap-2 overflow-hidden p-0" aria-labelledby="rp-retro">
        <h2 id="rp-retro" className="s-section-heading px-4 pt-4">
          {L.retroTitle}
        </h2>
        <RetroTable d={d} rows={retro} />
        <p className="s-rp-note px-4 pb-4">{L.retroNote(d.pulledTime)}</p>
      </section>
    </div>
  );
}

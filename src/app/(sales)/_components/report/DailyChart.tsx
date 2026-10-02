"use client";

// Daily turnover as bars with a seven-day moving average. Friday and Saturday are muted, today is
// dashed in amber (it is not finished), and when one day dwarfs the rest the axis is cut at the
// everyday range and that bar is drawn clipped with its real value on it.

import { REPORT_UI as L } from "../../_lib/labels";
import { dateOf, dayLabel, DOW_NAMES, dowOf, isOff, type Daily, type DailySeries } from "../../_lib/report/daily";
import { compact, money } from "../../_lib/report/format";
import { useElementWidth } from "../../_lib/report/hooks";
import type { ReportData } from "../../_lib/report/types";
import { smoothPath } from "../../_lib/timeline";
import { useId } from "react";
import { ChartKeysHint, ChartTip, useChartTip } from "./ChartTip";

const NICE = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60];

export function DailyChart({ d, daily, series }: { d: ReportData; daily: Daily; series: DailySeries }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, W] = useElementWidth<HTMLDivElement>(320);
  const H = W < 480 ? 240 : 290;
  const P = { t: 28, r: 10, b: 26, l: 10 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const { a0, days, vals, ma, clipped, mx, peak } = series;
  const last = daily.last;
  const slot = iw / days;
  const bw = Math.max(1.5, slot - (days > 120 ? 0.6 : 2));
  const X = (i: number) => +(P.l + slot * (i + 0.5)).toFixed(1);
  const Y = (v: number) => +(P.t + ih - (ih * v) / mx).toFixed(1);
  const { active, bind } = useChartTip(wrapRef, days, (x) => Math.floor((x - P.l) / slot), a0);

  const stepNeeded = Math.ceil(40 / slot);
  const step = NICE.find((n) => n >= stepNeeded) ?? 60;
  const xLabels: number[] = [];
  for (let i = days - 1; i >= 0; i -= step) xLabels.push(i);

  const a = active;
  const e = a !== null ? a0 + a : 0;
  const dd = dateOf(d, e);

  return (
    <>
    <div ref={wrapRef} className="s-rp-chart" role="group" aria-label={L.chartDailyAria} aria-describedby={`k${uid}`} data-testid="daily-chart" {...bind}>
      <ChartKeysHint id={`k${uid}`} text={L.chartKeys} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L.chartDailyAria}>
        {[1, 2, 3, 4].map((i) => {
          const yy = P.t + ih - (ih * i) / 4;
          return (
            <g key={i}>
              <line className="s-rp-gl" x1={P.l} x2={W - P.r} y1={yy} y2={yy} />
              <text className="s-rp-axis" x={P.l} y={yy - 4} textAnchor="start">
                {compact((mx * i) / 4, "rev")}
              </text>
            </g>
          );
        })}
        {vals.map((v, i) => {
          const day = a0 + i;
          const over = v > mx;
          const h = Math.max(v > 0 ? 1.5 : 0, P.t + ih - Y(Math.min(v, mx)));
          const partial = day === last;
          const off = isOff(d, day);
          return (
            <g key={day}>
              <rect
                x={(X(i) - bw / 2).toFixed(1)}
                y={Y(Math.min(v, mx)).toFixed(1)}
                width={bw.toFixed(1)}
                height={h.toFixed(1)}
                rx={Math.min(2, bw / 2).toFixed(1)}
                fill={off ? "hsl(var(--s-fg-faint))" : "hsl(var(--s-accent))"}
                fillOpacity={a === i ? 1 : partial ? 0.4 : off ? 0.7 : 0.75}
                stroke={partial ? "hsl(var(--s-review))" : undefined}
                strokeWidth={partial ? 1.2 : undefined}
                strokeDasharray={partial ? "2 2" : undefined}
              />
              {over ? (
                <>
                  <path d={`M${(X(i) - bw / 2).toFixed(1)} ${(P.t + 3).toFixed(1)} l${bw.toFixed(1)} 0`} stroke="hsl(var(--s-surface))" strokeWidth={3} />
                  <text className="s-rp-axis" x={X(i)} y={P.t - 6} textAnchor="middle" style={{ fill: "hsl(var(--s-fg))", fontWeight: 600 }}>
                    ▲ {compact(v, "rev")}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
        <path d={smoothPath(ma.map((v, i) => [X(i), Y(v)] as const))} fill="none" stroke="hsl(var(--s-accent))" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        {peak !== null ? (
          <text className="s-rp-axis" x={X(peak)} y={Math.max(P.t + 10, Y(vals[peak]) - 8)} textAnchor="middle" style={{ fill: "hsl(var(--s-fg))", fontWeight: 600 }}>
            {compact(vals[peak], "rev")} · {dayLabel(d, a0 + peak)}
          </text>
        ) : null}
        {xLabels.map((i) => (
          <text key={i} className="s-rp-axis" x={X(i)} y={H - 6} textAnchor="middle">
            {dayLabel(d, a0 + i)}
          </text>
        ))}
        {a !== null ? <line x1={X(a)} x2={X(a)} y1={P.t} y2={P.t + ih} stroke="hsl(var(--s-border-strong))" strokeWidth={1} /> : null}
      </svg>
      <ChartTip show={a !== null} x={a !== null ? X(a) : 0} width={W} top={2}>
        {a !== null ? (
          <>
            <b className="s-nums">{L.chartDailyTip(money(vals[a]), L.orders(daily.cnt[e - daily.first] || 0))}</b>
            <br />
            <span style={{ color: "hsl(var(--s-fg-muted))" }}>
              {L.chartDailyTipSub(DOW_NAMES[dowOf(d, e)], `${dayLabel(d, e)}/${String(dd.getUTCFullYear()).slice(2)}`, e === last, money(ma[a]))}
            </span>
          </>
        ) : null}
      </ChartTip>
    </div>
    {clipped ? <p className="s-rp-note mt-1" data-testid="daily-clipped">{L.chartDailyClipped}</p> : null}
    </>
  );
}

"use client";

// The monthly turnover line: 25 months, last year's line dashed behind it, the month in progress
// dashed and ringed in amber so a partial month never reads as a drop. Hand-drawn SVG in pixels,
// so its text stays one size at every width and the label density follows the room.

import { useId } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { amount, compact, pctTone, signedPct } from "../../_lib/report/format";
import { monthLabel } from "../../_lib/report/period";
import type { Unit } from "../../_lib/report/types";
import { smoothPath } from "../../_lib/timeline";
import { useElementWidth } from "../../_lib/report/hooks";
import { ChartKeysHint, ChartTip, useChartTip } from "./ChartTip";

export function MonthlyChart({ months, all, unit, partialIdx }: { months: readonly string[]; all: readonly number[]; unit: Unit; partialIdx: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, W] = useElementWidth<HTMLDivElement>(320);
  const NP = all.length;
  const H = W < 480 ? 240 : 300;
  const P = { t: 30, r: 10, b: 26, l: 10 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const lastFull = partialIdx - 1;
  const mx = Math.max(...all, 1) * 1.08;
  const X = (i: number) => +(P.l + (iw * i) / (NP - 1)).toFixed(1);
  const Y = (v: number) => +(P.t + ih - (ih * v) / mx).toFixed(1);
  const base = P.t + ih;
  const { active, bind } = useChartTip(wrapRef, NP, (x) => Math.round(((x - P.l) / iw) * (NP - 1)), unit);

  const step = Math.max(1, Math.ceil(46 / (iw / (NP - 1))));
  const xLabels: number[] = [];
  for (let i = NP - 1; i >= 0; i -= step) xLabels.push(i);

  const cur: Array<[number, number]> = [];
  for (let i = 0; i <= lastFull; i++) cur.push([X(i), Y(all[i])]);
  const solid = smoothPath(cur);
  const prior: Array<[number, number]> = [];
  for (let i = 12; i < NP; i++) prior.push([X(i), Y(all[i - 12])]);

  let pk = 0;
  for (let i = 0; i <= lastFull; i++) if (all[i] > all[pk]) pk = i;
  const showPeak = pk !== lastFull && Math.abs(X(pk) - X(lastFull)) > 74;

  const a = active;
  const pv = a !== null && a >= 12 ? all[a - 12] : null;
  const pct = a !== null && pv ? (100 * (all[a] - pv)) / pv : null;

  return (
    <div ref={wrapRef} className="s-rp-chart" role="group" aria-label={L.chartMonthlyAria} aria-describedby={`k${uid}`} data-testid="monthly-chart" {...bind}>
      <ChartKeysHint id={`k${uid}`} text={L.chartKeys} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L.chartMonthlyAria}>
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "hsl(var(--s-accent))", stopOpacity: 0.26 }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--s-accent))", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {[1, 2, 3, 4].map((i) => {
          const yy = P.t + ih - (ih * i) / 4;
          return (
            <line key={i} className="s-rp-gl" x1={P.l} x2={W - P.r} y1={yy} y2={yy} />
          );
        })}
        {prior.length > 1 ? <path d={smoothPath(prior)} fill="none" stroke="hsl(var(--s-fg-faint))" strokeWidth={2} strokeDasharray="6 5" /> : null}
        <path d={`${solid} L${X(lastFull)} ${base} L${X(0)} ${base} Z`} fill={`url(#g${uid})`} stroke="none" />
        <path d={solid} fill="none" stroke="hsl(var(--s-accent))" strokeWidth={2.6} strokeLinejoin="round" />
        <path d={`M${X(lastFull)} ${Y(all[lastFull])} L${X(NP - 1)} ${Y(all[NP - 1])}`} fill="none" stroke="hsl(var(--s-review))" strokeWidth={2.6} strokeDasharray="5 5" />
        <circle cx={X(NP - 1)} cy={Y(all[NP - 1])} r={4.5} fill="hsl(var(--s-surface))" stroke="hsl(var(--s-review))" strokeWidth={2} />
        <circle cx={X(lastFull)} cy={Y(all[lastFull])} r={4.5} fill="hsl(var(--s-accent))" />
        {a !== null ? (
          <g>
            <line x1={X(a)} x2={X(a)} y1={P.t} y2={base} stroke="hsl(var(--s-border-strong))" strokeWidth={1} />
            {pv !== null ? <circle cx={X(a)} cy={Y(pv)} r={3.5} fill="none" stroke="hsl(var(--s-fg-faint))" strokeWidth={1.5} /> : null}
            <circle cx={X(a)} cy={Y(all[a])} r={4} fill="hsl(var(--s-accent))" />
          </g>
        ) : null}
        {/* every label last, so its halo masks the line and the area under it */}
        {[1, 2, 3, 4].map((i) => (
          <text key={`y${i}`} className="s-rp-axis" x={P.l} y={P.t + ih - (ih * i) / 4 - 4} textAnchor="start">
            {compact((mx * i) / 4, unit)}
          </text>
        ))}
        {xLabels.map((i) => (
          <text key={i} className="s-rp-axis" x={X(i)} y={H - 6} textAnchor="middle">
            {monthLabel(months, i)}
          </text>
        ))}
        <text className="s-rp-axis" x={X(lastFull)} y={Y(all[lastFull]) - 14} textAnchor="middle" style={{ fill: "hsl(var(--s-fg))", fontWeight: 600, fontSize: 12 }}>
          {compact(all[lastFull], unit)}
        </text>
        {showPeak ? (
          <text className="s-rp-axis" x={X(pk)} y={Y(all[pk]) - 10} textAnchor="middle">
            {L.chartPeak(monthLabel(months, pk))}
          </text>
        ) : null}
      </svg>
      <ChartTip show={a !== null} x={a !== null ? X(a) : 0} width={W} top={a !== null ? Math.max(0, Math.min(Y(all[a]) - 74, H - 110)) : 0}>
        {a !== null ? (
          <>
            <b>{L.chartMonthTip(monthLabel(months, a), a === partialIdx)}</b>
            <br />
            <span className="s-nums" dir="ltr">
              {amount(all[a], unit)}
            </span>
            {pv !== null ? (
              <>
                <br />
                <span style={{ color: "hsl(var(--s-fg-muted))" }} dir="ltr">
                  {monthLabel(months, a - 12)}: {amount(pv, unit)}
                </span>
                {pct !== null ? (
                  <>
                    <br />
                    <span className={`s-rp-chip s-rp-chip-${pctTone(pct)}`} dir="ltr">
                      {signedPct(pct)}
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </ChartTip>
    </div>
  );
}

"use client";

// Growth against the same month a year earlier, one bar per month. Green is above last year, red is
// below, and the month in progress is drawn with a dashed outline and a star. A bar's figure is printed
// when the bar is wide enough to carry it; otherwise a tap on the bar says it.

import { useId } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { pctTone, signedPct } from "../../_lib/report/format";
import { monthLabel } from "../../_lib/report/period";
import type { YoyBar } from "../../_lib/report/trend";
import { useElementWidth } from "../../_lib/report/hooks";
import { ChartKeysHint, ChartTip, useChartTip } from "./ChartTip";

export function YoyChart({ months, bars }: { months: readonly string[]; bars: readonly YoyBar[] }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, W] = useElementWidth<HTMLDivElement>(320);
  const H = 150;
  const Q = { t: 18, r: 8, b: 22, l: 8 };
  const iw = W - Q.l - Q.r;
  const ih = H - Q.t - Q.b;
  const vals = bars.filter((b) => b.pct !== null).map((b) => b.pct as number);
  const hasNeg = Math.min(...vals, 0) < 0;
  const maxAbs = Math.max(...vals.map(Math.abs), 10) * 1.05;
  const zero = hasNeg ? Q.t + ih / 2 : Q.t + ih - 2;
  const span = hasNeg ? ih / 2 - 8 : ih - 22;
  const bw = iw / bars.length;
  const { active, bind } = useChartTip(wrapRef, bars.length, (x) => Math.floor((x - Q.l) / bw));
  const labelValues = bw >= 34;
  const step = Math.max(1, Math.ceil(46 / bw));
  const a = active !== null ? bars[active] : null;

  return (
    <div ref={wrapRef} className="s-rp-chart" role="group" aria-label={L.chartYoyAria} aria-describedby={`k${uid}`} data-testid="yoy-chart" {...bind}>
      <ChartKeysHint id={`k${uid}`} text={L.chartKeys} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L.chartYoyAria}>
        <line x1={Q.l} x2={W - Q.r} y1={zero} y2={zero} stroke="hsl(var(--s-border-strong))" />
        {bars.map((b, j) => {
          if (b.pct === null) return null;
          const v = b.pct;
          const h = (Math.abs(v) / maxAbs) * span;
          const x = Q.l + j * bw + bw * 0.18;
          const w = bw * 0.64;
          const y = v >= 0 ? zero - h : zero;
          const color = v >= 0 ? "hsl(var(--s-status-won))" : "hsl(var(--s-sla-overdue))";
          return (
            <g key={b.i}>
              <rect
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                width={w.toFixed(1)}
                height={Math.max(1, h).toFixed(1)}
                rx={2.5}
                fill={color}
                fillOpacity={b.partial ? 0.3 : active === j ? 1 : 0.88}
                stroke={b.partial ? color : undefined}
                strokeWidth={b.partial ? 1.5 : undefined}
                strokeDasharray={b.partial ? "3 2" : undefined}
              />
              {labelValues ? (
                <text
                  className="s-rp-axis"
                  x={(x + w / 2).toFixed(1)}
                  y={(v >= 0 ? y - 4 : y + h + 11).toFixed(1)}
                  textAnchor="middle"
                  style={{ fontSize: 10.5, ...(Math.abs(v) >= 15 ? { fontWeight: 600, fill: "hsl(var(--s-fg-muted))" } : {}) }}
                >
                  {signedPct(v)}
                  {b.partial ? "*" : ""}
                </text>
              ) : null}
            </g>
          );
        })}
        {bars.map((b, j) =>
          (bars.length - 1 - j) % step === 0 ? (
            <text key={b.i} className="s-rp-axis" x={(Q.l + j * bw + bw / 2).toFixed(1)} y={H - 5} textAnchor="middle" style={{ fontSize: 10 }}>
              {monthLabel(months, b.i)}
              {b.partial && !labelValues ? "*" : ""}
            </text>
          ) : null,
        )}
      </svg>
      <ChartTip show={Boolean(a && a.pct !== null)} x={active !== null ? Q.l + active * bw + bw / 2 : 0} width={W} top={2}>
        {a && a.pct !== null ? (
          <>
            <b>{L.chartMonthTip(monthLabel(months, a.i), a.partial)}</b>
            <br />
            <span className={`s-rp-chip s-rp-chip-${pctTone(a.pct)}`} dir="ltr">
              {signedPct(a.pct)}
            </span>
          </>
        ) : null}
      </ChartTip>
    </div>
  );
}

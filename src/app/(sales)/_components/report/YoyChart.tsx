"use client";

// Growth against the same month a year earlier, one bar per month. Green is above last year, red is
// below, and the month in progress is drawn faint with a star. A bar's figure is printed when the bar
// is wide enough to carry it; otherwise a tap on the bar says it.

import { REPORT_UI as L } from "../../_lib/labels";
import { signedPct } from "../../_lib/report/format";
import { monthLabel } from "../../_lib/report/period";
import type { YoyBar } from "../../_lib/report/trend";
import { useElementWidth } from "../../_lib/report/hooks";
import { ChartTip, useChartTip } from "./ChartTip";

export function YoyChart({ months, bars }: { months: readonly string[]; bars: readonly YoyBar[] }) {
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
    <div ref={wrapRef} className="s-rp-chart" role="group" aria-label={L.chartYoyAria} data-testid="yoy-chart" {...bind}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L.chartYoyAria}>
        <line x1={Q.l} x2={W - Q.r} y1={zero} y2={zero} stroke="hsl(var(--s-border-strong))" />
        {bars.map((b, j) => {
          if (b.pct === null) return null;
          const v = b.pct;
          const h = (Math.abs(v) / maxAbs) * span;
          const x = Q.l + j * bw + bw * 0.18;
          const w = bw * 0.64;
          const y = v >= 0 ? zero - h : zero;
          const lit = active === j;
          return (
            <g key={b.i}>
              <rect
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                width={w.toFixed(1)}
                height={Math.max(1, h).toFixed(1)}
                rx={2.5}
                fill={v >= 0 ? "hsl(var(--s-status-won))" : "hsl(var(--s-sla-overdue))"}
                opacity={b.partial ? 0.4 : lit ? 1 : 0.88}
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
      {a && a.pct !== null && active !== null ? (
        <ChartTip x={Q.l + active * bw + bw / 2} width={W} top={2}>
          <b>{L.chartMonthTip(monthLabel(months, a.i), a.partial)}</b>
          <br />
          <span className={`s-rp-chip ${a.pct >= 0 ? "s-rp-chip-up" : "s-rp-chip-dn"}`} dir="ltr">
            {signedPct(a.pct)}
          </span>
        </ChartTip>
      ) : null}
    </div>
  );
}

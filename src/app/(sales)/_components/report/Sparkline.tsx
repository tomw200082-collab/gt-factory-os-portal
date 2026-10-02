"use client";

import { sparkPoints } from "../../_lib/report/aggregate";

/** A row's months as a line with a marker on the last one. Draws nothing for a single month. */
export function Sparkline({ vals, w = 86, h = 20 }: { vals: readonly number[]; w?: number; h?: number }) {
  const pts = sparkPoints(vals, w, h);
  if (!pts) return null;
  return (
    <svg className="s-rp-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={pts.path} fill="none" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.last[0]} cy={pts.last[1]} r={2.2} stroke="none" />
    </svg>
  );
}

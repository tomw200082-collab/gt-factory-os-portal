"use client";

import { useRef } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { useScrollToEnd } from "../../_lib/report/hooks";
import { cell, signedPct } from "../../_lib/report/format";
import { MONTH_SHORT } from "../../_lib/report/period";
import type { YearRow } from "../../_lib/report/trend";
import type { Unit } from "../../_lib/report/types";
import { heatBackground } from "./GridTab";

/** Years down, calendar months across. Growth is over months both years have in full: the one in progress never counts. */
export function YearMatrix({ rows, unit }: { rows: readonly YearRow[]; unit: Unit }) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToEnd(scroller, rows.length);
  return (
    <div ref={scroller} className="s-rp-scroll" data-testid="year-matrix">
      <table className="s-rp-table">
        <thead>
          <tr>
            <th className="s-rp-first" scope="col" style={{ minInlineSize: 64 }}>
              {L.matrixYear}
            </th>
            {MONTH_SHORT.map((m) => (
              <th key={m} className="s-rp-mid" scope="col">
                {m}׳
              </th>
            ))}
            <th className="s-rp-mid" scope="col">
              {L.matrixTotal}
            </th>
            <th className="s-rp-mid" scope="col">
              {L.matrixGrowth}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year} data-testid="matrix-row" data-year={r.year}>
              <th className="s-rp-first" scope="row" style={{ minInlineSize: 64, background: "hsl(var(--s-surface))", fontWeight: 700 }}>
                {r.year}
              </th>
              {r.cells.map((c) => (
                <td key={c.month} className="s-rp-num" style={{ background: heatBackground(c.heat) }} data-testid="matrix-cell">
                  {c.v === null ? "" : c.v === 0 ? "0" : cell(c.v, unit)}
                  {c.partial ? ` ${L.partialMark}` : ""}
                </td>
              ))}
              <td className="s-rp-num" style={{ fontWeight: 700 }} data-testid="matrix-total">
                {cell(r.total, unit)}
              </td>
              <td className="s-rp-mid" data-testid="matrix-growth">
                {r.growth === null ? (
                  <span className="s-rp-muted">—</span>
                ) : (
                  <span className={r.growth >= 0 ? "s-rp-up" : "s-rp-down"}>{signedPct(r.growth)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

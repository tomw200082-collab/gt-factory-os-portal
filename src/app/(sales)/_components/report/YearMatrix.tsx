"use client";

import { useRef } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { useMediaQuery, usePinnedScroller } from "../../_lib/report/hooks";
import { cell, pctTone, signedPct } from "../../_lib/report/format";
import { MONTH_SHORT } from "../../_lib/report/period";
import type { YearRow } from "../../_lib/report/trend";
import type { Unit } from "../../_lib/report/types";
import { HeatMark, heatBackground } from "./GridTab";

/** Years down, calendar months across. Growth is over months both years have in full: the one in progress never counts. */
export function YearMatrix({ rows, unit }: { rows: readonly YearRow[]; unit: Unit }) {
  const scroller = useRef<HTMLDivElement>(null);
  const short = useMediaQuery("(max-width: 639px)");
  usePinnedScroller(scroller, `${rows.length}${short}`, "[data-latest]");
  // the latest month that has a figure, in the latest year that has one
  const lastRow = rows[rows.length - 1];
  const latest = lastRow ? [...lastRow.cells].reverse().find((c) => c.v !== null)?.month : undefined;
  return (
    <div ref={scroller} className="s-rp-scroll s-rp-fade" role="region" tabIndex={0} aria-label={L.matrixTitle} data-testid="year-matrix">
      <table className="s-rp-table">
        <caption className="sr-only">{L.matrixTitle}</caption>
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
                <td key={c.month} className="s-rp-num" data-latest={r === lastRow && c.month === latest ? "" : undefined} style={{ background: heatBackground(c.heat) }} data-testid="matrix-cell">
                  <HeatMark h={c.heat} />
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
                  <span className={pctTone(r.growth) === "up" ? "s-rp-up" : pctTone(r.growth) === "dn" ? "s-rp-down" : "s-rp-muted"}>{signedPct(r.growth)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

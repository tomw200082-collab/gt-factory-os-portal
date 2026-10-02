"use client";

// The last 14 days against each day's usual. A table from tablet width; stacked rows on a phone,
// where seven columns would only scroll sideways.

import { REPORT_UI as L } from "../../_lib/labels";
import { dayLabel, DOW_NAMES, dowOf, type RetroRow } from "../../_lib/report/daily";
import { money, signedPct } from "../../_lib/report/format";
import { useMediaQuery } from "../../_lib/report/hooks";
import type { ReportData } from "../../_lib/report/types";

function Chip({ r }: { r: RetroRow }) {
  if (r.partial) return <span className="s-rp-chip s-rp-chip-warn">{L.retroPartial}</span>;
  if (r.p === null || r.chip === null) return <span className="s-rp-muted">—</span>;
  return (
    <span className={`s-rp-chip s-rp-chip-${r.chip}`} dir="ltr">
      {signedPct(r.p)}
    </span>
  );
}

export function RetroTable({ d, rows }: { d: ReportData; rows: readonly RetroRow[] }) {
  const wide = useMediaQuery("(min-width: 640px)");
  const topText = (r: RetroRow) => (r.top ? `${r.top[0]} · ${money(r.top[1])}` : "—");

  if (!wide) {
    return (
      <ol className="m-0 list-none p-0" data-testid="retro">
        {rows.map((r) => (
          <li key={r.e} className={`s-rp-retro ${r.partial ? "s-rp-retro-now" : ""} ${r.off ? "s-rp-retro-off" : ""}`} data-testid="retro-row" data-day={r.e}>
            <span className="font-medium">
              {DOW_NAMES[dowOf(d, r.e)]} {dayLabel(d, r.e)}
            </span>
            <span className="s-nums font-semibold" dir="ltr" data-testid="retro-rev">
              {money(r.rev)}
            </span>
            <span className="s-nums" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {L.orders(r.cnt)}
              {r.avg !== null ? ` · ${money(r.avg)}` : ""}
            </span>
            <span style={{ justifySelf: "end" }}>
              <Chip r={r} />
            </span>
            <span style={{ gridColumn: "1 / -1", color: "hsl(var(--s-fg-muted))", fontSize: 12 }}>{topText(r)}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="s-rp-scroll" data-testid="retro">
      <table className="s-rp-table">
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "start" }}>{L.retroDate}</th>
            <th scope="col" style={{ textAlign: "start" }}>{L.retroDay}</th>
            <th scope="col">{L.retroRev}</th>
            <th scope="col">{L.retroOrders}</th>
            <th scope="col">{L.retroAvg}</th>
            <th scope="col">{L.retroVs}</th>
            <th scope="col" style={{ textAlign: "start" }}>{L.retroTop}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.e} className={r.off ? "s-rp-muted" : ""} data-testid="retro-row" data-day={r.e}>
              <td style={r.partial ? { background: "hsl(var(--s-accent-soft))" } : undefined}>{dayLabel(d, r.e)}</td>
              <td style={r.partial ? { background: "hsl(var(--s-accent-soft))" } : undefined}>{DOW_NAMES[dowOf(d, r.e)]}</td>
              <td className="s-rp-num" data-testid="retro-rev">{money(r.rev)}</td>
              <td className="s-rp-num">{r.cnt}</td>
              <td className="s-rp-num">{r.avg === null ? "—" : money(r.avg)}</td>
              <td className="s-rp-mid">
                <Chip r={r} />
              </td>
              <td style={{ maxInlineSize: 240, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12.5 }} title={topText(r)}>
                {topText(r)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

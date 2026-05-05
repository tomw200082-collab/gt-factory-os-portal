"use client";

// ---------------------------------------------------------------------------
// MiniStats — 4-up micro-card row used under the Forecast list hero.
//
// Replaces the prior inline pipe-separated insights strip. Each card has a
// tier-relevant left accent (semantic mapping: total → accent, active →
// success, drafts → warning, last-published → info) and tabular numerics.
// Composes the .fc-list-stat utility defined in globals.css.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";

interface MiniStatsProps {
  total: number;
  active: number;
  drafts: number;
  lastPublishedRelative: string | null;
  lastPublishedISO?: string | null;
}

function statStyle(tokenName: string): CSSProperties {
  return {
    ["--kpi-accent" as string]: `var(${tokenName})`,
  } as CSSProperties;
}

export function MiniStats({
  total,
  active,
  drafts,
  lastPublishedRelative,
  lastPublishedISO,
}: MiniStatsProps) {
  return (
    <div
      className="fc-list-stats"
      data-testid="forecast-insights-strip"
      role="group"
      aria-label="Forecast catalog summary"
    >
      <div
        className="fc-list-stat"
        style={statStyle("--accent")}
        data-testid="forecast-stat-total"
      >
        <span className="fc-list-stat-label">Versions</span>
        <span className="fc-list-stat-value">{total}</span>
        <span className="fc-list-stat-sub">in catalog</span>
      </div>

      <div
        className="fc-list-stat"
        style={statStyle("--success")}
        data-testid="forecast-stat-active"
      >
        <span className="fc-list-stat-label">Active</span>
        <span
          className={
            active > 0
              ? "fc-list-stat-value text-success-fg"
              : "fc-list-stat-value fc-list-stat-value-muted"
          }
        >
          {active}
        </span>
        <span className="fc-list-stat-sub">
          {active === 1 ? "published" : "published"}
        </span>
      </div>

      <div
        className="fc-list-stat"
        style={statStyle("--warning")}
        data-testid="forecast-stat-drafts"
      >
        <span className="fc-list-stat-label">Drafts</span>
        <span className="fc-list-stat-value">{drafts}</span>
        <span className="fc-list-stat-sub">
          {drafts === 1 ? "in flight" : "in flight"}
        </span>
      </div>

      <div
        className="fc-list-stat"
        style={statStyle("--info")}
        data-testid="forecast-stat-last-published"
        title={lastPublishedISO ?? undefined}
      >
        <span className="fc-list-stat-label">Last published</span>
        <span
          className={
            lastPublishedRelative
              ? "fc-list-stat-value"
              : "fc-list-stat-value fc-list-stat-value-muted"
          }
        >
          {lastPublishedRelative ?? "—"}
        </span>
        <span className="fc-list-stat-sub">across all versions</span>
      </div>
    </div>
  );
}

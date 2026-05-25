// ---------------------------------------------------------------------------
// StockHealthCard — premium Stock Health KPI tile with a larger donut, more
// dramatic center typography, and proportional legend bars. Uses the same
// .kpi-tile language as the other KPI tiles so the dashboard reads as a
// coherent instrument cluster.
// ---------------------------------------------------------------------------
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StockHealthCardProps {
  healthy: number;
  watch: number;
  critical: number;
  total: number;
  loading?: boolean;
}

export function StockHealthCard({
  healthy,
  watch,
  critical,
  total,
  loading,
}: StockHealthCardProps) {
  // Donut geometry — slightly larger than before for visual presence.
  const r = 50;
  const circ = 2 * Math.PI * r;
  const gap = 6;
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;

  // Draw-in: arcs grow from zero length on first paint.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function arc(count: number, strokeClass: string, offset: number) {
    const len = Math.max(0, (count / Math.max(1, total)) * circ - gap);
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        className={strokeClass}
        strokeWidth={12}
        strokeDasharray={`${drawn ? len : 0} ${circ}`}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.165,0.84,0.44,1)" }}
      />
    );
  }
  const hShare = (healthy / Math.max(1, total)) * circ;
  const wShare = (watch / Math.max(1, total)) * circ;

  // Tone for the tile accent rail: danger if any critical, warning if watch,
  // accent (calm) otherwise.
  const tone: "danger" | "warning" | "accent" =
    critical > 0 ? "danger" : watch > 0 ? "warning" : "accent";

  return (
    <Link
      href="/planning/inventory-flow"
      data-tone={tone}
      className={cn(
        "kpi-tile is-link group block focus-visible:outline-none focus-visible:ring-2",
        tone === "danger"
          ? "focus-visible:ring-danger/40"
          : "focus-visible:ring-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-tile-label">Stock health</div>
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-faint">
          {total} items
        </span>
      </div>
      {loading ? (
        <div className="mt-2 flex items-center gap-5">
          <div
            className="relative overflow-hidden rounded-full bg-bg-muted"
            style={{ height: size, width: size }}
            aria-hidden
          />
          <div className="flex flex-1 flex-col gap-2">
            <div
              className="relative overflow-hidden rounded bg-bg-muted"
              style={{ height: 14 }}
              aria-hidden
            />
            <div
              className="relative overflow-hidden rounded bg-bg-muted"
              style={{ height: 14 }}
              aria-hidden
            />
            <div
              className="relative overflow-hidden rounded bg-bg-muted"
              style={{ height: 14 }}
              aria-hidden
            />
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-5">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`Stock health across ${total} items: ${healthy} healthy, ${watch} on watch, ${critical} critical.`}
            className="shrink-0"
          >
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              className="stroke-border/40"
              strokeWidth={12}
            />
            {arc(healthy, "stroke-success", 0)}
            {arc(watch, "stroke-warning", -hShare)}
            {arc(critical, "stroke-danger", -(hShare + wShare))}
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              className="dash-donut-center-value"
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              className="dash-donut-center-label"
            >
              ITEMS
            </text>
          </svg>
          <div className="flex flex-1 flex-col gap-2 text-xs">
            <LegendRow tone="success" label="Healthy" n={healthy} total={total} />
            <LegendRow tone="warning" label="Watch" n={watch} total={total} />
            <LegendRow tone="danger" label="Critical" n={critical} total={total} />
          </div>
        </div>
      )}
      <div className="kpi-tile-cta">
        <span>Open inventory flow</span>
        <ArrowRight className="kpi-tile-cta-arrow" strokeWidth={2} aria-hidden />
      </div>
    </Link>
  );
}

function LegendRow({
  tone,
  label,
  n,
  total,
}: {
  tone: "success" | "warning" | "danger";
  label: string;
  n: number;
  total: number;
}) {
  const pct = total > 0 ? (n / total) * 100 : 0;
  const dotClass =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-danger";
  const barClass =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-danger";
  return (
    <div className="dash-legend-row">
      <span className={cn("dot", dotClass)} aria-hidden />
      <span className="flex-1 text-fg-muted">{label}</span>
      <div className="dash-legend-bar-track" aria-hidden>
        <div
          className={cn("dash-legend-bar-fill", barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right font-semibold tabular-nums text-fg-strong">
        {n}
      </span>
    </div>
  );
}

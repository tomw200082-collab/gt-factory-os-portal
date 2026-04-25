"use client";

// ---------------------------------------------------------------------------
// KpiTiles — live dashboard counts.
//
// Renders three tiles side-by-side on md+, stacked on mobile:
//   1. Exceptions open       — /api/exceptions?status=open
//   2. Planning runs         — /api/planning/runs
//   3. Forecasts in draft    — /api/forecasts/versions?status=draft
//
// Each tile is a link to the underlying page's filtered view so a tap is
// one hop from signal to action. Counts degrade honestly: "—" with tooltip
// if the query errors (rather than rendering zero and lying).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, LineChart } from "lucide-react";
import { cn } from "@/lib/cn";

interface ListEnvelope {
  count: number;
  rows?: unknown[];
}

async function fetchCount(url: string): Promise<number> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  const data = (await res.json()) as ListEnvelope;
  // Prefer explicit `count`; fall back to rows.length; fall back to 0.
  if (typeof data.count === "number") return data.count;
  if (Array.isArray(data.rows)) return data.rows.length;
  return 0;
}

interface TileProps {
  label: string;
  href: string;
  Icon: typeof AlertTriangle;
  queryKey: readonly unknown[];
  queryUrl: string;
  tone: "danger" | "info" | "warning";
}

function Tile({ label, href, Icon, queryKey, queryUrl, tone }: TileProps) {
  const q = useQuery({
    queryKey,
    queryFn: () => fetchCount(queryUrl),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const toneClasses =
    tone === "danger"
      ? "border-danger/30 bg-danger-softer"
      : tone === "warning"
        ? "border-warning/30 bg-warning-softer"
        : "border-info/30 bg-info-softer";
  const iconClass =
    tone === "danger"
      ? "text-danger-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : "text-info-fg";

  let display: string;
  let ariaLive: "polite" | "off" = "polite";
  if (q.isLoading) {
    display = "…";
    ariaLive = "off";
  } else if (q.isError) {
    display = "—";
  } else {
    display = String(q.data ?? 0);
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[6rem] items-start gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-bg-subtle",
        toneClasses,
      )}
      data-testid={`kpi-tile-${queryKey.join("-")}`}
    >
      <Icon
        className={cn("mt-1 h-5 w-5 shrink-0", iconClass)}
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {label}
        </div>
        <div
          className="mt-1 text-3xl font-semibold tabular-nums text-fg-strong"
          aria-live={ariaLive}
          title={q.isError ? (q.error as Error).message : undefined}
        >
          {display}
        </div>
        <div className="mt-1 text-xs text-fg-muted">
          {q.isError ? "Unavailable — tap to open module" : "Tap to review"}
        </div>
      </div>
    </Link>
  );
}

export function KpiTiles() {
  return (
    <div
      className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
      data-testid="dashboard-kpi-tiles"
    >
      <Tile
        label="Exceptions open"
        href="/exceptions"
        Icon={AlertTriangle}
        queryKey={["kpi", "exceptions", "open"]}
        queryUrl="/api/exceptions?status=open"
        tone="danger"
      />
      <Tile
        label="Planning runs"
        href="/planning/runs"
        Icon={ClipboardList}
        queryKey={["kpi", "planning", "runs"]}
        queryUrl="/api/planning/runs"
        tone="info"
      />
      <Tile
        label="Forecasts draft"
        href="/planning/forecast"
        Icon={LineChart}
        queryKey={["kpi", "forecasts", "draft"]}
        queryUrl="/api/forecasts/versions?status=draft"
        tone="warning"
      />
    </div>
  );
}

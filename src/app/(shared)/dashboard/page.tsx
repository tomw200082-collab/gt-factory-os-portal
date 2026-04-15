"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleAlert,
  LineChart,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { ReadinessBadge } from "@/components/badges/ReadinessBadge";
import { SEED_DASHBOARD } from "@/lib/fixtures/dashboard";
import { cn } from "@/lib/cn";

export default function DashboardPage() {
  const d = SEED_DASHBOARD;

  return (
    <>
      <WorkflowHeader
        eyebrow="Control tower"
        title="Dashboard"
        description="Read-only. Tiles drill into filtered read models. This surface never writes."
        meta={
          <>
            <Badge tone="neutral" dotted>
              Run 2026-04-14 · 05:00
            </Badge>
            <Badge tone="warning" dotted>
              {d.exceptions_summary.critical + d.exceptions_summary.warning} open exceptions
            </Badge>
          </>
        }
        actions={
          <Link href="/exceptions" className="btn btn-sm gap-1.5">
            Review exceptions
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StockHealthTile d={d} />
          <PlanningRunTile d={d} />
          <ExceptionsTile d={d} />
          <ReadinessTile d={d} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <SectionCard
            eyebrow="Stockout risk · next 8 weeks"
            title="Shortage watch"
            description="Items projected to go short within the planning horizon. Drill into purchase recommendations to act."
            actions={
              <Link
                href="/planning/purchase-recommendations"
                className="btn btn-ghost btn-sm gap-1.5"
              >
                Open recommendations
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            }
          >
            <ul className="divide-y divide-border/60">
              {d.shortage_risk.map((r, i) => (
                <li
                  key={r.item_id}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div
                    className={cn(
                      "flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded border text-center font-mono leading-none tabular-nums",
                      r.days_to_stockout <= 2
                        ? "border-danger/40 bg-danger-softer text-danger-fg"
                        : r.days_to_stockout <= 5
                          ? "border-warning/40 bg-warning-softer text-warning-fg"
                          : "border-border/70 bg-bg-subtle text-fg-muted"
                    )}
                  >
                    <span className="text-sm font-semibold">
                      {r.days_to_stockout}
                    </span>
                    <span className="mt-0.5 text-3xs uppercase tracking-sops">
                      days
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg-strong">
                      {r.item_name}
                    </div>
                    <div className="font-mono text-3xs tabular-nums text-fg-subtle">
                      on hand · {r.on_hand} {r.unit}
                    </div>
                  </div>
                  <div className="text-3xs font-mono uppercase tracking-sops text-fg-subtle">
                    #{String(i + 1).padStart(2, "0")}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            eyebrow="Integration health"
            title="Data freshness"
            description="Time since each source last delivered."
          >
            <div className="space-y-3">
              <FreshLine
                label="Ledger posting"
                lastAt={d.freshness.ledger_last_post_at}
                warnAfterMinutes={60}
              />
              <FreshLine
                label="LionWheel orders"
                lastAt={d.freshness.lionwheel_last_sync_at}
                warnAfterMinutes={30}
                sub="Operational source — open orders + shipments"
              />
              <FreshLine
                label="Shopify stock"
                lastAt={d.freshness.shopify_last_sync_at}
                warnAfterMinutes={120}
                sub="FG sync · outbound"
              />
              <FreshLine
                label="Green Invoice"
                lastAt={d.freshness.greeninvoice_last_pull_at}
                warnAfterMinutes={24 * 60}
                failAfterMinutes={48 * 60}
                sub="Price evidence · threshold-guarded"
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function FreshLine({
  label,
  lastAt,
  sub,
  warnAfterMinutes,
  failAfterMinutes,
}: {
  label: string;
  lastAt?: string;
  sub?: string;
  warnAfterMinutes?: number;
  failAfterMinutes?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-fg-strong">
          {label}
        </div>
        {sub ? <div className="truncate text-3xs text-fg-subtle">{sub}</div> : null}
      </div>
      <FreshnessBadge
        lastAt={lastAt}
        warnAfterMinutes={warnAfterMinutes}
        failAfterMinutes={failAfterMinutes}
        compact
      />
    </div>
  );
}

function StockHealthTile({ d }: { d: typeof SEED_DASHBOARD }) {
  const healthPct = Math.round(
    (d.stock_health.healthy / d.stock_health.total_items) * 100
  );
  return (
    <TileShell
      eyebrow="Stock health"
      icon={<Boxes className="h-3.5 w-3.5" strokeWidth={2} />}
      value={d.stock_health.total_items}
      unit="items"
      accentPct={healthPct}
      trailing={
        <>
          <Badge tone="danger" dotted>
            {d.stock_health.in_shortage} short
          </Badge>
          <Badge tone="warning" dotted>
            {d.stock_health.in_overstock} over
          </Badge>
          <Badge tone="success" dotted>
            {d.stock_health.healthy} healthy
          </Badge>
        </>
      }
    />
  );
}

function PlanningRunTile({ d }: { d: typeof SEED_DASHBOARD }) {
  return (
    <TileShell
      eyebrow="Planning run"
      icon={<LineChart className="h-3.5 w-3.5" strokeWidth={2} />}
      value={d.planning_run.recommendation_count}
      unit="recs"
      trailing={
        <>
          <Badge tone="warning" dotted>
            {d.planning_run.flagged_count} flagged
          </Badge>
          <span className="text-3xs text-fg-subtle">last run 05:00</span>
        </>
      }
    />
  );
}

function ExceptionsTile({ d }: { d: typeof SEED_DASHBOARD }) {
  const total =
    d.exceptions_summary.critical +
    d.exceptions_summary.warning +
    d.exceptions_summary.info;
  const dominantTone =
    d.exceptions_summary.critical > 0
      ? "danger"
      : d.exceptions_summary.warning > 0
        ? "warning"
        : "neutral";
  return (
    <TileShell
      eyebrow="Exceptions"
      icon={<CircleAlert className="h-3.5 w-3.5" strokeWidth={2} />}
      value={total}
      unit="open"
      tone={dominantTone}
      trailing={
        <>
          <Badge tone="danger" dotted>
            {d.exceptions_summary.critical} crit
          </Badge>
          <Badge tone="warning" dotted>
            {d.exceptions_summary.warning} warn
          </Badge>
          <Badge tone="neutral" dotted>
            {d.exceptions_summary.info} info
          </Badge>
        </>
      }
    />
  );
}

function ReadinessTile({ d }: { d: typeof SEED_DASHBOARD }) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
        Readiness
      </div>
      <div className="mt-4 space-y-2.5">
        <ReadinessBadge
          label="Ledger integrity"
          status={d.readiness.ledger_integrity}
        />
        <ReadinessBadge label="Jobs health" status={d.readiness.jobs_health} />
        <ReadinessBadge
          label="Projection lag"
          status={d.readiness.projection_lag_seconds < 60 ? "ok" : "warn"}
          detail={`${d.readiness.projection_lag_seconds}s`}
        />
      </div>
    </div>
  );
}

interface TileShellProps {
  eyebrow: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  accentPct?: number;
  tone?: "neutral" | "danger" | "warning";
  trailing?: React.ReactNode;
}

function TileShell({
  eyebrow,
  icon,
  value,
  unit,
  accentPct,
  tone = "neutral",
  trailing,
}: TileShellProps) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {icon}
        {eyebrow}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div
          className={cn(
            "font-mono text-4xl font-semibold tabular-nums tracking-tighter leading-none",
            tone === "danger"
              ? "text-danger-fg"
              : tone === "warning"
                ? "text-warning-fg"
                : "text-fg-strong"
          )}
        >
          {value}
        </div>
        {unit ? (
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            {unit}
          </div>
        ) : null}
      </div>
      {accentPct != null ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${accentPct}%` }}
            />
          </div>
          <div className="font-mono text-3xs tabular-nums text-fg-muted">
            {accentPct}%
          </div>
        </div>
      ) : null}
      {trailing ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
          {trailing}
        </div>
      ) : null}
      <Zap
        className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 text-accent/[0.04]"
        strokeWidth={1.5}
        aria-hidden
      />
    </div>
  );
}

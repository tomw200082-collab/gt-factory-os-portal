"use client";

// ---------------------------------------------------------------------------
// WeekPanel — Band 3, "The Week" (Tranche 061).
//
// One panel, two premium cards, three answers Tom asked for by name:
//   PROCUREMENT (₪): how much money goes out this week on RM+PKG per the
//   planning-driven session · what was decided but not recorded as a PO ·
//   what ordered goods still wait to be received.
//   PRODUCTION: runs done vs planned this week + today's position.
//
// Reuses the .kpi-tile premium shell (tone rail, icon halo, big tabular
// number) so the page keeps one visual language. Money card renders only
// for cost-aware roles — the production card goes full-width for operators.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Factory, PackageSearch, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountUp } from "../CountUp";
import type { WeekProcurement } from "../../_lib/week";

export interface WeekPanelProps {
  /** Cost-aware roles only; null hides the money card entirely. */
  procurement: {
    week: WeekProcurement;
    sessionExists: boolean;
    awaitingReceipt: { count: number; valueIls: number; late: number };
    loading: boolean;
  } | null;
  production: {
    totalRuns: number;
    doneRuns: number;
    today: { planned: number; done: number; nextItem: string | null } | null;
    slipped: number | null;
    loading: boolean;
  };
  /** Compact ₪ formatter from the page (single source of truth). */
  fmtMoney: (n: number) => string;
  /** Full-precision ₪ formatter for tooltips. */
  fmtMoneyFull: (n: number) => string;
}

function DetailRow({
  label,
  value,
  href,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  emphasis?: "danger" | "warning";
}) {
  const body = (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          emphasis === "danger"
            ? "font-semibold text-danger"
            : emphasis === "warning"
              ? "font-semibold text-warning-fg"
              : "text-fg-muted",
        )}
      >
        {label}
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-fg-strong">{value}</span>
      {href ? (
        <ArrowRight className="h-3 w-3 shrink-0 text-fg-faint" strokeWidth={2} aria-hidden />
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="dash-week-row group is-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {body}
      </Link>
    );
  }
  return <div className="dash-week-row">{body}</div>;
}

function ValueSkeleton() {
  return (
    <div className="relative mt-1 h-10 w-32 overflow-hidden rounded bg-bg-muted" aria-hidden>
      <div
        className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-bg-raised/80 to-transparent motion-reduce:hidden"
        style={{ animation: "gt-shimmer 1.5s ease-in-out infinite" }}
      />
    </div>
  );
}

export function WeekPanel({ procurement, production, fmtMoney, fmtMoneyFull }: WeekPanelProps) {
  const twoUp = procurement !== null;
  return (
    <section
      aria-label="This week"
      data-testid="week-panel"
      className={cn("grid grid-cols-1 gap-4", twoUp && "lg:grid-cols-2")}
    >
      {procurement ? (
        <Link
          href="/planning/procurement"
          data-tone="accent"
          data-testid="week-procurement"
          className="kpi-tile is-link group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="kpi-tile-label">Procurement this week</div>
            <div className="kpi-tile-icon" aria-hidden>
              <ShoppingCart className="h-5 w-5" strokeWidth={2} />
            </div>
          </div>
          {procurement.loading ? (
            <ValueSkeleton />
          ) : !procurement.sessionExists ? (
            <div className="text-lg font-semibold text-fg-muted">
              No purchase session yet
            </div>
          ) : (
            <div>
              <div
                className="kpi-tile-value"
                title={fmtMoneyFull(procurement.week.toOrderIls)}
              >
                <CountUp value={fmtMoney(procurement.week.toOrderIls)} />
              </div>
              {/* FLOW-D10: the meaning sits ADJACENT to the number — this is
                  money not yet spent, not a budget or a total. */}
              <div className="mt-0.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                Still to order this week
              </div>
            </div>
          )}
          <div className="kpi-tile-sub">
            {procurement.sessionExists
              ? `${procurement.week.toOrderCount} supplier order${
                  procurement.week.toOrderCount !== 1 ? "s" : ""
                } from the planning session${
                  procurement.week.foreignCount > 0
                    ? ` · +${procurement.week.foreignCount} foreign-currency`
                    : ""
                }`
              : "Start the weekly session to turn the production plan into supplier orders."}
          </div>
          {!procurement.loading ? (
            <div className="flex flex-col gap-1">
              {/* Session-scoped rows — only meaningful while a session exists. */}
              {/* FLOW-D02: plain language naming the consequence — "recorded
                  as PO" was MRP jargon. */}
              {procurement.sessionExists && procurement.week.approvedNotPlacedCount > 0 ? (
                <DetailRow
                  emphasis="warning"
                  label={`Agreed with supplier, not in the system yet — ${procurement.week.approvedNotPlacedCount}`}
                  value={fmtMoney(procurement.week.approvedNotPlacedIls)}
                />
              ) : null}
              {procurement.sessionExists ? (
                <DetailRow
                  label={`Placed this week — ${procurement.week.placedCount}`}
                  value={fmtMoney(procurement.week.placedIls)}
                />
              ) : null}
              {/* Receiving previously ordered goods is independent of this
                  week's session — always shown. */}
              <DetailRow
                emphasis={procurement.awaitingReceipt.late > 0 ? "danger" : undefined}
                label={`Awaiting receipt — ${procurement.awaitingReceipt.count} PO${
                  procurement.awaitingReceipt.count !== 1 ? "s" : ""
                }${
                  procurement.awaitingReceipt.late > 0
                    ? ` (${procurement.awaitingReceipt.late} late)`
                    : ""
                }`}
                value={fmtMoney(procurement.awaitingReceipt.valueIls)}
              />
            </div>
          ) : null}
          <div className="kpi-tile-cta">
            <span>{procurement.sessionExists ? "Open procurement" : "Start session"}</span>
            <ArrowRight className="kpi-tile-cta-arrow" strokeWidth={2} aria-hidden />
          </div>
        </Link>
      ) : null}

      <Link
        href="/planning/production-plan"
        data-tone="info"
        data-testid="week-production"
        className="kpi-tile is-link group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="kpi-tile-label">Production this week</div>
          <div className="kpi-tile-icon" aria-hidden>
            <Factory className="h-5 w-5" strokeWidth={2} />
          </div>
        </div>
        {production.loading ? (
          <ValueSkeleton />
        ) : (
          <div className="kpi-tile-value" title="Runs posted complete vs planned this week">
            <CountUp value={String(production.doneRuns)} />
            <span className="text-fg-faint">/{production.totalRuns}</span>
          </div>
        )}
        <div className="kpi-tile-sub">
          Runs completed this week
          {production.today
            ? ` · today ${production.today.done}/${production.today.planned}${
                production.today.nextItem ? ` · next: ${production.today.nextItem}` : ""
              }`
            : " · no runs planned today"}
        </div>
        {/* FLOW-D05: action language, not system status — "no posted actual"
            was developer vocabulary. */}
        {!production.loading && (production.slipped ?? 0) > 0 ? (
          <div className="flex flex-col gap-1">
            <DetailRow
              emphasis="warning"
              label={`Production overdue — ${production.slipped} run${
                (production.slipped ?? 0) !== 1 ? "s" : ""
              } need${(production.slipped ?? 0) === 1 ? "s" : ""} reporting`}
              value={production.slipped as number}
            />
          </div>
        ) : null}
        <div className="kpi-tile-cta">
          <span>Open production plan</span>
          <ArrowRight className="kpi-tile-cta-arrow" strokeWidth={2} aria-hidden />
        </div>
      </Link>

      {/* Receive CTA strip — goods that were ordered and are arriving. */}
      {procurement && procurement.awaitingReceipt.count > 0 ? (
        <Link
          href="/stock/receipts"
          data-testid="week-receive"
          className={cn(
            "group flex items-center gap-3 rounded-lg border bg-bg-raised px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:col-span-2",
            procurement.awaitingReceipt.late > 0
              ? "border-danger/40 hover:bg-danger-softer/30"
              : "border-border/70 hover:border-accent/50 hover:bg-accent-soft/20",
          )}
        >
          <PackageSearch
            className={cn(
              "h-4 w-4 shrink-0",
              procurement.awaitingReceipt.late > 0 ? "text-danger" : "text-accent",
            )}
            strokeWidth={2}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-fg-strong">
            <span className="font-semibold">Receive goods</span>
            <span className="text-fg-muted">
              {" — "}
              {procurement.awaitingReceipt.count} open order
              {procurement.awaitingReceipt.count !== 1 ? "s" : ""} on the way
              {procurement.awaitingReceipt.late > 0 ? (
                <span className="font-semibold text-danger">
                  {" "}
                  · {procurement.awaitingReceipt.late} late
                </span>
              ) : null}
            </span>
          </span>
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform duration-200 ease-out-quart group-hover:translate-x-0.5 motion-reduce:transition-none"
            strokeWidth={2}
            aria-hidden
          />
        </Link>
      ) : null}
    </section>
  );
}

"use client";

// ---------------------------------------------------------------------------
// /planning/weekly-outlook — Weekly Outlook page.
//
// Near-term operational snapshot for the planner. Answers:
//   • What is this week's demand vs. planned production vs. incoming supply?
//   • Where are the coverage gaps (at-risk and stockout items)?
//   • What receipts are expected this week?
//   • Day-by-day: is the week working out, and which days look tight?
//
// Data sources (real, in-product APIs):
//   • /api/inventory/flow — per-item daily demand/supply/projection
//   • /api/purchase-orders?status=OPEN — receipts due this week
//   • /api/v1/queries/inventory/planned-inflow — planned production by day
//
// Universal rules applied: WorkflowHeader, FreshnessBadge, EmptyState,
// shared error card, Badge tone vocabulary, English/LTR, names not IDs,
// icon discipline (only icons rendered are imported).
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarRange,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";

// ---- Date helpers -----------------------------------------------------------

function getWeekDays(anchor: Date = new Date()): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  );
}

function fmtNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ---- API types --------------------------------------------------------------

interface FlowDay {
  day: string;
  demand_lionwheel: number;
  demand_forecast: number;
  incoming_supply: number;
  incoming_supply_combined?: number;
  projected_on_hand_eod: number;
  projected_on_hand_eod_with_production?: number;
  is_working_day: boolean;
  holiday_name_he?: string | null;
}

interface FlowItem {
  item_id: string;
  item_name: string;
  risk_tier: string;
  days_of_cover: number;
  current_on_hand: number;
  days: FlowDay[];
}

interface FlowResponse {
  items: FlowItem[];
  as_of?: string;
}

interface PurchaseOrder {
  po_id: string;
  po_number: string | null;
  supplier_name: string | null;
  supplier_id: string | null;
  status: string;
  expected_delivery_date: string | null;
}

interface PoListEnvelope {
  rows: PurchaseOrder[];
}

interface PlannedInflowRow {
  plan_date: string;
  planned_qty_total: number;
  planned_remaining_qty: number;
  completed_qty_total: number;
}

interface PlannedInflowResponse {
  rows: PlannedInflowRow[];
}

// ---- Fetch helpers ----------------------------------------------------------

async function fetchFlow(): Promise<FlowResponse> {
  const res = await fetch(
    "/api/inventory/flow?horizon_weeks=2&at_risk_only=false",
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Flow API error: ${res.status}`);
  return res.json() as Promise<FlowResponse>;
}

async function fetchOpenPos(): Promise<PurchaseOrder[]> {
  const res = await fetch("/api/purchase-orders?status=OPEN&limit=200", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const env = (await res.json()) as PoListEnvelope;
  return env.rows ?? [];
}

async function fetchPlannedInflow(): Promise<PlannedInflowRow[]> {
  const res = await fetch("/api/v1/queries/inventory/planned-inflow", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const env = (await res.json()) as PlannedInflowResponse;
  return env.rows ?? [];
}

// ---- Day aggregate ----------------------------------------------------------

interface DayAggregate {
  date: Date;
  iso: string;
  isWorkingDay: boolean;
  totalDemand: number;
  totalIncoming: number;
  plannedProduction: number;
  atRiskCount: number;
  stockoutCount: number;
}

function buildDayAggregates(
  days: Date[],
  items: FlowItem[],
  plannedInflow: PlannedInflowRow[],
): DayAggregate[] {
  const plannedByDate = new Map<string, number>();
  for (const row of plannedInflow) {
    plannedByDate.set(
      row.plan_date,
      (plannedByDate.get(row.plan_date) ?? 0) +
        (row.planned_remaining_qty ?? 0),
    );
  }

  return days.map((day) => {
    const iso = toIsoDate(day);
    let totalDemand = 0;
    let totalIncoming = 0;
    let isWorkingDay = true;
    let atRiskCount = 0;
    let stockoutCount = 0;

    for (const item of items) {
      const fd = item.days.find((d) => d.day === iso);
      if (!fd) continue;
      totalDemand += fd.demand_lionwheel + fd.demand_forecast;
      totalIncoming += fd.incoming_supply_combined ?? fd.incoming_supply;
      if (!fd.is_working_day) isWorkingDay = false;
    }
    for (const item of items) {
      if (item.risk_tier === "critical" || item.risk_tier === "stockout") {
        atRiskCount++;
      }
      if (item.risk_tier === "stockout") {
        stockoutCount++;
      }
    }

    return {
      date: day,
      iso,
      isWorkingDay,
      totalDemand,
      totalIncoming,
      plannedProduction: plannedByDate.get(iso) ?? 0,
      atRiskCount,
      stockoutCount,
    };
  });
}

// ---- Risk tone --------------------------------------------------------------

type RiskTone = "success" | "warning" | "danger" | "neutral";

function riskTierLabel(tier: string): string {
  switch (tier) {
    case "stockout":
      return "Stockout";
    case "critical":
      return "Critical";
    case "watch":
      return "Watch";
    case "ok":
      return "OK";
    default:
      return tier || "Unknown";
  }
}

function riskTierTone(tier: string): RiskTone {
  switch (tier) {
    case "stockout":
      return "danger";
    case "critical":
      return "danger";
    case "watch":
      return "warning";
    case "ok":
      return "success";
    default:
      return "neutral";
  }
}

// ---- CalendarStrip ----------------------------------------------------------

interface CalendarStripProps {
  aggregates: DayAggregate[];
  maxVal: number;
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
}

function CalendarStrip({
  aggregates,
  maxVal,
  selectedDay,
  onSelectDay,
}: CalendarStripProps) {
  const safeMax = Math.max(maxVal, 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-[640px] pb-1">
        {aggregates.map((day) => {
          const isToday_ = isToday(day.date);
          const isSelected = selectedDay === day.iso;
          const demandPct = Math.round((day.totalDemand / safeMax) * 100);
          const prodPct = Math.round(
            (day.plannedProduction / safeMax) * 100,
          );

          const dayBg = !day.isWorkingDay
            ? "bg-bg-muted/60 border-transparent"
            : day.stockoutCount > 0
              ? "bg-danger-softer/30 border-danger/30"
              : day.atRiskCount > 0
                ? "bg-warning-softer/30 border-warning/30"
                : "bg-bg-raised border-border/60";

          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : day.iso)}
              aria-pressed={isSelected}
              aria-label={`${fmtDayLabel(day.date)} ${fmtDateLabel(
                day.date,
              )} — demand ${fmtNumber(day.totalDemand)}, planned production ${fmtNumber(
                day.plannedProduction,
              )}`}
              className={cn(
                "relative flex-1 min-w-[80px] rounded border p-2.5 flex flex-col gap-2 cursor-pointer select-none text-left transition-all hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                dayBg,
                isToday_ && "ring-2 ring-accent/50",
                isSelected && "ring-2 ring-accent shadow-sm",
              )}
            >
              <div>
                <div
                  className={cn(
                    "text-3xs font-bold uppercase tracking-sops",
                    isToday_ ? "text-accent" : "text-fg-muted",
                  )}
                >
                  {fmtDayLabel(day.date)}
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    day.stockoutCount > 0
                      ? "text-danger-fg"
                      : day.atRiskCount > 0
                        ? "text-warning-fg"
                        : isToday_
                          ? "text-accent"
                          : "text-fg-strong",
                  )}
                >
                  {fmtDateLabel(day.date)}
                </div>
                {isToday_ && (
                  <div className="text-3xs text-accent font-semibold">
                    Today
                  </div>
                )}
                {!day.isWorkingDay && (
                  <div className="text-3xs text-fg-faint">Non-working</div>
                )}
              </div>

              {day.isWorkingDay && (
                <div className="flex items-end justify-center gap-1 h-12">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className="w-full bg-bg-muted rounded-sm overflow-hidden"
                      style={{ height: "44px" }}
                    >
                      <div
                        className="bg-warning/70 w-full rounded-sm"
                        style={{
                          height: `${demandPct}%`,
                          marginTop: `${100 - demandPct}%`,
                        }}
                        title={`Demand: ${fmtNumber(day.totalDemand)}`}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className="w-full bg-bg-muted rounded-sm overflow-hidden"
                      style={{ height: "44px" }}
                    >
                      <div
                        className="bg-accent/70 w-full rounded-sm"
                        style={{
                          height: `${prodPct}%`,
                          marginTop: `${100 - prodPct}%`,
                        }}
                        title={`Planned production: ${fmtNumber(
                          day.plannedProduction,
                        )}`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {(day.atRiskCount > 0 || day.stockoutCount > 0) && (
                <div className="flex items-center justify-center gap-1">
                  {day.stockoutCount > 0 && (
                    <span className="text-3xs text-danger-fg font-semibold">
                      {day.stockoutCount} short
                    </span>
                  )}
                  {day.atRiskCount > 0 && day.stockoutCount === 0 && (
                    <span className="text-3xs text-warning-fg font-semibold">
                      {day.atRiskCount} at risk
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2 text-3xs text-fg-faint min-w-[640px]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-warning/70" />
          Demand
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent/70" />
          Planned production
        </span>
        <span className="ml-auto">Click a day for detail</span>
      </div>
    </div>
  );
}

// ---- Stat card --------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}

function StatCard({ label, value, hint, tone = "neutral" }: StatCardProps) {
  const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
    neutral: "border-border/70",
    success: "border-success/40 bg-success-softer/30",
    warning: "border-warning/40 bg-warning-softer/30",
    danger: "border-danger/40 bg-danger-softer/30",
  };
  const valueTone: Record<NonNullable<StatCardProps["tone"]>, string> = {
    neutral: "text-fg-strong",
    success: "text-success-fg",
    warning: "text-warning-fg",
    danger: "text-danger-fg",
  };
  return (
    <div
      className={cn(
        "rounded border bg-bg-raised p-3 flex flex-col gap-1",
        toneClasses[tone],
      )}
    >
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
        {label}
      </div>
      <div
        className={cn("text-xl font-semibold tabular-nums", valueTone[tone])}
      >
        {value}
      </div>
      {hint && <div className="text-3xs text-fg-faint">{hint}</div>}
    </div>
  );
}

// ---- Main page --------------------------------------------------------------

export default function WeeklyOutlookPage() {
  const weekDays = useMemo(() => getWeekDays(), []);
  const weekStart = useMemo(() => toIsoDate(weekDays[0]), [weekDays]);
  const weekEnd = useMemo(
    () => toIsoDate(weekDays[weekDays.length - 1]),
    [weekDays],
  );
  const weekLabel = `${fmtDateLabel(weekDays[0])} – ${fmtDateLabel(
    weekDays[6],
  )}`;

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ---- Queries ----------------------------------------------------------------

  const flowQuery = useQuery<FlowResponse>({
    queryKey: ["weekly-outlook", "flow"],
    queryFn: fetchFlow,
    staleTime: 30_000,
    refetchInterval: 60_000,
    throwOnError: false,
  });

  const posQuery = useQuery<PurchaseOrder[]>({
    queryKey: ["weekly-outlook", "pos"],
    queryFn: fetchOpenPos,
    staleTime: 60_000,
    throwOnError: false,
  });

  const inflowQuery = useQuery<PlannedInflowRow[]>({
    queryKey: ["weekly-outlook", "planned-inflow"],
    queryFn: fetchPlannedInflow,
    staleTime: 60_000,
    throwOnError: false,
  });

  const items = flowQuery.data?.items ?? [];
  const pos = posQuery.data ?? [];
  const plannedInflow = inflowQuery.data ?? [];

  const dayAggregates = useMemo(
    () => buildDayAggregates(weekDays, items, plannedInflow),
    [weekDays, items, plannedInflow],
  );

  const weekTotals = useMemo(() => {
    const workingDays = dayAggregates.filter((d) => d.isWorkingDay);
    const weekTotalDemand = workingDays.reduce(
      (s, d) => s + d.totalDemand,
      0,
    );
    const weekTotalIncoming = dayAggregates.reduce(
      (s, d) => s + d.totalIncoming,
      0,
    );
    const weekTotalProduction = workingDays.reduce(
      (s, d) => s + d.plannedProduction,
      0,
    );
    const weekCoveredPct =
      weekTotalDemand > 0
        ? Math.min(
            Math.round(
              ((weekTotalIncoming + weekTotalProduction) / weekTotalDemand) *
                100,
            ),
            100,
          )
        : 100;
    return {
      weekTotalDemand,
      weekTotalIncoming,
      weekTotalProduction,
      weekCoveredPct,
    };
  }, [dayAggregates]);

  const receiptsThisWeek = useMemo(
    () =>
      pos.filter(
        (po) =>
          po.expected_delivery_date &&
          po.expected_delivery_date >= weekStart &&
          po.expected_delivery_date <= weekEnd,
      ),
    [pos, weekStart, weekEnd],
  );

  const atRiskItems = useMemo(
    () =>
      items
        .filter(
          (it) =>
            it.risk_tier === "critical" || it.risk_tier === "stockout",
        )
        .sort((a, b) => {
          // Stockouts first, then by days_of_cover ascending
          if (a.risk_tier === "stockout" && b.risk_tier !== "stockout")
            return -1;
          if (b.risk_tier === "stockout" && a.risk_tier !== "stockout")
            return 1;
          return a.days_of_cover - b.days_of_cover;
        }),
    [items],
  );

  const stockoutCount = useMemo(
    () => items.filter((it) => it.risk_tier === "stockout").length,
    [items],
  );

  const atRiskCount = atRiskItems.length;

  const maxVal = useMemo(
    () =>
      Math.max(
        ...dayAggregates.map((d) =>
          Math.max(d.totalDemand, d.plannedProduction),
        ),
        1,
      ),
    [dayAggregates],
  );

  const isLoading = flowQuery.isLoading;
  const isError = flowQuery.isError;

  // ---- Selected day detail ----------------------------------------------------

  const selectedDayAggregate = useMemo(
    () =>
      selectedDay
        ? (dayAggregates.find((d) => d.iso === selectedDay) ?? null)
        : null,
    [dayAggregates, selectedDay],
  );

  const selectedDayItems = useMemo(() => {
    if (!selectedDay) return [];
    return items
      .map((it) => {
        const day = it.days.find((d) => d.day === selectedDay);
        if (!day) return null;
        const demand = day.demand_lionwheel + day.demand_forecast;
        const incoming = day.incoming_supply_combined ?? day.incoming_supply;
        return {
          item_id: it.item_id,
          item_name: it.item_name,
          risk_tier: it.risk_tier,
          demand,
          incoming,
          projected:
            day.projected_on_hand_eod_with_production ??
            day.projected_on_hand_eod,
        };
      })
      .filter(
        (
          row,
        ): row is {
          item_id: string;
          item_name: string;
          risk_tier: string;
          demand: number;
          incoming: number;
          projected: number;
        } => row !== null && (row.demand > 0 || row.incoming > 0),
      )
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 12);
  }, [items, selectedDay]);

  const selectedDayReceipts = useMemo(() => {
    if (!selectedDay) return [];
    return pos.filter((po) => po.expected_delivery_date === selectedDay);
  }, [pos, selectedDay]);

  // ---- Render -----------------------------------------------------------------

  if (isLoading) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Planning workspace"
          title="Weekly outlook"
          description="Near-term view of demand, planned production, and coverage gaps."
        />
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse h-24 rounded border border-border/60 bg-bg-raised"
              />
            ))}
          </div>
          <div className="animate-pulse h-40 rounded border border-border/60 bg-bg-raised" />
          <div className="animate-pulse h-64 rounded border border-border/60 bg-bg-raised" />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Planning workspace"
          title="Weekly outlook"
          description="Near-term view of demand, planned production, and coverage gaps."
        />
        <div className="mt-6 rounded border border-danger/30 bg-danger-softer p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="h-5 w-5 text-danger-fg shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-danger-fg">
                Could not load weekly outlook
              </h2>
              <p className="mt-1 text-xs text-fg-muted">
                {flowQuery.error instanceof Error
                  ? flowQuery.error.message
                  : "The inventory flow API did not respond."}
              </p>
              <button
                type="button"
                onClick={() => flowQuery.refetch()}
                className="mt-3 inline-flex items-center gap-1.5 rounded border border-danger/40 bg-bg-raised px-3 py-1.5 text-xs font-semibold text-danger-fg hover:bg-danger-softer/60 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Retry
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const hasNoData = items.length === 0;

  // Coverage tone: success >=95, warning >=70, danger <70
  const coverageTone: StatCardProps["tone"] =
    weekTotals.weekCoveredPct >= 95
      ? "success"
      : weekTotals.weekCoveredPct >= 70
        ? "warning"
        : "danger";

  const atRiskTone: StatCardProps["tone"] =
    stockoutCount > 0 ? "danger" : atRiskCount > 0 ? "warning" : "success";

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Weekly outlook"
        description="Near-term view of demand, planned production, and coverage gaps."
        meta={
          <>
            <Badge tone="accent" variant="soft" dotted>
              <CalendarRange className="h-3 w-3" strokeWidth={2} />
              {weekLabel}
            </Badge>
            {flowQuery.data?.as_of && (
              <FreshnessBadge
                label="As of"
                lastAt={flowQuery.data.as_of}
                producer="inventory_flow"
              />
            )}
          </>
        }
        actions={
          <Link
            href="/planning/inventory-flow"
            className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-bg-raised px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-accent/40 hover:text-fg-strong"
          >
            <Package className="h-3.5 w-3.5" strokeWidth={2} />
            Full inventory flow
          </Link>
        }
      />

      {hasNoData ? (
        <div className="mt-6">
          <EmptyState
            title="No data for this week"
            description="The inventory flow query returned no items for the current horizon. Make sure a forecast version is published and the planning data is fresh."
            action={
              <Link
                href="/planning/forecast"
                className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-bg-raised px-3 py-1.5 text-xs font-semibold text-fg-muted hover:border-accent/40 hover:text-fg-strong transition-colors"
              >
                Open forecasts
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/* Stat cards row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Week demand"
              value={fmtNumber(weekTotals.weekTotalDemand)}
              hint="LionWheel + forecast (working days)"
            />
            <StatCard
              label="Planned production"
              value={fmtNumber(weekTotals.weekTotalProduction)}
              hint="Open production plans"
            />
            <StatCard
              label="Demand covered"
              value={`${weekTotals.weekCoveredPct}%`}
              hint="Incoming + production / demand"
              tone={coverageTone}
            />
            <StatCard
              label="At risk"
              value={fmtNumber(atRiskCount)}
              hint={
                stockoutCount > 0
                  ? `${stockoutCount} stockout${stockoutCount === 1 ? "" : "s"}`
                  : "Items below cover threshold"
              }
              tone={atRiskTone}
            />
          </div>

          {/* Calendar strip */}
          <SectionCard
            eyebrow="7-day strip"
            title="Day by day"
            description="Demand and planned production per day. Click a day for item-level detail."
          >
            <CalendarStrip
              aggregates={dayAggregates}
              maxVal={maxVal}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </SectionCard>

          {/* Selected day detail */}
          {selectedDay && selectedDayAggregate && (
            <SectionCard
              eyebrow={fmtDayLabel(selectedDayAggregate.date)}
              title={fmtDateLabel(selectedDayAggregate.date)}
              description={
                selectedDayAggregate.isWorkingDay
                  ? `Demand ${fmtNumber(
                      selectedDayAggregate.totalDemand,
                    )} · Incoming ${fmtNumber(
                      selectedDayAggregate.totalIncoming,
                    )} · Planned production ${fmtNumber(
                      selectedDayAggregate.plannedProduction,
                    )}`
                  : "Non-working day"
              }
              actions={
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="text-xs text-fg-muted hover:text-fg-strong underline-offset-2 hover:underline"
                >
                  Close
                </button>
              }
            >
              <div className="space-y-4">
                {selectedDayItems.length === 0 ? (
                  <p className="text-sm text-fg-muted">
                    No item-level activity for this day.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-left">
                          <th className="py-2 pr-3 font-semibold text-fg-muted">
                            Item
                          </th>
                          <th className="py-2 pr-3 font-semibold text-fg-muted text-right">
                            Demand
                          </th>
                          <th className="py-2 pr-3 font-semibold text-fg-muted text-right">
                            Incoming
                          </th>
                          <th className="py-2 pr-3 font-semibold text-fg-muted text-right">
                            Projected EOD
                          </th>
                          <th className="py-2 pr-3 font-semibold text-fg-muted">
                            Risk
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDayItems.map((row) => (
                          <tr
                            key={row.item_id}
                            className="border-b border-border/30 last:border-0"
                          >
                            <td className="py-2 pr-3">
                              <span
                                className="font-medium text-fg-strong"
                                title={row.item_id}
                              >
                                {row.item_name}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-fg-strong">
                              {fmtNumber(row.demand)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-fg-muted">
                              {fmtNumber(row.incoming)}
                            </td>
                            <td
                              className={cn(
                                "py-2 pr-3 text-right tabular-nums",
                                row.projected < 0
                                  ? "text-danger-fg font-semibold"
                                  : "text-fg-strong",
                              )}
                            >
                              {fmtNumber(row.projected)}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge
                                tone={riskTierTone(row.risk_tier)}
                                variant="soft"
                              >
                                {riskTierLabel(row.risk_tier)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedDayReceipts.length > 0 && (
                  <div>
                    <div className="text-3xs font-semibold uppercase tracking-sops text-fg-muted mb-2">
                      Receipts expected this day
                    </div>
                    <ul className="space-y-1">
                      {selectedDayReceipts.map((po) => (
                        <li
                          key={po.po_id}
                          className="flex items-center justify-between gap-3 rounded border border-border/40 bg-bg-subtle px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Truck
                              className="h-3.5 w-3.5 text-fg-muted shrink-0"
                              strokeWidth={2}
                            />
                            <span
                              className="font-medium text-fg-strong truncate"
                              title={po.po_id}
                            >
                              {po.supplier_name ?? "Unknown supplier"}
                            </span>
                            <span className="text-fg-faint">
                              {po.po_number ?? "—"}
                            </span>
                          </div>
                          <Link
                            href={`/purchase-orders/${po.po_id}`}
                            className="text-fg-muted hover:text-accent text-3xs font-semibold uppercase tracking-sops"
                          >
                            View
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* At-risk items */}
          <SectionCard
            eyebrow="Coverage gaps"
            title="At-risk items"
            description="Items with critical or stockout risk in the current horizon. Sorted: stockouts first, then by days of cover."
            tone={stockoutCount > 0 ? "danger" : atRiskCount > 0 ? "warning" : "default"}
          >
            {atRiskItems.length === 0 ? (
              <EmptyState
                title="No coverage gaps"
                description="Every item has adequate cover for the current horizon. Keep the forecast and planning runs current."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-left">
                      <th className="py-2 pr-3 font-semibold text-fg-muted">
                        Item
                      </th>
                      <th className="py-2 pr-3 font-semibold text-fg-muted text-right">
                        On hand
                      </th>
                      <th className="py-2 pr-3 font-semibold text-fg-muted text-right">
                        Days of cover
                      </th>
                      <th className="py-2 pr-3 font-semibold text-fg-muted">
                        Risk
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {atRiskItems.slice(0, 20).map((it) => (
                      <tr
                        key={it.item_id}
                        className="border-b border-border/30 last:border-0"
                      >
                        <td className="py-2 pr-3">
                          <Link
                            href={`/planning/inventory-flow#${it.item_id}`}
                            className="font-medium text-fg-strong hover:text-accent transition-colors"
                            title={it.item_id}
                          >
                            {it.item_name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-fg-strong">
                          {fmtNumber(it.current_on_hand)}
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right tabular-nums font-semibold",
                            it.days_of_cover <= 0
                              ? "text-danger-fg"
                              : it.days_of_cover < 3
                                ? "text-warning-fg"
                                : "text-fg-strong",
                          )}
                        >
                          {it.days_of_cover.toFixed(1)}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            tone={riskTierTone(it.risk_tier)}
                            variant="soft"
                          >
                            {riskTierLabel(it.risk_tier)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {atRiskItems.length > 20 && (
                  <p className="mt-2 text-3xs text-fg-faint">
                    Showing 20 of {atRiskItems.length}.{" "}
                    <Link
                      href="/planning/inventory-flow?at_risk=true"
                      className="text-accent hover:underline underline-offset-2"
                    >
                      See all in inventory flow
                    </Link>
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {/* Receipts this week */}
          <SectionCard
            eyebrow="Inbound supply"
            title="Receipts expected this week"
            description="Open purchase orders with expected delivery between today and the end of the week."
          >
            {receiptsThisWeek.length === 0 ? (
              <EmptyState
                title="No receipts scheduled"
                description="No open purchase orders have an expected delivery date in this week's window."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-left">
                      <th className="py-2 pr-3 font-semibold text-fg-muted">
                        Supplier
                      </th>
                      <th className="py-2 pr-3 font-semibold text-fg-muted">
                        PO
                      </th>
                      <th className="py-2 pr-3 font-semibold text-fg-muted">
                        Expected
                      </th>
                      <th className="py-2 pr-3 font-semibold text-fg-muted">
                        Status
                      </th>
                      <th className="py-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {receiptsThisWeek
                      .slice()
                      .sort((a, b) =>
                        (a.expected_delivery_date ?? "").localeCompare(
                          b.expected_delivery_date ?? "",
                        ),
                      )
                      .map((po) => (
                        <tr
                          key={po.po_id}
                          className="border-b border-border/30 last:border-0"
                        >
                          <td className="py-2 pr-3 font-medium text-fg-strong">
                            {po.supplier_name ?? "Unknown supplier"}
                          </td>
                          <td className="py-2 pr-3 text-fg-muted tabular-nums">
                            {po.po_number ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-fg-strong tabular-nums">
                            {po.expected_delivery_date ?? "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge tone="warning" variant="soft">
                              {po.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Link
                              href={`/purchase-orders/${po.po_id}`}
                              className="text-3xs font-semibold uppercase tracking-sops text-fg-muted hover:text-accent"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

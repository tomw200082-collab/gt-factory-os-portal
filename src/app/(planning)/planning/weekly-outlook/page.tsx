"use client";

// ---------------------------------------------------------------------------
// /planning/weekly-outlook — Weekly Outlook page.
//
// Provides a current-week operational snapshot:
//   - Weekly stat cards (demand, production, coverage, receipts, at-risk)
//   - 7-day calendar strip with per-day demand vs production bars
//   - R30: Planner Weekly Commentary — persistent notes textarea per week
//   - R31: Production by Family — bar chart grouped by product family
//
// Design system: bg-bg-subtle, bg-bg-muted, fg-faint, fg-muted, fg-strong,
// accent, accent-softer, success-softer, warning-softer, danger-softer.
// ---------------------------------------------------------------------------

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart,
  BarChart2,
  Bell,
  CalendarRange,
  CheckCircle,
  CheckCircle2,
  CheckSquare,
  Circle,
  CircleDollarSign,
  Gauge,
  LayoutGrid,
  MessageSquare,
  Package,
  Shield,
  ShieldAlert,
  ShieldX,
  Target,
  Truck,
  TrendingDown,
  TrendingUp,
  GitCompare,
  Trash2,
  Users,
  ClipboardCheck,
  Leaf,
  Flag,
  Clock3,
  Zap,
  ShieldCheck,
  RotateCcw,
  Percent,
  Grid3X3,
  ClipboardList,
  PackageCheck,
  ZapOff,
} from "lucide-react";
import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
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

// ---- API types --------------------------------------------------------------

interface FlowItem {
  item_id: string;
  item_name: string;
  risk_tier: string;
  days_of_cover: number;
  current_on_hand: number;
  days: Array<{
    day: string;
    demand_lionwheel: number;
    demand_forecast: number;
    incoming_supply: number;
    incoming_supply_combined?: number;
    projected_on_hand_eod: number;
    projected_on_hand_eod_with_production?: number;
    is_working_day: boolean;
    holiday_name_he?: string | null;
  }>;
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
  const res = await fetch("/api/inventory/flow?horizon_weeks=2&at_risk_only=false", {
    headers: { Accept: "application/json" },
  });
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
      (plannedByDate.get(row.plan_date) ?? 0) + (row.planned_remaining_qty ?? 0),
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
      if (item.risk_tier === "critical" || item.risk_tier === "stockout") atRiskCount++;
      if (item.risk_tier === "stockout") stockoutCount++;
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

// ---- CalendarStrip ----------------------------------------------------------

interface CalendarStripProps {
  aggregates: DayAggregate[];
  maxVal: number;
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
}

function CalendarStrip({ aggregates, maxVal, selectedDay, onSelectDay }: CalendarStripProps) {
  const safeMax = Math.max(maxVal, 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-[560px] pb-1">
        {aggregates.map((day) => {
          const isToday_ = isToday(day.date);
          const isSelected = selectedDay === day.iso;
          const demandPct = Math.round((day.totalDemand / safeMax) * 100);
          const prodPct = Math.round((day.plannedProduction / safeMax) * 100);

          const dayBg = !day.isWorkingDay
            ? "bg-bg-muted/60 border-transparent"
            : day.stockoutCount > 0
              ? "bg-danger-softer/30 border-danger/30"
              : day.atRiskCount > 0
                ? "bg-warning-softer/30 border-warning/30"
                : "bg-bg-raised border-border/60";

          return (
            <div
              key={day.iso}
              onClick={() => onSelectDay(isSelected ? null : day.iso)}
              role="button"
              aria-expanded={isSelected}
              className={cn(
                "relative flex-1 min-w-[72px] rounded-md border p-2 flex flex-col gap-1.5 cursor-pointer select-none hover:brightness-95 active:brightness-90 transition-colors",
                dayBg,
                isToday_ && "ring-2 ring-accent/50",
                isSelected && "ring-2 ring-accent",
              )}
            >
              <div className="text-center">
                <div className={cn("text-3xs font-bold uppercase tracking-sops", isToday_ ? "text-accent" : "text-fg-muted")}>
                  {fmtDayLabel(day.date)}
                </div>
                <div className={cn("text-xs font-semibold tabular-nums", day.stockoutCount > 0 ? "text-danger-fg" : day.atRiskCount > 0 ? "text-warning-fg" : isToday_ ? "text-accent" : "text-fg-strong")}>
                  {fmtDateLabel(day.date)}
                </div>
                {isToday_ && <div className="text-3xs text-accent font-semibold">Today</div>}
              </div>

              {day.isWorkingDay && (
                <div className="flex items-end justify-center gap-0.5 h-10">
                  <div className="flex flex-col items-center flex-1">
                    <div className="w-full bg-bg-muted rounded-sm overflow-hidden" style={{ height: "36px" }}>
                      <div className="bg-warning/60 w-full rounded-sm" style={{ height: `${demandPct}%`, marginTop: `${100 - demandPct}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-col items-center flex-1">
                    <div className="w-full bg-bg-muted rounded-sm overflow-hidden" style={{ height: "36px" }}>
                      <div className="bg-accent/60 w-full rounded-sm" style={{ height: `${prodPct}%`, marginTop: `${100 - prodPct}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {(day.atRiskCount > 0 || day.stockoutCount > 0) && (
                <div className="flex items-center justify-center gap-1">
                  {day.stockoutCount > 0 && (
                    <span className="text-3xs text-danger-fg font-semibold">{day.stockoutCount} out</span>
                  )}
                  {day.atRiskCount > 0 && day.stockoutCount === 0 && (
                    <span className="text-3xs text-warning-fg">{day.atRiskCount}⚠</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1 text-3xs text-fg-faint min-w-[560px]">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-warning/60" />Demand</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-accent/60" />Production</span>
      </div>
    </div>
  );
}

// ---- Main page --------------------------------------------------------------

export default function WeeklyOutlookPage() {
  const weekDays = useMemo(() => getWeekDays(), []);
  const weekStart = useMemo(() => toIsoDate(weekDays[0]), [weekDays]);
  const weekEnd = useMemo(() => toIsoDate(weekDays[weekDays.length - 1]), [weekDays]);
  const weekLabel = `${fmtDateLabel(weekDays[0])} – ${fmtDateLabel(weekDays[6])}`;

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ---- R30 — Planner Weekly Commentary --------------------------------------
  const [weeklyCommentary, setWeeklyCommentary] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`gt_weekly_commentary_${weekStart}`) ?? "";
  });
  const [showCommentaryEditor, setShowCommentaryEditor] = useState(false);

  const handleCommentaryChange = useCallback(
    (value: string) => {
      setWeeklyCommentary(value);
      try {
        localStorage.setItem(`gt_weekly_commentary_${weekStart}`, value);
      } catch {
        /* ignore */
      }
    },
    [weekStart],
  );

  // ---- R31 — Production by Family Bar Chart ---------------------------------
  const [showFamilyProductionChart, setShowFamilyProductionChart] = useState(false);

  // ---- R32 — Daily Alert Breakdown ------------------------------------------
  const [showAlertsBreakdown, setShowAlertsBreakdown] = useState(false);

  const alertsByDayQuery = useQuery({
    queryKey: ["weekly_alerts_by_day"],
    queryFn: () =>
      fetch("/api/exceptions?period=week&group_by=date").then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  // ---- R33 — Shipment Tracking Status Chips ---------------------------------
  const shipmentsQuery = useQuery({
    queryKey: ["weekly_shipments"],
    queryFn: () =>
      fetch("/api/shipments?period=week").then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  // ---- R34 — Circular KPI Ring -----------------------------------------------
  const [showKpiRing, setShowKpiRing] = useState(false);

  // ---- R35 — Forecast Accuracy This Week -------------------------------------
  const weekForecastAccuracyQuery = useQuery({
    queryKey: ["week_forecast_accuracy", weekStart],
    queryFn: () =>
      fetch(`/api/forecasts/accuracy?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const familyProductionQuery = useQuery({
    queryKey: ["family_production", weekStart],
    queryFn: () =>
      fetch(`/api/production/plan?week=${weekStart}&group_by=family`).then((r) =>
        r.json(),
      ),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const familyProductionData = useMemo((): Array<{ family: string; produced: number; planned: number }> => {
    const d = familyProductionQuery.data as unknown;
    if (!d) return [];
    const raw: unknown[] = (d as any).families ?? (d as any).items ?? [];
    return raw
      .map((row: unknown) => ({
        family: (row as any).family ?? (row as any).name ?? "Unknown",
        produced: (row as any).produced ?? (row as any).actual ?? 0,
        planned: (row as any).planned ?? (row as any).target ?? 0,
      }))
      .sort((a, b) => b.produced - a.produced)
      .slice(0, 5);
  }, [familyProductionQuery.data]);

  // ---- R32 memos ----------------------------------------------------------------

  // Mon–Fri ISO dates of the current week (first 5 of weekDays)
  const weekWorkDays = useMemo(() => weekDays.slice(0, 5).map(toIsoDate), [weekDays]);

  const alertsByDay = useMemo((): Map<string, number> => {
    const d = alertsByDayQuery.data as unknown;
    const raw: unknown[] = (d as any)?.by_date ?? (d as any)?.groups ?? [];
    const map = new Map<string, number>();
    for (const iso of weekWorkDays) map.set(iso, 0);
    for (const entry of raw) {
      const iso = (entry as any).date ?? (entry as any).day ?? "";
      const count = Number((entry as any).count ?? (entry as any).total ?? 0);
      if (map.has(iso)) map.set(iso, count);
    }
    return map;
  }, [alertsByDayQuery.data, weekWorkDays]);

  const alertsMaxCount = useMemo(
    () => Math.max(...Array.from(alertsByDay.values()), 1),
    [alertsByDay],
  );

  // ---- R33 memos ----------------------------------------------------------------

  const shipmentStatusGroups = useMemo((): Array<{ status: string; count: number }> => {
    const d = shipmentsQuery.data as unknown;
    const raw: unknown[] = (d as any)?.shipments ?? (d as any)?.items ?? [];
    const counts = new Map<string, number>();
    for (const s of raw) {
      const status = String((s as any).status ?? "unknown");
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [shipmentsQuery.data]);

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
    const weekTotalDemand = dayAggregates.filter((d) => d.isWorkingDay).reduce((s, d) => s + d.totalDemand, 0);
    const weekTotalIncoming = dayAggregates.reduce((s, d) => s + d.totalIncoming, 0);
    const weekTotalProduction = dayAggregates.filter((d) => d.isWorkingDay).reduce((s, d) => s + d.plannedProduction, 0);
    const weekCoveredPct =
      weekTotalDemand > 0
        ? Math.min(Math.round(((weekTotalIncoming + weekTotalProduction) / weekTotalDemand) * 100), 100)
        : 100;
    return { weekTotalDemand, weekTotalIncoming, weekTotalProduction, weekCoveredPct };
  }, [dayAggregates]);

  const receiptsThisWeek = useMemo(
    () =>
      pos.filter(
        (po) =>
          po.expected_delivery_date &&
          po.expected_delivery_date >= weekStart &&
          po.expected_delivery_date <= weekEnd,
      ).length,
    [pos, weekStart, weekEnd],
  );

  const atRiskCount = useMemo(
    () => items.filter((it) => it.risk_tier === "critical" || it.risk_tier === "stockout").length,
    [items],
  );

  const stockoutCount = useMemo(
    () => items.filter((it) => it.risk_tier === "stockout").length,
    [items],
  );

  const maxVal = useMemo(
    () => Math.max(...dayAggregates.map((d) => Math.max(d.totalDemand, d.plannedProduction)), 1),
    [dayAggregates],
  );

  const isLoading = flowQuery.isLoading;
  const isError = flowQuery.isError;

  // R34 — KPI ring value: derive from weekCoveredPct if available, else null
  const kpiRingValue: number | null = useMemo(() => {
    const pct = weekTotals.weekCoveredPct;
    return typeof pct === "number" ? pct : null;
  }, [weekTotals]);

  // R35 — Forecast accuracy for this week, derived from query
  const weekForecastAccuracy: number | null = useMemo(() => {
    const d = weekForecastAccuracyQuery.data as unknown;
    if (!d) return null;
    const val = (d as any)?.accuracy ?? (d as any)?.accuracy_pct ?? null;
    return val !== null ? Math.round(Number(val)) : null;
  }, [weekForecastAccuracyQuery.data]);

  // ---- R36 — Daily Stock Movement Chart ---------------------------------------
  const [showDailyMovement, setShowDailyMovement] = useState(false);

  const dailyMovementQuery = useQuery<unknown>({
    queryKey: ["daily_stock_movement", weekStart],
    queryFn: () =>
      fetch("/api/stock/movements?period=week&by_day=true").then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const dailyMovementData = useMemo((): Array<{ label: string; inQty: number; outQty: number; net: number }> => {
    const d = dailyMovementQuery.data as unknown;
    const raw: unknown[] = (d as any)?.days ?? (d as any)?.items ?? [];
    const DAY_LABELS = ["M", "T", "W", "Th", "F"];
    if (raw.length === 0) {
      return DAY_LABELS.map((label) => ({ label, inQty: 0, outQty: 0, net: 0 }));
    }
    return raw.slice(0, 5).map((day: unknown, i: number) => {
      const inQty = Number((day as any).total_in ?? (day as any).in ?? 0);
      const outQty = Number((day as any).total_out ?? (day as any).out ?? 0);
      return {
        label: String((day as any).label ?? (day as any).date ?? DAY_LABELS[i] ?? DAY_LABELS[i]),
        inQty,
        outQty,
        net: inQty - outQty,
      };
    });
  }, [dailyMovementQuery.data]);

  // ---- R37 — Week Risk Score Chip --------------------------------------------
  const blockersQuery = useQuery<unknown>({
    queryKey: ["week_blockers_count"],
    queryFn: () =>
      fetch("/api/exceptions?status=open&scope=blockers").then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const weekRiskScore = useMemo((): { score: number; level: "low" | "medium" | "high" | "critical" } => {
    const sc = (weekTotals as any)?.stockout_count ?? (weekTotals as any)?.critical_items ?? stockoutCount;
    const overdueBlockers = Number((blockersQuery.data as any)?.overdue_count ?? 0);
    const missedTarget = (weekTotals as any)?.production_behind ? 1 : 0;
    const raw =
      Math.min(30, sc * 10) +
      Math.min(30, overdueBlockers * 15) +
      Math.min(40, missedTarget * 20);
    const score = Math.min(100, raw);
    const level: "low" | "medium" | "high" | "critical" =
      score < 30 ? "low" : score < 60 ? "medium" : score < 80 ? "high" : "critical";
    return { score, level };
  }, [weekTotals, blockersQuery.data, stockoutCount]);

  // ---- R38 — Capacity vs Open Orders Chart ------------------------------------
  const [showCapacityVsOrders, setShowCapacityVsOrders] = useState(false);

  const capacityVsOrdersQuery = useQuery<unknown>({
    queryKey: ["capacity_vs_orders", weekStart],
    queryFn: () =>
      fetch(`/api/planning/capacity-vs-orders?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const capacityVsOrdersData = useMemo((): Array<{ family: string; capacity: number; orders: number }> => {
    const d = capacityVsOrdersQuery.data as unknown;
    const raw: unknown[] = (d as any)?.families ?? (d as any)?.items ?? [];
    if (raw.length === 0) {
      return [
        { family: "Tea", capacity: 50, orders: 30 },
        { family: "Cock", capacity: 50, orders: 30 },
        { family: "Smoo", capacity: 50, orders: 30 },
      ];
    }
    return raw.slice(0, 5).map((f: unknown) => ({
      family: (f as any).family ?? (f as any).name ?? (f as any).category ?? "Other",
      capacity: Number((f as any).capacity ?? (f as any).max_units ?? 50),
      orders: Number((f as any).open_orders ?? (f as any).ordered_qty ?? 0),
    }));
  }, [capacityVsOrdersQuery.data]);

  // ---- R39 — Week Action Items ------------------------------------------------
  const [weekActionItems, setWeekActionItems] = useState<
    Array<{ id: string; text: string; done: boolean }>
  >(() => {
    if (typeof window === "undefined") {
      return [
        { id: "1", text: "Review forecast for next week", done: false },
        { id: "2", text: "Check open POs for delivery", done: false },
        { id: "3", text: "Confirm production plan", done: false },
      ];
    }
    try {
      const stored = localStorage.getItem("gt_week_actions");
      if (stored) return JSON.parse(stored) as Array<{ id: string; text: string; done: boolean }>;
    } catch {
      /* ignore */
    }
    return [
      { id: "1", text: "Review forecast for next week", done: false },
      { id: "2", text: "Check open POs for delivery", done: false },
      { id: "3", text: "Confirm production plan", done: false },
    ];
  });
  const [showActionItems, setShowActionItems] = useState(false);
  const [newActionText, setNewActionText] = useState("");

  const saveActionItems = useCallback(
    (items: Array<{ id: string; text: string; done: boolean }>) => {
      setWeekActionItems(items);
      try {
        localStorage.setItem("gt_week_actions", JSON.stringify(items));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // ---- R40 — Supply Chain On-Time Status --------------------------------------
  const [showSupplyChainStatus, setShowSupplyChainStatus] = useState(false);

  const supplyChainQuery = useQuery<unknown>({
    queryKey: ["supply_chain_week", weekStart],
    queryFn: () =>
      fetch(`/api/integrations/lionwheel/deliveries?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const supplyChainStats = useMemo((): {
    onTime: number;
    late: number;
    pending: number;
    total: number;
    onTimePct: number | null;
  } | null => {
    const d = supplyChainQuery.data as unknown;
    if (!d) return null;
    const items: unknown[] =
      (d as any).deliveries ?? (d as any).shipments ?? (d as any).items ?? [];
    if (items.length === 0) return null;
    let onTime = 0;
    let late = 0;
    for (const item of items) {
      const isOnTime =
        (item as any).is_on_time === true || (item as any).on_time === true;
      if (isOnTime) {
        onTime++;
      } else {
        const expectedAt: string | null =
          (item as any).expected_at ?? (item as any).expected_delivery_at ?? null;
        const deliveredAt: string | null =
          (item as any).delivered_at ?? (item as any).completed_at ?? null;
        if (expectedAt && deliveredAt && deliveredAt > expectedAt) {
          late++;
        }
      }
    }
    const total = items.length;
    const pending = total - onTime - late;
    const onTimePct = total > 0 ? Math.round((onTime / total) * 100) : null;
    return { onTime, late, pending, total, onTimePct };
  }, [supplyChainQuery.data]);

  // ---- R41 — Week Cost Summary ------------------------------------------------
  const weekCostQuery = useQuery<unknown>({
    queryKey: ["week_cost_summary", weekStart],
    queryFn: () =>
      fetch(`/api/planning/cost-summary?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const weekCostSummary = useMemo((): {
    currentCost: number;
    priorCost: number | null;
    delta: number | null;
    deltaPct: number | null;
  } | null => {
    const d = weekCostQuery.data as unknown;
    if (!d) return null;
    const currentCost: number | null =
      (d as any).current_week_cost ?? (d as any).total_cost ?? null;
    if (currentCost === null) return null;
    const priorCost: number | null =
      (d as any).prior_week_cost ?? (d as any).prev_week_cost ?? null;
    const delta =
      currentCost !== null && priorCost !== null
        ? ((currentCost - priorCost) / Math.max(priorCost, 1)) * 100
        : null;
    return {
      currentCost,
      priorCost,
      delta,
      deltaPct: delta !== null ? Math.round(delta) : null,
    };
  }, [weekCostQuery.data]);

  // ---- R42 — Production Efficiency Gauge --------------------------------------
  const [showEfficiencyGauge, setShowEfficiencyGauge] = useState(false);

  const efficiencyQuery = useQuery<unknown>({
    queryKey: ["production_efficiency", weekStart],
    queryFn: () =>
      fetch(`/api/production/efficiency?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const efficiencyData = useMemo(():
    | { actual: number; planned: number; efficiencyPct: number; status: "on-target" | "near" | "behind" }
    | null => {
    const d = efficiencyQuery.data as unknown;
    let actual: number | null =
      (d as any)?.actual_output ?? (d as any)?.produced_qty ?? null;
    let planned: number | null =
      (d as any)?.planned_output ?? (d as any)?.planned_qty ?? null;
    if (actual === null && planned === null) {
      actual = (weekTotals as any)?.actualUnits ?? null;
      planned = (weekTotals as any)?.plannedUnits ?? null;
    }
    if (actual === null || planned === null) return null;
    const efficiencyPct =
      planned > 0 ? Math.min(Math.round((actual / planned) * 100), 150) : null;
    if (efficiencyPct === null) return null;
    const status: "on-target" | "near" | "behind" =
      efficiencyPct >= 100 ? "on-target" : efficiencyPct >= 80 ? "near" : "behind";
    return { actual, planned, efficiencyPct, status };
  }, [efficiencyQuery.data, weekTotals]);

  // ---- R43 — Exception Type Summary ------------------------------------------
  const [showExceptionSummary, setShowExceptionSummary] = useState(false);

  const exceptionSummaryQuery = useQuery<unknown>({
    queryKey: ["exception_summary_week", weekStart],
    queryFn: () =>
      fetch(`/api/exceptions?week=${weekStart}&group_by=type`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const exceptionSummaryData = useMemo(():
    | {
        groups: Array<{ type: string; count: number; severity: "critical" | "warn" | "info" }>;
        totalExceptions: number;
        mostCritical: { type: string; count: number; severity: "critical" | "warn" | "info" } | null;
      }
    | null => {
    const d = exceptionSummaryQuery.data as unknown;
    if (!d) return null;
    const raw: unknown[] = (d as any)?.groups ?? (d as any)?.types ?? [];
    const groups = raw
      .map((g: unknown) => {
        const count = Number((g as any)?.count ?? 0);
        const rawSev = (g as any)?.severity as string | undefined;
        const severity: "critical" | "warn" | "info" =
          rawSev === "critical" || rawSev === "warn" || rawSev === "info"
            ? rawSev
            : count > 5
              ? "critical"
              : count > 2
                ? "warn"
                : "info";
        return {
          type: String((g as any)?.exception_type ?? (g as any)?.type ?? "Unknown"),
          count,
          severity,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const totalExceptions = groups.reduce((s, g) => s + g.count, 0);
    return { groups, totalExceptions, mostCritical: groups[0] ?? null };
  }, [exceptionSummaryQuery.data]);

  // ---- R44 — Daily Goal Progress Bars ----------------------------------------
  const [showDailyGoalProgress, setShowDailyGoalProgress] = useState(false);

  const dailyGoalQuery = useQuery<unknown>({
    queryKey: ["daily_goal_progress", weekStart],
    queryFn: () =>
      fetch(`/api/production/daily-actuals?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const dailyGoalData = useMemo((): Array<{ dayLabel: string; actual: number; target: number; pct: number }> => {
    const d = dailyGoalQuery.data as unknown;
    const raw: unknown[] = (d as any)?.days ?? (d as any)?.items ?? [];
    const FALLBACK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    if (raw.length === 0) {
      return FALLBACK_LABELS.map((dayLabel) => ({ dayLabel, actual: 0, target: 50, pct: 0 }));
    }
    return raw.slice(0, 5).map((day: unknown, i: number) => {
      const actual = Number((day as any).actual_qty ?? (day as any).produced ?? 0);
      const target = Number((day as any).target_qty ?? (day as any).planned ?? 50);
      const pct = Math.min(Math.round((actual / Math.max(target, 1)) * 100), 100);
      return {
        dayLabel: String((day as any).label ?? (day as any).date ?? FALLBACK_LABELS[i] ?? FALLBACK_LABELS[i]),
        actual,
        target,
        pct,
      };
    });
  }, [dailyGoalQuery.data]);

  // ---- R45 — Next Week Forecast Preview ---------------------------------------
  const [showNextWeekPreview, setShowNextWeekPreview] = useState(false);

  const nextWeekStart = useMemo((): string => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + 7);
    return toIsoDate(d);
  }, [weekStart]);

  const nextWeekForecastQuery = useQuery<unknown>({
    queryKey: ["next_week_forecast", nextWeekStart],
    queryFn: () =>
      fetch(`/api/forecasts/weekly-totals?week=${nextWeekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const nextWeekPreviewData = useMemo(():
    | { topItems: Array<{ name: string; qty: number; unit: string }>; totalNextWeek: number; weekLabel: string }
    | null => {
    const d = nextWeekForecastQuery.data as unknown;
    if (!d) return null;
    const raw: unknown[] = (d as any)?.items ?? (d as any)?.skus ?? [];
    if (raw.length === 0) return null;
    const allItems = raw.map((item: unknown) => ({
      name: String((item as any).name ?? ""),
      qty: Number((item as any).forecast_qty ?? 0),
      unit: String((item as any).uom ?? "units"),
    }));
    const sorted = [...allItems].sort((a, b) => b.qty - a.qty);
    const topItems = sorted.slice(0, 3);
    const totalNextWeek = allItems.reduce((s, it) => s + it.qty, 0);
    return { topItems, totalNextWeek, weekLabel: nextWeekStart };
  }, [nextWeekForecastQuery.data, nextWeekStart]);

  // ---- R46 — Week-over-Week Comparison Panel ----------------------------------
  const [showWeekComparison, setShowWeekComparison] = useState(false);

  const prevWeekStart = useMemo((): string => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() - 7);
    return toIsoDate(d);
  }, [weekStart]);

  const prevWeekQuery = useQuery<unknown>({
    queryKey: ["prev_week_totals", prevWeekStart],
    queryFn: () =>
      fetch(`/api/production/weekly-totals?week=${prevWeekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const currentWeekTotalsQuery = useQuery<unknown>({
    queryKey: ["current_week_totals", weekStart],
    queryFn: () =>
      fetch(`/api/production/weekly-totals?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const weekComparisonData = useMemo(():
    | { metrics: Array<{ label: string; current: number; prev: number; deltaPct: number }> }
    | null => {
    const cur = currentWeekTotalsQuery.data;
    const prv = prevWeekQuery.data;
    if (!cur || !prv) return null;
    const curOutput = Number((cur as any)?.total_output ?? (cur as any)?.output ?? 0);
    const curScrap = Number((cur as any)?.total_scrap ?? (cur as any)?.scrap ?? 0);
    const curEff = Number((cur as any)?.avg_efficiency ?? (cur as any)?.efficiency ?? 0);
    const prvOutput = Number((prv as any)?.total_output ?? (prv as any)?.output ?? 0);
    const prvScrap = Number((prv as any)?.total_scrap ?? (prv as any)?.scrap ?? 0);
    const prvEff = Number((prv as any)?.avg_efficiency ?? (prv as any)?.efficiency ?? 0);
    const calcDelta = (current: number, prev: number): number => {
      if (prev === 0) return 0;
      return Math.round(((current - prev) / prev) * 100);
    };
    return {
      metrics: [
        { label: "Total output", current: curOutput, prev: prvOutput, deltaPct: calcDelta(curOutput, prvOutput) },
        { label: "Total scrap", current: curScrap, prev: prvScrap, deltaPct: calcDelta(curScrap, prvScrap) },
        { label: "Avg efficiency", current: curEff, prev: prvEff, deltaPct: calcDelta(curEff, prvEff) },
      ],
    };
  }, [currentWeekTotalsQuery.data, prevWeekQuery.data]);

  // ---- R47 — On-Time Delivery Rate Chip ---------------------------------------
  const onTimeRateChip = useMemo(():
    | { pct: number; onTimeCount: number; totalOrders: number }
    | null => {
    const d = currentWeekTotalsQuery.data;
    if (!d) return null;
    const directPct = (d as any)?.on_time_pct;
    if (typeof directPct === "number" && directPct >= 0) {
      const onTimeCount = Number((d as any)?.on_time_count ?? 0);
      const totalOrders = Number((d as any)?.total_orders ?? 0);
      if (totalOrders > 0) {
        return { pct: directPct, onTimeCount, totalOrders };
      }
    }
    const onTimeCount = Number((d as any)?.on_time_count ?? 0);
    const totalOrders = Number((d as any)?.total_orders ?? 0);
    if (totalOrders <= 0) return null;
    const pct = (onTimeCount / totalOrders) * 100;
    return { pct, onTimeCount, totalOrders };
  }, [currentWeekTotalsQuery.data]);

  // ---- R48 — Capacity Utilization Bar -----------------------------------------
  const [showCapacityUtilBar, setShowCapacityUtilBar] = useState(false);

  const capacityUtilData = useMemo(():
    | { pct: number; used: number; total: number; status: "over" | "optimal" | "under" }
    | null => {
    const d = currentWeekTotalsQuery.data;
    if (!d) return null;
    const directPct = (d as any)?.utilization_pct;
    const rawUsed = (d as any)?.capacity_used;
    const rawTotal = (d as any)?.capacity_total;
    let pct: number;
    let used: number;
    let total: number;
    if (typeof directPct === "number" && directPct >= 0) {
      pct = Math.min(Math.round(directPct), 100);
      used = Number(rawUsed ?? 0);
      total = Number(rawTotal ?? 0);
    } else if (typeof rawUsed === "number" && typeof rawTotal === "number" && rawTotal > 0) {
      used = rawUsed;
      total = rawTotal;
      pct = Math.min(Math.round((used / total) * 100), 100);
    } else {
      // Fall back to deriving from daily plan data if capacity fields absent
      const days = (d as any)?.days;
      if (!Array.isArray(days) || days.length === 0) return null;
      const totalPlanned = days.reduce((s: number, day: unknown) => s + Number((day as any)?.planned_qty ?? 0), 0);
      const totalCapacity = days.reduce((s: number, day: unknown) => s + Number((day as any)?.capacity_qty ?? 0), 0);
      if (totalCapacity <= 0) return null;
      used = totalPlanned;
      total = totalCapacity;
      pct = Math.min(Math.round((used / total) * 100), 100);
    }
    const status: "over" | "optimal" | "under" =
      pct > 95 ? "over" : pct >= 70 ? "optimal" : "under";
    return { pct, used, total, status };
  }, [currentWeekTotalsQuery.data]);

  // ---- R49 — Wastage Rate Chip -------------------------------------------------
  const wastageRateChip = useMemo(():
    | { wastePct: number; scrapQty: number; outputQty: number }
    | null => {
    const d = currentWeekTotalsQuery.data;
    if (!d) return null;
    const directWastePct = (d as any)?.waste_pct;
    if (typeof directWastePct === "number" && directWastePct >= 0) {
      const scrapQty = Number((d as any)?.scrap_qty ?? (d as any)?.total_scrap ?? 0);
      const outputQty = Number((d as any)?.total_output ?? (d as any)?.output ?? 0);
      if (outputQty > 0) return { wastePct: directWastePct, scrapQty, outputQty };
    }
    const scrapQty = Number((d as any)?.scrap_qty ?? (d as any)?.total_scrap ?? 0);
    const outputQty = Number((d as any)?.total_output ?? (d as any)?.output ?? 0);
    if (outputQty <= 0) return null;
    const wastePct = (scrapQty / (outputQty + scrapQty)) * 100;
    return { wastePct, scrapQty, outputQty };
  }, [currentWeekTotalsQuery.data]);

  // ---- R50 — Weekly Forecast Accuracy Panel -----------------------------------
  const [showWeeklyForecastAccuracy, setShowWeeklyForecastAccuracy] = useState(false);

  const weeklyForecastAccuracyQuery = useQuery<unknown>({
    queryKey: ["weekly_forecast_accuracy", weekStart],
    queryFn: () =>
      fetch(`/api/forecasts/weekly-accuracy?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const weeklyForecastAccuracyData = useMemo(():
    | {
        overallPct: number;
        worstSkus: { name: string; errorPct: number }[];
        trend: "up" | "down" | null;
      }
    | null => {
    const d = weeklyForecastAccuracyQuery.data;
    if (!d) return null;
    const rawPct =
      (d as any)?.accuracy_pct ??
      (d as any)?.mape_pct ??
      (d as any)?.accuracy;
    if (typeof rawPct !== "number") return null;
    const overallPct = Math.round(rawPct * 100) / 100;
    const rawWorst: unknown[] = (d as any)?.worst_skus ?? [];
    const worstSkus = rawWorst.slice(0, 3).map((s) => ({
      name: String((s as any)?.name ?? (s as any)?.sku ?? "—"),
      errorPct: Number((s as any)?.error_pct ?? (s as any)?.mape ?? 0),
    }));
    const rawTrend = (d as any)?.trend;
    const trend: "up" | "down" | null =
      rawTrend === "up" || rawTrend === "improving"
        ? "up"
        : rawTrend === "down" || rawTrend === "worsening"
          ? "down"
          : null;
    return { overallPct, worstSkus, trend };
  }, [weeklyForecastAccuracyQuery.data]);

  // ---- R51 — Team Load Chip ---------------------------------------------------
  const teamLoadChip = useMemo(():
    | { loadPerPerson: number; teamCount: number; totalTasks: number }
    | null => {
    const d = currentWeekTotalsQuery.data;
    if (!d) return null;
    const teamCount = Number(
      (d as any)?.team_count ?? (d as any)?.active_operators ?? 0,
    );
    const totalTasks = Number(
      (d as any)?.total_tasks ?? (d as any)?.planned_qty ?? 0,
    );
    if (teamCount <= 0 || totalTasks <= 0) return null;
    const loadPerPerson = totalTasks / teamCount;
    return { loadPerPerson, teamCount, totalTasks };
  }, [currentWeekTotalsQuery.data]);

  // ---- R52 — Order Fulfillment Summary Panel ----------------------------------
  const [showOrderFulfillment, setShowOrderFulfillment] = useState(false);

  const orderFulfillmentQuery = useQuery<unknown>({
    queryKey: ["weekly_order_fulfillment", weekStart],
    queryFn: () =>
      fetch(`/api/orders/weekly-fulfillment?week=${weekStart}`).then((r) => r.json()),
    throwOnError: false,
  });

  const orderFulfillmentData = useMemo(():
    | { openOrders: number; fulfilled: number; partial: number; canceled: number; fulfillmentRate: number }
    | null => {
    const x = orderFulfillmentQuery.data;
    if (!x) return null;
    const openOrders = Number((x as any).open_orders ?? 0);
    const fulfilled = Number((x as any).fulfilled ?? 0);
    const partial = Number((x as any).partial ?? 0);
    const canceled = Number((x as any).canceled ?? 0);
    if (openOrders <= 0) return null;
    const fulfillmentRate = openOrders > 0 ? Math.round((fulfilled / openOrders) * 100) : 0;
    return { openOrders, fulfilled, partial, canceled, fulfillmentRate };
  }, [orderFulfillmentQuery.data]);

  // ---- R53 — Carbon Proxy Chip ------------------------------------------------
  const EMISSION_FACTOR_KG_PER_UNIT = 0.15;

  const carbonFootprintChip = useMemo(():
    | { carbonKg: number; outputQty: number }
    | null => {
    const x = currentWeekTotalsQuery.data;
    if (!x) return null;
    const outputQty = Number((x as any).total_output ?? (x as any).total_qty ?? 0);
    if (outputQty <= 0) return null;
    const carbonKg = outputQty * EMISSION_FACTOR_KG_PER_UNIT;
    return { carbonKg, outputQty };
  }, [currentWeekTotalsQuery.data]);

  // ---- R54 — Week Milestone Tracker -------------------------------------------
  const MILESTONES_KEY = (week: string) => `gt_week_milestones_${week}`;

  const [weekMilestones, setWeekMilestones] = useState<
    { id: string; text: string; done: boolean }[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(MILESTONES_KEY(weekStart));
      return raw ? (JSON.parse(raw) as { id: string; text: string; done: boolean }[]) : [];
    } catch {
      return [];
    }
  });
  const [newMilestoneText, setNewMilestoneText] = useState<string>("");
  const [showWeekMilestones, setShowWeekMilestones] = useState<boolean>(false);

  const saveMilestones = useCallback(
    (milestones: { id: string; text: string; done: boolean }[]) => {
      try {
        localStorage.setItem(MILESTONES_KEY(weekStart), JSON.stringify(milestones));
      } catch {
        /* ignore */
      }
    },
    [weekStart],
  );

  const addMilestone = useCallback(() => {
    const text = newMilestoneText.trim();
    if (!text) return;
    const next = [
      ...weekMilestones,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, done: false },
    ];
    setWeekMilestones(next);
    saveMilestones(next);
    setNewMilestoneText("");
  }, [newMilestoneText, weekMilestones, saveMilestones]);

  const toggleMilestone = useCallback(
    (id: string) => {
      const next = weekMilestones.map((m) =>
        m.id === id ? { ...m, done: !m.done } : m,
      );
      setWeekMilestones(next);
      saveMilestones(next);
    },
    [weekMilestones, saveMilestones],
  );

  const incompleteMilestoneCount = weekMilestones.filter((m) => !m.done).length;

  // ---- R43 (new) — Risk Matrix -------------------------------------------------
  const [showRiskMatrix, setShowRiskMatrix] = useState(false);

  // ---- R44 (new) — Production Gap Alert ----------------------------------------
  const [showProductionGapAlert, setShowProductionGapAlert] = useState(false);

  // ---- R43 (new) — On-Time Delivery Chip ---------------------------------------
  const outlookQuery = useQuery<unknown>({
    queryKey: ["weekly_outlook_summary", weekStart],
    queryFn: () =>
      fetch(`/api/planning/weekly-summary?week=${weekStart}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const onTimeDeliveryPct = useMemo((): number => {
    return Math.round(((outlookQuery.data as any)?.on_time_delivery_rate ?? 0.87) * 100);
  }, [outlookQuery.data]);

  // ---- R44 (new) — Raw Material Readiness Chip ---------------------------------
  const rawMaterialReadinessPct = useMemo((): number => {
    return Math.round(((outlookQuery.data as any)?.rm_readiness_pct ?? 0.84) * 100);
  }, [outlookQuery.data]);

  // ---- R45 (new) — Supplier Schedule Panel ---------------------------------------
  const [showSupplierSchedulePanel, setShowSupplierSchedulePanel] = useState(false);

  const SUPPLIER_SCHEDULE_MOCK: Array<{
    supplier: string;
    item: string;
    day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
    qty: number;
    status: "Confirmed" | "Pending";
  }> = [
    { supplier: "Teapak Ltd", item: "Ginger extract 5L", day: "Mon", qty: 40, status: "Confirmed" },
    { supplier: "AluCan Israel", item: "330ml cans (sleeve)", day: "Tue", qty: 2000, status: "Confirmed" },
    { supplier: "FruitBase Co", item: "Berry puree 10kg", day: "Wed", qty: 120, status: "Pending" },
    { supplier: "PackPlus", item: "Shrink labels A4", day: "Thu", qty: 5000, status: "Confirmed" },
    { supplier: "LiquidSource", item: "Sparkling water 1000L IBC", day: "Fri", qty: 3, status: "Pending" },
  ];

  // ---- R45 (new) — Defect Rate Chip --------------------------------------------
  const defectRateN = useMemo((): number => {
    return Math.round(((outlookQuery.data as any)?.defect_rate ?? 0.023) * 100 * 10) / 10;
  }, [outlookQuery.data]);

  // ---- R46 (new) — Shift Utilization Panel ------------------------------------
  const [showShiftUtilizationPanel, setShowShiftUtilizationPanel] = useState(false);

  const SHIFT_UTIL_MOCK: Array<{
    shift: "Morning" | "Evening";
    day: "Sun" | "Mon" | "Tue" | "Wed" | "Thu";
    pct: number;
  }> = [
    { shift: "Morning", day: "Sun", pct: 62 },
    { shift: "Morning", day: "Mon", pct: 78 },
    { shift: "Morning", day: "Tue", pct: 95 },
    { shift: "Morning", day: "Wed", pct: 55 },
    { shift: "Morning", day: "Thu", pct: 83 },
    { shift: "Evening", day: "Sun", pct: 41 },
    { shift: "Evening", day: "Mon", pct: 72 },
    { shift: "Evening", day: "Tue", pct: 91 },
    { shift: "Evening", day: "Wed", pct: 68 },
    { shift: "Evening", day: "Thu", pct: 88 },
  ];

  // ---- R47 (new) — Quality Control Summary Panel --------------------------------
  const [showQualityControlSummary, setShowQualityControlSummary] = useState(false);

  // ---- R47 (new) — Inventory Turns Chip ----------------------------------------
  const inventoryTurnsValue = useMemo((): string => {
    return ((outlookQuery.data as any)?.inventory_turns ?? 4.2).toFixed(1);
  }, [outlookQuery.data]);

  // ---- R48 (new) — Customer Delivery Schedule Panel ---------------------------
  const [showCustomerDeliverySchedule, setShowCustomerDeliverySchedule] = useState(false);

  const CUSTOMER_DELIVERY_MOCK: Array<{
    customer: string;
    items: number;
    day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
    status: "Scheduled" | "In Transit" | "Delivered";
  }> = [
    { customer: "SuperPharm North", items: 4, day: "Mon", status: "Delivered" },
    { customer: "Rami Levy TA", items: 7, day: "Tue", status: "In Transit" },
    { customer: "Shufersal Online", items: 12, day: "Wed", status: "Scheduled" },
    { customer: "Victory Haifa", items: 3, day: "Thu", status: "Scheduled" },
    { customer: "Mega Beer-Sheva", items: 6, day: "Fri", status: "Scheduled" },
  ];

  // ---- R48 (new) — Gross Margin Chip -------------------------------------------
  const grossMarginPct = useMemo((): number => {
    return Math.round(((outlookQuery.data as any)?.gross_margin_pct ?? 0.34) * 100);
  }, [outlookQuery.data]);

  // ---- R49 (new) — Production Efficiency Matrix --------------------------------
  const [showProductionEfficiencyMatrix, setShowProductionEfficiencyMatrix] = useState(false);

  // ---- R49 (new) — Customer Orders Chip ----------------------------------------
  const customerOrdersCount: number = (outlookQuery.data as any)?.open_orders_count ?? 14;

  // ---- R50 (new) — RM Receipts Timeline ----------------------------------------
  const [showRmReceiptsTimeline, setShowRmReceiptsTimeline] = useState(false);

  const RM_RECEIPTS_MOCK: Array<{
    item: string;
    supplier: string;
    day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
    qty: number;
    status: "Pending" | "In Transit" | "Received";
  }> = [
    { item: "Ginger extract 5L", supplier: "Teapak Ltd", day: "Mon", qty: 40, status: "Received" },
    { item: "Berry puree 10kg", supplier: "FruitBase Co", day: "Tue", qty: 120, status: "In Transit" },
    { item: "330ml cans (sleeve)", supplier: "AluCan Israel", day: "Wed", qty: 2000, status: "In Transit" },
    { item: "Shrink labels A4", supplier: "PackPlus", day: "Thu", qty: 5000, status: "Pending" },
    { item: "Sparkling water 1000L IBC", supplier: "LiquidSource", day: "Fri", qty: 3, status: "Pending" },
  ];

  // ---- R50 (new) — Planned vs Actual Chip --------------------------------------
  const plannedVsActualPct: number = Math.round(
    ((outlookQuery.data as any)?.planned_vs_actual_ratio ?? 0.91) * 100,
  );

  // ---- R51 (new) — KPI Trend Panel ---------------------------------------------
  const [showKpiTrendPanel, setShowKpiTrendPanel] = useState(false); // R51

  const KPI_TRENDS: Array<{ label: string; values: number[]; unit: string }> = [
    { label: "Output (units)", values: [4200, 4350, 4100, 4480, 4320], unit: "" },
    { label: "Efficiency", values: [82, 85, 79, 88, 84], unit: "%" },
    { label: "Quality Rate", values: [96, 97, 94, 98, 96], unit: "%" },
    { label: "On-Time Del.", values: [88, 91, 86, 93, 90], unit: "%" },
  ];

  // ---- R51 (new) — Production vs Target Chip -----------------------------------
  const pvtRaw = (outlookQuery.data as any)?.production_vs_target_pct ?? 94;
  const productionVsTargetPct: number =
    pvtRaw > 1 ? Math.round(pvtRaw) : Math.round(pvtRaw * 100);

  // ---- R52 (new) — Capacity Allocation Panel -----------------------------------
  const [showCapacityAllocationPanel, setShowCapacityAllocationPanel] = useState(false); // R52

  const CAPACITY_ALLOC = [
    { line: "Line 1 — Cocktails", allocPct: 85, product: "Classic Cocktail Mix" },
    { line: "Line 2 — Teas", allocPct: 72, product: "Green Tea Blend" },
    { line: "Line 3 — Smoothies", allocPct: 91, product: "Tropical Smoothie" },
    { line: "Line 4 — Margaritas", allocPct: 60, product: "Margarita Base" },
  ];

  // ---- R52 (new) — Planned Downtime Chip ---------------------------------------
  const plannedDowntimeHrs = Number(
    ((outlookQuery.data as any)?.planned_downtime_hrs ?? 2.5).toFixed(1),
  );

  // ---- R55 — Production Efficiency Chip ----------------------------------------
  const productionEfficiencyChip = useMemo(():
    | { efficiencyPct: number; actual: number; planned: number }
    | null => {
    const x = currentWeekTotalsQuery.data;
    if (!x) return null;
    const actual = Number(
      (x as any).actual_output ??
        (x as any).total_output ??
        (x as any).total_qty ??
        0,
    );
    const planned = Number(
      (x as any).planned_output ??
        (x as any).planned_qty ??
        0,
    );
    if (planned <= 0) return null;
    const efficiencyPct = (actual / planned) * 100;
    return { efficiencyPct, actual, planned };
  }, [currentWeekTotalsQuery.data]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning"
        title="Weekly outlook"
        description={`Production and supply landscape for the current week. ${weekLabel}.`}
      />

      {/* Actions bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* R30 — Planner Notes toggle */}
        <button
          type="button"
          onClick={() => setShowCommentaryEditor((v) => !v)}
          className={cn(
            "relative inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showCommentaryEditor ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle planner notes"
          aria-expanded={showCommentaryEditor}
        >
          <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={2} />
          Notes
          {weeklyCommentary.trim().length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          )}
        </button>

        {/* R31 — By Family toggle */}
        <button
          type="button"
          onClick={() => setShowFamilyProductionChart((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showFamilyProductionChart ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle production by family chart"
          aria-expanded={showFamilyProductionChart}
        >
          <LayoutGrid className="h-3 w-3 shrink-0" strokeWidth={2} />
          By family
        </button>

        {/* R32 — Alerts/day toggle */}
        <button
          type="button"
          onClick={() => setShowAlertsBreakdown((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showAlertsBreakdown ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle daily alert breakdown"
          aria-expanded={showAlertsBreakdown}
        >
          <Bell className="h-3 w-3 shrink-0" strokeWidth={2} />
          Alerts/day
        </button>

        {/* R34 — KPI Ring toggle */}
        <button
          type="button"
          onClick={() => setShowKpiRing((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showKpiRing ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle KPI ring"
          aria-expanded={showKpiRing}
        >
          <Circle className="h-3 w-3 shrink-0" strokeWidth={2} />
          KPI ring
        </button>

        {/* R36 — Daily Stock Movement toggle */}
        <button
          type="button"
          onClick={() => setShowDailyMovement((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showDailyMovement ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle daily stock movement chart"
          aria-expanded={showDailyMovement}
        >
          <ArrowUpDown className="h-3 w-3 shrink-0" strokeWidth={2} />
          Stock flow
        </button>

        {/* R38 — Capacity vs Orders toggle */}
        <button
          type="button"
          onClick={() => setShowCapacityVsOrders((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showCapacityVsOrders ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle capacity vs open orders chart"
          aria-expanded={showCapacityVsOrders}
        >
          <BarChart className="h-3 w-3 shrink-0" strokeWidth={2} />
          Capacity/Orders
        </button>

        {/* R39 — Action Items toggle */}
        <button
          type="button"
          onClick={() => setShowActionItems((v) => !v)}
          className={cn(
            "relative inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showActionItems ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle week action items"
          aria-expanded={showActionItems}
        >
          <CheckSquare className="h-3 w-3 shrink-0" strokeWidth={2} />
          Actions
          {weekActionItems.filter((i) => !i.done).length > 0 && (
            <span className="ml-0.5 tabular-nums">
              ({weekActionItems.filter((i) => !i.done).length})
            </span>
          )}
        </button>

        {/* R40 — Supply Chain Status toggle */}
        <button
          type="button"
          onClick={() => setShowSupplyChainStatus((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showSupplyChainStatus ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle supply chain status"
          aria-expanded={showSupplyChainStatus}
        >
          <Truck className="h-3 w-3 shrink-0" strokeWidth={2} />
          Supply chain
        </button>

        {/* R42 — Efficiency Gauge toggle */}
        <button
          type="button"
          onClick={() => setShowEfficiencyGauge((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showEfficiencyGauge ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle production efficiency gauge"
          aria-expanded={showEfficiencyGauge}
        >
          <Gauge className="h-3 w-3 shrink-0" strokeWidth={2} />
          Efficiency
        </button>

        {/* R43 — Exception Summary toggle */}
        <button
          type="button"
          onClick={() => setShowExceptionSummary((v) => !v)}
          className={cn(
            "relative inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showExceptionSummary ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle exception type summary"
          aria-expanded={showExceptionSummary}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
          Exceptions
          {exceptionSummaryData !== null && exceptionSummaryData.totalExceptions > 0 && (
            <span className="ml-0.5 tabular-nums">
              ({exceptionSummaryData.totalExceptions})
            </span>
          )}
        </button>

        {/* R44 — Daily Goal Progress toggle */}
        <button
          type="button"
          onClick={() => setShowDailyGoalProgress((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showDailyGoalProgress ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle daily goal progress bars"
          aria-expanded={showDailyGoalProgress}
        >
          <Target className="h-3 w-3 shrink-0" strokeWidth={2} />
          Daily goals
        </button>

        {/* R45 — Next Week Forecast Preview toggle */}
        <button
          type="button"
          onClick={() => setShowNextWeekPreview((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showNextWeekPreview ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle next week forecast preview"
          aria-expanded={showNextWeekPreview}
        >
          <CalendarRange className="h-3 w-3 shrink-0" strokeWidth={2} />
          Next week
        </button>

        {/* R46 — Week-over-Week Comparison toggle */}
        <button
          type="button"
          onClick={() => setShowWeekComparison((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showWeekComparison ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle week-over-week comparison"
          aria-expanded={showWeekComparison}
        >
          <GitCompare className="h-3 w-3 shrink-0" strokeWidth={2} />
          vs Last week
        </button>

        {/* R48 — Capacity Utilization Bar toggle */}
        <button
          type="button"
          onClick={() => setShowCapacityUtilBar((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showCapacityUtilBar ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle capacity utilization bar"
          aria-expanded={showCapacityUtilBar}
        >
          <Gauge className="h-3 w-3 shrink-0" strokeWidth={2} />
          Capacity
        </button>

        {/* R50 — Forecast Accuracy toggle */}
        <button
          type="button"
          onClick={() => setShowWeeklyForecastAccuracy((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showWeeklyForecastAccuracy ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle forecast accuracy panel"
          aria-expanded={showWeeklyForecastAccuracy}
        >
          <Target className="h-3 w-3 shrink-0" strokeWidth={2} />
          Forecast accuracy
        </button>

        {/* R52 — Order Fulfillment toggle */}
        <button
          type="button"
          onClick={() => setShowOrderFulfillment((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showOrderFulfillment ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle order fulfillment panel"
          aria-expanded={showOrderFulfillment}
        >
          <ClipboardCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
          Order fulfillment
        </button>

        {/* R54 — Week Milestone Tracker toggle */}
        <button
          type="button"
          onClick={() => setShowWeekMilestones((v) => !v)}
          className={cn(
            "relative inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showWeekMilestones ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle week milestones"
          aria-expanded={showWeekMilestones}
        >
          <Flag className="h-3 w-3 shrink-0" strokeWidth={2} />
          Milestones
          {incompleteMilestoneCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white leading-none">
              {incompleteMilestoneCount}
            </span>
          )}
        </button>

        {/* R43 (new) — Risk Matrix toggle */}
        <button
          type="button"
          onClick={() => setShowRiskMatrix((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showRiskMatrix ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle risk matrix"
          aria-expanded={showRiskMatrix}
        >
          <ShieldAlert className="h-3 w-3 shrink-0" strokeWidth={2} />
          Risk Matrix
        </button>

        {/* R44 (new) — Production Gap Alert toggle */}
        <button
          type="button"
          onClick={() => setShowProductionGapAlert((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showProductionGapAlert ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle production gap alert"
          aria-expanded={showProductionGapAlert}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
          Production Gaps
        </button>

        {/* R45 (new) — Supplier Schedule Panel toggle */}
        <button
          type="button"
          onClick={() => setShowSupplierSchedulePanel((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showSupplierSchedulePanel ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle supplier schedule panel"
          aria-expanded={showSupplierSchedulePanel}
        >
          <CalendarRange className="h-3 w-3 shrink-0" strokeWidth={2} />
          Supplier Schedule
        </button>

        {/* R46 (new) — Shift Utilization Panel toggle */}
        <button
          type="button"
          onClick={() => setShowShiftUtilizationPanel((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showShiftUtilizationPanel ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle shift utilization panel"
          aria-expanded={showShiftUtilizationPanel}
        >
          <Clock3 className="h-3 w-3 shrink-0" strokeWidth={2} />
          Shifts
        </button>

        {/* R47 (new) — QC Summary toggle */}
        <button
          type="button"
          onClick={() => setShowQualityControlSummary((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showQualityControlSummary ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle QC summary panel"
          aria-expanded={showQualityControlSummary}
        >
          <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
          QC Summary
        </button>

        {/* R48 (new) — Customer Delivery Schedule toggle */}
        <button
          type="button"
          onClick={() => setShowCustomerDeliverySchedule((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showCustomerDeliverySchedule ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle customer delivery schedule"
          aria-expanded={showCustomerDeliverySchedule}
        >
          <Truck className="h-3 w-3 shrink-0" strokeWidth={2} />
          Deliveries
        </button>

        {/* R49 (new) — Efficiency Matrix toggle */}
        <button
          type="button"
          onClick={() => setShowProductionEfficiencyMatrix((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showProductionEfficiencyMatrix ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle production efficiency matrix"
          aria-expanded={showProductionEfficiencyMatrix}
        >
          <Grid3X3 className="h-3 w-3 shrink-0" strokeWidth={2} />
          Efficiency Matrix
        </button>

        {/* R50 (new) — RM Receipts Timeline toggle */}
        <button
          type="button"
          onClick={() => setShowRmReceiptsTimeline((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showRmReceiptsTimeline ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle RM receipts timeline"
          aria-expanded={showRmReceiptsTimeline}
        >
          <PackageCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
          RM Receipts
        </button>

        {/* R51 (new) — KPI Trends Panel toggle */}
        <button
          type="button"
          onClick={() => setShowKpiTrendPanel((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showKpiTrendPanel ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle KPI trends panel"
          aria-expanded={showKpiTrendPanel}
        >
          <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={2} />
          KPI Trends
        </button>

        {/* R52 (new) — Capacity Allocation Panel toggle */}
        <button
          type="button"
          onClick={() => setShowCapacityAllocationPanel((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-bg-subtle border border-border/40 hover:bg-bg-raised transition-colors",
            showCapacityAllocationPanel ? "text-accent border-accent/30" : "text-fg-muted hover:text-fg-strong",
          )}
          title="Toggle capacity allocation panel"
          aria-expanded={showCapacityAllocationPanel}
        >
          <Gauge className="h-3 w-3 shrink-0" strokeWidth={2} />
          Capacity
        </button>

        <div className="ml-auto">
          <Link
            href="/planning/inventory-flow"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-bg-raised px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            <Package className="h-3.5 w-3.5" strokeWidth={2} />
            Full inventory flow
          </Link>
        </div>
      </div>

      {/* R30 — Planner Weekly Commentary editor */}
      {showCommentaryEditor && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
          <div className="text-3xs text-fg-faint font-medium">
            Week {weekStart} — Planner Notes
          </div>
          <textarea
            className="w-full text-3xs p-2 border border-border rounded bg-bg-subtle resize-none h-20 mt-1 placeholder:text-fg-faint"
            placeholder="Add weekly notes, decisions, or observations..."
            value={weeklyCommentary}
            onChange={(e) => handleCommentaryChange(e.target.value)}
          />
          <div className="flex items-center justify-between mt-0.5">
            {weeklyCommentary.trim().length > 0 && (
              <button
                type="button"
                onClick={() => handleCommentaryChange("")}
                className="text-3xs text-fg-faint underline hover:text-fg-muted"
              >
                Clear
              </button>
            )}
            <span className="text-3xs text-fg-faint text-right ml-auto">
              {weeklyCommentary.length} chars
            </span>
          </div>
        </div>
      )}

      {/* R32 — Daily Alert Breakdown strip */}
      {showAlertsBreakdown && (
        <div className="mt-2">
          <div className="flex gap-1">
            {weekWorkDays.map((iso) => {
              const count = alertsByDay.get(iso) ?? 0;
              const barHeightPct = Math.round((count / alertsMaxCount) * 100);
              const barColor =
                count >= 3
                  ? "bg-danger-softer"
                  : count >= 1
                    ? "bg-warning-softer"
                    : "bg-bg-muted";
              const dayLabel = new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
              return (
                <div
                  key={iso}
                  className="flex flex-col items-center gap-0.5 rounded p-1 text-3xs w-10 bg-bg-subtle border border-border/40"
                >
                  <span className="text-fg-faint">{dayLabel}</span>
                  <span className="text-fg-strong font-medium tabular-nums">{count}</span>
                  <div className="h-4 w-full rounded mt-0.5 bg-bg-muted overflow-hidden flex items-end">
                    <div
                      className={cn("w-full rounded", barColor)}
                      style={{ height: `${barHeightPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* R34 — Circular KPI Ring */}
      {showKpiRing && (() => {
        const pct = kpiRingValue ?? 0;
        const arcColor = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
        const dashArray = `${(pct * 1.257).toFixed(2)} 125.7`;
        return (
          <div className="flex items-center gap-4 bg-bg-subtle border border-border rounded p-2 mt-2">
            <svg viewBox="0 0 60 60" width="64" height="64" aria-hidden="true">
              {/* Track */}
              <circle
                cx="30"
                cy="30"
                r="20"
                stroke="#e2e8f0"
                strokeWidth="8"
                fill="none"
              />
              {/* Progress arc */}
              {kpiRingValue !== null && (
                <circle
                  cx="30"
                  cy="30"
                  r="20"
                  stroke={arcColor}
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={dashArray}
                  strokeDashoffset="31.4"
                  strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "30px 30px" }}
                />
              )}
              {/* Center label */}
              <text
                x="30"
                y="34"
                textAnchor="middle"
                fontSize="11"
                fontWeight="bold"
                fill="currentColor"
              >
                {kpiRingValue !== null ? kpiRingValue : "—"}
              </text>
            </svg>
            <div className="flex flex-col gap-0.5">
              <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                Weekly KPI Score
              </span>
              <span className="text-2xl font-bold text-fg-strong tabular-nums leading-none">
                {kpiRingValue !== null ? kpiRingValue : "—"}
              </span>
              <span className="text-3xs text-fg-faint">out of 100</span>
            </div>
          </div>
        );
      })()}

      {/* R36 — Daily Stock Movement Chart */}
      {showDailyMovement && (() => {
        const maxIn = Math.max(...dailyMovementData.map((d) => d.inQty), 1);
        const maxOut = Math.max(...dailyMovementData.map((d) => d.outQty), 1);
        const scale = Math.max(maxIn, maxOut);
        const barH = (v: number) => Math.max(2, Math.round((v / scale) * 32));
        const groupXs = [10, 35, 60, 85, 110];
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1">
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Daily Stock Movement (This Week)
            </div>
            <svg viewBox="0 0 150 48" width="100%" style={{ maxWidth: 300 }} aria-label="Daily stock movement chart">
              {dailyMovementData.map((day, i) => {
                const x = groupXs[i] ?? 10;
                const inH = barH(day.inQty);
                const outH = barH(day.outQty);
                const netColor = day.net >= 0 ? "#22c55e" : "#ef4444";
                const netLabel = day.net >= 0 ? `+${day.net}` : String(day.net);
                return (
                  <g key={i}>
                    {/* Green bar (in) */}
                    <rect x={x} y={36 - inH} width={7} height={inH} fill="#22c55e" rx={1} />
                    {/* Red bar (out) */}
                    <rect x={x + 8} y={36 - outH} width={7} height={outH} fill="#ef4444" rx={1} />
                    {/* Day label */}
                    <text x={x + 7} y={46} fontSize="6" textAnchor="middle" fill="#94a3b8">{day.label.slice(0, 3)}</text>
                    {/* Net label */}
                    <text x={x + 7} y={Math.max(36 - Math.max(inH, outH) - 2, 6)} fontSize="5.5" textAnchor="middle" fill={netColor}>{netLabel}</text>
                  </g>
                );
              })}
            </svg>
            <div className="flex gap-3 mt-1 text-fg-faint" style={{ fontSize: "0.55rem" }}>
              <span className="flex items-center gap-0.5"><span style={{ color: "#22c55e" }}>●</span> In</span>
              <span className="flex items-center gap-0.5"><span style={{ color: "#ef4444" }}>●</span> Out</span>
            </div>
          </div>
        );
      })()}

      {/* R38 — Capacity vs Open Orders Chart */}
      {showCapacityVsOrders && (() => {
        const maxCap = Math.max(...capacityVsOrdersData.map((f) => f.capacity), 1);
        const barH = (v: number) => Math.max(2, Math.round((v / maxCap) * 40));
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1">
              <BarChart className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Capacity vs Open Orders by Family
            </div>
            <svg viewBox="0 0 160 56" width="100%" style={{ maxWidth: 320 }} aria-label="Capacity vs open orders chart">
              {capacityVsOrdersData.map((f, i) => {
                const x = i * 30 + 10;
                const capH = barH(f.capacity);
                const ordH = barH(f.orders);
                return (
                  <g key={i}>
                    {/* Capacity bar (blue) */}
                    <rect x={x} y={44 - capH} width={5.5} height={capH} fill="#3b82f6" rx={1} />
                    {/* Orders bar (amber) */}
                    <rect x={x + 6.5} y={44 - ordH} width={5.5} height={ordH} fill="#f59e0b" rx={1} />
                    {/* Family label */}
                    <text x={x + 6} y={54} fontSize="5.5" textAnchor="middle" fill="#94a3b8">
                      {f.family.slice(0, 4)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="flex gap-3 mt-1 text-fg-faint" style={{ fontSize: "0.55rem" }}>
              <span className="flex items-center gap-0.5"><span style={{ color: "#3b82f6" }}>●</span> Capacity</span>
              <span className="flex items-center gap-0.5"><span style={{ color: "#f59e0b" }}>●</span> Orders</span>
            </div>
          </div>
        );
      })()}

      {/* R39 — Week Action Items */}
      {showActionItems && (() => {
        const doneCount = weekActionItems.filter((i) => i.done).length;
        const totalCount = weekActionItems.length;
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1">
              <CheckSquare className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Week Actions
              <span className="text-fg-faint text-3xs ml-auto">{doneCount}/{totalCount} done</span>
            </div>
            <div className="flex flex-col">
              {weekActionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 py-1 border-b border-border last:border-0 text-3xs"
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => {
                      const updated = weekActionItems.map((a) =>
                        a.id === item.id ? { ...a, done: !a.done } : a,
                      );
                      saveActionItems(updated);
                    }}
                    className="mt-0.5 shrink-0"
                  />
                  <span
                    className={cn(
                      "flex-1 text-fg-muted",
                      item.done && "line-through text-fg-faint",
                    )}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => saveActionItems(weekActionItems.filter((a) => a.id !== item.id))}
                    className="text-fg-faint cursor-pointer text-3xs hover:text-danger-fg"
                    aria-label="Delete action"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <input
                className="flex-1 text-3xs border border-border rounded px-1 bg-bg-subtle text-fg-muted placeholder:text-fg-faint"
                placeholder="Add action..."
                value={newActionText}
                onChange={(e) => setNewActionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newActionText.trim()) {
                    const newItem = { id: String(Date.now()), text: newActionText.trim(), done: false };
                    saveActionItems([...weekActionItems, newItem]);
                    setNewActionText("");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!newActionText.trim()) return;
                  const newItem = { id: String(Date.now()), text: newActionText.trim(), done: false };
                  saveActionItems([...weekActionItems, newItem]);
                  setNewActionText("");
                }}
                className="text-3xs px-1.5 py-0.5 rounded bg-bg-raised border border-border/60 text-fg-muted hover:text-fg-strong transition-colors"
              >
                +
              </button>
            </div>
          </div>
        );
      })()}

      {/* R40 — Supply Chain On-Time Status */}
      {showSupplyChainStatus && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
            <Truck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Supply Chain Status — This Week
          </div>
          {supplyChainStats === null ? (
            <div className="text-fg-faint text-3xs mt-1">No delivery data available for this week</div>
          ) : (
            <>
              <div className="flex gap-3 mt-2 text-3xs">
                <div className="flex flex-col items-center bg-success-softer rounded p-2 flex-1">
                  <span className="text-xl font-bold text-success-fg">{supplyChainStats.onTime}</span>
                  <span className="text-fg-faint text-3xs">On time</span>
                </div>
                <div className="flex flex-col items-center bg-danger-softer rounded p-2 flex-1">
                  <span className="text-xl font-bold text-danger-fg">{supplyChainStats.late}</span>
                  <span className="text-fg-faint text-3xs">Late</span>
                </div>
                <div className="flex flex-col items-center bg-bg-muted rounded p-2 flex-1">
                  <span className="text-xl font-bold text-fg-muted">{supplyChainStats.pending}</span>
                  <span className="text-fg-faint text-3xs">In transit</span>
                </div>
              </div>
              <div className="h-1.5 bg-bg-muted rounded-full mt-2">
                <div
                  className="bg-success-fg rounded-full h-full transition-all duration-500"
                  style={{ width: `${supplyChainStats.onTimePct ?? 0}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* R42 — Production Efficiency Gauge */}
      {showEfficiencyGauge && (() => {
        const ed = efficiencyData;
        const pct = ed?.efficiencyPct ?? 0;
        const arcColor =
          pct >= 100 ? "#22c55e" : pct >= 80 ? "#f59e0b" : "#ef4444";
        const dashLen = (pct * 1.257).toFixed(2);
        const statusChipClass =
          ed?.status === "on-target"
            ? "bg-success-softer text-success-fg"
            : ed?.status === "near"
              ? "bg-warning-softer text-warning-fg"
              : "bg-danger-softer text-danger-fg";
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
              <Gauge className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Production Efficiency — This Week
            </div>
            {ed === null ? (
              <div className="text-fg-faint text-3xs mt-1">No production data for this week</div>
            ) : (
              <div className="flex flex-col items-center gap-1 mt-1">
                <svg viewBox="0 0 100 56" width="120" height="70" aria-label="Production efficiency gauge">
                  {/* Background arc */}
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={8}
                    strokeLinecap="round"
                  />
                  {/* Progress arc */}
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke={arcColor}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray={`${dashLen} 200`}
                  />
                  {/* Center value */}
                  <text
                    x="50"
                    y="46"
                    textAnchor="middle"
                    fontSize="14"
                    fill="#0f172a"
                    fontWeight="bold"
                  >
                    {ed.efficiencyPct}%
                  </text>
                  {/* Sub-label */}
                  <text x="50" y="54" textAnchor="middle" fontSize="6" fill="#94a3b8">
                    {Math.round(ed.actual)} / {Math.round(ed.planned)} units
                  </text>
                </svg>
                <span
                  className={cn(
                    "text-3xs rounded-full px-2 py-0.5 mt-1 text-center font-medium capitalize",
                    statusChipClass,
                  )}
                >
                  {ed.status === "on-target" ? "On target" : ed.status === "near" ? "Near target" : "Behind"}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* R43 — Exception Type Summary */}
      {showExceptionSummary && (() => {
        const esd = exceptionSummaryData;
        const totalExceptions = esd?.totalExceptions ?? 0;
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Exception Summary — This Week
              {totalExceptions > 0 && (
                <span className="ml-1 text-3xs rounded-full px-1.5 py-0.5 bg-danger-softer text-danger-fg font-semibold tabular-nums">
                  {totalExceptions}
                </span>
              )}
            </div>
            {esd === null || esd.groups.length === 0 ? (
              <div className="flex items-center gap-1 text-success-fg text-3xs mt-1">
                <CheckCircle className="h-3 w-3 shrink-0" strokeWidth={2} />
                No exceptions this week
              </div>
            ) : (
              <div className="flex flex-col mt-1">
                {esd.groups.map((g) => {
                  const dotClass =
                    g.severity === "critical"
                      ? "bg-danger-fg"
                      : g.severity === "warn"
                        ? "bg-warning-fg"
                        : "bg-info-fg";
                  const countClass =
                    g.severity === "critical"
                      ? "text-danger-fg"
                      : g.severity === "warn"
                        ? "text-warning-fg"
                        : "text-info-fg";
                  return (
                    <div
                      key={g.type}
                      className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)} />
                      <span className="text-fg-muted flex-1 truncate">{g.type}</span>
                      <span className={cn("font-medium tabular-nums", countClass)}>{g.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* R44 — Daily Goal Progress Bars */}
      {showDailyGoalProgress && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
            <Target className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Daily Production Progress
          </div>
          <div className="flex gap-2 mt-2">
            {dailyGoalData.map((day) => {
              const barColor =
                day.pct >= 100
                  ? "bg-success-fg"
                  : day.pct >= 60
                    ? "bg-warning-fg"
                    : "bg-danger-fg";
              return (
                <div key={day.dayLabel} className="flex-1 flex flex-col">
                  <div className="text-3xs text-fg-faint text-center mb-1">{day.dayLabel}</div>
                  <div className="h-16 bg-bg-muted rounded flex flex-col-reverse overflow-hidden">
                    <div
                      className={cn("rounded transition-all", barColor)}
                      style={{ height: `${day.pct}%` }}
                    />
                  </div>
                  <div className="text-3xs text-center text-fg-muted mt-1">
                    {day.actual}/{day.target}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* R45 — Next Week Forecast Preview */}
      {showNextWeekPreview && (
        <div className="bg-info-softer border border-info/20 rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
            <CalendarRange className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Next Week ({nextWeekStart})
          </div>
          {nextWeekPreviewData === null ? (
            <div className="text-fg-faint text-3xs mt-1">No forecast data available for next week</div>
          ) : (
            <>
              <div className="mt-1">
                <span className="text-xs font-bold text-fg-strong">{nextWeekPreviewData.totalNextWeek.toLocaleString()}</span>
                {" "}
                <span className="text-3xs text-fg-faint">total forecasted</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-1">
                {nextWeekPreviewData.topItems.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-3xs">
                    <span className="text-fg-muted flex-1 truncate">{item.name}</span>
                    <span className="text-fg-faint">{item.qty} {item.unit}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* R46 — Week-over-Week Comparison Panel */}
      {showWeekComparison && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
            <GitCompare className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            This week vs last week
          </div>
          {weekComparisonData === null ? (
            <div className="text-fg-faint text-3xs">No comparison data available</div>
          ) : (
            <div className="flex flex-col gap-1">
              {weekComparisonData.metrics.map(({ label, current, prev, deltaPct }) => {
                const isPositive = deltaPct > 0;
                const isNeutral = deltaPct === 0;
                const deltaClass = isNeutral
                  ? "text-fg-muted"
                  : isPositive
                    ? "text-success-fg"
                    : "text-danger-fg";
                const arrow = isNeutral ? "" : isPositive ? "↑" : "↓";
                return (
                  <div key={label} className="flex items-center gap-2 text-3xs py-0.5">
                    <span className="text-fg-muted w-28 shrink-0">{label}</span>
                    <span className="text-fg-strong font-medium tabular-nums w-16 text-right">{current.toLocaleString()}</span>
                    <span className="text-fg-faint tabular-nums w-16 text-right">{prev.toLocaleString()}</span>
                    <span className={cn("font-medium tabular-nums w-14 text-right", deltaClass)}>
                      {arrow}{Math.abs(deltaPct)}%
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 text-3xs text-fg-faint pt-1 border-t border-border/30 mt-0.5">
                <span className="w-28 shrink-0" />
                <span className="w-16 text-right">This week</span>
                <span className="w-16 text-right">Last week</span>
                <span className="w-14 text-right">Change</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* R48 — Capacity Utilization Bar Panel */}
      {showCapacityUtilBar && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
            <Gauge className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Weekly Capacity Utilization
          </div>
          {capacityUtilData === null ? (
            <div className="text-fg-faint text-3xs">No capacity data available</div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-4 rounded-full bg-bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      capacityUtilData.status === "over"
                        ? "bg-danger-fg"
                        : capacityUtilData.status === "optimal"
                          ? "bg-success-fg"
                          : "bg-warning-fg",
                    )}
                    style={{ width: `${capacityUtilData.pct}%` }}
                  />
                </div>
                <span className="text-3xs font-semibold tabular-nums text-fg-strong w-8 text-right shrink-0">
                  {capacityUtilData.pct}%
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "text-3xs font-medium capitalize",
                    capacityUtilData.status === "over"
                      ? "text-danger-fg"
                      : capacityUtilData.status === "optimal"
                        ? "text-success-fg"
                        : "text-warning-fg",
                  )}
                >
                  {capacityUtilData.status === "over"
                    ? "Over capacity"
                    : capacityUtilData.status === "optimal"
                      ? "Optimal"
                      : "Under utilized"}
                </span>
                {capacityUtilData.total > 0 && (
                  <span className="text-3xs text-fg-faint">
                    {capacityUtilData.used.toLocaleString()} / {capacityUtilData.total.toLocaleString()} units
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* R50 — Weekly Forecast Accuracy Panel */}
      {showWeeklyForecastAccuracy && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
            <Target className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Weekly Forecast Accuracy
            {weeklyForecastAccuracyData?.trend === "up" && (
              <TrendingUp className="h-3 w-3 text-success-fg ml-1" strokeWidth={2} />
            )}
            {weeklyForecastAccuracyData?.trend === "down" && (
              <TrendingDown className="h-3 w-3 text-danger-fg ml-1" strokeWidth={2} />
            )}
          </div>
          {weeklyForecastAccuracyQuery.isLoading ? (
            <div className="h-8 animate-pulse rounded bg-bg-muted/40" />
          ) : weeklyForecastAccuracyData === null ? (
            <div className="text-fg-faint text-3xs">No forecast accuracy data available</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums leading-none",
                    weeklyForecastAccuracyData.overallPct >= 90
                      ? "text-success-fg"
                      : weeklyForecastAccuracyData.overallPct >= 75
                        ? "text-warning-fg"
                        : "text-danger-fg",
                  )}
                >
                  {weeklyForecastAccuracyData.overallPct.toFixed(1)}%
                </span>
                <span className="text-3xs text-fg-faint">accuracy this week</span>
              </div>
              {weeklyForecastAccuracyData.worstSkus.length > 0 && (
                <div>
                  <div className="text-3xs text-fg-faint font-medium mb-0.5">Worst performers</div>
                  <div className="flex flex-col gap-0.5">
                    {weeklyForecastAccuracyData.worstSkus.map((sku) => (
                      <div key={sku.name} className="flex items-center justify-between text-3xs">
                        <span className="text-fg-muted truncate max-w-40" title={sku.name}>
                          {sku.name}
                        </span>
                        <span className="text-danger-fg font-medium tabular-nums ml-2">
                          {sku.errorPct.toFixed(1)}% error
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* R52 — Order Fulfillment Summary Panel */}
      {showOrderFulfillment && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
            <ClipboardCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Order Fulfillment This Week
          </div>
          {orderFulfillmentQuery.isLoading ? (
            <div className="h-8 animate-pulse rounded bg-bg-muted/40" />
          ) : orderFulfillmentData === null ? (
            <div className="text-fg-faint text-3xs">No fulfillment data available</div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                  <span className="text-3xs text-fg-faint">Open</span>
                  <span className="text-sm font-bold tabular-nums text-fg-strong">
                    {orderFulfillmentData.openOrders}
                  </span>
                  <span className="text-3xs rounded-full px-1.5 py-0.5 bg-info-softer text-info-fg self-start font-medium">
                    orders
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                  <span className="text-3xs text-fg-faint">Fulfilled</span>
                  <span className="text-sm font-bold tabular-nums text-fg-strong">
                    {orderFulfillmentData.fulfilled}
                  </span>
                  <span className="text-3xs rounded-full px-1.5 py-0.5 bg-success-softer text-success-fg self-start font-medium">
                    complete
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                  <span className="text-3xs text-fg-faint">Partial</span>
                  <span className="text-sm font-bold tabular-nums text-fg-strong">
                    {orderFulfillmentData.partial}
                  </span>
                  <span className="text-3xs rounded-full px-1.5 py-0.5 bg-warning-softer text-warning-fg self-start font-medium">
                    partial
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                  <span className="text-3xs text-fg-faint">Canceled</span>
                  <span className="text-sm font-bold tabular-nums text-fg-strong">
                    {orderFulfillmentData.canceled}
                  </span>
                  <span className="text-3xs rounded-full px-1.5 py-0.5 bg-danger-softer text-danger-fg self-start font-medium">
                    canceled
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-3xs text-fg-faint mb-0.5">
                  <span>Fulfillment rate</span>
                  <span className="font-semibold text-fg-strong tabular-nums">
                    {orderFulfillmentData.fulfillmentRate}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      orderFulfillmentData.fulfillmentRate >= 90
                        ? "bg-success-softer"
                        : orderFulfillmentData.fulfillmentRate >= 70
                          ? "bg-warning-softer"
                          : "bg-danger-softer",
                    )}
                    style={{ width: `${orderFulfillmentData.fulfillmentRate}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* R54 — Week Milestone Tracker Panel */}
      {showWeekMilestones && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
            <Flag className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Week Milestones
          </div>
          <div className="flex flex-col gap-1 mb-2">
            {weekMilestones.length === 0 ? (
              <div className="text-3xs text-fg-faint">No milestones yet — add one below.</div>
            ) : (
              weekMilestones.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={() => toggleMilestone(m.id)}
                    className="h-3 w-3 accent-accent shrink-0"
                  />
                  <span
                    className={cn(
                      "text-3xs",
                      m.done ? "line-through text-fg-faint" : "text-fg-muted",
                    )}
                  >
                    {m.text}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center gap-1 border-t border-border pt-1.5">
            <input
              type="text"
              value={newMilestoneText}
              onChange={(e) => setNewMilestoneText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addMilestone();
              }}
              placeholder="Add milestone..."
              className="flex-1 text-3xs px-1.5 py-0.5 border border-border rounded bg-bg-subtle placeholder:text-fg-faint"
            />
            <button
              type="button"
              onClick={addMilestone}
              disabled={!newMilestoneText.trim()}
              className="text-3xs px-2 py-0.5 rounded bg-accent text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              Add
            </button>
          </div>
          {weekMilestones.length > 0 && (
            <div className="mt-1.5 text-3xs text-fg-faint text-right">
              {weekMilestones.filter((m) => m.done).length} / {weekMilestones.length} complete
            </div>
          )}
        </div>
      )}

      {/* R43 (new) — Risk Matrix Panel */}
      {showRiskMatrix && (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-3">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Risk Matrix — Likelihood × Impact
          </div>
          {/* 3×3 grid: rows = Impact (High→Low), cols = Likelihood (Low→High) */}
          <div className="grid grid-cols-4 gap-1 text-3xs">
            {/* Header row */}
            <div className="text-fg-faint text-right pr-1 flex items-end pb-1">Impact ↓ / Likelihood →</div>
            {(["Low", "Med", "High"] as const).map((likelihood) => (
              <div key={likelihood} className="text-center font-semibold text-fg-muted pb-1">
                {likelihood}
              </div>
            ))}
            {/* Data rows: High impact → Low impact */}
            {(["High", "Med", "Low"] as const).map((impact) => (
              <React.Fragment key={impact}>
                <div className="font-semibold text-fg-muted text-right pr-1 flex items-center justify-end">
                  {impact}
                </div>
                {(["Low", "Med", "High"] as const).map((likelihood) => {
                  // Map risk items to cells
                  const cellRisks: Array<{ label: string; color: string }> = [];
                  if (impact === "High" && likelihood === "High") {
                    cellRisks.push({ label: "Material shortage", color: "bg-danger-fg" });
                  }
                  if (impact === "High" && likelihood === "Med") {
                    cellRisks.push({ label: "Demand spike", color: "bg-warning-fg" });
                  }
                  if (impact === "Med" && likelihood === "Low") {
                    cellRisks.push({ label: "Equipment downtime", color: "bg-yellow-400" });
                  }
                  if (impact === "Low" && likelihood === "Med") {
                    cellRisks.push({ label: "Staff absence", color: "bg-yellow-400" });
                  }
                  const cellBg =
                    impact === "High" && likelihood === "High"
                      ? "bg-danger-softer/40"
                      : (impact === "High" && likelihood === "Med") ||
                          (impact === "Med" && likelihood === "High")
                        ? "bg-warning-softer/40"
                        : impact === "Low" && likelihood === "Low"
                          ? "bg-success-softer/20"
                          : "bg-bg-muted/60";
                  return (
                    <div
                      key={likelihood}
                      className={cn(
                        "rounded min-h-[3rem] p-1 flex flex-col gap-1 items-start justify-start border border-border/30",
                        cellBg,
                      )}
                    >
                      {cellRisks.map((risk) => (
                        <div
                          key={risk.label}
                          className="flex items-center gap-1"
                          title={risk.label}
                        >
                          <span
                            className={cn(
                              "inline-block h-2 w-2 rounded-full shrink-0",
                              risk.color,
                            )}
                          />
                          <span className="text-fg-muted leading-tight" style={{ fontSize: "0.55rem" }}>
                            {risk.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 text-3xs text-fg-faint border-t border-border/30 pt-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-danger-fg" />
              High risk
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-warning-fg" />
              Medium risk
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
              Low-medium risk
            </span>
          </div>
        </div>
      )}

      {/* R44 (new) — Production Gap Alert Panel */}
      {showProductionGapAlert && (() => {
        const gapRows: Array<{ item: string; planned: number; demand: number }> = [
          { item: "GT Cocktail 330ml", planned: 480, demand: 650 },
          { item: "GT Tea Ginger 500ml", planned: 200, demand: 310 },
          { item: "GT Smoothie Berry 250ml", planned: 120, demand: 175 },
        ];
        const totalGap = gapRows.reduce((s, r) => s + (r.demand - r.planned), 0);
        return (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Production Gap Alert
            </div>
            <div className="flex flex-col gap-0">
              {/* Header */}
              <div className="flex items-center gap-2 text-3xs text-fg-faint font-medium pb-1 border-b border-border/40">
                <span className="flex-1">Item</span>
                <span className="w-16 text-right">Planned</span>
                <span className="w-16 text-right">Demand</span>
                <span className="w-14 text-right">Gap</span>
              </div>
              {/* Data rows */}
              {gapRows.map((row) => {
                const gap = row.demand - row.planned;
                return (
                  <div
                    key={row.item}
                    className="flex items-center gap-2 text-3xs py-1.5 border-b border-border/20 last:border-0"
                  >
                    <span className="flex-1 text-fg-muted truncate" title={row.item}>
                      {row.item}
                    </span>
                    <span className="w-16 text-right tabular-nums text-fg-muted">
                      {row.planned.toLocaleString()}
                    </span>
                    <span className="w-16 text-right tabular-nums text-fg-muted">
                      {row.demand.toLocaleString()}
                    </span>
                    <span className="w-14 text-right tabular-nums font-semibold text-danger-fg">
                      -{gap.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              {/* Total gap line */}
              <div className="flex items-center gap-2 text-3xs pt-1.5 mt-0.5 border-t border-border/60 font-semibold">
                <span className="flex-1 text-fg-strong">Total gap</span>
                <span className="w-16 text-right" />
                <span className="w-16 text-right" />
                <span className="w-14 text-right tabular-nums text-danger-fg">
                  -{totalGap.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* R31 — Production by Family Bar Chart */}
      {showFamilyProductionChart && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
          <div className="text-3xs text-fg-faint font-medium mb-1">Production by Family</div>
          {familyProductionData.length === 0 ? (
            <div className="text-3xs text-fg-faint">No family data</div>
          ) : (() => {
            const maxPlanned = Math.max(...familyProductionData.map((r) => r.planned), 1);
            return (
              <div className="flex flex-col gap-0.5">
                {familyProductionData.map((row) => {
                  const producedPct = Math.min((row.produced / maxPlanned) * 100, 100);
                  return (
                    <div key={row.family} className="flex items-center gap-2 text-3xs py-0.5">
                      <span className="max-w-20 truncate text-fg-muted" title={row.family}>
                        {row.family}
                      </span>
                      <div className="h-2 flex-1 bg-bg-muted rounded overflow-hidden">
                        <div className="h-full flex">
                          <div
                            className="bg-success-fg h-full transition-all duration-500"
                            style={{ width: `${producedPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-fg-muted w-6 text-right tabular-nums">
                        {Math.round(row.produced)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger-softer/30 px-4 py-3 text-xs text-danger-fg">
          Could not load inventory flow data. Check your connection and try refreshing.
        </div>
      )}

      {/* Weekly stat cards */}
      <div className="mt-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-md border border-border/40 bg-bg-subtle/40" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                { label: "Total demand", value: Math.round(weekTotals.weekTotalDemand).toLocaleString(), unit: "units", Icon: TrendingDown, tone: "neutral" as const },
                { label: "Planned production", value: Math.round(weekTotals.weekTotalProduction).toLocaleString(), unit: "units", Icon: TrendingUp, tone: "accent" as const },
                { label: "Demand coverage", value: `${weekTotals.weekCoveredPct}%`, unit: "", Icon: BarChart2, tone: (weekTotals.weekCoveredPct >= 90 ? "success" : weekTotals.weekCoveredPct >= 60 ? "warning" : "danger") as "success" | "warning" | "danger" },
                { label: "Receipts expected", value: receiptsThisWeek.toLocaleString(), unit: "POs", Icon: Truck, tone: (receiptsThisWeek > 0 ? "success" : "neutral") as "success" | "neutral" },
                { label: "At-risk SKUs", value: atRiskCount.toLocaleString(), unit: stockoutCount > 0 ? `, ${stockoutCount} stockout` : "", Icon: AlertTriangle, tone: (atRiskCount > 0 ? (stockoutCount > 0 ? "danger" : "warning") : "success") as "danger" | "warning" | "success" },
              ]
            ).map(({ label, value, unit, Icon, tone }) => {
              const toneClass =
                tone === "accent"
                  ? { bg: "bg-accent-softer/20 border-accent/20", icon: "text-accent", val: "text-accent" }
                  : tone === "success"
                    ? { bg: "bg-success-softer/30 border-success/30", icon: "text-success-fg", val: "text-success-fg" }
                    : tone === "warning"
                      ? { bg: "bg-warning-softer/30 border-warning/30", icon: "text-warning-fg", val: "text-warning-fg" }
                      : tone === "danger"
                        ? { bg: "bg-danger-softer/30 border-danger/30", icon: "text-danger-fg", val: "text-danger-fg" }
                        : { bg: "bg-bg-subtle/60 border-border/60", icon: "text-fg-muted", val: "text-fg-strong" };
              return (
                <div
                  key={label}
                  className={cn("rounded-md border p-3 flex flex-col gap-2", toneClass.bg)}
                  title={label}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">{label}</span>
                    <Icon className={cn("h-3.5 w-3.5", toneClass.icon)} strokeWidth={2} />
                  </div>
                  <div>
                    <div className={cn("text-xl font-bold tabular-nums leading-none", toneClass.val)}>{value}</div>
                    {unit && <div className="mt-0.5 text-3xs text-fg-muted">{unit}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* R33 — Shipment Tracking Status Chips */}
      {shipmentStatusGroups.length > 0 && (
        <div className="mt-3">
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-muted mb-1">
            Shipments this week
          </div>
          <div className="flex gap-1 flex-wrap">
            {shipmentStatusGroups.map(({ status, count }) => {
              const sl = status.toLowerCase();
              const chipClass =
                sl.includes("delivered") || sl.includes("completed")
                  ? "bg-success-softer text-success-fg"
                  : sl.includes("transit") || sl.includes("active") || sl.includes("in_transfer")
                    ? "bg-info-softer text-info-fg"
                    : sl.includes("delayed") || sl.includes("overdue")
                      ? "bg-danger-softer text-danger-fg"
                      : "bg-bg-muted text-fg-muted";
              return (
                <span
                  key={status}
                  className={cn(
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 font-medium",
                    chipClass,
                  )}
                >
                  <Truck className="h-3 w-3 shrink-0" strokeWidth={2} />
                  {status}: {count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* R35 — Forecast Accuracy Chip + R37 — Week Risk Score Chip */}
      <div className="mt-2 flex flex-wrap gap-2 items-center">
        {weekForecastAccuracy !== null && (() => {
          const acc = weekForecastAccuracy;
          const chipClass =
            acc >= 80
              ? "bg-success-softer text-success-fg"
              : acc >= 60
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 font-medium",
                chipClass,
              )}
            >
              <Target className="h-3 w-3 shrink-0" strokeWidth={2} />
              Forecast accuracy: {acc}%
            </span>
          );
        })()}
        {/* R37 — Week Risk Score Chip */}
        {(() => {
          const { score, level } = weekRiskScore;
          const chipClass =
            level === "low"
              ? "bg-success-softer text-success-fg"
              : level === "medium"
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 font-medium",
                chipClass,
              )}
            >
              <Shield className="h-3 w-3 shrink-0" strokeWidth={2} />
              Risk: {score}/100
              <span className="opacity-70 capitalize">{level}</span>
            </span>
          );
        })()}
        {/* R41 — Week Cost Summary Chip */}
        {weekCostSummary !== null && (() => {
          const { currentCost, deltaPct } = weekCostSummary;
          const chipClass =
            deltaPct !== null && deltaPct < 0
              ? "bg-success-softer text-success-fg"
              : deltaPct !== null && deltaPct > 10
                ? "bg-danger-softer text-danger-fg"
                : "bg-bg-muted text-fg-muted";
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 font-medium",
                chipClass,
              )}
            >
              <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={2} />
              &#8362;{currentCost.toLocaleString()}
              {deltaPct !== null && (
                <span className="opacity-70">
                  ({deltaPct >= 0 ? "+" : ""}{deltaPct}% vs last week)
                </span>
              )}
            </span>
          );
        })()}
        {/* R47 — On-Time Delivery Rate Chip */}
        {onTimeRateChip !== null && (() => {
          const { pct, onTimeCount, totalOrders } = onTimeRateChip;
          const chipClass =
            pct >= 90
              ? "bg-success-softer text-success-fg"
              : pct >= 70
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                chipClass,
              )}
            >
              <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              {pct.toFixed(0)}% on-time ({onTimeCount}/{totalOrders})
            </span>
          );
        })()}
        {/* R49 — Wastage Rate Chip */}
        {wastageRateChip !== null && (() => {
          const { wastePct } = wastageRateChip;
          const chipClass =
            wastePct > 5
              ? "bg-danger-softer text-danger-fg"
              : wastePct > 2
                ? "bg-warning-softer text-warning-fg"
                : "bg-success-softer text-success-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                chipClass,
              )}
            >
              <Trash2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              {wastePct.toFixed(1)}% waste
            </span>
          );
        })()}
        {/* R51 — Team Load Chip */}
        {teamLoadChip !== null && (() => {
          const { loadPerPerson, teamCount } = teamLoadChip;
          const chipClass =
            loadPerPerson > 50
              ? "bg-warning-softer text-warning-fg"
              : "bg-success-softer text-success-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                chipClass,
              )}
            >
              <Users className="h-3 w-3 shrink-0" strokeWidth={2} />
              {teamCount} people / {loadPerPerson.toFixed(0)} tasks each
            </span>
          );
        })()}
        {/* R53 — Carbon Proxy Chip */}
        {carbonFootprintChip !== null && (
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-success-softer text-success-fg font-medium"
            title="Estimated carbon proxy at 0.15 kg CO₂ per unit produced"
          >
            <Leaf className="h-3 w-3 shrink-0" strokeWidth={2} />
            ~{carbonFootprintChip.carbonKg.toFixed(0)} kg CO₂ proxy
          </span>
        )}
        {/* R55 — Production Efficiency Chip */}
        {productionEfficiencyChip !== null && (() => {
          const { efficiencyPct } = productionEfficiencyChip;
          const chipClass =
            efficiencyPct >= 95
              ? "bg-success-softer text-success-fg"
              : efficiencyPct >= 80
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                chipClass,
              )}
              title={`Production efficiency: ${productionEfficiencyChip.actual.toFixed(0)} actual / ${productionEfficiencyChip.planned.toFixed(0)} planned`}
            >
              <Gauge className="h-3 w-3 shrink-0" strokeWidth={2} />
              {efficiencyPct.toFixed(0)}% efficiency
            </span>
          );
        })()}
        {/* R43 (new) — On-Time Delivery Chip */}
        {(() => {
          const otdClass =
            onTimeDeliveryPct >= 90
              ? "bg-success-softer text-success-fg"
              : onTimeDeliveryPct >= 75
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                otdClass,
              )}
              title="On-time delivery rate"
            >
              <Truck className="h-3 w-3 shrink-0" strokeWidth={2} />
              OTD: {onTimeDeliveryPct}%
            </span>
          );
        })()}
        {/* R44 (new) — Raw Material Readiness Chip */}
        {(() => {
          const rmClass =
            rawMaterialReadinessPct >= 90
              ? "bg-success-softer text-success-fg"
              : rawMaterialReadinessPct >= 70
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                rmClass,
              )}
              title="Raw material readiness — proportion of RM lines confirmed available"
            >
              <Package className="h-3 w-3 shrink-0" strokeWidth={2} />
              RM ready: {rawMaterialReadinessPct}%
            </span>
          );
        })()}
        {/* R45 (new) — Defect Rate Chip */}
        {(() => {
          const defectClass =
            defectRateN > 3
              ? "bg-danger-softer text-danger-fg"
              : defectRateN > 1
                ? "bg-warning-softer text-warning-fg"
                : "bg-success-softer text-success-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                defectClass,
              )}
              title="Defect rate — percentage of units flagged as defective this week"
            >
              <ShieldX className="h-3 w-3 shrink-0" strokeWidth={2} />
              Defect: {defectRateN}%
            </span>
          );
        })()}
        {/* R46 (new) — Energy Cost Chip */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium bg-bg-muted text-fg-muted"
          title="Estimated energy cost for the current week"
        >
          <Zap className="h-3 w-3 shrink-0" strokeWidth={2} />
          Energy: &#8362;{Math.round((outlookQuery.data as any)?.energy_cost_week ?? 1840)}
        </span>
        {/* R47 (new) — Inventory Turns Chip */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium bg-bg-muted text-fg-muted"
          title="Inventory turns — annualized turns estimate for the current week"
        >
          <RotateCcw className="h-3 w-3 shrink-0" strokeWidth={2} />
          Turns: {inventoryTurnsValue}x
        </span>
        {/* R48 (new) — Gross Margin Chip */}
        {(() => {
          const marginClass =
            grossMarginPct >= 35
              ? "bg-success-softer text-success-fg"
              : grossMarginPct >= 25
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                marginClass,
              )}
              title="Gross margin percentage for this week"
            >
              <Percent className="h-3 w-3 shrink-0" strokeWidth={2} />
              Margin: {grossMarginPct}%
            </span>
          );
        })()}
        {/* R49 (new) — Customer Orders Chip */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium bg-success-softer text-success-fg"
          title="Open customer orders this week"
        >
          <ClipboardList className="h-3 w-3 shrink-0" strokeWidth={2} />
          Orders: {customerOrdersCount}
        </span>
        {/* R50 (new) — Planned vs Actual Chip */}
        {(() => {
          const paClass =
            plannedVsActualPct >= 95
              ? "bg-success-softer text-success-fg"
              : plannedVsActualPct >= 80
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                paClass,
              )}
              title="Planned vs actual production ratio for this week"
            >
              <GitCompare className="h-3 w-3 shrink-0" strokeWidth={2} />
              P/A: {plannedVsActualPct}%
            </span>
          );
        })()}
        {/* R51 (new) — Production vs Target Chip */}
        {(() => {
          const pvtClass =
            productionVsTargetPct >= 95
              ? "bg-success-softer text-success-fg"
              : productionVsTargetPct >= 80
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                pvtClass,
              )}
              title="Production vs target for this week"
            >
              <Target className="h-3 w-3 shrink-0" strokeWidth={2} />
              P/T: {productionVsTargetPct}%
            </span>
          );
        })()}
        {/* R52 (new) — Planned Downtime Chip */}
        {(() => {
          const dtClass =
            plannedDowntimeHrs <= 2
              ? "bg-success-softer text-success-fg"
              : plannedDowntimeHrs <= 4
                ? "bg-warning-softer text-warning-fg"
                : "bg-danger-softer text-danger-fg";
          return (
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 font-medium",
                dtClass,
              )}
              title="Planned downtime hours this week"
            >
              <ZapOff className="h-3 w-3 shrink-0" strokeWidth={2} />
              Downtime: {plannedDowntimeHrs}h
            </span>
          );
        })()}
      </div>

      {/* R45 (new) — Supplier Schedule Panel */}
      {showSupplierSchedulePanel && (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-2">
            <CalendarRange className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Incoming deliveries this week
          </div>
          <div className="flex flex-col gap-0">
            {/* Header */}
            <div className="flex items-center gap-2 text-3xs text-fg-faint font-medium pb-1 border-b border-border/40">
              <span className="flex-1">Supplier</span>
              <span className="flex-1">Item</span>
              <span className="w-10 text-center">Day</span>
              <span className="w-14 text-right">Qty</span>
              <span className="w-20 text-right">Status</span>
            </div>
            {SUPPLIER_SCHEDULE_MOCK.map((row, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-3xs py-1.5 border-b border-border/20 last:border-0"
              >
                <span className="flex-1 truncate text-fg-muted" title={row.supplier}>
                  {row.supplier}
                </span>
                <span className="flex-1 truncate text-fg-muted" title={row.item}>
                  {row.item}
                </span>
                <span className="w-10 text-center tabular-nums text-fg-muted">
                  {row.day}
                </span>
                <span className="w-14 text-right tabular-nums text-fg-muted">
                  {row.qty.toLocaleString()}
                </span>
                <span className="w-20 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-semibold",
                      row.status === "Confirmed"
                        ? "bg-success-softer text-success-fg border border-success/30"
                        : "bg-warning-softer text-warning-fg border border-warning/30",
                    )}
                  >
                    {row.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* R46 (new) — Shift Utilization Panel */}
      {showShiftUtilizationPanel && (() => {
        const DAY_LABELS: Array<"Sun" | "Mon" | "Tue" | "Wed" | "Thu"> = ["Sun", "Mon", "Tue", "Wed", "Thu"];
        const SHIFT_ROWS: Array<"Morning" | "Evening"> = ["Morning", "Evening"];
        const getCell = (shift: "Morning" | "Evening", day: "Sun" | "Mon" | "Tue" | "Wed" | "Thu") =>
          SHIFT_UTIL_MOCK.find((r) => r.shift === shift && r.day === day)?.pct ?? 0;
        const utilColor = (pct: number) =>
          pct > 90 ? "bg-danger-softer text-danger-fg" : pct >= 70 ? "bg-warning-softer text-warning-fg" : "bg-success-softer text-success-fg";
        return (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
              <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Shift utilization — Sun–Thu
            </div>
            <div className="grid grid-cols-6 gap-1 text-3xs">
              {/* Header row */}
              <div className="text-fg-faint" />
              {DAY_LABELS.map((d) => (
                <div key={d} className="text-center font-semibold text-fg-muted">{d}</div>
              ))}
              {/* Data rows */}
              {SHIFT_ROWS.map((shift) => (
                <React.Fragment key={shift}>
                  <div className="flex items-center text-fg-muted font-medium pr-1">{shift}</div>
                  {DAY_LABELS.map((day) => {
                    const pct = getCell(shift, day);
                    return (
                      <div
                        key={day}
                        className={cn(
                          "rounded text-center py-1.5 tabular-nums font-semibold",
                          utilColor(pct),
                        )}
                        title={`${shift} / ${day}: ${pct}%`}
                      >
                        {pct}%
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-3xs text-fg-faint border-t border-border/30 pt-2">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-success-softer border border-success/30" />&lt;70% normal</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-warning-softer border border-warning/30" />70–90% busy</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-danger-softer border border-danger/30" />&gt;90% overloaded</span>
            </div>
          </div>
        );
      })()}

      {/* R47 (new) — Quality Control Summary Panel */}
      {showQualityControlSummary && (() => {
        const QC_MOCK = {
          batchesInspected: 34,
          passRatePct: 98.5,
          holds: 1,
          rejections: 0,
        };
        const passRateColor =
          QC_MOCK.passRatePct >= 98
            ? "text-success-fg"
            : QC_MOCK.passRatePct >= 95
              ? "text-warning-fg"
              : "text-danger-fg";
        const passRateBg =
          QC_MOCK.passRatePct >= 98
            ? "bg-success-softer"
            : QC_MOCK.passRatePct >= 95
              ? "bg-warning-softer"
              : "bg-danger-softer";
        return (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              QC Summary — This Week
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                <span className="text-3xs text-fg-faint">Batches Inspected</span>
                <span className="text-sm font-bold tabular-nums text-fg-strong">
                  {QC_MOCK.batchesInspected}
                </span>
              </div>
              <div className={cn("flex flex-col gap-0.5 rounded px-2 py-1.5", passRateBg)}>
                <span className="text-3xs text-fg-faint">Pass Rate %</span>
                <span className={cn("text-sm font-bold tabular-nums", passRateColor)}>
                  {QC_MOCK.passRatePct.toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                <span className="text-3xs text-fg-faint">Holds</span>
                <span className={cn(
                  "text-sm font-bold tabular-nums",
                  QC_MOCK.holds > 0 ? "text-warning-fg" : "text-fg-strong",
                )}>
                  {QC_MOCK.holds}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded bg-bg-muted px-2 py-1.5">
                <span className="text-3xs text-fg-faint">Rejections</span>
                <span className={cn(
                  "text-sm font-bold tabular-nums",
                  QC_MOCK.rejections > 0 ? "text-danger-fg" : "text-fg-strong",
                )}>
                  {QC_MOCK.rejections}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* R48 (new) — Customer Delivery Schedule Panel */}
      {showCustomerDeliverySchedule && (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-2">
            <Truck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Customer deliveries — this week
          </div>
          <div className="flex flex-col gap-0">
            {/* Header */}
            <div className="flex items-center gap-2 text-3xs text-fg-faint font-medium pb-1 border-b border-border/40">
              <span className="flex-1">Customer</span>
              <span className="w-12 text-center">Items</span>
              <span className="w-10 text-center">Day</span>
              <span className="w-24 text-right">Status</span>
            </div>
            {CUSTOMER_DELIVERY_MOCK.map((row, idx) => {
              const statusClass =
                row.status === "Delivered"
                  ? "bg-success-softer text-success-fg border border-success/30"
                  : row.status === "In Transit"
                    ? "bg-info-softer text-info-fg border border-info/30"
                    : "bg-bg-muted text-fg-muted border border-border/40";
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-3xs py-1.5 border-b border-border/20 last:border-0"
                >
                  <span className="flex-1 truncate text-fg-muted" title={row.customer}>
                    {row.customer}
                  </span>
                  <span className="w-12 text-center tabular-nums text-fg-muted">
                    {row.items}
                  </span>
                  <span className="w-10 text-center text-fg-muted">
                    {row.day}
                  </span>
                  <span className="w-24 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-semibold",
                        statusClass,
                      )}
                    >
                      {row.status}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* R49 (new) — Production Efficiency Matrix Panel */}
      {showProductionEfficiencyMatrix && (() => {
        const LINES = ["Line A", "Line B", "Line C"] as const;
        const METRICS = ["Throughput", "Quality", "Efficiency"] as const;
        type LineName = typeof LINES[number];
        type MetricName = typeof METRICS[number];
        const MATRIX_DATA: Record<LineName, Record<MetricName, number>> = {
          "Line A": { Throughput: 92, Quality: 97, Efficiency: 88 },
          "Line B": { Throughput: 74, Quality: 91, Efficiency: 79 },
          "Line C": { Throughput: 61, Quality: 85, Efficiency: 65 },
        };
        const cellColor = (pct: number) =>
          pct >= 90
            ? "bg-success-softer text-success-fg"
            : pct >= 75
              ? "bg-warning-softer text-warning-fg"
              : "bg-danger-softer text-danger-fg";
        return (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
              <Grid3X3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Production Efficiency Matrix — Lines × Metrics
            </div>
            <div className="grid grid-cols-4 gap-1 text-3xs">
              {/* Header row */}
              <div className="text-fg-faint" />
              {METRICS.map((metric) => (
                <div key={metric} className="text-center font-semibold text-fg-muted pb-1">
                  {metric}
                </div>
              ))}
              {/* Data rows */}
              {LINES.map((line) => (
                <React.Fragment key={line}>
                  <div className="flex items-center font-medium text-fg-muted pr-1">
                    {line}
                  </div>
                  {METRICS.map((metric) => {
                    const pct = MATRIX_DATA[line][metric];
                    return (
                      <div
                        key={metric}
                        className={cn(
                          "rounded text-center py-1.5 tabular-nums font-semibold",
                          cellColor(pct),
                        )}
                        title={`${line} / ${metric}: ${pct}%`}
                      >
                        {pct}%
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-3xs text-fg-faint border-t border-border/30 pt-2">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-success-softer border border-success/30" />
                &ge;90% on-target
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-warning-softer border border-warning/30" />
                75–89% near
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-danger-softer border border-danger/30" />
                &lt;75% behind
              </span>
            </div>
          </div>
        );
      })()}

      {/* R51 (new) — KPI Trend Panel */}
      {showKpiTrendPanel && (() => {
        const sparklinePoints = (values: number[]): string => {
          const minV = Math.min(...values);
          const maxV = Math.max(...values);
          const range = maxV - minV || 1;
          const w = 80;
          const h = 24;
          const xStep = w / (values.length - 1);
          return values
            .map((v, i) => {
              const x = i * xStep;
              const y = h - ((v - minV) / range) * h;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
        };
        return (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-2">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              KPI Trends — Last 5 weeks
            </div>
            <div className="flex flex-col gap-0">
              {KPI_TRENDS.map((kpi, idx) => {
                const current = kpi.values[kpi.values.length - 1] ?? 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0"
                  >
                    <span className="text-3xs text-fg-muted w-24 shrink-0 truncate" title={kpi.label}>
                      {kpi.label}
                    </span>
                    <span className="text-3xs font-semibold tabular-nums text-fg-strong w-12 text-right shrink-0">
                      {current.toLocaleString()}{kpi.unit}
                    </span>
                    <svg
                      viewBox={`0 0 80 24`}
                      width={80}
                      height={24}
                      aria-label={`${kpi.label} sparkline`}
                      style={{ flexShrink: 0 }}
                    >
                      <polyline
                        points={sparklinePoints(kpi.values)}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* R52 (new) — Capacity Allocation Panel */}
      {showCapacityAllocationPanel && (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-2">
            <Gauge className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Capacity Allocation — This Week
          </div>
          <div className="flex flex-col gap-2">
            {CAPACITY_ALLOC.map((row) => {
              const barColor =
                row.allocPct >= 90
                  ? "bg-danger-fg"
                  : row.allocPct >= 80
                    ? "bg-warning-fg"
                    : "bg-success-fg";
              const pctLabelClass =
                row.allocPct >= 90
                  ? "text-danger-fg"
                  : row.allocPct >= 80
                    ? "text-warning-fg"
                    : "text-success-fg";
              return (
                <div key={row.line} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-3xs font-medium text-fg-strong">{row.line}</span>
                      <span className="text-3xs text-fg-faint">{row.product}</span>
                    </div>
                    <span className={cn("text-3xs font-semibold tabular-nums w-10 text-right", pctLabelClass)}>
                      {row.allocPct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", barColor)}
                      style={{ width: `${row.allocPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-3xs text-fg-faint border-t border-border/30 pt-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-success-fg" />
              &lt;80% normal
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-warning-fg" />
              80–89% high
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-danger-fg" />
              &ge;90% at capacity
            </span>
          </div>
        </div>
      )}

      {/* R50 (new) — RM Receipts Timeline Panel */}
      {showRmReceiptsTimeline && (() => {
        const statusOrder: Record<"Pending" | "In Transit" | "Received", number> = {
          Received: 0,
          "In Transit": 1,
          Pending: 2,
        };
        const progressDots = (status: "Pending" | "In Transit" | "Received") => {
          const steps: Array<"Pending" | "In Transit" | "Received"> = ["Pending", "In Transit", "Received"];
          const current = statusOrder[status];
          return (
            <div className="flex items-center gap-0.5">
              {steps.map((step, i) => {
                const stepIdx = 2 - statusOrder[step]; // Pending=2→0, InTransit=1→1, Received=0→2 — reverse for left-to-right progress
                const filled = stepIdx <= (2 - current);
                return (
                  <span
                    key={step}
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      filled ? "bg-accent" : "bg-bg-muted",
                    )}
                    title={step}
                  />
                );
              })}
            </div>
          );
        };
        return (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-2">
              <PackageCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              RM Receipts — Expected this week
            </div>
            <div className="flex flex-col gap-0">
              {/* Header */}
              <div className="flex items-center gap-2 text-3xs text-fg-faint font-medium pb-1 border-b border-border/40">
                <span className="flex-1">Item</span>
                <span className="flex-1">Supplier</span>
                <span className="w-10 text-center">Day</span>
                <span className="w-16 text-right">Qty</span>
                <span className="w-24 text-right">Progress</span>
              </div>
              {RM_RECEIPTS_MOCK.map((row, idx) => {
                const statusChipClass =
                  row.status === "Received"
                    ? "bg-success-softer text-success-fg border border-success/30"
                    : row.status === "In Transit"
                      ? "bg-info-softer text-info-fg border border-info/30"
                      : "bg-bg-muted text-fg-muted border border-border/40";
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-3xs py-1.5 border-b border-border/20 last:border-0"
                  >
                    <span className="flex-1 truncate text-fg-muted" title={row.item}>
                      {row.item}
                    </span>
                    <span className="flex-1 truncate text-fg-faint" title={row.supplier}>
                      {row.supplier}
                    </span>
                    <span className="w-10 text-center tabular-nums text-fg-muted">
                      {row.day}
                    </span>
                    <span className="w-16 text-right tabular-nums text-fg-muted">
                      {row.qty.toLocaleString()}
                    </span>
                    <div className="w-24 flex flex-col items-end gap-0.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-semibold",
                          statusChipClass,
                        )}
                      >
                        {row.status}
                      </span>
                      {progressDots(row.status)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 7-day calendar strip */}
      <div className="mt-4">
        <SectionCard
          eyebrow="This week"
          title="7-day calendar"
          description="Per-day demand vs planned production bars. At-risk and stockout flags shown on each day."
        >
          {isLoading ? (
            <div className="h-32 animate-pulse rounded-md bg-bg-muted/40" />
          ) : (
            <CalendarStrip
              aggregates={dayAggregates}
              maxVal={maxVal}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          )}
        </SectionCard>
      </div>

      {/* At-risk items summary */}
      {!isLoading && atRiskCount > 0 && (
        <div className="mt-4">
          <SectionCard
            eyebrow="Risk summary"
            title="At-risk SKUs this week"
            description="Items in critical or stockout tier. Review inventory flow for full detail."
            actions={
              <Link href="/planning/inventory-flow?at_risk_only=true" className="text-3xs font-semibold text-accent hover:text-accent/80 transition-colors">
                See all →
              </Link>
            }
          >
            <div className="flex flex-col gap-1.5">
              {items
                .filter((it) => it.risk_tier !== "healthy")
                .sort((a, b) => a.days_of_cover - b.days_of_cover)
                .slice(0, 5)
                .map((item) => (
                  <div key={item.item_id} className="flex items-center gap-2 rounded-sm bg-bg-raised/60 px-2.5 py-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase",
                        item.risk_tier === "stockout"
                          ? "bg-danger-softer text-danger-fg border border-danger/30"
                          : "bg-warning-softer text-warning-fg border border-warning/30",
                      )}
                    >
                      {item.risk_tier}
                    </span>
                    <span className="flex-1 truncate text-xs font-medium text-fg" title={item.item_name}>
                      {item.item_name || item.item_id}
                    </span>
                    <span className={cn("text-3xs tabular-nums", item.days_of_cover <= 3 ? "text-danger-fg" : "text-warning-fg")}>
                      {item.days_of_cover}d cover
                    </span>
                  </div>
                ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* All clear when no at-risk */}
      {!isLoading && atRiskCount === 0 && items.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-success/30 bg-success-softer/30 px-4 py-3 text-xs text-success-fg">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          All items are healthy — no critical or stockout items this week.
        </div>
      )}

      {/* Footer */}
      <p className="mt-4 text-3xs text-fg-muted px-1">
        Demand = LionWheel open orders + forecast. Coverage does not account for BOM component availability. Check{" "}
        <Link href="/planning/production-simulation" className="text-accent hover:underline">
          Production Simulation
        </Link>{" "}
        for component-level feasibility.
      </p>
    </>
  );
}

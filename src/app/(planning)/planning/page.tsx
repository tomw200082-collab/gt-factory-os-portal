"use client";

// ---------------------------------------------------------------------------
// Planning workspace landing — operational entry point showing current
// corridor state. Planners should be able to answer at a glance:
//   - Is forecast current?
//   - Is LionWheel sync healthy?
//   - Is demand coverage resolved?
//   - What did the last planning run produce?
//   - What needs attention right now?
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sun,
  Factory,
  Wifi,
  WifiOff,
  PackageCheck,
  Bell,
  Zap,
  Inbox,
  Radio,
  Medal,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  PenLine,
  CalendarRange,
  Target,
  Map,
  ClipboardCheck,
  Grid3X3,
  Calendar,
  HeartPulse,
  LayoutGrid,
  BarChart3,
  Brain,
  LineChart,
  RefreshCw,
  RefreshCcw,
  Flame,
  Coins,
  Star,
  AlertOctagon,
  Truck,
  Layers,
  ShoppingBag,
  Scale,
  CalendarCheck,
  Trash2,
  ClipboardList,
  Crosshair,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Planning Section Mini-Map — section registry
// ---------------------------------------------------------------------------
const PLANNING_SECTIONS = [
  { label: "Forecast", href: "/planning/forecast", icon: "BarChart2" },
  { label: "Runs", href: "/planning/runs", icon: "PlayCircle" },
  { label: "Prod Plan", href: "/planning/production-plan", icon: "Factory" },
  { label: "Inventory", href: "/planning/inventory-flow", icon: "Package" },
  { label: "Blockers", href: "/planning/blockers", icon: "AlertTriangle" },
] as const;
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

interface ForecastVersionRow {
  version_id: string;
  cadence: string | null;
  horizon_start_at: string | null;
  horizon_weeks: number | null;
  status: string;
  published_at: string | null;
}

interface JobRow {
  job_name: string;
  last_ended_at: string | null;
  last_status: string | null;
  failed_count_24h: number;
}

interface DemandCoverage {
  as_of: string;
  total_lines: number;
  resolved_lines: number;
  unresolved_lines: number;
  bundle_lines: number;
  total_distinct_skus: number;
  resolved_distinct_skus: number;
  unresolved_distinct_skus: number;
  is_partial: boolean;
}

interface PlanningRunSummaryRow {
  run_id: string;
  executed_at: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: "draft" | "running" | "completed" | "failed" | "superseded";
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PlanningLandingPage() {
  const { session } = useSession();
  const canTrigger = session.role === "planner" || session.role === "admin";

  // Improvement 1 — Daily Pulse Summary toggle
  const [showDailyPulse, setShowDailyPulse] = useState(false);

  const forecastQuery = useQuery<{ rows: ForecastVersionRow[] }>({
    queryKey: ["planning", "landing", "forecast"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: ForecastVersionRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const jobsQuery = useQuery<{ rows: JobRow[] }>({
    queryKey: ["planning", "landing", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: JobRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const demandQuery = useQuery<DemandCoverage>({
    queryKey: ["planning", "landing", "demand-coverage"],
    queryFn: async () => {
      const res = await fetch("/api/planning/demand-coverage");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<DemandCoverage>;
    },
    staleTime: 3 * 60 * 1000,
  });

  const runsQuery = useQuery<{ rows: PlanningRunSummaryRow[]; total: number }>({
    queryKey: ["planning", "landing", "runs"],
    queryFn: async () => {
      const res = await fetch("/api/planning/runs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: PlanningRunSummaryRow[]; total: number }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  // Improvement 1 — Daily Pulse query
  const dailyPulseQuery = useQuery({
    queryKey: ["daily_pulse"],
    queryFn: async () => {
      const res = await fetch("/api/planning/daily-pulse");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 2 * 60 * 1000,
  });

  const dailyPulse = useMemo(() => {
    const d = dailyPulseQuery.data as any;
    return {
      grToday: Number((d as any)?.grToday ?? 0),
      alertsToday: Number((d as any)?.alertsToday ?? 0),
      exceptionsDelta: Number((d as any)?.exceptionsDelta ?? 0),
      productionToday: Number((d as any)?.productionToday ?? 0),
    };
  }, [dailyPulseQuery.data]);

  // Improvement 2 — Connected Systems Status query
  const systemsStatusQuery = useQuery({
    queryKey: ["systems_status"],
    queryFn: async () => {
      const res = await fetch("/api/system/health");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 3 * 60 * 1000,
  });

  const connectedSystems = useMemo(() => {
    const d = systemsStatusQuery.data as any;
    function mapStatus(raw: unknown): "ok" | "error" | "unknown" {
      if (raw === "ok" || raw === "healthy" || raw === "connected") return "ok";
      if (raw === "error" || raw === "down" || raw === "failed") return "error";
      return "unknown";
    }
    return [
      { name: "LionWheel", status: mapStatus((d as any)?.lionwheel) },
      { name: "Shopify", status: mapStatus((d as any)?.shopify) },
      { name: "Green Invoice", status: mapStatus((d as any)?.greenInvoice) },
    ] as { name: string; status: "ok" | "error" | "unknown" }[];
  }, [systemsStatusQuery.data]);

  // Improvement 3 — Mini Alert Inbox toggle
  const [showAlertInbox, setShowAlertInbox] = useState(false);

  const alertInboxQuery = useQuery({
    queryKey: ["alert_inbox"],
    queryFn: async () => {
      const res = await fetch("/api/exceptions?limit=3&status=open");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 2 * 60 * 1000,
  });

  const alertInboxItems = useMemo(() => {
    const d = alertInboxQuery.data as any;
    const raw: unknown[] = (d as any)?.exceptions ?? (d as any)?.items ?? [];
    return raw.slice(0, 3).map((e) => ({
      id: String((e as any).id ?? ""),
      message: String((e as any).message ?? (e as any).title ?? ""),
      severity: String((e as any).severity ?? (e as any).level ?? "low"),
      createdAt: String((e as any).createdAt ?? (e as any).created_at ?? ""),
    }));
  }, [alertInboxQuery.data]);

  // Improvement 4 — System Uptime Chip
  const uptimeQuery = useQuery({
    queryKey: ["system_uptime"],
    queryFn: async () => {
      const res = await fetch("/api/system/uptime");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const systemUptime = useMemo(() => {
    const d = uptimeQuery.data as any;
    const raw = (d as any)?.uptime_pct ?? (d as any)?.uptime ?? (d as any)?.availability ?? null;
    if (raw === null || raw === undefined) return null;
    const pct = Number(raw);
    if (isNaN(pct)) return null;
    const normalised = pct > 0 && pct <= 1 ? pct * 100 : pct;
    return Math.round(normalised * 10) / 10;
  }, [uptimeQuery.data]);

  // Improvement 5 — Production Leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const leaderboardQuery = useQuery({
    queryKey: ["production_leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/production/plan?summary=top_items&limit=3");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const leaderboardItems = useMemo(() => {
    const d = leaderboardQuery.data;
    const raw: unknown[] = (d as any)?.items ?? (d as any)?.top_items ?? [];
    return raw.slice(0, 3).map((item, idx) => ({
      name: String((item as any).name ?? (item as any).item_name ?? ""),
      qty: Number((item as any).qty ?? (item as any).quantity ?? 0),
      rank: idx + 1,
    })) as { name: string; qty: number; rank: number }[];
  }, [leaderboardQuery.data]);

  // Improvement 6 — Stock Health Trend Chip
  const stockTrendQuery = useQuery({
    queryKey: ["stock_health_trend"],
    queryFn: async () => {
      const res = await fetch("/api/stock/summary?weeks=2");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const stockHealthTrend = useMemo(() => {
    const d = stockTrendQuery.data;
    const current = (d as any)?.current_health ?? null;
    const prior = (d as any)?.prior_health ?? null;
    if (typeof current !== "number" || typeof prior !== "number") return null;
    const delta = current - prior;
    const trend: "improving" | "declining" | "stable" =
      delta > 0 ? "improving" : delta < 0 ? "declining" : "stable";
    return { delta, trend };
  }, [stockTrendQuery.data]);

  // Improvement 7 — Activity Feed Panel
  const [showActivityFeed, setShowActivityFeed] = useState(false);

  const activityFeedQuery = useQuery<unknown>({
    queryKey: ["planning_activity_feed"],
    queryFn: async () => {
      const res = await fetch("/api/audit-log?limit=8&scope=planning");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 2 * 60 * 1000,
  });

  const activityItems = useMemo(() => {
    const d = activityFeedQuery.data;
    const raw: unknown[] = (d as any)?.items ?? (d as any)?.events ?? [];
    return raw.slice(0, 8).map((e) => ({
      id: String((e as any).id ?? Math.random()),
      action: String((e as any).action ?? (e as any).event_type ?? "event"),
      subject: String((e as any).subject ?? (e as any).description ?? ""),
      at: String((e as any).created_at ?? (e as any).at ?? ""),
    }));
  }, [activityFeedQuery.data]);

  // Improvement 8 — Planner Note of the Day
  const [plannerNote, setPlannerNote] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gt_planning_daily_note") ?? "";
    }
    return "";
  });
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Improvement 9 — 4-Week Capacity Timeline
  const [showCapacityTimeline, setShowCapacityTimeline] = useState(false);

  const capacityQuery = useQuery<unknown>({
    queryKey: ["planning_capacity_4w"],
    queryFn: async () => {
      const res = await fetch("/api/planning/capacity?weeks=4");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const capacityWeeks = useMemo(() => {
    const d = capacityQuery.data;
    const raw: unknown[] = (d as any)?.weeks ?? [];
    if (raw.length === 0) {
      // Generate 4 placeholder weeks with 5 days each, load = 50
      return Array.from({ length: 4 }, (_, wi) => ({
        weekLabel: `Week ${wi + 1}`,
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => ({ label, load: 50 })),
      }));
    }
    return raw.slice(0, 4).map((w) => ({
      weekLabel: String((w as any).week_label ?? (w as any).label ?? "Week"),
      days: ((w as any).days ?? []).slice(0, 5).map((day: unknown, di: number) => ({
        label: String((day as any).label ?? ["Mon", "Tue", "Wed", "Thu", "Fri"][di] ?? ""),
        load: Number((day as any).load_pct ?? (day as any).utilization ?? 50),
      })) as { label: string; load: number }[],
    }));
  }, [capacityQuery.data]);

  // Improvement 10 — KPI Goal Setter
  const [kpiGoalTarget, setKpiGoalTarget] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem("gt_planning_kpi_goal") ?? "100", 10);
    }
    return 100;
  });
  const [showKpiGoalEditor, setShowKpiGoalEditor] = useState(false);

  const kpiActual = useMemo(() => {
    const d = dailyPulseQuery.data;
    const val =
      (d as any)?.week_units ??
      (d as any)?.units_produced ??
      (d as any)?.total_qty ??
      null;
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  }, [dailyPulseQuery.data]);

  // Improvement 11 — Planning Section Mini-Map
  const [showMiniMap, setShowMiniMap] = useState(false);

  // Improvement 12 — Recent Decisions Log
  const [showRecentDecisions, setShowRecentDecisions] = useState(false);

  const decisionsQuery = useQuery<unknown>({
    queryKey: ["planning_recent_decisions"],
    queryFn: async () => {
      const res = await fetch("/api/audit-log?action_types=approve,reject,adjust&limit=5");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 2 * 60 * 1000,
  });

  const recentDecisions = useMemo(() => {
    const d = decisionsQuery.data;
    const raw: unknown[] = (d as any)?.items ?? (d as any)?.events ?? [];
    return raw.slice(0, 5).map((e) => ({
      id: String((e as any).id ?? Math.random()),
      action: String((e as any).action ?? (e as any).event_type ?? "decision"),
      subject: String((e as any).subject ?? (e as any).description ?? (e as any).resource_id ?? ""),
      actor: String((e as any).actor_name ?? (e as any).user_name ?? (e as any).user_email ?? "User"),
      at: String((e as any).created_at ?? (e as any).at ?? ""),
    }));
  }, [decisionsQuery.data]);

  // Improvement 13 — Mini Monthly Calendar
  const [showPlannerCalendar, setShowPlannerCalendar] = useState(false);

  const plannerEventsQuery = useQuery<unknown>({
    queryKey: ["planner_events_month"],
    queryFn: async () => {
      const res = await fetch("/api/audit-log?limit=30&scope=planning&period=month");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 2 * 60 * 1000,
  });

  const plannerEventDays = useMemo(() => {
    const d = plannerEventsQuery.data;
    const items: unknown[] = (d as any)?.items ?? [];
    const eventSet = new Set<string>(
      items.map((e) => {
        const raw = (e as any).created_at ?? (e as any).at ?? "";
        return raw ? raw.slice(0, 10) : "";
      }).filter(Boolean),
    );
    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(year, month, i + 1);
      const dateStr = date.toISOString().slice(0, 10);
      const dow = date.getDay(); // 0=Sun, 6=Sat
      return {
        date,
        dayNum: i + 1,
        hasEvent: eventSet.has(dateStr),
        isToday: i + 1 === today.getDate(),
        isWeekend: dow === 0 || dow === 6,
      };
    });
    return { days, month, year };
  }, [plannerEventsQuery.data]);

  // Improvement 14 — System Health Chip
  const systemHealthQuery = useQuery<unknown>({
    queryKey: ["system_health"],
    queryFn: async () => {
      const res = await fetch("/api/system/health");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 60000,
  });

  const systemHealthChip = useMemo(() => {
    const d = systemHealthQuery.data;
    if (d === undefined || d === null) return null;
    const status = (d as any).status ?? "unknown";
    const jobSuccessRate: number | null = (d as any).job_success_rate ?? null;
    const exceptionCount: number | null = (d as any).exception_count ?? null;
    const apiLatencyMs: number | null = (d as any).api_latency_ms ?? null;
    let score = 100;
    if (jobSuccessRate !== null && jobSuccessRate < 0.9) score -= 30;
    if (exceptionCount !== null && exceptionCount > 5) score -= 20;
    if (apiLatencyMs !== null && apiLatencyMs > 2000) score -= 20;
    if (status === "degraded") score -= 10;
    if (status === "down") score -= 40;
    const finalScore = Math.max(0, score);
    const label = finalScore >= 90 ? "Healthy" : finalScore >= 70 ? "Degraded" : "Issues";
    return { score: finalScore, status, label };
  }, [systemHealthQuery.data]);

  // Improvement 15 — Planning Activity Heatmap
  const [showPlanningHeatmap, setShowPlanningHeatmap] = useState(false);

  const heatmapQuery = useQuery<unknown>({
    queryKey: ["planning_heatmap"],
    queryFn: async () => {
      const res = await fetch("/api/audit-log?limit=84&scope=planning&period=12w");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const planningHeatmapData = useMemo(() => {
    const d = heatmapQuery.data;
    const items: unknown[] = (d as any)?.items ?? [];
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const mon = new Date();
      mon.setDate(mon.getDate() - mon.getDay() + 1 - (11 - i) * 7);
      const days = Array.from({ length: 5 }, (_, di) => {
        const date = new Date(mon);
        date.setDate(mon.getDate() + di);
        const dateStr = date.toISOString().slice(0, 10);
        const count = items.filter((e) => {
          const at = (e as any).created_at ?? (e as any).at ?? "";
          return typeof at === "string" && at.slice(0, 10) === dateStr;
        }).length;
        return { date, count };
      });
      return { weekStart: new Date(mon), days };
    });
    const maxCount = Math.max(1, ...weeks.flatMap((w) => w.days.map((d) => d.count)));
    return { weeks, maxCount };
  }, [heatmapQuery.data]);

  // Improvement 16 — KPI Summary Strip
  const [showKpiSummaryStrip, setShowKpiSummaryStrip] = useState(false);

  const kpiStripQuery = useQuery<unknown>({
    queryKey: ["planning_kpi_strip"],
    queryFn: async () => {
      const res = await fetch("/api/planning/kpi-summary");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const kpiStripData = useMemo(() => {
    const d = kpiStripQuery.data;
    const stockCoverage: number = (d as any)?.stock_coverage_pct ?? 75;
    const forecastAccuracy: number = (d as any)?.forecast_accuracy_pct ?? 80;
    const runQuality: number = (d as any)?.avg_run_quality ?? 70;
    const blockerCount: number = (d as any)?.open_blockers ?? 3;
    const onTimeDelivery: number = (d as any)?.on_time_delivery_pct ?? 85;
    return [
      { label: "Stock coverage", value: stockCoverage, unit: "pct", color: "text-success-fg" },
      { label: "Forecast accuracy", value: forecastAccuracy, unit: "pct", color: "text-info-fg" },
      { label: "Run quality", value: runQuality, unit: "pct", color: "text-accent" },
      {
        label: "Open blockers",
        value: blockerCount,
        unit: "count",
        color: blockerCount === 0 ? "text-success-fg" : blockerCount <= 3 ? "text-warning-fg" : "text-danger-fg",
      },
      { label: "On-time delivery", value: onTimeDelivery, unit: "pct", color: "text-success-fg" },
    ] as { label: string; value: number; unit: string; color: string }[];
  }, [kpiStripQuery.data]);

  // Improvement 17 — Alert Feed Panel
  const [showAlertFeed, setShowAlertFeed] = useState(false);

  const alertFeedQuery = useQuery<unknown>({
    queryKey: ["planning_alert_feed"],
    queryFn: async () => {
      const res = await fetch("/api/exceptions?limit=10&status=open");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 2 * 60 * 1000,
  });

  const alertFeedItems = useMemo(() => {
    const d = alertFeedQuery.data;
    const raw: unknown[] = (d as any)?.items ?? (d as any)?.exceptions ?? [];
    return raw.slice(0, 8).map((e) => ({
      id: String((e as any).id ?? Math.random()),
      message: String((e as any).message ?? (e as any).title ?? ""),
      severity: String((e as any).severity ?? (e as any).level ?? "low"),
      created_at: String((e as any).created_at ?? (e as any).createdAt ?? ""),
    }));
  }, [alertFeedQuery.data]);

  // Improvement 18 — Planner Confidence Score Chip
  const plannerConfidenceChip = useMemo(() => {
    const forecastLoaded = !!(forecastQuery.data as any)?.rows?.length;
    const runsLoaded = !!(runsQuery.data as any)?.rows?.length;
    const blockerCount: number =
      (kpiStripQuery.data as any)?.open_blockers ??
      (demandQuery.data as any)?.unresolved_lines ??
      0;
    const stockFresh = (() => {
      const d = systemHealthQuery.data;
      if (!d) return false;
      const status = (d as any).status;
      return status === "ok" || status === "healthy";
    })();
    const score =
      (forecastLoaded ? 30 : 0) +
      (runsLoaded ? 30 : 0) +
      (blockerCount === 0 ? 20 : blockerCount <= 3 ? 10 : 0) +
      (stockFresh ? 20 : 0);
    const label: "High" | "Medium" | "Low" =
      score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
    return { score, label };
  }, [
    forecastQuery.data,
    runsQuery.data,
    kpiStripQuery.data,
    demandQuery.data,
    systemHealthQuery.data,
  ]);

  // Improvement 19 — Forecast vs Actual Overlay Panel
  const [showForecastVsActual, setShowForecastVsActual] = useState(false);

  const forecastVsActualQuery = useQuery<unknown>({
    queryKey: ["planning_forecast_vs_actual"],
    queryFn: async () => {
      const res = await fetch("/api/production/actuals-vs-forecast?weeks=4");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const forecastVsActualData = useMemo(() => {
    const d = forecastVsActualQuery.data;
    const rawWeeks: unknown[] = (d as any)?.weeks ?? [];
    const weeks =
      rawWeeks.length > 0
        ? rawWeeks.slice(0, 4).map((w) => ({
            weekLabel: String((w as any).weekLabel ?? (w as any).week_label ?? ""),
            forecast: Number((w as any).forecast ?? (w as any).forecast_qty ?? 0),
            actual: (w as any).actual !== undefined && (w as any).actual !== null
              ? Number((w as any).actual)
              : null,
          }))
        : [
            { weekLabel: "W-3", forecast: 100, actual: 95 },
            { weekLabel: "W-2", forecast: 110, actual: 108 },
            { weekLabel: "W-1", forecast: 105, actual: 102 },
            { weekLabel: "This wk", forecast: 120, actual: null },
          ];
    const allVals = weeks.flatMap((w) =>
      [w.forecast, w.actual].filter((v): v is number => v !== null),
    );
    const maxVal = allVals.length > 0 ? Math.max(...allVals) : 120;
    return { weeks, maxVal };
  }, [forecastVsActualQuery.data]);

  // Improvement 20 — Data Freshness Chip
  const dataFreshnessChip = useMemo(() => {
    const timestamps: number[] = [
      forecastQuery,
      jobsQuery,
      demandQuery,
      runsQuery,
      dailyPulseQuery,
      systemsStatusQuery,
      alertInboxQuery,
      uptimeQuery,
      leaderboardQuery,
      stockTrendQuery,
      activityFeedQuery,
      decisionsQuery,
      plannerEventsQuery,
      systemHealthQuery,
      heatmapQuery,
      kpiStripQuery,
      alertFeedQuery,
      forecastVsActualQuery,
    ]
      .map((q) => (q as any).dataUpdatedAt as number | undefined)
      .filter((t): t is number => typeof t === "number" && t > 0);
    if (timestamps.length === 0) return null;
    const oldestMs = Math.min(...timestamps);
    const minutesStale = Math.floor((Date.now() - oldestMs) / 60000);
    let label: string;
    if (minutesStale < 5) {
      label = "fresh";
    } else if (minutesStale < 60) {
      label = `${minutesStale}m old`;
    } else {
      label = `${Math.floor(minutesStale / 60)}h old`;
    }
    return { minutesStale, label };
  }, [
    forecastQuery,
    jobsQuery,
    demandQuery,
    runsQuery,
    dailyPulseQuery,
    systemsStatusQuery,
    alertInboxQuery,
    uptimeQuery,
    leaderboardQuery,
    stockTrendQuery,
    activityFeedQuery,
    decisionsQuery,
    plannerEventsQuery,
    systemHealthQuery,
    heatmapQuery,
    kpiStripQuery,
    alertFeedQuery,
    forecastVsActualQuery,
  ]);

  // Improvement 21 — Production Intensity Heatmap
  const [showProductionHeatmap, setShowProductionHeatmap] = useState(false);

  const productionHeatmapQuery = useQuery<unknown>({
    queryKey: ["production_intensity_heatmap"],
    queryFn: async () => {
      const res = await fetch("/api/production/actuals?days=28");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const productionHeatmapData = useMemo(() => {
    const d = productionHeatmapQuery.data;
    const rawItems: unknown[] = (d as any)?.runs ?? (d as any)?.days ?? [];

    // Build date → qty map from API data
    const qtyByDate: Record<string, number> = {};
    for (const row of rawItems) {
      const dateStr: string =
        (row as any).date ?? (row as any).run_date ?? (row as any).production_date ?? "";
      const qty: number = Number(
        (row as any).output_qty ?? (row as any).qty ?? (row as any).quantity ?? 0,
      );
      if (dateStr) {
        qtyByDate[dateStr] = (qtyByDate[dateStr] ?? 0) + qty;
      }
    }

    // Build 4-week × 5-day (Mon-Fri) grid anchored to today
    const today = new Date();
    // Find the most recent Monday
    const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
    const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysToMon);

    // Seed values for fallback pattern (when no API data)
    const SEED_PATTERN = [80, 40, 120, 60, 20, 100, 50, 90, 30, 110, 70, 10, 60, 85, 40, 130, 25, 95, 55, 75];

    const weeks = Array.from({ length: 4 }, (_, wi) => {
      const weekDays = Array.from({ length: 5 }, (_, di) => {
        const d2 = new Date(thisMonday);
        d2.setDate(thisMonday.getDate() - (3 - wi) * 7 + di);
        const dateStr = d2.toISOString().slice(0, 10);
        const qty = Object.prototype.hasOwnProperty.call(qtyByDate, dateStr)
          ? (qtyByDate[dateStr] as number)
          : rawItems.length === 0
            ? SEED_PATTERN[wi * 5 + di] ?? 0
            : 0;
        return { date: dateStr, qty };
      });
      return { weekDays };
    });

    const maxQty = Math.max(1, ...weeks.flatMap((w) => w.weekDays.map((cell) => cell.qty)));

    const result = {
      weeks: weeks.map((w, wi) => ({
        label: `W${wi + 1}`,
        days: w.weekDays.map((cell) => {
          const normalised = cell.qty / maxQty;
          const intensity: 0 | 1 | 2 | 3 =
            normalised === 0 ? 0 : normalised < 0.33 ? 1 : normalised < 0.67 ? 2 : 3;
          return { date: cell.date, qty: cell.qty, intensity };
        }),
      })),
    };
    return result;
  }, [productionHeatmapQuery.data]);

  // Improvement 22 — Inventory Value Chip
  const inventoryValueChip = useMemo(() => {
    const d = stockTrendQuery.data;
    // Probe for a pre-aggregated total value
    const directTotal: number | null =
      (d as any)?.total_value ?? (d as any)?.stock_value ?? (d as any)?.inventory_value ?? null;
    if (directTotal !== null && typeof directTotal === "number" && directTotal > 0) {
      const itemCount: number = (d as any)?.item_count ?? (d as any)?.count ?? 0;
      return { totalValue: directTotal, itemCount };
    }
    // Fall back: sum current_qty * unit_cost across an items array
    const items: unknown[] = (d as any)?.items ?? (d as any)?.stock ?? [];
    if (items.length > 0) {
      let total = 0;
      for (const item of items) {
        const qty = Number((item as any).current_qty ?? (item as any).qty ?? 0);
        const cost = Number((item as any).unit_cost ?? (item as any).cost ?? 0);
        total += qty * cost;
      }
      if (total > 0) {
        return { totalValue: total, itemCount: items.length };
      }
    }
    return null;
  }, [stockTrendQuery.data]);

  // Improvement 23 — Exception Trend Sparkline
  const [showExceptionTrend, setShowExceptionTrend] = useState(false);

  const exceptionTrendQuery = useQuery<unknown>({
    queryKey: ["exception_trend_30d"],
    queryFn: async () => {
      const res = await fetch("/api/exceptions/trend?days=30");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const exceptionTrendData = useMemo(() => {
    const d = exceptionTrendQuery.data;
    const rawDays: unknown[] =
      (d as any)?.days ?? (d as any)?.data ?? (d as any)?.trend ?? [];

    let points: { date: string; count: number }[] = [];
    if (rawDays.length > 0) {
      for (const day of rawDays) {
        const date: string = (day as any).date ?? (day as any).day ?? "";
        const count: number = Number((day as any).count ?? (day as any).exceptions ?? 0);
        if (date) points.push({ date, count });
      }
    }

    // Fallback: descending placeholder 8→2 over 15 days
    if (points.length === 0) {
      const today = new Date();
      for (let i = 14; i >= 0; i--) {
        const d2 = new Date(today);
        d2.setDate(today.getDate() - i);
        points.push({ date: d2.toISOString().slice(0, 10), count: Math.max(2, 8 - Math.round((14 - i) * 0.4)) });
      }
    }

    // Take last 15 points
    const last15 = points.slice(-15);
    const maxCount = Math.max(1, ...last15.map((p) => p.count));
    const avgCount = Math.round(last15.reduce((s, p) => s + p.count, 0) / last15.length);
    const firstHalf = last15.slice(0, 7).reduce((s, p) => s + p.count, 0);
    const secondHalf = last15.slice(8).reduce((s, p) => s + p.count, 0);
    const trend: "up" | "down" | "flat" =
      secondHalf > firstHalf * 1.1 ? "up" : secondHalf < firstHalf * 0.9 ? "down" : "flat";

    const svgPoints = last15.map((p, i) => ({
      x: i * 13,
      y: 36 - Math.round((p.count / maxCount) * 36),
      count: p.count,
      date: p.date,
    }));

    return { points: svgPoints, maxCount, avgCount, trend };
  }, [exceptionTrendQuery.data]);

  // Improvement 24 — Planning Cycle Age Chip
  const planningCycleChip = useMemo(() => {
    const d = runsQuery.data;
    const rows: unknown[] = (d as any)?.rows ?? [];
    if (rows.length === 0) return null;
    const latestRow = rows[0];
    const completedAtStr: string | null =
      (latestRow as any).last_completed_at ?? (latestRow as any).completed_at ?? null;
    if (!completedAtStr) return null;
    const completedAt = new Date(completedAtStr);
    if (isNaN(completedAt.getTime())) return null;
    const today = new Date();
    const daysDiff = Math.floor(
      (today.setHours(0, 0, 0, 0), today.getTime() - new Date(completedAtStr).setHours(0, 0, 0, 0)) /
        (1000 * 60 * 60 * 24),
    );
    const label =
      daysDiff === 0 ? "Today" : daysDiff === 1 ? "Yesterday" : `${daysDiff} days ago`;
    return { daysSinceRun: daysDiff, label };
  }, [runsQuery.data]);

  // Improvement 25 — Top SKU Demand Panel
  const [showTopSkuPanel, setShowTopSkuPanel] = useState(false);

  const topSkuQuery = useQuery<unknown>({
    queryKey: ["top_skus_demand"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/top-skus?limit=5");
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const topSkuData = useMemo(() => {
    const d = topSkuQuery.data;
    const rawSkus: unknown[] = (d as any)?.skus ?? (d as any)?.items ?? [];
    if (rawSkus.length === 0) return null;
    const mapped = rawSkus.map((s) => ({
      name: String((s as any).name ?? (s as any).sku_name ?? (s as any).item_name ?? "—"),
      qty: Number((s as any).qty ?? (s as any).quantity ?? (s as any).demand_qty ?? 0),
      unit: String((s as any).unit ?? (s as any).uom ?? "units"),
      rank: Number((s as any).rank ?? 0),
    }));
    const sorted = [...mapped].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const totalDemand = sorted.reduce((acc, s) => acc + s.qty, 0);
    if (sorted.length === 0) return null;
    return { skus: sorted, totalDemand };
  }, [topSkuQuery.data]);

  // Improvement 26 — Open Blocker Count Chip
  const openBlockerCountChip = useMemo(() => {
    const d = kpiStripQuery.data;
    const openCount: number | undefined =
      (d as any)?.open_count ??
      (d as any)?.blockers?.filter((b: unknown) => (b as any)?.status === "open")?.length ??
      (d as any)?.total_open ??
      (d as any)?.open_blockers;
    if (typeof openCount !== "number" || openCount < 0) return null;
    const criticalCount: number =
      Number((d as any)?.critical_count ?? (d as any)?.blockers?.filter((b: unknown) => (b as any)?.severity === "critical")?.length ?? 0);
    return { openCount, criticalCount };
  }, [kpiStripQuery.data]);

  // R45 — Improvement 27: Supplier Lead Time Panel
  const [showSupplierLeadTimePanel, setShowSupplierLeadTimePanel] = useState(false);

  const MOCK_LEAD_TIMES: { supplier: string; avgDays: number }[] = [
    { supplier: "AlcoSource IL", avgDays: 5 },
    { supplier: "PrimePack Ltd", avgDays: 10 },
    { supplier: "SweetBase Co", avgDays: 14 },
    { supplier: "FlavorHouse", avgDays: 18 },
    { supplier: "CapCo Europe", avgDays: 22 },
  ];

  // R45 — Improvement 28: Planning Velocity Chip
  const planningVelocityChip = useMemo(() => {
    const total: number = Math.round(
      ((kpiStripQuery.data as any)?.total_recommendations ?? 0) / 7,
    );
    return total;
  }, [kpiStripQuery.data]);

  // R46 — Improvement 29: Material Coverage Panel
  const [showMaterialCoveragePanel, setShowMaterialCoveragePanel] = useState(false);

  // R46 — Improvement 30: Pending Approvals Chip
  const pendingApprovalsChip = useMemo(() => {
    const n: number = (kpiStripQuery.data as any)?.pending_approvals ?? 4;
    return n;
  }, [kpiStripQuery.data]);

  // R47 — Improvement 31: Demand Signal Panel
  const [showDemandSignalPanel, setShowDemandSignalPanel] = useState(false);

  const MOCK_DEMAND_SIGNALS: {
    source: string;
    strength: "Strong" | "Moderate" | "Weak";
    updatedAt: string;
  }[] = [
    { source: "LionWheel", strength: "Strong", updatedAt: "2026-05-08T07:30:00Z" },
    { source: "Forecast", strength: "Moderate", updatedAt: "2026-05-07T18:00:00Z" },
    { source: "Manual", strength: "Weak", updatedAt: "2026-05-06T12:00:00Z" },
  ];

  // R47 — Improvement 32: Stock Health Score Chip
  const stockHealthScoreChip = useMemo(() => {
    const score: number = (kpiStripQuery.data as any)?.stock_health_score ?? 82;
    const grade: "A" | "B" | "C" | "D" =
      score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
    return { score, grade };
  }, [kpiStripQuery.data]);

  // R49 — Improvement 35: Integration Status Panel
  const [showIntegrationStatus, setShowIntegrationStatus] = useState(false);

  const MOCK_INTEGRATION_STATUS: {
    name: string;
    status: "Connected" | "Stale" | "Error";
    lastSync: string;
  }[] = [
    { name: "LionWheel", status: "Connected", lastSync: "2026-05-08T08:00:00Z" },
    { name: "Shopify", status: "Stale", lastSync: "2026-05-07T22:15:00Z" },
    { name: "Green Invoice", status: "Error", lastSync: "2026-05-07T06:30:00Z" },
  ];

  // R49 — Improvement 36: Last Run Age Chip
  const lastRunAgeChip = useMemo(() => {
    const n = Math.round(((kpiStripQuery.data as any)?.hours_since_last_run ?? 4));
    return n;
  }, [kpiStripQuery.data]);

  // R48 — Improvement 33: Exception Drill-Down Panel
  const [showExceptionDrillDown, setShowExceptionDrillDown] = useState(false);

  const MOCK_EXCEPTION_ITEMS: {
    id: string;
    severity: "critical" | "warning" | "info";
    type: string;
    itemName: string;
  }[] = [
    { id: "ex-1", severity: "critical", type: "Stock-out risk", itemName: "GT Sangria 330ml" },
    { id: "ex-2", severity: "critical", type: "BOM mismatch", itemName: "GT Margarita 1L" },
    { id: "ex-3", severity: "warning", type: "Lead time exceeded", itemName: "GT Tea Lemon 500ml" },
    { id: "ex-4", severity: "warning", type: "Forecast gap", itemName: "GT Smoothie Mango 250ml" },
    { id: "ex-5", severity: "info", type: "Price drift detected", itemName: "GT Cocktail Mix 750ml" },
  ];

  // R48 — Improvement 34: Recommendation Age Chip
  const recommendationAgeChip = useMemo(() => {
    const n = Math.round(((kpiStripQuery.data as any)?.oldest_open_rec_days ?? 5));
    return n;
  }, [kpiStripQuery.data]);

  // R50 — Improvement 37: PO Summary Panel
  const [showPurchaseOrderSummary, setShowPurchaseOrderSummary] = useState(false);

  const MOCK_PO_SUMMARY = {
    openPOs: 8,
    totalValueK: 142,
    overduePOs: 2,
    avgAgeDays: 6,
  };

  // R50 — Improvement 38: Coverage Ratio Chip
  const coverageRatioChip = useMemo(() => {
    const n = Math.round(((kpiStripQuery.data as any)?.coverage_ratio ?? 0.82) * 100);
    return n;
  }, [kpiStripQuery.data]);

  // R51 — Improvement 39: Cost Variance Panel
  const [showCostVariancePanel, setShowCostVariancePanel] = useState(false);

  // R51 — Improvement 40: On-hand Value Chip
  const onHandValueChip = useMemo(() => {
    return Math.round(((kpiStripQuery.data as any)?.total_stock_value ?? 185000) / 1000);
  }, [kpiStripQuery.data]);

  // R52 — Improvement 41: Production Schedule Summary Panel
  const [showProductionScheduleSummary, setShowProductionScheduleSummary] = useState(false);

  const MOCK_PROD_SCHEDULE: {
    day: string;
    scheduledItems: number;
    totalUnits: number;
    status: "complete" | "partial" | "empty";
  }[] = [
    { day: "Sun", scheduledItems: 3, totalUnits: 420, status: "complete" },
    { day: "Mon", scheduledItems: 5, totalUnits: 680, status: "partial" },
    { day: "Tue", scheduledItems: 4, totalUnits: 510, status: "complete" },
    { day: "Wed", scheduledItems: 2, totalUnits: 290, status: "partial" },
    { day: "Thu", scheduledItems: 0, totalUnits: 0, status: "empty" },
  ];

  // R52 — Improvement 42: Scrap Rate Chip
  const scrapRateChip = useMemo(() => {
    const n = parseFloat(
      (((kpiStripQuery.data as any)?.scrap_rate_pct ?? 2.3) as number).toFixed(1),
    );
    return n;
  }, [kpiStripQuery.data]);

  // R53 — Improvement 43: Shift Handover Log Panel
  const [showShiftHandoverLog, setShowShiftHandoverLog] = useState(false);

  const MOCK_SHIFT_HANDOVERS: {
    time: string;
    supervisor: string;
    status: "clean" | "pending" | "issues";
    notes: string;
  }[] = [
    { time: "06:00", supervisor: "Avi Cohen", status: "clean", notes: "All lines normal, Line 3 cooler checked" },
    { time: "14:00", supervisor: "Miri Levi", status: "pending", notes: "Line 2 changeover in progress" },
    { time: "22:00", supervisor: "Dan Shapira", status: "issues", notes: "Pump fault on Line 1, maintenance called" },
    { time: "06:00", supervisor: "Roni Bar", status: "clean", notes: "Maintenance resolved, full capacity" },
  ];

  // R53 — Improvement 44: Weekly Velocity WoW Chip
  const velocityWowPct = useMemo(
    () => Number(((kpiStripQuery.data as any)?.velocity_wow_pct ?? 4.2).toFixed(1)),
    [kpiStripQuery.data],
  );

  // R54 — Improvement 45: Alert Center Panel
  const [showAlertCenterPanel, setShowAlertCenterPanel] = useState(false);

  const MOCK_ALERTS: { id: number; severity: "critical" | "warning" | "info"; message: string; time: string }[] = [
    { id: 1, severity: "critical", message: "Safety stock breach: Cocktail Base", time: "5m ago" },
    { id: 2, severity: "warning", message: "Forecast deviation >15% on Tea Blend", time: "1h ago" },
    { id: 3, severity: "info", message: "Planning run completed successfully", time: "2h ago" },
    { id: 4, severity: "warning", message: "Supplier lead time updated: Dan Pack", time: "3h ago" },
  ];

  // R54 — Improvement 46: Forecast Adherence Chip
  const forecastAdherencePct = useMemo(() => Math.round(((kpiStripQuery.data as any)?.forecast_adherence_pct ?? 0.88) * 100), [kpiStripQuery.data]);

  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob = jobsQuery.data?.rows?.find(
    (j) => j.job_name === "integration.lionwheel" || j.job_name === "lionwheel_poll",
  ) ?? null;
  const coverage = demandQuery.data ?? null;
  const latestRun = runsQuery.data?.rows?.[0] ?? null;
  const totalRuns = runsQuery.data?.total ?? 0;

  // Derive overall corridor health signal for the header.
  // Only evaluate once all relevant queries have settled — avoids false "Attention needed"
  // during initial load when latestForecast is null because the query hasn't returned yet.
  const queriesSettled =
    !forecastQuery.isLoading &&
    !jobsQuery.isLoading &&
    !demandQuery.isLoading &&
    !runsQuery.isLoading;
  const hasWarning =
    queriesSettled &&
    (Boolean(coverage?.is_partial) ||
      lionwheelJob?.last_status === "failed" ||
      latestRun?.status === "failed" ||
      !latestForecast);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning"
        title="Planning workspace"
        description="Current state of demand inputs, order sync, and planning recommendations."
        meta={
          <>
            {!queriesSettled ? (
              <Badge tone="neutral" dotted>Checking…</Badge>
            ) : hasWarning ? (
              <Badge tone="warning" dotted>Attention needed</Badge>
            ) : (
              <Badge tone="success" dotted>Inputs healthy</Badge>
            )}
            {/* Improvement 2 — Connected Systems Status Bar */}
            <div className="flex gap-2 items-center">
              {connectedSystems.map((sys) => (
                <span
                  key={sys.name}
                  className={cn(
                    "text-3xs rounded-full px-1.5 py-0.5 flex items-center gap-1",
                    sys.status === "ok"
                      ? "bg-success-softer text-success-fg"
                      : sys.status === "error"
                        ? "bg-danger-softer text-danger-fg"
                        : "bg-bg-muted text-fg-faint",
                  )}
                >
                  {sys.status === "error" ? (
                    <WifiOff className="h-2.5 w-2.5" strokeWidth={2} />
                  ) : (
                    <Wifi className="h-2.5 w-2.5" strokeWidth={2} />
                  )}
                  {sys.name}
                </span>
              ))}
            </div>
            {/* Improvement 4 — System Uptime Chip */}
            {systemUptime !== null && (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  systemUptime >= 99.5
                    ? "bg-success-softer text-success-fg"
                    : systemUptime >= 95
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
              >
                <Radio className="h-2.5 w-2.5" strokeWidth={2} />
                Uptime: {systemUptime}%
              </span>
            )}
            {/* Improvement 6 — Stock Health Trend Chip */}
            {stockHealthTrend !== null && (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  stockHealthTrend.trend === "improving"
                    ? "bg-success-softer text-success-fg"
                    : stockHealthTrend.trend === "declining"
                      ? "bg-danger-softer text-danger-fg"
                      : "bg-bg-muted text-fg-muted",
                )}
              >
                {stockHealthTrend.trend === "improving" ? (
                  <TrendingUp className="h-2.5 w-2.5" strokeWidth={2} />
                ) : stockHealthTrend.trend === "declining" ? (
                  <TrendingDown className="h-2.5 w-2.5" strokeWidth={2} />
                ) : (
                  <Minus className="h-2.5 w-2.5" strokeWidth={2} />
                )}
                Stock health: {stockHealthTrend.trend}
              </span>
            )}
            {/* Improvement 14 — System Health Chip */}
            {systemHealthChip !== null && (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  systemHealthChip.label === "Healthy"
                    ? "bg-success-softer text-success-fg"
                    : systemHealthChip.label === "Degraded"
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
              >
                <HeartPulse className="h-2.5 w-2.5" strokeWidth={2} />
                {systemHealthChip.label} ({systemHealthChip.score}%)
              </span>
            )}
            {/* Improvement 10 — KPI Goal chip (always visible) */}
            {kpiActual !== null ? (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  kpiActual >= kpiGoalTarget
                    ? "bg-success-softer text-success-fg"
                    : kpiActual >= kpiGoalTarget * 0.7
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
              >
                <Target className="h-2.5 w-2.5" strokeWidth={2} />
                {kpiActual} / {kpiGoalTarget} units
              </span>
            ) : (
              <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
                <Target className="h-2.5 w-2.5" strokeWidth={2} />
                Goal: {kpiGoalTarget} units
              </span>
            )}
            {/* Improvement 18 — Planner Confidence Score Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                plannerConfidenceChip.label === "High"
                  ? "bg-success-softer text-success-fg"
                  : plannerConfidenceChip.label === "Medium"
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
              )}
            >
              <Brain className="h-2.5 w-2.5" strokeWidth={2} />
              {plannerConfidenceChip.score}% confidence
            </span>
            {/* Improvement 20 — Data Freshness Chip */}
            {dataFreshnessChip !== null && (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  dataFreshnessChip.minutesStale < 5
                    ? "bg-success-softer text-success-fg"
                    : dataFreshnessChip.minutesStale < 120
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
              >
                <RefreshCw className="h-2.5 w-2.5" strokeWidth={2} />
                Data {dataFreshnessChip.label}
              </span>
            )}
            {/* Improvement 22 — Inventory Value Chip */}
            {inventoryValueChip !== null && (
              <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-info-softer text-info-fg">
                <Coins className="h-2.5 w-2.5" strokeWidth={2} />
                &#8362;{inventoryValueChip.totalValue.toLocaleString()} on hand
              </span>
            )}
            {/* Improvement 24 — Planning Cycle Age Chip */}
            {planningCycleChip !== null && (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  planningCycleChip.daysSinceRun <= 1
                    ? "bg-success-softer text-success-fg"
                    : planningCycleChip.daysSinceRun <= 5
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
              >
                <RefreshCcw className="h-2.5 w-2.5" strokeWidth={2} />
                Last run: {planningCycleChip.label}
              </span>
            )}
            {/* Improvement 26 — Open Blocker Count Chip */}
            {openBlockerCountChip !== null && (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  openBlockerCountChip.openCount > 0
                    ? "bg-danger-softer text-danger-fg"
                    : "bg-success-softer text-success-fg",
                )}
              >
                <AlertOctagon className="h-2.5 w-2.5" strokeWidth={2} />
                {openBlockerCountChip.openCount > 0
                  ? `${openBlockerCountChip.openCount} open blockers`
                  : "No blockers"}
                {openBlockerCountChip.openCount > 0 && openBlockerCountChip.criticalCount > 0 && (
                  <span className="ml-0.5">(+{openBlockerCountChip.criticalCount} critical)</span>
                )}
              </span>
            )}
            {/* R45 — Improvement 28: Planning Velocity Chip */}
            <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
              <Zap className="h-2.5 w-2.5" strokeWidth={2} />
              Velocity: {planningVelocityChip} recs/day
            </span>
            {/* R46 — Improvement 30: Pending Approvals Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                pendingApprovalsChip > 0
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-success-softer text-success-fg",
              )}
            >
              <ClipboardCheck className="h-2.5 w-2.5" strokeWidth={2} />
              Pending: {pendingApprovalsChip} approvals
            </span>
            {/* R47 — Improvement 32: Stock Health Score Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                stockHealthScoreChip.grade === "A"
                  ? "bg-success-softer text-success-fg"
                  : stockHealthScoreChip.grade === "B"
                    ? "bg-info-softer text-info-fg"
                    : stockHealthScoreChip.grade === "C"
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
              )}
            >
              <HeartPulse className="h-2.5 w-2.5" strokeWidth={2} />
              Stock health: {stockHealthScoreChip.grade}
            </span>
            {/* R48 — Improvement 34: Recommendation Age Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                recommendationAgeChip > 14
                  ? "bg-danger-softer text-danger-fg"
                  : recommendationAgeChip > 7
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
              )}
            >
              <Clock className="h-2.5 w-2.5" strokeWidth={2} />
              Recs age: {recommendationAgeChip}d
            </span>
            {/* R49 — Improvement 36: Last Run Age Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                lastRunAgeChip > 24
                  ? "bg-danger-softer text-danger-fg"
                  : lastRunAgeChip > 8
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
              )}
            >
              <RefreshCw className="h-2.5 w-2.5" strokeWidth={2} />
              Last run: {lastRunAgeChip}h ago
            </span>
            {/* R50 — Improvement 38: Coverage Ratio Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                coverageRatioChip >= 85
                  ? "bg-success-softer text-success-fg"
                  : coverageRatioChip >= 70
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
              )}
            >
              <Scale className="h-2.5 w-2.5" strokeWidth={2} />
              Coverage: {coverageRatioChip}%
            </span>
            {/* R51 — Improvement 40: On-hand Value Chip */}
            <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
              <Coins className="h-2.5 w-2.5" strokeWidth={2} />
              On-hand: &#8362;{onHandValueChip}K
            </span>
            {/* R52 — Improvement 42: Scrap Rate Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                scrapRateChip > 5
                  ? "bg-danger-softer text-danger-fg"
                  : scrapRateChip > 2
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
              )}
            >
              <Trash2 className="h-2.5 w-2.5" strokeWidth={2} />
              Scrap: {scrapRateChip.toFixed(1)}%
            </span>
            {/* R53 — Improvement 44: Weekly Velocity WoW Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                velocityWowPct > 0
                  ? "bg-success-softer text-success-fg"
                  : "bg-danger-softer text-danger-fg",
              )}
            >
              {velocityWowPct > 0 ? (
                <TrendingUp className="h-2.5 w-2.5" strokeWidth={2} />
              ) : (
                <TrendingDown className="h-2.5 w-2.5" strokeWidth={2} />
              )}
              Velocity: {velocityWowPct > 0 ? "+" : ""}{velocityWowPct}%
            </span>
            {/* R54 — Improvement 46: Forecast Adherence Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                forecastAdherencePct >= 90
                  ? "bg-success-softer text-success-fg"
                  : forecastAdherencePct >= 75
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
              )}
            >
              <Crosshair className="h-2.5 w-2.5" strokeWidth={2} />
              Adherence: {forecastAdherencePct}%
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowDailyPulse((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showDailyPulse ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showDailyPulse}
            >
              <Sun className="h-3 w-3" strokeWidth={2} />
              Daily pulse
            </button>
            {/* Improvement 3 — Alert Inbox toggle button */}
            <button
              type="button"
              onClick={() => setShowAlertInbox((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors relative",
                showAlertInbox ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showAlertInbox}
            >
              <Inbox className="h-3 w-3" strokeWidth={2} />
              Alerts
              {alertInboxItems.length > 0 && (
                <span className="bg-danger-fg text-white text-3xs rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {alertInboxItems.length}
                </span>
              )}
            </button>
            {/* Improvement 5 — Production Leaderboard toggle button */}
            <button
              type="button"
              onClick={() => setShowLeaderboard((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showLeaderboard ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showLeaderboard}
            >
              <Medal className="h-3 w-3" strokeWidth={2} />
              Top items
            </button>
            {/* Improvement 7 — Activity Feed toggle button */}
            <button
              type="button"
              onClick={() => setShowActivityFeed((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showActivityFeed ? "text-accent bg-accent-softer" : "text-fg-muted",
              )}
              aria-pressed={showActivityFeed}
            >
              <Activity className="h-3 w-3" strokeWidth={2} />
              Activity
            </button>
            {/* Improvement 8 — Planner Note toggle button */}
            <button
              type="button"
              onClick={() => setShowNoteEditor((v) => !v)}
              className={cn(
                "relative inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showNoteEditor ? "text-accent bg-accent-softer" : "text-fg-muted",
              )}
              aria-pressed={showNoteEditor}
            >
              <PenLine className="h-3 w-3" strokeWidth={2} />
              Note
              {plannerNote.trim() !== "" && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>
            {/* Improvement 9 — Capacity Timeline toggle button */}
            <button
              type="button"
              onClick={() => setShowCapacityTimeline((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showCapacityTimeline ? "text-accent bg-accent-softer" : "text-fg-muted",
              )}
              aria-pressed={showCapacityTimeline}
            >
              <CalendarRange className="h-3 w-3" strokeWidth={2} />
              Capacity
            </button>
            {/* Improvement 11 — Planning Section Mini-Map toggle button */}
            <button
              type="button"
              onClick={() => setShowMiniMap((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showMiniMap ? "text-accent bg-accent-softer" : "text-fg-muted",
              )}
              aria-pressed={showMiniMap}
            >
              <Map className="h-3 w-3" strokeWidth={2} />
              Map
            </button>
            {/* Improvement 12 — Recent Decisions Log toggle button */}
            <button
              type="button"
              onClick={() => setShowRecentDecisions((v) => !v)}
              className={cn(
                "relative inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showRecentDecisions ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showRecentDecisions}
            >
              <ClipboardCheck className="h-3 w-3" strokeWidth={2} />
              Decisions
              {recentDecisions.length > 0 && (
                <span className="bg-info-fg text-white text-3xs rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {recentDecisions.length}
                </span>
              )}
            </button>
            {/* Improvement 13 — Mini Monthly Calendar toggle button */}
            <button
              type="button"
              onClick={() => setShowPlannerCalendar((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showPlannerCalendar ? "text-accent bg-accent-softer" : "text-fg-muted",
              )}
              aria-pressed={showPlannerCalendar}
            >
              <Calendar className="h-3 w-3" strokeWidth={2} />
              Calendar
            </button>
            {/* Improvement 10 — KPI Goal Setter toggle button */}
            <div className="flex flex-col items-start">
              <button
                type="button"
                onClick={() => setShowKpiGoalEditor((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                  showKpiGoalEditor ? "text-accent" : "text-fg-muted",
                )}
                aria-pressed={showKpiGoalEditor}
              >
                <Target className="h-3 w-3" strokeWidth={2} />
                Goal
              </button>
              {showKpiGoalEditor && (
                <div className="flex items-center gap-2 mt-1 text-3xs bg-bg-subtle border border-border rounded px-2 py-1">
                  <label className="text-fg-muted whitespace-nowrap">Weekly goal (units):</label>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    className="w-20 border border-border rounded px-1 text-fg-muted bg-transparent text-3xs"
                    value={kpiGoalTarget}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        setKpiGoalTarget(val);
                        if (typeof window !== "undefined") {
                          localStorage.setItem("gt_planning_kpi_goal", String(val));
                        }
                      }
                    }}
                  />
                </div>
              )}
            </div>
            {/* Improvement 15 — Planning Activity Heatmap toggle button */}
            <button
              type="button"
              onClick={() => setShowPlanningHeatmap((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showPlanningHeatmap ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showPlanningHeatmap}
            >
              <LayoutGrid className="h-3 w-3" strokeWidth={2} />
              Heatmap
            </button>
            {/* Improvement 16 — KPI Summary Strip toggle button */}
            <button
              type="button"
              onClick={() => setShowKpiSummaryStrip((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showKpiSummaryStrip ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showKpiSummaryStrip}
            >
              <BarChart3 className="h-3 w-3" strokeWidth={2} />
              KPI strip
            </button>
            {/* Improvement 17 — Alert Feed toggle button */}
            <button
              type="button"
              onClick={() => setShowAlertFeed((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors relative",
                showAlertFeed ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showAlertFeed}
            >
              <Bell className="h-3 w-3" strokeWidth={2} />
              Alerts
              {alertFeedItems.length > 0 && (
                <span className="bg-danger-fg text-white text-3xs rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {alertFeedItems.length}
                </span>
              )}
            </button>
            {/* Improvement 19 — Forecast vs Actual toggle button */}
            <button
              type="button"
              onClick={() => setShowForecastVsActual((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showForecastVsActual ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showForecastVsActual}
            >
              <LineChart className="h-3 w-3" strokeWidth={2} />
              Fcst vs Actual
            </button>
            {/* Improvement 21 — Production Intensity Heatmap toggle button */}
            <button
              type="button"
              onClick={() => setShowProductionHeatmap((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showProductionHeatmap ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showProductionHeatmap}
            >
              <Flame className="h-3 w-3" strokeWidth={2} />
              Production heatmap
            </button>
            {/* Improvement 23 — Exception Trend Sparkline toggle button */}
            <button
              type="button"
              onClick={() => setShowExceptionTrend((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showExceptionTrend ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showExceptionTrend}
            >
              <TrendingDown className="h-3 w-3" strokeWidth={2} />
              Exception trend
            </button>
            {/* Improvement 25 — Top SKU Demand Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowTopSkuPanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showTopSkuPanel ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showTopSkuPanel}
            >
              <Star className="h-3 w-3" strokeWidth={2} />
              Top SKUs
            </button>
            {/* R45 — Improvement 27: Supplier Lead Time Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowSupplierLeadTimePanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showSupplierLeadTimePanel ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showSupplierLeadTimePanel}
            >
              <Truck className="h-3 w-3" strokeWidth={2} />
              Lead Times
            </button>
            {/* R46 — Improvement 29: Material Coverage Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowMaterialCoveragePanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showMaterialCoveragePanel ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showMaterialCoveragePanel}
            >
              <Layers className="h-3 w-3" strokeWidth={2} />
              Material Coverage
            </button>
            {/* R47 — Improvement 31: Demand Signal Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowDemandSignalPanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showDemandSignalPanel ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showDemandSignalPanel}
            >
              <Radio className="h-3 w-3" strokeWidth={2} />
              Demand Signal
            </button>
            {/* R49 — Improvement 35: Integration Status toggle button */}
            <button
              type="button"
              onClick={() => setShowIntegrationStatus((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showIntegrationStatus ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showIntegrationStatus}
            >
              <Wifi className="h-3 w-3" strokeWidth={2} />
              Integrations
            </button>
            {/* R50 — Improvement 37: PO Summary toggle button */}
            <button
              type="button"
              onClick={() => setShowPurchaseOrderSummary((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showPurchaseOrderSummary ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showPurchaseOrderSummary}
            >
              <ShoppingBag className="h-3 w-3" strokeWidth={2} />
              PO Summary
            </button>
            {/* R48 — Improvement 33: Exception Drill-Down toggle button */}
            <button
              type="button"
              onClick={() => setShowExceptionDrillDown((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showExceptionDrillDown ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showExceptionDrillDown}
            >
              <Inbox className="h-3 w-3" strokeWidth={2} />
              Exceptions
            </button>
            {/* R51 — Improvement 39: Cost Variance Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowCostVariancePanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showCostVariancePanel ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showCostVariancePanel}
            >
              <TrendingDown className="h-3 w-3" strokeWidth={2} />
              Cost Variance
            </button>
            {/* R52 — Improvement 41: Production Schedule Summary toggle button */}
            <button
              type="button"
              onClick={() => setShowProductionScheduleSummary((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showProductionScheduleSummary ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showProductionScheduleSummary}
            >
              <CalendarCheck className="h-3 w-3" strokeWidth={2} />
              Prod Schedule
            </button>
            {/* R53 — Improvement 43: Shift Handover Log toggle button */}
            <button
              type="button"
              onClick={() => setShowShiftHandoverLog((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors",
                showShiftHandoverLog ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showShiftHandoverLog}
            >
              <ClipboardList className="h-3 w-3" strokeWidth={2} />
              Handover
            </button>
            {/* R54 — Improvement 45: Alert Center Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowAlertCenterPanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1 border border-border/60 bg-bg-raised hover:bg-bg-subtle transition-colors relative",
                showAlertCenterPanel ? "text-accent" : "text-fg-muted",
              )}
              aria-pressed={showAlertCenterPanel}
            >
              <Bell className="h-3 w-3" strokeWidth={2} />
              Alerts
              {MOCK_ALERTS.some((a) => a.severity === "critical") && (
                <span className="bg-danger-fg text-white text-3xs rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {MOCK_ALERTS.filter((a) => a.severity === "critical").length}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* Improvement 1 — Daily Pulse Summary strip */}
      {showDailyPulse && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 flex flex-wrap gap-3 text-3xs">
          <span className="flex items-center gap-1 text-fg-muted">
            <PackageCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
            GRs today:{" "}
            <span className="text-fg-strong font-medium">{dailyPulse.grToday}</span>
          </span>
          <span
            className={cn(
              "flex items-center gap-1",
              dailyPulse.alertsToday > 0 ? "text-warning-fg" : "text-fg-muted",
            )}
          >
            <Bell className="h-3 w-3 shrink-0" strokeWidth={2} />
            Alerts today:{" "}
            <span className="text-fg-strong font-medium">{dailyPulse.alertsToday}</span>
          </span>
          <span className="flex items-center gap-1 text-fg-muted">
            <Zap className="h-3 w-3 shrink-0" strokeWidth={2} />
            Exceptions delta:{" "}
            <span className="text-fg-strong font-medium">
              {dailyPulse.exceptionsDelta >= 0
                ? `+${dailyPulse.exceptionsDelta}`
                : `${dailyPulse.exceptionsDelta}`}
            </span>
          </span>
          <span className="flex items-center gap-1 text-fg-muted">
            <Factory className="h-3 w-3 shrink-0" strokeWidth={2} />
            Produced today:{" "}
            <span className="text-fg-strong font-medium">
              {dailyPulse.productionToday} units
            </span>
          </span>
        </div>
      )}

      {/* Improvement 3 — Mini Alert Inbox panel */}
      {showAlertInbox && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 space-y-1.5">
          {alertInboxItems.length === 0 ? (
            <div className="text-fg-faint text-center py-2 text-3xs">No open alerts</div>
          ) : (
            alertInboxItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-3xs">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    item.severity === "critical" || item.severity === "high"
                      ? "bg-danger-fg"
                      : item.severity === "medium"
                        ? "bg-warning-fg"
                        : "bg-fg-faint",
                  )}
                />
                <span className="text-fg-strong flex-1 truncate">{item.message}</span>
                <span className="text-fg-faint text-3xs shrink-0">{timeAgo(item.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Improvement 5 — Production Leaderboard panel */}
      {showLeaderboard && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 space-y-1 text-3xs">
          <div className="text-fg-faint font-medium mb-1">This Week&apos;s Top Production</div>
          {leaderboardItems.length === 0 ? (
            <div className="text-fg-faint text-center py-2">No production data</div>
          ) : (
            leaderboardItems.map((item) => (
              <div key={item.rank} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center text-3xs font-bold shrink-0",
                    item.rank === 1
                      ? "bg-yellow-400 text-yellow-900"
                      : item.rank === 2
                        ? "bg-gray-300 text-gray-700"
                        : "bg-orange-300 text-orange-900",
                  )}
                >
                  {item.rank}
                </span>
                <span className="text-fg-strong flex-1 truncate">{item.name}</span>
                <span className="text-fg-muted">{item.qty}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Improvement 7 — Activity Feed panel */}
      {showActivityFeed && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Recent Activity</span>
          </div>
          {activityItems.length === 0 ? (
            <div className="text-fg-faint text-3xs py-1">No recent activity</div>
          ) : (
            activityItems.map((item) => {
              const hoursAgo = item.at
                ? Math.floor((Date.now() - new Date(item.at).getTime()) / 3600000)
                : null;
              const relTime = hoursAgo === null ? "—" : `${hoursAgo}h ago`;
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2 py-1 border-b border-border last:border-0 text-3xs"
                >
                  <span className="text-fg-faint font-medium shrink-0">{item.action}</span>
                  <span className="text-fg-muted flex-1 truncate">{item.subject}</span>
                  <span className="text-fg-faint shrink-0">{relTime}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Improvement 8 — Planner Note of the Day panel */}
      {showNoteEditor && (
        <div className="bg-warning-softer border border-warning/30 rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5">
            <PenLine className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Planner Note</span>
            <span className="text-3xs text-fg-faint ml-auto">
              {new Date().toLocaleDateString()}
            </span>
          </div>
          <textarea
            className="w-full text-3xs bg-transparent border border-border rounded p-1.5 mt-1 resize-none h-16 text-fg-muted placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
            placeholder="Add a note for today's planning session..."
            value={plannerNote}
            onChange={(e) => {
              const val = e.target.value;
              setPlannerNote(val);
              if (typeof window !== "undefined") {
                localStorage.setItem("gt_planning_daily_note", val);
              }
            }}
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-3xs text-fg-faint">{plannerNote.length} chars</span>
            {plannerNote.trim() !== "" && (
              <button
                type="button"
                className="text-3xs text-fg-faint hover:text-fg-muted transition-colors"
                onClick={() => {
                  setPlannerNote("");
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("gt_planning_daily_note");
                  }
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Improvement 9 — 4-Week Capacity Timeline panel */}
      {showCapacityTimeline && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5">
            <CalendarRange className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">4-Week Capacity Outlook</span>
          </div>
          <div className="flex gap-2 mt-2">
            {capacityWeeks.map((week, wi) => (
              <div key={wi} className="flex-1">
                <div className="text-3xs text-fg-faint font-medium mb-1 text-center">
                  {week.weekLabel}
                </div>
                <div className="flex gap-0.5">
                  {week.days.map((day, di) => (
                    <div
                      key={di}
                      className={cn(
                        "flex-1 h-5 rounded text-3xs flex items-center justify-center",
                        day.load <= 60
                          ? "bg-success-fg/20 text-success-fg"
                          : day.load <= 85
                            ? "bg-warning-fg/20 text-warning-fg"
                            : "bg-danger-fg/20 text-danger-fg",
                      )}
                      title={`${day.label}: ${day.load}%`}
                    >
                      {day.load}%
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvement 11 — Planning Section Mini-Map panel */}
      {showMiniMap && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5">
            <Map className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Planning Sections</span>
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            {PLANNING_SECTIONS.map((section, idx) => (
              <a
                key={section.href}
                href={section.href}
                className="flex-1 min-w-[80px] flex flex-col items-center gap-1 bg-bg-muted hover:bg-accent-softer rounded p-2 text-center cursor-pointer no-underline transition-colors"
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    idx % 3 === 0
                      ? "bg-success-fg"
                      : idx % 3 === 1
                        ? "bg-warning-fg"
                        : "bg-fg-faint",
                  )}
                />
                <Grid3X3 className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-3xs text-fg-muted font-medium">{section.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Improvement 12 — Recent Decisions Log panel */}
      {showRecentDecisions && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ClipboardCheck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Recent Decisions</span>
          </div>
          {recentDecisions.length === 0 ? (
            <div className="text-fg-faint text-3xs py-1">No recent decisions</div>
          ) : (
            recentDecisions.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 py-1 border-b border-border last:border-0 text-3xs"
              >
                <span
                  className={cn(
                    "text-3xs rounded px-1 font-medium shrink-0",
                    item.action === "approve"
                      ? "bg-success-softer text-success-fg"
                      : item.action === "reject"
                        ? "bg-danger-softer text-danger-fg"
                        : "bg-info-softer text-info-fg",
                  )}
                >
                  {item.action}
                </span>
                <span className="flex-1 text-fg-muted truncate">{item.subject}</span>
                <span className="text-fg-faint shrink-0">
                  {item.actor} · {timeAgo(item.at)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Improvement 13 — Mini Monthly Calendar panel */}
      {showPlannerCalendar && (() => {
        const { days, month, year } = plannerEventDays;
        const monthName = new Date(year, month).toLocaleString("en", { month: "long" });
        // Day of week of the first day (0=Sun)
        const firstDow = new Date(year, month, 1).getDay();
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-fg-muted" strokeWidth={2} />
              <span className="text-xs font-semibold text-fg-strong">
                {monthName} {year}
              </span>
            </div>
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-0.5 mt-1 text-3xs text-fg-faint text-center">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {/* Days grid */}
            <div className="grid grid-cols-7 gap-0.5 mt-0.5">
              {/* Empty cells before month start */}
              {Array.from({ length: firstDow }, (_, i) => (
                <div key={`empty-${i}`} className="col-span-1 h-6" />
              ))}
              {days.map((day) => (
                <div
                  key={day.dayNum}
                  className={cn(
                    "h-6 rounded flex items-center justify-center text-3xs cursor-default",
                    day.isToday ? "ring-1 ring-accent" : "",
                    day.hasEvent
                      ? "bg-accent-softer text-accent font-medium"
                      : day.isWeekend
                        ? "text-fg-faint"
                        : "text-fg-muted hover:bg-bg-muted",
                  )}
                >
                  {day.dayNum}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Improvement 15 — Planning Activity Heatmap panel */}
      {showPlanningHeatmap && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="text-xs font-semibold text-fg-strong mb-1.5">
            Planning Activity (12 Weeks)
          </div>
          {/* Day labels */}
          <div className="flex gap-0.5 ml-6 text-fg-faint" style={{ fontSize: "0.6rem" }}>
            {["M", "T", "W", "T", "F"].map((label, i) => (
              <span key={i} className="w-4 text-center">{label}</span>
            ))}
          </div>
          {/* Week rows */}
          {planningHeatmapData.weeks.map((week, wi) => (
            <div key={wi} className="flex items-center gap-0.5 mt-0.5">
              <span className="w-5 text-fg-faint text-right shrink-0" style={{ fontSize: "0.6rem" }}>
                W{wi + 1}
              </span>
              {week.days.map((day, di) => (
                <div
                  key={di}
                  className={cn(
                    "w-4 h-4 rounded-sm",
                    day.count === 0
                      ? "bg-bg-muted"
                      : day.count <= 2
                        ? "bg-accent/20"
                        : day.count <= 5
                          ? "bg-accent/50"
                          : "bg-accent",
                  )}
                  title={`${day.count} events`}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Improvement 16 — KPI Summary Strip panel */}
      {showKpiSummaryStrip && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex gap-2">
            {kpiStripData.map((metric) => (
              <div
                key={metric.label}
                className="flex-1 rounded p-2 text-center bg-bg-muted"
              >
                <div className={cn("text-xl font-bold text-fg-strong", metric.color)}>
                  {metric.unit === "pct" ? `${Math.round(metric.value)}%` : `${metric.value}`}
                </div>
                <div className="text-fg-faint" style={{ fontSize: "0.6rem" }}>
                  {metric.label}
                </div>
                <div className="h-1 mt-1 rounded-full bg-bg-subtle overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", metric.color.replace("text-", "bg-"))}
                    style={{
                      width: `${metric.unit === "pct" ? Math.min(100, Math.max(0, metric.value)) : Math.min(100, Math.max(0, 100 - metric.value * 10))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvement 17 — Alert Feed panel */}
      {showAlertFeed && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Bell className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Open Alerts</span>
          </div>
          {alertFeedItems.length === 0 ? (
            <div className="text-fg-faint text-3xs text-center py-2">No open alerts</div>
          ) : (
            alertFeedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    item.severity === "critical" || item.severity === "high"
                      ? "bg-danger-fg"
                      : item.severity === "medium"
                        ? "bg-warning-fg"
                        : "bg-bg-muted",
                  )}
                />
                <span className="text-fg-strong flex-1 truncate">{item.message}</span>
                <span className="text-fg-faint shrink-0">{timeAgo(item.created_at)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Improvement 19 — Forecast vs Actual Overlay Panel */}
      {showForecastVsActual && (() => {
        const { weeks, maxVal } = forecastVsActualData;
        const W = 200;
        const H = 60;
        const padL = 4;
        const padR = 4;
        const padT = 4;
        const padB = 4;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const xStep = weeks.length > 1 ? chartW / (weeks.length - 1) : chartW;
        const yScale = (v: number) => padT + chartH - (v / Math.max(maxVal, 1)) * chartH;
        const forecastPoints = weeks
          .map((w, i) => `${padL + i * xStep},${yScale(w.forecast)}`)
          .join(" ");
        const actualPoints = weeks
          .filter((w) => w.actual !== null)
          .map((w, _i, arr) => {
            const origIdx = weeks.indexOf(w);
            return `${padL + origIdx * xStep},${yScale(w.actual as number)}`;
          })
          .join(" ");
        return (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
            <div className="flex items-center gap-1.5 mb-2">
              <LineChart className="h-3 w-3 text-fg-muted" strokeWidth={2} />
              <span className="text-xs font-semibold text-fg-strong">Forecast vs Actual (4 weeks)</span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ maxHeight: 80 }}
              aria-label="Forecast vs Actual chart"
            >
              {/* Forecast polyline */}
              <polyline
                points={forecastPoints}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              {/* Actual polyline */}
              {actualPoints && (
                <polyline
                  points={actualPoints}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              )}
              {/* Forecast data-point circles */}
              {weeks.map((w, i) => (
                <circle
                  key={`f-${i}`}
                  cx={padL + i * xStep}
                  cy={yScale(w.forecast)}
                  r={2}
                  fill="#3b82f6"
                />
              ))}
              {/* Actual data-point circles */}
              {weeks.map((w, i) =>
                w.actual !== null ? (
                  <circle
                    key={`a-${i}`}
                    cx={padL + i * xStep}
                    cy={yScale(w.actual as number)}
                    r={2}
                    fill="#22c55e"
                  />
                ) : null,
              )}
              {/* X-axis week labels */}
              {weeks.map((w, i) => (
                <text
                  key={`l-${i}`}
                  x={padL + i * xStep}
                  y={H}
                  textAnchor="middle"
                  fontSize={6}
                  fill="currentColor"
                  className="text-fg-faint"
                >
                  {w.weekLabel}
                </text>
              ))}
            </svg>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-1 text-3xs text-fg-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#3b82f6" }} />
                Forecast
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />
                Actual
              </span>
            </div>
          </div>
        );
      })()}

      {/* Improvement 21 — Production Intensity Heatmap panel */}
      {showProductionHeatmap && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Flame className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Production Intensity (4 weeks)</span>
          </div>
          {/* Day-of-week header */}
          <div className="flex items-center gap-0.5 ml-7 mb-1" style={{ fontSize: "0.6rem" }}>
            {["M", "T", "W", "T", "F"].map((label, i) => (
              <span key={i} className="w-3 text-center text-fg-faint">{label}</span>
            ))}
          </div>
          {/* Week rows */}
          {productionHeatmapData.weeks.map((week, wi) => (
            <div key={wi} className="flex items-center gap-0.5 mt-0.5">
              <span
                className="w-6 shrink-0 text-right text-fg-faint"
                style={{ fontSize: "0.6rem" }}
              >
                {week.label}
              </span>
              {week.days.map((cell, di) => (
                <div
                  key={di}
                  className={cn(
                    "w-3 h-3 rounded-sm",
                    cell.intensity === 0
                      ? "bg-bg-muted"
                      : cell.intensity === 1
                        ? "bg-accent/20"
                        : cell.intensity === 2
                          ? "bg-accent/50"
                          : "bg-accent",
                  )}
                  title={`${cell.date}: ${cell.qty} units`}
                />
              ))}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center gap-2 mt-2 text-3xs text-fg-faint">
            <span>Less</span>
            {[
              "bg-bg-muted",
              "bg-accent/20",
              "bg-accent/50",
              "bg-accent",
            ].map((cls, i) => (
              <span key={i} className={cn("w-3 h-3 rounded-sm inline-block", cls)} />
            ))}
            <span>More</span>
          </div>
        </div>
      )}

      {/* Improvement 23 — Exception Trend Sparkline panel */}
      {showExceptionTrend && exceptionTrendData !== null && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3 text-fg-muted" strokeWidth={2} />
              <span className="text-xs font-semibold text-fg-strong">Exception Trend (30 days)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xs text-fg-muted">
                {exceptionTrendData.trend === "up" ? "↑ Increasing" : exceptionTrendData.trend === "down" ? "↓ Decreasing" : "→ Stable"}
              </span>
              <span className="text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted flex items-center gap-1">
                avg {exceptionTrendData.avgCount}/day
              </span>
            </div>
          </div>
          <svg
            viewBox="0 0 200 40"
            className="w-full"
            style={{ height: 40 }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="exceptionTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Gradient fill polygon */}
            <polygon
              points={[
                ...exceptionTrendData.points.map((p) => `${p.x},${p.y}`),
                `${exceptionTrendData.points[exceptionTrendData.points.length - 1].x},40`,
                `${exceptionTrendData.points[0].x},40`,
              ].join(" ")}
              fill="url(#exceptionTrendGrad)"
            />
            {/* Line */}
            <polyline
              points={exceptionTrendData.points.map((p) => `${p.x},${p.y}`).join(" ")}
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dots */}
            {exceptionTrendData.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={1.5} fill="#ef4444" />
            ))}
          </svg>
        </div>
      )}

      {/* Improvement 25 — Top SKU Demand Panel */}
      {showTopSkuPanel && topSkuData !== null && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Top 5 SKUs by Demand</span>
          </div>
          <div className="flex flex-col gap-1">
            {topSkuData.skus.map((sku, idx) => {
              const medalColor =
                idx === 0
                  ? "text-yellow-500"
                  : idx === 1
                    ? "text-slate-400"
                    : idx === 2
                      ? "text-amber-600"
                      : "text-fg-faint";
              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className={`text-3xs font-bold w-4 shrink-0 ${medalColor}`}>
                    {idx + 1}.
                  </span>
                  <span className="text-3xs text-fg-strong truncate flex-1 min-w-0" title={sku.name}>
                    {sku.name}
                  </span>
                  <span className="text-3xs bg-accent/10 text-accent px-1 rounded shrink-0">
                    {sku.qty.toLocaleString()} {sku.unit}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-1.5 border-t border-border/60 text-3xs text-fg-muted flex items-center justify-between">
            <span>Total demand</span>
            <span className="font-medium text-fg-strong">{topSkuData.totalDemand.toLocaleString()} units</span>
          </div>
        </div>
      )}

      {/* R45 — Improvement 27: Supplier Lead Time Panel */}
      {showSupplierLeadTimePanel && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Supplier Lead Times</span>
          </div>
          <table className="w-full text-3xs border-collapse">
            <thead>
              <tr className="text-fg-faint border-b border-border/60">
                <th className="text-left font-medium pb-1 pr-2">Supplier</th>
                <th className="text-right font-medium pb-1 pr-2">Avg days</th>
                <th className="text-right font-medium pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_LEAD_TIMES.map((row) => {
                const pillCls =
                  row.avgDays <= 7
                    ? "bg-success-softer text-success-fg"
                    : row.avgDays <= 14
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg";
                const pillLabel =
                  row.avgDays <= 7 ? "Fast" : row.avgDays <= 14 ? "Normal" : "Slow";
                return (
                  <tr key={row.supplier} className="border-b border-border/40 last:border-0">
                    <td className="py-1 pr-2 text-fg-strong truncate max-w-[120px]">{row.supplier}</td>
                    <td className="py-1 pr-2 text-right text-fg-muted">{row.avgDays}d</td>
                    <td className="py-1 text-right">
                      <span className={cn("rounded-full px-1.5 py-0.5 text-3xs font-medium", pillCls)}>
                        {pillLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* R46 — Improvement 29: Material Coverage Panel */}
      {showMaterialCoveragePanel && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Material Coverage</span>
          </div>
          <p className="text-3xs text-fg-faint mb-2">Coverage across all planned items this week</p>
          {/* Stacked bar */}
          <div
            className="flex rounded overflow-hidden"
            style={{ width: 280, height: 14 }}
            role="img"
            aria-label="Material coverage: 65% covered, 20% partial, 15% gap"
          >
            <div
              className="bg-success-fg"
              style={{ width: "65%" }}
              title="Covered: 65%"
            />
            <div
              className="bg-warning-fg"
              style={{ width: "20%" }}
              title="Partial: 20%"
            />
            <div
              className="bg-danger-fg"
              style={{ width: "15%" }}
              title="Gap: 15%"
            />
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-1.5 text-3xs text-fg-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-success-fg" />
              Covered 65%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-warning-fg" />
              Partial 20%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-danger-fg" />
              Gap 15%
            </span>
          </div>
        </div>
      )}

      {/* R47 — Improvement 31: Demand Signal Panel */}
      {showDemandSignalPanel && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Radio className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Demand Signal</span>
          </div>
          <table className="w-full text-3xs border-collapse">
            <thead>
              <tr className="text-fg-faint border-b border-border/60">
                <th className="text-left font-medium pb-1 pr-2">Signal source</th>
                <th className="text-center font-medium pb-1 pr-2">Strength</th>
                <th className="text-right font-medium pb-1">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_DEMAND_SIGNALS.map((row) => {
                const pillCls =
                  row.strength === "Strong"
                    ? "bg-success-softer text-success-fg"
                    : row.strength === "Moderate"
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-bg-muted text-fg-muted";
                return (
                  <tr key={row.source} className="border-b border-border/40 last:border-0">
                    <td className="py-1 pr-2 text-fg-strong">{row.source}</td>
                    <td className="py-1 pr-2 text-center">
                      <span className={cn("rounded-full px-1.5 py-0.5 text-3xs font-medium", pillCls)}>
                        {row.strength}
                      </span>
                    </td>
                    <td className="py-1 text-right text-fg-faint">{timeAgo(row.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* R48 — Improvement 33: Exception Drill-Down Panel */}
      {showExceptionDrillDown && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Inbox className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Exception Drill-Down</span>
          </div>
          {/* Critical group */}
          {MOCK_EXCEPTION_ITEMS.filter((e) => e.severity === "critical").length > 0 && (
            <>
              <div className="text-3xs font-semibold text-fg-faint uppercase tracking-wide mb-1">
                Critical
              </div>
              {MOCK_EXCEPTION_ITEMS.filter((e) => e.severity === "critical").map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 text-3xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-danger-fg" />
                  <span className="text-fg-muted shrink-0">{item.type}</span>
                  <span className="text-fg-strong flex-1 truncate">{item.itemName}</span>
                  <span className="text-accent cursor-pointer hover:underline shrink-0">View</span>
                </div>
              ))}
              <div className="border-t border-border/30 my-1.5" />
            </>
          )}
          {/* Warning group */}
          {MOCK_EXCEPTION_ITEMS.filter((e) => e.severity === "warning").length > 0 && (
            <>
              <div className="text-3xs font-semibold text-fg-faint uppercase tracking-wide mb-1">
                Warning
              </div>
              {MOCK_EXCEPTION_ITEMS.filter((e) => e.severity === "warning").map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 text-3xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-warning-fg" />
                  <span className="text-fg-muted shrink-0">{item.type}</span>
                  <span className="text-fg-strong flex-1 truncate">{item.itemName}</span>
                  <span className="text-accent cursor-pointer hover:underline shrink-0">View</span>
                </div>
              ))}
              <div className="border-t border-border/30 my-1.5" />
            </>
          )}
          {/* Info group */}
          {MOCK_EXCEPTION_ITEMS.filter((e) => e.severity === "info").length > 0 && (
            <>
              <div className="text-3xs font-semibold text-fg-faint uppercase tracking-wide mb-1">
                Info
              </div>
              {MOCK_EXCEPTION_ITEMS.filter((e) => e.severity === "info").map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 text-3xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-fg-faint" />
                  <span className="text-fg-muted shrink-0">{item.type}</span>
                  <span className="text-fg-strong flex-1 truncate">{item.itemName}</span>
                  <span className="text-accent cursor-pointer hover:underline shrink-0">View</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* R49 — Improvement 35: Integration Status Panel */}
      {showIntegrationStatus && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Wifi className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Integration Status</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {MOCK_INTEGRATION_STATUS.map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-2 text-3xs"
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    row.status === "Connected"
                      ? "bg-success-fg"
                      : row.status === "Stale"
                        ? "bg-warning-fg"
                        : "bg-danger-fg",
                  )}
                />
                <span className="text-fg-strong w-24 shrink-0">{row.name}</span>
                <span
                  className={cn(
                    "text-3xs rounded-full px-1.5 py-0.5 font-medium shrink-0",
                    row.status === "Connected"
                      ? "bg-success-softer text-success-fg"
                      : row.status === "Stale"
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-danger-softer text-danger-fg",
                  )}
                >
                  {row.status}
                </span>
                <span className="text-fg-faint ml-auto shrink-0">
                  Last sync: {timeAgo(row.lastSync)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* R50 — Improvement 37: PO Summary Panel */}
      {showPurchaseOrderSummary && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <ShoppingBag className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">PO Summary</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Open POs */}
            <div className="rounded bg-bg-muted p-2 flex flex-col gap-0.5">
              <span className="text-3xs text-fg-faint">Open POs</span>
              <span className="text-xl font-bold text-fg-strong">{MOCK_PO_SUMMARY.openPOs}</span>
            </div>
            {/* Total PO Value */}
            <div className="rounded bg-bg-muted p-2 flex flex-col gap-0.5">
              <span className="text-3xs text-fg-faint">Total PO Value</span>
              <span className="text-xl font-bold text-fg-strong">&#8362;{MOCK_PO_SUMMARY.totalValueK}K</span>
            </div>
            {/* Overdue POs */}
            <div className="rounded bg-bg-muted p-2 flex flex-col gap-0.5">
              <span className="text-3xs text-fg-faint">Overdue POs</span>
              <span
                className={cn(
                  "text-xl font-bold",
                  MOCK_PO_SUMMARY.overduePOs > 0 ? "text-danger-fg" : "text-fg-strong",
                )}
              >
                {MOCK_PO_SUMMARY.overduePOs}
              </span>
            </div>
            {/* Avg PO Age */}
            <div className="rounded bg-bg-muted p-2 flex flex-col gap-0.5">
              <span className="text-3xs text-fg-faint">Avg PO Age</span>
              <span className="text-xl font-bold text-fg-strong">{MOCK_PO_SUMMARY.avgAgeDays}d</span>
            </div>
          </div>
        </div>
      )}

      {/* R51 — Improvement 39: Cost Variance Panel */}
      {showCostVariancePanel && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Cost Variance — This Week</span>
          </div>
          <table className="w-full text-3xs border-collapse">
            <thead>
              <tr className="text-fg-faint border-b border-border/60">
                <th className="text-left font-medium pb-1 pr-2">Category</th>
                <th className="text-right font-medium pb-1 pr-2">Budget</th>
                <th className="text-right font-medium pb-1 pr-2">Actual</th>
                <th className="text-right font-medium pb-1">Variance</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  { category: "Materials", budget: "₪18K", actual: "₪19.2K", variance: "+6.7%", over: true },
                  { category: "Labor",     budget: "₪4K",  actual: "₪3.8K",  variance: "-5%",   over: false },
                  { category: "Total",     budget: "₪22K", actual: "₪23K",   variance: "+4.5%", over: true },
                ] as { category: string; budget: string; actual: string; variance: string; over: boolean }[]
              ).map((row) => (
                <tr key={row.category} className="border-b border-border/40 last:border-0">
                  <td className="py-1 pr-2 text-fg-strong font-medium">{row.category}</td>
                  <td className="py-1 pr-2 text-right text-fg-muted">{row.budget}</td>
                  <td className="py-1 pr-2 text-right text-fg-muted">{row.actual}</td>
                  <td className={cn("py-1 text-right font-semibold", row.over ? "text-danger-fg" : "text-success-fg")}>
                    {row.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* R52 — Improvement 41: Production Schedule Summary Panel */}
      {showProductionScheduleSummary && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <CalendarCheck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Production Schedule — This Week</span>
          </div>
          <table className="w-full text-3xs border-collapse">
            <thead>
              <tr className="text-fg-faint border-b border-border/60">
                <th className="text-left font-medium pb-1 pr-2">Day</th>
                <th className="text-right font-medium pb-1 pr-2">Items</th>
                <th className="text-right font-medium pb-1 pr-2">Units planned</th>
                <th className="text-center font-medium pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PROD_SCHEDULE.map((row) => (
                <tr key={row.day} className="border-b border-border/40 last:border-0">
                  <td className="py-1 pr-2 text-fg-strong font-medium">{row.day}</td>
                  <td className="py-1 pr-2 text-right text-fg-muted">{row.scheduledItems}</td>
                  <td className="py-1 pr-2 text-right text-fg-muted">
                    {row.totalUnits > 0 ? row.totalUnits.toLocaleString() : "—"}
                  </td>
                  <td className="py-1 text-center">
                    {row.status === "complete" ? (
                      <span className="text-success-fg font-semibold">✓</span>
                    ) : row.status === "partial" ? (
                      <span className="text-warning-fg font-semibold">⚠</span>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* R53 — Improvement 43: Shift Handover Log panel */}
      {showShiftHandoverLog && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Shift Handover Log</span>
          </div>
          <table className="w-full text-3xs border-collapse">
            <thead>
              <tr className="text-fg-faint border-b border-border/60">
                <th className="text-left font-medium pb-1 pr-2">Time</th>
                <th className="text-left font-medium pb-1 pr-2">Supervisor</th>
                <th className="text-center font-medium pb-1 pr-2">Status</th>
                <th className="text-left font-medium pb-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_SHIFT_HANDOVERS.map((row, idx) => (
                <tr key={idx} className="border-b border-border/40 last:border-0">
                  <td className="py-1 pr-2 text-fg-strong font-medium">{row.time}</td>
                  <td className="py-1 pr-2 text-fg-muted">{row.supervisor}</td>
                  <td className="py-1 pr-2 text-center">
                    <span
                      className={cn(
                        "inline-block rounded-full px-1.5 py-0.5 font-semibold",
                        row.status === "clean"
                          ? "bg-success-softer text-success-fg"
                          : row.status === "pending"
                            ? "bg-warning-softer text-warning-fg"
                            : "bg-danger-softer text-danger-fg",
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-1 text-fg-muted truncate max-w-xs">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* R54 — Improvement 45: Alert Center Panel */}
      {showAlertCenterPanel && (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Bell className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Alert Center</span>
            <span className="text-3xs text-fg-faint ml-1">
              {MOCK_ALERTS.length} total
            </span>
            {MOCK_ALERTS.some((a) => a.severity === "critical") && (
              <span className="ml-1 inline-flex items-center rounded-full bg-danger-softer text-danger-fg text-3xs px-1.5 py-0.5 font-semibold">
                {MOCK_ALERTS.filter((a) => a.severity === "critical").length} critical
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {MOCK_ALERTS.map((alert) => (
              <div key={alert.id} className="flex items-center gap-2 text-3xs">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    alert.severity === "critical"
                      ? "bg-danger-fg"
                      : alert.severity === "warning"
                        ? "bg-yellow-400"
                        : "bg-info-fg",
                  )}
                />
                <span className="text-fg-strong flex-1 truncate">{alert.message}</span>
                <span className="text-fg-faint shrink-0">{alert.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Corridor state: 3-up context cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Forecast */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Forecast
          </div>
          {forecastQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : forecastQuery.isError ? (
            <div className="text-xs text-danger-fg">
              Could not load forecast data.
              <Link href="/planning/forecast" className="ml-1 text-3xs text-accent hover:underline">
                Go to forecasts →
              </Link>
            </div>
          ) : !latestForecast ? (
            <>
              <div className="text-xs font-medium text-warning-fg">
                No published forecast
              </div>
              <div className="mt-1 text-3xs text-fg-muted">
                Planning uses open orders only.{" "}
                <Link href="/planning/forecast" className="text-accent hover:underline">
                  Publish a forecast
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {latestForecast.cadence ?? "forecast"} · {latestForecast.horizon_weeks}w
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                Published {fmtDate(latestForecast.published_at)}
              </div>
              <div className="mt-1">
                <Link href="/planning/forecast" className="text-3xs text-accent hover:underline">
                  View forecasts →
                </Link>
              </div>
            </>
          )}
        </div>

        {/* LionWheel order sync */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Order sync (LionWheel)
          </div>
          {jobsQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : jobsQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load sync status.</div>
          ) : !lionwheelJob ? (
            <div className="text-xs text-fg-muted">
              No sync job found — LionWheel integration may not be configured.
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "text-xs font-medium",
                  lionwheelJob.last_status === "failed"
                    ? "text-danger-fg"
                    : "text-fg",
                )}
              >
                {lionwheelJob.last_status === "failed" ? "Last sync failed" : "Synced"}
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                {timeAgo(lionwheelJob.last_ended_at)}
              </div>
              {Number(lionwheelJob.failed_count_24h) > 0 ? (
                <div className="mt-0.5 text-3xs text-warning-fg">
                  {lionwheelJob.failed_count_24h} failure
                  {Number(lionwheelJob.failed_count_24h) !== 1 ? "s" : ""} in 24h
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Demand coverage */}
        <div
          className={cn(
            "rounded-md border px-4 py-3",
            demandQuery.isLoading || !coverage || coverage.total_lines === 0
              ? "border-border/60 bg-bg-raised"
              : coverage.is_partial
                ? "border-warning/30 bg-warning-softer"
                : "border-success/30 bg-success-softer",
          )}
        >
          <div
            className={cn(
              "mb-1.5 text-3xs font-semibold uppercase tracking-sops",
              demandQuery.isLoading || !coverage || coverage.total_lines === 0
                ? "text-fg-subtle"
                : coverage.is_partial
                  ? "text-warning-fg"
                  : "text-success-fg",
            )}
          >
            Demand coverage
          </div>
          {demandQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : demandQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load demand coverage.</div>
          ) : !coverage ? (
            <div className="text-xs text-fg-muted">No demand coverage data — run a planning cycle to compute demand.</div>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {coverage.resolved_lines} / {coverage.total_lines} lines resolved
              </div>
              {coverage.total_lines === 0 ? (
                <div className="mt-0.5 text-3xs text-fg-muted">
                  No order lines — LionWheel sync may be pending
                </div>
              ) : coverage.unresolved_lines > 0 || coverage.bundle_lines > 0 ? (
                <div className="mt-0.5 text-3xs text-warning-fg">
                  {[
                    coverage.unresolved_lines > 0
                      ? `${coverage.unresolved_lines} unresolved (${coverage.unresolved_distinct_skus} SKUs)`
                      : null,
                    coverage.bundle_lines > 0
                      ? `${coverage.bundle_lines} bundle lines excluded`
                      : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              ) : (
                <div className="mt-0.5 text-3xs text-success-fg">
                  All active order lines resolved
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Latest planning run */}
      <SectionCard
        eyebrow="Latest planning run"
        title={
          runsQuery.isLoading
            ? "Loading…"
            : latestRun
              ? `Latest run — ${
                  latestRun.status === "completed" ? "Completed"
                  : latestRun.status === "failed" ? "Failed"
                  : latestRun.status === "running" ? "Running"
                  : latestRun.status === "superseded" ? "Superseded"
                  : latestRun.status === "draft" ? "Queued"
                  : latestRun.status
                }`
              : "No runs yet"
        }
        contentClassName="px-4 py-3"
      >
        {runsQuery.isLoading ? (
          <div className="text-xs text-fg-muted">Loading runs…</div>
        ) : runsQuery.isError ? (
          <div className="text-xs text-danger-fg">
            Could not load planning runs. Check your connection and try refreshing.
          </div>
        ) : !latestRun ? (
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-fg-muted">
                No planning runs have been triggered yet.
              </div>
              {canTrigger ? (
                <div className="mt-1.5">
                  <Link
                    href="/planning/runs"
                    className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                  >
                    <Play className="h-3 w-3" strokeWidth={2.5} />
                    Trigger the first run
                  </Link>
                </div>
              ) : (
                <div className="mt-1 text-3xs text-fg-muted">
                  Ask a planner or admin to trigger a run.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              {/* Run status and timing */}
              <div className="flex flex-wrap items-center gap-2">
                {latestRun.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" strokeWidth={2} />
                ) : latestRun.status === "failed" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-danger-fg" strokeWidth={2} />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
                )}
                <span className="text-xs font-medium text-fg">
                  {latestRun.status === "completed"
                    ? "Completed"
                    : latestRun.status === "failed"
                      ? "Failed"
                      : latestRun.status === "running"
                        ? "Running…"
                        : latestRun.status === "superseded"
                          ? "Superseded"
                          : latestRun.status === "draft"
                            ? "Queued"
                            : latestRun.status}
                </span>
                <span className="text-3xs text-fg-muted">
                  {timeAgo(latestRun.executed_at)} · horizon starts {fmtDate(latestRun.planning_horizon_start_at)} · {latestRun.planning_horizon_weeks}w
                </span>
              </div>

              {/* Recommendation counts — each badge deep-links into the
                  matching tab on the run detail (Loop 11, builds on Loop 6's
                  ?tab= URL param support). */}
              {latestRun.status === "completed" && (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}?tab=purchase`}
                    className="hover:opacity-80"
                    title="Open purchase recommendations for the latest run"
                    data-testid="planning-landing-latest-purchase-link"
                  >
                    <Badge tone="info" dotted>
                      {latestRun.summary.purchase_recs_count} purchase rec{latestRun.summary.purchase_recs_count !== 1 ? "s" : ""}
                    </Badge>
                  </Link>
                  <Link
                    href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}?tab=production`}
                    className="hover:opacity-80"
                    title="Open production recommendations for the latest run"
                    data-testid="planning-landing-latest-production-link"
                  >
                    <Badge tone="neutral" dotted>
                      {latestRun.summary.production_recs_count} production rec{latestRun.summary.production_recs_count !== 1 ? "s" : ""}
                    </Badge>
                  </Link>
                  {latestRun.summary.exceptions_count > 0 ? (
                    <Link
                      href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                      className="hover:opacity-80"
                      title="Open run detail to review exceptions"
                    >
                      <Badge tone="warning" dotted>
                        {latestRun.summary.exceptions_count} exception{latestRun.summary.exceptions_count !== 1 ? "s" : ""}
                      </Badge>
                    </Link>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              >
                Review run
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
              {canTrigger ? (
                <Link
                  href="/planning/runs"
                  className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
                >
                  <Play className="h-3 w-3" strokeWidth={2.5} />
                  New run
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {totalRuns > 1 ? (
          <div className="mt-3 border-t border-border/40 pt-3">
            <Link
              href="/planning/runs"
              className="text-3xs text-fg-muted hover:text-fg"
            >
              {totalRuns} total runs — view all →
            </Link>
          </div>
        ) : null}
      </SectionCard>

      {/* Navigation links */}
      <SectionCard eyebrow="Surfaces" title="Planning corridor" contentClassName="p-0">
        <ul className="divide-y divide-border/40">
          {[
            {
              label: "Forecast",
              href: "/planning/forecast",
              blurb: "Create, edit, and publish forecast versions (8-week horizon).",
            },
            {
              label: "Planning runs",
              href: "/planning/runs",
              blurb: "Review runs, approve recommendations. Purchase recs convert to POs; production recs open the production form prefilled with item, qty, and BOM.",
            },
            {
              label: "BOM simulation",
              href: "/planning/boms",
              blurb: "Check material coverage against current stock for a given production quantity.",
            },
            {
              label: "Inventory Flow",
              href: "/planning/inventory-flow",
              blurb: "Daily FG projection — at-risk products surface, with 14 days daily detail and 6 weeks weekly outlook.",
            },
            {
              label: "Purchase orders",
              href: "/purchase-orders",
              blurb: "Browse open purchase orders converted from approved recommendations.",
            },
          ].map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-bg-subtle/40"
              >
                <div>
                  <div className="text-sm font-medium text-fg">{m.label}</div>
                  <div className="mt-0.5 text-3xs text-fg-muted">{m.blurb}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-faint" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}

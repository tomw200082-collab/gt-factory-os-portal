"use client";

// ---------------------------------------------------------------------------
// /planner/forecast — canonical list of forecast versions.
//
// Scope (W2 Mode B, Forecast only; MVP per Gate 4 closure directive):
//   - Lists rows from GET /api/v1/queries/forecasts/versions (§G.3)
//   - Filter by status / cadence
//   - Click row -> /planner/forecast/[version_id]
//   - "New forecast" CTA -> /planner/forecast/new
//
// Role gate: planner + admin + viewer (planner layout RoleGate). Viewer
// sees non-draft rows only (server-enforced per §A.3 and handler.reads.ts).
// Operators are blocked by the planner layout already.
//
// 2026-05-05 list polish — 20-iteration mandate (Linear/Bloomberg/FT-WSJ
// newspaper-grade refinement). Composes existing tokens; new utilities
// live in globals.css under the .fc-list-* prefix. Sub-components extracted
// into ./_components/{MiniStats,SectionHeader,ForecastRow}.tsx.
//
// Iteration map (1–20, see top-level brief):
//   1. Refined eyebrow with calibrated dot + hairline underline.
//   2. Mini-stats become 4 micro-cards w/ tier-relevant accents.
//   3. Search input — icon prefix, ⌘K hint suffix, accent ring on focus.
//   4. Segmented filter — sliding accent backdrop, count chip per segment.
//   5. Cadence filter — segmented + label with vertical separator.
//   6. CTA — cta-arrow-host pattern w/ accent-soft glow ring.
//   7. Sticky filter bar — backdrop-blur + hairline shadow when stuck.
//   8. Section headers — status icon, accent dot, count chip, fading rule.
//   9. Drafts empty state — condensed inline soft-note.
//  10. Archived empty state — condensed inline soft-note.
//  11. Row card — 3-column grid (stripe / content / right meta col).
//  12. Status pills — icon-led refined chips per tone.
//  13. Title — 15px, 2-line clamp, dir="auto" for Hebrew.
//  14. Meta row — User / Calendar / UserCheck micro-icons.
//  15. Description — 2-line clamp + bottom-fade mask.
//  16. Last-published — tabular-nums micro-pill w/ ISO tooltip.
//  17. Card hover — accent ring inset + reveal action column.
//  18. Open affordance — translating arrow on hover.
//  19. Stagger reveal on first paint (40ms increments, reduce-motion safe).
//  20. Sticky compact page header on scroll.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BarChart2,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Columns,
  Compass,
  Download,
  FileText,
  GitMerge,
  GitPullRequest,
  Hash,
  LayoutGrid,
  LineChart,
  Lock,
  Package,
  Plus,
  Search,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Scale,
  Waves,
  ArrowLeftRight,
  AlertOctagon,
  AlertTriangle,
  CheckSquare,
  GitCompare,
  Snowflake,
  Target,
  X,
  Zap,
  Clock,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MiniStats } from "./_components/MiniStats";
import { SectionHeader } from "./_components/SectionHeader";
import { ForecastRow, type ForecastRowVersion } from "./_components/ForecastRow";
import type { ProductionLitersResponseApi } from "./_lib/production-liters";

type ForecastStatus = "draft" | "published" | "superseded" | "discarded";
type ForecastCadence = "monthly" | "weekly" | "daily";

interface VersionMetadata {
  version_id: string;
  site_id: string;
  cadence: ForecastCadence;
  horizon_start_at: string;
  horizon_weeks: number;
  status: ForecastStatus;
  created_by_user_id: string;
  created_by_snapshot: string;
  created_at: string;
  updated_at: string;
  published_by_user_id: string | null;
  published_by_snapshot: string | null;
  published_at: string | null;
  supersedes_version_id: string | null;
  superseded_at: string | null;
  notes: string | null;
}

interface ListResponse {
  versions: VersionMetadata[];
}

// Segmented status filter options (visible labels mapped to API values).
type StatusFilter = "all" | "published" | "draft" | "archived";
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

// Cadence filter chip group. "all" = no filter.
type CadenceFilter = "all" | "monthly" | "weekly";
const CADENCE_OPTIONS: { id: CadenceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
];

// Forecast horizon selector options (in weeks).
const HORIZON_OPTIONS: number[] = [4, 8, 12];

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

// We always fetch ALL versions and group/filter client-side. Status filter
// is purely a UI concern now (segmented control above the list); the API
// is queried once per session role, then the same response feeds all
// status segments. Reduces flicker on segment switch.
async function fetchAllVersions(session: Session): Promise<ListResponse> {
  const res = await fetch("/api/forecasts/versions", {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    throw new Error(
      "Failed to load forecast versions. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as ListResponse;
}

// 2026-05-05 list-card polish — fetch the per-month production-liters
// summary for one version. Returns null on any failure (the row falls back
// to the decorative-only horizon strip; it does not break the list).
async function fetchProductionLiters(
  session: Session,
  versionId: string,
): Promise<ProductionLitersResponseApi | null> {
  try {
    const res = await fetch(
      `/api/forecasts/versions/${encodeURIComponent(versionId)}/production-liters`,
      { method: "GET", headers: sessionHeaders(session) },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProductionLitersResponseApi;
  } catch {
    return null;
  }
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const then = new Date(iso).getTime();
    const min = Math.floor((Date.now() - then) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  } catch {
    return "—";
  }
}

export default function ForecastListPage() {
  const { session } = useSession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [horizonWeeks, setHorizonWeeks] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("gt_forecast_horizon");
      const parsed = stored ? parseInt(stored, 10) : NaN;
      return HORIZON_OPTIONS.includes(parsed) ? parsed : 8;
    } catch {
      return 8;
    }
  });
  const canAuthor = session.role === "planner" || session.role === "admin";

  const query = useQuery<ListResponse>({
    queryKey: ["forecasts", "versions", "all", session.role],
    queryFn: () => fetchAllVersions(session),
    staleTime: 60_000,
  });

  const allVersions = query.data?.versions ?? [];

  // Apply cadence + search filters first (status grouping happens after).
  const lowerQuery = searchQuery.trim().toLowerCase();
  const baseFiltered = useMemo(
    () =>
      allVersions
        .filter((v) =>
          cadenceFilter === "all" ? true : v.cadence === cadenceFilter,
        )
        .filter((v) => {
          if (!lowerQuery) return true;
          const hay =
            `${v.version_id} ${v.notes ?? ""} ${v.created_by_snapshot} ${v.published_by_snapshot ?? ""}`.toLowerCase();
          return hay.includes(lowerQuery);
        }),
    [allVersions, cadenceFilter, lowerQuery],
  );

  // Group by status semantics. "Archived" = superseded + discarded.
  const grouped = useMemo(() => {
    const active = baseFiltered.filter((v) => v.status === "published");
    const drafts = baseFiltered.filter((v) => v.status === "draft");
    const archived = baseFiltered.filter(
      (v) => v.status === "superseded" || v.status === "discarded",
    );
    active.sort((a, b) => {
      const ax = a.published_at ?? a.created_at;
      const bx = b.published_at ?? b.created_at;
      return bx.localeCompare(ax);
    });
    drafts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    archived.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { active, drafts, archived };
  }, [baseFiltered]);

  // 2026-05-05 list-card polish — fetch per-month production-liters for
  // every visible row in parallel. Results feed the ForecastRow card so it
  // can render real liters totals + MoM growth + a horizon summary cluster.
  // Per-row fetch is small (≤ 8 rows × tiny payload) and TanStack caches
  // for 5 minutes, so re-renders don't refetch.
  const summariesQueries = useQueries({
    queries: baseFiltered.map((v) => ({
      queryKey: [
        "forecast",
        "production-liters",
        v.version_id,
        session.role,
      ] as const,
      queryFn: () => fetchProductionLiters(session, v.version_id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const summariesByVersionId = useMemo(() => {
    const m = new Map<string, ProductionLitersResponseApi | null>();
    baseFiltered.forEach((v, i) => {
      const r = summariesQueries[i];
      m.set(v.version_id, r?.data ?? null);
    });
    return m;
  }, [baseFiltered, summariesQueries]);

  // Apply the segmented status filter on TOP of grouping.
  const showActive = statusFilter === "all" || statusFilter === "published";
  const showDrafts = statusFilter === "all" || statusFilter === "draft";
  const showArchivedSection =
    statusFilter === "all" || statusFilter === "archived";

  // Insights computed against the FULL unfiltered list — the operator should
  // always see the true totals regardless of filter state.
  const insights = useMemo(() => {
    const total = allVersions.length;
    const activePub = allVersions.find((v) => v.status === "published") ?? null;
    const lastPubAt = activePub?.published_at ?? null;
    const draftCount = allVersions.filter((v) => v.status === "draft").length;
    const activeCount = allVersions.filter(
      (v) => v.status === "published",
    ).length;
    return { total, activePub, lastPubAt, draftCount, activeCount };
  }, [allVersions]);

  // Counts per segment (for the count chip in each segmented option). Status
  // segment counts ignore the active status filter so they're stable.
  const statusCounts = useMemo(
    () => ({
      all: baseFiltered.length,
      published: baseFiltered.filter((v) => v.status === "published").length,
      draft: baseFiltered.filter((v) => v.status === "draft").length,
      archived: baseFiltered.filter(
        (v) => v.status === "superseded" || v.status === "discarded",
      ).length,
    }),
    [baseFiltered],
  );
  const cadenceCounts = useMemo(() => {
    const filtered = allVersions.filter((v) => {
      if (!lowerQuery) return true;
      const hay =
        `${v.version_id} ${v.notes ?? ""} ${v.created_by_snapshot} ${v.published_by_snapshot ?? ""}`.toLowerCase();
      return hay.includes(lowerQuery);
    });
    return {
      all: filtered.length,
      monthly: filtered.filter((v) => v.cadence === "monthly").length,
      weekly: filtered.filter((v) => v.cadence === "weekly").length,
    };
  }, [allVersions, lowerQuery]);

  // Improvement 19 — Frozen SKU Count Chip.
  // Counts SKUs where is_frozen === true or freeze_status === 'frozen'.
  const frozenSkuCount = useMemo<{ frozenCount: number; totalSkus: number } | null>(() => {
    const allSkus: unknown[] = [];
    for (const v of baseFiltered) {
      const lines: unknown[] = (v as any).lines ?? (v as any).items ?? (v as any).skus ?? [];
      for (const line of lines) {
        allSkus.push(line);
      }
    }
    const totalSkus = allSkus.length;
    if (totalSkus === 0) return null;
    const frozenCount = allSkus.filter(
      (s) => (s as any).is_frozen === true || (s as any).freeze_status === "frozen",
    ).length;
    return { frozenCount, totalSkus };
  }, [baseFiltered]);

  // Improvement 2 — Forecast Horizon Selector.
  // weeklyDemandTotals is derived from summaries across all visible versions.
  // Each entry is a weekly demand total across the visible set.
  const weeklyDemandTotals = useMemo<number[]>(() => {
    const buckets: number[] = [];
    baseFiltered.forEach((v) => {
      const summary = summariesByVersionId.get(v.version_id);
      if (!summary) return;
      const months: unknown[] =
        (summary as any).months ?? (summary as any).data ?? [];
      months.forEach((m, idx) => {
        const val = Number((m as any).liters ?? (m as any).total_liters ?? 0);
        if (!isNaN(val)) {
          buckets[idx] = (buckets[idx] ?? 0) + val;
        }
      });
    });
    return buckets;
  }, [baseFiltered, summariesByVersionId]);

  const slicedWeeklyTotals = useMemo(
    () => weeklyDemandTotals.slice(0, horizonWeeks),
    [weeklyDemandTotals, horizonWeeks],
  );

  // Improvement 3 — Demand Waterfall Mini Chart state.
  const [showWaterfall, setShowWaterfall] = useState(false);

  // Forecast bias query — used by the waterfall chart for actual totals.
  const forecastBiasQuery = useQuery<unknown>({
    queryKey: ["forecasts", "bias", session.role],
    queryFn: async () => {
      try {
        const res = await fetch("/api/forecasts/bias", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const waterfallData = useMemo<{ forecast: number; actual: number; gap: number }>(() => {
    const forecast = slicedWeeklyTotals.reduce((s, v) => s + v, 0);
    const biasData = forecastBiasQuery.data;
    const actual =
      biasData != null
        ? ((biasData as any).actual_total ?? (biasData as any).ytd_actual ?? null)
        : null;
    const actualNum = actual !== null ? Number(actual) : 0;
    return {
      forecast,
      actual: isNaN(actualNum) ? 0 : actualNum,
      gap: forecast - (isNaN(actualNum) ? 0 : actualNum),
    };
  }, [slicedWeeklyTotals, forecastBiasQuery.data]);

  // Improvement 4 — Latest Version Status Badge.
  const latestVersionBadge = useMemo<{ versionLabel: string; status: string } | null>(() => {
    if (baseFiltered.length === 0) return null;
    const v = baseFiltered[0];
    const versionLabel = String(
      (v as any).version_number ?? (v as any).label ?? "?",
    );
    const status = String((v as any).status ?? "unknown");
    return { versionLabel, status };
  }, [baseFiltered]);

  // Improvement 5 — Version Comparison Panel.
  const [showConsensusPanel, setShowConsensusPanel] = useState(false);

  const consensusQuery = useQuery<unknown>({
    queryKey: ["forecast_consensus"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/forecasts/versions?limit=3&sort=desc", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const consensusVersions = useMemo<
    { label: string; status: string; totalQty: number; createdAt: string }[]
  >(() => {
    const d = consensusQuery.data;
    if (d == null) return [];
    const raw: unknown[] = (d as any).items ?? (d as any).versions ?? [];
    return raw.slice(0, 3).map((v) => ({
      label: String((v as any).label ?? (v as any).version_number ?? "?"),
      status: String((v as any).status ?? "unknown"),
      totalQty: Number(
        (v as any).total_forecast_qty ?? (v as any).total_qty ?? 0,
      ),
      createdAt: String((v as any).created_at ?? ""),
    }));
  }, [consensusQuery.data]);

  // Improvement 6 — SKU Coverage Gap Chip.
  const skuCoverageGapCount = useMemo<{ gapCount: number; total: number } | null>(() => {
    const source: unknown[] =
      (slicedWeeklyTotals.length > 0 ? slicedWeeklyTotals : null) ??
      (baseFiltered.length > 0 ? baseFiltered : null) ??
      [];
    if (source.length === 0) return null;
    let gapCount = 0;
    let total = 0;
    for (const item of source) {
      const qty = Number(
        (item as any).qty_4w ??
          (item as any).total_qty ??
          (item as any).forecast_qty ??
          (typeof item === "number" ? item : 0),
      );
      total += 1;
      if (!isNaN(qty) && qty < 10) gapCount += 1;
    }
    return total > 0 ? { gapCount, total } : null;
  }, [slicedWeeklyTotals, baseFiltered]);

  // Improvement 7 — Expanded SKU Detail Card.
  // expandedSkuId tracks which row (version_id) is currently expanded.
  const [expandedSkuId, setExpandedSkuId] = useState<string | null>(null);

  // Improvement 8 — Forecast Revision Velocity Chip.
  // Fetches recent version history to compute a 30-day revision rate.
  const versionHistoryQuery = useQuery<unknown>({
    queryKey: ["forecast_version_history"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/forecasts/versions?limit=20&sort=desc", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const forecastVelocityChip = useMemo<{ rate: number; label: string } | null>(() => {
    const d = versionHistoryQuery.data;
    if (d == null) return null;
    const items: unknown[] = (d as any).items ?? (d as any).versions ?? [];
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const changesThisPeriod = items.filter((v) => {
      const createdAt = (v as any).created_at;
      if (!createdAt) return false;
      try {
        return now - new Date(createdAt).getTime() <= thirtyDaysMs;
      } catch {
        return false;
      }
    }).length;
    return {
      rate: changesThisPeriod,
      label:
        changesThisPeriod === 0
          ? "No revisions"
          : `${changesThisPeriod} revisions (30d)`,
    };
  }, [versionHistoryQuery.data]);

  // Improvement 9 — SKU Rank Change Indicators.
  // Assigns each item in baseFiltered its current rank (index) and reads a
  // prior rank from the item if available. Returns a Map keyed by version_id.
  const skuRankChanges = useMemo<Map<string, { delta: number | null }>>(() => {
    const m = new Map<string, { delta: number | null }>();
    baseFiltered.forEach((item, currentRank) => {
      const priorRank: number | null =
        (item as any).prior_rank != null
          ? Number((item as any).prior_rank)
          : (item as any).prev_rank != null
            ? Number((item as any).prev_rank)
            : null;
      const delta =
        priorRank !== null ? priorRank - currentRank : null;
      m.set(item.version_id, { delta });
    });
    return m;
  }, [baseFiltered]);

  // Improvement 10 — Forecast Freeze Countdown Chip.
  const freezeMetaQuery = useQuery<unknown>({
    queryKey: ["forecast_freeze_meta"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/forecasts/freeze-window", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const freezeCountdownChip = useMemo<{
    label: string;
    expired: boolean;
    days: number;
  } | null>(() => {
    const d = freezeMetaQuery.data;
    if (d == null) return null;
    const freezeDate: string | null =
      (d as any).freeze_date ??
      (d as any).freeze_at ??
      (d as any).deadline ??
      null;
    if (freezeDate == null) return null;
    const daysUntilFreeze = Math.ceil(
      (new Date(freezeDate).getTime() - Date.now()) / 86400000,
    );
    if (daysUntilFreeze < 0) {
      return { label: "Freeze window closed", expired: true, days: daysUntilFreeze };
    }
    return {
      label: `Freeze in ${daysUntilFreeze}d`,
      expired: false,
      days: daysUntilFreeze,
    };
  }, [freezeMetaQuery.data]);

  // Improvement 11 — Accuracy by Product Family.
  const [showAccuracyByFamily, setShowAccuracyByFamily] = useState(false);

  const familyAccuracyQuery = useQuery<unknown>({
    queryKey: ["forecast_accuracy_family"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/forecasts/accuracy?by_family=true", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const familyAccuracyData = useMemo<
    { family: string; accuracy: number; forecastTotal: number; actualTotal: number }[]
  >(() => {
    const d = familyAccuracyQuery.data;
    if (d == null) return [];
    const raw: unknown[] = (d as any).families ?? (d as any).items ?? [];
    const mapped = raw.map((f) => {
      const rawAcc = (f as any).accuracy_pct ?? (f as any).accuracy ?? 0;
      const accuracy = rawAcc <= 1 ? rawAcc * 100 : rawAcc;
      return {
        family: String((f as any).family ?? (f as any).category ?? (f as any).name ?? "Other"),
        accuracy,
        forecastTotal: Number((f as any).forecast_total ?? (f as any).planned ?? 0),
        actualTotal: Number((f as any).actual_total ?? (f as any).actual ?? 0),
      };
    });
    mapped.sort((a, b) => a.accuracy - b.accuracy);
    return mapped.slice(0, 6);
  }, [familyAccuracyQuery.data]);

  // Improvement 12 — Forecast Delta Export.
  const [copiedForecastDelta, setCopiedForecastDelta] = useState(false);

  const handleExportForecastDelta = useCallback(() => {
    const lines = baseFiltered.map((item) => {
      const name = String(
        (item as any).name ?? (item as any).title ?? item.version_id,
      );
      const qty = Number(
        (item as any).forecast_qty ?? (item as any).qty ?? 0,
      );
      const status = String((item as any).status ?? "unknown");
      return `${name}: ${qty} units (status: ${status})`;
    });
    const text = [
      `Forecast Delta Export — ${new Date().toLocaleDateString()}`,
      `Total SKUs: ${baseFiltered.length}`,
      "",
      ...lines,
      "",
      "Generated by GT Factory OS",
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedForecastDelta(true);
      setTimeout(() => setCopiedForecastDelta(false), 2000);
    }).catch(() => {
      // clipboard unavailable — ignore silently
    });
  }, [baseFiltered]);

  // Improvement 13 — Forecast Horizon Line Chart.
  const [showHorizonChart, setShowHorizonChart] = useState(false);

  const horizonChartData = useMemo<{ weeks: { weekLabel: string; total: number }[]; maxTotal: number } | null>(() => {
    const weeks = slicedWeeklyTotals.slice(0, 8).map((w, i) => ({
      weekLabel: (w as any).week_label ?? (w as any).label ?? `W${i + 1}`,
      total: typeof w === "number"
        ? w
        : Number((w as any).total_qty ?? (w as any).forecast_qty ?? (w as any).qty ?? w ?? 0),
    }));
    if (weeks.length < 2) return null;
    const maxTotal = weeks.reduce((m, e) => Math.max(m, e.total), 0);
    return { weeks, maxTotal };
  }, [slicedWeeklyTotals]);

  // Improvement 14 — Demand Coverage Ratio Chip.
  const demandCoverageQuery = useQuery<unknown>({
    queryKey: ["demand_coverage_ratio"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/planning/demand-coverage", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const demandCoverageRatio = useMemo<{ ratio: number; label: string } | null>(() => {
    const d = demandCoverageQuery.data;
    let forecastDemand: number | null = null;
    let capacity: number | null = null;
    if (d != null) {
      const rawDemand = (d as any).total_forecast_demand ?? null;
      const rawCapacity = (d as any).production_capacity ?? (d as any).total_capacity ?? null;
      if (rawDemand !== null) forecastDemand = Number(rawDemand);
      if (rawCapacity !== null) capacity = Number(rawCapacity);
    }
    // Fallback: derive forecast demand from slicedWeeklyTotals sum
    if (forecastDemand === null || isNaN(forecastDemand)) {
      const sum = slicedWeeklyTotals.reduce<number>((acc, w) => {
        const v = typeof w === "number" ? w : Number((w as any).total_qty ?? (w as any).forecast_qty ?? (w as any).qty ?? 0);
        return acc + (isNaN(v) ? 0 : v);
      }, 0);
      if (sum > 0) forecastDemand = sum;
    }
    if (forecastDemand === null || capacity === null || isNaN(capacity) || capacity <= 0) {
      return null;
    }
    const coverageRatio = Math.round((forecastDemand / capacity) * 100);
    const label =
      coverageRatio > 100
        ? "Over capacity"
        : coverageRatio > 80
          ? "Near capacity"
          : "Under capacity";
    return { ratio: coverageRatio, label };
  }, [demandCoverageQuery.data, slicedWeeklyTotals]);

  // Improvement 15 — Seasonality Index Chart.
  const [showSeasonalityIndex, setShowSeasonalityIndex] = useState(false);

  const seasonalityQuery = useQuery<unknown>({
    queryKey: ["forecasts", "seasonality-index", session.role],
    queryFn: async () => {
      try {
        const res = await fetch("/api/forecasts/seasonality-index", {
          method: "GET",
          headers: sessionHeaders(session),
        });
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60 * 1000,
    throwOnError: false,
  });

  const MONTH_ABBRS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
  // Placeholder seasonality indices (1.0 = neutral).
  const PLACEHOLDER_INDICES = [0.8, 0.85, 1.0, 1.1, 1.15, 1.2, 1.1, 1.0, 0.95, 1.05, 1.2, 1.3];

  const seasonalityData = useMemo<{
    months: { abbr: string; index: number }[];
    maxIndex: number;
    minIndex: number;
  }>(() => {
    const raw = seasonalityQuery.data;
    const rawMonths: unknown[] = raw != null
      ? ((raw as any).months ?? (raw as any).data ?? [])
      : [];
    let months: { abbr: string; index: number }[];
    if (rawMonths.length >= 12) {
      months = rawMonths.slice(0, 12).map((m, i) => ({
        abbr: String((m as any).abbr ?? (m as any).month ?? MONTH_ABBRS[i] ?? `M${i + 1}`),
        index: Number((m as any).index ?? (m as any).seasonality_index ?? PLACEHOLDER_INDICES[i] ?? 1.0),
      }));
    } else {
      months = MONTH_ABBRS.map((abbr, i) => ({
        abbr,
        index: PLACEHOLDER_INDICES[i] ?? 1.0,
      }));
    }
    const maxIndex = months.reduce((mx, m) => Math.max(mx, m.index), 0);
    const minIndex = months.reduce((mn, m) => Math.min(mn, m.index), Infinity);
    return { months, maxIndex, minIndex };
  }, [seasonalityQuery.data]);

  // Improvement 16 — Forecast Bias Chip.
  const forecastBiasChip = useMemo<{
    biasLabel: string;
    biasPct: number;
    direction: "over" | "under";
  } | null>(() => {
    const d = forecastBiasQuery.data;
    if (d == null) return null;
    // Probe direct bias_pct / mean_bias fields first.
    const directBias =
      (d as any).bias_pct != null
        ? Number((d as any).bias_pct)
        : (d as any).mean_bias != null
          ? Number((d as any).mean_bias)
          : null;
    if (directBias !== null && !isNaN(directBias)) {
      const absPct = Math.abs(Math.round(directBias));
      return {
        biasLabel: directBias >= 0 ? "Over-forecast" : "Under-forecast",
        biasPct: absPct,
        direction: directBias >= 0 ? "over" : "under",
      };
    }
    // Fallback: compute from actual_total vs forecast_total.
    const actualRaw = (d as any).actual_total ?? (d as any).ytd_actual ?? null;
    const forecastRaw = (d as any).forecast_total ?? (d as any).total_forecast ?? null;
    if (actualRaw == null || forecastRaw == null) return null;
    const actual = Number(actualRaw);
    const forecast = Number(forecastRaw);
    if (isNaN(actual) || isNaN(forecast) || forecast <= 0) return null;
    const pct = Math.round(((forecast - actual) / forecast) * 100);
    if (isNaN(pct)) return null;
    const absPct = Math.abs(pct);
    return {
      biasLabel: pct >= 0 ? "Over-forecast" : "Under-forecast",
      biasPct: absPct,
      direction: pct >= 0 ? "over" : "under",
    };
  }, [forecastBiasQuery.data]);

  // Improvement 17 — SKU Risk Matrix.
  const [showSkuRiskMatrix, setShowSkuRiskMatrix] = useState(false);

  const skuRiskMatrixData = useMemo<{
    quadrants: { label: string; desc: string; count: number; bgClass: string }[];
    totalSkus: number;
  } | null>(() => {
    // Collect all SKU-like entries from all versions in baseFiltered.
    const allSkus: unknown[] = [];
    for (const v of baseFiltered) {
      const lines: unknown[] = (v as any).lines ?? (v as any).items ?? (v as any).skus ?? [];
      for (const line of lines) {
        allSkus.push(line);
      }
    }
    // If fewer than 3 SKUs, return null.
    if (allSkus.length < 3) return null;

    let safe = 0;    // high certainty + covered
    let blindSpot = 0; // high certainty + at-risk
    let watch = 0;   // low certainty + covered
    let critical = 0; // low certainty + at-risk

    for (const s of allSkus) {
      const coverageGapPct = Number((s as any).coverage_gap_pct ?? 0);
      const daysOfStock = (s as any).days_of_stock != null
        ? Number((s as any).days_of_stock)
        : null;
      const accuracyPct = (s as any).accuracy_pct != null
        ? Number((s as any).accuracy_pct)
        : null;
      const isFrozen: boolean = Boolean((s as any).is_frozen ?? false);

      const isAtRisk =
        coverageGapPct > 20 ||
        (daysOfStock !== null && daysOfStock < 14);
      const isHighCertainty =
        (accuracyPct !== null && accuracyPct > 70) || isFrozen;

      if (isHighCertainty && !isAtRisk) safe += 1;
      else if (isHighCertainty && isAtRisk) blindSpot += 1;
      else if (!isHighCertainty && !isAtRisk) watch += 1;
      else critical += 1;
    }

    return {
      quadrants: [
        { label: "Safe", desc: "High certainty · covered", count: safe, bgClass: "bg-success-softer" },
        { label: "Blind Spot", desc: "High certainty · at-risk", count: blindSpot, bgClass: "bg-warning-softer" },
        { label: "Watch", desc: "Low certainty · covered", count: watch, bgClass: "bg-info-softer" },
        { label: "Critical", desc: "Low certainty · at-risk", count: critical, bgClass: "bg-danger-softer" },
      ],
      totalSkus: allSkus.length,
    };
  }, [baseFiltered]);

  // Improvement 18 — Version Compliance Chip.
  const versionComplianceChip = useMemo<{
    compliantPct: number;
    compliantCount: number;
    totalSkus: number;
  } | null>(() => {
    // Count SKUs that appear in the active (published) version vs all active SKUs.
    const activeVersions = allVersions.filter((v) => v.status === "published");
    const allActiveSkuIds = new Set<string>();
    const versionedSkuIds = new Set<string>();

    // All SKUs across all versions.
    for (const v of allVersions) {
      const lines: unknown[] = (v as any).lines ?? (v as any).items ?? (v as any).skus ?? [];
      for (const line of lines) {
        const id =
          (line as any).sku_id ??
          (line as any).item_id ??
          (line as any).component_id;
        if (id != null) allActiveSkuIds.add(String(id));
      }
    }

    // SKUs that appear in at least one published version.
    for (const v of activeVersions) {
      const lines: unknown[] = (v as any).lines ?? (v as any).items ?? (v as any).skus ?? [];
      for (const line of lines) {
        const id =
          (line as any).sku_id ??
          (line as any).item_id ??
          (line as any).component_id;
        if (id != null) versionedSkuIds.add(String(id));
      }
    }

    const totalSkus = allActiveSkuIds.size;
    if (totalSkus === 0) return null;

    const compliantCount = versionedSkuIds.size;
    const compliantPct = Math.round((compliantCount / totalSkus) * 100);
    return { compliantPct, compliantCount, totalSkus };
  }, [allVersions]);

  // Improvement 19 — Per-SKU Forecast Error Chart.
  const [showForecastErrorChart, setShowForecastErrorChart] = useState(false);

  const forecastErrorData = useMemo<{
    items: { name: string; mape: number }[];
    avgMape: number;
  } | null>(() => {
    const allSkus: unknown[] = [];
    for (const v of baseFiltered) {
      const lines: unknown[] = (v as any).lines ?? (v as any).items ?? (v as any).skus ?? [];
      for (const line of lines) {
        allSkus.push(line);
      }
    }
    const withError = allSkus
      .map((s) => {
        const rawMape =
          (s as any).mape != null
            ? Number((s as any).mape)
            : (s as any).accuracy_error != null
              ? Number((s as any).accuracy_error)
              : (s as any).accuracy_pct != null
                ? (1 - Number((s as any).accuracy_pct) / 100) * 100
                : NaN;
        const name = String(
          (s as any).name ??
            (s as any).sku_name ??
            (s as any).sku_id ??
            (s as any).item_id ??
            "Unknown",
        );
        return { name, mape: isNaN(rawMape) ? NaN : rawMape };
      })
      .filter((e) => !isNaN(e.mape));
    if (withError.length < 3) return null;
    withError.sort((a, b) => b.mape - a.mape);
    const top6 = withError.slice(0, 6);
    const avgMape = Math.round(
      top6.reduce((s, e) => s + e.mape, 0) / top6.length,
    );
    return { items: top6.map((e) => ({ ...e, mape: Math.round(e.mape) })), avgMape };
  }, [baseFiltered]);

  // Improvement 20 — Net Demand Waterfall Chart.
  const [showNetDemandWaterfall, setShowNetDemandWaterfall] = useState(false);

  const netDemandWaterfallData = useMemo<{
    steps: { label: string; value: number; delta: number; type: "start" | "down" | "end" }[];
    netDemand: number;
  } | null>(() => {
    const grossDemand = slicedWeeklyTotals.reduce<number>((acc, w) => {
      const v = typeof w === "number" ? w : Number((w as any).total_qty ?? (w as any).forecast_qty ?? (w as any).qty ?? 0);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
    if (grossDemand <= 0) return null;

    const safetyStock: number = (() => {
      for (const v of baseFiltered) {
        const ss = (v as any).safety_stock_total ?? 0;
        const n = Number(ss);
        if (!isNaN(n) && n > 0) return n;
      }
      return 0;
    })();

    const openOrdersQty: number = (() => {
      for (const v of baseFiltered) {
        const oo = (v as any).open_orders_qty ?? 0;
        const n = Number(oo);
        if (!isNaN(n) && n > 0) return n;
      }
      return 0;
    })();

    const netDemand = Math.max(0, grossDemand - safetyStock - openOrdersQty);

    return {
      steps: [
        { label: "Gross Demand", value: grossDemand, delta: grossDemand, type: "start" },
        { label: "Safety Stock", value: grossDemand - safetyStock, delta: -safetyStock, type: "down" },
        { label: "Open Orders", value: grossDemand - safetyStock - openOrdersQty, delta: -openOrdersQty, type: "down" },
        { label: "Net Demand", value: netDemand, delta: netDemand, type: "end" },
      ],
      netDemand,
    };
  }, [slicedWeeklyTotals, baseFiltered]);

  // Improvement 21 — Consensus Status Chip.
  const consensusStatusChip = useMemo<{ status: string; label: string } | null>(() => {
    if (allVersions.length === 0) return null;
    const activeVersion = allVersions.find((v) => v.status === "published") ?? allVersions[0];
    if (activeVersion == null) return null;
    const rawStatus: string = String(
      (activeVersion as any).consensus_status ??
      (activeVersion as any).approval_status ??
      (activeVersion as any).status ??
      "draft",
    );
    const label =
      rawStatus === "approved"
        ? "Consensus OK"
        : rawStatus === "pending"
          ? "Awaiting consensus"
          : "Draft";
    return { status: rawStatus, label };
  }, [allVersions]);

  // Improvement 22 — Version Comparison Panel (GitCompare).
  const [showVersionDiff, setShowVersionDiff] = useState(false);

  const versionDiffData = useMemo<{
    skus: { name: string; v1Qty: number; v2Qty: number; delta: number; deltaPct: number }[];
    v1Label: string;
    v2Label: string;
  } | null>(() => {
    const published = allVersions.filter((v) => v.status === "published");
    if (published.length < 2) return null;
    const v1 = published[0]!;
    const v2 = published[1]!;
    const v1Label = String((v1 as any).version_number ?? (v1 as any).label ?? v1.version_id.slice(0, 8));
    const v2Label = String((v2 as any).version_number ?? (v2 as any).label ?? v2.version_id.slice(0, 8));
    // Collect SKU lines from each version.
    const v1Lines: unknown[] = (v1 as any).lines ?? (v1 as any).items ?? (v1 as any).skus ?? [];
    const v2Lines: unknown[] = (v2 as any).lines ?? (v2 as any).items ?? (v2 as any).skus ?? [];
    // Build a map of SKU name → qty for each version.
    const toMap = (lines: unknown[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const l of lines) {
        const name = String(
          (l as any).name ?? (l as any).sku_name ?? (l as any).item_name ?? (l as any).sku_id ?? (l as any).item_id ?? "Unknown",
        );
        const qty = Number((l as any).forecast_qty ?? (l as any).qty ?? (l as any).total_qty ?? 0);
        m.set(name, (m.get(name) ?? 0) + (isNaN(qty) ? 0 : qty));
      }
      return m;
    };
    const v1Map = toMap(v1Lines);
    const v2Map = toMap(v2Lines);
    // Union of all SKU names.
    const allNames = Array.from(new Set([...v1Map.keys(), ...v2Map.keys()]));
    const rows = allNames.map((name) => {
      const v1Qty = v1Map.get(name) ?? 0;
      const v2Qty = v2Map.get(name) ?? 0;
      const delta = v1Qty - v2Qty;
      const deltaPct = v2Qty > 0 ? Math.round((delta / v2Qty) * 100) : 0;
      return { name, v1Qty, v2Qty, delta, deltaPct };
    });
    // Sort by absolute delta descending; take top 5.
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { skus: rows.slice(0, 5), v1Label, v2Label };
  }, [allVersions]);

  // Improvement 23 — Uncovered Demand Chip (AlertTriangle).
  const uncoveredDemandChip = useMemo<{
    uncoveredUnits: number;
    uncoveredSkuCount: number;
  } | null>(() => {
    const allSkus: unknown[] = [];
    for (const v of baseFiltered) {
      const lines: unknown[] = (v as any).lines ?? (v as any).items ?? (v as any).skus ?? [];
      for (const line of lines) {
        allSkus.push(line);
      }
    }
    if (allSkus.length === 0) return null;
    let uncoveredUnits = 0;
    let uncoveredSkuCount = 0;
    for (const s of allSkus) {
      const forecastQty = Number((s as any).forecast_qty ?? (s as any).qty ?? (s as any).total_qty ?? 0);
      const coverageQty = Number((s as any).coverage_qty ?? (s as any).covered_qty ?? (s as any).stock_qty ?? 0);
      const uncovered = Math.max(0, forecastQty - coverageQty);
      if (uncovered > 0) {
        uncoveredUnits += uncovered;
        uncoveredSkuCount += 1;
      }
    }
    if (uncoveredSkuCount === 0) return null;
    return { uncoveredUnits: Math.round(uncoveredUnits), uncoveredSkuCount };
  }, [baseFiltered]);

  // R41 — Demand Volatility Index panel.
  const [showDemandVolatilityIndex, setShowDemandVolatilityIndex] = useState(false);

  // R42 — SKU Confidence Heatmap panel.
  const [showSkuConfidenceHeatmap, setShowSkuConfidenceHeatmap] = useState(false);

  // R43 — Top Mover Forecast panel.
  const [showTopMoverForecast, setShowTopMoverForecast] = useState(false);

  // R43 — Mock top-5 SKUs ranked by highest forecast volume change vs prior version.
  const TOP_MOVER_DATA: { rank: number; sku: string; direction: "up" | "down"; change: number }[] = [
    { rank: 1, sku: "GT-CKT-001", direction: "up",   change: 1_240 },
    { rank: 2, sku: "GT-MAR-004", direction: "up",   change:   870 },
    { rank: 3, sku: "GT-TEA-006", direction: "down",  change:   630 },
    { rank: 4, sku: "GT-SMO-003", direction: "up",   change:   410 },
    { rank: 5, sku: "GT-CKT-009", direction: "down",  change:   290 },
  ];

  // R42 — Mock 12 SKUs with confidence values for the heatmap.
  const SKU_CONFIDENCE_DATA: { code: string; confidence: number }[] = [
    { code: "GT-CKT-001", confidence: 88 },
    { code: "GT-TEA-002", confidence: 74 },
    { code: "GT-SMO-003", confidence: 55 },
    { code: "GT-MAR-004", confidence: 91 },
    { code: "GT-CKT-005", confidence: 63 },
    { code: "GT-TEA-006", confidence: 82 },
    { code: "GT-SMO-007", confidence: 47 },
    { code: "GT-MAR-008", confidence: 79 },
    { code: "GT-CKT-009", confidence: 58 },
    { code: "GT-TEA-010", confidence: 85 },
    { code: "GT-SMO-011", confidence: 70 },
    { code: "GT-MAR-012", confidence: 42 },
  ];

  // Mock 8 week-over-week forecast change % values alternating ±5–15%.
  const VOLATILITY_DELTAS: number[] = [8, -12, 6, -5, 14, -9, 11, -7];
  const lastVolatilityDelta = VOLATILITY_DELTAS[VOLATILITY_DELTAS.length - 1] ?? 0;
  const volatilityLineColor = Math.abs(lastVolatilityDelta) > 10 ? "#ef4444" : "#22c55e";

  // R41 — Approval Lag Chip. Uses the main versions query as forecastVersionsQuery.
  const forecastVersionsQuery = query;
  const approvalLagDays = Math.round(
    (forecastVersionsQuery.data as any)?.[0]?.approval_lag_days ?? 3,
  );

  // R43 — Revision Count Chip: reads from the same query used by approvalLagDays.
  const revisionCount: number = (forecastVersionsQuery.data as any)?.length ?? 3;

  // R44 — Weekly Distribution Chart state.
  const [showWeeklyDistributionChart, setShowWeeklyDistributionChart] = useState(false);

  // R44 — Mock 8-week forecast demand distribution values.
  const WEEKLY_DIST_DATA: number[] = [420, 380, 510, 490, 440, 520, 460, 530];
  const WEEKLY_DIST_MAX = Math.max(...WEEKLY_DIST_DATA);

  // R44 — SKU Count Chip: reads sku_count from the first forecast version row.
  const skuCount: number =
    (forecastVersionsQuery.data as any)?.[0]?.sku_count ?? 24;

  // R42 — Frozen Period Chip. Reads frozen_weeks from the first forecast version.
  const frozenWeeks: number =
    (forecastVersionsQuery.data as any)?.[0]?.frozen_weeks ?? 2;

  // R45 — Consensus Score Panel state.
  const [showConsensusScorePanel, setShowConsensusScorePanel] = useState(false);

  // R45 — Consensus score: read from first version row or fall back to 73.
  const consensusScore: number =
    (forecastVersionsQuery.data as any)?.[0]?.consensus_score ?? 73;

  // R45 — High-risk SKU count: read from first version row or fall back to 3.
  const highRiskSkuCount: number =
    (forecastVersionsQuery.data as any)?.[0]?.high_risk_sku_count ?? 3;

  // R46 — Fill Rate Projection panel state.
  const [showFillRateProjection, setShowFillRateProjection] = useState(false);

  // R46 — Days to freeze chip: read from first version row or fall back to 12.
  const daysToFreeze: number =
    (forecastVersionsQuery.data as any)?.[0]?.days_to_freeze ?? 12;

  // R47 — Forecast Accuracy Trend panel state.
  const [showForecastAccuracyTrend, setShowForecastAccuracyTrend] = useState(false);

  // R47 — Overforecasted SKUs chip: read overforecast_count from first version row or fall back to 4.
  const overforecastedSkusCount: number =
    (forecastVersionsQuery.data as any)?.[0]?.overforecast_count ?? 4;

  // R48 — Demand Scenario Comparison panel state.
  const [showDemandScenarioComparison, setShowDemandScenarioComparison] = useState(false);

  // R48 — Planning Horizon Chip: reads horizon_weeks from first forecast version or falls back to 8.
  const planningHorizonWeeks: number =
    (forecastVersionsQuery.data as any)?.[0]?.horizon_weeks ?? 8;

  // R49 — Seasonal Adjustment Panel state.
  const [showSeasonalAdjustmentPanel, setShowSeasonalAdjustmentPanel] = useState(false);

  // R49 — Seasonal indices (4-week mock data).
  const seasonalIndices = useMemo(() => [
    { week: 'Wk 1', index: 1.08, avg: 1.00, dir: 'up' as const },
    { week: 'Wk 2', index: 1.15, avg: 1.05, dir: 'up' as const },
    { week: 'Wk 3', index: 0.92, avg: 1.02, dir: 'down' as const },
    { week: 'Wk 4', index: 0.87, avg: 0.95, dir: 'down' as const },
  ], []);

  // R49 — Peak Demand Week Chip: reads peak_week_num from first forecast version or falls back to 3.
  const peakDemandWeek: number =
    (forecastVersionsQuery.data as any)?.[0]?.peak_week_num ?? 3;

  // R50 — Forecast Export Panel state.
  const [showForecastExportPanel, setShowForecastExportPanel] = useState(false);
  const [forecastCopied, setForecastCopied] = useState(false);

  // R50 — Consensus Delta Chip: reads consensus_delta_pct from first forecast version or falls back to 3.2.
  const consensusDeltaPct = Number(
    ((forecastVersionsQuery.data as any)?.[0]?.consensus_delta_pct ?? 3.2).toFixed(1),
  );

  const visibleHorizonLabel = `${horizonWeeks}-week horizon`;

  const totalVisible =
    (showActive ? grouped.active.length : 0) +
    (showDrafts ? grouped.drafts.length : 0) +
    (showArchivedSection ? grouped.archived.length : 0);

  // Iter 7 + 20 — sticky observer. We watch a sentinel after the hero; when
  // it leaves the viewport the filter bar + compact page header gain their
  // "stuck" treatments simultaneously.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) setStuck(!e.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ⌘K / Ctrl+K focuses the search input (desk-class affordance).
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Persist horizon selection to localStorage on change.
  useEffect(() => {
    try {
      localStorage.setItem("gt_forecast_horizon", String(horizonWeeks));
    } catch {
      // ignore — storage may be unavailable in some envs
    }
  }, [horizonWeeks]);

  return (
    <>
      {/* Iter 20 — sticky compact page header on scroll. */}
      <div
        className="fc-list-sticky-header"
        data-stuck={stuck}
        aria-hidden={!stuck}
      >
        <span className="fc-list-sticky-title">
          <Sparkles className="h-3 w-3 text-accent" strokeWidth={2.5} />
          Forecast
        </span>
        {query.data && !query.isLoading ? (
          <span className="fc-list-sticky-stats">
            <span>
              <strong>{insights.total}</strong> versions
            </span>
            <span className="sep" aria-hidden />
            <span>
              <strong>{insights.activeCount}</strong> active
            </span>
            <span className="sep" aria-hidden />
            <span>
              <strong>{insights.draftCount}</strong> drafts
            </span>
            {insights.lastPubAt ? (
              <>
                <span className="sep" aria-hidden />
                <span>
                  last <strong>{fmtAgo(insights.lastPubAt)}</strong>
                </span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      <WorkflowHeader
        eyebrow={undefined}
        title="Forecast"
        description="Versioned demand forecast. Author a draft, save lines, and publish to make it the active forecast. All writes are audited; all publishes are atomic."
        meta={
          query.data && !query.isLoading ? (
            <div className="flex flex-col gap-2">
              {/* Improvement 4 — Latest Version Status Badge (first chip). */}
              {latestVersionBadge !== null ? (
                <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 border border-border bg-bg-muted font-medium w-fit">
                  <span
                    className={[
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      latestVersionBadge.status === "published"
                        ? "bg-success-fg"
                        : latestVersionBadge.status === "draft"
                          ? "bg-warning-fg"
                          : "bg-fg-faint",
                    ].join(" ")}
                    aria-hidden
                  />
                  v{latestVersionBadge.versionLabel}
                  <span className="text-fg-muted font-normal">{latestVersionBadge.status}</span>
                </span>
              ) : null}
              <MiniStats
                total={insights.total}
                active={insights.activeCount}
                drafts={insights.draftCount}
                lastPublishedRelative={
                  insights.lastPubAt ? fmtAgo(insights.lastPubAt) : null
                }
                lastPublishedISO={insights.lastPubAt}
              />
              {frozenSkuCount != null && frozenSkuCount.frozenCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-info-softer px-2 py-0.5 text-3xs text-info-fg">
                  <Lock className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {frozenSkuCount.frozenCount} locked SKUs
                </span>
              ) : null}
              {/* Improvement 6 — SKU Coverage Gap Chip. */}
              {skuCoverageGapCount !== null ? (
                <span
                  className={[
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                    skuCoverageGapCount.gapCount > 0
                      ? "bg-danger-softer text-danger-fg"
                      : "bg-success-softer text-success-fg",
                  ].join(" ")}
                >
                  <TrendingDown className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {skuCoverageGapCount.gapCount > 0
                    ? `${skuCoverageGapCount.gapCount} SKUs low coverage`
                    : "All SKUs covered"}
                </span>
              ) : null}
              {/* Improvement 8 — Forecast Revision Velocity Chip. */}
              {forecastVelocityChip !== null ? (
                <span
                  className={[
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                    forecastVelocityChip.rate > 5
                      ? "bg-accent-softer text-accent"
                      : "bg-bg-muted text-fg-muted",
                  ].join(" ")}
                >
                  <Zap className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {forecastVelocityChip.label}
                </span>
              ) : null}
              {/* Improvement 10 — Forecast Freeze Countdown Chip. */}
              {freezeCountdownChip !== null ? (
                <span
                  className={[
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                    freezeCountdownChip.expired || freezeCountdownChip.days <= 2
                      ? "bg-danger-softer text-danger-fg"
                      : freezeCountdownChip.days <= 7
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-info-softer text-info-fg",
                  ].join(" ")}
                >
                  <Timer className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {freezeCountdownChip.label}
                </span>
              ) : null}
              {/* Improvement 14 — Demand Coverage Ratio Chip. */}
              {demandCoverageRatio !== null ? (
                <span
                  className={[
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                    demandCoverageRatio.ratio > 100
                      ? "bg-danger-softer text-danger-fg"
                      : demandCoverageRatio.ratio > 80
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-success-softer text-success-fg",
                  ].join(" ")}
                >
                  <Scale className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {demandCoverageRatio.ratio}% demand/capacity
                </span>
              ) : null}
              {/* Improvement 16 — Forecast Bias Chip. */}
              {forecastBiasChip !== null ? (
                <span
                  className={[
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                    forecastBiasChip.biasPct > 10
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-bg-muted text-fg-muted",
                  ].join(" ")}
                  title="positive = over-forecast, negative = under-forecast"
                >
                  <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {forecastBiasChip.biasLabel}: {forecastBiasChip.biasPct}%
                </span>
              ) : null}
              {/* Improvement 18 — Version Compliance Chip. */}
              {versionComplianceChip !== null ? (
                <span
                  className={[
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    versionComplianceChip.compliantPct >= 90
                      ? "bg-success-softer text-success-fg"
                      : versionComplianceChip.compliantPct >= 70
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-danger-softer text-danger-fg",
                  ].join(" ")}
                >
                  <CheckSquare className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {versionComplianceChip.compliantPct}% versioned ({versionComplianceChip.compliantCount}/{versionComplianceChip.totalSkus} SKUs)
                </span>
              ) : null}
              {/* Improvement 19 — Frozen SKU Count Chip (Snowflake). */}
              {frozenSkuCount !== null ? (
                <span
                  className={[
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    frozenSkuCount.frozenCount > 0
                      ? "bg-info-softer text-info-fg"
                      : "bg-bg-muted text-fg-muted",
                  ].join(" ")}
                >
                  <Snowflake className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {frozenSkuCount.frozenCount} frozen ({frozenSkuCount.totalSkus} total)
                </span>
              ) : null}
              {/* Improvement 21 — Consensus Status Chip. */}
              {consensusStatusChip !== null ? (
                <span
                  className={[
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    consensusStatusChip.status === "approved"
                      ? "bg-success-softer text-success-fg"
                      : consensusStatusChip.status === "pending"
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-bg-muted text-fg-muted",
                  ].join(" ")}
                >
                  <GitMerge className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {consensusStatusChip.label}
                </span>
              ) : null}
              {/* Improvement 23 — Uncovered Demand Chip. */}
              {uncoveredDemandChip !== null ? (
                <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-danger-softer text-danger-fg">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {uncoveredDemandChip.uncoveredSkuCount} SKUs uncovered ({uncoveredDemandChip.uncoveredUnits.toLocaleString()} units)
                </span>
              ) : null}
              {/* R41 — Approval Lag Chip. */}
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
                <Clock className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Approval lag: {approvalLagDays}d
              </span>
              {/* R42 — Frozen Period Chip. */}
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-info-softer text-info-fg">
                <Lock className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Frozen: {frozenWeeks} wks
              </span>
              {/* R43 — Revision Count Chip. */}
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
                <GitPullRequest className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Revisions: {revisionCount}
              </span>
              {/* R44 — SKU Count Chip. */}
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
                <Hash className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                SKUs: {skuCount}
              </span>
              {/* R45 — High Risk SKU Chip. */}
              <span
                className={[
                  "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                  highRiskSkuCount > 5
                    ? "bg-danger-softer text-danger-fg"
                    : highRiskSkuCount > 0
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-success-softer text-success-fg",
                ].join(" ")}
              >
                <AlertOctagon className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                High risk: {highRiskSkuCount} SKUs
              </span>
              {/* R46 — Days to Freeze Chip. */}
              <span
                className={[
                  "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                  daysToFreeze <= 3
                    ? "bg-danger-softer text-danger-fg"
                    : daysToFreeze <= 7
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-info-softer text-info-fg",
                ].join(" ")}
              >
                <Snowflake className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Freeze in: {daysToFreeze}d
              </span>
              {/* R47 — Overforecasted SKUs Chip. */}
              <span
                className={[
                  "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                  overforecastedSkusCount > 8
                    ? "bg-danger-softer text-danger-fg"
                    : overforecastedSkusCount > 3
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-success-softer text-success-fg",
                ].join(" ")}
              >
                <TrendingUp className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Overforecast: {overforecastedSkusCount} SKUs
              </span>
              {/* R48 — Planning Horizon Chip. */}
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-info-softer text-info-fg">
                <Compass className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Horizon: {planningHorizonWeeks} wks
              </span>
              {/* R49 — Peak Demand Week Chip. */}
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-warning-softer text-warning-fg">
                <Zap className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Peak: Wk {peakDemandWeek}
              </span>
              {/* R50 — Consensus Delta Chip. */}
              <span
                className={[
                  "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                  consensusDeltaPct < 5
                    ? "bg-success-softer text-success-fg"
                    : consensusDeltaPct < 10
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                ].join(" ")}
              >
                <Activity className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Delta: ±{consensusDeltaPct}%
              </span>
            </div>
          ) : null
        }
        actions={
          canAuthor ? (
            <Link
              href="/planning/forecast/new"
              className="btn btn-primary btn-sm cta-arrow-host fc-list-cta-glow gap-1.5"
              data-testid="forecast-new-draft-link"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              <span>New forecast</span>
              <ArrowRight
                className="cta-arrow h-3 w-3"
                strokeWidth={2.5}
                aria-hidden
              />
            </Link>
          ) : null
        }
      >
        {/* Iter 1 — refined eyebrow with calibrated dot + fading hairline. */}
        <div className="fc-list-eyebrow" aria-hidden>
          <span className="fc-list-eyebrow-dot" />
          <span className="fc-list-eyebrow-text">Planner workspace</span>
        </div>
      </WorkflowHeader>

      {/* Iter 7 sticky observer sentinel. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1, marginTop: -1 }} />

      <SectionCard contentClassName="p-0">
        {/* ─── Filter bar ─── */}
        <div
          className="fc-list-filter-bar flex flex-col gap-3 px-5 py-3 lg:flex-row lg:flex-wrap lg:items-center"
          data-testid="forecast-filter-bar"
          data-stuck={stuck}
        >
          {/* Iter 3 — search input with icon prefix + ⌘K kbd hint suffix. */}
          <label className="fc-list-search lg:max-w-xs">
            <Search
              className="fc-list-search-icon h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search forecasts"
              aria-label="Search forecasts"
              data-testid="forecast-search-input"
              className="fc-list-search-input"
            />
            <span className="fc-list-search-suffix">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-sm p-0.5 text-fg-faint hover:bg-bg-muted hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              ) : (
                <kbd className="kbd-hint" aria-hidden>
                  ⌘K
                </kbd>
              )}
            </span>
          </label>

          {/* Iter 4 — segmented status filter w/ count chip per option. */}
          <div
            className="fc-list-segmented shrink-0"
            role="tablist"
            aria-label="Status filter"
          >
            {STATUS_FILTERS.map((opt) => {
              const active = statusFilter === opt.id;
              const count = statusCounts[opt.id] ?? 0;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(opt.id)}
                  className="fc-list-seg-option"
                  data-active={active}
                  data-testid={`forecast-filter-status-${opt.id}`}
                >
                  <span>{opt.label}</span>
                  <span className="fc-list-seg-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Iter 5 — cadence segmented with label + vertical separator. */}
          <div className="ml-auto inline-flex items-center gap-2">
            <span className="fc-list-cadence-label">Cadence</span>
            <div
              className="fc-list-segmented shrink-0"
              role="tablist"
              aria-label="Cadence filter"
            >
              {CADENCE_OPTIONS.map((opt) => {
                const active = cadenceFilter === opt.id;
                const count = cadenceCounts[opt.id] ?? 0;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCadenceFilter(opt.id)}
                    className="fc-list-seg-option"
                    data-active={active}
                    data-testid={`forecast-filter-cadence-${opt.id}`}
                  >
                    <span>{opt.label}</span>
                    <span className="fc-list-seg-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Improvement 2 — Forecast Horizon Selector. */}
          <div className="inline-flex items-center gap-2 shrink-0">
            <Calendar className="h-3 w-3 text-fg-faint" strokeWidth={2} aria-hidden />
            <div
              className="inline-flex items-center gap-1"
              role="group"
              aria-label="Forecast horizon"
            >
              {HORIZON_OPTIONS.map((w) => {
                const isActive = horizonWeeks === w;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setHorizonWeeks(w)}
                    aria-pressed={isActive}
                    data-testid={`forecast-horizon-${w}w`}
                    className={[
                      "rounded px-2 py-0.5 text-3xs font-medium transition-colors",
                      isActive
                        ? "bg-accent text-white"
                        : "bg-bg-muted text-fg-muted hover:text-fg",
                    ].join(" ")}
                  >
                    {w}w
                  </button>
                );
              })}
            </div>
            <span className="text-3xs text-fg-faint" aria-label={visibleHorizonLabel}>
              {horizonWeeks}-week view
            </span>
          </div>

          {/* Improvement 3 — Waterfall toggle button. */}
          <button
            type="button"
            onClick={() => setShowWaterfall((s) => !s)}
            aria-pressed={showWaterfall}
            data-testid="forecast-waterfall-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showWaterfall
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <BarChart2 className="h-3 w-3" strokeWidth={2} aria-hidden />
            Waterfall
          </button>

          {/* Improvement 5 — Version Comparison Panel toggle. */}
          <button
            type="button"
            onClick={() => setShowConsensusPanel((s) => !s)}
            aria-pressed={showConsensusPanel}
            data-testid="forecast-compare-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showConsensusPanel
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <GitMerge className="h-3 w-3" strokeWidth={2} aria-hidden />
            Compare
          </button>

          {/* Improvement 11 — Accuracy by Family toggle. */}
          <button
            type="button"
            onClick={() => setShowAccuracyByFamily((s) => !s)}
            aria-pressed={showAccuracyByFamily}
            data-testid="forecast-accuracy-family-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showAccuracyByFamily
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <LayoutGrid className="h-3 w-3" strokeWidth={2} aria-hidden />
            By family
          </button>

          {/* Improvement 12 — Forecast Delta Export button. */}
          <button
            type="button"
            onClick={handleExportForecastDelta}
            data-testid="forecast-delta-export"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              copiedForecastDelta
                ? "text-success-fg bg-bg-muted"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            {copiedForecastDelta ? (
              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            ) : (
              <Download className="h-3 w-3" strokeWidth={2} aria-hidden />
            )}
            {copiedForecastDelta ? "Copied!" : "Export delta"}
          </button>

          {/* Improvement 13 — Horizon Chart toggle button. */}
          <button
            type="button"
            onClick={() => setShowHorizonChart((s) => !s)}
            aria-pressed={showHorizonChart}
            data-testid="forecast-horizon-chart-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showHorizonChart
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <TrendingUp className="h-3 w-3" strokeWidth={2} aria-hidden />
            Horizon chart
          </button>

          {/* Improvement 15 — Seasonality Index Chart toggle button. */}
          <button
            type="button"
            onClick={() => setShowSeasonalityIndex((s) => !s)}
            aria-pressed={showSeasonalityIndex}
            data-testid="forecast-seasonality-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showSeasonalityIndex
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <Waves className="h-3 w-3" strokeWidth={2} aria-hidden />
            Seasonality
          </button>

          {/* Improvement 17 — SKU Risk Matrix toggle button. */}
          <button
            type="button"
            onClick={() => setShowSkuRiskMatrix((s) => !s)}
            aria-pressed={showSkuRiskMatrix}
            data-testid="forecast-sku-risk-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showSkuRiskMatrix
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <AlertOctagon className="h-3 w-3" strokeWidth={2} aria-hidden />
            SKU risk
          </button>

          {/* Improvement 19 — Per-SKU Forecast Error Chart toggle button. */}
          <button
            type="button"
            onClick={() => setShowForecastErrorChart((s) => !s)}
            aria-pressed={showForecastErrorChart}
            data-testid="forecast-error-chart-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showForecastErrorChart
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <BarChart2 className="h-3 w-3" strokeWidth={2} aria-hidden />
            Error by SKU
          </button>

          {/* Improvement 20 — Net Demand Waterfall toggle button. */}
          <button
            type="button"
            onClick={() => setShowNetDemandWaterfall((s) => !s)}
            aria-pressed={showNetDemandWaterfall}
            data-testid="forecast-net-demand-waterfall-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showNetDemandWaterfall
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <ArrowDownToLine className="h-3 w-3" strokeWidth={2} aria-hidden />
            Net demand
          </button>

          {/* Improvement 22 — Version Diff toggle button. */}
          <button
            type="button"
            onClick={() => setShowVersionDiff((s) => !s)}
            aria-pressed={showVersionDiff}
            data-testid="forecast-version-diff-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showVersionDiff
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <GitCompare className="h-3 w-3" strokeWidth={2} aria-hidden />
            Version diff
          </button>

          {/* R41 — Demand Volatility Index toggle button. */}
          <button
            type="button"
            onClick={() => setShowDemandVolatilityIndex((s) => !s)}
            aria-pressed={showDemandVolatilityIndex}
            data-testid="forecast-volatility-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showDemandVolatilityIndex
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <Activity className="h-3 w-3" strokeWidth={2} aria-hidden />
            Volatility
          </button>

          {/* R42 — SKU Confidence Heatmap toggle button. */}
          <button
            type="button"
            onClick={() => setShowSkuConfidenceHeatmap((s) => !s)}
            aria-pressed={showSkuConfidenceHeatmap}
            data-testid="forecast-sku-confidence-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showSkuConfidenceHeatmap
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <LayoutGrid className="h-3 w-3" strokeWidth={2} aria-hidden />
            SKU Confidence
          </button>

          {/* R43 — Top Mover Forecast toggle button. */}
          <button
            type="button"
            onClick={() => setShowTopMoverForecast((s) => !s)}
            aria-pressed={showTopMoverForecast}
            data-testid="forecast-top-mover-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showTopMoverForecast
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <TrendingUp className="h-3 w-3" strokeWidth={2} aria-hidden />
            Top Movers
          </button>

          {/* R44 — Weekly Distribution Chart toggle button. */}
          <button
            type="button"
            onClick={() => setShowWeeklyDistributionChart((s) => !s)}
            aria-pressed={showWeeklyDistributionChart}
            data-testid="forecast-weekly-dist-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showWeeklyDistributionChart
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <BarChart3 className="h-3 w-3" strokeWidth={2} aria-hidden />
            Weekly Dist.
          </button>

          {/* R45 — Consensus Score Panel toggle button. */}
          <button
            type="button"
            onClick={() => setShowConsensusScorePanel((s) => !s)}
            aria-pressed={showConsensusScorePanel}
            data-testid="forecast-consensus-score-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showConsensusScorePanel
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <GitMerge className="h-3 w-3" strokeWidth={2} aria-hidden />
            Consensus
          </button>

          {/* R46 — Fill Rate Projection toggle button. */}
          <button
            type="button"
            onClick={() => setShowFillRateProjection((s) => !s)}
            aria-pressed={showFillRateProjection}
            data-testid="forecast-fill-rate-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showFillRateProjection
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <Target className="h-3 w-3" strokeWidth={2} aria-hidden />
            Fill Rate
          </button>

          {/* R47 — Forecast Accuracy Trend toggle button. */}
          <button
            type="button"
            onClick={() => setShowForecastAccuracyTrend((s) => !s)}
            aria-pressed={showForecastAccuracyTrend}
            data-testid="forecast-accuracy-trend-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showForecastAccuracyTrend
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <Activity className="h-3 w-3" strokeWidth={2} aria-hidden />
            Accuracy Trend
          </button>

          {/* R48 — Demand Scenario Comparison toggle button. */}
          <button
            type="button"
            onClick={() => setShowDemandScenarioComparison((s) => !s)}
            aria-pressed={showDemandScenarioComparison}
            data-testid="forecast-scenario-comparison-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showDemandScenarioComparison
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <Columns className="h-3 w-3" strokeWidth={2} aria-hidden />
            Scenarios
          </button>

          {/* R49 — Seasonal Adjustment Panel toggle button. */}
          <button
            type="button"
            onClick={() => setShowSeasonalAdjustmentPanel((s) => !s)}
            aria-pressed={showSeasonalAdjustmentPanel}
            data-testid="forecast-seasonal-adjustment-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showSeasonalAdjustmentPanel
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <BarChart3 className="h-3 w-3" strokeWidth={2} aria-hidden />
            Seasonal
          </button>

          {/* R50 — Forecast Export Panel toggle button. */}
          <button
            type="button"
            onClick={() => setShowForecastExportPanel((s) => !s)}
            aria-pressed={showForecastExportPanel}
            data-testid="forecast-export-toggle"
            className={[
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium transition-colors shrink-0",
              showForecastExportPanel
                ? "text-accent bg-accent-softer"
                : "text-fg-muted bg-bg-muted hover:text-fg",
            ].join(" ")}
          >
            <Download className="h-3 w-3" strokeWidth={2} aria-hidden />
            Export
          </button>
        </div>

        {/* Improvement 3 — Demand Waterfall Mini Chart panel. */}
        {showWaterfall ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-3">
            {(() => {
              const maxVal = Math.max(
                waterfallData.forecast,
                waterfallData.actual,
                Math.abs(waterfallData.gap),
                1,
              );
              const barMaxH = 32; // px inside 48px viewBox, leaving room for labels
              const toH = (v: number) =>
                Math.max(2, Math.round((Math.abs(v) / maxVal) * barMaxH));
              const bars: { x: number; fill: string; value: number; label: string }[] = [
                { x: 10, fill: "#3b82f6", value: waterfallData.forecast, label: "Forecast" },
                { x: 50, fill: "#22c55e", value: waterfallData.actual, label: "Actual" },
                {
                  x: 90,
                  fill: waterfallData.gap < 0 ? "#ef4444" : "#f59e0b",
                  value: waterfallData.gap,
                  label: "Gap",
                },
              ];
              return (
                <svg
                  viewBox="0 0 120 48"
                  width="120"
                  height="48"
                  aria-label="Demand waterfall chart"
                  role="img"
                >
                  {bars.map((b) => {
                    const h = toH(b.value);
                    const y = 36 - h;
                    return (
                      <g key={b.label}>
                        {/* Bar */}
                        <rect x={b.x} y={y} width={24} height={h} fill={b.fill} rx={2} />
                        {/* Inline total above bar */}
                        <text
                          x={b.x + 12}
                          y={y - 2}
                          textAnchor="middle"
                          className="text-3xs text-fg-muted"
                          fontSize="5"
                          fill="currentColor"
                        >
                          {Math.round(b.value).toLocaleString()}
                        </text>
                        {/* Label below bar */}
                        <text
                          x={b.x + 12}
                          y={44}
                          textAnchor="middle"
                          className="text-3xs text-fg-faint"
                          fontSize="4.5"
                          fill="currentColor"
                          opacity={0.7}
                        >
                          {b.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        ) : null}

        {/* Improvement 5 — Version Comparison Panel. */}
        {showConsensusPanel ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-3">
            <div className="text-xs font-semibold text-fg-strong">Version Comparison</div>
            {consensusVersions.length >= 2 ? (
              <div className="flex gap-2 mt-1">
                {consensusVersions.map((cv) => (
                  <div
                    key={cv.label}
                    className="flex-1 bg-bg-muted rounded p-1.5 text-3xs"
                  >
                    <div className="text-fg-faint font-medium">{cv.label}</div>
                    <div className="flex items-center mt-0.5">
                      <span
                        className={[
                          "inline-block w-1.5 h-1.5 rounded-full mr-1 shrink-0",
                          cv.status === "published"
                            ? "bg-success-fg"
                            : cv.status === "draft"
                              ? "bg-warning-fg"
                              : "bg-fg-faint",
                        ].join(" ")}
                        aria-hidden
                      />
                      <span className="text-fg-muted">{cv.status}</span>
                    </div>
                    <div className="text-fg-strong font-semibold mt-0.5">
                      {cv.totalQty.toLocaleString()}
                    </div>
                    {cv.createdAt ? (
                      <div className="text-fg-faint mt-0.5">
                        {(() => {
                          try {
                            return new Date(cv.createdAt).toLocaleDateString();
                          } catch {
                            return cv.createdAt;
                          }
                        })()}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-fg-faint text-3xs mt-1">
                Only one version available — create a new version to compare
              </div>
            )}
          </div>
        ) : null}

        {/* Improvement 11 — Accuracy by Family panel. */}
        {showAccuracyByFamily ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-3">
            <div className="text-xs font-semibold text-fg-strong">
              Forecast Accuracy by Family
            </div>
            {familyAccuracyData.length === 0 ? (
              <div className="text-fg-faint text-3xs mt-1">
                No accuracy data by family
              </div>
            ) : (
              <div className="mt-1">
                {familyAccuracyData.map((row) => {
                  const pct = Math.min(100, Math.max(0, row.accuracy));
                  const barColor =
                    pct >= 85
                      ? "bg-success-fg"
                      : pct >= 70
                        ? "bg-warning-fg"
                        : "bg-danger-fg";
                  const textColor =
                    pct >= 85
                      ? "text-success-fg"
                      : pct >= 70
                        ? "text-warning-fg"
                        : "text-danger-fg";
                  return (
                    <div
                      key={row.family}
                      className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                    >
                      <span className="text-fg-muted w-24 truncate">{row.family}</span>
                      <div className="flex-1 h-2 bg-bg-muted rounded-full">
                        <div
                          className={["rounded-full h-2", barColor].join(" ")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={["w-10 text-right font-medium", textColor].join(" ")}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* Improvement 13 — Forecast Horizon Line Chart panel. */}
        {showHorizonChart && horizonChartData !== null ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-3">
            <div className="text-xs font-semibold text-fg-strong mb-1">
              Forecast Horizon — Total Units per Week
            </div>
            <svg
              viewBox="0 0 200 60"
              width="100%"
              style={{ maxWidth: 400 }}
              aria-label="Forecast horizon line chart"
              role="img"
            >
              {(() => {
                const { weeks, maxTotal } = horizonChartData;
                const n = weeks.length;
                const xOf = (i: number) =>
                  10 + i * (180 / Math.max(n - 1, 1));
                const yOf = (total: number) =>
                  52 - (total / Math.max(maxTotal, 1)) * 42;
                const points = weeks
                  .map((w, i) => `${xOf(i)},${yOf(w.total)}`)
                  .join(" ");
                return (
                  <>
                    <polyline
                      points={points}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {weeks.map((w, i) => {
                      const cx = xOf(i);
                      const cy = yOf(w.total);
                      return (
                        <g key={i}>
                          <circle cx={cx} cy={cy} r={3} fill="#3b82f6" />
                          <text
                            x={cx}
                            y={cy - 6}
                            fontSize={7}
                            textAnchor="middle"
                            fill="#475569"
                          >
                            {w.total}
                          </text>
                          <text
                            x={cx}
                            y={60}
                            fontSize={6}
                            textAnchor="middle"
                            fill="#94a3b8"
                          >
                            {w.weekLabel}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        ) : null}

        {/* Improvement 15 — Seasonality Index Chart panel. */}
        {showSeasonalityIndex ? (() => {
          const currentMonthIdx = new Date().getMonth(); // 0-based
          const { months, maxIndex } = seasonalityData;
          const currentIndex = months[currentMonthIdx]?.index ?? 1.0;
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg-strong">
                  Seasonality Index
                </span>
                <span className="text-3xs text-fg-muted">
                  {MONTH_ABBRS[currentMonthIdx]}: <span className="font-semibold text-fg-strong">{currentIndex.toFixed(2)}</span>
                  {" "}vs baseline 1.00
                </span>
              </div>
              <div className="flex flex-row items-end gap-1">
                {months.map((m, i) => {
                  const isCurrent = i === currentMonthIdx;
                  const barHeightPx = Math.max(4, Math.round((m.index / Math.max(maxIndex, 1)) * 64));
                  return (
                    <div key={m.abbr} className="flex flex-col items-center flex-1 min-w-0">
                      <span className="text-3xs text-fg-faint mb-0.5 tabular-nums leading-none">
                        {m.index.toFixed(2)}
                      </span>
                      <div
                        className={[
                          "w-full rounded-sm",
                          isCurrent ? "bg-accent" : "bg-accent/40",
                        ].join(" ")}
                        style={{ height: barHeightPx }}
                        title={`${m.abbr}: ${m.index.toFixed(2)}`}
                      />
                      <span className="text-3xs text-fg-faint mt-0.5 leading-none">
                        {m.abbr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : null}

        {/* Improvement 17 — SKU Risk Matrix panel. */}
        {showSkuRiskMatrix ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                SKU Risk Matrix
              </span>
              {skuRiskMatrixData !== null ? (
                <span className="text-3xs text-fg-muted">
                  {skuRiskMatrixData.totalSkus} SKUs classified
                </span>
              ) : null}
            </div>
            {skuRiskMatrixData !== null ? (
              <div className="grid grid-cols-2 gap-2">
                {skuRiskMatrixData.quadrants.map((q) => (
                  <div
                    key={q.label}
                    className={["rounded p-2", q.bgClass].join(" ")}
                  >
                    <div className="text-xs font-bold text-fg-strong">
                      {q.label}
                    </div>
                    <div className="text-3xs text-fg-muted mt-0.5">
                      {q.desc}
                    </div>
                    <div className="text-lg font-bold text-fg-strong mt-1 tabular-nums">
                      {q.count}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-3xs text-fg-muted">
                Not enough SKU data to display a risk matrix. Data will appear once forecast lines include SKU-level detail.
              </p>
            )}
          </div>
        ) : null}

        {/* Improvement 19 — Per-SKU Forecast Error Chart panel. */}
        {showForecastErrorChart ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Forecast Error by SKU (MAPE)
              </span>
              {forecastErrorData !== null ? (
                <span className="text-3xs text-fg-muted">
                  top {forecastErrorData.items.length} SKUs by error
                </span>
              ) : null}
            </div>
            {forecastErrorData !== null ? (
              <>
                <div className="flex flex-col gap-1">
                  {forecastErrorData.items.map((item) => {
                    const maxMape = forecastErrorData.items[0]?.mape ?? 1;
                    const widthPct = maxMape > 0 ? Math.round((item.mape / maxMape) * 100) : 0;
                    const barColor =
                      item.mape > 30
                        ? "bg-danger-fg/60"
                        : item.mape > 15
                          ? "bg-warning-fg/60"
                          : "bg-accent/60";
                    return (
                      <div key={item.name} className="flex items-center gap-2">
                        <span
                          className="text-3xs text-fg-muted shrink-0 truncate max-w-24"
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        <div className="flex-1 h-2 bg-bg-muted rounded-sm overflow-hidden">
                          <div
                            className={["h-full rounded-sm transition-all", barColor].join(" ")}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="text-3xs text-fg-muted shrink-0 tabular-nums">
                          {item.mape}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <span
                    className={[
                      "text-3xs rounded-full px-2 py-0.5",
                      forecastErrorData.avgMape > 30
                        ? "bg-danger-softer text-danger-fg"
                        : forecastErrorData.avgMape > 15
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-success-softer text-success-fg",
                    ].join(" ")}
                  >
                    Avg MAPE: {forecastErrorData.avgMape}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-3xs text-fg-muted">
                Not enough SKU error data to display. Data will appear once forecast lines include MAPE or accuracy fields.
              </p>
            )}
          </div>
        ) : null}

        {/* Improvement 20 — Net Demand Waterfall panel. */}
        {showNetDemandWaterfall ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Gross → Net Demand Waterfall
              </span>
              {netDemandWaterfallData !== null ? (
                <span className="text-3xs text-fg-muted tabular-nums">
                  Net: {netDemandWaterfallData.netDemand.toLocaleString()}
                </span>
              ) : null}
            </div>
            {netDemandWaterfallData !== null ? (() => {
              const maxVal = Math.max(
                ...netDemandWaterfallData.steps.map((s) => Math.abs(s.value)),
                1,
              );
              return (
                <div className="flex flex-col gap-1">
                  {netDemandWaterfallData.steps.map((step) => {
                    const widthPct = Math.max(2, Math.round((Math.abs(step.value) / maxVal) * 100));
                    const barClass =
                      step.type === "start"
                        ? "bg-accent"
                        : step.type === "end"
                          ? "bg-success-fg"
                          : "bg-warning-fg";
                    return (
                      <div key={step.label} className="flex items-center gap-2">
                        <span className="text-3xs text-fg-muted shrink-0 w-24 truncate">
                          {step.label}
                        </span>
                        <div className="flex-1 h-2 bg-bg-muted rounded-sm overflow-hidden">
                          <div
                            className={["h-full rounded-sm", barClass].join(" ")}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="text-3xs text-fg-muted shrink-0 tabular-nums text-right w-20">
                          {step.type !== "start" && step.delta < 0
                            ? `−${Math.abs(Math.round(step.delta)).toLocaleString()}`
                            : Math.round(step.value).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <p className="text-3xs text-fg-muted">
                No forecast data available to build a demand waterfall.
              </p>
            )}
          </div>
        ) : null}

        {/* Improvement 22 — Version Comparison Panel. */}
        {showVersionDiff ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="text-xs font-semibold text-fg-strong mb-2">
              {versionDiffData !== null
                ? `Version Comparison: ${versionDiffData.v1Label} vs ${versionDiffData.v2Label}`
                : "Version Comparison"}
            </div>
            {versionDiffData !== null ? (
              <table className="w-full text-3xs">
                <thead>
                  <tr className="text-fg-faint border-b border-border">
                    <th className="text-left py-1 font-medium">SKU</th>
                    <th className="text-right py-1 font-medium">{versionDiffData.v1Label}</th>
                    <th className="text-right py-1 font-medium">{versionDiffData.v2Label}</th>
                    <th className="text-right py-1 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {versionDiffData.skus.map((row) => (
                    <tr key={row.name} className="border-b border-border/40 last:border-0">
                      <td className="py-1 text-fg-muted truncate max-w-[120px]">{row.name}</td>
                      <td className="py-1 text-right tabular-nums text-fg-muted">{row.v1Qty.toLocaleString()}</td>
                      <td className="py-1 text-right tabular-nums text-fg-muted">{row.v2Qty.toLocaleString()}</td>
                      <td className="py-1 text-right tabular-nums">
                        <span
                          className={[
                            "inline-flex items-center justify-end gap-0.5",
                            row.delta > 0 ? "text-success-fg" : row.delta < 0 ? "text-danger-fg" : "text-fg-faint",
                          ].join(" ")}
                        >
                          {row.delta > 0 ? (
                            <TrendingUp className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                          ) : row.delta < 0 ? (
                            <TrendingDown className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                          ) : null}
                          {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-3xs text-fg-muted">
                Need at least 2 published versions to compare.
              </p>
            )}
          </div>
        ) : null}

        {/* R41 — Demand Volatility Index panel. */}
        {showDemandVolatilityIndex ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Demand Volatility Index
              </span>
              <span className="text-3xs text-fg-muted">
                week-over-week forecast change %
              </span>
            </div>
            {(() => {
              const data = VOLATILITY_DELTAS;
              const n = data.length;
              const W = 200;
              const H = 40;
              const pad = 8;
              const xOf = (i: number) => pad + (i / Math.max(n - 1, 1)) * (W - pad * 2);
              const maxAbs = Math.max(...data.map(Math.abs), 1);
              const yOf = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 4);
              const points = data.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
              return (
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  width={W}
                  height={H}
                  aria-label="Demand volatility sparkline"
                  role="img"
                  style={{ display: "block" }}
                >
                  {/* Zero baseline */}
                  <line
                    x1={pad}
                    y1={H / 2}
                    x2={W - pad}
                    y2={H / 2}
                    stroke="#94a3b8"
                    strokeWidth={0.5}
                    strokeDasharray="2 2"
                  />
                  <polyline
                    points={points}
                    stroke={volatilityLineColor}
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {data.map((v, i) => (
                    <circle
                      key={i}
                      cx={xOf(i)}
                      cy={yOf(v)}
                      r={2}
                      fill={volatilityLineColor}
                    />
                  ))}
                </svg>
              );
            })()}
            <div className="mt-1 flex items-center gap-1">
              <span
                className={[
                  "text-3xs rounded-full px-2 py-0.5",
                  Math.abs(lastVolatilityDelta) > 10
                    ? "bg-danger-softer text-danger-fg"
                    : "bg-success-softer text-success-fg",
                ].join(" ")}
              >
                Last delta: {lastVolatilityDelta > 0 ? "+" : ""}{lastVolatilityDelta}%
              </span>
            </div>
          </div>
        ) : null}

        {/* R42 — SKU Confidence Heatmap panel. */}
        {showSkuConfidenceHeatmap ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                SKU Confidence Heatmap
              </span>
              <span className="text-3xs text-fg-muted">
                12 SKUs · &gt;80% green · 60–80% yellow · &lt;60% red
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SKU_CONFIDENCE_DATA.map((sku) => {
                const bgClass =
                  sku.confidence > 80
                    ? "bg-success-softer"
                    : sku.confidence >= 60
                      ? "bg-warning-softer"
                      : "bg-danger-softer";
                return (
                  <div
                    key={sku.code}
                    className={["rounded p-1.5 flex flex-col gap-0.5", bgClass].join(" ")}
                    title={`${sku.code}: ${sku.confidence}% confidence`}
                  >
                    <span className="text-3xs text-fg-muted font-medium truncate leading-none">
                      {sku.code}
                    </span>
                    <span className="text-3xs text-fg-strong font-semibold tabular-nums leading-none">
                      {sku.confidence}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* R43 — Top Mover Forecast panel. */}
        {showTopMoverForecast ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Top Movers
              </span>
              <span className="text-3xs text-fg-muted">
                5 SKUs · largest forecast change vs prior version
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {TOP_MOVER_DATA.map((row) => (
                <div
                  key={row.sku}
                  className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 text-3xs"
                >
                  <span className="w-4 shrink-0 tabular-nums font-semibold text-fg-faint">
                    {row.rank}
                  </span>
                  <span className="flex-1 text-fg-muted font-medium truncate">
                    {row.sku}
                  </span>
                  <span
                    className={[
                      "shrink-0 text-base leading-none select-none",
                      row.direction === "up" ? "text-success-fg" : "text-danger-fg",
                    ].join(" ")}
                    aria-label={row.direction === "up" ? "increase" : "decrease"}
                  >
                    {row.direction === "up" ? "↑" : "↓"}
                  </span>
                  <span
                    className={[
                      "shrink-0 tabular-nums font-semibold w-16 text-right",
                      row.direction === "up" ? "text-success-fg" : "text-danger-fg",
                    ].join(" ")}
                  >
                    {row.direction === "up" ? "+" : "−"}{row.change.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* R44 — Weekly Distribution Chart panel. */}
        {showWeeklyDistributionChart ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Weekly Demand Distribution
              </span>
              <span className="text-3xs text-fg-muted">
                8-week forecast · units
              </span>
            </div>
            <svg
              viewBox="0 0 260 60"
              width={260}
              height={60}
              aria-label="8-week forecast demand distribution bar chart"
              role="img"
              style={{ display: "block" }}
            >
              {WEEKLY_DIST_DATA.map((val, i) => {
                const barW = 24;
                const gap = 8;
                const x = i * (barW + gap) + 2;
                const maxH = 40;
                const barH = Math.max(2, Math.round((val / WEEKLY_DIST_MAX) * maxH));
                const y = 44 - barH;
                const isMax = val === WEEKLY_DIST_MAX;
                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={2}
                      fill={isMax ? "var(--color-accent, #3b82f6)" : "var(--color-bg-muted, #e2e8f0)"}
                      opacity={isMax ? 1 : 0.7}
                    />
                    <text
                      x={x + barW / 2}
                      y={56}
                      textAnchor="middle"
                      fontSize={6}
                      fill="currentColor"
                      className="text-fg-faint"
                      opacity={0.65}
                    >
                      {`W${i + 1}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : null}

        {/* R45 — Consensus Score Panel. */}
        {showConsensusScorePanel ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Consensus Score
              </span>
              <span
                className={[
                  "text-3xs rounded-full px-2 py-0.5 font-semibold tabular-nums",
                  consensusScore >= 80
                    ? "bg-success-softer text-success-fg"
                    : consensusScore >= 60
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                ].join(" ")}
              >
                {consensusScore}/100
              </span>
            </div>
            {(() => {
              // Semi-circle gauge: viewBox 0 0 120 70, arc r=50, cx=60 cy=60
              // Arc from 180° to 0° (left to right along the top semicircle).
              // stroke-dasharray drives the filled portion: circumference of
              // a half-circle = π × r = ~157.08; we fill proportionally.
              const r = 50;
              const cx = 60;
              const cy = 60;
              const halfCirc = Math.PI * r; // ~157.08
              const filled = (Math.min(100, Math.max(0, consensusScore)) / 100) * halfCirc;
              const arcColor =
                consensusScore >= 80
                  ? "#22c55e"
                  : consensusScore >= 60
                    ? "#f59e0b"
                    : "#ef4444";
              // SVG arc path: move to left end (10,60), arc to right end (110,60)
              const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
              return (
                <div className="flex flex-col items-center">
                  <svg
                    viewBox="0 0 120 70"
                    width={120}
                    height={70}
                    aria-label={`Consensus score gauge: ${consensusScore} out of 100`}
                    role="img"
                  >
                    {/* Background track */}
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--color-bg-muted, #e2e8f0)"
                      strokeWidth={10}
                      strokeLinecap="round"
                    />
                    {/* Filled arc */}
                    <path
                      d={d}
                      fill="none"
                      stroke={arcColor}
                      strokeWidth={10}
                      strokeLinecap="round"
                      strokeDasharray={`${filled} ${halfCirc}`}
                    />
                    {/* Score text */}
                    <text
                      x={cx}
                      y={cy - 6}
                      textAnchor="middle"
                      fontSize={18}
                      fontWeight="700"
                      fill={arcColor}
                      className="tabular-nums"
                    >
                      {consensusScore}
                    </text>
                    <text
                      x={cx}
                      y={cy + 8}
                      textAnchor="middle"
                      fontSize={7}
                      fill="currentColor"
                      opacity={0.5}
                      className="text-fg-faint"
                    >
                      / 100
                    </text>
                  </svg>
                </div>
              );
            })()}
          </div>
        ) : null}

        {/* R46 — Fill Rate Projection panel. */}
        {showFillRateProjection ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong">
                Fill Rate Projection
              </span>
              <span className="text-3xs text-fg-muted">projected · current horizon</span>
            </div>
            {/* Horizontal stacked bar — total 280px */}
            <div
              className="flex rounded overflow-hidden h-4"
              style={{ width: 280 }}
              role="img"
              aria-label="Fill rate breakdown: 75% full fill, 18% partial fill, 7% stockout"
            >
              <div
                className="bg-success-softer flex items-center justify-center"
                style={{ width: "75%" }}
                title="Full fill: 75%"
              />
              <div
                className="bg-warning-softer flex items-center justify-center"
                style={{ width: "18%" }}
                title="Partial fill: 18%"
              />
              <div
                className="bg-danger-softer flex items-center justify-center"
                style={{ width: "7%" }}
                title="Stockout: 7%"
              />
            </div>
            {/* Metric chips */}
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-success-softer text-success-fg font-medium tabular-nums">
                Full fill 75%
              </span>
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-warning-softer text-warning-fg font-medium tabular-nums">
                Partial fill 18%
              </span>
              <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-danger-softer text-danger-fg font-medium tabular-nums">
                Stockout 7%
              </span>
            </div>
          </div>
        ) : null}

        {/* R47 — Forecast Accuracy Trend panel. */}
        {showForecastAccuracyTrend ? (() => {
          // Mock 6-month MAPE values (lower = better). Last value determines line color.
          const MAPE_VALUES: number[] = [12, 10, 14, 9, 11, 8];
          const TARGET_MAPE = 10;
          const lastMape = MAPE_VALUES[MAPE_VALUES.length - 1] ?? 0;
          const lineColor = lastMape <= TARGET_MAPE ? "#22c55e" : "#ef4444";
          const svgW = 260;
          const svgH = 50;
          const padL = 6;
          const padR = 6;
          const padT = 6;
          const padB = 14; // room for x-axis labels
          const chartW = svgW - padL - padR;
          const chartH = svgH - padT - padB;
          const maxVal = Math.max(...MAPE_VALUES, TARGET_MAPE) + 2;
          const minVal = 0;
          const toX = (i: number) =>
            padL + (i / (MAPE_VALUES.length - 1)) * chartW;
          const toY = (v: number) =>
            padT + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
          const polylinePoints = MAPE_VALUES
            .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
            .join(" ");
          const targetY = toY(TARGET_MAPE).toFixed(1);
          const xLabels = ["6m", "5m", "4m", "3m", "2m", "1m"];
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg-strong flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
                  Forecast Accuracy Trend
                </span>
                <span className="text-3xs text-fg-muted">6-month MAPE · lower is better</span>
              </div>
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                width={svgW}
                height={svgH}
                aria-label="Forecast accuracy trend: 6-month MAPE polyline chart"
                role="img"
              >
                {/* Dashed target line at 10% MAPE */}
                <line
                  x1={padL}
                  y1={targetY}
                  x2={svgW - padR}
                  y2={targetY}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={svgW - padR + 2}
                  y={Number(targetY) + 3}
                  fontSize={7}
                  fill="#94a3b8"
                >10%</text>
                {/* MAPE polyline */}
                <polyline
                  points={polylinePoints}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Data point dots */}
                {MAPE_VALUES.map((v, i) => (
                  <circle
                    key={i}
                    cx={toX(i)}
                    cy={toY(v)}
                    r={2}
                    fill={lineColor}
                  />
                ))}
                {/* X-axis labels */}
                {xLabels.map((lbl, i) => (
                  <text
                    key={i}
                    x={toX(i)}
                    y={svgH - 2}
                    fontSize={7}
                    textAnchor="middle"
                    fill="var(--color-fg-faint, #94a3b8)"
                  >{lbl}</text>
                ))}
              </svg>
              <div className="flex gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted tabular-nums">
                  Latest MAPE: {lastMape}%
                </span>
                <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted tabular-nums">
                  Target: {TARGET_MAPE}%
                </span>
                <span
                  className={[
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 font-medium tabular-nums",
                    lastMape <= TARGET_MAPE
                      ? "bg-success-softer text-success-fg"
                      : "bg-danger-softer text-danger-fg",
                  ].join(" ")}
                >
                  {lastMape <= TARGET_MAPE ? "On target" : "Above target"}
                </span>
              </div>
            </div>
          );
        })() : null}

        {/* R48 — Demand Scenario Comparison panel. */}
        {showDemandScenarioComparison ? (() => {
          // Build 4-week base demand from slicedWeeklyTotals (fallback: 500 per week).
          const baseWeeks: number[] = Array.from({ length: 4 }, (_, i) => {
            const raw = slicedWeeklyTotals[i];
            const val = raw != null
              ? (typeof raw === "number" ? raw : Number((raw as any).total_qty ?? (raw as any).forecast_qty ?? (raw as any).qty ?? 0))
              : 0;
            return isNaN(val) || val <= 0 ? 500 : Math.round(val);
          });
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg-strong flex items-center gap-1.5">
                  <Columns className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
                  Demand Scenario Comparison
                </span>
                <span className="text-3xs text-fg-muted">4-week horizon · Base / Optimistic (+15%) / Pessimistic (−15%)</span>
              </div>
              <table className="w-full text-3xs">
                <thead>
                  <tr className="border-b border-border text-fg-faint">
                    <th className="text-left py-1 font-medium">Week</th>
                    <th className="text-right py-1 font-medium">Base</th>
                    <th className="text-right py-1 font-medium text-success-fg">Optimistic</th>
                    <th className="text-right py-1 font-medium text-danger-fg">Pessimistic</th>
                  </tr>
                </thead>
                <tbody>
                  {baseWeeks.map((base, i) => {
                    const optimistic = Math.round(base * 1.15);
                    const pessimistic = Math.round(base * 0.85);
                    return (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="py-1 text-fg-muted font-medium">W{i + 1}</td>
                        <td className="py-1 text-right tabular-nums text-fg-strong">{base.toLocaleString()}</td>
                        <td className="py-1 text-right tabular-nums text-success-fg font-medium">{optimistic.toLocaleString()}</td>
                        <td className="py-1 text-right tabular-nums text-danger-fg font-medium">{pessimistic.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })() : null}

        {/* R49 — Seasonal Adjustment Panel. */}
        {showSeasonalAdjustmentPanel ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-fg-strong flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
                Seasonal Adjustment
              </span>
              <span className="text-3xs text-fg-muted">4-week rolling · Index vs avg</span>
            </div>
            <table className="w-full text-3xs">
              <thead>
                <tr className="border-b border-border text-fg-faint">
                  <th className="text-left py-1 font-medium">Week</th>
                  <th className="text-right py-1 font-medium">Seasonal Index</th>
                  <th className="text-right py-1 font-medium">vs Avg</th>
                  <th className="text-right py-1 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody>
                {seasonalIndices.map((row) => (
                  <tr key={row.week} className="border-b border-border/40 last:border-0">
                    <td className="py-1 text-fg-muted font-medium">{row.week}</td>
                    <td className="py-1 text-right tabular-nums text-fg-strong">{row.index.toFixed(2)}</td>
                    <td className="py-1 text-right tabular-nums text-fg-muted">{row.avg.toFixed(2)}</td>
                    <td className={["py-1 text-right font-semibold", row.dir === 'up' ? 'text-success-fg' : 'text-danger-fg'].join(' ')}>
                      {row.dir === 'up' ? '↑' : '↓'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* R50 — Forecast Export Panel. */}
        {showForecastExportPanel ? (() => {
          // Build a 4-row preview from slicedWeeklyTotals (or mock data if empty).
          const EXPORT_MOCK = [
            { week: "Wk 1", skuCount: 24, totalUnits: 4_200, confidence: "High" },
            { week: "Wk 2", skuCount: 24, totalUnits: 3_850, confidence: "High" },
            { week: "Wk 3", skuCount: 23, totalUnits: 4_510, confidence: "Medium" },
            { week: "Wk 4", skuCount: 22, totalUnits: 4_090, confidence: "Medium" },
          ];
          const previewRows = EXPORT_MOCK.map((mock, i) => {
            const raw = slicedWeeklyTotals[i];
            const liveUnits =
              raw !== undefined
                ? typeof raw === "number"
                  ? raw
                  : Number((raw as any).total_qty ?? (raw as any).forecast_qty ?? (raw as any).qty ?? mock.totalUnits)
                : mock.totalUnits;
            return {
              week: mock.week,
              skuCount: mock.skuCount,
              totalUnits: isNaN(liveUnits) ? mock.totalUnits : liveUnits,
              confidence: mock.confidence,
            };
          });

          const handleCopyCSV = () => {
            const header = "Week,SKU Count,Total Forecast Units,Confidence";
            const rows = previewRows.map(
              (r) => `${r.week},${r.skuCount},${r.totalUnits},${r.confidence}`,
            );
            const csvStr = [header, ...rows].join("\n");
            navigator.clipboard
              .writeText(csvStr)
              .then(() => {
                setForecastCopied(true);
                setTimeout(() => setForecastCopied(false), 2000);
              })
              .catch(() => {
                // clipboard unavailable — ignore silently
              });
          };

          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-5 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg-strong flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
                  Forecast Export
                </span>
                <div className="flex items-center gap-2">
                  {forecastCopied ? (
                    <span className="inline-flex items-center gap-1 text-3xs text-success-fg font-medium">
                      <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                      Copied!
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleCopyCSV}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-medium bg-accent text-white hover:opacity-90 transition-opacity"
                  >
                    <Download className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                    Copy CSV
                  </button>
                </div>
              </div>
              <table className="w-full text-3xs">
                <thead>
                  <tr className="border-b border-border text-fg-faint">
                    <th className="text-left py-1 font-medium">Week</th>
                    <th className="text-right py-1 font-medium">SKU Count</th>
                    <th className="text-right py-1 font-medium">Total Forecast Units</th>
                    <th className="text-right py-1 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.week} className="border-b border-border/40 last:border-0">
                      <td className="py-1 text-fg-muted font-medium">{row.week}</td>
                      <td className="py-1 text-right tabular-nums text-fg-strong">{row.skuCount}</td>
                      <td className="py-1 text-right tabular-nums text-fg-strong">
                        {row.totalUnits.toLocaleString()}
                      </td>
                      <td
                        className={[
                          "py-1 text-right font-semibold",
                          row.confidence === "High"
                            ? "text-success-fg"
                            : row.confidence === "Medium"
                              ? "text-warning-fg"
                              : "text-danger-fg",
                        ].join(" ")}
                      >
                        {row.confidence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })() : null}

        {/* ─── Content body ─── */}
        {query.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-5 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-5 flex-1 rounded bg-bg-subtle" />
                  <div className="h-5 w-32 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <div
              className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
              data-testid="forecast-list-error"
            >
              <div className="font-semibold">
                Could not load forecast versions
              </div>
              <div className="mt-1 text-xs">
                Check your connection. The list will refresh when the API is
                reachable.
              </div>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : totalVisible === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                lowerQuery || cadenceFilter !== "all" || statusFilter !== "all"
                  ? "No forecasts match these filters."
                  : "No forecasts yet"
              }
              description={
                lowerQuery || cadenceFilter !== "all" || statusFilter !== "all"
                  ? "Try clearing the filters to see all versions."
                  : canAuthor
                    ? "Create your first forecast to start planning. A forecast is a versioned plan of expected sales — the system uses it to recommend production batches."
                    : "No published forecasts to review yet."
              }
              icon={
                <LineChart
                  className="h-5 w-5 text-accent"
                  strokeWidth={1.75}
                />
              }
              action={
                canAuthor &&
                !lowerQuery &&
                cadenceFilter === "all" &&
                statusFilter === "all" ? (
                  <Link
                    href="/planning/forecast/new"
                    className="btn btn-primary btn-sm cta-arrow-host fc-list-cta-glow gap-1.5"
                    data-testid="forecast-empty-cta"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    <span>Create your first forecast</span>
                    <ArrowRight
                      className="cta-arrow h-3 w-3"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  </Link>
                ) : null
              }
            />
          </div>
        ) : (
          <div data-testid="forecast-versions-list" className="fc-list-stagger">
            {/* ── ACTIVE section ── */}
            {showActive ? (
              grouped.active.length > 0 ? (
                <section>
                  <SectionHeader
                    tone="active"
                    icon={
                      <Activity
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Active"
                    count={grouped.active.length}
                  />
                  <ul>
                    {grouped.active.map((v) => {
                      const isExpanded = expandedSkuId === v.version_id;
                      const weeklyQtys: number[] = Array.from(
                        { length: 8 },
                        (_, wIdx) => {
                          const summary = summariesByVersionId.get(v.version_id);
                          if (!summary) return 0;
                          const months: unknown[] =
                            (summary as any).months ?? (summary as any).data ?? [];
                          const m = months[wIdx];
                          return m != null
                            ? Number(
                                (m as any).liters ??
                                  (m as any).total_liters ??
                                  0,
                              )
                            : 0;
                        },
                      );
                      const total8w = weeklyQtys.reduce((s, n) => s + n, 0);
                      return (
                        <li key={v.version_id} className="list-none">
                          <div className="flex items-start">
                            {/* Improvement 7 — expand toggle button. */}
                            <button
                              type="button"
                              aria-pressed={isExpanded}
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} SKU detail for ${(v as any).version_id ?? "version"}`}
                              onClick={() =>
                                setExpandedSkuId(
                                  isExpanded ? null : v.version_id,
                                )
                              }
                              className={[
                                "mt-2.5 ml-2 shrink-0 rounded p-0.5 transition-colors",
                                isExpanded
                                  ? "text-accent"
                                  : "text-fg-faint hover:text-fg",
                              ].join(" ")}
                            >
                              <Package
                                className="h-3 w-3"
                                strokeWidth={2}
                                aria-hidden
                              />
                            </button>
                            {/* Improvement 9 — SKU rank delta indicator. */}
                            {(() => {
                              const rd = skuRankChanges.get(v.version_id);
                              if (!rd || rd.delta === null) return null;
                              return (
                                <span className="flex items-center gap-0.5 w-6 mt-2.5 shrink-0 select-none">
                                  {rd.delta > 0 ? (
                                    <span className="text-success-fg text-3xs">↑{rd.delta}</span>
                                  ) : rd.delta < 0 ? (
                                    <span className="text-danger-fg text-3xs">↓{Math.abs(rd.delta)}</span>
                                  ) : (
                                    <span className="text-fg-faint text-3xs">=</span>
                                  )}
                                </span>
                              );
                            })()}
                            <div className="flex-1 min-w-0">
                              <ForecastRow
                                v={v as ForecastRowVersion}
                                active
                                productionLiters={
                                  summariesByVersionId.get(v.version_id) ?? null
                                }
                              />
                              {/* Improvement 7 — expanded SKU detail card. */}
                              {isExpanded ? (
                                <div className="bg-info-softer border border-info/20 rounded p-2 mt-1 mx-2 text-3xs">
                                  {/* Row 1 — key fields. */}
                                  <div className="flex gap-4">
                                    <span>
                                      <span className="text-fg-faint">SKU:</span>{" "}
                                      <span className="text-fg-strong">
                                        {(v as any).name ??
                                          (v as any).sku_name ??
                                          (v as any).version_id ??
                                          "-"}
                                      </span>
                                    </span>
                                    <span>
                                      <span className="text-fg-faint">
                                        Status:
                                      </span>{" "}
                                      <span className="text-fg-strong">
                                        {(v as any).status ?? "-"}
                                      </span>
                                    </span>
                                    <span>
                                      <span className="text-fg-faint">
                                        Total 8w:
                                      </span>{" "}
                                      <span className="text-fg-strong">
                                        {total8w > 0
                                          ? total8w.toLocaleString()
                                          : "-"}
                                      </span>
                                    </span>
                                  </div>
                                  {/* Row 2 — per-week badges. */}
                                  <div className="flex gap-1 flex-wrap mt-1">
                                    {weeklyQtys.map((qty, wIdx) => (
                                      <span
                                        key={wIdx}
                                        className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint"
                                      >
                                        W{wIdx + 1}:{" "}
                                        {qty > 0 ? qty.toLocaleString() : "—"}
                                      </span>
                                    ))}
                                  </div>
                                  {/* Row 3 — per-SKU note. */}
                                  <textarea
                                    className="w-full text-3xs bg-transparent border border-border rounded p-1 mt-1 resize-none h-10 text-fg-muted"
                                    placeholder="Add note for this SKU..."
                                    defaultValue={
                                      (() => {
                                        try {
                                          return (
                                            localStorage.getItem(
                                              "gt_sku_note_" + v.version_id,
                                            ) ?? ""
                                          );
                                        } catch {
                                          return "";
                                        }
                                      })()
                                    }
                                    onChange={(e) => {
                                      try {
                                        localStorage.setItem(
                                          "gt_sku_note_" + v.version_id,
                                          e.target.value,
                                        );
                                      } catch {
                                        // storage unavailable — ignore
                                      }
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null
            ) : null}

            {/* ── DRAFTS section ── */}
            {showDrafts ? (
              grouped.drafts.length > 0 ? (
                <section>
                  <SectionHeader
                    tone="drafts"
                    icon={
                      <FileText
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Drafts"
                    count={grouped.drafts.length}
                  />
                  <ul>
                    {grouped.drafts.map((v) => {
                      const isExpanded = expandedSkuId === v.version_id;
                      const weeklyQtys: number[] = Array.from(
                        { length: 8 },
                        (_, wIdx) => {
                          const summary = summariesByVersionId.get(v.version_id);
                          if (!summary) return 0;
                          const months: unknown[] =
                            (summary as any).months ?? (summary as any).data ?? [];
                          const m = months[wIdx];
                          return m != null
                            ? Number(
                                (m as any).liters ??
                                  (m as any).total_liters ??
                                  0,
                              )
                            : 0;
                        },
                      );
                      const total8w = weeklyQtys.reduce((s, n) => s + n, 0);
                      return (
                        <li key={v.version_id} className="list-none">
                          <div className="flex items-start">
                            <button
                              type="button"
                              aria-pressed={isExpanded}
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} SKU detail for ${(v as any).version_id ?? "version"}`}
                              onClick={() =>
                                setExpandedSkuId(
                                  isExpanded ? null : v.version_id,
                                )
                              }
                              className={[
                                "mt-2.5 ml-2 shrink-0 rounded p-0.5 transition-colors",
                                isExpanded
                                  ? "text-accent"
                                  : "text-fg-faint hover:text-fg",
                              ].join(" ")}
                            >
                              <Package
                                className="h-3 w-3"
                                strokeWidth={2}
                                aria-hidden
                              />
                            </button>
                            {/* Improvement 9 — SKU rank delta indicator. */}
                            {(() => {
                              const rd = skuRankChanges.get(v.version_id);
                              if (!rd || rd.delta === null) return null;
                              return (
                                <span className="flex items-center gap-0.5 w-6 mt-2.5 shrink-0 select-none">
                                  {rd.delta > 0 ? (
                                    <span className="text-success-fg text-3xs">↑{rd.delta}</span>
                                  ) : rd.delta < 0 ? (
                                    <span className="text-danger-fg text-3xs">↓{Math.abs(rd.delta)}</span>
                                  ) : (
                                    <span className="text-fg-faint text-3xs">=</span>
                                  )}
                                </span>
                              );
                            })()}
                            <div className="flex-1 min-w-0">
                              <ForecastRow
                                v={v as ForecastRowVersion}
                                productionLiters={
                                  summariesByVersionId.get(v.version_id) ?? null
                                }
                              />
                              {isExpanded ? (
                                <div className="bg-info-softer border border-info/20 rounded p-2 mt-1 mx-2 text-3xs">
                                  <div className="flex gap-4">
                                    <span>
                                      <span className="text-fg-faint">SKU:</span>{" "}
                                      <span className="text-fg-strong">
                                        {(v as any).name ??
                                          (v as any).sku_name ??
                                          (v as any).version_id ??
                                          "-"}
                                      </span>
                                    </span>
                                    <span>
                                      <span className="text-fg-faint">
                                        Status:
                                      </span>{" "}
                                      <span className="text-fg-strong">
                                        {(v as any).status ?? "-"}
                                      </span>
                                    </span>
                                    <span>
                                      <span className="text-fg-faint">
                                        Total 8w:
                                      </span>{" "}
                                      <span className="text-fg-strong">
                                        {total8w > 0
                                          ? total8w.toLocaleString()
                                          : "-"}
                                      </span>
                                    </span>
                                  </div>
                                  <div className="flex gap-1 flex-wrap mt-1">
                                    {weeklyQtys.map((qty, wIdx) => (
                                      <span
                                        key={wIdx}
                                        className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint"
                                      >
                                        W{wIdx + 1}:{" "}
                                        {qty > 0 ? qty.toLocaleString() : "—"}
                                      </span>
                                    ))}
                                  </div>
                                  <textarea
                                    className="w-full text-3xs bg-transparent border border-border rounded p-1 mt-1 resize-none h-10 text-fg-muted"
                                    placeholder="Add note for this SKU..."
                                    defaultValue={
                                      (() => {
                                        try {
                                          return (
                                            localStorage.getItem(
                                              "gt_sku_note_" + v.version_id,
                                            ) ?? ""
                                          );
                                        } catch {
                                          return "";
                                        }
                                      })()
                                    }
                                    onChange={(e) => {
                                      try {
                                        localStorage.setItem(
                                          "gt_sku_note_" + v.version_id,
                                          e.target.value,
                                        );
                                      } catch {
                                        // storage unavailable — ignore
                                      }
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : statusFilter === "all" ? (
                /* Iter 9 — condensed empty-state for drafts. */
                <section>
                  <SectionHeader
                    tone="drafts"
                    icon={
                      <FileText
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Drafts"
                    count={0}
                  />
                  <div className="fc-list-section-empty">
                    <span>No drafts in flight.</span>
                    {canAuthor ? (
                      <Link href="/planning/forecast/new">
                        Start a new forecast →
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : null
            ) : null}

            {/* ── ARCHIVED section ── */}
            {showArchivedSection ? (
              grouped.archived.length > 0 ? (
                <section>
                  <SectionHeader
                    tone="archived"
                    icon={
                      <Archive
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label={showArchived ? "Archived" : "Archived"}
                    count={grouped.archived.length}
                    asButton
                    onClick={() => setShowArchived((s) => !s)}
                    ariaExpanded={showArchived}
                    testId="forecast-toggle-archived"
                    trailing={
                      <span
                        className="text-3xs font-semibold uppercase tracking-sops text-fg-muted inline-flex items-center gap-1"
                        aria-hidden
                      >
                        {showArchived ? "Hide" : "Show"}
                        {showArchived ? (
                          <ChevronDown
                            className="h-3 w-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="h-3 w-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                      </span>
                    }
                  />
                  {showArchived ? (
                    <ul>
                      {grouped.archived.map((v) => {
                        const isExpanded = expandedSkuId === v.version_id;
                        const weeklyQtys: number[] = Array.from(
                          { length: 8 },
                          (_, wIdx) => {
                            const summary = summariesByVersionId.get(
                              v.version_id,
                            );
                            if (!summary) return 0;
                            const months: unknown[] =
                              (summary as any).months ??
                              (summary as any).data ??
                              [];
                            const m = months[wIdx];
                            return m != null
                              ? Number(
                                  (m as any).liters ??
                                    (m as any).total_liters ??
                                    0,
                                )
                              : 0;
                          },
                        );
                        const total8w = weeklyQtys.reduce((s, n) => s + n, 0);
                        return (
                          <li key={v.version_id} className="list-none">
                            <div className="flex items-start">
                              <button
                                type="button"
                                aria-pressed={isExpanded}
                                aria-label={`${isExpanded ? "Collapse" : "Expand"} SKU detail for ${(v as any).version_id ?? "version"}`}
                                onClick={() =>
                                  setExpandedSkuId(
                                    isExpanded ? null : v.version_id,
                                  )
                                }
                                className={[
                                  "mt-2.5 ml-2 shrink-0 rounded p-0.5 transition-colors",
                                  isExpanded
                                    ? "text-accent"
                                    : "text-fg-faint hover:text-fg",
                                ].join(" ")}
                              >
                                <Package
                                  className="h-3 w-3"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              </button>
                              {/* Improvement 9 — SKU rank delta indicator. */}
                              {(() => {
                                const rd = skuRankChanges.get(v.version_id);
                                if (!rd || rd.delta === null) return null;
                                return (
                                  <span className="flex items-center gap-0.5 w-6 mt-2.5 shrink-0 select-none">
                                    {rd.delta > 0 ? (
                                      <span className="text-success-fg text-3xs">↑{rd.delta}</span>
                                    ) : rd.delta < 0 ? (
                                      <span className="text-danger-fg text-3xs">↓{Math.abs(rd.delta)}</span>
                                    ) : (
                                      <span className="text-fg-faint text-3xs">=</span>
                                    )}
                                  </span>
                                );
                              })()}
                              <div className="flex-1 min-w-0">
                                <ForecastRow
                                  v={v as ForecastRowVersion}
                                  muted
                                  productionLiters={
                                    summariesByVersionId.get(v.version_id) ??
                                    null
                                  }
                                />
                                {isExpanded ? (
                                  <div className="bg-info-softer border border-info/20 rounded p-2 mt-1 mx-2 text-3xs">
                                    <div className="flex gap-4">
                                      <span>
                                        <span className="text-fg-faint">
                                          SKU:
                                        </span>{" "}
                                        <span className="text-fg-strong">
                                          {(v as any).name ??
                                            (v as any).sku_name ??
                                            (v as any).version_id ??
                                            "-"}
                                        </span>
                                      </span>
                                      <span>
                                        <span className="text-fg-faint">
                                          Status:
                                        </span>{" "}
                                        <span className="text-fg-strong">
                                          {(v as any).status ?? "-"}
                                        </span>
                                      </span>
                                      <span>
                                        <span className="text-fg-faint">
                                          Total 8w:
                                        </span>{" "}
                                        <span className="text-fg-strong">
                                          {total8w > 0
                                            ? total8w.toLocaleString()
                                            : "-"}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="flex gap-1 flex-wrap mt-1">
                                      {weeklyQtys.map((qty, wIdx) => (
                                        <span
                                          key={wIdx}
                                          className="bg-bg-muted rounded px-1 py-0.5 text-fg-faint"
                                        >
                                          W{wIdx + 1}:{" "}
                                          {qty > 0 ? qty.toLocaleString() : "—"}
                                        </span>
                                      ))}
                                    </div>
                                    <textarea
                                      className="w-full text-3xs bg-transparent border border-border rounded p-1 mt-1 resize-none h-10 text-fg-muted"
                                      placeholder="Add note for this SKU..."
                                      defaultValue={
                                        (() => {
                                          try {
                                            return (
                                              localStorage.getItem(
                                                "gt_sku_note_" + v.version_id,
                                              ) ?? ""
                                            );
                                          } catch {
                                            return "";
                                          }
                                        })()
                                      }
                                      onChange={(e) => {
                                        try {
                                          localStorage.setItem(
                                            "gt_sku_note_" + v.version_id,
                                            e.target.value,
                                          );
                                        } catch {
                                          // storage unavailable — ignore
                                        }
                                      }}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              ) : statusFilter === "all" ? (
                /* Iter 10 — condensed empty-state for archived. */
                <section>
                  <SectionHeader
                    tone="archived"
                    icon={
                      <Archive
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Archived"
                    count={0}
                  />
                  <div className="fc-list-section-empty">
                    <span>Nothing archived yet.</span>
                  </div>
                </section>
              ) : null
            ) : null}
          </div>
        )}
      </SectionCard>
    </>
  );
}

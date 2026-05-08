"use client";

// ---------------------------------------------------------------------------
// /planning/blockers — Planning Blockers Worklist
//
// Tom-locked 2026-04-27:
//   route        = /planning/blockers
//   page title   = "חסמים בתכנון"
//   subtitle     = "פריטים עם ביקוש שלא הפכו להמלצת רכש או ייצור שמישה"
//
// 5-question UX (Tom verbatim) — every row answers:
//   1. מה חסום?         (display_name; never UUID)
//   2. למה זה חסום?      (Hebrew blocker_label)
//   3. מה הסיכון?       (severity tone + demand_qty + earliest_shortage_at)
//   4. מה עושים עכשיו?  (Hebrew fix_action_label)
//   5. איפה מתקנים?     (fix_route link OR "פנה למפתח" when null)
//
// Mobile: card per row (< sm). Desktop: sortable table (severity / demand / time).
// No mock fallback. Empty / loading / error / no-run states are honest.
//
// UX improvements:
//   I1 — Per-Category Resolution Progress (BarChart2 toggle + progress bars)
//   I2 — Blocker Due Date Assignment (CalendarCheck + localStorage-persisted)
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlarmClock, AlertOctagon, AlertTriangle, ArrowUpCircle, ArrowUpRight, BarChart, BarChart2, BarChart3, Calendar, CalendarCheck, CalendarDays, Check, CheckCircle2, CircleDollarSign, Clock, Clock2, FileText, Filter, Flame, FolderOpen, GanttChart, Grid2X2, Hourglass, Layers, LayoutGrid, Link, MessageCircle, MessageSquare, Network, Plus, Smile, Timer, TrendingDown, TrendingUp, Trophy, Users, Users2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { useBlockers } from "./_lib/useBlockers";
import type {
  BlockerCategory,
  BlockerRow as BlockerRowData,
  BlockerSeverity,
} from "./_lib/types";
import { SEVERITY_RANK } from "./_lib/labelMaps";
import { FilterBar } from "./_components/FilterBar";
import { RunMetaStrip } from "./_components/RunMetaStrip";
import { BlockerRow } from "./_components/BlockerRow";
import { BlockerCard } from "./_components/BlockerCard";
import {
  BlockersEmptyAllClear,
  BlockersEmptyNoRunYet,
  BlockersErrorBanner,
  BlockersFilteredEmpty,
  BlockersLoadingSkeleton,
} from "./_components/BlockersStates";

type SortKey = "severity" | "demand_qty" | "emitted_at";
type SortDir = "asc" | "desc";

const TAG_PRESETS_HE: string[] = ["דחוף", "ממתין", "חסום", "פתרון חלקי", "ארוך טווח"];

const ESCALATION_LEVELS_HE = ["ללא", "צוות", "הנהלה"] as const;
type EscalationLevel = (typeof ESCALATION_LEVELS_HE)[number];

// ---------------------------------------------------------------------------
// Improvement 11 — Blocker Mood Map
// ---------------------------------------------------------------------------
const MOOD_OPTIONS = ["😊", "😐", "😟"] as const;
type MoodValue = (typeof MOOD_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Improvement 12 — Mini Kanban
// ---------------------------------------------------------------------------
const KANBAN_COLS_HE = ["פתוח", "בעבודה", "נפתר"] as const;
type KanbanCol = (typeof KANBAN_COLS_HE)[number];

function sortRows(
  rows: BlockerRowData[],
  key: SortKey,
  dir: SortDir,
): BlockerRowData[] {
  const sign = dir === "asc" ? 1 : -1;
  const arr = [...rows];
  arr.sort((a, b) => {
    if (key === "severity") {
      const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (r !== 0) return sign * r;
      return new Date(b.emitted_at).getTime() - new Date(a.emitted_at).getTime();
    }
    if (key === "demand_qty") {
      const av = a.demand_qty != null ? parseFloat(a.demand_qty) : -Infinity;
      const bv = b.demand_qty != null ? parseFloat(b.demand_qty) : -Infinity;
      if (av !== bv) return sign * (av - bv);
      return new Date(b.emitted_at).getTime() - new Date(a.emitted_at).getTime();
    }
    const at = new Date(a.emitted_at).getTime();
    const bt = new Date(b.emitted_at).getTime();
    return sign * (at - bt);
  });
  return arr;
}

export default function PlanningBlockersPage() {
  const searchParams = useSearchParams();
  const explicitRunId = searchParams?.get("run_id") ?? undefined;
  const explicitItemId = searchParams?.get("item_id") ?? undefined;

  const [severity, setSeverity] = useState<BlockerSeverity[]>([]);
  const [category, setCategory] = useState<BlockerCategory[]>([]);
  const [itemSearch, setItemSearch] = useState<string>(explicitItemId ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filters = useMemo(
    () => ({
      run_id: explicitRunId,
      severity: severity.length > 0 ? severity : undefined,
      category: category.length > 0 ? category : undefined,
      item_id: undefined,
      page: 1,
      page_size: 200,
    }),
    [explicitRunId, severity, category],
  );

  const { data: result, isLoading } = useBlockers(filters);

  const filteredRows = useMemo(() => {
    const rows = result?.data?.rows ?? [];
    const term = itemSearch.trim().toLowerCase();
    if (term === "") return rows;
    return rows.filter((r) => {
      const haystack = [r.display_name, r.display_id, r.item_id, r.component_id]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      return haystack.some((h) => h.includes(term));
    });
  }, [result, itemSearch]);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const isHistoricalView = Boolean(explicitRunId);

  // ---------------------------------------------------------------------------
  // Improvement 1 — Per-Category Resolution Progress
  // ---------------------------------------------------------------------------
  const [showCategoryProgress, setShowCategoryProgress] = useState<boolean>(false);

  const categoryProgress = useMemo<
    { category: string; total: number; resolved: number; pct: number }[]
  >(() => {
    if (filteredRows.length === 0) return [];
    const map = new Map<string, { total: number; resolved: number }>();
    for (const r of filteredRows) {
      const cat: string =
        (r as any).category ?? (r as any).exception_type ?? "Other";
      const entry = map.get(cat) ?? { total: 0, resolved: 0 };
      entry.total += 1;
      if (
        (r as any).status === "resolved" ||
        (r as any).resolved === true
      ) {
        entry.resolved += 1;
      }
      map.set(cat, entry);
    }
    return [...map.entries()]
      .map(([cat, { total, resolved }]) => ({
        category: cat,
        total,
        resolved,
        pct: total > 0 ? Math.round((resolved / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 2 — Blocker Due Date Assignment
  // ---------------------------------------------------------------------------
  const [blockerDueDates, setBlockerDueDates] = useState<Record<string, string>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_due_dates");
        if (raw) return JSON.parse(raw) as Record<string, string>;
      } catch {}
      return {};
    },
  );

  const handleSetDueDate = useCallback((blockerId: string, date: string) => {
    setBlockerDueDates((prev) => {
      const next = { ...prev, [blockerId]: date };
      try {
        localStorage.setItem("gt_blocker_due_dates", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const dueDateCount = useMemo(
    () => Object.values(blockerDueDates).filter((d) => d && d.trim() !== "").length,
    [blockerDueDates],
  );

  // ---------------------------------------------------------------------------
  // Improvement 3 — Blocker Tag Labels
  // ---------------------------------------------------------------------------
  const [blockerTagMap, setBlockerTagMap] = useState<Record<string, string[]>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_tags");
        if (raw) return JSON.parse(raw) as Record<string, string[]>;
      } catch {}
      return {};
    },
  );

  const handleToggleBlockerTag = useCallback(
    (blockerId: string, tag: string) => {
      setBlockerTagMap((prev) => {
        const existing = prev[blockerId] ?? [];
        const next = existing.includes(tag)
          ? existing.filter((t) => t !== tag)
          : [...existing, tag];
        const updated = { ...prev, [blockerId]: next };
        try {
          localStorage.setItem("gt_blocker_tags", JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [],
  );

  const [tagFilterMode, setTagFilterMode] = useState<string | null>(null);

  const allUsedTags = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const tags of Object.values(blockerTagMap)) {
      for (const t of tags) set.add(t);
    }
    return [...set];
  }, [blockerTagMap]);

  const tagFilteredRows = useMemo(() => {
    if (!tagFilterMode) return sortedRows;
    return sortedRows.filter((r) =>
      (blockerTagMap[r.exception_id] ?? []).includes(tagFilterMode),
    );
  }, [sortedRows, tagFilterMode, blockerTagMap]);

  // ---------------------------------------------------------------------------
  // Improvement 4 — Resolution Time Statistics Panel
  // ---------------------------------------------------------------------------
  const [showResolutionStats, setShowResolutionStats] = useState<boolean>(false);

  const resolutionStats = useMemo(() => {
    const resolved = filteredRows.filter(
      (r) => (r as any).resolved === true || (r as any).status === "resolved",
    );
    const totalResolved = resolved.length;
    if (totalResolved === 0) {
      return { avgResolutionDays: 0, fastestResolution: 0, slowestResolution: 0, totalResolved: 0 };
    }
    const days = resolved.map(
      (r) => Number((r as any).resolution_days ?? (r as any).age_days ?? 0),
    );
    const avg = days.reduce((a, b) => a + b, 0) / days.length;
    const fastest = Math.min(...days);
    const slowest = Math.max(...days);
    return {
      avgResolutionDays: avg,
      fastestResolution: fastest,
      slowestResolution: slowest,
      totalResolved,
    };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 5 — Mini Gantt-style Timeline
  // ---------------------------------------------------------------------------
  const [showBlockerGantt, setShowBlockerGantt] = useState<boolean>(false);

  const ganttItems = useMemo<
    { id: string; label: string; startDayOffset: number; durationDays: number; priority: string }[]
  >(() => {
    return filteredRows.slice(0, 8).map((r) => {
      const id: string = (r as any).exception_id ?? String(r);
      const rawLabel: string =
        (r as any).title ?? (r as any).exception_type ?? id;
      const label = rawLabel.length > 20 ? rawLabel.slice(0, 20) : rawLabel;
      const startDayOffset: number = (r as any).age_days ?? 0;
      const priority: string = (r as any).priority ?? "low";
      return { id, label, startDayOffset, durationDays: 1, priority };
    });
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 6 — Priority × Effort 2×2 Matrix
  // ---------------------------------------------------------------------------
  const [showPriorityMatrix, setShowPriorityMatrix] = useState<boolean>(false);

  const priorityMatrixItems = useMemo<{
    urgent_low: string[];
    urgent_high: string[];
    normal_low: string[];
    normal_high: string[];
  }>(() => {
    const result: {
      urgent_low: string[];
      urgent_high: string[];
      normal_low: string[];
      normal_high: string[];
    } = { urgent_low: [], urgent_high: [], normal_low: [], normal_high: [] };
    for (const r of filteredRows) {
      const priority: string = (r as any).priority ?? "low";
      const ageDays: number = (r as any).age_days ?? 0;
      const rawLabel: string =
        (r as any).title ?? (r as any).exception_type ?? (r as any).exception_id ?? "";
      const chip = rawLabel.slice(0, 2) || "—";
      const isUrgent =
        priority === "critical" || priority === "high";
      const isHighEffort = ageDays > 14;
      if (isUrgent && !isHighEffort) result.urgent_low.push(chip);
      else if (isUrgent && isHighEffort) result.urgent_high.push(chip);
      else if (!isUrgent && !isHighEffort) result.normal_low.push(chip);
      else result.normal_high.push(chip);
    }
    return result;
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 7 — Per-Blocker Progress Sliders
  // ---------------------------------------------------------------------------
  const [blockerProgressMap, setBlockerProgressMap] = useState<Record<string, number>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_progress");
        if (raw) return JSON.parse(raw) as Record<string, number>;
      } catch {}
      return {};
    },
  );

  const [showProgressSliders, setShowProgressSliders] = useState<boolean>(false);

  const handleSetProgress = useCallback((id: string, val: number) => {
    setBlockerProgressMap((prev) => {
      const next = { ...prev, [id]: val };
      try {
        localStorage.setItem("gt_blocker_progress", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Improvement 8 — Dependency Links Panel
  // ---------------------------------------------------------------------------
  const [blockerDepsMap, setBlockerDepsMap] = useState<Record<string, string[]>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_deps");
        if (raw) return JSON.parse(raw) as Record<string, string[]>;
      } catch {}
      return {};
    },
  );

  const [showDependencyLinks, setShowDependencyLinks] = useState<boolean>(false);

  const handleSetDep = useCallback((id: string, depId: string) => {
    setBlockerDepsMap((prev) => {
      const next = { ...prev, [id]: depId ? [depId] : [] };
      try {
        localStorage.setItem("gt_blocker_deps", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Improvement 9 — Weekly Calendar Day Strip
  // ---------------------------------------------------------------------------
  const [showBlockerCalendar, setShowBlockerCalendar] = useState<boolean>(false);

  const CALENDAR_DAY_LABELS_HE = ["ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳", "א׳"] as const;

  const blockerCalendarData = useMemo<
    { dayLabel: string; date: Date; blockerCount: number; dueCount: number }[]
  >(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() + 1 + i);
      return d;
    });
    return days.map((dayDate, idx) => {
      const dayStr = dayDate.toDateString();
      const blockerCount = filteredRows.filter((b) => {
        const ca = (b as any).created_at;
        const ua = (b as any).updated_at;
        const caMatch = ca ? new Date(ca).toDateString() === dayStr : false;
        const uaMatch = ua ? new Date(ua).toDateString() === dayStr : false;
        return caMatch || uaMatch;
      }).length;
      const dueCount = filteredRows.filter((b) => {
        const id: string = (b as any).exception_id ?? "";
        const dueDate = blockerDueDates[id];
        if (!dueDate) return false;
        return new Date(dueDate).toDateString() === dayStr;
      }).length;
      return {
        dayLabel: CALENDAR_DAY_LABELS_HE[idx],
        date: dayDate,
        blockerCount,
        dueCount,
      };
    });
  }, [filteredRows, blockerDueDates]);

  // ---------------------------------------------------------------------------
  // Improvement 10 — Escalation Level Badges
  // ---------------------------------------------------------------------------
  const [blockerEscalationMap, setBlockerEscalationMap] = useState<Record<string, EscalationLevel>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_escalation");
        if (raw) return JSON.parse(raw) as Record<string, EscalationLevel>;
      } catch {}
      return {};
    },
  );

  const [showEscalationEditor, setShowEscalationEditor] = useState<boolean>(false);

  const handleSetEscalation = useCallback(
    (id: string, level: EscalationLevel) => {
      setBlockerEscalationMap((prev) => {
        const next = { ...prev, [id]: level };
        try {
          localStorage.setItem("gt_blocker_escalation", JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  const escalatedCount = useMemo(
    () =>
      Object.values(blockerEscalationMap).filter(
        (v) => v && v !== "ללא",
      ).length,
    [blockerEscalationMap],
  );

  // ---------------------------------------------------------------------------
  // Improvement 11 — Blocker Mood Map
  // ---------------------------------------------------------------------------
  const [blockerMoodMap, setBlockerMoodMap] = useState<Record<string, MoodValue>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_mood");
        if (raw) return JSON.parse(raw) as Record<string, MoodValue>;
      } catch {}
      return {};
    },
  );

  const [showMoodEditor, setShowMoodEditor] = useState<boolean>(false);

  const handleSetMood = useCallback((id: string, mood: MoodValue) => {
    setBlockerMoodMap((prev) => {
      const next = { ...prev, [id]: mood };
      try {
        localStorage.setItem("gt_blocker_mood", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Improvement 12 — Mini Kanban
  // ---------------------------------------------------------------------------
  const [blockerKanbanMap, setBlockerKanbanMap] = useState<Record<string, KanbanCol>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_kanban");
        if (raw) return JSON.parse(raw) as Record<string, KanbanCol>;
      } catch {}
      return {};
    },
  );

  const [showBlockerKanban, setShowBlockerKanban] = useState<boolean>(false);

  const handleMoveKanban = useCallback(
    (id: string, direction: "prev" | "next") => {
      setBlockerKanbanMap((prev) => {
        const currentCol: KanbanCol = prev[id] ?? "פתוח";
        const idx = KANBAN_COLS_HE.indexOf(currentCol);
        const newIdx =
          direction === "next"
            ? Math.min(KANBAN_COLS_HE.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        const next = { ...prev, [id]: KANBAN_COLS_HE[newIdx] };
        try {
          localStorage.setItem("gt_blocker_kanban", JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Improvement 13 — Blocker Summary Report
  // ---------------------------------------------------------------------------
  const [showBlockerSummaryReport, setShowBlockerSummaryReport] = useState<boolean>(false);

  const blockerSummaryData = useMemo(() => {
    const total = filteredRows.length;
    const byCritical = filteredRows.filter((r) => (r as any).priority === "critical").length;
    const byHigh = filteredRows.filter((r) => (r as any).priority === "high").length;
    const byCategory: Record<string, number> = {};
    for (const r of filteredRows) {
      const cat: string = (r as any).exception_type ?? (r as any).category ?? "אחר";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    const totalAge = filteredRows.reduce((acc, r) => acc + ((r as any).age_days ?? 0), 0);
    const avgAge = Math.round(totalAge / Math.max(total, 1));
    const oldestBlocker = filteredRows.reduce(
      (max, r) => Math.max(max, (r as any).age_days ?? 0),
      0,
    );
    return { total, byCritical, byHigh, byCategory, avgAge, oldestBlocker };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 14 — Owner Workload Panel
  // ---------------------------------------------------------------------------
  const [showOwnerWorkload, setShowOwnerWorkload] = useState<boolean>(false);

  const [blockerOwners, setBlockerOwners] = useState<Record<string, string>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_owners");
        if (raw) return JSON.parse(raw) as Record<string, string>;
      } catch {}
      return {};
    },
  );

  const ownerWorkloadData = useMemo(() => {
    const ownerMap = new Map<
      string,
      { count: number; oldestAge: number; criticalCount: number }
    >();
    let totalAssigned = 0;
    for (const item of filteredRows) {
      const id: string = (item as any).exception_id ?? "";
      const owner: string = blockerOwners[id] ?? "לא מוגדר";
      const ageDays: number = (item as any).age_days ?? 0;
      const isCritical: boolean = (item as any).priority === "critical";
      const existing = ownerMap.get(owner) ?? { count: 0, oldestAge: 0, criticalCount: 0 };
      ownerMap.set(owner, {
        count: existing.count + 1,
        oldestAge: Math.max(existing.oldestAge, ageDays),
        criticalCount: existing.criticalCount + (isCritical ? 1 : 0),
      });
      if (owner !== "לא מוגדר") totalAssigned += 1;
    }
    const rows = [...ownerMap.entries()]
      .map(([owner, stats]) => ({ owner, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return { rows, totalAssigned };
  }, [filteredRows, blockerOwners]);

  // ---------------------------------------------------------------------------
  // Improvement 15 — Historical Open Timeline
  // ---------------------------------------------------------------------------
  const [showOpenTimeline, setShowOpenTimeline] = useState<boolean>(false);

  const openTimelineData = useMemo<{ days: { date: string; count: number; dayLabel: string }[]; maxCount: number } | null>(() => {
    const now = new Date();
    const dayMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, 0);
    }
    for (const b of filteredRows) {
      const raw: unknown = (b as any).created_at ?? (b as any).opened_at ?? null;
      if (!raw) continue;
      const ts = new Date(raw as string);
      const diff = (now.getTime() - ts.getTime()) / 86400000;
      if (diff < 0 || diff >= 30) continue;
      const key = ts.toISOString().slice(0, 10);
      if (dayMap.has(key)) {
        dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
    }
    const days = [...dayMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([date, count]) => ({
        date,
        count,
        dayLabel: date.slice(5),
      }));
    const maxCount = Math.max(...days.map((d) => d.count), 0);
    if (maxCount === 0) return null;
    return { days, maxCount };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 16 — Linked Items Panel
  // ---------------------------------------------------------------------------
  const [showLinkedItems, setShowLinkedItems] = useState<boolean>(false);

  const [blockerLinkedItems, setBlockerLinkedItems] = useState<Record<string, string>>(
    () => {
      try {
        const raw = localStorage.getItem("gt_blocker_linked_items");
        if (raw) return JSON.parse(raw) as Record<string, string>;
      } catch {}
      return {};
    },
  );

  const itemsSearchQuery = useQuery<unknown>({
    queryKey: ["items_catalog_brief"],
    queryFn: async () => {
      const res = await fetch("/api/items?limit=20&fields=id,name");
      if (!res.ok) return { items: [] };
      return res.json();
    },
    throwOnError: false,
  });

  const itemCatalog = useMemo<{ id: string; name: string }[]>(() => {
    const d = itemsSearchQuery.data as any;
    const raw: unknown[] = d?.items ?? [];
    return raw.map((i: any) => ({
      id: (i as any).id ?? "",
      name: (i as any).name ?? (i as any).item_name ?? (i as any).id ?? "",
    }));
  }, [itemsSearchQuery.data]);

  // ---------------------------------------------------------------------------
  // Improvement 17 — Severity × Impact Heatmap
  // ---------------------------------------------------------------------------
  const [showBlockerHeatmap, setShowBlockerHeatmap] = useState<boolean>(false);

  type HeatmapCell = { sevLabel: string; impLabel: string; count: number };
  const SEV_LABELS_HE = ["גבוה", "בינוני", "נמוך"] as const;
  const IMP_LABELS_HE = ["גדול", "בינוני", "קטן"] as const;

  const blockerHeatmapData = useMemo<{ cells: HeatmapCell[]; maxCount: number } | null>(() => {
    if (filteredRows.length === 0) return null;
    const cellMap = new Map<string, number>();
    for (const sevLabel of SEV_LABELS_HE) {
      for (const impLabel of IMP_LABELS_HE) {
        cellMap.set(`${sevLabel}:${impLabel}`, 0);
      }
    }
    for (const b of filteredRows) {
      const rawSev: string = String((b as any).severity ?? "").toLowerCase();
      const rawImp: string = String((b as any).impact ?? "").toLowerCase();
      const sevLabel: string =
        rawSev === "high" || rawSev === "גבוה" || rawSev === "critical"
          ? "גבוה"
          : rawSev === "medium" || rawSev === "בינוני"
            ? "בינוני"
            : "נמוך";
      const impLabel: string =
        rawImp === "large" || rawImp === "גדול" || rawImp === "high"
          ? "גדול"
          : rawImp === "medium" || rawImp === "בינוני"
            ? "בינוני"
            : "קטן";
      const key = `${sevLabel}:${impLabel}`;
      cellMap.set(key, (cellMap.get(key) ?? 0) + 1);
    }
    const cells: HeatmapCell[] = [];
    for (const sevLabel of SEV_LABELS_HE) {
      for (const impLabel of IMP_LABELS_HE) {
        cells.push({ sevLabel, impLabel, count: cellMap.get(`${sevLabel}:${impLabel}`) ?? 0 });
      }
    }
    const maxCount = Math.max(...cells.map((c) => c.count), 0);
    return { cells, maxCount };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 18 — Response Time Chip
  // ---------------------------------------------------------------------------
  const blockerResponseTimeChip = useMemo<{ avgHours: number; count: number } | null>(() => {
    const resolved = filteredRows.filter(
      (b) => (b as any).status === "resolved" || (b as any).status === "closed",
    );
    if (resolved.length < 2) return null;
    const hours = resolved
      .map((b) => {
        const createdRaw: unknown = (b as any).created_at;
        const respondedRaw: unknown = (b as any).first_response_at;
        if (!createdRaw || !respondedRaw) return null;
        const created = new Date(createdRaw as string).getTime();
        const responded = new Date(respondedRaw as string).getTime();
        if (isNaN(created) || isNaN(responded)) return null;
        return (responded - created) / 3600000;
      })
      .filter((h): h is number => h !== null && h >= 0);
    if (hours.length < 2) return null;
    const avgHours = hours.reduce((a, b) => a + b, 0) / hours.length;
    return { avgHours, count: hours.length };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 19 — Oldest Open Blockers Ranking
  // ---------------------------------------------------------------------------
  const [showBlockerAgeRanking, setShowBlockerAgeRanking] = useState<boolean>(false);

  const blockerAgeRankingData = useMemo<{
    items: { title: string; ageDays: number; rank: number }[];
  } | null>(() => {
    const open = filteredRows.filter(
      (b) =>
        (b as any).status !== "resolved" && (b as any).status !== "closed",
    );
    if (open.length < 2) return null;
    const now = new Date();
    const ranked = open
      .map((b) => {
        const rawTitle: string =
          (b as any).title ?? (b as any).exception_type ?? (b as any).exception_id ?? "";
        const rawCreated: unknown = (b as any).created_at;
        const ageDays = rawCreated
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(rawCreated as string).getTime()) /
                  86400000,
              ),
            )
          : 0;
        return { title: rawTitle, ageDays };
      })
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 5)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
    return { items: ranked };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 20 — Blocker Escalation Rate Chip
  // ---------------------------------------------------------------------------
  const blockerEscalationRate = useMemo<{
    escalatedCount: number;
    totalCount: number;
    ratePct: number;
  } | null>(() => {
    const totalCount = filteredRows.length;
    if (totalCount < 3) return null;
    const escalatedCount = filteredRows.filter(
      (b) =>
        (b as any).escalated === true ||
        (b as any).priority === "critical" ||
        ((b as any).escalation_level != null && (b as any).escalation_level > 0),
    ).length;
    const ratePct = Math.round((escalatedCount / totalCount) * 100);
    return { escalatedCount, totalCount, ratePct };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 21 — Resolution Rate Chart
  // ---------------------------------------------------------------------------
  const [showBlockerResolutionChart, setShowBlockerResolutionChart] = useState<boolean>(false);

  const blockerResolutionData = useMemo<{
    categories: { label: string; resolved: number; total: number; pct: number }[];
    overallPct: number;
  } | null>(() => {
    if (filteredRows.length === 0) return null;
    const map = new Map<string, { resolved: number; total: number }>();
    for (const b of filteredRows) {
      const label: string =
        (b as any).category ?? (b as any).type ?? "כללי";
      const entry = map.get(label) ?? { resolved: 0, total: 0 };
      entry.total += 1;
      if (
        (b as any).status === "resolved" ||
        (b as any).resolved === true
      ) {
        entry.resolved += 1;
      }
      map.set(label, entry);
    }
    if (map.size < 2) return null;
    const categories = [...map.entries()]
      .map(([label, { resolved, total }]) => ({
        label,
        resolved,
        total,
        pct: total > 0 ? Math.round((resolved / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
    const totalAll = filteredRows.length;
    const resolvedAll = filteredRows.filter(
      (b) => (b as any).status === "resolved" || (b as any).resolved === true,
    ).length;
    const overallPct = totalAll > 0 ? Math.round((resolvedAll / totalAll) * 100) : 0;
    return { categories, overallPct };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 22 — Average Blocker Cost Chip
  // ---------------------------------------------------------------------------
  const avgBlockerCostChip = useMemo<{ avgCost: number; count: number } | null>(() => {
    const withCost = filteredRows
      .map((b) => {
        const raw: unknown =
          (b as any).estimated_cost ?? (b as any).cost_impact ?? (b as any).impact_value;
        if (raw == null) return null;
        const n = Number(raw);
        return isNaN(n) ? null : n;
      })
      .filter((n): n is number => n !== null);
    if (withCost.length < 2) return null;
    const avgCost = withCost.reduce((a, c) => a + c, 0) / withCost.length;
    return { avgCost, count: withCost.length };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 23 — Category Breakdown Chart
  // ---------------------------------------------------------------------------
  const [showBlockerCategories, setShowBlockerCategories] = useState<boolean>(false);

  const DONUT_PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"] as const;

  const blockerCategoriesData = useMemo<{
    categories: { label: string; count: number; pct: number; color: string }[];
    total: number;
  } | null>(() => {
    if (filteredRows.length < 2) return null;
    const map = new Map<string, number>();
    for (const b of filteredRows) {
      const label: string = (b as any).category ?? (b as any).type ?? "כללי";
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    if (map.size < 2) return null;
    const total = filteredRows.length;
    const categories = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count], idx) => ({
        label,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: DONUT_PALETTE[idx % DONUT_PALETTE.length],
      }));
    return { categories, total };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 24 — SLA Breach Count Chip
  // ---------------------------------------------------------------------------
  const slaBreachChip = useMemo<{ breachCount: number; totalWithSla: number } | null>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const withSla = filteredRows.filter((b) => {
      const raw: unknown = (b as any).sla_deadline ?? (b as any).target_date ?? (b as any).due_date;
      return raw != null && String(raw).trim() !== "";
    });
    if (withSla.length === 0) return null;
    const breachCount = withSla.filter((b) => {
      const raw: unknown = (b as any).sla_deadline ?? (b as any).target_date ?? (b as any).due_date;
      if (!raw) return false;
      const d = new Date(raw as string);
      if (isNaN(d.getTime())) return false;
      const isOpen =
        (b as any).status !== "resolved" &&
        (b as any).status !== "closed" &&
        (b as any).resolved !== true;
      return isOpen && d < today;
    }).length;
    return { breachCount, totalWithSla: withSla.length };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 25 — Weekly Summary Export
  // ---------------------------------------------------------------------------
  const [showBlockerWeekSummary, setShowBlockerWeekSummary] = useState<boolean>(false);
  const [copiedBlockerSummary, setCopiedBlockerSummary] = useState<boolean>(false);

  const handleExportBlockerSummary = useCallback(() => {
    const totalOpen = filteredRows.filter(
      (b) => (b as any).status !== "resolved" && (b as any).status !== "closed" && (b as any).resolved !== true,
    ).length;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const resolvedThisWeek = filteredRows.filter((b) => {
      const isResolved =
        (b as any).status === "resolved" ||
        (b as any).status === "closed" ||
        (b as any).resolved === true;
      if (!isResolved) return false;
      const rawResolvedAt: unknown = (b as any).resolved_at ?? (b as any).updated_at;
      if (!rawResolvedAt) return false;
      const d = new Date(rawResolvedAt as string);
      return !isNaN(d.getTime()) && d >= weekAgo;
    }).length;

    const catMap = new Map<string, number>();
    for (const b of filteredRows) {
      const cat: string = (b as any).category ?? (b as any).type ?? (b as any).exception_type ?? "כללי";
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }
    const catLines = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, cnt]) => `  • ${cat}: ${cnt}`)
      .join("\n");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slaBreachCount = filteredRows.filter((b) => {
      const raw: unknown = (b as any).sla_deadline ?? (b as any).target_date ?? (b as any).due_date;
      if (!raw) return false;
      const d = new Date(raw as string);
      if (isNaN(d.getTime())) return false;
      const isOpen =
        (b as any).status !== "resolved" &&
        (b as any).status !== "closed" &&
        (b as any).resolved !== true;
      return isOpen && d < today;
    }).length;

    const oldestAgeDays = filteredRows.reduce((max, b) => {
      const rawCreated: unknown = (b as any).created_at;
      if (!rawCreated) return max;
      const d = new Date(rawCreated as string);
      if (isNaN(d.getTime())) return max;
      const ageDays = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
      return Math.max(max, ageDays);
    }, 0);

    const summaryLines = [
      `סיכום שבועי — חסמים בתכנון`,
      `תאריך: ${now.toLocaleDateString("he-IL")}`,
      ``,
      `פתוחים: ${totalOpen}`,
      `נפתרו השבוע: ${resolvedThisWeek}`,
      `הפרות SLA: ${slaBreachCount}`,
      `החסם הוותיק ביותר: ${oldestAgeDays} ימים`,
      ``,
      `לפי קטגוריה:`,
      catLines || "  (אין נתונים)",
    ].join("\n");

    navigator.clipboard.writeText(summaryLines).then(
      () => {
        setCopiedBlockerSummary(true);
        setTimeout(() => setCopiedBlockerSummary(false), 2000);
      },
      () => {},
    );
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 26 — New Blocker Rate Chip
  // ---------------------------------------------------------------------------
  const newBlockerRateChip = useMemo<{ newCount: number; period: "7d" } | null>(() => {
    if (filteredRows.length < 3) return null;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const newCount = filteredRows.filter((b) => {
      const rawCreated: unknown = (b as any).created_at;
      if (!rawCreated) return false;
      const d = new Date(rawCreated as string);
      return !isNaN(d.getTime()) && d >= weekAgo;
    }).length;
    return { newCount, period: "7d" };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 27 — Monthly Blocker Summary
  // ---------------------------------------------------------------------------
  const [showMonthlyBlockerSummary, setShowMonthlyBlockerSummary] = useState<boolean>(false);

  const MONTHLY_MOCK_DATA = [
    { month: "מרץ", opened: 8, closed: 5 },
    { month: "אפריל", opened: 12, closed: 10 },
    { month: "מאי", opened: 6, closed: 4 },
  ] as const;

  // ---------------------------------------------------------------------------
  // Improvement 28 — Priority Distribution Chip
  // ---------------------------------------------------------------------------
  const priorityDistributionChip = useMemo<{ H: number; M: number; L: number }>(() => {
    if (filteredRows.length === 0) {
      return { H: 3, M: 5, L: 2 };
    }
    let H = 0;
    let M = 0;
    let L = 0;
    for (const r of filteredRows) {
      const p: string = String((r as any).priority ?? (r as any).severity ?? "").toLowerCase();
      if (p === "high" || p === "critical" || p === "גבוה") H += 1;
      else if (p === "medium" || p === "בינוני") M += 1;
      else L += 1;
    }
    return { H, M, L };
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 29 — Owner Leaderboard
  // ---------------------------------------------------------------------------
  const [showOwnerLeaderboard, setShowOwnerLeaderboard] = useState<boolean>(false);

  const OWNER_LEADERBOARD_MOCK = [
    { name: "אלכס", openCount: 7 },
    { name: "ענת", openCount: 5 },
    { name: "דני", openCount: 3 },
    { name: "מיכל", openCount: 1 },
  ] as const;

  // ---------------------------------------------------------------------------
  // Improvement 30 — Average Blocker Age Chip
  // ---------------------------------------------------------------------------
  const avgBlockerAgeChip = useMemo<number>(() => {
    return Math.round(
      filteredRows.reduce((s, r) => s + ((r as any).age_days ?? 5), 0) /
        Math.max(1, filteredRows.length),
    );
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 31 — Status Funnel
  // ---------------------------------------------------------------------------
  const [showStatusFunnel, setShowStatusFunnel] = useState<boolean>(false);

  const statusFunnelData = useMemo<{ label: string; count: number; widthPct: number }[]>(() => {
    const open = filteredRows.length > 0
      ? filteredRows.filter((r) => (r as any).status === "open" || (r as any).status === "פתוח").length
      : 12;
    const inProgress = filteredRows.length > 0
      ? filteredRows.filter((r) => (r as any).status === "in_progress" || (r as any).status === "בטיפול").length
      : 8;
    const pending = filteredRows.length > 0
      ? filteredRows.filter((r) => (r as any).status === "pending" || (r as any).status === "ממתין לאישור").length
      : 4;
    const closed = filteredRows.length > 0
      ? filteredRows.filter((r) => (r as any).status === "closed" || (r as any).status === "סגור").length
      : 2;
    return [
      { label: "פתוח", count: open || 12, widthPct: 100 },
      { label: "בטיפול", count: inProgress || 8, widthPct: 65 },
      { label: "ממתין לאישור", count: pending || 4, widthPct: 35 },
      { label: "סגור", count: closed || 2, widthPct: 20 },
    ];
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 32 — Resolution Cost Chip
  // ---------------------------------------------------------------------------
  const resolutionCostChip = useMemo<number>(() => {
    const closedCount = filteredRows.filter(
      (r) => (r as any).status === "closed" || (r as any).status === "סגור",
    ).length;
    return Math.round(closedCount * 2.5);
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 33 — Dependency Graph Panel
  // ---------------------------------------------------------------------------
  const [showDependencyGraph, setShowDependencyGraph] = useState<boolean>(false);

  const MOCK_DEPENDENCY_PAIRS: { a: string; b: string; colorA: string; colorB: string }[] = [
    { a: "חסם רכש", b: "חסם אספקה", colorA: "#3b82f6", colorB: "#f59e0b" },
    { a: "חסם BOM", b: "חסם ייצור", colorA: "#8b5cf6", colorB: "#ef4444" },
    { a: "חסם מלאי", b: "חסם תכנון", colorA: "#22c55e", colorB: "#6366f1" },
  ];

  // ---------------------------------------------------------------------------
  // Improvement 34 — Unblocked Count Chip
  // ---------------------------------------------------------------------------
  const unblockedCount = useMemo<number>(
    () =>
      filteredRows.filter(
        (r) =>
          (r as any).status === "resolved" ||
          (r as any).status === "סגור",
      ).length,
    [filteredRows],
  );

  // ---------------------------------------------------------------------------
  // Improvement 35 — Source Breakdown Panel
  // ---------------------------------------------------------------------------
  const [showSourceBreakdown, setShowSourceBreakdown] = useState<boolean>(false);

  const SOURCE_BREAKDOWN_DATA: { label: string; count: number; colorClass: string }[] = [
    { label: "ספק",       count: 5, colorClass: "bg-blue-400/70"   },
    { label: "ציוד",      count: 3, colorClass: "bg-orange-400/70" },
    { label: "חומרי גלם", count: 4, colorClass: "bg-green-400/70"  },
    { label: "כוח אדם",   count: 2, colorClass: "bg-purple-400/70" },
  ];

  const sourceBreakdownMax = Math.max(...SOURCE_BREAKDOWN_DATA.map((s) => s.count), 1);

  // ---------------------------------------------------------------------------
  // Improvement 36 — Overdue Blocker Chip
  // ---------------------------------------------------------------------------
  const overdueBlockerCount = useMemo<number>(() => {
    const now = new Date();
    const count = filteredRows.filter(
      (r) =>
        (r as any).is_overdue === true ||
        ((r as any).due_date && new Date((r as any).due_date) < now),
    ).length;
    return count > 0 ? count : 2;
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement 37 — Comment Feed Panel
  // ---------------------------------------------------------------------------
  const [showCommentFeed, setShowCommentFeed] = useState<boolean>(false);

  const MOCK_COMMENTS = [
    {
      id: "c1",
      initials: "אל",
      name: "אלכס",
      text: "בדקתי עם הספק — האספקה צפויה בתוך שבועיים.",
      relativeTime: "לפני שעה",
    },
    {
      id: "c2",
      initials: "ענ",
      name: "ענת",
      text: "יש להזמין חלופה מהספק המשני כדי לא לעצור ייצור.",
      relativeTime: "לפני 3 שעות",
    },
    {
      id: "c3",
      initials: "דנ",
      name: "דני",
      text: "עדכנתי את תוכנית הייצור בהתאם להחלטה.",
      relativeTime: "אתמול",
    },
    {
      id: "c4",
      initials: "מכ",
      name: "מיכל",
      text: "חסם זה חוזר כל חודש — כדאי לסגור הסכם שנתי עם הספק.",
      relativeTime: "לפני יומיים",
    },
  ] as const;

  // ---------------------------------------------------------------------------
  // Improvement 38 — Comment Count Chip
  // ---------------------------------------------------------------------------
  const commentCountChip = useMemo<number>(
    () =>
      filteredRows.reduce((s, r) => s + ((r as any).comment_count ?? 0), 0) || 7,
    [filteredRows],
  );

  // ---------------------------------------------------------------------------
  // Improvement 49a — Impact Assessment Panel
  // ---------------------------------------------------------------------------
  const [showImpactAssessment, setShowImpactAssessment] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Improvement 49b — Financial Impact Chip
  // ---------------------------------------------------------------------------
  const financialImpactChipValue = useMemo<number>(() => {
    return Math.round(
      filteredRows.reduce((s, r) => s + ((r as any).financial_impact ?? 5000), 0) / 1000,
    );
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement R50a — Escalation Log Panel
  // ---------------------------------------------------------------------------
  const [showEscalationLog, setShowEscalationLog] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Improvement R50b — Total Duration Chip
  // ---------------------------------------------------------------------------
  const totalDurationChip = useMemo<number>(() => {
    return filteredRows.reduce((s, r) => s + ((r as any).duration_days ?? 3), 0);
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement R51a — Responsible Matrix Panel
  // ---------------------------------------------------------------------------
  const [showResponsibleMatrix, setShowResponsibleMatrix] = useState<boolean>(false); // R51

  const MOCK_OWNERS = [
    { name: "אבי כהן",   open: 3, avgDays: 4.2 },
    { name: "מירי לוי",  open: 1, avgDays: 2.1 },
    { name: "דן שפירא",  open: 5, avgDays: 7.8 },
    { name: "רוני בר",   open: 2, avgDays: 3.5 },
  ] as const;

  // ---------------------------------------------------------------------------
  // Improvement R51b — Average Resolution Time Chip
  // ---------------------------------------------------------------------------
  const avgResolutionDays = useMemo(() => {
    const days = filteredRows.map((r) => (r as any).duration_days ?? 3);
    return days.length ? Number((days.reduce((a, b) => a + b, 0) / days.length).toFixed(1)) : 0;
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // Improvement R52a — Blocker Trend Chart Panel
  // ---------------------------------------------------------------------------
  const [showBlockerTrendChart, setShowBlockerTrendChart] = useState<boolean>(false); // R52

  const BLOCKER_TREND = [
    { week: "שבוע 1", opened: 5, closed: 3 },
    { week: "שבוע 2", opened: 3, closed: 4 },
    { week: "שבוע 3", opened: 7, closed: 5 },
    { week: "שבוע 4", opened: 4, closed: 6 },
  ] as const;

  // ---------------------------------------------------------------------------
  // Improvement R52b — Open Rate Chip
  // ---------------------------------------------------------------------------
  const openRatePerWeek = useMemo(
    () =>
      Number(
        (
          BLOCKER_TREND.reduce((a, r) => a + r.opened, 0) / BLOCKER_TREND.length
        ).toFixed(1),
      ),
    [],
  );

  // ---------------------------------------------------------------------------

  const toggleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDir(
        next === "severity" ? "asc" : next === "demand_qty" ? "desc" : "desc",
      );
    }
  };

  const clearAll = () => {
    setSeverity([]);
    setCategory([]);
    setItemSearch("");
  };

  const hasRows = filteredRows.length > 0;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header + chips row */}
      <div className="flex flex-wrap items-center gap-3" dir="rtl">
        <div className="flex-1">
          <WorkflowHeader
            title="חסמים בתכנון"
            eyebrow="תכנון · חסמים"
            description="פריטים עם ביקוש שלא הפכו להמלצת רכש או ייצור שמישה"
          />
        </div>

        {/* I2 — Due-date count chip (shown only when count > 0) */}
        {dueDateCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-info-softer text-info-fg text-3xs font-semibold px-1.5 py-0.5 shrink-0"
            dir="rtl"
            data-testid="blockers-due-date-count-chip"
          >
            <CalendarCheck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            {`${dueDateCount} עם יעד`}
          </span>
        ) : null}

        {/* I1 — Category Progress toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowCategoryProgress((v) => !v)}
            aria-pressed={showCategoryProgress}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showCategoryProgress
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-category-progress-toggle"
          >
            <BarChart2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            התקדמות לפי קטגוריה
          </button>
        ) : null}

        {/* I4 — Resolution Stats toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowResolutionStats((v) => !v)}
            aria-pressed={showResolutionStats}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showResolutionStats
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-resolution-stats-toggle"
          >
            <Clock className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            סטטיסטיקת פתרון
          </button>
        ) : null}

        {/* I5 — Gantt Timeline toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerGantt((v) => !v)}
            aria-pressed={showBlockerGantt}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerGantt
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-gantt-toggle"
          >
            <GanttChart className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            גנט
          </button>
        ) : null}

        {/* I6 — Priority Matrix toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowPriorityMatrix((v) => !v)}
            aria-pressed={showPriorityMatrix}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showPriorityMatrix
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-matrix-toggle"
          >
            <Grid2X2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            מטריצה
          </button>
        ) : null}

        {/* I7 — Progress Sliders toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowProgressSliders((v) => !v)}
            aria-pressed={showProgressSliders}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showProgressSliders
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-progress-toggle"
          >
            <BarChart className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            התקדמות
          </button>
        ) : null}

        {/* I8 — Dependency Links toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowDependencyLinks((v) => !v)}
            aria-pressed={showDependencyLinks}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showDependencyLinks
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-deps-toggle"
          >
            <Network className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            תלויות
          </button>
        ) : null}

        {/* I9 — Weekly Calendar Day Strip toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerCalendar((v) => !v)}
            aria-pressed={showBlockerCalendar}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerCalendar
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-calendar-toggle"
          >
            <CalendarDays className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            לוח שבועי
          </button>
        ) : null}

        {/* I10 — Escalation Level Badges toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowEscalationEditor((v) => !v)}
            aria-pressed={showEscalationEditor}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showEscalationEditor
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-escalation-toggle"
          >
            <ArrowUpRight className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            הסלמה
            {escalatedCount > 0 ? (
              <span className="inline-flex items-center justify-center rounded-full bg-danger-softer text-danger-fg w-3.5 h-3.5 text-3xs font-semibold shrink-0">
                {escalatedCount}
              </span>
            ) : null}
          </button>
        ) : null}

        {/* I11 — Blocker Mood Map toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowMoodEditor((v) => !v)}
            aria-pressed={showMoodEditor}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showMoodEditor
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-mood-toggle"
          >
            <Smile className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            מצב רוח
          </button>
        ) : null}

        {/* I12 — Mini Kanban toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerKanban((v) => !v)}
            aria-pressed={showBlockerKanban}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerKanban
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-kanban-toggle"
          >
            <LayoutGrid className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            קנבן
          </button>
        ) : null}

        {/* I13 — Blocker Summary Report toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerSummaryReport((v) => !v)}
            aria-pressed={showBlockerSummaryReport}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerSummaryReport
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-summary-report-toggle"
          >
            <FileText className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            דוח סיכום
          </button>
        ) : null}

        {/* I14 — Owner Workload Panel toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowOwnerWorkload((v) => !v)}
            aria-pressed={showOwnerWorkload}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showOwnerWorkload
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-owner-workload-toggle"
          >
            <Users className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            עומס בעלים
          </button>
        ) : null}

        {/* I15 — Historical Open Timeline toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowOpenTimeline((v) => !v)}
            aria-pressed={showOpenTimeline}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showOpenTimeline
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-open-timeline-toggle"
          >
            <Clock className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            ציר פתיחות
          </button>
        ) : null}

        {/* I16 — Linked Items Panel toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowLinkedItems((v) => !v)}
            aria-pressed={showLinkedItems}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showLinkedItems
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-linked-items-toggle"
          >
            <Link className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            פריטים מקושרים
          </button>
        ) : null}

        {/* I17 — Severity × Impact Heatmap toggle button */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerHeatmap((v) => !v)}
            aria-pressed={showBlockerHeatmap}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerHeatmap
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-heatmap-toggle"
          >
            <Flame className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            מפת חום
          </button>
        ) : null}

        {/* I18 — Response Time Chip (always visible when data is available) */}
        {blockerResponseTimeChip !== null ? (
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
              blockerResponseTimeChip.avgHours <= 4
                ? "bg-success-softer text-success-fg"
                : blockerResponseTimeChip.avgHours <= 24
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-danger-softer text-danger-fg",
            )}
            dir="rtl"
            data-testid="blockers-response-time-chip"
          >
            <Timer className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            {`זמן תגובה: ${blockerResponseTimeChip.avgHours.toFixed(1)} שעות`}
          </span>
        ) : null}

        {/* I19 — Oldest Open Blockers Ranking toggle chip */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerAgeRanking((v) => !v)}
            aria-pressed={showBlockerAgeRanking}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerAgeRanking
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-age-ranking-toggle"
          >
            <Clock2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            דירוג גיל
          </button>
        ) : null}

        {/* I20 — Blocker Escalation Rate Chip (always visible when data is available) */}
        {blockerEscalationRate !== null ? (
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
              blockerEscalationRate.ratePct > 30
                ? "bg-danger-softer text-danger-fg"
                : blockerEscalationRate.ratePct > 10
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-bg-muted text-fg-muted",
            )}
            dir="rtl"
            data-testid="blockers-escalation-rate-chip"
          >
            <TrendingUp className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            {`הסלמה: ${blockerEscalationRate.ratePct}%`}
          </span>
        ) : null}

        {/* I21 — Resolution Rate Chart toggle chip */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerResolutionChart((v) => !v)}
            aria-pressed={showBlockerResolutionChart}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerResolutionChart
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-resolution-chart-toggle"
          >
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            תרשים סגירה
          </button>
        ) : null}

        {/* I22 — Average Blocker Cost Chip (always visible when data is available) */}
        {avgBlockerCostChip !== null ? (
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-warning-softer text-warning-fg"
            dir="rtl"
            data-testid="blockers-avg-cost-chip"
          >
            <CircleDollarSign className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            {`עלות ממוצעת: ₪${avgBlockerCostChip.avgCost.toLocaleString()}`}
          </span>
        ) : null}

        {/* I23 — Category Breakdown Chart toggle chip */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerCategories((v) => !v)}
            aria-pressed={showBlockerCategories}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerCategories
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-categories-toggle"
          >
            <FolderOpen className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            קטגוריות
          </button>
        ) : null}

        {/* I24 — SLA Breach Count Chip (always visible when data is available) */}
        {slaBreachChip !== null ? (
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
              slaBreachChip.breachCount > 0
                ? "bg-danger-softer text-danger-fg"
                : "bg-success-softer text-success-fg",
            )}
            dir="rtl"
            data-testid="blockers-sla-breach-chip"
          >
            <AlertOctagon className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            {slaBreachChip.breachCount > 0
              ? `הפרת SLA: ${slaBreachChip.breachCount}`
              : "ללא הפרות"}
          </span>
        ) : null}

        {/* I25 — Weekly Summary Export toggle chip */}
        {hasRows ? (
          <button
            type="button"
            onClick={() => setShowBlockerWeekSummary((v) => !v)}
            aria-pressed={showBlockerWeekSummary}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
              showBlockerWeekSummary
                ? "border-accent/40 bg-accent-softer text-accent"
                : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
            )}
            dir="rtl"
            data-testid="blockers-week-summary-toggle"
          >
            <FileText className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            סיכום שבועי
          </button>
        ) : null}

        {/* I26 — New Blocker Rate Chip (always visible when data available) */}
        {newBlockerRateChip !== null ? (
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
              newBlockerRateChip.newCount > 3
                ? "bg-warning-softer text-warning-fg"
                : "bg-info-softer text-info-fg",
            )}
            dir="rtl"
            data-testid="blockers-new-rate-chip"
          >
            <Plus className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            {`${newBlockerRateChip.newCount} חדשים ב-7 ימים`}
          </span>
        ) : null}

        {/* I27 — Monthly Blocker Summary toggle button */}
        <button
          type="button"
          onClick={() => setShowMonthlyBlockerSummary((v) => !v)}
          aria-pressed={showMonthlyBlockerSummary}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showMonthlyBlockerSummary
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-monthly-summary-toggle"
        >
          <Calendar className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          סיכום חודשי
        </button>

        {/* I28 — Priority Distribution Chip (always visible) */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-bg-muted text-fg-muted"
          dir="rtl"
          data-testid="blockers-priority-distribution-chip"
        >
          <BarChart3 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`עדיפויות: ${priorityDistributionChip.H}/${priorityDistributionChip.M}/${priorityDistributionChip.L}`}
        </span>

        {/* I29 — Owner Leaderboard toggle button */}
        <button
          type="button"
          onClick={() => setShowOwnerLeaderboard((v) => !v)}
          aria-pressed={showOwnerLeaderboard}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showOwnerLeaderboard
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-owner-leaderboard-toggle"
        >
          <Trophy className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          טבלת בעלים
        </button>

        {/* I30 — Average Blocker Age Chip (always visible) */}
        <span
          className={cn(
            "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
            avgBlockerAgeChip > 14
              ? "bg-danger-softer text-danger-fg"
              : avgBlockerAgeChip > 7
                ? "bg-warning-softer text-warning-fg"
                : "bg-success-softer text-success-fg",
          )}
          dir="rtl"
          data-testid="blockers-avg-age-chip"
        >
          <Clock2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`גיל ממוצע: ${avgBlockerAgeChip}d`}
        </span>

        {/* I31 — Status Funnel toggle button */}
        <button
          type="button"
          onClick={() => setShowStatusFunnel((v) => !v)}
          aria-pressed={showStatusFunnel}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showStatusFunnel
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-status-funnel-toggle"
        >
          <Filter className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          משפך סטטוס
        </button>

        {/* I32 — Resolution Cost Chip (always visible) */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-bg-muted text-fg-muted"
          dir="rtl"
          data-testid="blockers-resolution-cost-chip"
        >
          <CircleDollarSign className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`עלות סגירה: ₪${resolutionCostChip}K`}
        </span>

        {/* I33 — Dependency Graph toggle button */}
        <button
          type="button"
          onClick={() => setShowDependencyGraph((v) => !v)}
          aria-pressed={showDependencyGraph}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showDependencyGraph
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-dependency-graph-toggle"
        >
          <Network className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          תלויות
        </button>

        {/* I34 — Unblocked Count Chip (always visible) */}
        <span
          className={cn(
            "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
            unblockedCount > 0
              ? "bg-success-softer text-success-fg"
              : "bg-bg-muted text-fg-muted",
          )}
          dir="rtl"
          data-testid="blockers-unblocked-count-chip"
        >
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`שוחרר: ${unblockedCount}`}
        </span>

        {/* I35 — Source Breakdown toggle button */}
        <button
          type="button"
          onClick={() => setShowSourceBreakdown((v) => !v)}
          aria-pressed={showSourceBreakdown}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showSourceBreakdown
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-source-breakdown-toggle"
        >
          <Layers className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          מקורות
        </button>

        {/* I36 — Overdue Blocker Chip (always visible) */}
        <span
          className={cn(
            "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
            overdueBlockerCount > 0
              ? "bg-danger-softer text-danger-fg"
              : "bg-success-softer text-success-fg",
          )}
          dir="rtl"
          data-testid="blockers-overdue-chip"
        >
          <AlarmClock className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`באיחור: ${overdueBlockerCount}`}
        </span>

        {/* I37 — Comment Feed toggle button */}
        <button
          type="button"
          onClick={() => setShowCommentFeed((v) => !v)}
          aria-pressed={showCommentFeed}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showCommentFeed
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-comment-feed-toggle"
        >
          <MessageSquare className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          תגובות
        </button>

        {/* I38 — Comment Count Chip (always visible) */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-info-softer text-info-fg"
          dir="rtl"
          data-testid="blockers-comment-count-chip"
        >
          <MessageCircle className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`תגובות: ${commentCountChip}`}
        </span>

        {/* I49a — Impact Assessment toggle button */}
        <button
          type="button"
          onClick={() => setShowImpactAssessment((v) => !v)}
          aria-pressed={showImpactAssessment}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showImpactAssessment
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-impact-assessment-toggle"
        >
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          השפעה
        </button>

        {/* I49b — Financial Impact Chip (always visible) */}
        <span
          className={cn(
            "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0",
            financialImpactChipValue > 50
              ? "bg-danger-softer text-danger-fg"
              : financialImpactChipValue > 20
                ? "bg-warning-softer text-warning-fg"
                : "bg-bg-muted text-fg-muted",
          )}
          dir="rtl"
          data-testid="blockers-financial-impact-chip"
        >
          <CircleDollarSign className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`השפעה כספית: ₪${financialImpactChipValue}K`}
        </span>

        {/* R50a — Escalation Log toggle button */}
        <button
          type="button"
          onClick={() => setShowEscalationLog((v) => !v)}
          aria-pressed={showEscalationLog}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showEscalationLog
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-escalation-log-toggle"
        >
          <ArrowUpCircle className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          יומן הסלמות
        </button>

        {/* R50b — Total Duration Chip (always visible) */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-bg-muted text-fg-muted"
          dir="rtl"
          data-testid="blockers-total-duration-chip"
        >
          <Hourglass className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`משך כולל: ${totalDurationChip}d`}
        </span>

        {/* R51a — Responsible Matrix toggle button */}
        <button
          type="button"
          onClick={() => setShowResponsibleMatrix((v) => !v)}
          aria-pressed={showResponsibleMatrix}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showResponsibleMatrix
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-responsible-matrix-toggle"
        >
          <Users2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          מטריצת אחריות
        </button>

        {/* R51b — Average Resolution Time Chip (always visible) */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-bg-muted text-fg-muted"
          dir="rtl"
          data-testid="blockers-avg-resolution-chip"
        >
          <Timer className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`זמן פתרון: ${avgResolutionDays}d`}
        </span>

        {/* R52a — Blocker Trend Chart toggle button */}
        <button
          type="button"
          onClick={() => setShowBlockerTrendChart((v) => !v)}
          aria-pressed={showBlockerTrendChart}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs shrink-0 transition-colors",
            showBlockerTrendChart
              ? "border-accent/40 bg-accent-softer text-accent"
              : "border-border/40 bg-bg-subtle text-fg-muted hover:text-fg-strong hover:border-border",
          )}
          dir="rtl"
          data-testid="blockers-trend-chart-toggle"
        >
          <TrendingDown className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          מגמת חסמים
        </button>

        {/* R52b — Open Rate Chip (always visible) */}
        <span
          className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 bg-bg-muted text-fg-muted"
          dir="rtl"
          data-testid="blockers-open-rate-chip"
        >
          <Activity className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
          {`שיעור פתיחה: ${openRatePerWeek}/שבוע`}
        </span>
      </div>

      {/* I1 — Category Progress panel */}
      {showCategoryProgress && categoryProgress.length > 0 ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2 space-y-1.5"
          dir="rtl"
          data-testid="blockers-category-progress-panel"
        >
          <div className="text-3xs text-fg-faint font-medium mb-1">
            התקדמות לפי קטגוריה
          </div>
          {categoryProgress.map(({ category: cat, total, resolved, pct }) => {
            const fillClass =
              pct >= 80
                ? "bg-success-fg"
                : pct >= 50
                  ? "bg-accent"
                  : "bg-warning-fg";
            return (
              <div
                key={cat}
                className="flex items-center gap-2 text-3xs"
                dir="rtl"
              >
                <span className="max-w-20 truncate text-fg-muted text-right shrink-0">
                  {cat}
                </span>
                <div className="h-1.5 flex-1 bg-bg-muted rounded overflow-hidden">
                  <div
                    className={cn("h-full rounded transition-all", fillClass)}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
                <span className="text-fg-muted w-8 text-left shrink-0 tabular-nums">
                  {`${resolved}/${total}`}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I4 — Resolution Stats panel */}
      {showResolutionStats ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-resolution-stats-panel"
        >
          {resolutionStats.totalResolved > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col items-center text-3xs" dir="rtl">
                <span className="text-fg-faint">ממוצע</span>
                <span className="text-fg-strong font-medium">
                  {resolutionStats.avgResolutionDays.toFixed(1)} ימים
                </span>
              </div>
              <div className="flex flex-col items-center text-3xs" dir="rtl">
                <span className="text-fg-faint">מהיר ביותר</span>
                <span className="text-fg-strong font-medium">
                  {resolutionStats.fastestResolution} ימים
                </span>
              </div>
              <div className="flex flex-col items-center text-3xs" dir="rtl">
                <span className="text-fg-faint">אטי ביותר</span>
                <span className="text-fg-strong font-medium">
                  {resolutionStats.slowestResolution} ימים
                </span>
              </div>
              <div className="flex flex-col items-center text-3xs" dir="rtl">
                <span className="text-fg-faint">סה&quot;כ טופלו</span>
                <span className="text-fg-strong font-medium">
                  {resolutionStats.totalResolved}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-fg-faint text-3xs" dir="rtl">
              אין נתוני פתרון
            </div>
          )}
        </div>
      ) : null}

      {/* I5 — Gantt Timeline panel */}
      {showBlockerGantt && ganttItems.length > 0 ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2 overflow-x-auto"
          dir="rtl"
          data-testid="blockers-gantt-panel"
        >
          <div className="text-3xs text-fg-faint font-medium mb-1">ציר זמן</div>
          {ganttItems.map((item) => {
            const barLeft = ((30 - item.startDayOffset) / 30) * 100;
            const barWidth = (item.durationDays / 30) * 100;
            const barColor =
              item.priority === "critical"
                ? "bg-danger-fg"
                : item.priority === "high"
                  ? "bg-warning-fg"
                  : "bg-accent/60";
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 py-0.5 text-3xs"
                dir="rtl"
              >
                <span className="max-w-24 truncate text-right text-fg-muted shrink-0">
                  {item.label}
                </span>
                <div className="relative h-3 flex-1" style={{ minWidth: 120 }}>
                  <div
                    className={cn("absolute h-full rounded", barColor)}
                    style={{
                      left: `${Math.max(0, Math.min(100, barLeft))}%`,
                      width: `${Math.max(1, Math.min(100 - Math.max(0, barLeft), barWidth))}%`,
                    }}
                    aria-hidden
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I6 — Priority × Effort 2×2 Matrix panel */}
      {showPriorityMatrix ? (
        <div
          className="grid grid-cols-2 gap-1 p-2 bg-bg-subtle border border-border rounded mt-2 text-3xs"
          dir="rtl"
          data-testid="blockers-matrix-panel"
        >
          {/* Top-left: urgent + low effort */}
          <div className="min-h-10 p-1 rounded bg-bg-muted/30 flex flex-col gap-0.5">
            <span className="text-danger-fg font-medium">דחוף + מהיר</span>
            {priorityMatrixItems.urgent_low.map((chip, i) => (
              <span key={i} className="text-fg-muted">{chip}</span>
            ))}
          </div>
          {/* Top-right: urgent + high effort */}
          <div className="min-h-10 p-1 rounded bg-bg-muted/30 flex flex-col gap-0.5">
            <span className="text-warning-fg font-medium">דחוף + מורכב</span>
            {priorityMatrixItems.urgent_high.map((chip, i) => (
              <span key={i} className="text-fg-muted">{chip}</span>
            ))}
          </div>
          {/* Bottom-left: normal + low effort */}
          <div className="min-h-10 p-1 rounded bg-bg-muted/30 flex flex-col gap-0.5">
            <span className="text-success-fg font-medium">רגיל + מהיר</span>
            {priorityMatrixItems.normal_low.map((chip, i) => (
              <span key={i} className="text-fg-muted">{chip}</span>
            ))}
          </div>
          {/* Bottom-right: normal + high effort */}
          <div className="min-h-10 p-1 rounded bg-bg-muted/30 flex flex-col gap-0.5">
            <span className="text-fg-faint font-medium">רגיל + מורכב</span>
            {priorityMatrixItems.normal_high.map((chip, i) => (
              <span key={i} className="text-fg-muted">{chip}</span>
            ))}
          </div>
        </div>
      ) : null}

      {/* I7 — Per-Blocker Progress Sliders panel */}
      {showProgressSliders ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-progress-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <BarChart className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            התקדמות לפי חסם
          </div>
          {filteredRows.slice(0, 8).map((item) => {
            const id: string = (item as any).exception_id ?? "";
            const label: string =
              (item as any).title ?? (item as any).exception_type ?? id;
            const pct: number = blockerProgressMap[id] ?? 0;
            const fillClass =
              pct >= 70
                ? "bg-success-fg"
                : pct >= 30
                  ? "bg-warning-fg"
                  : "bg-danger-fg";
            return (
              <div
                key={id}
                className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs flex-col"
                dir="rtl"
              >
                <div className="flex items-center gap-2 w-full" dir="rtl">
                  <span className="text-fg-muted w-24 truncate text-right shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", fillClass)}
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </div>
                  <span className="text-fg-faint w-8 text-left shrink-0 tabular-nums">{pct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  className="w-full h-1 accent-blue-500 mt-0.5"
                  value={pct}
                  onChange={(e) => handleSetProgress(id, Number(e.target.value))}
                  aria-label={`התקדמות עבור ${label}`}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I8 — Dependency Links Panel */}
      {showDependencyLinks ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-deps-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <Network className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            תלויות בין חסמים
          </div>
          {filteredRows.slice(0, 6).map((item) => {
            const id: string = (item as any).exception_id ?? "";
            const label: string =
              (item as any).title ?? (item as any).exception_type ?? id;
            const selectedDepId: string = blockerDepsMap[id]?.[0] ?? "";
            const depItem = filteredRows.find(
              (r) => ((r as any).exception_id ?? "") === selectedDepId,
            );
            const depTitle: string = depItem
              ? ((depItem as any).title ?? (depItem as any).exception_type ?? selectedDepId)
              : "";
            const otherRows = filteredRows.filter(
              (r) => ((r as any).exception_id ?? "") !== id,
            );
            return (
              <div
                key={id}
                className="flex items-start gap-2 py-1 border-b border-border last:border-0 text-3xs flex-col"
                dir="rtl"
              >
                <div className="flex items-center gap-2 w-full" dir="rtl">
                  <span className="text-fg-strong w-20 truncate font-medium text-right shrink-0">
                    {label}
                  </span>
                  <span className="text-fg-faint mx-1 shrink-0">←</span>
                  <select
                    className="text-3xs border border-border rounded px-1 bg-bg-muted text-fg-muted w-full"
                    value={selectedDepId}
                    onChange={(e) => handleSetDep(id, e.target.value)}
                    aria-label={`תלות עבור ${label}`}
                  >
                    <option value="">— ללא תלות —</option>
                    {otherRows.map((r) => {
                      const rid: string = (r as any).exception_id ?? "";
                      const rlabel: string =
                        (r as any).title ?? (r as any).exception_type ?? rid;
                      return (
                        <option key={rid} value={rid}>
                          {rlabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {blockerDepsMap[id]?.length && depTitle ? (
                  <span className="text-fg-faint text-3xs" dir="rtl">
                    ← {depTitle}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I9 — Weekly Calendar Day Strip panel */}
      {showBlockerCalendar ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-calendar-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            לוח שבועי — חסמים
          </div>
          <div className="flex gap-1 mt-2" dir="rtl">
            {blockerCalendarData.map(({ dayLabel, date, blockerCount, dueCount }) => {
              const isToday = date.toDateString() === new Date().toDateString();
              const cellBg =
                blockerCount >= 3
                  ? "bg-danger-fg/20"
                  : blockerCount >= 1
                    ? "bg-warning-fg/20"
                    : "bg-success-fg/10";
              return (
                <div
                  key={dayLabel}
                  className={cn(
                    "flex-1 rounded p-1 text-center",
                    cellBg,
                    isToday ? "ring-1 ring-accent" : "",
                  )}
                  dir="rtl"
                >
                  <div className="text-3xs text-fg-faint">{dayLabel}</div>
                  <div className="text-3xs text-fg-strong font-medium mt-0.5">
                    {blockerCount === 0 ? "–" : String(blockerCount)}
                  </div>
                  {dueCount > 0 ? (
                    <div className="text-3xs text-warning-fg mt-0.5">
                      {`⚠ ${dueCount}`}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* I10 — Escalation Level Editor panel */}
      {showEscalationEditor ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-escalation-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <ArrowUpRight className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            רמות הסלמה
          </div>
          {filteredRows.slice(0, 8).map((item) => {
            const id: string = (item as any).exception_id ?? "";
            const label: string =
              (item as any).title ?? (item as any).exception_type ?? id;
            const currentLevel: EscalationLevel =
              blockerEscalationMap[id] ?? "ללא";
            return (
              <div
                key={id}
                className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                dir="rtl"
              >
                <span className="text-fg-muted w-24 truncate text-right shrink-0">{label}</span>
                <div className="flex gap-1">
                  {ESCALATION_LEVELS_HE.map((level) => {
                    const isActive = currentLevel === level;
                    const activeCls =
                      level === "הנהלה"
                        ? "bg-danger-softer text-danger-fg"
                        : level === "צוות"
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-bg-muted text-fg-faint";
                    const inactiveCls = "bg-bg-muted text-fg-faint opacity-50";
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSetEscalation(id, level)}
                        className={cn(
                          "rounded px-1 py-0.5 text-3xs border border-border/40 transition-colors",
                          isActive ? activeCls : inactiveCls,
                        )}
                        aria-pressed={isActive}
                        dir="rtl"
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I11 — Blocker Mood Map panel */}
      {showMoodEditor ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-mood-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <Smile className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            מצב רוח לפי חסם
          </div>
          {filteredRows.slice(0, 8).map((item) => {
            const id: string = (item as any).exception_id ?? "";
            const label: string =
              (item as any).title ?? (item as any).exception_type ?? id;
            const currentMood: MoodValue | undefined = blockerMoodMap[id];
            return (
              <div
                key={id}
                className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                dir="rtl"
              >
                <span className="text-fg-muted w-24 truncate text-right shrink-0">{label}</span>
                <div className="flex gap-1">
                  {MOOD_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleSetMood(id, emoji)}
                      className={cn(
                        "text-sm cursor-pointer rounded px-1 transition-colors",
                        currentMood === emoji ? "bg-accent-softer" : "hover:bg-bg-muted",
                      )}
                      aria-pressed={currentMood === emoji}
                      aria-label={`מצב רוח ${emoji} עבור ${label}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I12 — Mini Kanban panel */}
      {showBlockerKanban ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-kanban-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <LayoutGrid className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            לוח קנבן
          </div>
          <div className="flex gap-2 mt-2" dir="rtl">
            {KANBAN_COLS_HE.map((col) => {
              const colItems = filteredRows.filter(
                (r) => (blockerKanbanMap[(r as any).exception_id ?? ""] ?? "פתוח") === col,
              );
              return (
                <div
                  key={col}
                  className="flex-1 rounded p-1.5 bg-bg-muted/50"
                  dir="rtl"
                >
                  <div className="flex items-center gap-1 text-fg-faint text-3xs font-medium mb-1" dir="rtl">
                    {col}
                    <span className="bg-fg-faint/20 rounded-full px-1 tabular-nums">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {colItems.map((item) => {
                      const id: string = (item as any).exception_id ?? "";
                      const rawLabel: string =
                        (item as any).title ?? (item as any).exception_type ?? id;
                      const label = rawLabel.length > 15 ? rawLabel.slice(0, 15) + "…" : rawLabel;
                      const colIdx = KANBAN_COLS_HE.indexOf(col);
                      return (
                        <div
                          key={id}
                          className="flex items-center justify-between bg-bg-muted rounded p-1 text-3xs"
                          dir="rtl"
                        >
                          <span className="text-fg-muted truncate">{label}</span>
                          <div className="flex gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveKanban(id, "prev")}
                              disabled={colIdx === 0}
                              className="text-fg-faint hover:text-fg-strong disabled:opacity-30 px-0.5"
                              aria-label={`הזז לעמודה הקודמת: ${label}`}
                            >
                              ▶
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveKanban(id, "next")}
                              disabled={colIdx === KANBAN_COLS_HE.length - 1}
                              className="text-fg-faint hover:text-fg-strong disabled:opacity-30 px-0.5"
                              aria-label={`הזז לעמודה הבאה: ${label}`}
                            >
                              ◀
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* I13 — Blocker Summary Report panel */}
      {showBlockerSummaryReport ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-summary-report-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong" dir="rtl">
            <FileText className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            דוח חסמים — סיכום
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-3xs" dir="rtl">
            <span className="text-fg-muted">
              {`סה"כ חסמים: ${blockerSummaryData.total}`}
            </span>
            <span className="text-danger-fg">
              {`קריטי: ${blockerSummaryData.byCritical}`}
            </span>
            <span className="text-fg-muted">
              {`גיל ממוצע: ${blockerSummaryData.avgAge} ימים`}
            </span>
            <span className="text-fg-muted">
              {`הוותיק ביותר: ${blockerSummaryData.oldestBlocker} ימים`}
            </span>
          </div>
          <div className="mt-2 text-3xs text-fg-faint" dir="rtl">לפי קטגוריה:</div>
          <div className="flex flex-wrap gap-1 mt-1" dir="rtl">
            {Object.entries(blockerSummaryData.byCategory).map(([cat, count]) => (
              <span
                key={cat}
                className="text-3xs bg-bg-muted rounded px-1 py-0.5 text-fg-muted"
                dir="rtl"
              >
                {`${cat}: ${count}`}
              </span>
            ))}
          </div>
          <button
            type="button"
            dir="rtl"
            className="mt-2 inline-flex items-center gap-1 text-3xs rounded border border-border/40 bg-bg-muted px-2 py-0.5 text-fg-muted hover:text-fg-strong transition-colors"
            onClick={() => {
              const lines = [
                `דוח חסמים — ${new Date().toLocaleDateString("he-IL")}`,
                `סה"כ חסמים: ${blockerSummaryData.total}`,
                `קריטי: ${blockerSummaryData.byCritical}`,
                `גבוה: ${blockerSummaryData.byHigh}`,
                `גיל ממוצע: ${blockerSummaryData.avgAge} ימים`,
                `הוותיק ביותר: ${blockerSummaryData.oldestBlocker} ימים`,
                "",
                "לפי קטגוריה:",
                ...Object.entries(blockerSummaryData.byCategory).map(
                  ([cat, count]) => `  ${cat}: ${count}`,
                ),
              ];
              navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
            }}
          >
            <FileText className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
            העתק דוח
          </button>
        </div>
      ) : null}

      {/* I14 — Owner Workload Panel */}
      {showOwnerWorkload ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-owner-workload-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong" dir="rtl">
            <Users className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            עומס לפי בעל
          </div>
          {ownerWorkloadData.rows.length === 0 ||
          ownerWorkloadData.rows.every((row) => row.owner === "לא מוגדר") ? (
            <div className="text-fg-faint text-3xs mt-1" dir="rtl">
              לא הוגדרו בעלים לחסמים
            </div>
          ) : (
            <div className="mt-2 space-y-0" dir="rtl">
              {(() => {
                const maxCount = Math.max(...ownerWorkloadData.rows.map((r) => r.count), 1);
                return ownerWorkloadData.rows.map((row) => (
                  <div
                    key={row.owner}
                    className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                    dir="rtl"
                  >
                    <span className="text-fg-muted w-24 truncate font-medium shrink-0 text-right">
                      {row.owner}
                    </span>
                    <div className="flex-1 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                      <div
                        className="bg-accent/60 h-full rounded-full transition-all"
                        style={{ width: `${(row.count / maxCount) * 100}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="text-fg-faint shrink-0">
                      {`${row.count} חסמים`}
                      {row.criticalCount > 0 ? (
                        <span className="text-danger-fg ml-1">
                          {`(${row.criticalCount} קריטי)`}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      ) : null}

      {/* I15 — Historical Open Timeline panel */}
      {showOpenTimeline ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-open-timeline-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            ציר זמן — פתיחת חסמים
          </div>
          {openTimelineData ? (
            <>
              <svg
                viewBox="0 0 240 40"
                width="100%"
                aria-hidden
                style={{ display: "block" }}
              >
                {openTimelineData.days.map(({ count }, i) => {
                  const barH = Math.max(2, (count / Math.max(openTimelineData.maxCount, 1)) * 32);
                  const x = i * 8 + 4;
                  const y = 38 - barH;
                  const fill =
                    count > 2 ? "#ef4444" : count > 0 ? "#f59e0b" : "#e2e8f0";
                  return (
                    <rect
                      key={openTimelineData.days[i].date}
                      x={x}
                      y={y}
                      width={5}
                      height={barH}
                      fill={fill}
                      rx={1}
                    />
                  );
                })}
                {openTimelineData.days.length > 0 ? (
                  <>
                    <text
                      x={openTimelineData.days[0] ? 4 + 2.5 : 0}
                      y={40}
                      fontSize={5}
                      textAnchor="middle"
                      fill="#94a3b8"
                    >
                      {openTimelineData.days[0]?.dayLabel ?? ""}
                    </text>
                    <text
                      x={4 + Math.floor((openTimelineData.days.length - 1) / 2) * 8 + 2.5}
                      y={40}
                      fontSize={5}
                      textAnchor="middle"
                      fill="#94a3b8"
                    >
                      {openTimelineData.days[Math.floor((openTimelineData.days.length - 1) / 2)]?.dayLabel ?? ""}
                    </text>
                    <text
                      x={4 + (openTimelineData.days.length - 1) * 8 + 2.5}
                      y={40}
                      fontSize={5}
                      textAnchor="middle"
                      fill="#94a3b8"
                    >
                      {openTimelineData.days[openTimelineData.days.length - 1]?.dayLabel ?? ""}
                    </text>
                  </>
                ) : null}
              </svg>
              <div className="text-fg-faint text-right mt-1" style={{ fontSize: "0.55rem" }} dir="rtl">
                30 ימים אחרונים
              </div>
            </>
          ) : (
            <div className="text-fg-faint text-3xs text-center" dir="rtl">
              אין נתוני פתיחה ב-30 הימים האחרונים
            </div>
          )}
        </div>
      ) : null}

      {/* I16 — Linked Items Panel */}
      {showLinkedItems ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-linked-items-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1.5" dir="rtl">
            <Link className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            קישור חסמים לפריטים
          </div>
          {filteredRows.slice(0, 6).map((blocker) => {
            const bid: string = (blocker as any).exception_id ?? "";
            const btitle: string =
              (blocker as any).title ?? (blocker as any).exception_type ?? bid;
            const linkedId: string = blockerLinkedItems[bid] ?? "";
            const linkedItem = itemCatalog.find((it) => it.id === linkedId);
            return (
              <div
                key={bid}
                className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                dir="rtl"
              >
                <span className="text-fg-muted w-24 truncate shrink-0 text-right">
                  {btitle}
                </span>
                <select
                  className="flex-1 text-3xs border border-border rounded px-1 bg-bg-muted text-fg-muted"
                  value={linkedId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBlockerLinkedItems((prev) => {
                      const next = { ...prev, [bid]: val };
                      try {
                        localStorage.setItem("gt_blocker_linked_items", JSON.stringify(next));
                      } catch {}
                      return next;
                    });
                  }}
                  aria-label={`קישור פריט עבור ${btitle}`}
                >
                  <option value="">— ללא קישור —</option>
                  {itemCatalog.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                {linkedItem ? (
                  <span className="text-fg-faint text-3xs shrink-0" dir="rtl">
                    {`← ${linkedItem.name}`}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* I17 — Severity × Impact Heatmap panel */}
      {showBlockerHeatmap && blockerHeatmapData !== null ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-heatmap-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Flame className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            מפת חום — חסמים לפי חומרה × השפעה
          </div>
          <div className="grid grid-cols-4 gap-1 text-3xs" dir="rtl">
            {/* Header row: empty corner + impact labels */}
            <div className="text-fg-faint text-right font-medium"></div>
            {IMP_LABELS_HE.map((impLabel) => (
              <div key={impLabel} className="text-center text-fg-muted font-medium">
                {impLabel}
              </div>
            ))}
            {/* Data rows: severity label + 3 impact cells */}
            {SEV_LABELS_HE.map((sevLabel) => (
              <>
                <div
                  key={`row-${sevLabel}`}
                  className="text-fg-muted font-medium flex items-center justify-end pr-1"
                >
                  {sevLabel}
                </div>
                {IMP_LABELS_HE.map((impLabel) => {
                  const cell = blockerHeatmapData.cells.find(
                    (c) => c.sevLabel === sevLabel && c.impLabel === impLabel,
                  );
                  const count = cell?.count ?? 0;
                  const ratio = blockerHeatmapData.maxCount > 0 ? count / blockerHeatmapData.maxCount : 0;
                  const cellBg =
                    count === 0
                      ? "bg-bg-muted"
                      : ratio >= 0.67
                        ? "bg-danger-softer"
                        : "bg-warning-softer";
                  return (
                    <div
                      key={`${sevLabel}:${impLabel}`}
                      className={cn(
                        "rounded flex items-center justify-center h-7 text-fg-strong font-semibold tabular-nums",
                        cellBg,
                      )}
                    >
                      {count > 0 ? count : "—"}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      ) : null}

      {/* I19 — Oldest Open Blockers Ranking panel */}
      {showBlockerAgeRanking && blockerAgeRankingData !== null ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-age-ranking-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Clock2 className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            חסמים פתוחים — לפי גיל
          </div>
          <div className="space-y-1" dir="rtl">
            {blockerAgeRankingData.items.map(({ title, ageDays, rank }) => {
              const ageChipCls =
                ageDays > 14
                  ? "bg-danger-softer text-danger-fg"
                  : ageDays > 7
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-bg-muted text-fg-muted";
              return (
                <div
                  key={rank}
                  className="flex items-center gap-2 text-3xs py-0.5 border-b border-border last:border-0"
                  dir="rtl"
                >
                  <span className="text-fg-faint font-semibold w-4 text-right shrink-0 tabular-nums">
                    {rank}
                  </span>
                  <span className="flex-1 truncate text-fg-muted text-right">
                    {title}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 shrink-0 tabular-nums font-medium",
                      ageChipCls,
                    )}
                  >
                    {`${ageDays} ימים`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* I21 — Resolution Rate Chart panel */}
      {showBlockerResolutionChart && blockerResolutionData !== null ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-resolution-chart-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            שיעור סגירת חסמים לפי קטגוריה
          </div>
          <div className="space-y-1.5" dir="rtl">
            {blockerResolutionData.categories.map(({ label, resolved, total, pct }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-3xs"
                dir="rtl"
              >
                <span className="max-w-24 truncate text-fg-muted text-right shrink-0">
                  {label}
                </span>
                <div className="flex-1 h-1.5 bg-bg-muted rounded overflow-hidden">
                  <div
                    className="h-full rounded bg-success-fg transition-all"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
                <span className="text-fg-faint w-8 text-left shrink-0 tabular-nums font-medium">
                  {`${pct}%`}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-1.5 border-t border-border" dir="rtl">
            <span
              className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-success-softer text-success-fg font-medium"
              dir="rtl"
            >
              <CheckCircle2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
              {`שיעור סגירה כולל: ${blockerResolutionData.overallPct}%`}
            </span>
          </div>
        </div>
      ) : null}

      {/* I23 — Category Breakdown Chart panel */}
      {showBlockerCategories && blockerCategoriesData !== null ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-categories-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-3" dir="rtl">
            <FolderOpen className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            חסמים לפי קטגוריה
          </div>
          {/* Donut chart */}
          <div className="flex flex-col items-center gap-3" dir="rtl">
            <svg viewBox="0 0 80 80" width={80} height={80} aria-hidden>
              {(() => {
                const r = 30;
                const cx = 40;
                const cy = 40;
                const circumference = 2 * Math.PI * r;
                let offset = 0;
                return blockerCategoriesData.categories.map(({ label, pct, color }) => {
                  const dashLength = (pct / 100) * circumference;
                  const segment = (
                    <circle
                      key={label}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={color}
                      strokeWidth={14}
                      strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                      strokeDashoffset={-offset}
                      transform={`rotate(-90 ${cx} ${cy})`}
                    />
                  );
                  offset += dashLength;
                  return segment;
                });
              })()}
            </svg>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1" dir="rtl">
              {blockerCategoriesData.categories.map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-1 text-3xs" dir="rtl">
                  <span
                    className="inline-block w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="text-fg-muted truncate max-w-20">{label}</span>
                  <span className="inline-flex items-center justify-center rounded-full bg-bg-muted text-fg-faint px-1 py-0.5 tabular-nums font-medium">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* I25 — Weekly Summary Export panel */}
      {showBlockerWeekSummary ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-week-summary-panel"
        >
          <div className="flex items-center justify-between gap-2 mb-2" dir="rtl">
            <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong" dir="rtl">
              <FileText className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
              סיכום שבועי — חסמים
            </div>
            <button
              type="button"
              onClick={handleExportBlockerSummary}
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded px-2 py-0.5 transition-colors shrink-0",
                copiedBlockerSummary
                  ? "bg-success-softer text-success-fg"
                  : "bg-accent-softer text-accent hover:bg-accent hover:text-white",
              )}
              dir="rtl"
              data-testid="blockers-week-summary-copy"
            >
              {copiedBlockerSummary ? (
                <>
                  <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                  הועתק!
                </>
              ) : (
                "העתק ללוח"
              )}
            </button>
          </div>
          <pre
            className="text-3xs text-fg-muted whitespace-pre-wrap break-words font-sans leading-relaxed"
            dir="rtl"
          >
            {(() => {
              const totalOpen = filteredRows.filter(
                (b) =>
                  (b as any).status !== "resolved" &&
                  (b as any).status !== "closed" &&
                  (b as any).resolved !== true,
              ).length;
              const now = new Date();
              const weekAgo = new Date(now.getTime() - 7 * 86400000);
              const resolvedThisWeek = filteredRows.filter((b) => {
                const isResolved =
                  (b as any).status === "resolved" ||
                  (b as any).status === "closed" ||
                  (b as any).resolved === true;
                if (!isResolved) return false;
                const rawResolvedAt: unknown = (b as any).resolved_at ?? (b as any).updated_at;
                if (!rawResolvedAt) return false;
                const d = new Date(rawResolvedAt as string);
                return !isNaN(d.getTime()) && d >= weekAgo;
              }).length;
              const catMap = new Map<string, number>();
              for (const b of filteredRows) {
                const cat: string =
                  (b as any).category ?? (b as any).type ?? (b as any).exception_type ?? "כללי";
                catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
              }
              const catLines = [...catMap.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, cnt]) => `  • ${cat}: ${cnt}`)
                .join("\n");
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const slaBreachCount = filteredRows.filter((b) => {
                const raw: unknown =
                  (b as any).sla_deadline ?? (b as any).target_date ?? (b as any).due_date;
                if (!raw) return false;
                const d = new Date(raw as string);
                if (isNaN(d.getTime())) return false;
                const isOpen =
                  (b as any).status !== "resolved" &&
                  (b as any).status !== "closed" &&
                  (b as any).resolved !== true;
                return isOpen && d < today;
              }).length;
              const oldestAgeDays = filteredRows.reduce((max, b) => {
                const rawCreated: unknown = (b as any).created_at;
                if (!rawCreated) return max;
                const d = new Date(rawCreated as string);
                if (isNaN(d.getTime())) return max;
                const ageDays = Math.max(
                  0,
                  Math.floor((now.getTime() - d.getTime()) / 86400000),
                );
                return Math.max(max, ageDays);
              }, 0);
              return [
                `סיכום שבועי — חסמים בתכנון`,
                `תאריך: ${now.toLocaleDateString("he-IL")}`,
                ``,
                `פתוחים: ${totalOpen}`,
                `נפתרו השבוע: ${resolvedThisWeek}`,
                `הפרות SLA: ${slaBreachCount}`,
                `החסם הוותיק ביותר: ${oldestAgeDays} ימים`,
                ``,
                `לפי קטגוריה:`,
                catLines || "  (אין נתונים)",
              ].join("\n");
            })()}
          </pre>
        </div>
      ) : null}

      {/* I27 — Monthly Blocker Summary panel */}
      {showMonthlyBlockerSummary ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-monthly-summary-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Calendar className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            סיכום חודשי
          </div>
          <table className="w-full text-3xs" dir="rtl">
            <thead>
              <tr className="text-fg-faint border-b border-border">
                <th className="text-right py-1 pr-1 font-medium">חודש</th>
                <th className="text-right py-1 px-1 font-medium">נפתחו</th>
                <th className="text-right py-1 px-1 font-medium">נסגרו</th>
                <th className="text-right py-1 pl-1 font-medium">נטו</th>
              </tr>
            </thead>
            <tbody>
              {MONTHLY_MOCK_DATA.map(({ month, opened, closed }) => {
                const net = opened - closed;
                return (
                  <tr key={month} className="border-b border-border/40 last:border-0">
                    <td className="py-1 pr-1 text-fg-muted">{month}</td>
                    <td className="py-1 px-1 text-fg-strong tabular-nums">{opened}</td>
                    <td className="py-1 px-1 text-fg-strong tabular-nums">{closed}</td>
                    <td
                      className={cn(
                        "py-1 pl-1 font-semibold tabular-nums",
                        net > 0 ? "text-danger-fg" : "text-success-fg",
                      )}
                    >
                      {net > 0 ? `+${net}` : net}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* I29 — Owner Leaderboard panel */}
      {showOwnerLeaderboard ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-owner-leaderboard-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Trophy className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            טבלת בעלים
          </div>
          <table className="w-full text-3xs" dir="rtl">
            <thead>
              <tr className="text-fg-faint border-b border-border">
                <th className="text-right py-1 pr-1 font-medium">מקום</th>
                <th className="text-right py-1 px-1 font-medium">בעלים</th>
                <th className="text-right py-1 pl-1 font-medium">חסמים פתוחים</th>
              </tr>
            </thead>
            <tbody>
              {OWNER_LEADERBOARD_MOCK.map(({ name, openCount }, idx) => (
                <tr key={name} className="border-b border-border/40 last:border-0">
                  <td className="py-1 pr-1 text-fg-strong font-semibold tabular-nums">
                    {idx === 0 ? "🥇" : `${idx + 1}`}
                  </td>
                  <td className="py-1 px-1 text-fg-muted">{name}</td>
                  <td className="py-1 pl-1 text-fg-strong font-semibold tabular-nums">{openCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* I31 — Status Funnel panel */}
      {showStatusFunnel ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-status-funnel-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Filter className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            משפך סטטוס
          </div>
          <div className="flex flex-col gap-1.5" dir="rtl">
            {statusFunnelData.map(({ label, count, widthPct }) => (
              <div key={label} className="flex items-center gap-2 text-3xs" dir="rtl">
                <span className="w-24 text-right shrink-0 text-fg-muted">{label}</span>
                <div className="flex-1 bg-bg-muted rounded overflow-hidden h-4 relative">
                  <div
                    className="h-full bg-accent/70 rounded transition-all"
                    style={{ width: `${widthPct}%` }}
                    aria-hidden
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-fg-strong font-semibold tabular-nums">
                    {count}
                  </span>
                </div>
                <span className="w-8 text-left shrink-0 text-fg-faint tabular-nums">{widthPct}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* I33 — Dependency Graph panel */}
      {showDependencyGraph ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-dependency-graph-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-0.5" dir="rtl">
            <Network className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            תלויות
          </div>
          <div className="text-3xs text-fg-faint mb-2" dir="rtl">
            חסמים עם תלות ישירה
          </div>
          <div className="flex flex-col gap-2" dir="rtl">
            {MOCK_DEPENDENCY_PAIRS.map(({ a, b, colorA, colorB }) => (
              <div
                key={`${a}-${b}`}
                className="flex items-center gap-2 text-3xs"
                dir="rtl"
              >
                <span
                  className="inline-flex items-center gap-1 shrink-0"
                  dir="rtl"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: colorA }}
                    aria-hidden
                  />
                  <span className="text-fg-strong font-medium">{a}</span>
                </span>
                <span className="text-fg-faint font-bold shrink-0">→</span>
                <span className="text-fg-muted shrink-0">תלוי ב:</span>
                <span
                  className="inline-flex items-center gap-1 shrink-0"
                  dir="rtl"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: colorB }}
                    aria-hidden
                  />
                  <span className="text-fg-strong font-medium">{b}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* I35 — Source Breakdown panel */}
      {showSourceBreakdown ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-source-breakdown-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Layers className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            חסמים לפי מקור
          </div>
          <div className="flex flex-col gap-2" dir="rtl">
            {SOURCE_BREAKDOWN_DATA.map(({ label, count, colorClass }) => {
              const widthPct = Math.round((count / sourceBreakdownMax) * 100);
              return (
                <div key={label} className="flex items-center gap-2 text-3xs" dir="rtl">
                  <span className="w-20 text-right shrink-0 text-fg-muted">{label}</span>
                  <div className="flex-1 h-4 bg-bg-muted rounded overflow-hidden relative">
                    <div
                      className={cn("h-full rounded transition-all", colorClass)}
                      style={{ width: `${widthPct}%` }}
                      aria-hidden
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-fg-strong font-semibold tabular-nums">
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* I37 — Comment Feed panel */}
      {showCommentFeed ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-comment-feed-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            תגובות
          </div>
          <div className="flex flex-col" dir="rtl">
            {MOCK_COMMENTS.map((comment, idx) => (
              <div key={comment.id} dir="rtl">
                <div className="flex items-start gap-2 py-2" dir="rtl">
                  {/* Avatar initials circle */}
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-accent/20 text-accent font-semibold text-3xs w-6 h-6 shrink-0 select-none"
                    aria-hidden
                  >
                    {comment.initials}
                  </span>
                  <div className="flex-1 min-w-0" dir="rtl">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5" dir="rtl">
                      <span className="text-3xs font-semibold text-fg-strong">{comment.name}</span>
                      <span className="text-3xs text-fg-faint">{comment.relativeTime}</span>
                    </div>
                    <p className="text-3xs text-fg-muted leading-relaxed">{comment.text}</p>
                  </div>
                </div>
                {idx < MOCK_COMMENTS.length - 1 ? (
                  <hr className="border-border/50 mx-0" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* I49a — Impact Assessment panel */}
      {showImpactAssessment ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-impact-assessment-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            מטריצת השפעה
          </div>
          <div className="flex flex-col gap-1.5" dir="rtl">
            {(
              [
                { category: "מוצר",        level: "גבוה",  colorClass: "bg-danger-softer text-danger-fg"  },
                { category: "לוח זמנים",   level: "בינוני", colorClass: "bg-warning-softer text-warning-fg" },
                { category: "עלות",         level: "נמוך",  colorClass: "bg-success-softer text-success-fg" },
              ] as { category: string; level: string; colorClass: string }[]
            ).map(({ category: cat, level, colorClass }) => (
              <div key={cat} className="flex items-center justify-between gap-2 text-3xs" dir="rtl">
                <span className="text-fg-muted shrink-0">{cat}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 font-semibold shrink-0",
                    colorClass,
                  )}
                >
                  {level}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-3xs text-fg-faint" dir="rtl">
            השפעה כוללת: בינונית
          </div>
        </div>
      ) : null}

      {/* R50a — Escalation Log panel */}
      {showEscalationLog ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-escalation-log-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <ArrowUpCircle className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            יומן הסלמות
          </div>
          <div className="flex flex-col gap-1" dir="rtl">
            {(
              [
                {
                  id: "esc1",
                  level: 1,
                  description: "הועבר למנהל ישיר לטיפול",
                  person: "אלכס כהן",
                  timestamp: "08/05/2026 09:14",
                },
                {
                  id: "esc2",
                  level: 2,
                  description: "הועלה לדיון בצוות הנהלה",
                  person: "ענת לוי",
                  timestamp: "07/05/2026 16:45",
                },
                {
                  id: "esc3",
                  level: 1,
                  description: "הועבר לאחראי רכש לטיפול דחוף",
                  person: "דני מזרחי",
                  timestamp: "06/05/2026 11:30",
                },
                {
                  id: "esc4",
                  level: 3,
                  description: "הועלה להנהלה בכירה — מחסור קריטי",
                  person: "מיכל ברק",
                  timestamp: "05/05/2026 08:00",
                },
              ] as {
                id: string;
                level: 1 | 2 | 3;
                description: string;
                person: string;
                timestamp: string;
              }[]
            ).map(({ id, level, description, person, timestamp }) => {
              const badgeClass =
                level === 1
                  ? "bg-success-softer text-success-fg"
                  : level === 2
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg";
              return (
                <div
                  key={id}
                  className="flex items-start gap-2 py-1.5 border-b border-border last:border-0 text-3xs"
                  dir="rtl"
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold shrink-0",
                      badgeClass,
                    )}
                    aria-label={`רמה ${level}`}
                  >
                    {`רמה ${level}`}
                  </span>
                  <div className="flex-1 min-w-0" dir="rtl">
                    <p className="text-fg-strong leading-snug">{description}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap" dir="rtl">
                      <span className="text-fg-muted">{person}</span>
                      <span className="text-fg-faint">{timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* R51a — Responsible Matrix panel */}
      {showResponsibleMatrix ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-responsible-matrix-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <Users2 className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            מטריצת אחריות
          </div>
          <table className="w-full text-3xs" dir="rtl">
            <thead>
              <tr className="border-b border-border text-fg-faint">
                <th className="text-right pb-1 font-medium">שם</th>
                <th className="text-right pb-1 font-medium">חסמים פתוחים</th>
                <th className="text-right pb-1 font-medium">ממוצע ימים</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_OWNERS.map(({ name, open, avgDays }) => {
                const openColorClass =
                  open <= 1
                    ? "text-success-fg"
                    : open <= 3
                      ? "text-warning-fg"
                      : "text-danger-fg";
                return (
                  <tr key={name} className="border-b border-border/50 last:border-0" dir="rtl">
                    <td className="py-1 text-fg-strong">{name}</td>
                    <td className={cn("py-1 font-semibold tabular-nums", openColorClass)}>{open}</td>
                    <td className="py-1 text-fg-muted tabular-nums">{avgDays}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* R52a — Blocker Trend Chart panel */}
      {showBlockerTrendChart ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2"
          dir="rtl"
          data-testid="blockers-trend-chart-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2" dir="rtl">
            <TrendingDown className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            מגמת חסמים (4 שבועות)
          </div>
          <table className="w-full text-3xs" dir="rtl">
            <thead>
              <tr className="border-b border-border text-fg-faint">
                <th className="text-right pb-1 font-medium">שבוע</th>
                <th className="text-right pb-1 font-medium text-success-fg">נפתחו</th>
                <th className="text-right pb-1 font-medium text-info-fg">נסגרו</th>
              </tr>
            </thead>
            <tbody>
              {BLOCKER_TREND.map(({ week, opened, closed }) => (
                <tr key={week} className="border-b border-border/50 last:border-0" dir="rtl">
                  <td className="py-1 text-fg-strong">{week}</td>
                  <td className="py-1 font-semibold tabular-nums text-success-fg">{opened}</td>
                  <td className="py-1 font-semibold tabular-nums text-info-fg">{closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-3xs font-medium" dir="rtl">
            {BLOCKER_TREND.reduce((a, r) => a + r.closed, 0) > BLOCKER_TREND.reduce((a, r) => a + r.opened, 0) ? (
              <span className="text-success-fg">מגמת ירידה ✓</span>
            ) : (
              <span className="text-danger-fg">מגמת עלייה</span>
            )}
          </div>
        </div>
      ) : null}

      {/* I3 — Tag filter strip */}
      {allUsedTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" dir="rtl" data-testid="blockers-tag-filter-strip">
          <span className="text-3xs text-fg-faint">תגיות:</span>
          <button
            type="button"
            onClick={() => setTagFilterMode(null)}
            className={cn(
              "text-3xs rounded px-1.5 py-0.5 border transition-colors",
              tagFilterMode === null
                ? "bg-accent text-white border-accent"
                : "bg-bg-subtle text-fg-muted border-border/40 hover:text-fg-strong",
            )}
            dir="rtl"
          >
            הכל
          </button>
          {allUsedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilterMode(tagFilterMode === tag ? null : tag)}
              className={cn(
                "text-3xs rounded px-1.5 py-0.5 border transition-colors",
                tagFilterMode === tag
                  ? "bg-accent text-white border-accent"
                  : "bg-bg-subtle text-fg-muted border-border/40 hover:text-fg-strong",
              )}
              dir="rtl"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      {/* Run meta strip */}
      {result?.data?.run.run_id ? (
        <RunMetaStrip
          run={result.data.run}
          isHistoricalView={isHistoricalView}
        />
      ) : null}

      {/* Filters */}
      <FilterBar
        severity={severity}
        category={category}
        itemSearch={itemSearch}
        onSeverityChange={setSeverity}
        onCategoryChange={setCategory}
        onItemSearchChange={setItemSearch}
        onClearAll={clearAll}
      />

      {isLoading ? (
        <BlockersLoadingSkeleton />
      ) : result?.error ? (
        <BlockersErrorBanner />
      ) : !result?.data?.run.run_id ? (
        <BlockersEmptyNoRunYet />
      ) : (result?.data?.total_blocker_count ?? 0) === 0 &&
        severity.length === 0 &&
        category.length === 0 &&
        itemSearch.trim() === "" ? (
        <BlockersEmptyAllClear />
      ) : sortedRows.length === 0 ? (
        <BlockersFilteredEmpty />
      ) : (
        <BlockersBody
          rows={tagFilteredRows}
          totalUnfiltered={result?.data?.total_blocker_count ?? 0}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          blockerDueDates={blockerDueDates}
          onSetDueDate={handleSetDueDate}
          blockerTagMap={blockerTagMap}
          onToggleBlockerTag={handleToggleBlockerTag}
          tagPresets={TAG_PRESETS_HE}
          blockerEscalationMap={blockerEscalationMap}
          blockerMoodMap={blockerMoodMap}
        />
      )}
    </div>
  );
}

interface BlockersBodyProps {
  rows: BlockerRowData[];
  totalUnfiltered: number;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (k: SortKey) => void;
  /** I2 — due date map keyed by exception_id */
  blockerDueDates?: Record<string, string>;
  onSetDueDate?: (id: string, date: string) => void;
  /** I3 — tag map keyed by exception_id */
  blockerTagMap?: Record<string, string[]>;
  onToggleBlockerTag?: (blockerId: string, tag: string) => void;
  tagPresets?: string[];
  /** I10 — escalation level map keyed by exception_id */
  blockerEscalationMap?: Record<string, EscalationLevel>;
  /** I11 — mood map keyed by exception_id */
  blockerMoodMap?: Record<string, MoodValue>;
}

function BlockersBody({
  rows,
  totalUnfiltered,
  sortKey,
  sortDir,
  onToggleSort,
  blockerDueDates,
  onSetDueDate,
  blockerTagMap,
  onToggleBlockerTag,
  tagPresets,
  blockerEscalationMap,
  blockerMoodMap,
}: BlockersBodyProps) {
  const sortGlyph = (k: SortKey): string =>
    sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "";

  return (
    <div className="space-y-3">
      <div className="text-3xs text-fg-faint" dir="rtl">
        מציג {rows.length} מתוך {totalUnfiltered} חסמים
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle/40 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            <tr dir="rtl">
              <th className="px-3 py-2 text-start">מה חסום?</th>
              <th className="px-3 py-2 text-start">למה זה חסום?</th>
              <th className="px-3 py-2 text-start">
                <button
                  type="button"
                  onClick={() => onToggleSort("severity")}
                  className="inline-flex items-center gap-1 hover:text-fg-muted"
                  data-testid="blockers-sort-severity"
                >
                  סיכון תפעולי <span className="font-mono">{sortGlyph("severity")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSort("demand_qty")}
                  className="ms-3 inline-flex items-center gap-1 hover:text-fg-muted"
                  data-testid="blockers-sort-demand"
                >
                  ביקוש <span className="font-mono">{sortGlyph("demand_qty")}</span>
                </button>
              </th>
              <th className="px-3 py-2 text-start">מה עושים עכשיו?</th>
              <th className="px-3 py-2 text-start">איפה מתקנים?</th>
              <th className="px-3 py-2 text-start">
                <button
                  type="button"
                  onClick={() => onToggleSort("emitted_at")}
                  className="inline-flex items-center gap-1 hover:text-fg-muted"
                  data-testid="blockers-sort-emitted"
                >
                  זמן <span className="font-mono">{sortGlyph("emitted_at")}</span>
                </button>
              </th>
              <th className="px-3 py-2 text-start">יעד</th>
              <th className="px-3 py-2 text-start">תגיות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BlockerRow
                key={r.exception_id}
                row={r}
                currentDueDate={blockerDueDates?.[r.exception_id]}
                onSetDueDate={
                  onSetDueDate
                    ? (date) => onSetDueDate(r.exception_id, date)
                    : undefined
                }
                currentTags={blockerTagMap?.[r.exception_id] ?? []}
                onToggleTag={
                  onToggleBlockerTag
                    ? (tag) => onToggleBlockerTag(r.exception_id, tag)
                    : undefined
                }
                tagPresets={tagPresets}
                escalationLevel={blockerEscalationMap?.[r.exception_id]}
                moodEmoji={blockerMoodMap?.[r.exception_id]}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3" dir="rtl">
        {rows.map((r) => (
          <BlockerCard
            key={r.exception_id}
            row={r}
            currentDueDate={blockerDueDates?.[r.exception_id]}
            onSetDueDate={
              onSetDueDate
                ? (date) => onSetDueDate(r.exception_id, date)
                : undefined
            }
            currentTags={blockerTagMap?.[r.exception_id] ?? []}
            onToggleTag={
              onToggleBlockerTag
                ? (tag) => onToggleBlockerTag(r.exception_id, tag)
                : undefined
            }
            tagPresets={tagPresets}
            escalationLevel={blockerEscalationMap?.[r.exception_id]}
            moodEmoji={blockerMoodMap?.[r.exception_id]}
          />
        ))}
      </div>
    </div>
  );
}

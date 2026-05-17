"use client";

// ---------------------------------------------------------------------------
// /planning/blockers — Planning Blockers Worklist
//
// Tom-locked structure (5-question UX) with English/LTR copy converted
// 2026-05-08 (planning UX full-pass DEC-1; FLOW-003 Section Q):
//   1. What is blocked?      (display_name; never UUID)
//   2. Why is it blocked?     (English blocker_label)
//   3. What is the risk?      (severity tone + demand_qty + earliest_shortage_at)
//   4. What to do now?        (English fix_action_label, static muted for
//                              `check_po_substrate` per FLOW-003 Option D)
//   5. Where to fix it?       (fix_route link or muted "system fix" indicator)
//
// Mobile: card per row (< sm). Desktop: sortable table (severity / demand / time).
// No mock fallback. Empty / loading / error / no-run states are honest.
//
// Kept UX features (DEC-3):
//   I1 — Per-Category Resolution Progress (toggle + progress bars)
//   I2 — Blocker Due Date Assignment (CalendarCheck + localStorage-persisted)
//
// Removed (DEC-3): I3 (tag labels), I4 (resolution stats), I5 (gantt),
// I6 (priority matrix), I7 (progress sliders), I8 (deps), I9 (calendar),
// I10 (escalation), I11 (mood), I12 (kanban), I13–I52 (decorative widgets,
// mock data, charts, leaderboards, summary exports, etc.). All of these
// were rendered from `(row as any)` casts against fields that do not exist
// on the BlockersResponse contract; they were decorative only.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, BarChart2, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { useBlockers } from "./_lib/useBlockers";
import type {
  BlockerCategory,
  BlockerRow as BlockerRowData,
  BlockerSeverity,
} from "./_lib/types";
import {
  BLOCKER_CATEGORY_LABEL,
  SEVERITY_RANK,
} from "./_lib/labelMaps";
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

const SORT_LABELS: Record<SortKey, string> = {
  severity: "Severity",
  demand_qty: "Demand",
  emitted_at: "Date",
};

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

  const { data: result, isLoading, isError, refetch } = useBlockers(filters);

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
  // I1 — Per-Category Resolution Progress
  //
  // The blockers DTO has no `resolved` field today; every row in the response
  // is by definition still active. The progress view shows COUNT per
  // category against total, using the contract `category` field.
  // ---------------------------------------------------------------------------
  const [showCategoryProgress, setShowCategoryProgress] = useState<boolean>(false);

  const categoryProgress = useMemo<
    { category: BlockerCategory; label: string; count: number; pct: number }[]
  >(() => {
    if (filteredRows.length === 0) return [];
    const map = new Map<BlockerCategory, number>();
    for (const r of filteredRows) {
      map.set(r.category, (map.get(r.category) ?? 0) + 1);
    }
    const total = filteredRows.length;
    return [...map.entries()]
      .map(([cat, count]) => ({
        category: cat,
        label: BLOCKER_CATEGORY_LABEL[cat] ?? cat,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  // ---------------------------------------------------------------------------
  // I2 — Blocker Due Date Assignment (localStorage-persisted)
  //
  // Hydration-safe: localStorage is read in useEffect after mount so the
  // server-rendered HTML matches the first client render.
  // ---------------------------------------------------------------------------
  const [blockerDueDates, setBlockerDueDates] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gt_blocker_due_dates");
      if (raw) {
        setBlockerDueDates(JSON.parse(raw) as Record<string, string>);
      }
    } catch {
      // ignore — fall back to empty map
    }
  }, []);

  const handleSetDueDate = useCallback((blockerId: string, date: string) => {
    setBlockerDueDates((prev) => {
      const next = { ...prev, [blockerId]: date };
      try {
        localStorage.setItem("gt_blocker_due_dates", JSON.stringify(next));
      } catch {
        // ignore quota / availability errors
      }
      return next;
    });
  }, []);

  const dueDateCount = useMemo(
    () => Object.values(blockerDueDates).filter((d) => d && d.trim() !== "").length,
    [blockerDueDates],
  );

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
  const hasAnyRows = (result?.data?.rows ?? []).length > 0;
  const noRunYet = result?.notFound === true;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Planning blockers"
        description="Items with demand that have no usable recommendation. Fix these before the next planning run."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {dueDateCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-info-softer text-info-fg text-3xs font-semibold px-1.5 py-0.5 shrink-0"
                data-testid="blockers-due-date-count-chip"
              >
                <CalendarCheck
                  className="h-3 w-3 shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
                {`${dueDateCount} with due date`}
              </span>
            ) : null}
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
                data-testid="blockers-category-progress-toggle"
              >
                <BarChart2
                  className="h-2.5 w-2.5 shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
                Progress by category
              </button>
            ) : null}
          </div>
        }
      />

      {/* Run meta strip (only when a run exists) */}
      {result?.data?.run ? (
        <RunMetaStrip
          run={result.data.run}
          isHistoricalView={isHistoricalView}
        />
      ) : null}

      {/* I1 — Category progress panel */}
      {showCategoryProgress && categoryProgress.length > 0 ? (
        <div
          className="card p-4 space-y-3"
          data-testid="blockers-category-progress-panel"
        >
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Blockers by category
          </div>
          <div className="space-y-2">
            {categoryProgress.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-fg">{c.label}</span>
                  <span className="font-mono tabular-nums text-fg-muted">
                    {c.count} ({c.pct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className="h-full bg-accent/70"
                    style={{ width: `${c.pct}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
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

      {/* Sort controls */}
      {hasAnyRows ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Sort by:
          </span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => {
            const active = sortKey === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleSort(k)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 transition-colors",
                  active
                    ? "border-accent/60 bg-accent-soft text-accent-fg"
                    : "border-border/60 bg-bg text-fg-muted hover:text-fg hover:border-border-strong",
                )}
                data-testid={`blockers-sort-${k}`}
              >
                {SORT_LABELS[k]}
                {active ? (
                  sortDir === "asc" ? (
                    <ArrowUp
                      className="h-3 w-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <ArrowDown
                      className="h-3 w-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Body */}
      {isLoading ? (
        <BlockersLoadingSkeleton />
      ) : isError || result?.error ? (
        <BlockersErrorBanner onRetry={() => refetch()} />
      ) : noRunYet ? (
        <BlockersEmptyNoRunYet />
      ) : !hasAnyRows ? (
        <BlockersEmptyAllClear />
      ) : !hasRows ? (
        <BlockersFilteredEmpty />
      ) : (
        <>
          {/* Desktop table */}
          <div
            className="hidden sm:block card overflow-hidden p-0"
            data-testid="blockers-table"
          >
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 bg-bg-subtle/40 text-3xs uppercase tracking-sops text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    What is blocked?
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Why is it blocked?
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    What is the risk?
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    What to do now?
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Where to fix it?
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Emitted</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Due date
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <BlockerRow
                    key={row.exception_id}
                    row={row}
                    currentDueDate={blockerDueDates[row.exception_id]}
                    onSetDueDate={(d) => handleSetDueDate(row.exception_id, d)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3" data-testid="blockers-cards">
            {sortedRows.map((row) => (
              <BlockerCard
                key={row.exception_id}
                row={row}
                currentDueDate={blockerDueDates[row.exception_id]}
                onSetDueDate={(d) => handleSetDueDate(row.exception_id, d)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

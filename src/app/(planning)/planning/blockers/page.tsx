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
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
      // tie-break: emitted_at desc by default
      return new Date(b.emitted_at).getTime() - new Date(a.emitted_at).getTime();
    }
    if (key === "demand_qty") {
      const av = a.demand_qty != null ? parseFloat(a.demand_qty) : -Infinity;
      const bv = b.demand_qty != null ? parseFloat(b.demand_qty) : -Infinity;
      if (av !== bv) return sign * (av - bv);
      return new Date(b.emitted_at).getTime() - new Date(a.emitted_at).getTime();
    }
    // emitted_at
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

  // We send ONLY backend-supported filters to the API. The category and
  // severity filter state is sent via the query; the item search uses the
  // backend's item_id query param when it looks like an exact id, and is
  // additionally applied client-side as a substring match against
  // display_name to support partial typing.
  const filters = useMemo(
    () => ({
      run_id: explicitRunId,
      severity: severity.length > 0 ? severity : undefined,
      category: category.length > 0 ? category : undefined,
      // We do NOT pass itemSearch as item_id — the backend item_id is an
      // exact-match filter. Free-text search is client-side.
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

  const toggleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      // reasonable defaults per column
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

  // ----- Render -----
  return (
    <div className="space-y-5" dir="rtl">
      <WorkflowHeader
        title="חסמים בתכנון"
        eyebrow="תכנון · חסמים"
        description="פריטים עם ביקוש שלא הפכו להמלצת רכש או ייצור שמישה"
      />

      {/* Run meta strip — only when we have a run */}
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

      {/* Body — render exactly one of: loading | error | no-run | all-clear |
          filtered-empty | rows. No mock fallback. */}
      {isLoading ? (
        <BlockersLoadingSkeleton />
      ) : result?.error ? (
        <BlockersErrorBanner />
      ) : !result?.data?.run.run_id ? (
        // No completed run yet (run.run_id is null)
        <BlockersEmptyNoRunYet />
      ) : (result?.data?.total_blocker_count ?? 0) === 0 &&
        severity.length === 0 &&
        category.length === 0 &&
        itemSearch.trim() === "" ? (
        // 0 surfaced blockers AND no active filters → all-clear
        <BlockersEmptyAllClear />
      ) : sortedRows.length === 0 ? (
        // After filters, nothing matches
        <BlockersFilteredEmpty />
      ) : (
        <BlockersBody
          rows={sortedRows}
          totalUnfiltered={result?.data?.total_blocker_count ?? 0}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
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
}

function BlockersBody({
  rows,
  totalUnfiltered,
  sortKey,
  sortDir,
  onToggleSort,
}: BlockersBodyProps) {
  const sortGlyph = (k: SortKey): string =>
    sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "";

  return (
    <div className="space-y-3">
      <div className="text-3xs text-fg-faint">
        מציג {rows.length} מתוך {totalUnfiltered} חסמים
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle/40 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            <tr>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BlockerRow key={r.exception_id} row={r} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {rows.map((r) => (
          <BlockerCard key={r.exception_id} row={r} />
        ))}
      </div>
    </div>
  );
}

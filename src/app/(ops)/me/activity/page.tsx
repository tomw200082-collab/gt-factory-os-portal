"use client";

import { useMemo, useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { EmptyState } from "@/components/feedback/states";
import { DayHeader, dayLabel } from "./_components/DayHeader";
import { ActivityRow } from "./_components/ActivityRow";
import { FilterBar, type FilterValue } from "./_components/FilterBar";
import { ActivityDrawer } from "./_components/ActivityDrawer";
import type { ActivityListResponse, ActivityRow as ActivityRowT, SourceKind } from "./_types";

export default function MyActivityPage() {
  const [selected, setSelected] = useState<ActivityRowT | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const filter: FilterValue = useMemo(() => ({
    sourceKinds: (searchParams.getAll("source_kind") as SourceKind[]),
    from:        searchParams.get("from"),
    to:          searchParams.get("to"),
    searchTerm:  searchParams.get("q") ?? "",
  }), [searchParams]);

  const setFilter = useCallback((next: FilterValue) => {
    const sp = new URLSearchParams();
    for (const k of next.sourceKinds) sp.append("source_kind", k);
    if (next.from) sp.set("from", next.from);
    if (next.to)   sp.set("to",   next.to);
    if (next.searchTerm) sp.set("q", next.searchTerm);
    router.replace(`/me/activity${sp.toString() ? `?${sp.toString()}` : ""}`);
  }, [router]);

  const query = useInfiniteQuery<ActivityListResponse, Error>({
    queryKey: ["me", "activity", filter.sourceKinds.join(","), filter.from, filter.to],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const url = new URL("/api/me/activity", window.location.origin);
      url.searchParams.set("limit", "100");
      if (pageParam) url.searchParams.set("cursor", pageParam as string);
      for (const k of filter.sourceKinds) url.searchParams.append("source_kind", k);
      if (filter.from) url.searchParams.set("from", filter.from);
      if (filter.to)   url.searchParams.set("to",   filter.to);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Could not load activity. Check your connection and try refreshing.");
      return res.json() as Promise<ActivityListResponse>;
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30 * 1000,
  });

  const allRows: ActivityRowT[] = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.rows),
    [query.data],
  );

  const visibleRows = useMemo(() => {
    if (!filter.searchTerm.trim()) return allRows;
    const q = filter.searchTerm.toLowerCase();
    return allRows.filter((r) =>
      r.summary.headline.toLowerCase().includes(q) ||
      (r.summary.secondary?.toLowerCase().includes(q) ?? false) ||
      r.action_kind.toLowerCase().includes(q)
    );
  }, [allRows, filter.searchTerm]);

  const grouped = useMemo(() => groupByDay(visibleRows), [visibleRows]);
  const onRowClick = useCallback((r: ActivityRowT) => setSelected(r), []);

  return (
    <>
      <WorkflowHeader
        eyebrow="Me"
        title="My activity"
        description="Append-only history of every action you took in the system. Permanent — corrections create new entries."
      />
      {query.isError ? (
        <div className="rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg">
          <div className="font-semibold">Could not load activity</div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      <SectionCard contentClassName="p-0">
        <FilterBar value={filter} onChange={setFilter} />
        {query.isLoading ? (
          <ul className="divide-y divide-border/60 px-5 py-5" aria-busy="true" aria-live="polite">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex animate-pulse gap-3 py-2">
                <div className="h-5 w-2/3 rounded bg-bg-subtle" />
                <div className="h-5 w-20 rounded bg-bg-subtle" />
              </li>
            ))}
          </ul>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="When you submit a form, approve a credit, or resolve an Inbox card, it will appear here."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {grouped.map(({ label, rows }) => (
              <div key={label}>
                <DayHeader label={label} count={rows.length} />
                {rows.map((r) => (
                  <ActivityRow key={r.activity_id} row={r} onClick={onRowClick} />
                ))}
              </div>
            ))}
          </ul>
        )}
        {query.hasNextPage ? (
          <div className="flex items-center justify-center border-t border-border/60 p-3">
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="text-xs font-medium text-accent underline hover:no-underline disabled:opacity-50"
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </SectionCard>

      {selected ? <ActivityDrawer row={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function groupByDay(rows: ActivityRowT[]): { label: string; rows: ActivityRowT[] }[] {
  const groups = new Map<string, ActivityRowT[]>();
  for (const r of rows) {
    const lbl = dayLabel(r.event_at);
    if (!groups.has(lbl)) groups.set(lbl, []);
    groups.get(lbl)!.push(r);
  }
  return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
}

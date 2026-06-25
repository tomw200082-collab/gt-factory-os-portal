"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";
import { DayHeader, dayLabel } from "./_components/DayHeader";
import { ActivityRow } from "./_components/ActivityRow";
import { FilterBar, type FilterValue, type RangeKey } from "./_components/FilterBar";
import { ActivityDrawer } from "./_components/ActivityDrawer";
import type { ActivityListResponse, ActivityRow as ActivityRowT, SourceKind } from "./_types";

const VALID_RANGES: RangeKey[] = ["today", "week", "30d"];

function dayId(label: string, idx: number): string {
  return `day-${idx}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export default function MyActivityPage() {
  const [selected, setSelected] = useState<ActivityRowT | null>(null);
  const triggerElRef = useRef<HTMLButtonElement | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const filter: FilterValue = useMemo(() => {
    const rawRange = searchParams.get("range");
    const range = (VALID_RANGES as string[]).includes(rawRange ?? "") ? (rawRange as RangeKey) : null;
    return {
      sourceKinds: (searchParams.getAll("source_kind") as SourceKind[]),
      range,
      from:        searchParams.get("from"),
      to:          searchParams.get("to"),
      searchTerm:  searchParams.get("q") ?? "",
    };
  }, [searchParams]);

  const setFilter = useCallback((next: FilterValue) => {
    const sp = new URLSearchParams();
    for (const k of next.sourceKinds) sp.append("source_kind", k);
    if (next.range) sp.set("range", next.range);
    if (next.from)  sp.set("from", next.from);
    if (next.to)    sp.set("to",   next.to);
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
    () => (query.data?.pages ?? []).flatMap((p) => p.rows ?? []),
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

  const onRowClick = useCallback((r: ActivityRowT, el: HTMLButtonElement) => {
    triggerElRef.current = el;
    setSelected(r);
  }, []);

  const onCloseDrawer = useCallback(() => setSelected(null), []);

  const hasServerFilters =
    filter.sourceKinds.length > 0 || filter.range !== null || !!filter.from || !!filter.to;
  const hasSearch = filter.searchTerm.trim().length > 0;

  const clearAll = useCallback(() => {
    setFilter({ sourceKinds: [], range: null, from: null, to: null, searchTerm: "" });
  }, [setFilter]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Me"
        title="My activity"
        description="Append-only history of every action you took in the system. Permanent — corrections create new entries."
        actions={
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh activity"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-fg-muted",
              "hover:border-fg-muted hover:text-fg",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              "disabled:opacity-50"
            )}
          >
            {query.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            Refresh
          </button>
        }
      />

      <SectionCard contentClassName="p-0">
        <FilterBar value={filter} onChange={setFilter} />

        {query.isError ? (
          <div
            role="alert"
            className="m-5 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          >
            <div className="font-semibold">Could not load activity</div>
            <div className="mt-0.5 text-xs">{query.error.message}</div>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-2 rounded-sm border border-danger/40 px-2 py-0.5 text-xs font-medium text-danger-fg hover:bg-danger-soft"
            >
              Retry
            </button>
          </div>
        ) : null}

        {query.isError ? null : query.isLoading ? (
          <ul className="divide-y divide-border/60 px-5 py-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex animate-pulse items-start gap-4 py-3">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-2/3 rounded bg-bg-subtle" />
                  <div className="h-3 w-1/2 rounded bg-bg-subtle/70" />
                </div>
                <div className="space-y-1.5 text-right">
                  <div className="ml-auto h-3 w-12 rounded bg-bg-subtle" />
                  <div className="ml-auto h-3 w-10 rounded bg-bg-subtle/70" />
                </div>
              </li>
            ))}
          </ul>
        ) : visibleRows.length === 0 ? (
          <div className="px-5 py-6">
            {hasSearch && allRows.length > 0 ? (
              <EmptyState
                title={`No matches for “${filter.searchTerm.trim()}”`}
                description="Search only looks at activity already loaded. Load more history below, or try a shorter term."
                action={
                  <button
                    type="button"
                    onClick={() => setFilter({ ...filter, searchTerm: "" })}
                    className="rounded-md border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-fg-muted hover:border-fg-muted hover:text-fg"
                  >
                    Clear search
                  </button>
                }
              />
            ) : hasServerFilters || hasSearch ? (
              <EmptyState
                title="No activity matches these filters"
                description="Try clearing one filter, broadening the date range, or selecting more sources."
                action={
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-md border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-fg-muted hover:border-fg-muted hover:text-fg"
                  >
                    Clear all filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                title="No activity yet"
                description="When you submit a form, approve a credit, or resolve an Inbox card, it will appear here."
              />
            )}
          </div>
        ) : (
          <div>
            {grouped.map(({ label, rows }, idx) => {
              const id = dayId(label, idx);
              return (
                <section key={id} aria-labelledby={id}>
                  <DayHeader id={id} label={label} count={rows.length} />
                  <ul role="list" className="divide-y divide-border/60">
                    {rows.map((r) => (
                      <ActivityRow key={r.activity_id} row={r} onClick={onRowClick} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {query.hasNextPage ? (
          <div
            className="flex items-center justify-center border-t border-border/60 p-4"
            aria-live="polite"
          >
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-raised px-4 py-1.5 text-xs font-medium text-fg-muted",
                "hover:border-fg-muted hover:text-fg",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                "disabled:opacity-50"
              )}
            >
              {query.isFetchingNextPage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  Loading…
                </>
              ) : (
                <>Load more history</>
              )}
            </button>
          </div>
        ) : null}
      </SectionCard>

      {selected ? (
        <ActivityDrawer row={selected} triggerEl={triggerElRef.current} onClose={onCloseDrawer} />
      ) : null}
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

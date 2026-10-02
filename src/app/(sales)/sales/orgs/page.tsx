"use client";

// The businesses (GT Pulse Unit B, tranche 189).
//
// About 1,300 orgs live behind this list, so nothing is filtered in the
// browser: the filter, the sort and the paging are the server's, and the
// search asks the server's lean index. Filter, sort and search live in the URL,
// so Back from a business returns to the same list.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ShieldQuestion } from "lucide-react";
import { useSession } from "@/lib/auth/session-provider";
import { useOrgSearch, useOrgsPage, useSetOrgOwner, useSettings } from "../../_lib/api";
import { fmtPhone } from "../../_lib/format";
import { ORG_FILTER_LABELS, ORG_SORT_LABELS, UI } from "../../_lib/labels";
import { useDebounced } from "../../_lib/useDebounced";
import { useAutoClear } from "../../_lib/useAutoClear";
import type { OrgFilter, OrgSort } from "../../_lib/types";
import { ListEmpty, OrgsLoading, QueueError } from "../../_components/EmptyStates";
import { OrgList } from "../../_components/OrgList";
import { BulkOwnerBar } from "../../_components/BulkOwnerBar";
import { Toast } from "../../_components/Toast";

const FILTERS: OrgFilter[] = ["active", "prospect", "all", "review"];
const SORTS: OrgSort[] = ["last_order", "ex_vat_12m", "name"];

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function OrgsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useSession();
  const manager = session?.role === "admin" || session?.role === "planner";

  const filters = manager ? FILTERS : FILTERS.filter((f) => f !== "review");
  const [filter, setFilter] = useState<OrgFilter>(() => pick(params?.get("filter"), filters, "active"));
  const [sort, setSort] = useState<OrgSort>(() => pick(params?.get("sort"), SORTS, "last_order"));
  const [query, setQuery] = useState(() => params?.get("q") ?? "");
  const settled = useDebounced(query);
  const searching = settled.trim().length >= 2;

  // Keep the URL in step, so Back from a business lands on this same view.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filter !== "active") next.set("filter", filter);
    if (sort !== "last_order") next.set("sort", sort);
    if (settled.trim()) next.set("q", settled.trim());
    const qs = next.toString();
    router.replace(qs ? `/sales/orgs?${qs}` : "/sales/orgs", { scroll: false });
  }, [filter, sort, settled, router]);

  const page = useOrgsPage(filter, sort);
  const search = useOrgSearch(searching ? settled : "");
  const settings = useSettings(manager);
  const owner = useSetOrgOwner();

  const rows = useMemo(() => page.data?.pages.flatMap((p) => p.rows) ?? [], [page.data]);
  const total = page.data?.pages[0]?.total ?? 0;
  const roster = useMemo(() => settings.data?.assignees ?? [], [settings.data]);
  const owners = useMemo(() => Object.fromEntries(roster.map((a) => [a.email, a.name])), [roster]);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const clearToast = useCallback(() => setToast(null), []);
  useAutoClear(toast, clearToast);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    owner.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="s-opening s-opening-compact flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {UI.orgsTitle}
          </h1>
          {page.isSuccess && !searching ? (
            <span className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {UI.orgsCount(total)}
            </span>
          ) : null}
        </div>

        <input
          type="search"
          className="s-input"
          placeholder={UI.orgsSearch}
          aria-label={UI.orgsSearch}
          data-testid="orgs-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim().length === 1 ? (
          <p data-testid="orgs-search-hint" className="-mt-1 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            {UI.searchMinHint}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="s-segmented s-org-filters" data-count={filters.length} role="group" aria-label={UI.filterLabel}>
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                data-testid={`orgs-filter-${f}`}
                aria-pressed={filter === f}
                className={`s-tab ${filter === f ? "s-tab-active" : ""}`}
                onClick={() => {
                  setFilter(f);
                  setSelected(new Set());
                }}
              >
                {ORG_FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="orgs-sort" className="shrink-0 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {UI.sortLabel}
            </label>
            <select
              id="orgs-sort"
              className="s-input w-auto"
              value={sort}
              onChange={(e) => {
                setSort(pick(e.target.value, SORTS, "last_order"));
                // a new order may not hold the businesses chosen in the old one
                setSelected(new Set());
              }}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {ORG_SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {manager ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/sales/orgs/review" className="s-btn s-btn-ghost s-glass-btn" data-testid="orgs-review-link">
              <ShieldQuestion size={16} aria-hidden />
              {UI.reviewQueueLink}
            </Link>
            {!searching ? (
              <button
                type="button"
                className="s-btn s-btn-ghost s-glass-btn"
                // an assignment in flight finishes before the selection closes, or its confirmation is lost (INTER-B-008)
                disabled={selecting && owner.isPending}
                title={selecting && owner.isPending ? UI.ownerSavingWait : undefined}
                onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              >
                {selecting ? UI.orgsSelectDone : UI.orgsSelect}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {searching ? (
        <SearchResults query={settled} hits={search.data} loading={search.isLoading} error={search.isError} onRetry={() => void search.refetch()} />
      ) : (
        <>
          {page.isLoading ? <OrgsLoading /> : null}
          {page.isError && rows.length === 0 ? (
            <QueueError onRetry={() => void page.refetch()} what={UI.loadErrorOrgs} />
          ) : null}
          {page.isSuccess && rows.length === 0 ? (
            <div data-testid="orgs-empty">
              {filter === "all" ? (
                <ListEmpty label={UI.orgsEmpty} />
              ) : (
                <div className="s-card flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <p className="text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                    {UI.orgsFilterEmpty}
                  </p>
                  <button type="button" className="s-btn s-btn-ghost" onClick={() => setFilter("all")}>
                    {UI.orgsShowAll}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {rows.length > 0 ? (
            <div aria-busy={page.isFetching || undefined} className={page.isPlaceholderData ? "s-refetching" : undefined}>
              <OrgList
                rows={rows}
                manager={manager}
                owners={owners}
                selecting={selecting}
                selected={selected}
                onToggle={toggle}
              />
              <div className="mt-3 flex flex-col items-center gap-2">
                <p data-testid="orgs-showing" className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                  {UI.orgsShowing(rows.length, total)}
                </p>
                {page.hasNextPage ? (
                  <button
                    type="button"
                    className="s-btn s-btn-ghost"
                    disabled={page.isFetchingNextPage}
                    aria-busy={page.isFetchingNextPage || undefined}
                    onClick={() => void page.fetchNextPage()}
                  >
                    {page.isFetchingNextPage ? UI.loading : UI.showMoreOrgs}
                  </button>
                ) : null}
                {page.isError ? (
                  <QueueError onRetry={() => void page.fetchNextPage()} what={UI.loadErrorOrgs} />
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* how many the screen holds, said once to a screen reader (A11Y-B-001) */}
      <p data-testid="orgs-live" role="status" aria-live="polite" className="sr-only">
        {searching
          ? search.isSuccess ? (search.data.length > 0 ? UI.searchResults(search.data.length) : UI.searchEmpty) : ""
          : page.isSuccess ? UI.orgsCount(total) : ""}
      </p>

      {selecting && selected.size > 0 && !searching ? (
        <BulkOwnerBar
          count={selected.size}
          roster={roster}
          busy={owner.isPending}
          error={owner.isError ? UI.ownerFailed : null}
          onClear={() => setSelected(new Set())}
          onAssign={(email) =>
            owner.mutate(
              { org_ids: [...selected], owner_email: email },
              {
                onSuccess: (res) => {
                  setToast(UI.ownerAssigned(res?.updated ?? selected.size, owners[email] ?? email));
                  stopSelecting();
                },
              },
            )
          }
        />
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function SearchResults({
  query,
  hits,
  loading,
  error,
  onRetry,
}: {
  query: string;
  hits: Array<{ id: string; name: string; phone: string | null }> | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (loading) return <OrgsLoading />;
  if (error) return <QueueError onRetry={onRetry} what={UI.loadErrorOrgs} />;
  if (!hits || hits.length === 0) {
    return (
      <div data-testid="orgs-empty">
        <ListEmpty label={UI.searchEmpty} />
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="orgs-search-results" aria-label={`${UI.searchResults(hits.length)}: ${query}`}>
      {hits.map((hit) => (
        <li key={hit.id}>
          <Link href={`/sales/orgs/${encodeURIComponent(hit.id)}`} className="s-card s-org-row" data-testid={`org-hit-${hit.id}`}>
            <span className="s-org-name">{hit.name}</span>
            {hit.phone ? (
              <span className="s-org-sub s-nums">
                <bdi dir="ltr">{fmtPhone(hit.phone)}</bdi>
              </span>
            ) : null}
            <ChevronLeft size={16} aria-hidden className="s-org-chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function OrgsPage() {
  return (
    <Suspense fallback={<OrgsLoading />}>
      <OrgsScreen />
    </Suspense>
  );
}

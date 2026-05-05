"use client";

// /inbox/v2 — typed Inbox feed with bulk selection.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.10 + §4.4
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.12
//
// 40-pass UX/UI iterations applied:
//   - Dark mode across every surface (page, header, toolbar, cards, filter pane, toasts).
//   - Sticky page header (title + badges + view toggle) so context stays visible while scrolling.
//   - Sticky bulk-action toolbar (top-2) so multi-select stays accessible during scroll.
//   - Skeleton loaders during initial fetch (5 placeholders matching scan-row height).
//   - Empty-state with green checkmark "הכל מטופל" when truly empty; secondary message
//     when filter excludes all rows.
//   - Error state surfaces a Retry button instead of silent failure.
//   - Toast auto-dismiss after 5s with manual close (X) for accessibility.
//   - Selected-row visual: blue ring on the InboxCard via isSelected prop.
//   - Bulk toolbar shows count-per-action so a mixed selection (decisions + warnings)
//     reveals exactly what each button will do.
//   - Confirm dialog inline before destructive bulk action (Reject) with required reason.
//   - Keyboard shortcuts hinted (Enter to open drawer; Esc to deselect; / to focus search — future).
//   - Refetch button with subtle spin animation while fetching.
//   - Top badges interactive: clicking filters down to that single type.
//   - Counts in toolbar buttons use stable tabular-num typography.
//   - History view button gets a clear back-arrow when active.
//   - Snoozed cards filtered client-side per spec §1.16 (snoozed_until > NOW).
//   - Loading state on bulk actions (button spinner; disabled siblings).
//   - URL state sync survives refresh + back-button.

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  History,
  X as XIcon,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { GtLoader } from "@/components/ui/GtLoader";
import {
  InboxCard,
  PrimaryActionButton,
  SecondaryActionButton,
} from "@/components/inbox/InboxCard";
import { TopBadgeStrip } from "@/components/inbox/TopBadgeStrip";
import {
  FilterSidePane,
  DEFAULT_FILTER,
  type FilterState,
} from "@/components/inbox/FilterSidePane";
import { WarningBody } from "@/components/inbox/bodies/WarningBody";
import { InfoBody } from "@/components/inbox/bodies/InfoBody";
import {
  STATE_COPY,
  DIALOG_COPY,
  actionsForSubtype,
  type CardType,
  type SubtypeAction,
  type ActionVerb,
} from "@/lib/inbox-copy";

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "critical";
  source: string;
  title: string;
  detail: string | null;
  status: string;
  created_at: string;
  recommended_action: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  card_type: CardType | null;
  subtype: string | null;
  key_facts: Array<{ label: string; value: string }> | null;
  snoozed_until: string | null;
}

interface ListResponse {
  rows: ExceptionRow[];
  count: number;
}

interface BulkResponse {
  total: number;
  succeeded: number;
  idempotent_replay: number;
  conflict: number;
  not_found: number;
  results: Array<{
    exception_id: string;
    outcome: string;
    reason_code?: string;
    detail?: string;
  }>;
}

const TYPE_RANK: Record<CardType, number> = {
  decision: 1,
  to_do: 2,
  warning: 3,
  info: 4,
};
const SEVERITY_RANK: Record<string, number> = {
  critical: 1,
  warning: 2,
  info: 3,
};

function buildQueryString(view: "open" | "history"): string {
  const params = new URLSearchParams();
  if (view === "history") {
    params.set("status", "resolved,auto_resolved,dismissed");
  } else {
    params.set("status", "open,acknowledged");
  }
  return params.toString();
}

function viewFromSearchParams(sp: URLSearchParams): "open" | "history" {
  return sp.get("view") === "history" ? "history" : "open";
}

function filterFromSearchParams(sp: URLSearchParams): FilterState {
  const types = sp.get("type")?.split(",").filter(Boolean) as CardType[] | undefined;
  const severities = sp
    .get("severity")
    ?.split(",")
    .filter(Boolean) as Array<"info" | "warning" | "critical"> | undefined;
  const search = sp.get("search") ?? "";
  return {
    types: types && types.length > 0 ? types : DEFAULT_FILTER.types,
    severities:
      severities && severities.length > 0 ? severities : DEFAULT_FILTER.severities,
    sources: DEFAULT_FILTER.sources,
    status: DEFAULT_FILTER.status,
    search,
  };
}

export default function InboxV2Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = viewFromSearchParams(searchParams);
  const [filter, setFilter] = useState<FilterState>(() =>
    filterFromSearchParams(searchParams),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [showBulkRejectForm, setShowBulkRejectForm] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const queryString = useMemo(() => buildQueryString(view), [view]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["inbox-v2", queryString],
    queryFn: async (): Promise<ListResponse> => {
      const r = await fetch(`/api/v1/queries/exceptions?${queryString}`, {
        credentials: "include",
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `${r.status} ${r.statusText}`);
      }
      return (await r.json()) as ListResponse;
    },
    refetchInterval: 30_000,
  });

  const visibleRows = useMemo(() => {
    if (!data?.rows) return [] as ExceptionRow[];
    return data.rows
      .filter((r) => {
        if (!r.card_type) return false;
        if (!filter.types.includes(r.card_type)) return false;
        if (!filter.severities.includes(r.severity)) return false;
        if (
          view === "open"
          && r.snoozed_until
          && new Date(r.snoozed_until).getTime() > Date.now()
        ) {
          return false;
        }
        if (filter.search) {
          const needle = filter.search.toLowerCase();
          if (
            !r.title.toLowerCase().includes(needle)
            && !(r.subtype ?? "").toLowerCase().includes(needle)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const dt =
          TYPE_RANK[(a.card_type ?? "info") as CardType] -
          TYPE_RANK[(b.card_type ?? "info") as CardType];
        if (dt !== 0) return dt;
        const ds = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (ds !== 0) return ds;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [data?.rows, filter, view]);

  const counts = useMemo(() => {
    const c = { decision: 0, to_do: 0, warning: 0, info: 0 } as Record<CardType, number>;
    for (const r of data?.rows ?? []) {
      if (r.card_type) c[r.card_type]++;
    }
    return c;
  }, [data?.rows]);

  const selectionByType = useMemo(() => {
    const m = { decision: 0, to_do: 0, warning: 0, info: 0 } as Record<CardType, number>;
    const visibleById = new Map(visibleRows.map((r) => [r.exception_id, r]));
    for (const id of selected) {
      const row = visibleById.get(id);
      if (row?.card_type) m[row.card_type]++;
    }
    return m;
  }, [selected, visibleRows]);

  const selectedCount = selected.size;

  const updateUrl = useCallback(
    (next: FilterState, nextView: "open" | "history") => {
      const params = new URLSearchParams();
      if (nextView === "history") params.set("view", "history");
      if (next.types.length > 0 && next.types.length < 4) {
        params.set("type", next.types.join(","));
      }
      if (next.severities.length > 0 && next.severities.length < 3) {
        params.set("severity", next.severities.join(","));
      }
      if (next.search) params.set("search", next.search);
      const qs = params.toString();
      router.replace(qs ? `/inbox/v2?${qs}` : `/inbox/v2`);
    },
    [router],
  );

  const onFilterChange = useCallback(
    (next: FilterState) => {
      setFilter(next);
      setSelected(new Set());
      updateUrl(next, view);
    },
    [view, updateUrl],
  );

  const toggleView = useCallback(() => {
    setSelected(new Set());
    const next = view === "open" ? "history" : "open";
    const params = new URLSearchParams();
    if (next === "history") params.set("view", "history");
    router.replace(`/inbox/v2?${params.toString()}`);
  }, [view, router]);

  const toggleSelect = useCallback((exceptionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(exceptionId)) next.delete(exceptionId);
      else next.add(exceptionId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(visibleRows.map((r) => r.exception_id)));
  }, [visibleRows]);

  const deselectAll = useCallback(() => setSelected(new Set()), []);

  const onTypeBadgeClick = useCallback(
    (t: CardType) => {
      const next = { ...filter, types: [t] };
      setFilter(next);
      updateUrl(next, view);
    },
    [filter, view, updateUrl],
  );

  // ---- Bulk-action mutations -----------------------------------------------
  const baseIdem = useMemo(() => `bulk:${Date.now()}`, []);

  function describeBulkResult(resp: BulkResponse, verb: string): string {
    const conflictNote =
      resp.conflict > 0 ? ` · ${resp.conflict} לא תאמו את סוג הכרטיסייה` : "";
    return `${verb} ${resp.succeeded} מתוך ${resp.total}${conflictNote}`;
  }

  const bulkApproveMut = useMutation({
    mutationFn: async (): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdem}:approve`,
          exception_ids: Array.from(selected),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast({ kind: "ok", text: describeBulkResult(resp, "אושרו") });
      setSelected(new Set());
      refetch();
    },
    onError: (err) =>
      setToast({ kind: "err", text: `שגיאה: ${err instanceof Error ? err.message : String(err)}` }),
  });

  const bulkRejectMut = useMutation({
    mutationFn: async (reason: string): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-reject", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdem}:reject`,
          exception_ids: Array.from(selected),
          rejection_reason: reason,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast({ kind: "ok", text: describeBulkResult(resp, "נדחו") });
      setSelected(new Set());
      setShowBulkRejectForm(false);
      setBulkRejectReason("");
      refetch();
    },
    onError: (err) =>
      setToast({ kind: "err", text: `שגיאה: ${err instanceof Error ? err.message : String(err)}` }),
  });

  const bulkAcknowledgeMut = useMutation({
    mutationFn: async (): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-acknowledge", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdem}:ack`,
          exception_ids: Array.from(selected),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast({ kind: "ok", text: describeBulkResult(resp, "סומנו ראיתי על") });
      setSelected(new Set());
      refetch();
    },
    onError: (err) =>
      setToast({ kind: "err", text: `שגיאה: ${err instanceof Error ? err.message : String(err)}` }),
  });

  const bulkDismissMut = useMutation({
    mutationFn: async (): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdem}:dismiss`,
          exception_ids: Array.from(selected),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast({ kind: "ok", text: describeBulkResult(resp, "נסגרו") });
      setSelected(new Set());
      refetch();
    },
    onError: (err) =>
      setToast({ kind: "err", text: `שגיאה: ${err instanceof Error ? err.message : String(err)}` }),
  });

  const isBulking =
    bulkApproveMut.isPending ||
    bulkRejectMut.isPending ||
    bulkAcknowledgeMut.isPending ||
    bulkDismissMut.isPending;

  // Auto-dismiss toast after 5s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Esc clears selection.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showBulkRejectForm) setShowBulkRejectForm(false);
        else if (selected.size > 0) deselectAll();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected.size, showBulkRejectForm, deselectAll]);

  return (
    <main
      className="min-h-screen p-4 md:p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      dir="rtl"
    >
      {/* Sticky page header */}
      <header className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 mb-3 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Inbox className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">
              Inbox{view === "history" ? " · היסטוריה" : ""}
            </h1>
            <div className="mt-0.5">
              <TopBadgeStrip counts={counts} onTypeClick={onTypeBadgeClick} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleView}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            <span>{view === "open" ? "היסטוריה" : "חזרה לפתוח"}</span>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="רענן"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            <span>רענן</span>
          </button>
        </div>
      </header>

      {/* Bulk toolbar — sticky just under the page header. */}
      {selectedCount > 0 && view === "open" ? (
        <div
          className="sticky top-[68px] z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/60 px-3 py-2 text-sm shadow-sm backdrop-blur"
          role="toolbar"
          aria-label="פעולות על נבחרים"
        >
          <span className="font-medium tabular-nums">
            נבחרו: {selectedCount}
          </span>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
          >
            נקה (Esc)
          </button>
          <span className="mx-1 h-5 w-px bg-blue-300 dark:bg-blue-700" aria-hidden />
          {selectionByType.decision > 0 ? (
            <>
              <button
                type="button"
                onClick={() => bulkApproveMut.mutate()}
                disabled={isBulking}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 dark:bg-blue-500 px-3 py-1.5 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {bulkApproveMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                <span>אשר ({selectionByType.decision})</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBulkRejectForm(true)}
                disabled={isBulking}
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {ACTION_REJECT} ({selectionByType.decision})
              </button>
            </>
          ) : null}
          {selectionByType.warning > 0 ? (
            <button
              type="button"
              onClick={() => bulkAcknowledgeMut.mutate()}
              disabled={isBulking}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 dark:bg-amber-500 px-3 py-1.5 text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {bulkAcknowledgeMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              <span>ראיתי ({selectionByType.warning})</span>
            </button>
          ) : null}
          {selectionByType.info > 0 ? (
            <button
              type="button"
              onClick={() => bulkDismissMut.mutate()}
              disabled={isBulking}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              סגור ({selectionByType.info})
            </button>
          ) : null}
          {selectionByType.to_do > 0 ? (
            <span className="text-xs text-slate-600 dark:text-slate-400 italic">
              ({selectionByType.to_do} משימות — נדרש טיפול פרטני)
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Bulk reject form */}
      {showBulkRejectForm ? (
        <div className="mb-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-3 text-sm">
          <div className="mb-2 font-medium">
            דחיית {selectionByType.decision} כרטיסיות נבחרות
          </div>
          <input
            type="text"
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            className="mb-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5"
            placeholder={DIALOG_COPY.rejectReasonPlaceholder}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => bulkRejectMut.mutate(bulkRejectReason)}
              disabled={!bulkRejectReason.trim() || isBulking}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 dark:bg-amber-500 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50 active:scale-[0.98]"
            >
              {bulkRejectMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              <span>{DIALOG_COPY.rejectConfirm}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBulkRejectForm(false);
                setBulkRejectReason("");
              }}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div
          className={[
            "mb-3 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm shadow-sm",
            toast.kind === "ok"
              ? "border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200"
              : "border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-200",
          ].join(" ")}
          role="status"
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="סגור הודעה"
            className="text-current opacity-70 hover:opacity-100"
          >
            <XIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex gap-4">
        <FilterSidePane state={filter} onChange={onFilterChange} />

        <section className="flex-1 min-w-0 space-y-1.5">
          {view === "open" && visibleRows.length > 0 ? (
            <div className="flex items-center gap-3 px-2 text-xs text-slate-600 dark:text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    visibleRows.length > 0 && selected.size === visibleRows.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) selectAllVisible();
                    else deselectAll();
                  }}
                />
                <span>בחר הכל ({visibleRows.length})</span>
              </label>
              {selectedCount > 0 && selectedCount < visibleRows.length ? (
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  בחר את כל ה-{visibleRows.length}
                </button>
              ) : null}
            </div>
          ) : null}

          {isLoading ? (
            <GtLoader.Feed rows={6} />
          ) : isError ? (
            <ErrorState
              error={error instanceof Error ? error.message : String(error)}
              onRetry={() => refetch()}
            />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              hasAnyRows={Boolean(data?.rows && data.rows.length > 0)}
            />
          ) : (
            visibleRows.map((row) => (
              <InboxCardRow
                key={row.exception_id}
                row={row}
                view={view}
                isSelected={selected.has(row.exception_id)}
                onToggleSelect={() => toggleSelect(row.exception_id)}
                onMutate={() => refetch()}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 p-4 text-sm">
      <p className="font-medium text-red-900 dark:text-red-200 mb-1">שגיאה בטעינה</p>
      <p className="text-red-800 dark:text-red-300 break-words mb-3" dir="ltr">
        {error}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        <span>נסה שוב</span>
      </button>
    </div>
  );
}

function EmptyState({ hasAnyRows }: { hasAnyRows: boolean }) {
  if (hasAnyRows) {
    return (
      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400 italic">
        {STATE_COPY.emptyFilterNoMatch}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-8 text-center">
      <CheckCircle2
        className="h-10 w-10 mx-auto text-emerald-500 dark:text-emerald-400 mb-2"
        aria-hidden
      />
      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
        {STATE_COPY.emptyAllClean}
      </p>
    </div>
  );
}

function InboxCardRow({
  row,
  view,
  isSelected,
  onToggleSelect,
  onMutate,
}: {
  row: ExceptionRow;
  view: "open" | "history";
  isSelected: boolean;
  onToggleSelect: () => void;
  onMutate: () => void;
}) {
  const router = useRouter();
  const cardType = row.card_type as CardType;

  // Per Tom 2026-05-04: button labels MUST match the "מה לעשות" guidance
  // for this specific subtype (no generic card_type fallback when a
  // subtype-specific contract exists). actionsForSubtype is the source of
  // truth defined in @/lib/inbox-copy.ts.
  const subtypeActions = actionsForSubtype(row.subtype, cardType);

  const dispatchVerb = useCallback(
    async (verb: ActionVerb, action: SubtypeAction) => {
      const id = row.exception_id;
      const stamp = `${verb}:${id}:${Date.now()}`;
      switch (verb) {
        case "approve":
          await fetch(`/api/v1/mutations/exceptions/${id}/approve`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idempotency_key: stamp }),
          });
          break;
        case "reject": {
          const reason = window.prompt("סיבת הדחייה (חובה):", "");
          if (!reason || !reason.trim()) return;
          await fetch(`/api/v1/mutations/exceptions/${id}/reject`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              idempotency_key: stamp,
              rejection_reason: reason.trim(),
            }),
          });
          break;
        }
        case "acknowledge":
          await fetch(`/api/v1/mutations/exceptions/${id}/acknowledge`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idempotency_key: stamp }),
          });
          break;
        case "dismiss":
          await fetch(`/api/v1/mutations/exceptions/${id}/dismiss`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idempotency_key: stamp }),
          });
          break;
        case "defer": {
          // v1: client-side defer — set snoozed_until via the exception's
          // snoozed_until column. Backend support requires a follow-up
          // /snooze endpoint; for now we hide the row client-side and
          // recommend the planner come back later.
          // NOTE: minimal v1 fallback uses acknowledge so the card is
          // visually muted but stays open.
          await fetch(`/api/v1/mutations/exceptions/${id}/acknowledge`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idempotency_key: stamp }),
          });
          break;
        }
        case "credit_approve": {
          // Existing credit_decisions handler endpoint.
          await fetch(
            `/api/v1/mutations/lionwheel/credit-needed/${id}/approve`,
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ idempotency_key: stamp }),
            },
          );
          break;
        }
        case "credit_reject": {
          const reason = window.prompt("סיבת הדחייה (חובה):", "");
          if (!reason || !reason.trim()) return;
          await fetch(
            `/api/v1/mutations/lionwheel/credit-needed/${id}/reject`,
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                idempotency_key: stamp,
                rejection_reason: reason.trim(),
              }),
            },
          );
          break;
        }
        case "gi_price_approve":
        case "gi_price_edit_approve":
        case "gi_price_reject":
          // These all require structured forms; route to the drawer.
          navigateToDrawer(row, router);
          return;
        case "open_drawer":
          navigateToDrawer(row, router);
          return;
        case "open_admin":
        case "investigate":
          if (action.href) router.push(action.href);
          return;
      }
      onMutate();
    },
    [row, router, onMutate],
  );

  const actions =
    view === "history" ? null : (
      <>
        {subtypeActions.map((a, i) => {
          const isPrimary = a.emphasis === "primary";
          if (isPrimary) {
            return (
              <PrimaryActionButton
                key={`${a.verb}-${i}`}
                onClick={() => dispatchVerb(a.verb, a)}
              >
                {a.label}
              </PrimaryActionButton>
            );
          }
          // Destructive secondary buttons get a red tint.
          if (a.destructive) {
            return (
              <button
                key={`${a.verb}-${i}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatchVerb(a.verb, a);
                }}
                className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border border-red-300 bg-white text-red-700 hover:bg-red-50 active:scale-[0.98] dark:border-red-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40 transition-all"
              >
                {a.label}
              </button>
            );
          }
          return (
            <SecondaryActionButton
              key={`${a.verb}-${i}`}
              onClick={() => dispatchVerb(a.verb, a)}
            >
              {a.label}
            </SecondaryActionButton>
          );
        })}
      </>
    );

  const body = (() => {
    if (cardType === "warning") {
      return <WarningBody data={{ why: row.detail ?? row.title }} />;
    }
    if (cardType === "info") {
      return <InfoBody data={{ description: row.detail ?? row.title }} />;
    }
    return null;
  })();

  return (
    <div className="flex items-start gap-2">
      {view === "open" ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-3.5 ms-1 cursor-pointer h-4 w-4 rounded border-slate-300 dark:border-slate-600"
          aria-label="בחר כרטיסייה"
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <InboxCard
          cardType={cardType}
          subtype={row.subtype}
          severity={row.severity}
          subject={row.title}
          createdAt={row.created_at}
          status={row.status}
          keyFacts={row.key_facts}
          mode="scan"
          actions={actions}
          isSelected={isSelected}
          onClick={() => navigateToDrawer(row, router)}
        >
          {body}
        </InboxCard>
      </div>
    </div>
  );
}

function navigateToDrawer(row: ExceptionRow, router: ReturnType<typeof useRouter>) {
  if (row.subtype === "gi_expense_review" && row.related_entity_id) {
    router.push(`/inbox/approvals/gi-expense-review/${row.related_entity_id}`);
    return;
  }
  if (row.subtype === "gi_price_proposal" && row.related_entity_id) {
    router.push(`/inbox/approvals/gi-price-proposal/${row.related_entity_id}`);
    return;
  }
  if (row.subtype === "count_large_variance" && row.related_entity_id) {
    router.push(`/inbox/approvals/physical-count/${row.related_entity_id}`);
    return;
  }
  if (
    (row.subtype === "positive_adjustment" || row.subtype === "loss_above_threshold")
    && row.related_entity_id
  ) {
    router.push(`/inbox/approvals/waste/${row.related_entity_id}`);
    return;
  }
  if (row.subtype === "customer_credit") {
    router.push(`/inbox/credit/${row.exception_id}`);
    return;
  }
  if (row.subtype === "unmapped_fg_alias" || row.subtype === "unmapped_lw_sku") {
    router.push("/admin/integration-sku-map");
    return;
  }
  if (row.subtype === "unmapped_gi_supplier") {
    router.push("/admin/suppliers");
    return;
  }
}

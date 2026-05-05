"use client";

// /inbox/v2 — typed Inbox feed with bulk selection.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.10 + §4.4
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.12

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  copyForCardType,
  copyForAction,
  ACTION_REJECT,
  ACTION_DEFER,
  STATE_COPY,
  DIALOG_COPY,
  type CardType,
} from "@/lib/inbox-copy";
import { compressStatus } from "@/lib/inbox-status";

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
  const [toast, setToast] = useState<string | null>(null);

  const queryString = useMemo(() => buildQueryString(view), [view]);

  const { data, isLoading, isError, error, refetch } = useQuery({
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

  // Filter + sort.
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

  // Counts per card_type within the CURRENT SELECTION — drives bulk action button labels.
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

  const onFilterChange = useCallback(
    (next: FilterState) => {
      setFilter(next);
      setSelected(new Set()); // reset selection when filter changes
      const params = new URLSearchParams();
      if (view === "history") params.set("view", "history");
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
    [view, router],
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

  // Bulk action mutations — each posts to the corresponding bulk endpoint.
  const baseIdempotency = useMemo(() => `bulk:${Date.now()}`, []);

  const bulkApproveMut = useMutation({
    mutationFn: async (): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdempotency}:approve`,
          exception_ids: Array.from(selected),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast(
        `אושרו ${resp.succeeded} מתוך ${resp.total}` +
          (resp.conflict > 0 ? ` · ${resp.conflict} לא תאמו את סוג הכרטיסייה` : ""),
      );
      setSelected(new Set());
      refetch();
    },
    onError: (err) =>
      setToast(`שגיאה: ${err instanceof Error ? err.message : String(err)}`),
  });

  const bulkRejectMut = useMutation({
    mutationFn: async (reason: string): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-reject", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdempotency}:reject`,
          exception_ids: Array.from(selected),
          rejection_reason: reason,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast(`נדחו ${resp.succeeded} מתוך ${resp.total}`);
      setSelected(new Set());
      setShowBulkRejectForm(false);
      setBulkRejectReason("");
      refetch();
    },
    onError: (err) =>
      setToast(`שגיאה: ${err instanceof Error ? err.message : String(err)}`),
  });

  const bulkAcknowledgeMut = useMutation({
    mutationFn: async (): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-acknowledge", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdempotency}:ack`,
          exception_ids: Array.from(selected),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast(`סומנו "ראיתי" על ${resp.succeeded} מתוך ${resp.total}`);
      setSelected(new Set());
      refetch();
    },
    onError: (err) =>
      setToast(`שגיאה: ${err instanceof Error ? err.message : String(err)}`),
  });

  const bulkDismissMut = useMutation({
    mutationFn: async (): Promise<BulkResponse> => {
      const r = await fetch("/api/v1/mutations/exceptions/bulk-dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `${baseIdempotency}:dismiss`,
          exception_ids: Array.from(selected),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (resp) => {
      setToast(`נסגרו ${resp.succeeded} מתוך ${resp.total}`);
      setSelected(new Set());
      refetch();
    },
    onError: (err) =>
      setToast(`שגיאה: ${err instanceof Error ? err.message : String(err)}`),
  });

  // Auto-clear toast after 5 seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const isBulking =
    bulkApproveMut.isPending ||
    bulkRejectMut.isPending ||
    bulkAcknowledgeMut.isPending ||
    bulkDismissMut.isPending;

  return (
    <main className="min-h-screen p-6" dir="rtl">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Inbox{view === "history" ? " · היסטוריה" : ""}
          </h1>
          <div className="mt-1">
            <TopBadgeStrip counts={counts} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleView}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {view === "open" ? "היסטוריה" : "חזרה לפתוח"}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            disabled={isLoading}
          >
            רענן
          </button>
        </div>
      </header>

      {/* Bulk toolbar — appears only when at least one row is selected. */}
      {selectedCount > 0 && view === "open" ? (
        <div
          className="sticky top-2 z-10 mb-3 flex items-center gap-3 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm shadow-sm"
          role="toolbar"
          aria-label="פעולות על נבחרים"
        >
          <span className="font-medium">נבחרו: {selectedCount}</span>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs text-slate-600 hover:underline"
          >
            נקה בחירה
          </button>
          <span className="mx-2 h-5 w-px bg-slate-300" aria-hidden />
          {selectionByType.decision > 0 ? (
            <>
              <button
                type="button"
                onClick={() => bulkApproveMut.mutate()}
                disabled={isBulking}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                אשר ({selectionByType.decision})
              </button>
              <button
                type="button"
                onClick={() => setShowBulkRejectForm(true)}
                disabled={isBulking}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
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
              className="rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              ראיתי ({selectionByType.warning})
            </button>
          ) : null}
          {selectionByType.info > 0 ? (
            <button
              type="button"
              onClick={() => bulkDismissMut.mutate()}
              disabled={isBulking}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              סגור ({selectionByType.info})
            </button>
          ) : null}
          {selectionByType.to_do > 0 ? (
            <span className="text-xs text-slate-500 italic">
              ({selectionByType.to_do} משימות — נדרש טיפול פרטני)
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Bulk reject form — modal-style inline. */}
      {showBulkRejectForm ? (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-2 font-medium">
            דחיית {selectionByType.decision} כרטיסיות נבחרות
          </div>
          <input
            type="text"
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1"
            placeholder={DIALOG_COPY.rejectReasonPlaceholder}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => bulkRejectMut.mutate(bulkRejectReason)}
              disabled={!bulkRejectReason.trim() || isBulking}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {DIALOG_COPY.rejectConfirm}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBulkRejectForm(false);
                setBulkRejectReason("");
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="mb-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm">
          {toast}
        </div>
      ) : null}

      <div className="flex gap-4">
        <FilterSidePane state={filter} onChange={onFilterChange} />

        <section className="flex-1 min-w-0 space-y-2">
          {/* "Select all visible" affordance — only when not history and there are rows. */}
          {view === "open" && visibleRows.length > 0 ? (
            <div className="flex items-center gap-3 px-2 text-xs text-slate-600">
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
                  className="text-blue-600 hover:underline"
                >
                  בחר את כל ה-{visibleRows.length}
                </button>
              ) : null}
            </div>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-slate-500">{STATE_COPY.loadingFeed}</p>
          ) : isError ? (
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded-md">
              שגיאה בטעינה: {error instanceof Error ? error.message : String(error)}
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              {data?.rows && data.rows.length > 0
                ? STATE_COPY.emptyFilterNoMatch
                : STATE_COPY.emptyAllClean}
            </p>
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

  const onAcknowledge = useCallback(async () => {
    await fetch(`/api/v1/mutations/exceptions/${row.exception_id}/acknowledge`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotency_key: `ack:${row.exception_id}:${Date.now()}` }),
    });
    onMutate();
  }, [row.exception_id, onMutate]);

  const onDismiss = useCallback(async () => {
    await fetch(`/api/v1/mutations/exceptions/${row.exception_id}/dismiss`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `dismiss:${row.exception_id}:${Date.now()}`,
      }),
    });
    onMutate();
  }, [row.exception_id, onMutate]);

  const actions =
    view === "history" ? null : (() => {
      if (cardType === "decision") {
        return (
          <>
            <PrimaryActionButton onClick={() => navigateToDrawer(row, router)}>
              {copyForAction("decision", "primary")}
            </PrimaryActionButton>
            <SecondaryActionButton onClick={() => navigateToDrawer(row, router)}>
              {ACTION_REJECT}
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => navigateToDrawer(row, router)}>
              {ACTION_DEFER}
            </SecondaryActionButton>
          </>
        );
      }
      if (cardType === "to_do") {
        return (
          <PrimaryActionButton onClick={() => navigateToDrawer(row, router)}>
            {copyForAction("to_do", "primary")}
          </PrimaryActionButton>
        );
      }
      if (cardType === "warning") {
        return (
          <>
            <PrimaryActionButton onClick={onAcknowledge}>
              {copyForAction("warning", "primary")}
            </PrimaryActionButton>
            <SecondaryActionButton onClick={() => navigateToDrawer(row, router)}>
              {copyForAction("warning", "secondary")}
            </SecondaryActionButton>
          </>
        );
      }
      if (cardType === "info") {
        return (
          <PrimaryActionButton onClick={onDismiss}>
            {copyForAction("info", "primary")}
          </PrimaryActionButton>
        );
      }
      return null;
    })();

  const body = (() => {
    if (cardType === "warning") {
      return <WarningBody data={{ why: row.detail ?? row.title }} />;
    }
    if (cardType === "info") {
      return <InfoBody data={{ description: row.detail ?? row.title }} />;
    }
    return null;
  })();

  // Wrap InboxCard with a row-level select checkbox.
  return (
    <div className="flex items-start gap-2">
      {view === "open" ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 ms-1 cursor-pointer"
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

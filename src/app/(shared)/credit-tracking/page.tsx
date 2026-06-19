"use client";

// ---------------------------------------------------------------------------
// /credit-tracking — bookkeeper shortage-resolution workspace (Tom 2026-06-12;
// design + advanced filtering pass 2026-06-13).
//
// The continuous tracking surface behind the missing-picks daily email: every
// picking shortage (credit_tasks row) appears here, and the bookkeeper (Doris)
// marks each one as credited / deferred-to-customer / supplied-later, with an
// optional note. Marks persist in Postgres; the daily email's cumulative CSV
// reads them back, so the attached file always reflects the latest state.
//
// All filtering/sorting/grouping/search is client-side over a single fetch of
// the full set (credit_tasks is factory-scale — tens to low hundreds of rows;
// the backend caps the list at 1000). No server round-trips per filter, so the
// surface feels instant.
//
// UI language: Hebrew operator labels, RTL — explicit scoped deviation from
// English-first per Tom's UX target for this bookkeeper-facing surface (same
// precedent as the Recipe-Health corridor, see CLAUDE.md).
//
// Data:      GET  /api/credit-tracking?limit=1000   (proxy → Fastify, 0241)
// Mutations: POST /api/credit-tracking/[id]/resolution
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  RefreshCw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditTrackingRow {
  credit_task_id: string;
  created_at: string;
  wp_order_id: string | null;
  customer_name: string | null;
  item_id: string;
  item_name: string;
  qty_ordered: number;
  qty_picked: number;
  qty_missing: number;
  status: string;
  note: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
}

interface ListResponse {
  rows: CreditTrackingRow[];
  total: number;
  pending_count: number;
}

type SettableStatus = "PENDING" | "CREDITED" | "DEFERRED" | "SUPPLIED";
type StatusFilter = SettableStatus | "ALL";
type DateRange = "today" | "7d" | "30d" | "all";
type SortKey = "new" | "old" | "missing" | "customer";
type GroupKey = "none" | "customer" | "order";

// ---------------------------------------------------------------------------
// Status metadata — single source for label + colours
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  PENDING: {
    label: "ממתין",
    badge: "bg-warning-softer text-warning-fg border-warning/30",
    dot: "bg-warning",
  },
  CREDITED: {
    label: "זוכה",
    badge: "bg-success-softer text-success-fg border-success/30",
    dot: "bg-success",
  },
  DEFERRED: {
    label: "נדחה ללקוח",
    badge: "bg-info-softer text-info-fg border-info/30",
    dot: "bg-info",
  },
  SUPPLIED: {
    label: "סופק בהמשך",
    badge: "bg-bg-subtle text-fg-muted border-border/60",
    dot: "bg-fg-faint",
  },
  WAIVED: {
    label: "ויתור",
    badge: "bg-bg-subtle text-fg-muted border-border/60",
    dot: "bg-fg-faint",
  },
  DISPUTED: {
    label: "במחלוקת",
    badge: "bg-danger-softer text-danger-fg border-danger/30",
    dot: "bg-danger",
  },
};

const SETTABLE_STATUSES: SettableStatus[] = [
  "PENDING",
  "CREDITED",
  "DEFERRED",
  "SUPPLIED",
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "PENDING", label: "ממתין" },
  { key: "ALL", label: "הכל" },
  { key: "CREDITED", label: "זוכה" },
  { key: "DEFERRED", label: "נדחה ללקוח" },
  { key: "SUPPLIED", label: "סופק" },
];

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "7d", label: "7 ימים" },
  { key: "30d", label: "30 יום" },
  { key: "all", label: "הכל" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "new", label: "חדש → ישן" },
  { key: "old", label: "ישן → חדש" },
  { key: "missing", label: "הכי הרבה חסר" },
  { key: "customer", label: "לקוח (א-ת)" },
];

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "none", label: "רשימה" },
  { key: "customer", label: "לפי לקוח" },
  { key: "order", label: "לפי הזמנה" },
];

const NO_CUSTOMER = "ללא שם לקוח";
const NO_ORDER = "ללא מספר הזמנה";
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Date / formatting helpers (all Asia/Jerusalem)
// ---------------------------------------------------------------------------

function israelDateStr(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function israelMonthStr(iso: string | number | Date): string {
  return israelDateStr(iso).slice(0, 7); // YYYY-MM
}

function formatIsraelDate(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function daysOpen(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
}

function inRange(iso: string, range: DateRange, todayStr: string): boolean {
  if (range === "all") return true;
  if (range === "today") return israelDateStr(iso) === todayStr;
  const ageDays = (Date.now() - new Date(iso).getTime()) / DAY_MS;
  return ageDays <= (range === "7d" ? 7 : 30);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreditTrackingPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [range, setRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [group, setGroup] = useState<GroupKey>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const listQuery = useQuery<ListResponse>({
    queryKey: ["credit-tracking"],
    queryFn: async () => {
      const res = await fetch("/api/credit-tracking?limit=1000");
      if (!res.ok) throw new Error(`credit-tracking list failed (${res.status})`);
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  const resolutionMutation = useMutation({
    mutationFn: async (input: {
      credit_task_id: string;
      status: string;
      note?: string;
    }) => {
      const res = await fetch(
        `/api/credit-tracking/${encodeURIComponent(input.credit_task_id)}/resolution`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: input.status,
            ...(input.note !== undefined ? { note: input.note } : {}),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `update failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setSavedId(variables.credit_task_id);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedId(null), 1800);
      void queryClient.invalidateQueries({ queryKey: ["credit-tracking"] });
    },
  });

  const allRows = useMemo(
    () => listQuery.data?.rows ?? [],
    [listQuery.data],
  );
  const todayStr = israelDateStr(Date.now());
  const thisMonth = israelMonthStr(Date.now());

  // --- Global KPIs (over the whole set, not the current filter) ------------
  const kpis = useMemo(() => {
    let pending = 0;
    let pendingUnits = 0;
    const pendingCustomers = new Set<string>();
    let resolvedThisMonth = 0;
    for (const r of allRows) {
      if (r.status === "PENDING") {
        pending += 1;
        pendingUnits += r.qty_missing;
        pendingCustomers.add(r.customer_name ?? NO_CUSTOMER);
      } else if (r.resolved_at && israelMonthStr(r.resolved_at) === thisMonth) {
        resolvedThisMonth += 1;
      }
    }
    return {
      pending,
      pendingUnits,
      pendingCustomers: pendingCustomers.size,
      resolvedThisMonth,
    };
  }, [allRows, thisMonth]);

  // --- Scope = search + date range (status applied after, for pill counts) -
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!inRange(r.created_at, range, todayStr)) return false;
      if (!q) return true;
      const hay = [
        r.customer_name ?? "",
        r.wp_order_id ?? "",
        r.item_name,
        r.item_id,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, search, range, todayStr]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: scoped.length };
    for (const r of scoped) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [scoped]);

  // --- Visible = scope + status filter, then sorted ------------------------
  const visible = useMemo(() => {
    const filtered =
      status === "ALL" ? scoped : scoped.filter((r) => r.status === status);
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case "old":
          return a.created_at.localeCompare(b.created_at);
        case "missing":
          return (
            b.qty_missing - a.qty_missing ||
            b.created_at.localeCompare(a.created_at)
          );
        case "customer":
          return (
            (a.customer_name ?? NO_CUSTOMER).localeCompare(
              b.customer_name ?? NO_CUSTOMER,
              "he",
            ) || b.created_at.localeCompare(a.created_at)
          );
        case "new":
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
    return arr;
  }, [scoped, status, sort]);

  // --- Grouping ------------------------------------------------------------
  const groups = useMemo(() => {
    if (group === "none") return null;
    const map = new Map<string, CreditTrackingRow[]>();
    for (const r of visible) {
      const key =
        group === "customer"
          ? r.customer_name ?? NO_CUSTOMER
          : r.wp_order_id ?? NO_ORDER;
      const bucket = map.get(key) ?? [];
      bucket.push(r);
      map.set(key, bucket);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => ({
        key,
        rows,
        missing: rows.reduce((s, r) => s + r.qty_missing, 0),
      }))
      .sort((a, b) => b.missing - a.missing);
  }, [visible, group]);

  function commitStatus(row: CreditTrackingRow, nextStatus: string) {
    const draft = noteDrafts[row.credit_task_id];
    resolutionMutation.mutate({
      credit_task_id: row.credit_task_id,
      status: nextStatus,
      ...(draft !== undefined ? { note: draft } : {}),
    });
  }

  function commitNote(row: CreditTrackingRow) {
    const draft = noteDrafts[row.credit_task_id];
    if (draft === undefined || draft === (row.note ?? "")) return;
    resolutionMutation.mutate({
      credit_task_id: row.credit_task_id,
      status: row.status,
      note: draft,
    });
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isFiltering =
    search.trim() !== "" || status !== "ALL" || range !== "all";

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8 text-right">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            מעקב חוסרים בליקוט
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            כל פער ליקוט מופיע כאן אוטומטית. סמני לכל שורה — זוכה, נדחה ללקוח, או
            סופק בהמשך — והסימון נשמר מיד ומופיע גם בקובץ המצורף למייל היומי.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void listQuery.refetch()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-fg-muted transition-colors hover:bg-bg-subtle"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", listQuery.isFetching && "animate-spin")}
          />
          רענון
        </button>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="ממתינים לטיפול"
          value={kpis.pending}
          tone="amber"
          hint={kpis.pending === 0 ? "הכל מטופל" : "שורות פתוחות"}
        />
        <KpiCard
          label="יחידות חסרות"
          value={kpis.pendingUnits}
          tone="rose"
          hint="בשורות הממתינות"
        />
        <KpiCard
          label="לקוחות מושפעים"
          value={kpis.pendingCustomers}
          tone="sky"
          hint="עם חוסר פתוח"
        />
        <KpiCard
          label="טופלו החודש"
          value={kpis.resolvedThisMonth}
          tone="emerald"
          hint="זוכה / נדחה / סופק"
        />
      </div>

      {/* Toolbar */}
      <div className="mt-6 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי לקוח, מספר הזמנה, פריט או מק״ט…"
            aria-label="חיפוש"
            className="h-10 w-full rounded-lg border border-border bg-bg-raised pr-10 pl-3 text-sm placeholder:text-fg-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                status === f.key
                  ? "border-fg bg-fg font-semibold text-fg-inverted"
                  : "border-border text-fg-muted hover:bg-bg-subtle",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  status === f.key
                    ? "bg-bg-raised/20 text-fg-inverted"
                    : "bg-bg-muted text-fg-muted",
                )}
              >
                {statusCounts[f.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Date range + sort + group */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Segmented
            label="טווח"
            options={DATE_RANGES}
            value={range}
            onChange={setRange}
          />
          <Segmented
            label="תצוגה"
            options={GROUPS}
            value={group}
            onChange={setGroup}
          />
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            מיון
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-8 rounded-md border border-border bg-bg-raised px-2 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* States */}
      {listQuery.isLoading && (
        <div className="mt-8 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-border bg-bg-muted/40"
            />
          ))}
        </div>
      )}
      {listQuery.isError && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          שגיאה בטעינת הנתונים. נסי לרענן את העמוד.
        </div>
      )}
      {!listQuery.isLoading && !listQuery.isError && visible.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="h-9 w-9 text-success-fg" />
          <div className="text-sm font-medium text-fg">
            {isFiltering ? "אין שורות שתואמות את הסינון" : "אין חוסרים פתוחים"}
          </div>
          {isFiltering && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
                setRange("all");
              }}
              className="text-xs text-fg-muted underline-offset-2 hover:underline"
            >
              ניקוי סינון
            </button>
          )}
        </div>
      )}

      {/* Results — flat */}
      {visible.length > 0 && group === "none" && (
        <div className="mt-5 overflow-hidden rounded-xl border border-border">
          <RowsTable
            rows={visible}
            setNoteDrafts={setNoteDrafts}
            onStatus={commitStatus}
            onNoteBlur={commitNote}
            mutatingId={
              resolutionMutation.isPending
                ? (resolutionMutation.variables?.credit_task_id ?? null)
                : null
            }
            savedId={savedId}
          />
        </div>
      )}

      {/* Results — grouped */}
      {visible.length > 0 && group !== "none" && groups && (
        <div className="mt-5 space-y-3">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <div
                key={g.key}
                className="overflow-hidden rounded-xl border border-border"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  className="flex w-full items-center justify-between gap-3 bg-bg-muted/40 px-4 py-3 text-right transition-colors hover:bg-bg-muted/70"
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-fg-muted transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                    <span className="font-semibold text-fg">
                      {group === "order" ? (
                        <span dir="ltr">{g.key}</span>
                      ) : (
                        g.key
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-fg-muted">
                    <span>
                      {g.rows.length} {g.rows.length === 1 ? "שורה" : "שורות"}
                    </span>
                    <span className="rounded-md bg-danger-softer px-2 py-0.5 font-semibold text-danger-fg">
                      חסר {g.missing}
                    </span>
                  </div>
                </button>
                {!isCollapsed && (
                  <RowsTable
                    rows={g.rows}
                    setNoteDrafts={setNoteDrafts}
                    onStatus={commitStatus}
                    onNoteBlur={commitNote}
                    mutatingId={
                      resolutionMutation.isPending
                        ? (resolutionMutation.variables?.credit_task_id ?? null)
                        : null
                    }
                    savedId={savedId}
                    hideGroupedColumn={group}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {resolutionMutation.isError && (
        <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          השמירה נכשלה — נסי שוב.{" "}
          {(resolutionMutation.error as Error)?.message ?? ""}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

const KPI_TONES: Record<string, string> = {
  amber: "text-warning-fg",
  rose: "text-danger-fg",
  sky: "text-info-fg",
  emerald: "text-success-fg",
};

function KpiCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: keyof typeof KPI_TONES;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-raised px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          KPI_TONES[tone] ?? "text-fg",
        )}
      >
        {value.toLocaleString("he-IL")}
      </div>
      <div className="mt-0.5 text-[11px] text-fg-muted/80">{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="inline-flex rounded-lg border border-border p-0.5">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              value === o.key
                ? "bg-fg font-semibold text-fg-inverted"
                : "text-fg-muted hover:bg-bg-subtle",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows table — shared by flat + grouped views
// ---------------------------------------------------------------------------

function RowsTable({
  rows,
  setNoteDrafts,
  onStatus,
  onNoteBlur,
  mutatingId,
  savedId,
  hideGroupedColumn,
}: {
  rows: CreditTrackingRow[];
  setNoteDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onStatus: (row: CreditTrackingRow, next: string) => void;
  onNoteBlur: (row: CreditTrackingRow) => void;
  mutatingId: string | null;
  savedId: string | null;
  hideGroupedColumn?: GroupKey;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-muted/30 text-xs text-fg-muted">
            <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
            {hideGroupedColumn !== "customer" && (
              <th className="px-3 py-2.5 text-right font-medium">לקוח</th>
            )}
            {hideGroupedColumn !== "order" && (
              <th className="px-3 py-2.5 text-right font-medium">הזמנה</th>
            )}
            <th className="px-3 py-2.5 text-right font-medium">פריט</th>
            <th className="px-3 py-2.5 text-right font-medium">חסר</th>
            <th className="px-3 py-2.5 text-right font-medium">סטטוס</th>
            <th className="px-3 py-2.5 text-right font-medium">הערה</th>
            <th className="px-3 py-2.5 text-right font-medium">טופל ע״י</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isMutating = mutatingId === row.credit_task_id;
            const isSaved = savedId === row.credit_task_id;
            const age = daysOpen(row.created_at);
            const showAge = row.status === "PENDING" && age >= 1;
            return (
              <tr
                key={row.credit_task_id}
                className={cn(
                  "border-b border-border transition-colors last:border-b-0 hover:bg-bg-muted/20",
                  isMutating && "opacity-60",
                )}
              >
                <td className="whitespace-nowrap px-3 py-2.5 align-top text-fg-muted">
                  <div>{formatIsraelDate(row.created_at)}</div>
                  {showAge && (
                    <div
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 text-[11px]",
                        age >= 7 ? "text-danger-fg" : "text-warning-fg",
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      פתוח {age} {age === 1 ? "יום" : "ימים"}
                    </div>
                  )}
                </td>
                {hideGroupedColumn !== "customer" && (
                  <td className="px-3 py-2.5 align-top font-medium text-fg">
                    {row.customer_name ?? "—"}
                  </td>
                )}
                {hideGroupedColumn !== "order" && (
                  <td className="whitespace-nowrap px-3 py-2.5 align-top">
                    <span dir="ltr">{row.wp_order_id ?? "—"}</span>
                  </td>
                )}
                <td className="px-3 py-2.5 align-top">
                  <div className="text-fg">{row.item_name}</div>
                  <div className="text-xs text-fg-muted" dir="ltr">
                    {row.item_id}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top">
                  <span className="font-bold text-danger-fg tabular-nums">
                    {row.qty_missing}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {" "}
                    מתוך {row.qty_ordered}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top">
                  <select
                    value={row.status}
                    onChange={(e) => onStatus(row, e.target.value)}
                    disabled={isMutating}
                    aria-label="סטטוס טיפול"
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/50",
                      STATUS_META[row.status]?.badge ??
                        "border-border bg-bg-muted text-fg-muted",
                    )}
                  >
                    {SETTABLE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                    {!SETTABLE_STATUSES.includes(
                      row.status as SettableStatus,
                    ) && (
                      <option value={row.status} disabled>
                        {STATUS_META[row.status]?.label ?? row.status}
                      </option>
                    )}
                  </select>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <input
                    type="text"
                    defaultValue={row.note ?? ""}
                    placeholder="הערה…"
                    maxLength={500}
                    aria-label="הערה"
                    onChange={(e) =>
                      setNoteDrafts((d) => ({
                        ...d,
                        [row.credit_task_id]: e.target.value,
                      }))
                    }
                    onBlur={() => onNoteBlur(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full min-w-[140px] rounded-md border border-border bg-transparent px-2 py-1 text-xs placeholder:text-fg-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-fg-muted">
                  {isSaved ? (
                    <span className="inline-flex items-center gap-1 text-success-fg">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      נשמר
                    </span>
                  ) : row.resolved_by_name ? (
                    <>
                      {row.resolved_by_name}
                      {row.resolved_at
                        ? ` · ${formatIsraelDate(row.resolved_at)}`
                        : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

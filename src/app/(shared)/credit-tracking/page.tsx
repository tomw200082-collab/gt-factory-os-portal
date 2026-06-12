"use client";

// ---------------------------------------------------------------------------
// /credit-tracking — bookkeeper shortage-resolution table (Tom 2026-06-12).
//
// The continuous tracking surface behind the missing-picks daily email:
// every picking shortage (credit_tasks row) appears here, and the bookkeeper
// marks each one as credited / deferred-to-customer / supplied-later, with an
// optional note. Marks persist in Postgres; the daily email's cumulative CSV
// reads them back, so the attached file always reflects the latest state.
//
// UI language: Hebrew operator labels, RTL — explicit scoped deviation from
// English-first per Tom's UX target for this bookkeeper-facing surface
// (same precedent as the Recipe-Health corridor, see CLAUDE.md).
//
// Data: GET /api/credit-tracking (proxy → Fastify, migration 0241);
// mutations: POST /api/credit-tracking/[id]/resolution. Default filter is
// "ממתין" (PENDING) so untreated gaps are the first thing seen.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

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

const STATUS_LABELS: Record<string, string> = {
  PENDING: "ממתין",
  CREDITED: "זוכה",
  DEFERRED: "נדחה ללקוח",
  SUPPLIED: "סופק בהמשך",
  WAIVED: "ויתור",
  DISPUTED: "במחלוקת",
};

const SETTABLE_STATUSES = ["PENDING", "CREDITED", "DEFERRED", "SUPPLIED"] as const;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CREDITED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DEFERRED: "bg-sky-50 text-sky-700 border-sky-200",
  SUPPLIED: "bg-slate-100 text-slate-600 border-slate-200",
  WAIVED: "bg-slate-100 text-slate-500 border-slate-200",
  DISPUTED: "bg-rose-50 text-rose-700 border-rose-200",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "PENDING", label: "ממתין" },
  { key: "ALL", label: "הכל" },
  { key: "CREDITED", label: "זוכה" },
  { key: "DEFERRED", label: "נדחה ללקוח" },
  { key: "SUPPLIED", label: "סופק" },
];

function formatIsraelDate(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

export default function CreditTrackingPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("PENDING");
  // Draft notes keyed by credit_task_id — committed together with the next
  // status change or on explicit save (blur).
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const listQuery = useQuery<ListResponse>({
    queryKey: ["credit-tracking", filter],
    queryFn: async () => {
      const qs = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/credit-tracking${qs}`);
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credit-tracking"] });
    },
  });

  const data = listQuery.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // Pending-per-customer summary — shown above the table so the bookkeeper
  // sees at a glance which customers still have open gaps.
  const pendingByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.status !== "PENDING") continue;
      const key = r.customer_name ?? "ללא שם לקוח";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function commitRow(row: CreditTrackingRow, nextStatus: string) {
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

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8 text-right">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            מעקב חוסרים בליקוט
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            כל פער ליקוט מופיע כאן אוטומטית. סמני לכל שורה: זוכה, נדחה ללקוח,
            או סופק בהמשך — הסימון נשמר ומופיע גם בקובץ שבמייל היומי.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void listQuery.refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", listQuery.isFetching && "animate-spin")}
          />
          רענון
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              filter === f.key
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {f.label}
            {f.key === "PENDING" && listQuery.data
              ? ` · ${listQuery.data.pending_count}`
              : ""}
          </button>
        ))}
      </div>

      {/* Pending-per-customer summary */}
      {filter === "PENDING" && pendingByCustomer.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pendingByCustomer.map(([customer, count]) => (
            <span
              key={customer}
              className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-800"
            >
              {customer}: {count} {count === 1 ? "חוסר" : "חוסרים"}
            </span>
          ))}
        </div>
      )}

      {/* States */}
      {listQuery.isLoading && (
        <div className="mt-10 text-center text-sm text-muted-foreground">
          טוען נתונים…
        </div>
      )}
      {listQuery.isError && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          שגיאה בטעינת הנתונים. נסי לרענן את העמוד.
        </div>
      )}
      {!listQuery.isLoading && !listQuery.isError && rows.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <div className="text-sm font-medium text-foreground">
            {filter === "PENDING"
              ? "אין חוסרים שממתינים לטיפול"
              : "אין שורות להצגה"}
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
                <th className="px-3 py-2.5 text-right font-medium">לקוח</th>
                <th className="px-3 py-2.5 text-right font-medium">הזמנה</th>
                <th className="px-3 py-2.5 text-right font-medium">פריט</th>
                <th className="px-3 py-2.5 text-right font-medium">חסר</th>
                <th className="px-3 py-2.5 text-right font-medium">סטטוס</th>
                <th className="px-3 py-2.5 text-right font-medium">הערה</th>
                <th className="px-3 py-2.5 text-right font-medium">טופל ע״י</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isMutatingRow =
                  resolutionMutation.isPending &&
                  resolutionMutation.variables?.credit_task_id ===
                    row.credit_task_id;
                return (
                  <tr
                    key={row.credit_task_id}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      isMutatingRow && "opacity-60",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {formatIsraelDate(row.created_at)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {row.customer_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span dir="ltr">{row.wp_order_id ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-foreground">{row.item_name}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {row.item_id}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="font-bold text-red-600">
                        {formatQty(row.qty_missing)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        מתוך {formatQty(row.qty_ordered)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <select
                        value={row.status}
                        onChange={(e) => commitRow(row, e.target.value)}
                        disabled={isMutatingRow}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs font-medium",
                          STATUS_BADGE_CLASSES[row.status] ??
                            "bg-muted text-muted-foreground border-border",
                        )}
                      >
                        {SETTABLE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                        {!(SETTABLE_STATUSES as readonly string[]).includes(
                          row.status,
                        ) && (
                          <option value={row.status} disabled>
                            {STATUS_LABELS[row.status] ?? row.status}
                          </option>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        defaultValue={row.note ?? ""}
                        placeholder="הערה…"
                        maxLength={500}
                        onChange={(e) =>
                          setNoteDrafts((d) => ({
                            ...d,
                            [row.credit_task_id]: e.target.value,
                          }))
                        }
                        onBlur={() => commitNote(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-full min-w-[140px] rounded-md border border-border bg-transparent px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {row.resolved_by_name ? (
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

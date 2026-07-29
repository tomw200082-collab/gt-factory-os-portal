"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { formatIls } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";

interface WorkRow {
  task_id: string;
  task_type: string;
  task_group: string;
  action_date: string | null;
  due_state: string;
  risk_state: string;
  po_id: string | null;
  po_number: string | null;
  purchase_session_po_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  po_status: string | null;
  amount_net: string | null;
  currency: string | null;
  line_count: number;
  total_ordered_qty: string;
  total_received_qty: string;
  total_open_qty: string;
  scheduled_order_date: string | null;
  latest_safe_order_date: string | null;
  planned_receive_date: string | null;
  expected_receive_date: string | null;
  placed_with_supplier_at: string | null;
  title: string;
  subtitle: string | null;
  primary_cta: string;
  metadata: {
    component_id?: string | null;
    item_id?: string | null;
    target_id?: string | null;
    is_item?: boolean;
    count_first_rank?: number | null;
    [key: string]: unknown;
  } | null;
}

interface WorkQueueResponse {
  rows: WorkRow[];
  count: number;
  as_of_date: string;
  counts: Record<string, number>;
}

const GROUPS = [
  {
    key: "needs_correction_or_schedule",
    label: "דורש תיקון / ספירה / תזמון",
    collapsed: false,
  },
  { key: "overdue", label: "באיחור", collapsed: false },
  { key: "today", label: "לביצוע היום", collapsed: false },
  { key: "next_7_days", label: "בשבעת הימים הקרובים", collapsed: true },
  { key: "later", label: "מאוחר יותר", collapsed: true },
] as const;

async function fetchWorkQueue(): Promise<WorkQueueResponse> {
  const res = await fetch("/api/procurement/work-queue?scope=all&limit=500", {
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) throw new Error("ההתחברות פגה — יש להתחבר מחדש.");
  if (!res.ok) throw new Error("לא ניתן לטעון את תור הרכש.");
  return (await res.json()) as WorkQueueResponse;
}

function formatDate(value: string | null): string {
  if (!value) return "ללא תאריך";
  return value;
}

function ctaFor(row: WorkRow): { href: string; label: string } {
  if (row.primary_cta === "count") {
    const params = new URLSearchParams({ source: "procurement" });
    if (row.purchase_session_po_id) params.set("session_po_id", row.purchase_session_po_id);
    const componentId = row.metadata?.component_id ?? (!row.metadata?.is_item ? row.metadata?.target_id : null);
    const itemId = row.metadata?.item_id ?? (row.metadata?.is_item ? row.metadata?.target_id : null);
    if (componentId) params.set("focus_component_id", String(componentId));
    if (itemId) params.set("focus_item_id", String(itemId));
    return { href: `/inventory/bulk-count?${params.toString()}`, label: "לספור קודם" };
  }
  if (row.primary_cta === "schedule") {
    return { href: "/purchase-orders/placement-queue?scope=all", label: "תזמן" };
  }
  if (row.primary_cta === "place") {
    return { href: "/purchase-orders/placement-queue", label: "בצע מול ספק" };
  }
  if (row.po_id) {
    return { href: `/purchase-orders/${encodeURIComponent(row.po_id)}`, label: row.primary_cta === "close_partial_or_track" ? "בדוק / סגור חלקית" : "עקוב" };
  }
  return { href: "/planning/procurement", label: "פתח" };
}

function tone(row: WorkRow): string {
  if (row.task_group === "overdue" || row.risk_state.includes("overdue") || row.risk_state.includes("safe")) {
    return "border-danger/40 bg-danger-softer/40";
  }
  if (row.task_group === "today") return "border-accent/40 bg-accent/10";
  if (row.task_group === "needs_correction_or_schedule") return "border-warning/40 bg-warning-softer/40";
  return "border-border/60 bg-bg";
}

export function ProcurementWorkQueue(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["procurement", "work-queue", "all"],
    queryFn: fetchWorkQueue,
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <section className="card p-4" data-testid="procurement-work-queue-loading">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          טוען תור רכש...
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
        data-testid="procurement-work-queue-error"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>{error instanceof Error ? error.message : "לא ניתן לטעון את תור הרכש."}</span>
          <button type="button" className="ms-auto underline" onClick={() => void refetch()}>
            נסה שוב
          </button>
        </div>
      </section>
    );
  }

  const rows = data?.rows ?? [];
  const nowCount = data?.counts?.now ?? 0;
  const todayCount = nowCount;
  const overdueCount = data?.counts?.overdue ?? 0;
  const nowGroups = new Set(["needs_correction_or_schedule", "overdue", "today"]);
  const supplierCount = new Set(rows.filter((r) => nowGroups.has(r.task_group)).map((r) => r.supplier_id).filter(Boolean)).size;
  const todayAmount = rows
    .filter((r) => nowGroups.has(r.task_group))
    .reduce((sum, r) => sum + Number(r.amount_net ?? 0), 0);
  const next = rows.find((r) => r.task_group !== "later" && !nowGroups.has(r.task_group)) ?? rows[0] ?? null;

  return (
    <section className="space-y-3" data-testid="procurement-work-queue">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <div className="text-sm font-semibold text-fg-strong">תור עבודה לרכש</div>
            <div className="text-xs text-fg-muted">
              {nowCount > 0
                ? `${todayCount} פעולות היום · ${supplierCount} ספקים · ${formatIls(todayAmount)}`
                : next
                  ? `אין רכש לביצוע היום. הפעולה הבאה: ${formatDate(next.action_date)} — ${next.supplier_name ?? next.title}`
                  : "אין פעולות רכש פתוחות כרגע."}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-3xs">
          {overdueCount > 0 ? (
            <span className="rounded-full border border-danger/40 bg-danger-softer px-2 py-1 font-semibold text-danger-fg">
              {overdueCount} באיחור
            </span>
          ) : (
            <span className="rounded-full border border-success/40 bg-success-softer px-2 py-1 font-semibold text-success-fg">
              <CheckCircle2 className="me-1 inline h-3 w-3" aria-hidden />
              אין איחורים
            </span>
          )}
          <Link href="/purchase-orders/placement-queue" className="rounded-full border border-border/60 px-2 py-1 text-accent hover:underline">
            תור ביצוע מול ספקים
          </Link>
        </div>
      </div>

      {GROUPS.map((group) => {
        const groupRows = rows.filter((r) => r.task_group === group.key);
        if (groupRows.length === 0) return null;
        return (
          <details
            key={group.key}
            open={!group.collapsed}
            className="card overflow-hidden p-0"
            data-testid={`procurement-work-group-${group.key}`}
          >
            <summary className="flex min-h-[44px] cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-fg">
              <span>{group.label}</span>
              <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-3xs text-fg-muted">{groupRows.length}</span>
            </summary>
            <div className="divide-y divide-border/50">
              {groupRows.map((row) => {
                const cta = ctaFor(row);
                return (
                  <div key={row.task_id} className={cn("grid gap-3 border-t p-4 md:grid-cols-[1fr_auto]", tone(row))}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-fg-strong">{row.title}</span>
                        {row.po_number ? <span className="font-mono text-xs text-fg-muted">{row.po_number}</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
                        <span>ביצוע: {formatDate(row.scheduled_order_date ?? row.action_date)}</span>
                        {row.latest_safe_order_date ? <span>מועד בטוח אחרון: {row.latest_safe_order_date}</span> : null}
                        {row.expected_receive_date ? <span>אספקה צפויה: {row.expected_receive_date}</span> : null}
                        {row.po_status === "PARTIAL" ? (
                          <span className="font-semibold text-warning-fg">
                            התקבלו {row.total_received_qty} מתוך {row.total_ordered_qty}; נותרו {row.total_open_qty}
                          </span>
                        ) : null}
                        {row.supplier_name ? <span>ספק: {row.supplier_name}</span> : null}
                        {row.amount_net != null ? <span>{formatIls(Number(row.amount_net))}</span> : null}
                        <span>{row.line_count} שורות</span>
                      </div>
                      {row.subtitle ? (
                        <div className="mt-1 truncate text-3xs text-fg-subtle">{row.subtitle}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <CalendarClock className="hidden h-4 w-4 text-fg-muted md:block" aria-hidden />
                      <Link href={cta.href} className="btn btn-sm btn-primary min-h-[44px]" data-testid={`procurement-work-cta-${row.task_id}`}>
                        {cta.label}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </section>
  );
}

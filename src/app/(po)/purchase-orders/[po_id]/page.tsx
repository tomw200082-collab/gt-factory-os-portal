"use client";

// ---------------------------------------------------------------------------
// Purchase Orders · Detail — PO corridor Tranche 3-5 (lines + detail + history + GRs).
// Canonical URL /purchase-orders/[po_id].
//
// Header: po_number, supplier link, status badge (OPEN|PARTIAL|RECEIVED|
// CANCELLED), order_date, expected_receive_date, total_net.
//
// Tabs:
//   - lines                LIVE — GET /api/purchase-order-lines?po_id=X
//   - overview             LIVE — GET /api/purchase-orders/:po_id
//   - source-recommendation LIVE — deep-link to /planning/runs/[run_id]
//   - attached-grs         LIVE — GET /api/goods-receipts?po_id=X
//   - history              LIVE — GET /api/purchase-orders/:po_id/history
// ---------------------------------------------------------------------------

import { use, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-provider";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  type LinkageGroup,
  type TabDescriptor,
  type FieldRow,
} from "@/components/patterns/DetailPage";
import { Badge } from "@/components/badges/StatusBadge";

// --- Types (mirrors of upstream schemas) ------------------------------------

// source_type and manual_reason added 2026-04-26 for manual PO creation
// (CLAUDE.md §"PO workflow" amendment). These fields may be absent on rows
// created before the migration; render gracefully when undefined.
interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
  order_date: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  total_gross: string | null;
  notes: string | null;
  site_id: string;
  source_run_id: string | null;
  source_recommendation_id: string | null;
  source_type?: "recommendation" | "manual";
  manual_reason?: string | null;
  created_by_user_id: string;
  created_by_snapshot: string;
  created_at: string;
  updated_at: string;
}

interface PurchaseOrderDetailResponse {
  row: PurchaseOrderRow;
}

interface PurchaseOrderLineRow {
  po_line_id: string;
  po_id: string;
  line_number: number;
  component_id: string | null;
  component_name: string | null;
  item_id: string | null;
  item_name: string | null;
  ordered_qty: string;
  uom: string;
  pack_conversion_snapshot: string;
  unit_price_net: string;
  line_total_net: string;
  received_qty: string;
  open_qty: string;
  line_status: string;
  expected_receive_date: string | null;
  actual_first_receipt_at: string | null;
  actual_last_receipt_at: string | null;
  source_recommendation_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PurchaseOrderLinesListResponse {
  rows: PurchaseOrderLineRow[];
  count: number;
}


interface ChangeLogHistoryRow {
  change_log_id: string;
  entity_table: string;
  entity_id: string;
  action: string;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_snapshot: string;
  created_at: string;
}

interface PurchaseOrderHistoryResponse {
  rows: ChangeLogHistoryRow[];
  count: number;
}

interface GoodsReceiptLineRow {
  line_id: string;
  item_type: string;
  item_id: string;
  quantity: string;
  unit: string;
  po_line_id: string | null;
  notes: string | null;
}

interface GoodsReceiptSummaryRow {
  submission_id: string;
  po_id: string | null;
  supplier_id: string;
  status: string;
  event_at: string;
  posted_at: string | null;
  submitted_by: string;
  gr_notes: string | null;
  site_id: string;
  lines: GoodsReceiptLineRow[];
}

interface GoodsReceiptsListResponse {
  rows: GoodsReceiptSummaryRow[];
  count: number;
}

interface ExceptionRow {
  exception_id: string;
  category: string;
  related_entity_id: string | null;
  status: string;
  created_at: string;
}

interface ExceptionsListResponse {
  rows: ExceptionRow[];
  count: number;
}

// --- helpers ----------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Could not load data. Check your connection and try refreshing.");
  }
  return (await res.json()) as T;
}

function fmtMoney(value: string | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (isNaN(n)) return value;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${value} ${currency}`;
  }
}

function fmtQty(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (isNaN(n)) return value;
  // Strip trailing zeros while keeping up to 4 decimal places for display
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function POStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "OPEN") return <Badge tone="info" dotted>Open</Badge>;
  if (status === "PARTIAL") return <Badge tone="warning" dotted>Partial</Badge>;
  if (status === "RECEIVED")
    return <Badge tone="success" variant="solid">Received</Badge>;
  if (status === "CANCELLED")
    return <Badge tone="neutral" dotted>Cancelled</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function LineStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "OPEN") return <Badge tone="info" dotted>Open</Badge>;
  if (status === "PARTIAL") return <Badge tone="warning" dotted>Partial</Badge>;
  if (status === "CLOSED") return <Badge tone="success" variant="solid">Closed</Badge>;
  if (status === "CANCELLED") return <Badge tone="neutral" dotted>Cancelled</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function ReceiptProgress({
  receivedQty,
  orderedQty,
  lineStatus,
}: {
  receivedQty: string;
  orderedQty: string;
  lineStatus: string;
}): JSX.Element | null {
  if (lineStatus === "OPEN" || lineStatus === "CANCELLED") return null;
  const received = Number(receivedQty);
  const ordered = Number(orderedQty);
  if (!ordered || isNaN(received) || isNaN(ordered)) return null;
  const pct = Math.min(100, Math.round((received / ordered) * 100));
  const isOver = received > ordered;
  return (
    <div
      className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/40"
      title={`${pct}% received`}
    >
      <div
        className={`h-full rounded-full transition-all ${
          isOver
            ? "bg-danger"
            : lineStatus === "CLOSED"
            ? "bg-success"
            : "bg-warning"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// --- Attached GR card -------------------------------------------------------

function GrStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "posted") return <Badge tone="success" variant="solid">Posted</Badge>;
  if (status === "pending") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "rejected") return <Badge tone="danger" dotted>Rejected</Badge>;
  if (status === "cancelled") return <Badge tone="neutral" dotted>Cancelled</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function AttachedGrCard({
  gr,
  currency,
  linesByLineId,
}: {
  gr: GoodsReceiptSummaryRow;
  currency: string;
  linesByLineId: Map<string, PurchaseOrderLineRow>;
}): JSX.Element {
  return (
    <div
      className="border border-border/60 rounded-lg overflow-hidden"
      data-testid="attached-gr-card"
      data-status={gr.status}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-subtle/40 border-b border-border/40">
        <GrStatusBadge status={gr.status} />
        <span className="text-xs text-fg-muted">received {fmtDate(gr.event_at)}</span>
        {gr.posted_at && (
          <span className="text-xs text-fg-faint ml-auto">posted {fmtDate(gr.posted_at)}</span>
        )}
      </div>
      {gr.lines.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/30">
              <th className="px-4 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Item</th>
              <th className="px-4 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Qty</th>
              <th className="px-4 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">UoM</th>
              <th className="px-4 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Type</th>
              <th className="px-4 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">PO line</th>
            </tr>
          </thead>
          <tbody>
            {gr.lines.map((line) => {
              const poLine = line.po_line_id ? linesByLineId.get(line.po_line_id) : null;
              const poLineLabel = poLine
                ? `Line ${poLine.line_number}`
                : line.po_line_id
                  ? "Line item"
                  : "—";
              return (
                <tr key={line.line_id} className="border-b border-border/20 last:border-b-0 hover:bg-bg-subtle/30">
                  <td className="px-4 py-2 font-mono text-xs text-fg">{line.item_id}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-fg">{fmtQty(line.quantity)}</td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{line.unit}</td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{line.item_type}</td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{poLineLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {gr.gr_notes && (
        <div className="px-4 py-2 text-xs text-fg-muted border-t border-border/30">
          {gr.gr_notes}
        </div>
      )}
    </div>
  );
}

// --- Action label map -------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  PO_CREATE: "PO created",
  PO_UPDATE: "PO updated",
  PO_STATUS_CHANGE: "Status changed",
  PO_CANCEL: "PO cancelled",
  PO_LINE_CREATE: "Line created",
  PO_LINE_UPDATE: "Line updated",
  POL_STATUS_CHANGE: "Line status changed",
  POL_CANCEL: "Line cancelled",
};

function actionTone(action: string): "success" | "warning" | "neutral" | "info" {
  if (action === "PO_CREATE" || action === "PO_LINE_CREATE") return "success";
  if (action === "PO_CANCEL" || action === "POL_CANCEL") return "neutral";
  if (action === "PO_STATUS_CHANGE" || action === "POL_STATUS_CHANGE") return "warning";
  return "info";
}

function fmtDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  return String(v);
}

function HistoryEventRow({ event }: { event: ChangeLogHistoryRow }): JSX.Element {
  const label = ACTION_LABELS[event.action] ?? event.action;
  const isLineEvent = event.entity_table === "purchase_order_lines";
  const changedFields = Array.isArray(event.changed_fields) ? event.changed_fields : [];
  const oldVals = event.old_values as Record<string, unknown> | null;
  const newVals = event.new_values as Record<string, unknown> | null;

  // Determine which fields to display in diff table:
  // If changedFields lists specific fields, use those; otherwise use keys of new_values.
  const diffFields: string[] =
    changedFields.length > 0
      ? changedFields
      : newVals
      ? Object.keys(newVals)
      : [];

  return (
    <div
      className="flex gap-3 px-4 py-3 border-b border-border/30 last:border-b-0 hover:bg-bg-subtle/30"
      data-action={event.action}
    >
      <div className="flex-shrink-0 pt-0.5">
        <Badge tone={actionTone(event.action)} variant="solid" className="text-3xs min-w-[7rem] justify-center">
          {label}
        </Badge>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-fg">{event.actor_snapshot}</span>
          {isLineEvent && (
            <span className="text-3xs text-fg-faint">line item</span>
          )}
          <span className="text-xs text-fg-muted ml-auto">{fmtDateTime(event.created_at)}</span>
        </div>
        {diffFields.length > 0 && (
          <div className="mt-2 rounded border border-border/40 overflow-hidden">
            <table className="w-full border-collapse">
              <tbody>
                {diffFields.map((field) => {
                  const oldVal = oldVals?.[field];
                  const newVal = newVals?.[field];
                  const isUpdate = oldVals !== null && newVals !== null;
                  return (
                    <tr key={field} className="border-b border-border/20 last:border-b-0">
                      <td className="px-2 py-1 text-3xs font-mono text-fg-subtle bg-bg-subtle/40 whitespace-nowrap w-px">
                        {field}
                      </td>
                      {isUpdate ? (
                        <>
                          <td className="px-2 py-1 text-3xs font-mono text-fg-muted line-through opacity-60 max-w-[10rem] truncate">
                            {fmtDiffValue(oldVal)}
                          </td>
                          <td className="px-2 py-1 text-3xs text-fg-faint">→</td>
                          <td className="px-2 py-1 text-3xs font-mono text-fg max-w-[10rem] truncate">
                            {fmtDiffValue(newVal)}
                          </td>
                        </>
                      ) : (
                        <td className="px-2 py-1 text-3xs font-mono text-fg max-w-xs truncate" colSpan={3}>
                          {fmtDiffValue(newVal ?? oldVal)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ po_id: string }>;
}): JSX.Element {
  const { po_id } = use(params);

  // PO header via GET-by-id endpoint.
  const poQuery = useQuery<PurchaseOrderDetailResponse>({
    queryKey: ["purchase-orders", "detail", po_id],
    queryFn: () =>
      fetchJson(`/api/purchase-orders/${encodeURIComponent(po_id)}`),
    staleTime: 60_000,
    retry: false,
  });
  const po = poQuery.data?.row;

  // PO lines via new lines endpoint.
  const linesQuery = useQuery<PurchaseOrderLinesListResponse>({
    queryKey: ["purchase-order-lines", po_id],
    queryFn: () =>
      fetchJson(
        `/api/purchase-order-lines?po_id=${encodeURIComponent(po_id)}`,
      ),
    enabled: Boolean(po_id),
    staleTime: 60_000,
  });

  // Supplier display name — available directly from po.supplier_name (API JOIN).
  const supplierLabel = po?.supplier_name ?? po?.supplier_id;

  // PO audit history.
  const historyQuery = useQuery<PurchaseOrderHistoryResponse>({
    queryKey: ["purchase-orders", "history", po_id],
    queryFn: () =>
      fetchJson(
        `/api/purchase-orders/${encodeURIComponent(po_id)}/history`,
      ),
    enabled: Boolean(po_id),
    staleTime: 30_000,
  });

  // Attached GRs.
  const grsQuery = useQuery<GoodsReceiptsListResponse>({
    queryKey: ["goods-receipts", "by-po", po_id],
    queryFn: () =>
      fetchJson(
        `/api/goods-receipts?po_id=${encodeURIComponent(po_id)}`,
      ),
    enabled: Boolean(po_id),
    staleTime: 30_000,
  });

  // Over-receipt exceptions for this PO's lines.
  const overReceiptQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["exceptions", "po_line_over_receipt", po_id],
    queryFn: () =>
      fetchJson(`/api/exceptions?category=po_line_over_receipt&status=open,acknowledged`),
    enabled: Boolean(po_id),
    staleTime: 60_000,
  });

  // --- Cancel PO mutation ---------------------------------------------------
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/purchase-orders/${encodeURIComponent(po_id)}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ??
          "Could not cancel. Check your connection and try again.",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-order-lines", po_id] });
      setCancelConfirming(false);
      setCancelError(null);
      router.refresh();
    },
    onError: (err: unknown) => {
      const msg = (err as Error).message ?? "";
      if (msg.toLowerCase().includes("partial receipts") || msg.toLowerCase().includes("partial receipt")) {
        setCancelError("Cannot cancel — this PO has posted receipts. Cancel individual open lines first.");
      } else if (msg.toLowerCase().includes("cannot cancel purchase order in status")) {
        const status = po?.status?.toLowerCase() ?? "its current state";
        setCancelError(`Cannot cancel — PO is in ${status}. Only OPEN and DRAFT POs can be cancelled.`);
      } else {
        setCancelError(msg || "Cancel failed. Try again.");
      }
      setCancelConfirming(false);
    },
  });

  const canCancelRole = session.role === "planner" || session.role === "admin";
  const canCancelPo = (po?.status === "OPEN" || po?.status === "DRAFT") && canCancelRole;

  // --- Edit PO mutation (notes + expected_receive_date) ---------------------
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const canEditPo =
    (session.role === "planner" || session.role === "admin") &&
    po !== undefined &&
    po.status !== "RECEIVED" &&
    po.status !== "CANCELLED";

  function openEdit(): void {
    setEditNotes(po?.notes ?? "");
    setEditExpected(
      po?.expected_receive_date
        ? (po.expected_receive_date as string).slice(0, 10)
        : "",
    );
    setEditError(null);
    setEditing(true);
  }

  const updateMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = {};
      body.notes = editNotes.trim() || null;
      body.expected_receive_date = editExpected.trim() || null;
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(po_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ?? "Could not save changes. Check your connection and try again.",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", "detail", po_id] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", "history", po_id] });
      setEditing(false);
      setEditError(null);
    },
    onError: (err: unknown) => {
      setEditError((err as Error).message ?? "Update failed. Try again.");
    },
  });

  // --- Line edit state -------------------------------------------------------
  const [lineEditingId, setLineEditingId] = useState<string | null>(null);
  const [lineEditNotes, setLineEditNotes] = useState("");
  const [lineEditExpected, setLineEditExpected] = useState("");
  const [lineEditError, setLineEditError] = useState<string | null>(null);

  // --- Line cancel state ----------------------------------------------------
  const [lineCancelConfirmId, setLineCancelConfirmId] = useState<string | null>(null);
  const [lineCancelError, setLineCancelError] = useState<string | null>(null);

  const lineCancelMut = useMutation({
    mutationFn: async (poLineId: string) => {
      const res = await fetch(
        `/api/purchase-order-lines/${encodeURIComponent(poLineId)}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Could not cancel. Check your connection and try again.");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-order-lines", po_id] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", "history", po_id] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", "detail", po_id] });
      setLineCancelConfirmId(null);
      setLineCancelError(null);
    },
    onError: (err: unknown) => {
      setLineCancelError((err as Error).message ?? "Cancel failed. Try again.");
      setLineCancelConfirmId(null);
    },
  });

  const canEditLines =
    session.role === "planner" || session.role === "admin";

  const openLineEdit = useCallback(
    (line: PurchaseOrderLineRow) => {
      setLineEditingId(line.po_line_id);
      setLineEditNotes(line.notes ?? "");
      setLineEditExpected(
        line.expected_receive_date
          ? (line.expected_receive_date as string).slice(0, 10)
          : "",
      );
      setLineEditError(null);
    },
    [],
  );

  const lineUpdateMut = useMutation({
    mutationFn: async (poLineId: string) => {
      const body: Record<string, string | null> = {};
      body.notes = lineEditNotes.trim() || null;
      body.expected_receive_date = lineEditExpected.trim() || null;
      const res = await fetch(
        `/api/purchase-order-lines/${encodeURIComponent(poLineId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ?? "Could not save changes. Check your connection and try again.",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-order-lines", po_id] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", "history", po_id] });
      setLineEditingId(null);
      setLineEditError(null);
    },
    onError: (err: unknown) => {
      setLineEditError((err as Error).message ?? "Update failed. Try again.");
    },
  });

  // --- Header meta ----------------------------------------------------------
  const headerMeta = po ? (
    <>
      <POStatusBadge status={po.status} />
      <Badge tone="neutral" dotted>
        order {fmtDate(po.order_date)}
      </Badge>
      {po.expected_receive_date ? (
        <Badge tone="neutral">
          expect {fmtDate(po.expected_receive_date)}
        </Badge>
      ) : null}
      <Badge tone="neutral">
        total {fmtMoney(po.total_net, po.currency)}
      </Badge>
      {po.source_recommendation_id ? (
        <Badge tone="info" dotted>
          from recommendation
        </Badge>
      ) : null}
      {grsQuery.data && grsQuery.data.count > 0 ? (
        <Badge tone="success" dotted>
          {grsQuery.data.count} GR{grsQuery.data.count === 1 ? "" : "s"}
        </Badge>
      ) : null}
    </>
  ) : null;

  // --- Lines tab -----------------------------------------------------------
  const linesTab: TabDescriptor = {
    key: "lines",
    label: "Lines",
    content: (() => {
      if (linesQuery.isLoading) return <DetailTabLoading />;
      if (linesQuery.isError) {
        return (
          <DetailTabError message="Could not load PO lines. Check your connection and try refreshing." />
        );
      }
      const lineRows = linesQuery.data?.rows ?? [];
      if (lineRows.length === 0) {
        return (
          <DetailTabEmpty message="No lines found for this purchase order." />
        );
      }
      const lineIds = new Set(lineRows.map((l) => l.po_line_id));
      const overReceiptExceptions = (overReceiptQuery.data?.rows ?? []).filter(
        (e) => e.related_entity_id !== null && lineIds.has(e.related_entity_id),
      );
      const overReceiptLineIds = new Set(
        overReceiptExceptions.map((e) => e.related_entity_id!),
      );
      const hasPartialLines = lineRows.some((l) => l.line_status === "PARTIAL");
      const awaitingLines = lineRows.filter(
        (l) => (l.line_status === "OPEN" || l.line_status === "PARTIAL") && Number(l.open_qty) > 0,
      );
      const allSettled = lineRows.every(
        (l) => l.line_status === "CLOSED" || l.line_status === "CANCELLED",
      );
      const supplierLabel = po?.supplier_name ?? po?.supplier_id ?? "supplier";
      return (
        <div className="space-y-3">
        {po?.status !== "CANCELLED" && allSettled ? (
          <div className="rounded-md border border-success/40 bg-success/5 px-4 py-3 text-xs text-success-fg" role="note" data-testid="po-all-received-banner">
            <span className="font-semibold">All items received.</span>{" "}
            {po?.supplier_name ?? po?.supplier_id ? `Receipt from ${supplierLabel} is complete.` : "This PO is fully received."}
          </div>
        ) : awaitingLines.length > 0 ? (
          <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3 text-xs" data-testid="po-still-awaiting-panel">
            <div className="mb-1.5 font-semibold text-fg-strong">
              Still awaiting from {supplierLabel}:
            </div>
            <ul className="space-y-0.5 text-fg-muted">
              {awaitingLines.map((l) => {
                const name = l.component_name ?? l.item_name ?? l.component_id ?? l.item_id ?? "—";
                return (
                  <li key={l.po_line_id} className="flex items-baseline gap-1.5">
                    <span className="font-medium text-warning-fg tabular-nums">{l.open_qty}</span>
                    <span>{l.uom}</span>
                    <span className="text-fg-subtle">of</span>
                    <span className="font-medium text-fg">{name}</span>
                    <span className="text-fg-faint">(ordered {l.ordered_qty}, received {l.received_qty})</span>
                  </li>
                );
              })}
            </ul>
            {po?.expected_receive_date ? (
              <div className="mt-1.5 text-fg-faint">
                Expected by {po.expected_receive_date}
              </div>
            ) : (
              <div className="mt-1.5 text-fg-faint">No delivery date set.</div>
            )}
          </div>
        ) : null}
        {hasPartialLines && (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning-fg" role="note">
            <span className="font-semibold">Partial receipt in progress.</span>{" "}
            Lines showing <span className="font-mono">Partial</span> status have receipts posted and cannot be cancelled.
            To close out remaining quantities, post a compensating receipt to each partial line.
            Open lines (no receipts) can be cancelled individually.
          </div>
        )}
        {lineCancelError && (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-xs text-danger-fg">
            {lineCancelError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" data-testid="po-lines-table">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">#</th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Item / Component</th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Ordered</th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Received</th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Open</th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">UoM</th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Unit price</th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Line total</th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Status</th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Expected</th>
                {canEditLines && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line) => {
                const displayName =
                  line.component_name ?? line.item_name ?? line.component_id ?? line.item_id ?? "—";
                const subId = line.component_id ?? line.item_id;
                const isLineEditing = lineEditingId === line.po_line_id;
                const isLineCancelConfirming = lineCancelConfirmId === line.po_line_id;
                const isLineEditable =
                  canEditLines &&
                  (line.line_status === "OPEN" || line.line_status === "PARTIAL");
                const isLineCancellable =
                  canEditLines && line.line_status === "OPEN";
                return (
                  <Fragment key={line.po_line_id}>
                  <tr
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    data-testid="po-line-row"
                    data-line-status={line.line_status}
                  >
                    <td className="px-3 py-2 text-xs text-fg-muted tabular-nums">{line.line_number}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-sm text-fg">{displayName}</div>
                      {subId && subId !== displayName ? (
                        <div className="font-mono text-3xs text-fg-faint">{subId}</div>
                      ) : null}
                      {line.notes ? (
                        <div className="mt-0.5 text-3xs text-fg-faint italic">{line.notes}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg">
                      {fmtQty(line.ordered_qty)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg">
                      {fmtQty(line.received_qty)}
                      <ReceiptProgress
                        receivedQty={line.received_qty}
                        orderedQty={line.ordered_qty}
                        lineStatus={line.line_status}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      <span
                        className={
                          Number(line.open_qty) > 0
                            ? "text-warning-fg font-semibold"
                            : "text-fg-muted"
                        }
                      >
                        {fmtQty(line.open_qty)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">{line.uom}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                      {line.unit_price_net === "0" || line.unit_price_net === "0.0000"
                        ? <span className="text-fg-faint">—</span>
                        : fmtMoney(line.unit_price_net, po?.currency ?? "ILS")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                      {line.line_total_net === "0" || line.line_total_net === "0.0000"
                        ? <span className="text-fg-faint">—</span>
                        : fmtMoney(line.line_total_net, po?.currency ?? "ILS")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <LineStatusBadge status={line.line_status} />
                        {overReceiptLineIds.has(line.po_line_id) && (
                          <a
                            href="/inbox?view=exceptions"
                            className="inline-flex items-center gap-1 text-3xs text-warning-fg hover:underline"
                            title="Over-receipt exception open — check exceptions inbox"
                          >
                            ⚠ Over-received
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDate(line.expected_receive_date)}
                    </td>
                    {canEditLines && (
                      <td className="px-2 py-2 text-right">
                        {isLineEditable && !isLineEditing && !isLineCancelConfirming && (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              className="text-3xs text-fg-faint hover:text-accent transition-colors"
                              onClick={() => openLineEdit(line)}
                            >
                              edit
                            </button>
                            {isLineCancellable && (
                              <button
                                type="button"
                                className="text-3xs text-fg-faint hover:text-danger-fg transition-colors"
                                onClick={() => { setLineCancelConfirmId(line.po_line_id); setLineCancelError(null); }}
                              >
                                cancel
                              </button>
                            )}
                          </div>
                        )}
                        {isLineCancelConfirming && (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-3xs text-fg-muted">Cancel line?</span>
                            <button
                              type="button"
                              className="text-3xs text-danger-fg font-semibold hover:underline"
                              onClick={() => lineCancelMut.mutate(line.po_line_id)}
                              disabled={lineCancelMut.isPending}
                            >
                              {lineCancelMut.isPending ? "…" : "Yes"}
                            </button>
                            <button
                              type="button"
                              className="text-3xs text-fg-faint hover:text-fg"
                              onClick={() => { setLineCancelConfirmId(null); setLineCancelError(null); }}
                              disabled={lineCancelMut.isPending}
                            >
                              No
                            </button>
                          </div>
                        )}
                        {isLineEditing && (
                          <button
                            type="button"
                            className="text-3xs text-fg-faint hover:text-fg"
                            onClick={() => { setLineEditingId(null); setLineEditError(null); }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {isLineEditing && (
                    <tr
                      className="bg-bg-subtle/60 border-b border-border/40"
                      data-testid="po-line-edit-row"
                    >
                      <td colSpan={canEditLines ? 11 : 10} className="px-3 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                              Expected date
                            </label>
                            <input
                              type="date"
                              className="input input-sm w-36"
                              value={lineEditExpected}
                              onChange={(e) => setLineEditExpected(e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[14rem]">
                            <label className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                              Notes
                            </label>
                            <input
                              type="text"
                              className="input input-sm w-full"
                              value={lineEditNotes}
                              onChange={(e) => setLineEditNotes(e.target.value)}
                              placeholder="Line note…"
                              maxLength={2000}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            {lineEditError && (
                              <span className="text-xs text-danger-fg">{lineEditError}</span>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => lineUpdateMut.mutate(line.po_line_id)}
                              disabled={lineUpdateMut.isPending}
                            >
                              {lineUpdateMut.isPending ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => { setLineEditingId(null); setLineEditError(null); }}
                              disabled={lineUpdateMut.isPending}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      );
    })(),
  };

  // --- Overview tab ---------------------------------------------------------
  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (poQuery.isLoading) return <DetailTabLoading />;
      if (poQuery.isError) {
        return <DetailTabError message="Could not load purchase order. Check your connection and try refreshing." />;
      }
      if (!po) {
        return (
          <DetailTabEmpty
            message={`Purchase order ${po_id} not found.`}
          />
        );
      }
      const rows: FieldRow[] = [
        { label: "PO Number", value: po.po_number, mono: true },
        {
          label: "Supplier",
          value: (
            <Link
              href={`/admin/masters/suppliers/${encodeURIComponent(po.supplier_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {supplierLabel}
            </Link>
          ),
        },
        { label: "Status", value: <POStatusBadge status={po.status} /> },
        { label: "Order date", value: fmtDate(po.order_date) },
        {
          label: "Expected receipt",
          value: editing ? (
            <input
              type="date"
              className="input input-sm w-40"
              value={editExpected}
              onChange={(e) => setEditExpected(e.target.value)}
            />
          ) : fmtDate(po.expected_receive_date),
        },
        { label: "Total (net)", value: fmtMoney(po.total_net, po.currency) },
        { label: "Total (gross)", value: po.total_gross ? fmtMoney(po.total_gross, po.currency) : "—" },
        {
          label: "Notes",
          value: editing ? (
            <textarea
              className="input input-sm w-full min-h-[4rem] resize-y"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add notes…"
              maxLength={2000}
            />
          ) : (po.notes ?? <span className="text-fg-faint">—</span>),
        },
        { label: "Site", value: po.site_id, mono: true },
        {
          label: "Source planning run",
          value: po.source_run_id ? (
            <Link
              href={`/planning/runs/${encodeURIComponent(po.source_run_id)}`}
              className="font-mono text-accent hover:underline"
            >
              View run →
            </Link>
          ) : "—",
        },
        { label: "Created by", value: po.created_by_snapshot },
        { label: "Created", value: fmtDateTime(po.created_at) },
        { label: "Last updated", value: fmtDateTime(po.updated_at) },
        { label: "Internal ID", value: po.po_id, mono: true },
      ];
      return (
        <div className="space-y-3">
          {canEditPo && !editing && (
            <div className="flex justify-end px-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={openEdit}
              >
                Edit notes / expected date
              </button>
            </div>
          )}
          {editing && (
            <div className="flex items-center gap-2 px-1 justify-end">
              {editError && (
                <span className="text-xs text-danger-fg">{editError}</span>
              )}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateMut.mutate()}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setEditing(false); setEditError(null); }}
                disabled={updateMut.isPending}
              >
                Cancel
              </button>
            </div>
          )}
          <DetailFieldGrid rows={rows} />
        </div>
      );
    })(),
  };

  // --- Source recommendation tab -------------------------------------------
  const sourceRecommendationTab: TabDescriptor = {
    key: "source-recommendation",
    label: "Source recommendation",
    content: (() => {
      if (poQuery.isLoading) return <DetailTabLoading />;
      if (!po) return <DetailTabEmpty message="PO not loaded yet." />;
      if (!po.source_run_id) {
        return (
          <DetailTabEmpty message="This PO was not produced from a planning recommendation." />
        );
      }
      return (
        <DetailFieldGrid
          rows={[
            {
              label: "source_run_id",
              value: (
                <Link
                  href={`/planning/runs/${encodeURIComponent(po.source_run_id)}`}
                  className="font-mono text-accent hover:underline"
                >
                  {po.source_run_id}
                </Link>
              ),
              mono: true,
            },
            {
              label: "source_recommendation_id",
              value: po.source_recommendation_id,
              mono: true,
            },
          ]}
        />
      );
    })(),
  };

  // --- Attached GRs tab ---------------------------------------------------
  const attachedGrsTab: TabDescriptor = {
    key: "attached-grs",
    label: "Attached GRs",
    content: (() => {
      if (grsQuery.isLoading) return <DetailTabLoading />;
      if (grsQuery.isError) {
        return (
          <DetailTabError message="Could not load attached goods receipts. Check your connection and try refreshing." />
        );
      }
      const grs = grsQuery.data?.rows ?? [];
      if (grs.length === 0) {
        return (
          <DetailTabEmpty message="No goods receipts have been recorded against this purchase order." />
        );
      }
      const linesByLineId = new Map<string, PurchaseOrderLineRow>(
        (linesQuery.data?.rows ?? []).map((l) => [l.po_line_id, l]),
      );
      return (
        <div className="space-y-4 py-2" data-testid="attached-grs-list">
          {grs.map((gr) => (
            <AttachedGrCard
              key={gr.submission_id}
              gr={gr}
              currency={po?.currency ?? "ILS"}
              linesByLineId={linesByLineId}
            />
          ))}
        </div>
      );
    })(),
  };

  // --- History tab ---------------------------------------------------------
  const historyTab: TabDescriptor = {
    key: "history",
    label: "History",
    content: (() => {
      if (historyQuery.isLoading) return <DetailTabLoading />;
      if (historyQuery.isError) {
        return (
          <DetailTabError message="Could not load PO history. Check your connection and try refreshing." />
        );
      }
      const histRows = historyQuery.data?.rows ?? [];
      if (histRows.length === 0) {
        return <DetailTabEmpty message="No audit events found for this purchase order." />;
      }
      return (
        <div className="space-y-1 py-1" data-testid="po-history-list">
          {histRows.map((event) => (
            <HistoryEventRow key={event.change_log_id} event={event} />
          ))}
        </div>
      );
    })(),
  };

  const tabs: TabDescriptor[] = [
    linesTab,
    overviewTab,
    sourceRecommendationTab,
    attachedGrsTab,
    historyTab,
  ];

  // --- Linkage card ---------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  if (po?.supplier_id) {
    linkages.push({
      label: "Supplier",
      items: [
        {
          label: po.supplier_id,
          href: `/admin/masters/suppliers/${encodeURIComponent(po.supplier_id)}`,
          subtitle: po.supplier_name ?? undefined,
        },
      ],
    });
  }

  if (po?.source_run_id) {
    linkages.push({
      label: "Source planning run",
      items: [
        {
          label: po.source_run_id,
          href: `/planning/runs/${encodeURIComponent(po.source_run_id)}`,
          subtitle: po.source_recommendation_id
            ? `rec ${po.source_recommendation_id}`
            : undefined,
        },
      ],
    });
  }

  const grItems = (grsQuery.data?.rows ?? []).map((gr, i) => ({
    label: `Goods receipt ${i + 1} — ${fmtDate(gr.event_at)}`,
    href: `/ops/receipts`,
    subtitle: gr.status,
  }));
  linkages.push({
    label: "Attached goods receipts",
    items: grItems,
    emptyText: "No goods receipts recorded for this PO.",
  });

  // --- Manual PO banner (shown only when source_type='manual') ---------------
  // 2026-05-02 — converted Hebrew → English per portal-wide 2026-05-01 English
  // lock (closes audit P0-D).
  const manualBanner =
    po?.source_type === "manual" ? (
      <div
        className="rounded-md border border-border bg-bg-raised px-4 py-3 text-sm text-fg-muted mb-4"
        data-testid="po-manual-banner"
      >
        <span className="font-medium text-fg">Manual entry</span>
        {" · "}
        Not created from a planning recommendation
        {po.manual_reason && (
          <div className="mt-1 text-fg-muted">Reason: {po.manual_reason}</div>
        )}
      </div>
    ) : null;

  return (
    <DetailPage
      header={{
        eyebrow: "Purchase orders",
        title: po ? `PO ${po.po_number}` : po_id,
        description: po
          ? `${supplierLabel} · ${po.supplier_id}`
          : "Loading purchase order…",
        meta: headerMeta,
        actions: (
          <div className="flex items-center gap-2">
            {/*
              Receive-against-this-PO header CTA per W4 cycle 8 spec
              docs/integrations/po_attached_gr_enhancement_spec.md §3.
              Visibility rule (locked §3.1): visible iff status IN ('OPEN','PARTIAL').
              Routes to /stock/receipts?po_id={po_id} per POE-A13-1 (95% confidence).
              Replacement on terminal status (RECEIVED/CANCELLED): "View receipts"
              link routing to the same-page attached-grs tab via DetailPage's
              ?tab=<key> URL convention. No silent absence.
              Cycle 16 (commit 223ba83) closed the W2-FOLLOWUP-RECEIPTS-PO-PREFILL
              follow-up: /stock/receipts now reads ?po_id= on mount and locks
              the supplier picker + prefills lines from the PO's OPEN/PARTIAL
              lines per W4 cycle 8 spec §3.4. The CTA below feeds directly into
              that prefill flow.
            */}
            {po && (po.status === "OPEN" || po.status === "PARTIAL") && (
              <Link
                href={`/stock/receipts?po_id=${encodeURIComponent(po_id)}`}
                className="btn btn-sm btn-primary"
                data-testid="po-receive-against-cta"
                aria-label={`Receive against PO ${po.po_number}`}
                title="Receiving against this PO will update line balances atomically. Over-receipt is permitted but emits an exception for review."
              >
                Receive against this PO →
              </Link>
            )}
            {po && (po.status === "RECEIVED" || po.status === "CANCELLED") && (
              <Link
                href={`/purchase-orders/${encodeURIComponent(po_id)}?tab=attached-grs`}
                className="btn btn-ghost btn-sm"
                data-testid="po-view-receipts-link"
              >
                View receipts →
              </Link>
            )}
            {cancelError && (
              <span className="text-xs text-danger-fg">{cancelError}</span>
            )}
            {canCancelPo && !cancelConfirming && (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger-fg hover:bg-danger/10"
                onClick={() => { setCancelConfirming(true); setCancelError(null); }}
                disabled={cancelMut.isPending}
              >
                Cancel PO
              </button>
            )}
            {canCancelPo && cancelConfirming && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-fg-muted">Cancel this PO?</span>
                <button
                  type="button"
                  className="btn btn-sm bg-danger text-fg-inverted hover:bg-danger/90"
                  onClick={() => cancelMut.mutate()}
                  disabled={cancelMut.isPending}
                >
                  {cancelMut.isPending ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setCancelConfirming(false); setCancelError(null); }}
                  disabled={cancelMut.isPending}
                >
                  Keep
                </button>
              </div>
            )}
            <Link href="/purchase-orders" className="btn btn-ghost btn-sm">
              Back to POs
            </Link>
          </div>
        ),
      }}
      subHeader={manualBanner}
      tabs={tabs}
      linkages={linkages}
    />
  );
}

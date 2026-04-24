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

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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

interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_id: string;
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

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
}

interface SuppliersListResponse {
  rows: SupplierRow[];
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

// --- helpers ----------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
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
}: {
  gr: GoodsReceiptSummaryRow;
  currency: string;
}): JSX.Element {
  return (
    <div
      className="border border-border/60 rounded-lg overflow-hidden"
      data-testid="attached-gr-card"
      data-status={gr.status}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-subtle/40 border-b border-border/40">
        <GrStatusBadge status={gr.status} />
        <span className="font-mono text-xs text-fg-muted">{gr.submission_id.slice(0, 8)}…</span>
        <span className="text-xs text-fg-muted">received {fmtDate(gr.event_at)}</span>
        {gr.posted_at && (
          <span className="text-xs text-fg-faint ml-auto">posted {fmtDate(gr.posted_at)}</span>
        )}
      </div>
      {gr.lines.length > 0 && (
        <table className="w-full text-sm border-collapse">
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
            {gr.lines.map((line) => (
              <tr key={line.line_id} className="border-b border-border/20 last:border-b-0 hover:bg-bg-subtle/30">
                <td className="px-4 py-2 font-mono text-xs text-fg">{line.item_id}</td>
                <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-fg">{fmtQty(line.quantity)}</td>
                <td className="px-4 py-2 text-xs text-fg-muted">{line.unit}</td>
                <td className="px-4 py-2 text-xs text-fg-muted">{line.item_type}</td>
                <td className="px-4 py-2 font-mono text-3xs text-fg-faint">
                  {line.po_line_id ? line.po_line_id.slice(0, 8) + "…" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function HistoryEventRow({ event }: { event: ChangeLogHistoryRow }): JSX.Element {
  const label = ACTION_LABELS[event.action] ?? event.action;
  const isLineEvent = event.entity_table === "purchase_order_lines";
  const changedFields = Array.isArray(event.changed_fields) ? event.changed_fields : [];
  const hasValues = event.old_values !== null || event.new_values !== null;

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
            <span className="text-3xs font-mono text-fg-faint">line {event.entity_id.slice(0, 8)}…</span>
          )}
          <span className="text-xs text-fg-muted ml-auto">{fmtDateTime(event.created_at)}</span>
        </div>
        {changedFields.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {changedFields.map((f) => (
              <span key={f} className="inline-block bg-bg-subtle border border-border/50 rounded px-1.5 py-0.5 text-3xs font-mono text-fg-muted">
                {f}
              </span>
            ))}
          </div>
        )}
        {hasValues && (
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-3xs font-mono text-fg-faint">
            {event.old_values !== null && (
              <div>
                <span className="text-fg-subtle">before: </span>
                {JSON.stringify(event.old_values)}
              </div>
            )}
            {event.new_values !== null && (
              <div>
                <span className="text-fg-subtle">after: </span>
                {JSON.stringify(event.new_values)}
              </div>
            )}
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

  // Supplier row for header + linkage.
  const suppliersQuery = useQuery<SuppliersListResponse>({
    queryKey: ["purchase-orders", "detail", po_id, "supplier"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
    enabled: Boolean(po?.supplier_id),
    staleTime: 5 * 60_000,
  });
  const supplier = po?.supplier_id
    ? suppliersQuery.data?.rows.find((s) => s.supplier_id === po.supplier_id)
    : undefined;

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

  // --- Cancel PO mutation ---------------------------------------------------
  const router = useRouter();
  const queryClient = useQueryClient();
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
          `Cancel failed (HTTP ${res.status})`,
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
      setCancelError((err as Error).message ?? "Cancel failed. Try again.");
      setCancelConfirming(false);
    },
  });

  const canCancelPo = po?.status === "OPEN" || po?.status === "DRAFT";

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
        total {po.total_net} {po.currency}
      </Badge>
      {po.source_recommendation_id ? (
        <Badge tone="info" dotted>
          from recommendation
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
      const hasPartialLines = lineRows.some((l) => l.line_status === "PARTIAL");
      return (
        <div className="space-y-3">
        {hasPartialLines && (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning-fg" role="note">
            <span className="font-semibold">Partial receipt in progress.</span>{" "}
            Lines showing <span className="font-mono">Partial</span> status have receipts posted and cannot be cancelled.
            To close out remaining quantities, post a compensating receipt to each partial line.
            Open lines (no receipts) can be cancelled individually.
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
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line) => {
                const displayName =
                  line.component_name ?? line.item_name ?? line.component_id ?? line.item_id ?? "—";
                const subId = line.component_id ?? line.item_id;
                return (
                  <tr
                    key={line.po_line_id}
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
                      <LineStatusBadge status={line.line_status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDate(line.expected_receive_date)}
                    </td>
                  </tr>
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
              {supplier ? (supplier.supplier_name_short ?? supplier.supplier_name_official) : po.supplier_id}
            </Link>
          ),
        },
        { label: "Status", value: <POStatusBadge status={po.status} /> },
        { label: "Order date", value: fmtDate(po.order_date) },
        { label: "Expected receipt", value: fmtDate(po.expected_receive_date) },
        { label: "Total (net)", value: fmtMoney(po.total_net, po.currency) },
        { label: "Total (gross)", value: po.total_gross ? fmtMoney(po.total_gross, po.currency) : "—" },
        { label: "Notes", value: po.notes },
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
      return <DetailFieldGrid rows={rows} />;
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
      return (
        <div className="space-y-4 py-2" data-testid="attached-grs-list">
          {grs.map((gr) => (
            <AttachedGrCard key={gr.submission_id} gr={gr} currency={po?.currency ?? "ILS"} />
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
          subtitle: supplier
            ? supplier.supplier_name_short ?? supplier.supplier_name_official
            : undefined,
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

  const grItems = (grsQuery.data?.rows ?? []).map((gr) => ({
    label: `GR ${gr.submission_id.slice(0, 8)}…`,
    href: `/ops/receipts`,
    subtitle: `${gr.status} · ${fmtDate(gr.event_at)}`,
  }));
  linkages.push({
    label: "Attached goods receipts",
    items: grItems,
    emptyText: "No goods receipts recorded for this PO.",
  });

  return (
    <DetailPage
      header={{
        eyebrow: "Purchase orders",
        title: po ? `PO ${po.po_number}` : po_id,
        description: po
          ? supplier
            ? `${supplier.supplier_name_short ?? supplier.supplier_name_official} · ${po.supplier_id}`
            : `Supplier ${po.supplier_id}`
          : "Loading purchase order…",
        meta: headerMeta,
        actions: (
          <div className="flex items-center gap-2">
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
                  className="btn btn-sm bg-danger text-white hover:bg-danger/90"
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
      tabs={tabs}
      linkages={linkages}
    />
  );
}

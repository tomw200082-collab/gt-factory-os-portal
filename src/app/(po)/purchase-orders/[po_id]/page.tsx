"use client";

// ---------------------------------------------------------------------------
// Purchase Orders · Detail — PO corridor Tranche 3 (lines + detail endpoints).
// Canonical URL /purchase-orders/[po_id].
//
// Header: po_number, supplier link, status badge (OPEN|PARTIAL|RECEIVED|
// CANCELLED), order_date, expected_receive_date, total_net.
//
// Tabs:
//   - lines                LIVE — GET /api/purchase-order-lines?po_id=X
//   - overview             LIVE — GET /api/purchase-orders/:po_id
//   - source-recommendation LIVE — deep-link to /planning/runs/[run_id]
//   - attached-grs         PENDING — no GR list endpoint upstream yet.
//   - history              PENDING — no per-PO change_log endpoint exposed.
// ---------------------------------------------------------------------------

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  PendingTabPlaceholder,
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
      return (
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

  // --- Attached GRs tab (pending) ------------------------------------------
  const attachedGrsTab: TabDescriptor = {
    key: "attached-grs",
    label: "Attached GRs",
    content: (
      <PendingTabPlaceholder
        reason="Goods receipts linked to this PO will appear here in a future release."
      />
    ),
  };

  // --- History tab (pending) -----------------------------------------------
  const historyTab: TabDescriptor = {
    key: "history",
    label: "History",
    content: (
      <PendingTabPlaceholder
        reason="Change history for this PO will appear here in a future release."
      />
    ),
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

  linkages.push({
    label: "Attached goods receipts",
    items: [],
    emptyText: "Goods receipts linked to this PO will appear here in a future release.",
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
          <Link href="/purchase-orders" className="btn btn-ghost btn-sm">
            Back to POs
          </Link>
        ),
      }}
      tabs={tabs}
      linkages={linkages}
    />
  );
}

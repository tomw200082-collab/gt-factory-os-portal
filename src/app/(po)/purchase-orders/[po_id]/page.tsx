"use client";

// ---------------------------------------------------------------------------
// Purchase Orders · Detail — Tranche D (plan §F).
// Canonical URL /purchase-orders/[po_id].
//
// Header: po_number, supplier link, status badge (OPEN|PARTIAL|RECEIVED|
// CANCELLED), order_date, expected_receive_date, total_net.
//
// 4 tabs:
//   - lines                PENDING — upstream exposes no per-PO lines endpoint
//                                    (/api/v1/queries/purchase-order-lines
//                                    not authored yet); tab renders a
//                                    visible pending-placeholder with a
//                                    concrete list of missing endpoints.
//   - source-recommendation LIVE   — deep-link to /planning/runs/[run_id]
//                                    when po.source_run_id is set; else empty.
//   - attached-grs         PENDING — no GR list endpoint upstream yet.
//   - history              PENDING — no per-PO change_log endpoint exposed.
//
// PO header data IS retrievable by filtering the /api/purchase-orders list
// client-side — this is the same pattern Tranche C uses where upstream only
// exposes list endpoints. The overview header is therefore LIVE.
//
// Linkage card: supplier, source recommendation run, attached GRs (pending).
//
// View-only (Tranche D boundary).
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

// --- Types (mirror of upstream purchase-orders schemas) ------------------

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

interface PurchaseOrdersListResponse {
  rows: PurchaseOrderRow[];
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

// --- helpers -------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ po_id: string }>;
}): JSX.Element {
  const { po_id } = use(params);

  // PO row via list + client-side filter (upstream has no GET-by-id).
  const poQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["purchase-orders", "detail", po_id],
    queryFn: () => fetchJson("/api/purchase-orders?limit=1000"),
  });
  const po = poQuery.data?.rows.find((r) => r.po_id === po_id);

  // Supplier row for header + linkage (same list-filter pattern).
  const suppliersQuery = useQuery<SuppliersListResponse>({
    queryKey: ["purchase-orders", "detail", po_id, "supplier"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
    enabled: Boolean(po?.supplier_id),
  });
  const supplier = po?.supplier_id
    ? suppliersQuery.data?.rows.find((s) => s.supplier_id === po.supplier_id)
    : undefined;

  // --- Header meta ---------------------------------------------------------
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

  // --- Tabs ----------------------------------------------------------------

  // Overview-as-default-first-tab. Per dispatch, "lines" is the first named
  // tab, but because no lines endpoint exists upstream, we surface it as
  // pending and let the tab strip start at `overview` instead so users
  // landing on the page see real data immediately. The tab order is still
  // lines first to honor the dispatch ordering.
  const linesTab: TabDescriptor = {
    key: "lines",
    label: "Lines",
    content: (() => {
      if (poQuery.isLoading) return <DetailTabLoading />;
      if (poQuery.isError) {
        return <DetailTabError message={(poQuery.error as Error).message} />;
      }
      if (!po) {
        return (
          <DetailTabEmpty
            message={`Purchase order ${po_id} not found in the list.`}
          />
        );
      }
      return (
        <PendingTabPlaceholder
          reason={
            "PO lines require an upstream GET endpoint (e.g. /api/v1/queries/purchase-orders/:po_id or /api/v1/queries/purchase-order-lines?po_id=<id>) that is not yet authored. " +
            "Header-level PO data is available in the Overview tab."
          }
        />
      );
    })(),
  };

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (poQuery.isLoading) return <DetailTabLoading />;
      if (poQuery.isError) {
        return <DetailTabError message={(poQuery.error as Error).message} />;
      }
      if (!po) {
        return (
          <DetailTabEmpty
            message={`Purchase order ${po_id} not found in the list.`}
          />
        );
      }
      const rows: FieldRow[] = [
        { label: "po_id", value: po.po_id, mono: true },
        { label: "po_number", value: po.po_number, mono: true },
        {
          label: "supplier_id",
          value: (
            <Link
              href={`/admin/suppliers/${encodeURIComponent(po.supplier_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {po.supplier_id}
            </Link>
          ),
          mono: true,
        },
        { label: "status", value: <POStatusBadge status={po.status} /> },
        { label: "order_date", value: fmtDate(po.order_date) },
        {
          label: "expected_receive_date",
          value: fmtDate(po.expected_receive_date),
        },
        { label: "currency", value: po.currency, mono: true },
        { label: "total_net", value: po.total_net, mono: true },
        { label: "total_gross", value: po.total_gross, mono: true },
        { label: "notes", value: po.notes },
        { label: "site_id", value: po.site_id, mono: true },
        {
          label: "source_run_id",
          value: po.source_run_id ? (
            <Link
              href={`/planning/runs/${encodeURIComponent(po.source_run_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {po.source_run_id}
            </Link>
          ) : null,
          mono: true,
        },
        {
          label: "source_recommendation_id",
          value: po.source_recommendation_id,
          mono: true,
        },
        {
          label: "created_by",
          value: `${po.created_by_snapshot} (${po.created_by_user_id})`,
        },
        { label: "created_at", value: fmtDateTime(po.created_at) },
        { label: "updated_at", value: fmtDateTime(po.updated_at) },
      ];
      return <DetailFieldGrid rows={rows} />;
    })(),
  };

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

  const attachedGrsTab: TabDescriptor = {
    key: "attached-grs",
    label: "Attached GRs",
    content: (
      <PendingTabPlaceholder
        reason="Goods-receipts attached to this PO require an upstream list endpoint (/api/v1/queries/goods-receipts?po_id=<id>) that is not yet exposed. The GR table does exist and the stock_ledger.related_po_line_id column wires the link, but no list-by-PO projection is available at the API layer."
      />
    ),
  };

  const historyTab: TabDescriptor = {
    key: "history",
    label: "History",
    content: (
      <PendingTabPlaceholder
        reason="Per-PO change-log is not yet exposed as an API surface. The change_log table receives PO_CREATE / PO_LINE_CREATE / POL_STATUS_CHANGE / PO_STATUS_CHANGE / PLANNING_REC_CONVERTED_TO_PO rows but there is no read endpoint keyed by PO id in this release."
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

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  if (po?.supplier_id) {
    linkages.push({
      label: "Supplier",
      items: [
        {
          label: po.supplier_id,
          href: `/admin/suppliers/${encodeURIComponent(po.supplier_id)}`,
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
    emptyText:
      "Pending /api/goods-receipts?po_id=<id> endpoint (Tranche I scope).",
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

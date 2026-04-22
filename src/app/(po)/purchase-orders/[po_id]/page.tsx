"use client";

// ---------------------------------------------------------------------------
// Planner · Purchase Order detail — read-only.
//
// Tranche 012 unblocker. Before this page existed, the planner-side
// Convert-to-PO success toast linked to /purchase-orders/{po_id} which
// 404'd. PO list rows had no click-through. PO was a dead-end object.
//
// This page renders three sections:
//   1. Header card (po_number, status badge, supplier, currency, dates,
//      total_net, source-recommendation/source-run linkage).
//   2. Lines table (one row per ordered po_line: item_id/component_id,
//      ordered_qty, received_qty, unit_price, line total, status).
//   3. Source linkage — Link back to /planning/runs/{source_run_id} when
//      the PO was created from a planning recommendation.
//
// Defensive contract: the upstream detail endpoint may return a richer
// envelope than the list endpoint. We try common shape variants
// ({lines, po_lines}, {goods_receipts, receipts}) and degrade honestly
// when fields are missing — operators see a placeholder note rather than
// fabricated zeros.
//
// No write actions in this tranche. Cancel/Edit-expected-date/Receive-
// against-PO are deferred to Tranche 013 (receipt-side PO selector) and
// later admin-mutation tranches.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";

// Mirror of the list-page row shape, plus optional fields the detail
// endpoint MAY return. Keep aligned with upstream.
interface PurchaseOrderHeader {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name?: string | null;
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

interface PurchaseOrderLine {
  po_line_id: string;
  line_no?: number | null;
  item_id?: string | null;
  component_id?: string | null;
  display_label?: string | null;
  ordered_qty: string;
  received_qty: string | null;
  unit: string | null;
  unit_price: string | null;
  line_total: string | null;
  status?: string | null;
}

interface PurchaseOrderDetailResponse {
  // Different upstream shapes are tolerated. The minimum is the bare header.
  po_id?: string;
  po_number?: string;
  supplier_id?: string;
  status?: string;
  order_date?: string;
  expected_receive_date?: string | null;
  currency?: string;
  total_net?: string;
  total_gross?: string | null;
  notes?: string | null;
  site_id?: string;
  source_run_id?: string | null;
  source_recommendation_id?: string | null;
  created_by_user_id?: string;
  created_by_snapshot?: string;
  created_at?: string;
  updated_at?: string;
  // Lines may live at .lines OR .po_lines OR be omitted entirely.
  lines?: PurchaseOrderLine[];
  po_lines?: PurchaseOrderLine[];
  // Optional nested envelope variant.
  po?: PurchaseOrderHeader;
}

async function fetchPo(po_id: string): Promise<PurchaseOrderDetailResponse> {
  const res = await fetch(
    `/api/purchase-orders/${encodeURIComponent(po_id)}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GET /api/purchase-orders/${po_id} failed (HTTP ${res.status}): ${body}`,
    );
  }
  return (await res.json()) as PurchaseOrderDetailResponse;
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
  if (status === "DRAFT") return <Badge tone="neutral" dotted>Draft</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

// Normalise the response into a consistent {header, lines} shape regardless
// of whether the upstream nests under `.po` or returns it flat.
function normalize(
  data: PurchaseOrderDetailResponse,
): { header: PurchaseOrderHeader | null; lines: PurchaseOrderLine[] } {
  const flat: Partial<PurchaseOrderHeader> = data.po ?? {
    po_id: data.po_id,
    po_number: data.po_number,
    supplier_id: data.supplier_id,
    status: data.status,
    order_date: data.order_date,
    expected_receive_date: data.expected_receive_date,
    currency: data.currency,
    total_net: data.total_net,
    total_gross: data.total_gross ?? null,
    notes: data.notes ?? null,
    site_id: data.site_id,
    source_run_id: data.source_run_id ?? null,
    source_recommendation_id: data.source_recommendation_id ?? null,
    created_by_user_id: data.created_by_user_id,
    created_by_snapshot: data.created_by_snapshot,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
  const header =
    flat.po_id && flat.po_number ? (flat as PurchaseOrderHeader) : null;
  const lines = data.po_lines ?? data.lines ?? [];
  return { header, lines };
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ po_id: string }>();
  const po_id = params?.po_id ?? "";

  const detailQuery = useQuery({
    queryKey: ["planner", "purchase-orders", po_id, "detail"],
    queryFn: () => fetchPo(po_id),
    enabled: !!po_id,
  });

  if (!po_id) {
    return (
      <div className="p-5 text-sm text-fg-muted">
        Missing po_id in route.
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div
        className="p-5 text-sm text-fg-muted"
        data-testid="po-detail-loading"
      >
        Loading purchase order…
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl pt-4">
        <Link
          href="/purchase-orders"
          className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} aria-hidden />
          Back to purchase orders
        </Link>
        <SectionCard
          eyebrow="Error"
          title="Couldn't load this purchase order"
          description="The upstream API rejected the request. If this PO was created moments ago, the underlying detail endpoint may not yet be exposed; otherwise the support code below identifies the failure."
        >
          <pre
            data-testid="po-detail-error"
            className="overflow-x-auto rounded border border-danger/30 bg-bg p-3 font-mono text-xs text-danger-fg"
          >
            {(detailQuery.error as Error).message}
          </pre>
        </SectionCard>
      </div>
    );
  }

  const { header, lines } = normalize(detailQuery.data ?? {});

  if (!header) {
    return (
      <div className="mx-auto max-w-2xl pt-4">
        <Link
          href="/purchase-orders"
          className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} aria-hidden />
          Back to purchase orders
        </Link>
        <EmptyState
          title="Purchase order not found"
          description="The upstream returned an empty or unrecognised payload. Verify the po_id in the URL."
        />
      </div>
    );
  }

  return (
    <>
      <Link
        href="/purchase-orders"
        className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        data-testid="po-detail-back"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={2} aria-hidden />
        Back to purchase orders
      </Link>

      <WorkflowHeader
        eyebrow="Planner workspace · purchase order"
        title={header.po_number}
        description={`Issued ${fmtDate(header.order_date)} · expected ${fmtDate(header.expected_receive_date)} · ${header.site_id}`}
        meta={
          <>
            <POStatusBadge status={header.status} />
            <Badge tone="neutral" dotted>
              {header.currency}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard eyebrow="Header" title="Order details">
          <dl
            className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"
            data-testid="po-detail-header"
          >
            <Field label="Supplier">
              <span className="font-mono text-xs">
                {header.supplier_name ?? header.supplier_id}
              </span>
            </Field>
            <Field label="Total net">
              <span className="font-mono tabular-nums">
                {header.total_net}{" "}
                <span className="text-fg-faint">{header.currency}</span>
              </span>
            </Field>
            {header.total_gross ? (
              <Field label="Total gross">
                <span className="font-mono tabular-nums">
                  {header.total_gross}{" "}
                  <span className="text-fg-faint">{header.currency}</span>
                </span>
              </Field>
            ) : null}
            <Field label="Order date">{fmtDate(header.order_date)}</Field>
            <Field label="Expected receive">
              {fmtDate(header.expected_receive_date)}
            </Field>
            <Field label="Created at">{fmtDateTime(header.created_at)}</Field>
            <Field label="Updated at">{fmtDateTime(header.updated_at)}</Field>
          </dl>
          {header.notes ? (
            <div className="mt-4 rounded border border-border/60 bg-bg-subtle/50 p-3 text-sm text-fg-muted">
              <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Notes
              </div>
              <div className="mt-1 whitespace-pre-wrap">{header.notes}</div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Source" title="Where this PO came from">
          {header.source_run_id ? (
            <Link
              href={`/planning/runs/${encodeURIComponent(header.source_run_id)}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              data-testid="po-detail-source-run-link"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Planning run {header.source_run_id.slice(0, 8)}…
            </Link>
          ) : (
            <div className="text-sm text-fg-muted">
              Manually created (no source planning run).
            </div>
          )}
          {header.source_recommendation_id ? (
            <div className="mt-2 font-mono text-3xs text-fg-faint">
              src rec: {header.source_recommendation_id}
            </div>
          ) : null}
          <div className="mt-3 text-3xs text-fg-faint">
            Created by {header.created_by_user_id} on {fmtDate(header.created_at)}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="Lines"
        title={`Ordered lines (${lines.length})`}
        description="Read-only view. Receive against an open PO line from the Goods Receipt form (Tranche 013 wires the line selector there)."
        contentClassName="p-0"
      >
        {lines.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No lines on this purchase order."
              description="The upstream detail response contained no `lines` / `po_lines` array. Either this PO truly has zero lines, or the detail endpoint does not yet expose lines — request a backend follow-up if the latter."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-sm"
              data-testid="po-detail-lines-table"
            >
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item / component
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Ordered
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Received
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Unit price
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Line total
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const idLabel =
                    l.display_label ??
                    l.item_id ??
                    l.component_id ??
                    "—";
                  return (
                    <tr
                      key={l.po_line_id}
                      className="border-b border-border/40 last:border-b-0"
                      data-testid="po-detail-line-row"
                      data-po-line-id={l.po_line_id}
                    >
                      <td className="px-3 py-2 font-mono text-3xs text-fg-faint">
                        {l.line_no ?? idx + 1}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fg">
                        {idLabel}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {l.ordered_qty}
                        {l.unit ? (
                          <span className="ml-0.5 text-fg-faint">{l.unit}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                        {l.received_qty ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                        {l.unit_price ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {l.line_total ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {l.status ? (
                          <Badge tone="neutral" dotted>
                            {l.status}
                          </Badge>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-fg">{children}</dd>
    </div>
  );
}

"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Suppliers · Detail — Tranche D (plan §F).
// Canonical URL /admin/masters/suppliers/[supplier_id].
//
// 4 tabs:
//   - overview          LIVE   — supplier row fields via list + client-filter
//   - supplier-items    LIVE   — /api/supplier-items?supplier_id=<id>
//                                Loop 11: added inline cost edit per row
//                                (PATCH /api/supplier-items/:id with
//                                std_cost_per_inv_uom + if_match_updated_at).
//                                Loop 15: backend fix (commit 3b787a0) now
//                                returns std_cost_per_inv_uom in the GET list
//                                response; CostEditCell initializes with the
//                                current value and displays it in the table.
//                                updated_at IS returned and is used for
//                                optimistic concurrency.
//   - po-history        LIVE   — /api/purchase-orders?supplier_id=<id>
//   - exceptions        LIVE   — /api/exceptions client-filtered by
//                                related_entity_id
//
// Linkage card: components sourced (via supplier-items), recent POs, GI mapping.
// ---------------------------------------------------------------------------

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { SectionCard } from "@/components/workflow/SectionCard";

// --- Types ---------------------------------------------------------------

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
  supplier_type: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  currency: string | null;
  payment_terms: string | null;
  default_lead_time_days: number | null;
  default_moq: string | null;
  approval_status: string | null;
  green_invoice_supplier_id: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface SuppliersListResponse {
  rows: SupplierRow[];
  count: number;
}

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  component_id: string | null;
  item_id: string | null;
  relationship: string | null;
  is_primary: boolean;
  order_uom: string | null;
  lead_time_days: number | null;
  moq: string | null;
  approval_status: string | null;
  // Loop 13 backend fix (commit 3b787a0) added std_cost_per_inv_uom to the
  // GET /api/v1/queries/supplier-items response. Field is now included.
  // updated_at is used as if_match_updated_at for the PATCH.
  std_cost_per_inv_uom: string | null;
  updated_at: string;
}

interface SupplierItemsListResponse {
  rows: SupplierItemRow[];
  count: number;
}

interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  source_recommendation_id: string | null;
  created_at: string;
}

interface PurchaseOrdersListResponse {
  rows: PurchaseOrderRow[];
  count: number;
}

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: string;
  source: string;
  title: string;
  detail: string | null;
  status: string;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

interface ExceptionsListResponse {
  rows: ExceptionRow[];
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

function SupplierStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
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

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// ---------------------------------------------------------------------------
// Inline cost edit cell — Loop 11.
// Renders "—" by default (std_cost not in GET list response).
// On click, shows a number input. On save, PATCHes
//   /api/supplier-items/:supplier_item_id with
//   { std_cost_per_inv_uom, if_match_updated_at, idempotency_key }.
// On success, invalidates the supplier-items query cache so the table
// refreshes (which will show "—" again since the GET list does not return the
// cost column — the user gets confirmation via the success text).
// ---------------------------------------------------------------------------

interface CostPatchBody {
  std_cost_per_inv_uom: number | null;
  if_match_updated_at: string;
  idempotency_key: string;
}

async function patchSupplierItemCost(
  supplierItemId: string,
  body: CostPatchBody,
): Promise<void> {
  const res = await fetch(
    `/api/supplier-items/${encodeURIComponent(supplierItemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH failed (HTTP ${res.status}): ${text}`);
  }
}

function CostEditCell({
  supplierItemId,
  updatedAt,
  currentCost,
  queryKey,
}: {
  supplierItemId: string;
  updatedAt: string;
  currentCost: string | null;
  queryKey: readonly unknown[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentCost ?? "");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: CostPatchBody) =>
      patchSupplierItemCost(supplierItemId, body),
    onSuccess: () => {
      setSaved(true);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: queryKey as string[] });
    },
  });

  const handleSave = useCallback(() => {
    const trimmed = inputValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (isNaN(parsed as number) || (parsed as number) < 0)) {
      return; // invalid — don't submit
    }
    mutation.mutate({
      std_cost_per_inv_uom: parsed,
      if_match_updated_at: updatedAt,
      idempotency_key: crypto.randomUUID(),
    });
  }, [inputValue, updatedAt, mutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") { setEditing(false); setInputValue(currentCost ?? ""); setSaved(false); }
    },
    [handleSave, currentCost],
  );

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="0.0001"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.0000"
          autoFocus
          className="w-24 rounded border border-border px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded bg-accent px-1.5 py-0.5 text-xs text-white hover:opacity-80 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : "Save"}
        </button>
        <button
          onClick={() => { setEditing(false); setInputValue(currentCost ?? ""); }}
          className="rounded px-1 py-0.5 text-xs text-fg-muted hover:text-fg"
        >
          ✕
        </button>
        {mutation.isError ? (
          <span className="text-xs text-red-600" title={(mutation.error as Error).message}>
            Error
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {currentCost !== null && currentCost !== "" ? (
        <span className="font-mono text-xs text-fg">{currentCost}</span>
      ) : (
        <span className="text-fg-faint">—</span>
      )}
      {saved ? (
        <span className="text-xs text-green-600">Saved</span>
      ) : null}
      <button
        onClick={() => { setEditing(true); setSaved(false); setInputValue(currentCost ?? ""); }}
        className="rounded px-1 py-0.5 text-3xs text-fg-subtle hover:bg-bg-subtle hover:text-fg"
      >
        Edit cost
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSupplierDetailPage({
  params,
}: {
  params: Promise<{ supplier_id: string }>;
}): JSX.Element {
  const { supplier_id } = use(params);

  const supplierQuery = useQuery<SuppliersListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });
  const row = supplierQuery.data?.rows.find(
    (r) => r.supplier_id === supplier_id,
  );

  const supplierItemsQueryKey = [
    "admin",
    "masters",
    "supplier",
    supplier_id,
    "supplier-items",
  ] as const;

  const supplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: supplierItemsQueryKey,
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?supplier_id=${encodeURIComponent(supplier_id)}&limit=1000`,
      ),
  });

  const purchaseOrdersQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id, "purchase-orders"],
    queryFn: () =>
      fetchJson(
        `/api/purchase-orders?supplier_id=${encodeURIComponent(supplier_id)}&limit=500`,
      ),
  });

  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) =>
        e.related_entity_id === supplier_id ||
        (e.related_entity_type === "supplier" &&
          e.related_entity_id === supplier_id),
    ) ?? [];

  const allSi = supplierItemsQuery.data?.rows ?? [];
  const allPos = purchaseOrdersQuery.data?.rows ?? [];

  const headerMeta = row ? (
    <>
      <SupplierStatusBadge status={row.status} />
      {row.supplier_type ? (
        <Badge tone="neutral" dotted>
          {row.supplier_type}
        </Badge>
      ) : null}
      {row.currency ? (
        <Badge tone="neutral">{row.currency}</Badge>
      ) : null}
      {row.payment_terms ? (
        <Badge tone="neutral">{row.payment_terms}</Badge>
      ) : null}
    </>
  ) : null;

  // --- Tabs ----------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (supplierQuery.isLoading) return <DetailTabLoading />;
      if (supplierQuery.isError) {
        return <DetailTabError message={(supplierQuery.error as Error).message} />;
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Supplier ${supplier_id} not found in the suppliers list.`}
          />
        );
      }
      const rows: FieldRow[] = [
        { label: "supplier_id", value: row.supplier_id, mono: true },
        { label: "supplier_name_official", value: row.supplier_name_official },
        { label: "supplier_name_short", value: row.supplier_name_short },
        { label: "status", value: <SupplierStatusBadge status={row.status} /> },
        { label: "supplier_type", value: row.supplier_type, mono: true },
        { label: "primary_contact_name", value: row.primary_contact_name },
        { label: "primary_contact_phone", value: row.primary_contact_phone },
        { label: "currency", value: row.currency, mono: true },
        { label: "payment_terms", value: row.payment_terms },
        {
          label: "default_lead_time_days",
          value: row.default_lead_time_days ?? null,
        },
        { label: "default_moq", value: row.default_moq, mono: true },
        { label: "approval_status", value: row.approval_status },
        {
          label: "green_invoice_supplier_id",
          value: row.green_invoice_supplier_id,
          mono: true,
        },
        { label: "site_id", value: row.site_id, mono: true },
        { label: "created_at", value: fmtDateTime(row.created_at) },
        { label: "updated_at", value: fmtDateTime(row.updated_at) },
      ];
      return <DetailFieldGrid rows={rows} />;
    })(),
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Supplier items",
    badge: allSi.length > 0 ? `${allSi.length}` : undefined,
    content: (() => {
      if (supplierItemsQuery.isLoading) return <DetailTabLoading />;
      if (supplierItemsQuery.isError) {
        return (
          <DetailTabError
            message={(supplierItemsQuery.error as Error).message}
          />
        );
      }
      if (allSi.length === 0) {
        return (
          <DetailTabEmpty message="No supplier-items mapped to this supplier." />
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Kind
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Target
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Relationship
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Primary
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order UoM
                </th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Lead (days)
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Approval
                </th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Std cost (ILS)
                </th>
              </tr>
            </thead>
            <tbody>
              {allSi.map((r) => (
                <tr
                  key={r.supplier_item_id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 text-fg-muted">
                    {r.component_id ? "component" : r.item_id ? "item" : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-fg">
                    {r.component_id ? (
                      <Link
                        href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`}
                        className="hover:text-accent"
                      >
                        {r.component_id}
                      </Link>
                    ) : r.item_id ? (
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                        className="hover:text-accent"
                      >
                        {r.item_id}
                      </Link>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {r.relationship ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_primary ? (
                      <Badge tone="success" dotted>
                        primary
                      </Badge>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {r.order_uom ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                    {r.lead_time_days ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.approval_status ? (
                      <Badge tone="neutral">{r.approval_status}</Badge>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CostEditCell
                      supplierItemId={r.supplier_item_id}
                      updatedAt={r.updated_at}
                      currentCost={r.std_cost_per_inv_uom}
                      queryKey={supplierItemsQueryKey}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      );
    })(),
  };

  const poHistoryTab: TabDescriptor = {
    key: "po-history",
    label: "PO history",
    badge: allPos.length > 0 ? `${allPos.length}` : undefined,
    content: (() => {
      if (purchaseOrdersQuery.isLoading) return <DetailTabLoading />;
      if (purchaseOrdersQuery.isError) {
        return (
          <DetailTabError
            message={(purchaseOrdersQuery.error as Error).message}
          />
        );
      }
      if (allPos.length === 0) {
        return (
          <DetailTabEmpty message="No purchase orders issued against this supplier yet." />
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  PO number
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order date
                </th>
                <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Expected receive
                </th>
                <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Total net
                </th>
              </tr>
            </thead>
            <tbody>
              {allPos.map((p) => (
                <tr
                  key={p.po_id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/purchase-orders/${encodeURIComponent(p.po_id)}`}
                      className="text-fg hover:text-accent"
                    >
                      {p.po_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <POStatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {fmtDate(p.order_date)}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {fmtDate(p.expected_receive_date)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-fg">
                    {p.total_net}{" "}
                    <span className="text-fg-faint">{p.currency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      );
    })(),
  };

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    badge:
      relatedExceptions.length > 0 ? `${relatedExceptions.length}` : undefined,
    content: (() => {
      if (exceptionsQuery.isLoading) return <DetailTabLoading />;
      if (exceptionsQuery.isError) {
        return (
          <DetailTabError
            message={(exceptionsQuery.error as Error).message}
          />
        );
      }
      if (relatedExceptions.length === 0) {
        return (
          <DetailTabEmpty message="No open or acknowledged exceptions linked to this supplier." />
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <ul className="divide-y divide-border/40">
            {relatedExceptions.map((e) => (
              <li
                key={e.exception_id}
                className="flex items-start gap-3 px-4 py-2 text-xs"
              >
                <SeverityBadge severity={e.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">{e.title}</div>
                  {e.detail ? (
                    <div className="truncate text-fg-muted">{e.detail}</div>
                  ) : null}
                  <div className="mt-0.5 text-3xs text-fg-faint">
                    {e.category} · {e.status} · {fmtDateTime(e.created_at)}
                  </div>
                </div>
                <Link
                  href={`/inbox?view=exceptions&exception_id=${encodeURIComponent(
                    e.exception_id,
                  )}`}
                  className="shrink-0 text-accent hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    })(),
  };

  const tabs: TabDescriptor[] = [
    overviewTab,
    supplierItemsTab,
    poHistoryTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  // Components sourced from this supplier (derived from supplier-items).
  const sourcedComponents = Array.from(
    new Set(
      allSi.filter((si) => si.component_id).map((si) => si.component_id!),
    ),
  );
  linkages.push({
    label: "Components sourced",
    items: sourcedComponents.slice(0, 10).map((cid) => ({
      label: cid,
      href: `/admin/masters/components/${encodeURIComponent(cid)}`,
    })),
    emptyText: "No components sourced.",
  });

  linkages.push({
    label: "Recent POs",
    items: allPos.slice(0, 5).map((p) => ({
      label: p.po_number,
      href: `/purchase-orders/${encodeURIComponent(p.po_id)}`,
      subtitle: fmtDate(p.order_date),
      badge: <POStatusBadge status={p.status} />,
    })),
    emptyText: "No purchase orders yet.",
  });

  if (row?.green_invoice_supplier_id) {
    linkages.push({
      label: "Green Invoice mapping",
      items: [
        {
          label: row.green_invoice_supplier_id,
          href: `/admin/integrations`,
          subtitle: "gi_supplier_id",
          badge: <Badge tone="info" dotted>GI</Badge>,
        },
      ],
    });
  }

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions for this supplier.",
  });

  return (
    <DetailPage
      header={{
        eyebrow: "Admin · Suppliers",
        title: row
          ? row.supplier_name_short ?? row.supplier_name_official
          : supplier_id,
        description: row ? `Supplier ${row.supplier_id}` : "Loading supplier…",
        meta: headerMeta,
        actions: (
          <Link href="/admin/suppliers" className="btn btn-ghost btn-sm">
            Back to suppliers
          </Link>
        ),
      }}
      tabs={tabs}
      linkages={linkages}
    />
  );
}

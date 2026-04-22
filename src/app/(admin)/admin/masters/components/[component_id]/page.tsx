"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Components · Detail — Tranche D (plan §F).
// Canonical URL /admin/masters/components/[component_id].
//
// 5 tabs:
//   - overview          LIVE    — component row fields via list + client-filter
//   - used-in-boms      PENDING — no versions-filtered-by-component endpoint
//                                 exposed upstream; BOM lines require a
//                                 bom_version_id filter, so a cross-reference
//                                 aggregate is deferred.
//   - supplier-items    LIVE    — /api/supplier-items?component_id=<id>
//   - primary-supplier  LIVE    — derived from supplier-items is_primary
//   - exceptions        LIVE    — /api/exceptions client-filtered
//
// Linkage card: primary supplier, all supplier-items, related exceptions.
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
import { SectionCard } from "@/components/workflow/SectionCard";

// --- Types ---------------------------------------------------------------

interface ComponentRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  component_group: string | null;
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
  purchase_to_inv_factor: string;
  planning_policy_code: string | null;
  primary_supplier_id: string | null;
  lead_time_days: number | null;
  moq_purchase_uom: string | null;
  order_multiple_purchase_uom: string | null;
  criticality: string | null;
  planned_flag: boolean;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface ComponentsListResponse {
  rows: ComponentRow[];
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
  inventory_uom: string | null;
  pack_conversion: string;
  lead_time_days: number | null;
  moq: string | null;
  approval_status: string | null;
}

interface SupplierItemsListResponse {
  rows: SupplierItemRow[];
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

function ComponentStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminComponentDetailPage({
  params,
}: {
  params: Promise<{ component_id: string }>;
}): JSX.Element {
  const { component_id } = use(params);

  const componentQuery = useQuery<ComponentsListResponse>({
    queryKey: ["admin", "masters", "component", component_id],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });
  const row = componentQuery.data?.rows.find(
    (r) => r.component_id === component_id,
  );

  const supplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: ["admin", "masters", "component", component_id, "supplier-items"],
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?component_id=${encodeURIComponent(component_id)}&limit=1000`,
      ),
  });

  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "component", component_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) => e.related_entity_id === component_id,
    ) ?? [];

  const primarySi =
    supplierItemsQuery.data?.rows.filter((si) => si.is_primary) ?? [];
  const allSi = supplierItemsQuery.data?.rows ?? [];

  const headerMeta = row ? (
    <>
      <ComponentStatusBadge status={row.status} />
      {row.component_class ? (
        <Badge tone="neutral" dotted>
          {row.component_class}
        </Badge>
      ) : null}
      {row.component_group ? (
        <Badge tone="neutral">{row.component_group}</Badge>
      ) : null}
      {row.criticality ? (
        <Badge tone={row.criticality === "HIGH" ? "danger" : "neutral"}>
          {row.criticality}
        </Badge>
      ) : null}
    </>
  ) : null;

  // --- Tabs ----------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (componentQuery.isLoading) return <DetailTabLoading />;
      if (componentQuery.isError) {
        return <DetailTabError message={(componentQuery.error as Error).message} />;
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Component ${component_id} not found in the components list.`}
          />
        );
      }
      const rows: FieldRow[] = [
        { label: "component_id", value: row.component_id, mono: true },
        { label: "component_name", value: row.component_name },
        { label: "component_class", value: row.component_class },
        { label: "component_group", value: row.component_group },
        { label: "status", value: <ComponentStatusBadge status={row.status} /> },
        { label: "inventory_uom", value: row.inventory_uom, mono: true },
        { label: "purchase_uom", value: row.purchase_uom, mono: true },
        { label: "bom_uom", value: row.bom_uom, mono: true },
        {
          label: "purchase_to_inv_factor",
          value: row.purchase_to_inv_factor,
          mono: true,
        },
        {
          label: "planning_policy_code",
          value: row.planning_policy_code,
          mono: true,
        },
        {
          label: "primary_supplier_id",
          value: row.primary_supplier_id ? (
            <Link
              href={`/admin/masters/suppliers/${encodeURIComponent(row.primary_supplier_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {row.primary_supplier_id}
            </Link>
          ) : null,
          mono: true,
        },
        { label: "lead_time_days", value: row.lead_time_days ?? null },
        { label: "moq_purchase_uom", value: row.moq_purchase_uom, mono: true },
        {
          label: "order_multiple_purchase_uom",
          value: row.order_multiple_purchase_uom,
          mono: true,
        },
        { label: "criticality", value: row.criticality },
        { label: "planned_flag", value: row.planned_flag ? "true" : "false" },
        { label: "site_id", value: row.site_id, mono: true },
        { label: "created_at", value: fmtDateTime(row.created_at) },
        { label: "updated_at", value: fmtDateTime(row.updated_at) },
      ];
      return <DetailFieldGrid rows={rows} />;
    })(),
  };

  const usedInBomsTab: TabDescriptor = {
    key: "used-in-boms",
    label: "Used in BOMs",
    content: (
      <PendingTabPlaceholder
        reason="Cross-reference from component to BOM versions that cite it requires an aggregate endpoint (bom_lines are only queryable with a required bom_version_id filter upstream). This is a later-tranche concern."
      />
    ),
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Supplier items",
    badge:
      allSi.length > 0 ? `${allSi.length}` : undefined,
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
          <DetailTabEmpty message="No supplier-items mapped to this component." />
        );
      }
      return <SupplierItemsTable rows={allSi} />;
    })(),
  };

  const primarySupplierTab: TabDescriptor = {
    key: "primary-supplier",
    label: "Primary supplier",
    content: (() => {
      if (supplierItemsQuery.isLoading) return <DetailTabLoading />;
      if (supplierItemsQuery.isError) {
        return (
          <DetailTabError
            message={(supplierItemsQuery.error as Error).message}
          />
        );
      }
      if (primarySi.length === 0) {
        return (
          <DetailTabEmpty message="No supplier-item is flagged primary for this component." />
        );
      }
      return <SupplierItemsTable rows={primarySi} />;
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
          <DetailTabEmpty message="No open or acknowledged exceptions linked to this component." />
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
    usedInBomsTab,
    supplierItemsTab,
    primarySupplierTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  if (row?.primary_supplier_id) {
    linkages.push({
      label: "Primary supplier",
      items: [
        {
          label: row.primary_supplier_id,
          href: `/admin/masters/suppliers/${encodeURIComponent(row.primary_supplier_id)}`,
          badge: <Badge tone="success" dotted>primary</Badge>,
        },
      ],
    });
  }

  linkages.push({
    label: "All supplier-items",
    items: allSi.slice(0, 10).map((si) => ({
      label: si.supplier_id,
      href: `/admin/masters/suppliers/${encodeURIComponent(si.supplier_id)}`,
      subtitle: si.relationship ?? undefined,
      badge: si.is_primary ? (
        <Badge tone="success" dotted>
          primary
        </Badge>
      ) : undefined,
    })),
    emptyText: "No supplier-items mapped.",
  });

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions for this component.",
  });

  return (
    <DetailPage
      header={{
        eyebrow: "Admin · Components",
        title: row ? row.component_name : component_id,
        description: row ? `Component ${row.component_id}` : "Loading component…",
        meta: headerMeta,
        actions: (
          <Link href="/admin/components" className="btn btn-ghost btn-sm">
            Back to components
          </Link>
        ),
      }}
      tabs={tabs}
      linkages={linkages}
    />
  );
}

// ---------------------------------------------------------------------------
// SupplierItemsTable — inline helper (duplicated from items detail for
// column drift independence). Promote to shared component in Tranche F.
// ---------------------------------------------------------------------------

function SupplierItemsTable({
  rows,
}: {
  rows: SupplierItemRow[];
}): JSX.Element {
  return (
    <SectionCard density="compact" contentClassName="p-0">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Supplier
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
            <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              MOQ
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Approval
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.supplier_item_id}
              className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
            >
              <td className="px-3 py-2 font-mono text-xs text-fg">
                <Link
                  href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                  className="hover:text-accent"
                >
                  {r.supplier_id}
                </Link>
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
              <td className="px-3 py-2 text-fg-muted">{r.order_uom ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                {r.lead_time_days ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                {r.moq ?? "—"}
              </td>
              <td className="px-3 py-2">
                {r.approval_status ? (
                  <Badge tone="neutral">{r.approval_status}</Badge>
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

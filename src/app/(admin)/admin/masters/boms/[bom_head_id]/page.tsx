"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · BOMs · Detail — Tranche E of portal-full-production-refactor
// (plan §G). Canonical URL /admin/masters/boms/[bom_head_id].
//
// View-only BOM head detail. Composes <DetailPage /> (Tranche D primitive)
// with 3 tabs:
//   - overview     LIVE   — head fields via list-and-filter on /api/boms/heads
//   - versions     LIVE   — /api/boms/versions?bom_head_id=<id>, timeline
//   - exceptions   LIVE   — /api/exceptions client-filtered by related_entity_id
//
// Linkage card: linked item (to /admin/masters/items/<item_id>), active BOM
// version deep-link, exceptions summary.
//
// View-only strict. No "New version" button, no line editor, no approval UI.
// Those belong to the separate BOM-deep-logic window / future Tranche J.
// ---------------------------------------------------------------------------

import { use, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  type FieldRow,
  type LinkageGroup,
  type TabDescriptor,
} from "@/components/patterns/DetailPage";
import { Badge } from "@/components/badges/StatusBadge";
import { SectionCard } from "@/components/workflow/SectionCard";

// --- Types (mirrored from upstream schemas) ------------------------------

interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  display_family: string | null;
  parent_ref_id: string;
  parent_name: string | null;
  active_version_id: string | null;
  final_bom_output_qty: string;
  final_bom_output_uom: string | null;
  status: string;
}

interface BomVersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: string;
  created_at: string;
  activated_at: string | null;
  updated_at: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
  sales_uom: string | null;
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

type ListEnvelope<T> = { rows: T[]; count: number };

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

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

function VersionStatusBadge({
  version,
  activeVersionId,
}: {
  version: BomVersionRow;
  activeVersionId: string | null;
}): JSX.Element {
  const isActive = version.bom_version_id === activeVersionId;
  if (isActive) return <Badge tone="success" dotted>active</Badge>;
  const lower = (version.status ?? "").toLowerCase();
  if (lower === "draft") return <Badge tone="warning" dotted>draft</Badge>;
  if (lower === "archived" || lower === "superseded") {
    return <Badge tone="neutral" dotted>superseded</Badge>;
  }
  return <Badge tone="neutral" dotted>{version.status}</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMastersBomHeadDetailPage({
  params,
}: {
  params: Promise<{ bom_head_id: string }>;
}): JSX.Element {
  const { bom_head_id } = use(params);

  // --- Data: BOM head via list + client-filter (no direct-by-id endpoint) ---
  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "masters", "bom_head", "all"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });
  const head = useMemo(
    () =>
      (headsQuery.data?.rows ?? []).find(
        (h) => h.bom_head_id === bom_head_id,
      ) ?? null,
    [headsQuery.data, bom_head_id],
  );

  // --- Data: versions list ------------------------------------------------
  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "masters", "bom_version", "by-head", bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bom_head_id)}&limit=1000`,
      ),
    enabled: Boolean(head),
  });

  // --- Data: linked item --------------------------------------------------
  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "masters", "items", "all-for-bom-head"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
    enabled: Boolean(head),
  });
  const item = useMemo(() => {
    if (!head) return null;
    return (
      (itemsQuery.data?.rows ?? []).find(
        (i) => i.item_id === head.parent_ref_id,
      ) ?? null
    );
  }, [itemsQuery.data, head]);

  // --- Data: exceptions (client-filtered by related_entity_id) ------------
  const exceptionsQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "masters", "bom_head", bom_head_id, "exceptions"],
    queryFn: () =>
      fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) => e.related_entity_id === bom_head_id,
    ) ?? [];

  // --- Derived ------------------------------------------------------------
  const versionsSorted = useMemo(() => {
    const activeId = head?.active_version_id ?? null;
    return (versionsQuery.data?.rows ?? []).slice().sort((a, b) => {
      // Active version always pins to top
      if (a.bom_version_id === activeId) return -1;
      if (b.bom_version_id === activeId) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [versionsQuery.data, head?.active_version_id]);

  const activeVersion = versionsSorted.find(
    (v) => v.bom_version_id === head?.active_version_id,
  );

  // --- Header meta --------------------------------------------------------
  const headerMeta = head ? (
    <>
      <Badge tone="neutral" dotted>
        {head.bom_head_id}
      </Badge>
      <Badge tone="info" dotted>
        {item?.supply_method ?? head.bom_kind}
      </Badge>
      <Badge tone="neutral" dotted>
        {head.final_bom_output_qty} {head.final_bom_output_uom ?? ""}
      </Badge>
    </>
  ) : null;

  // --- Tabs ---------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (headsQuery.isLoading) return <DetailTabLoading />;
      if (headsQuery.isError) {
        return (
          <DetailTabError message={(headsQuery.error as Error).message} />
        );
      }
      if (!head) {
        return (
          <DetailTabEmpty message={`BOM head ${bom_head_id} not found.`} />
        );
      }
      const rows: FieldRow[] = [
        { label: "BOM ID", value: head.bom_head_id, mono: true },
        {
          label: "Type",
          value: <Badge tone="info" dotted>{item?.supply_method ?? head.bom_kind}</Badge>,
        },
        {
          label: "Family",
          value: head.display_family ?? "—",
        },
        {
          label: "Item / Base mix",
          value: item ? (
            <Link
              href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {item.item_name} ({head.parent_ref_id})
            </Link>
          ) : (
            head.parent_name ?? head.parent_ref_id
          ),
        },
        {
          label: "Active version",
          value: activeVersion ? (
            <Link
              href={`/admin/masters/boms/${encodeURIComponent(
                head.bom_head_id,
              )}/${encodeURIComponent(activeVersion.bom_version_id)}`}
              className="font-mono text-accent hover:underline"
            >
              {activeVersion.version_label}
            </Link>
          ) : (
            <Badge tone="warning" dotted>No active version</Badge>
          ),
        },
        {
          label: "Base batch output",
          value: (
            <span className="font-mono">
              {head.final_bom_output_qty}
              {head.final_bom_output_uom ? ` ${head.final_bom_output_uom}` : ""}
            </span>
          ),
        },
        {
          label: "Status",
          value: <Badge tone="neutral" dotted>{head.status}</Badge>,
        },
      ];
      return <DetailFieldGrid rows={rows} />;
    })(),
  };

  const versionsTab: TabDescriptor = {
    key: "versions",
    label: "Versions",
    badge:
      versionsSorted.length > 0 ? `${versionsSorted.length}` : undefined,
    content: (() => {
      if (!head) return <DetailTabEmpty message="BOM head not loaded yet." />;
      if (versionsQuery.isLoading) return <DetailTabLoading />;
      if (versionsQuery.isError) {
        return (
          <DetailTabError message={(versionsQuery.error as Error).message} />
        );
      }
      if (versionsSorted.length === 0) {
        return (
          <DetailTabEmpty message="No versions on this BOM head yet." />
        );
      }
      return (
        <SectionCard
          eyebrow="Version timeline"
          title={`${versionsSorted.length} version${versionsSorted.length === 1 ? "" : "s"}`}
          density="compact"
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>Version</Th>
                  <Th>Status</Th>
                  <Th>Version ID</Th>
                  <Th>Created</Th>
                  <Th>Activated</Th>
                </tr>
              </thead>
              <tbody>
                {versionsSorted.map((v) => (
                  <tr
                    key={v.bom_version_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      <Link
                        href={`/admin/masters/boms/${encodeURIComponent(
                          head.bom_head_id,
                        )}/${encodeURIComponent(v.bom_version_id)}`}
                        className="hover:text-accent"
                      >
                        {v.version_label}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <VersionStatusBadge
                        version={v}
                        activeVersionId={head.active_version_id}
                      />
                    </td>
                    <td className="px-3 py-2 text-3xs font-mono text-fg-muted">
                      {v.bom_version_id}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDateTime(v.created_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {fmtDateTime(v.activated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <DetailTabEmpty message="No open or acknowledged exceptions reference this BOM head." />
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <ul className="divide-y divide-border/40">
            {relatedExceptions.map((e) => (
              <li
                key={e.exception_id}
                className="flex items-start justify-between gap-3 px-4 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={e.severity} />
                    <Badge tone="neutral" dotted>
                      {e.category}
                    </Badge>
                    <span className="font-medium text-fg">{e.title}</span>
                  </div>
                  {e.detail ? (
                    <div className="mt-0.5 text-fg-muted">{e.detail}</div>
                  ) : null}
                  <div className="mt-0.5 text-3xs text-fg-faint">
                    {fmtDateTime(e.created_at)} · {e.status}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    })(),
  };

  // --- Linkage groups -----------------------------------------------------

  const linkages: LinkageGroup[] = [];

  if (item) {
    linkages.push({
      label: "Linked item",
      items: [
        {
          label: item.item_id,
          href: `/admin/masters/items/${encodeURIComponent(item.item_id)}`,
          subtitle: `${item.item_name} · ${item.supply_method}`,
          badge: (
            <Badge tone="info" dotted>
              {item.supply_method}
            </Badge>
          ),
        },
      ],
    });
  }

  if (activeVersion) {
    linkages.push({
      label: "Active version",
      items: [
        {
          label: activeVersion.version_label,
          href: `/admin/masters/boms/${encodeURIComponent(
            bom_head_id,
          )}/${encodeURIComponent(activeVersion.bom_version_id)}`,
          subtitle: `activated ${fmtDateTime(activeVersion.activated_at)}`,
          badge: <Badge tone="success" dotted>active</Badge>,
        },
      ],
    });
  } else if (head) {
    linkages.push({
      label: "Active version",
      items: [],
      emptyText: "No active version on this head.",
    });
  }

  if (relatedExceptions.length > 0) {
    linkages.push({
      label: "Open exceptions",
      items: relatedExceptions.slice(0, 5).map((e) => ({
        label: e.category,
        href: "/inbox?view=exceptions",
        subtitle: e.title,
        badge: <SeverityBadge severity={e.severity} />,
      })),
    });
  }

  const simulateHref =
    head && head.active_version_id
      ? `/admin/masters/boms/${encodeURIComponent(head.bom_head_id)}/${encodeURIComponent(head.active_version_id)}`
      : null;

  return (
    <DetailPage
      header={{
        eyebrow: "Admin · Masters · BOMs",
        title: item?.item_name ?? head?.parent_name ?? head?.parent_ref_id ?? bom_head_id,
        description: head?.active_version_id
          ? "Review BOM versions and component lines. Use the active version to simulate production quantities and check material coverage."
          : "No active version — publish a draft version to enable simulation.",
        meta: (
          <>
            {headerMeta}
            {simulateHref && (
              <Link
                href={simulateHref}
                className="btn-primary inline-flex items-center gap-1.5 text-xs"
              >
                Simulate this BOM
              </Link>
            )}
          </>
        ),
        actions: (
          <Link
            href="/admin/masters/boms"
            className="btn-secondary inline-flex items-center gap-1 text-xs"
          >
            ← BOMs
          </Link>
        ),
      }}
      tabs={[overviewTab, versionsTab, exceptionsTab]}
      linkages={linkages}
    />
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · BOMs · Detail — BOM head detail page.
// Iters 1-7 redesign: hero summary card, KPI strip, versions tab, exceptions
// tab, tab badge tones, technical details collapsible, reveal-on-mount.
// ---------------------------------------------------------------------------

import { use, useMemo, useState } from "react";
import { fmtSupplyMethod } from "@/lib/display";
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
import { MasterSummaryCard, type KpiStat } from "@/components/admin/MasterSummaryCard";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

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
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
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

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return iso;
  }
}

// --- iter 2: BOM kind badge helpers ---

function bomKindLabel(kind: string): string {
  if (kind === "PACK") return "Pack";
  if (kind === "BASE") return "Base mix";
  if (kind === "REPACK") return "Repack";
  return kind;
}

function bomKindTone(kind: string): "info" | "success" | "warning" | "neutral" {
  if (kind === "PACK") return "info";
  if (kind === "BASE") return "success";
  if (kind === "REPACK") return "warning";
  return "neutral";
}

// --- iter 2: head status tone ---

function headStatusTone(status: string): "success" | "warning" | "neutral" | "danger" {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "success";
  if (s === "pending") return "warning";
  if (s === "inactive" || s === "archived") return "neutral";
  return "neutral";
}

// --- exception helpers ---

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// --- iter 3: version status badge + row highlight ---

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
  if (lower === "draft") return <Badge tone="info" dotted>draft</Badge>;
  if (lower === "archived" || lower === "superseded") {
    return <Badge tone="neutral" dotted>archived</Badge>;
  }
  return <Badge tone="neutral" dotted>{version.status}</Badge>;
}

// ---------------------------------------------------------------------------
// iter 6: Technical details collapsible
// ---------------------------------------------------------------------------

function TechnicalDetailsCollapsible({
  head,
  item,
}: {
  head: BomHeadRow;
  item: ItemRow | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/50 bg-bg-subtle/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors",
          open ? "bg-bg-subtle/60 rounded-t-md" : "rounded-md hover:bg-bg-subtle/50",
        )}
        aria-expanded={open}
      >
        <span className="text-xs font-semibold text-fg-subtle uppercase tracking-sops">
          Technical details
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2.5} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2.5} />
        )}
      </button>
      {open && (
        <div className="border-t border-border/40 px-4 py-3 space-y-2 text-xs text-fg-muted">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <div>
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
                BOM Head ID
              </span>
              <span className="font-mono text-fg">{head.bom_head_id}</span>
            </div>
            <div>
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
                BOM Kind
              </span>
              <span className="font-mono text-fg">
                {head.bom_kind}
                <span className="ml-2 text-fg-faint">(locked after first version)</span>
              </span>
            </div>
            <div>
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
                Parent ref type
              </span>
              <span className="font-mono text-fg">item</span>
            </div>
            <div>
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
                Parent ref ID
              </span>
              {item ? (
                <Link
                  href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
                  className="font-mono text-accent hover:underline"
                >
                  {head.parent_ref_id}
                </Link>
              ) : (
                <span className="font-mono text-fg">{head.parent_ref_id}</span>
              )}
            </div>
            <div>
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
                Base batch output
              </span>
              <span className="font-mono text-fg">
                {head.final_bom_output_qty} {head.final_bom_output_uom ?? ""}
              </span>
            </div>
          </div>
          <p className="text-3xs text-fg-faint mt-2">
            BOM kind is locked once this head has published versions.
            To change the formula structure, create a new BOM head and retire this one.
          </p>
        </div>
      )}
    </div>
  );
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

  // --- Data: BOM head via list + client-filter ---
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

  // --- Data: versions list ---
  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "masters", "bom_version", "by-head", bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bom_head_id)}&limit=1000`,
      ),
    enabled: Boolean(head),
  });

  // --- Data: linked item ---
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

  // --- Data: exceptions ---
  const exceptionsQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "masters", "bom_head", bom_head_id, "exceptions"],
    queryFn: () =>
      fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) => e.related_entity_id === bom_head_id,
    ) ?? [];

  // --- iter 4: sort critical first ---
  const sortedExceptions = useMemo(() => {
    return relatedExceptions.slice().sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      const ao = order[a.severity as keyof typeof order] ?? 3;
      const bo = order[b.severity as keyof typeof order] ?? 3;
      return ao - bo;
    });
  }, [relatedExceptions]);

  const criticalCount = sortedExceptions.filter((e) => e.severity === "critical").length;

  // --- Derived ---
  const versionsSorted = useMemo(() => {
    const activeId = head?.active_version_id ?? null;
    return (versionsQuery.data?.rows ?? []).slice().sort((a, b) => {
      if (a.bom_version_id === activeId) return -1;
      if (b.bom_version_id === activeId) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [versionsQuery.data, head?.active_version_id]);

  const activeVersion = versionsSorted.find(
    (v) => v.bom_version_id === head?.active_version_id,
  );

  // --- iter 2: KPI strip ---
  const kpis: KpiStat[] = useMemo(() => {
    if (!head) return [];
    const stats: KpiStat[] = [
      {
        label: "Versions",
        value: versionsSorted.length > 0 ? `${versionsSorted.length}` : "0",
        hint: versionsSorted.length === 0 ? "No versions yet" : undefined,
        tone: versionsSorted.length === 0 ? "muted" : "default",
      },
      {
        label: "Active version",
        value: activeVersion ? `v${activeVersion.version_label}` : "None",
        hint: activeVersion ? `activated ${fmtRelative(activeVersion.activated_at)}` : "Publish a draft to activate",
        tone: activeVersion ? "success" : "warning",
        href: activeVersion
          ? `/admin/masters/boms/${encodeURIComponent(head.bom_head_id)}/${encodeURIComponent(activeVersion.bom_version_id)}`
          : undefined,
      },
      {
        label: "Last updated",
        value: activeVersion
          ? fmtRelative(activeVersion.updated_at)
          : versionsSorted[0]
            ? fmtRelative(versionsSorted[0].updated_at)
            : "—",
        hint: activeVersion ? fmtDateTime(activeVersion.updated_at) : undefined,
        tone: "muted",
      },
    ];
    return stats;
  }, [head, versionsSorted, activeVersion]);

  // --- Header meta (iter 2: BOM kind badge, item linkage, status badge, active version chip) ---
  const headerMeta = head ? (
    <>
      <Badge tone={bomKindTone(head.bom_kind)} dotted>
        {bomKindLabel(head.bom_kind)}
      </Badge>
      <Badge tone={headStatusTone(head.status)} dotted>
        {head.status}
      </Badge>
      {activeVersion && (
        <Badge tone="success" dotted>
          v{activeVersion.version_label} active
        </Badge>
      )}
      <Badge tone="neutral" dotted>
        {head.final_bom_output_qty} {head.final_bom_output_uom ?? ""}
      </Badge>
    </>
  ) : null;

  // ---------------------------------------------------------------------------
  // iter 1: Overview tab — field grid + summary card + technical details
  // ---------------------------------------------------------------------------

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

      // iter 2: MasterSummaryCard hero
      const completeness = [
        {
          label: "Linked item",
          status: (item ? "ok" : "error") as "ok" | "error",
          detail: item ? item.item_name : "No item linked to this BOM head",
          href: item
            ? `/admin/masters/items/${encodeURIComponent(item.item_id)}`
            : undefined,
        },
        {
          label: "Active version",
          status: (activeVersion ? "ok" : "warn") as "ok" | "warn",
          detail: activeVersion
            ? `v${activeVersion.version_label}`
            : "No active version — publish a draft to enable production",
          href: activeVersion
            ? `/admin/masters/boms/${encodeURIComponent(head.bom_head_id)}/${encodeURIComponent(activeVersion.bom_version_id)}`
            : undefined,
        },
        {
          label: "Has component lines",
          status: (versionsSorted.length > 0 ? "ok" : "warn") as "ok" | "warn",
          detail:
            versionsSorted.length > 0
              ? `${versionsSorted.length} version${versionsSorted.length === 1 ? "" : "s"}`
              : "No versions created yet",
        },
      ];

      const rows: FieldRow[] = [
        { label: "BOM ID", value: head.bom_head_id, mono: true },
        {
          label: "Type",
          value: (
            <Badge tone={bomKindTone(head.bom_kind)} dotted>
              {bomKindLabel(head.bom_kind)}
            </Badge>
          ),
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
              v{activeVersion.version_label}
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
          value: (
            <Badge tone={headStatusTone(head.status)} dotted>
              {head.status}
            </Badge>
          ),
        },
      ];

      return (
        <div className="space-y-4">
          {/* iter 2: Hero summary card */}
          <MasterSummaryCard
            name={item?.item_name ?? head.parent_name ?? head.parent_ref_id}
            code={head.bom_head_id}
            entityType={`BOM · ${bomKindLabel(head.bom_kind)}`}
            status={head.status === "active" ? "ACTIVE" : head.status === "inactive" ? "INACTIVE" : "ACTIVE"}
            completeness={completeness}
            kpis={kpis}
            subtitle={
              item ? (
                <Link
                  href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
                  className="text-accent hover:underline"
                >
                  {fmtSupplyMethod(item.supply_method)} item
                </Link>
              ) : undefined
            }
          />
          <DetailFieldGrid rows={rows} />
          {/* iter 6: Technical details collapsible */}
          <TechnicalDetailsCollapsible head={head} item={item} />
        </div>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // iter 3: Versions tab redesign
  // ---------------------------------------------------------------------------

  const versionsTab: TabDescriptor = {
    key: "versions",
    label: "Versions",
    // iter 5: version count badge
    badge: versionsSorted.length > 0 ? `${versionsSorted.length}` : undefined,
    badgeTone: "info" as const,
    content: (() => {
      if (!head) return <DetailTabLoading />;
      if (versionsQuery.isLoading) return <DetailTabLoading />;
      if (versionsQuery.isError) {
        return (
          <DetailTabError message={(versionsQuery.error as Error).message} />
        );
      }
      if (versionsSorted.length === 0) {
        // iter 3: descriptive empty state
        return (
          <SectionCard
            eyebrow="Versions"
            title="No versions yet"
            description="No versions have been created for this BOM head."
            tone="default"
            density="compact"
          >
            <div className="mt-2 rounded-md border border-warning/30 bg-warning-softer px-4 py-3 text-sm text-warning-fg">
              No versions yet — create a draft version to start building this recipe.
            </div>
            <Link
              href={`/admin/masters/items/${encodeURIComponent(head.parent_ref_id)}`}
              className="btn btn-sm btn-primary mt-3"
            >
              Open item to create a draft →
            </Link>
          </SectionCard>
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
                  <Th>Created</Th>
                  <Th>Activated</Th>
                  <Th>Last updated</Th>
                </tr>
              </thead>
              <tbody>
                {versionsSorted.map((v) => {
                  const isActiveRow = v.bom_version_id === head.active_version_id;
                  return (
                    <tr
                      key={v.bom_version_id}
                      className={cn(
                        "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40",
                        // iter 3: active version row highlighted
                        isActiveRow && "bg-success-softer/20",
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-fg">
                        <Link
                          href={`/admin/masters/boms/${encodeURIComponent(
                            head.bom_head_id,
                          )}/${encodeURIComponent(v.bom_version_id)}`}
                          className="font-semibold hover:text-accent"
                        >
                          v{v.version_label}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <VersionStatusBadge
                          version={v}
                          activeVersionId={head.active_version_id}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {fmtDateTime(v.created_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {fmtDateTime(v.activated_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {fmtRelative(v.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // iter 4: Exceptions tab redesign
  // ---------------------------------------------------------------------------

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    // iter 5: badge tone — danger if critical, warning if any
    badge:
      sortedExceptions.length > 0 ? `${sortedExceptions.length}` : undefined,
    badgeTone: criticalCount > 0 ? "danger" : sortedExceptions.length > 0 ? "warning" : "neutral",
    content: (() => {
      if (exceptionsQuery.isLoading) return <DetailTabLoading />;
      if (exceptionsQuery.isError) {
        return (
          <DetailTabError
            message={(exceptionsQuery.error as Error).message}
          />
        );
      }
      if (sortedExceptions.length === 0) {
        // iter 4: "All clear" green empty state
        return (
          <SectionCard density="compact">
            <div className="flex items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-success shrink-0" aria-hidden />
              <span className="text-sm text-success-fg font-medium">All clear</span>
              <span className="text-xs text-fg-muted">
                No open or acknowledged exceptions reference this BOM head.
              </span>
            </div>
          </SectionCard>
        );
      }
      return (
        <SectionCard
          density="compact"
          contentClassName="p-0"
          // iter 4: "View all in Inbox →" header action
          eyebrow="Open exceptions"
          title={`${sortedExceptions.length} exception${sortedExceptions.length === 1 ? "" : "s"}`}
          actions={
            <Link
              href="/inbox?view=exceptions"
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              View all in Inbox
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
            </Link>
          }
        >
          <ul className="divide-y divide-border/40">
            {sortedExceptions.map((e) => (
              <li
                key={e.exception_id}
                className={cn(
                  "flex items-start justify-between gap-3 px-4 py-2.5 text-xs",
                  // iter 4: critical rows highlighted
                  e.severity === "critical" && "bg-danger-softer/20",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
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
                {/* iter 4: "Triage →" per exception */}
                <Link
                  href="/inbox?view=exceptions"
                  className="shrink-0 text-3xs font-semibold text-accent hover:underline whitespace-nowrap"
                >
                  Triage →
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    })(),
  };

  // --- Linkage groups ---

  const linkages: LinkageGroup[] = [];

  if (item) {
    linkages.push({
      label: "Linked item",
      items: [
        {
          label: item.item_id,
          href: `/admin/masters/items/${encodeURIComponent(item.item_id)}`,
          subtitle: `${item.item_name} · ${fmtSupplyMethod(item.supply_method)}`,
          badge: (
            <Badge tone="info" dotted>
              {fmtSupplyMethod(item.supply_method)}
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
          label: `v${activeVersion.version_label}`,
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
    // iter 7: reveal-on-mount animation
    <div className="reveal-on-mount">
      <DetailPage
        header={{
          eyebrow: "Admin · Masters · BOMs",
          title: item?.item_name ?? head?.parent_name ?? head?.parent_ref_id ?? bom_head_id,
          description: head
            ? head.active_version_id
              ? "Review BOM versions and component lines. Use the active version to simulate production quantities and check material coverage."
              : "No active version — publish a draft version to enable simulation."
            : "Review BOM versions and component lines.",
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
    </div>
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

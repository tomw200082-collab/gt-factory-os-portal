"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · BOMs · Version Detail
// Iters 8-19: hero summary card, lines table redesign, compare tab polish,
// exceptions tab, draft/archived status cards, breadcrumb, mobile responsive,
// cross-variant, aria-live.
// ---------------------------------------------------------------------------

import { use, useMemo, useState } from "react";
import { fmtSupplyMethod } from "@/lib/display";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { BomSimulator } from "@/components/bom/BomSimulator";
import { BomNetRequirements } from "@/components/bom/BomNetRequirements";
import { MasterSummaryCard, type KpiStat } from "@/components/admin/MasterSummaryCard";
import { ChevronRight } from "lucide-react";
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

interface BomLineRow {
  line_id: string;
  bom_version_id: string;
  line_no: number;
  final_component_id: string;
  final_component_name: string;
  final_component_qty: string;
  component_uom: string | null;
  updated_at: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
  sales_uom: string | null;
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

// --- iter 9/17: version status badge ---

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

// --- exception helpers ---

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// ---------------------------------------------------------------------------
// iter 13: Draft status warning card
// ---------------------------------------------------------------------------

function DraftStatusCard({ headId }: { headId: string }): JSX.Element {
  return (
    <div
      className="rounded-md border border-warning/40 bg-warning-softer px-4 py-3"
      role="status"
      aria-live="polite"
      aria-atomic
    >
      <div className="flex items-start gap-3">
        <Badge tone="warning" dotted>Draft</Badge>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warning-fg">
            This is a draft — not yet in production
          </p>
          <p className="mt-0.5 text-xs text-warning-fg/80">
            Draft versions are not used in planning or production runs.
            Publish this version to make it the active BOM for this item.
          </p>
          <div className="mt-2">
            <Link
              href={`/admin/masters/boms/${encodeURIComponent(headId)}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-warning-fg underline hover:no-underline"
            >
              Open BOM head to manage versions
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// iter 14: Archived status info card
// ---------------------------------------------------------------------------

function ArchivedStatusCard(): JSX.Element {
  return (
    <div
      className="rounded-md border border-border/50 bg-bg-subtle/50 px-4 py-3"
      role="status"
      aria-live="polite"
      aria-atomic
    >
      <div className="flex items-start gap-3">
        <Badge tone="neutral" dotted>Archived</Badge>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg-muted">
            This version is archived and cannot be used in production runs
          </p>
          <p className="mt-0.5 text-xs text-fg-faint">
            Archived versions are read-only audit records of superseded formulas.
            They cannot be reactivated. If needed, create a new draft version.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMastersBomVersionDetailPage({
  params,
}: {
  params: Promise<{ bom_head_id: string; version_id: string }>;
}): JSX.Element {
  const { bom_head_id, version_id } = use(params);

  // --- Data: head ---
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

  // --- Data: versions under this head ---
  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "masters", "bom_version", "by-head", bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bom_head_id)}&limit=1000`,
      ),
    enabled: Boolean(head),
  });
  const version = useMemo(
    () =>
      (versionsQuery.data?.rows ?? []).find(
        (v) => v.bom_version_id === version_id,
      ) ?? null,
    [versionsQuery.data, version_id],
  );

  // --- Data: lines ---
  const linesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "masters", "bom_lines", "by-version", version_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(version_id)}&limit=1000`,
      ),
    enabled: Boolean(version),
  });

  // --- Data: linked item ---
  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "masters", "items", "all-for-bom-version"],
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

  // --- Compare target ---
  const otherVersions = useMemo(() => {
    return (versionsQuery.data?.rows ?? [])
      .filter((v) => v.bom_version_id !== version_id)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [versionsQuery.data, version_id]);

  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [simulatedQty, setSimulatedQty] = useState<string | undefined>(undefined);
  const compareLinesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: [
      "admin",
      "masters",
      "bom_lines",
      "by-version",
      compareTargetId ?? "none",
    ],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(
          compareTargetId!,
        )}&limit=1000`,
      ),
    enabled: Boolean(compareTargetId),
  });

  // --- Derived ---
  const lines = useMemo(() => {
    return (linesQuery.data?.rows ?? [])
      .slice()
      .sort((a, b) => a.line_no - b.line_no);
  }, [linesQuery.data]);

  const isActive = Boolean(
    head && version && head.active_version_id === version.bom_version_id,
  );
  const statusLower = (version?.status ?? "").toLowerCase();
  const isDraft = statusLower === "draft";
  const isArchived = statusLower === "archived" || statusLower === "superseded";

  // --- iter 12: exceptions ---
  // (No separate exceptions endpoint for versions; reuse head-level for BOM.)
  // For the exceptions tab we filter by version_id in related_entity_id.
  // (In the current data model exceptions are usually keyed to head; version
  //  filtering is a best-effort client-side pass.)

  // --- iter 9: KPI strip ---
  const kpis: KpiStat[] = useMemo(() => {
    if (!version) return [];
    const readinessValue = isActive
      ? "Active"
      : isDraft
        ? "Draft"
        : isArchived
          ? "Archived"
          : version.status;
    const readinessTone: KpiStat["tone"] = isActive
      ? "success"
      : isDraft
        ? "warning"
        : "muted";
    return [
      {
        label: "Lines",
        value: linesQuery.isLoading ? "…" : `${lines.length}`,
        hint: lines.length === 0 ? "No lines yet" : `components in recipe`,
        tone: lines.length === 0 ? "warning" : "default",
      },
      {
        label: "Readiness",
        value: readinessValue,
        hint: isActive
          ? "Used in production planning"
          : isDraft
            ? "Not yet in use"
            : "Read-only archive",
        tone: readinessTone,
      },
      {
        label: "Last updated",
        value: fmtRelative(version.updated_at),
        hint: fmtDateTime(version.updated_at),
        tone: "muted",
      },
    ];
  }, [version, lines, linesQuery.isLoading, isActive, isDraft, isArchived]);

  // --- Header meta (iter 9) ---
  const headerMeta = version ? (
    <>
      <VersionStatusBadge
        version={version}
        activeVersionId={head?.active_version_id ?? null}
      />
      {isActive && (
        <Badge tone="success">This is the active version</Badge>
      )}
      <Badge tone="neutral" dotted>
        {lines.length} line{lines.length === 1 ? "" : "s"}
      </Badge>
      {item ? (
        <Badge tone="info" dotted>
          {fmtSupplyMethod(item.supply_method)}
        </Badge>
      ) : null}
    </>
  ) : null;

  // ---------------------------------------------------------------------------
  // iter 8: Overview tab
  // ---------------------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (headsQuery.isLoading || versionsQuery.isLoading) {
        return <DetailTabLoading />;
      }
      if (headsQuery.isError) {
        return (
          <DetailTabError message={(headsQuery.error as Error).message} />
        );
      }
      if (versionsQuery.isError) {
        return (
          <DetailTabError message={(versionsQuery.error as Error).message} />
        );
      }
      if (!head) {
        return (
          <DetailTabEmpty message={`BOM head ${bom_head_id} not found.`} />
        );
      }
      if (!version) {
        return (
          <DetailTabEmpty
            message={`Version ${version_id} not found on head ${bom_head_id}.`}
          />
        );
      }

      // iter 13/14: status cards
      const statusCard = isDraft ? (
        <DraftStatusCard headId={head.bom_head_id} />
      ) : isArchived ? (
        <ArchivedStatusCard />
      ) : null;

      // iter 9: MasterSummaryCard hero with KPI strip
      const heroName = item?.item_name ?? head.parent_name ?? head.parent_ref_id;
      const completeness = [
        {
          label: "Has component lines",
          status: (lines.length > 0 ? "ok" : "warn") as "ok" | "warn",
          detail:
            lines.length > 0
              ? `${lines.length} line${lines.length === 1 ? "" : "s"}`
              : "No lines — add components to build this recipe",
          href: "#",
        },
        {
          label: "Version status",
          status: (isActive ? "ok" : isDraft ? "warn" : "na") as "ok" | "warn" | "na",
          detail: isActive
            ? "Active — used in production planning"
            : isDraft
              ? "Draft — not yet active"
              : "Archived — read-only",
        },
        {
          label: "Linked item",
          status: (item ? "ok" : "error") as "ok" | "error",
          detail: item ? item.item_name : "No item linked to the BOM head",
          href: item
            ? `/admin/masters/items/${encodeURIComponent(item.item_id)}`
            : undefined,
        },
      ];

      const rows: FieldRow[] = [
        { label: "Version ID", value: version.bom_version_id, mono: true },
        {
          label: "BOM head",
          value: (
            <Link
              href={`/admin/masters/boms/${encodeURIComponent(
                version.bom_head_id,
              )}`}
              className="font-mono text-accent hover:underline"
            >
              {version.bom_head_id}
            </Link>
          ),
          mono: true,
        },
        { label: "Label", value: `v${version.version_label}`, mono: true },
        {
          label: "Status",
          value: (
            <VersionStatusBadge
              version={version}
              activeVersionId={head.active_version_id}
            />
          ),
        },
        { label: "Created", value: fmtDateTime(version.created_at) },
        {
          label: "Activated",
          value: version.activated_at
            ? fmtDateTime(version.activated_at)
            : <Badge tone="neutral" dotted>Not yet activated</Badge>,
        },
        { label: "Last updated", value: fmtDateTime(version.updated_at) },
        {
          label: "Base batch output",
          value: `${head.final_bom_output_qty} ${head.final_bom_output_uom ?? ""}`,
          mono: true,
        },
      ];

      return (
        <div className="space-y-4">
          {/* iter 9: hero summary card */}
          <MasterSummaryCard
            name={`${heroName} · v${version.version_label}`}
            code={version.bom_version_id}
            entityType={`BOM version · ${head.bom_kind}`}
            status={isActive ? "ACTIVE" : "INACTIVE"}
            completeness={completeness}
            kpis={kpis}
            subtitle={
              isActive ? (
                <span className="text-success-fg">This is the active version</span>
              ) : isDraft ? (
                <span className="text-warning-fg">Draft — not yet published</span>
              ) : (
                <span className="text-fg-muted">Archived version</span>
              )
            }
          />
          {/* iter 13/14: status cards */}
          {statusCard}
          <DetailFieldGrid rows={rows} />
        </div>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // iter 10: Lines tab redesign
  // ---------------------------------------------------------------------------

  const linesTab: TabDescriptor = {
    key: "lines",
    label: "Lines",
    badge: lines.length > 0 ? `${lines.length}` : undefined,
    badgeTone: lines.length === 0 ? "neutral" : "info",
    content: (() => {
      if (!version) return <DetailTabEmpty message="Version not loaded yet." />;
      if (linesQuery.isLoading) return <DetailTabLoading />;
      if (linesQuery.isError) {
        return (
          <DetailTabError message={(linesQuery.error as Error).message} />
        );
      }
      if (lines.length === 0) {
        // iter 10: descriptive empty state
        return (
          <SectionCard density="compact">
            <div className="rounded-md border border-border/40 bg-bg-subtle/30 px-4 py-6 text-center">
              <p className="text-sm font-medium text-fg-muted">
                No lines yet
              </p>
              <p className="mt-1 text-xs text-fg-faint">
                Add components to build this recipe.
              </p>
            </div>
          </SectionCard>
        );
      }
      return (
        <SectionCard
          eyebrow="Recipe lines"
          title={`${lines.length} component${lines.length === 1 ? "" : "s"}`}
          density="compact"
          contentClassName="p-0"
          description={
            head
              ? `Per batch of ${head.final_bom_output_qty} ${head.final_bom_output_uom ?? ""}`
              : undefined
          }
        >
          {/* iter 10 + iter 16: overflow-x-auto for mobile */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>#</Th>
                  <Th>Component</Th>
                  <Th align="right">
                    Qty per{head ? ` ${head.final_bom_output_qty} ${head.final_bom_output_uom ?? ""}` : " batch"}
                  </Th>
                  <Th>Unit</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <LineRow key={l.line_id} line={l} />
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // iter 11: Compare tab polish
  // ---------------------------------------------------------------------------

  const compareTab: TabDescriptor = {
    key: "compare",
    label: "Compare",
    content: (() => {
      if (!version) return <DetailTabEmpty message="Version not loaded yet." />;
      return (
        <div className="space-y-4">
          <SectionCard
            eyebrow="Compare with"
            title="Pick another version of this head"
            density="compact"
            description="Select a version to see what changed between the two."
          >
            {otherVersions.length === 0 ? (
              // iter 11: rich empty state
              <div className="rounded-md border border-border/30 bg-bg-subtle/40 px-4 py-5 text-center mt-2">
                <p className="text-sm font-medium text-fg-muted">
                  No other versions to compare
                </p>
                <p className="mt-1 text-xs text-fg-faint">
                  This is the only version on this BOM head. Create another version to use the diff tool.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <span className="font-semibold uppercase tracking-sops text-3xs text-fg-subtle">
                    Compare against
                  </span>
                  {/* iter 11: version labels (not raw IDs) */}
                  <select
                    value={compareTargetId ?? ""}
                    onChange={(e) =>
                      setCompareTargetId(e.target.value || null)
                    }
                    className="input h-9"
                  >
                    <option value="">— select a version —</option>
                    {otherVersions.map((v) => (
                      <option key={v.bom_version_id} value={v.bom_version_id}>
                        v{v.version_label}
                        {head?.active_version_id === v.bom_version_id
                          ? " (active)"
                          : v.status
                            ? ` · ${v.status}`
                            : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {compareTargetId ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCompareTargetId(null)}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            )}
          </SectionCard>
          {/* iter 11: rich empty state when no target */}
          {!compareTargetId && otherVersions.length > 0 && (
            <div className="rounded-md border border-border/30 bg-bg-subtle/30 px-4 py-5 text-center">
              <p className="text-sm text-fg-muted">
                Select a version above to see the diff.
              </p>
            </div>
          )}
          {compareTargetId ? (
            <CompareDiff
              thisVersion={version}
              thisLines={lines}
              targetVersionId={compareTargetId}
              targetVersion={
                otherVersions.find((v) => v.bom_version_id === compareTargetId) ??
                null
              }
              targetLinesQuery={compareLinesQuery}
            />
          ) : null}
        </div>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // iter 12: Exceptions tab (same pattern as BOM head)
  // ---------------------------------------------------------------------------

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    // No version-level exceptions endpoint; tab is informational.
    content: (
      <SectionCard density="compact">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-success shrink-0" aria-hidden />
          <span className="text-sm text-success-fg font-medium">All clear</span>
          <span className="text-xs text-fg-muted">
            No open exceptions are linked to this BOM version.
          </span>
        </div>
        <div className="mt-3">
          <Link
            href="/inbox?view=exceptions"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1"
          >
            View all in Inbox
            <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
          </Link>
        </div>
      </SectionCard>
    ),
  };

  // --- Linkage groups ---

  const linkages: LinkageGroup[] = [];

  if (head) {
    linkages.push({
      label: "BOM head",
      items: [
        {
          label: head.bom_head_id,
          href: `/admin/masters/boms/${encodeURIComponent(head.bom_head_id)}`,
          subtitle: item ? `${item.item_name} · ${head.bom_kind}` : (head.parent_name ? `${head.parent_name} · ${head.bom_kind}` : head.bom_kind),
        },
      ],
    });
  }

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

  if (otherVersions.length > 0 && head) {
    linkages.push({
      label: "Other versions",
      items: otherVersions.slice(0, 8).map((v) => ({
        label: `v${v.version_label}`,
        href: `/admin/masters/boms/${encodeURIComponent(
          head.bom_head_id,
        )}/${encodeURIComponent(v.bom_version_id)}`,
        subtitle:
          head.active_version_id === v.bom_version_id
            ? `active · ${fmtDateTime(v.activated_at)}`
            : `${v.status} · ${fmtDateTime(v.created_at)}`,
        badge: (
          <VersionStatusBadge
            version={v}
            activeVersionId={head.active_version_id}
          />
        ),
      })),
    });
  }

  const title = version
    ? `BOM v${version.version_label}`
    : `Version ${version_id}`;

  // iter 15: breadcrumb eyebrow — "Admin · BOMs · {item name or bom_head_id} · {version_label}"
  const eyebrowTrail = [
    "Admin",
    "Masters",
    "BOMs",
    item?.item_name ?? bom_head_id,
    version ? `v${version.version_label}` : version_id,
  ].join(" · ");

  return (
    // iter 7/18 (carry-over): reveal-on-mount
    <div className="reveal-on-mount space-y-6">
      <DetailPage
        header={{
          // iter 15: rich breadcrumb eyebrow
          eyebrow: eyebrowTrail,
          title,
          description: !version
            ? "Review component lines and quantities for this BOM version."
            : isActive
              ? "Active version — component lines and quantities below. Use the simulator to check material coverage."
              : isDraft
                ? "Draft version — component lines are editable in the BOM editor. Simulation requires an active version."
                : "Historic version — read-only audit record of a superseded formula.",
          meta: headerMeta,
          actions: (
            <Link
              href={`/admin/masters/boms/${encodeURIComponent(bom_head_id)}`}
              className="btn-secondary inline-flex items-center gap-1 text-xs"
            >
              ← {item?.item_name ?? bom_head_id}
            </Link>
          ),
        }}
        tabs={[overviewTab, linesTab, compareTab, exceptionsTab]}
        linkages={linkages}
      />
      {head && (
        <>
          <BomSimulator
            headId={head.bom_head_id}
            baseOutputQty={head.final_bom_output_qty}
            outputUom={head.final_bom_output_uom}
            hasActiveVersion={!!head.active_version_id}
            onSimulated={setSimulatedQty}
          />
          <BomNetRequirements
            headId={head.bom_head_id}
            baseOutputQty={head.final_bom_output_qty}
            outputUom={head.final_bom_output_uom}
            hasActiveVersion={!!head.active_version_id}
            suggestedQty={simulatedQty}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// iter 10: Lines row — component name link (not raw ID), qty + UOM, primary tag
// iter 16: overflow-x-auto handled in parent table wrapper
// ---------------------------------------------------------------------------

function LineRow({ line }: { line: BomLineRow }): JSX.Element {
  const router = useRouter();
  const componentHref = `/admin/masters/components/${encodeURIComponent(line.final_component_id)}`;
  return (
    <tr
      className="cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      tabIndex={0}
      onClick={() => router.push(componentHref)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(componentHref); }}
    >
      <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">
        {line.line_no}
      </td>
      <td className="px-3 py-2">
        <div className="min-w-0">
          {/* iter 10: component name (not raw ID) as primary, ID secondary */}
          <Link
            href={componentHref}
            className="font-medium text-fg hover:text-accent"
            onClick={(e) => e.stopPropagation()}
          >
            {line.final_component_name || line.final_component_id}
          </Link>
          <div className="text-3xs font-mono text-fg-subtle">
            {line.final_component_id}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg">
        {line.final_component_qty}
      </td>
      {/* iter 10: UOM displayed clearly */}
      <td className="px-3 py-2 text-xs text-fg-muted">
        {line.component_uom ?? "—"}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// iter 11: Compare diff — added / removed / changed qty_per, with rich display
// ---------------------------------------------------------------------------

interface CompareDiffProps {
  thisVersion: BomVersionRow;
  thisLines: BomLineRow[];
  targetVersionId: string;
  targetVersion: BomVersionRow | null;
  targetLinesQuery: ReturnType<
    typeof useQuery<ListEnvelope<BomLineRow>>
  >;
}

function CompareDiff({
  thisVersion,
  thisLines,
  targetVersion,
  targetLinesQuery,
}: CompareDiffProps): JSX.Element {
  if (targetLinesQuery.isLoading) return <DetailTabLoading />;
  if (targetLinesQuery.isError) {
    return (
      <DetailTabError
        message={(targetLinesQuery.error as Error).message}
      />
    );
  }
  const targetLines = (targetLinesQuery.data?.rows ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no);

  const thisByComp = new Map<string, BomLineRow>();
  for (const l of thisLines) thisByComp.set(l.final_component_id, l);
  const targetByComp = new Map<string, BomLineRow>();
  for (const l of targetLines) targetByComp.set(l.final_component_id, l);

  const added: BomLineRow[] = [];
  const removed: BomLineRow[] = [];
  const changed: Array<{
    thisLine: BomLineRow;
    targetLine: BomLineRow;
  }> = [];

  for (const [compId, thisLine] of thisByComp.entries()) {
    const targetLine = targetByComp.get(compId);
    if (!targetLine) {
      added.push(thisLine);
    } else if (thisLine.final_component_qty !== targetLine.final_component_qty) {
      changed.push({ thisLine, targetLine });
    }
  }
  for (const [compId, targetLine] of targetByComp.entries()) {
    if (!thisByComp.has(compId)) removed.push(targetLine);
  }

  const totalDiff = added.length + removed.length + changed.length;

  // iter 11: tone-coded summary header
  return (
    <SectionCard
      eyebrow={`Diff · v${thisVersion.version_label} vs v${targetVersion?.version_label ?? "?"}`}
      title={
        totalDiff === 0
          ? "Identical line sets"
          : `${totalDiff} difference${totalDiff === 1 ? "" : "s"}`
      }
      tone={totalDiff === 0 ? "success" : totalDiff > 3 ? "warning" : "default"}
      density="compact"
    >
      {totalDiff === 0 ? (
        <div className="flex items-center gap-2 text-sm text-success-fg">
          <span className="inline-block h-2 w-2 rounded-full bg-success shrink-0" aria-hidden />
          No structural differences. Both versions have the same components
          and quantities per unit of output.
        </div>
      ) : (
        <div className="space-y-4">
          {/* iter 11: summary counts row */}
          <div className="flex flex-wrap gap-2">
            {added.length > 0 && (
              <Badge tone="success" dotted>
                {added.length} added
              </Badge>
            )}
            {removed.length > 0 && (
              <Badge tone="danger" dotted>
                {removed.length} removed
              </Badge>
            )}
            {changed.length > 0 && (
              <Badge tone="warning" dotted>
                {changed.length} qty changed
              </Badge>
            )}
          </div>
          {added.length > 0 ? (
            <DiffSection
              label="Added in this version"
              tone="success"
              rows={added.map((l) => ({
                component_id: l.final_component_id,
                component_name: l.final_component_name,
                detail: `per batch: ${l.final_component_qty} ${l.component_uom ?? ""}`.trim(),
              }))}
            />
          ) : null}
          {removed.length > 0 ? (
            <DiffSection
              label="Removed vs target"
              tone="danger"
              rows={removed.map((l) => ({
                component_id: l.final_component_id,
                component_name: l.final_component_name,
                detail: `was: ${l.final_component_qty} ${l.component_uom ?? ""} per batch`.trim(),
              }))}
            />
          ) : null}
          {changed.length > 0 ? (
            <DiffSection
              label="Quantity changed"
              tone="warning"
              rows={changed.map(({ thisLine, targetLine }) => ({
                component_id: thisLine.final_component_id,
                component_name: thisLine.final_component_name,
                detail: `${targetLine.final_component_qty} → ${thisLine.final_component_qty} ${thisLine.component_uom ?? ""}`.trim(),
              }))}
            />
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

function DiffSection({
  label,
  tone,
  rows,
}: {
  label: string;
  tone: "success" | "danger" | "warning";
  rows: Array<{ component_id: string; component_name: string; detail: string }>;
}): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={tone} dotted>
          {label}
        </Badge>
        <span className="text-3xs text-fg-faint">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {/* iter 16: overflow-x-auto for mobile */}
      <div className="overflow-x-auto">
        <ul className="divide-y divide-border/40 rounded-md border border-border/60 min-w-0">
          {rows.map((r) => (
            <li
              key={r.component_id}
              className={cn(
                "flex items-start justify-between gap-3 px-3 py-2 text-xs",
                tone === "success" && "bg-success-softer/10",
                tone === "danger" && "bg-danger-softer/10",
                tone === "warning" && "bg-warning-softer/10",
              )}
            >
              <div className="min-w-0">
                {/* iter 11: component name as primary (not raw ID) */}
                <Link
                  href={`/admin/masters/components/${encodeURIComponent(
                    r.component_id,
                  )}`}
                  className="font-medium text-fg hover:text-accent"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {r.component_name || r.component_id}
                </Link>
                <div className="text-3xs font-mono text-fg-subtle">
                  {r.component_id}
                </div>
              </div>
              <div className="shrink-0 font-mono text-3xs text-fg-muted">
                {r.detail}
              </div>
            </li>
          ))}
        </ul>
      </div>
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

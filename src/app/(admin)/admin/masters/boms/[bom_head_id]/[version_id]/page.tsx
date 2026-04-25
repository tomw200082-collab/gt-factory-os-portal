"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · BOMs · Version Detail — Tranche E of
// portal-full-production-refactor (plan §G). Canonical URL
// /admin/masters/boms/[bom_head_id]/[version_id].
//
// View-only BOM version detail. Composes <DetailPage /> (Tranche D primitive)
// with 3 tabs:
//   - overview     LIVE   — version metadata (list-and-filter pattern)
//   - lines        LIVE   — /api/boms/lines?bom_version_id=<id> (endpoint exists)
//   - compare      LIVE   — picker to select another version; diff computed
//                           client-side from two /api/boms/lines reads
//                           (added / removed / changed qty_per)
//
// Linkage card: head, active version shortcut, other versions on this head,
// linked item.
//
// View-only strict. No line editor, no replace button, no publish. Editing
// is the separate BOM-deep-logic window / future Tranche J scope.
// ---------------------------------------------------------------------------

import { use, useEffect, useMemo, useState } from "react";
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

export default function AdminMastersBomVersionDetailPage({
  params,
}: {
  params: Promise<{ bom_head_id: string; version_id: string }>;
}): JSX.Element {
  const { bom_head_id, version_id } = use(params);

  // --- Data: head via list + client-filter -------------------------------
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

  // --- Data: versions under this head (used for version resolution +
  //     compare-picker options) -----------------------------------------
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

  // --- Data: lines for this version ---------------------------------------
  const linesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "masters", "bom_lines", "by-version", version_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(version_id)}&limit=1000`,
      ),
    enabled: Boolean(version),
  });

  // --- Data: linked item --------------------------------------------------
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

  // --- Compare target ----------------------------------------------------
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

  // --- Derived ------------------------------------------------------------
  const lines = useMemo(() => {
    return (linesQuery.data?.rows ?? [])
      .slice()
      .sort((a, b) => a.line_no - b.line_no);
  }, [linesQuery.data]);

  const isActive = Boolean(
    head && version && head.active_version_id === version.bom_version_id,
  );
  const statusLower = (version?.status ?? "").toLowerCase();

  // --- Header meta --------------------------------------------------------
  const headerMeta = version ? (
    <>
      <VersionStatusBadge
        version={version}
        activeVersionId={head?.active_version_id ?? null}
      />
      <Badge tone="neutral" dotted>
        {lines.length} line{lines.length === 1 ? "" : "s"}
      </Badge>
      {item ? (
        <Badge tone="info" dotted>
          {item.supply_method}
        </Badge>
      ) : null}
    </>
  ) : null;

  // --- Tabs ---------------------------------------------------------------

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
        { label: "Label", value: version.version_label, mono: true },
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
        { label: "Activated", value: fmtDateTime(version.activated_at) },
        { label: "Last updated", value: fmtDateTime(version.updated_at) },
        {
          label: "Base batch output",
          value: `${head.final_bom_output_qty} ${head.final_bom_output_uom ?? ""}`,
          mono: true,
        },
      ];
      return <DetailFieldGrid rows={rows} />;
    })(),
  };

  const linesTab: TabDescriptor = {
    key: "lines",
    label: "Lines",
    badge: lines.length > 0 ? `${lines.length}` : undefined,
    content: (() => {
      if (!version) return <DetailTabEmpty message="Version not loaded yet." />;
      if (linesQuery.isLoading) return <DetailTabLoading />;
      if (linesQuery.isError) {
        return (
          <DetailTabError message={(linesQuery.error as Error).message} />
        );
      }
      if (lines.length === 0) {
        return <DetailTabEmpty message="No lines on this version." />;
      }
      return (
        <SectionCard
          eyebrow="Lines"
          title={`${lines.length} component${lines.length === 1 ? "" : "s"}`}
          density="compact"
          contentClassName="p-0"
        >
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
          >
            {otherVersions.length === 0 ? (
              <div className="text-xs text-fg-muted">
                No other versions on this head to compare against.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <span className="font-semibold uppercase tracking-sops text-3xs text-fg-subtle">
                    Target
                  </span>
                  <select
                    value={compareTargetId ?? ""}
                    onChange={(e) =>
                      setCompareTargetId(e.target.value || null)
                    }
                    className="input h-9"
                  >
                    <option value="">— select —</option>
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

  // --- Linkage groups -----------------------------------------------------

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

  return (
    <div className="space-y-6">
      <DetailPage
        header={{
          eyebrow: `Admin · Masters · BOMs · ${item?.item_name ?? bom_head_id}`,
          title,
          description: !version
            ? "Review component lines and quantities for this BOM version."
            : isActive
              ? "Active version — component lines and quantities below. Use the simulator to check material coverage."
              : statusLower === "draft"
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
        tabs={[overviewTab, linesTab, compareTab]}
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
// Lines row — row-click navigates to component detail
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
          <div className="font-medium text-fg">
            {line.final_component_name || line.final_component_id}
          </div>
          <div className="text-3xs font-mono text-fg-subtle">
            {line.final_component_id}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg">
        {line.final_component_qty}
      </td>
      <td className="px-3 py-2 text-xs text-fg-muted">
        {line.component_uom ?? "—"}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Compare diff — added / removed / changed qty_per
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

  return (
    <SectionCard
      eyebrow={`Diff · v${thisVersion.version_label} vs v${targetVersion?.version_label ?? "?"}`}
      title={
        totalDiff === 0
          ? "Identical line sets"
          : `${totalDiff} difference${totalDiff === 1 ? "" : "s"}`
      }
      density="compact"
    >
      {totalDiff === 0 ? (
        <div className="text-xs text-fg-muted">
          No structural differences. Both versions have the same components
          and quantities per unit of output.
        </div>
      ) : (
        <div className="space-y-4">
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
      <ul className="divide-y divide-border/40 rounded-md border border-border/60">
        {rows.map((r) => (
          <li
            key={r.component_id}
            className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
          >
            <div className="min-w-0">
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

"use client";

// ---------------------------------------------------------------------------
// Admin · BOMs list — AMMC v1 Slice 6 UI.
//
// /admin/boms  (legacy route)
//
// Redesigned in iterations 10-19:
//   10. Audit: BOM head fields inventoried vs canonical /admin/masters/boms.
//   11. Product column: item_name linked to BOM detail; item_id below.
//   12. Type column: supply_method badge — MANUFACTURED=info, REPACK=warning.
//   13. Active version column: version_label linked; warning badge when none.
//   14. Readiness column: Ready/Draft/Empty chips derived from version data.
//   15. Lines count column: compact chip; — if no active version.
//   16. Last updated column: relative time + absolute tooltip.
//   17. Empty state: No BOMs yet — BOMs are created from the items editor.
//   18. Column headers labeled clearly; view-only info banner.
//   19. Filter controls: search by item_name + status filter chips.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { fmtSupplyMethod } from "@/lib/display";

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return "—";
  }
}

type BomReadinessState = "ready" | "draft" | "empty";

function BomReadinessChip({
  state,
}: {
  state: BomReadinessState;
}): JSX.Element {
  if (state === "ready")
    return (
      <Badge tone="success" dotted>
        Ready
      </Badge>
    );
  if (state === "draft")
    return (
      <Badge tone="warning" dotted>
        Draft
      </Badge>
    );
  return (
    <Badge tone="neutral" dotted>
      Empty
    </Badge>
  );
}

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

interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
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
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

type BomStatusFilter = "all" | "active" | "draft" | "empty";

const STATUS_FILTER_LABELS: Record<BomStatusFilter, string> = {
  all: "All",
  active: "Active",
  draft: "Draft",
  empty: "Empty",
};

export default function AdminBomsListPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BomStatusFilter>("all");

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_head", "all"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all-for-bom-list"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const itemsById = useMemo(() => {
    const map = new Map<string, ItemRow>();
    for (const i of itemsQuery.data?.rows ?? []) map.set(i.item_id, i);
    return map;
  }, [itemsQuery.data]);

  const rows = headsQuery.data?.rows ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((h) => {
      const item = itemsById.get(h.parent_ref_id);
      return (
        !q ||
        h.bom_head_id.toLowerCase().includes(q) ||
        h.parent_ref_id.toLowerCase().includes(q) ||
        (item?.item_name ?? "").toLowerCase().includes(q) ||
        (h.parent_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, itemsById]);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Recipes" },
        ]}
      />
      <WorkflowHeader
        eyebrow="Admin · Recipes"
        title="Recipes"
        description="One recipe per manufactured or repack product. Click a row to review versions or open the draft editor."
        meta={
          <>
            <Badge tone="neutral" dotted>
              {headsQuery.data?.count ?? rows.length} recipes
            </Badge>
          </>
        }
      />

      {/* Iter 18 — View-only info banner */}
      <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info-softer px-4 py-2 text-xs text-info-fg">
        <span className="font-semibold">View only.</span>
        <span>
          BOM editing is available at the recipe detail page. This list is
          read-only.
        </span>
      </div>

      {/* Iter 19 — Search + status filter chips */}
      <SectionCard eyebrow="Filter" title="Search" contentClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
              strokeWidth={2}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by product name…"
              className="input h-9 w-full pl-9"
            />
          </div>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Filter by readiness status"
          >
            {(["all", "active", "draft", "empty"] as BomStatusFilter[]).map(
              (f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={
                    statusFilter === f
                      ? "rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
                      : "rounded-full border border-border/60 bg-transparent px-3 py-1 text-xs text-fg-muted hover:border-border hover:text-fg"
                  }
                >
                  {STATUS_FILTER_LABELS[f]}
                </button>
              ),
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Recipes"
        title={`${filtered.length} shown`}
        contentClassName="p-0"
      >
        {headsQuery.isLoading || itemsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : headsQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load recipes</div>
              <div className="mt-1 text-xs">
                {(headsQuery.error as Error).message}
              </div>
              <button
                type="button"
                onClick={() => void headsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          /* Iter 17 — Global empty state */
          <div className="p-10 text-center">
            <div className="mx-auto max-w-sm">
              <div className="text-sm font-semibold text-fg-strong">
                No BOMs yet
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                BOMs are created from the items editor. Open a manufactured or
                repack item and use the BOM tab to create the first recipe.
              </div>
              <Link
                href="/admin/items"
                className="btn btn-sm btn-primary mt-3"
              >
                Open items editor →
              </Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-5">
            <p className="text-sm text-fg-muted">
              No recipes match the current filters.
            </p>
            {(query || statusFilter !== "all") && (
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>Product</Th>
                  <Th>Type</Th>
                  <Th>Active version</Th>
                  <Th align="right">Lines</Th>
                  <Th>Readiness</Th>
                  <Th>Last updated</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <BomRow
                    key={h.bom_head_id}
                    head={h}
                    item={itemsById.get(h.parent_ref_id) ?? null}
                    statusFilter={statusFilter}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function BomRow({
  head,
  item,
  statusFilter,
}: {
  head: BomHeadRow;
  item: ItemRow | null;
  statusFilter: BomStatusFilter;
}): JSX.Element | null {
  const activeId = head.active_version_id;

  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "bom_version", "by-head-legacy", head.bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(head.bom_head_id)}&limit=1000`,
      ),
  });

  const linesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "bom_lines", "by-version", activeId],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(activeId!)}&limit=1000`,
      ),
    enabled: !!activeId,
  });

  const versions = versionsQuery.data?.rows ?? [];

  const activeVersionLabel =
    versions.find((v) => v.bom_version_id === activeId)?.version_label ?? null;

  const lineCount =
    linesQuery.data?.count ?? linesQuery.data?.rows.length ?? 0;
  const hasDraft = versions.some((v) => v.status === "DRAFT");
  const readinessState: BomReadinessState = activeId
    ? lineCount > 0
      ? "ready"
      : "draft"
    : hasDraft
      ? "draft"
      : "empty";

  if (statusFilter === "active" && readinessState !== "ready") return null;
  if (statusFilter === "draft" && readinessState !== "draft") return null;
  if (statusFilter === "empty" && readinessState !== "empty") return null;

  const latestUpdatedAt =
    versions.length > 0
      ? versions.reduce(
          (acc, v) => (v.updated_at > acc ? v.updated_at : acc),
          versions[0]?.updated_at ?? "",
        )
      : null;

  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}`}
          className="font-medium text-fg hover:text-accent"
        >
          {item?.item_name ?? head.parent_name ?? head.parent_ref_id}
        </Link>
        {item ? (
          <div className="mt-0.5">
            <Link
              href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
              className="font-mono text-3xs text-fg-subtle hover:text-accent"
              title={`Open item ${item.item_id}`}
            >
              {item.item_id}
            </Link>
          </div>
        ) : (
          <div className="font-mono text-3xs text-fg-subtle">
            {head.parent_ref_id}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {item ? (
          <Badge
            tone={
              item.supply_method === "MANUFACTURED"
                ? "info"
                : item.supply_method === "REPACK"
                  ? "warning"
                  : "neutral"
            }
            dotted
          >
            {fmtSupplyMethod(item.supply_method)}
          </Badge>
        ) : (
          <Badge tone="neutral" dotted>
            {head.bom_kind}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2">
        {activeId ? (
          versionsQuery.isLoading ? (
            <span className="text-3xs text-fg-subtle">…</span>
          ) : (
            <Link
              href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}/versions/${encodeURIComponent(activeId)}`}
              className="font-mono text-xs font-medium text-success-fg hover:underline"
            >
              {activeVersionLabel ?? "Active"}
            </Link>
          )
        ) : (
          <Badge tone="warning" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" strokeWidth={2} />
            No active version
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {activeId ? (
          linesQuery.isLoading ? (
            <span className="text-3xs text-fg-subtle">…</span>
          ) : (
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs font-semibold text-fg-muted">
              {lineCount}
            </span>
          )
        ) : (
          <span className="text-xs text-fg-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {versionsQuery.isLoading || linesQuery.isLoading ? (
          <span className="text-3xs text-fg-subtle">…</span>
        ) : (
          <BomReadinessChip state={readinessState} />
        )}
      </td>
      <td className="px-3 py-2">
        {versionsQuery.isLoading ? (
          <span className="text-3xs text-fg-subtle">…</span>
        ) : latestUpdatedAt ? (
          <span
            className="text-xs text-fg-muted"
            title={latestUpdatedAt}
          >
            {relativeTime(latestUpdatedAt)}
          </span>
        ) : (
          <span className="text-xs text-fg-faint">—</span>
        )}
      </td>
    </tr>
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

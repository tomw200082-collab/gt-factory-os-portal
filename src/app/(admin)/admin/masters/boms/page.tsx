"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · BOMs · List — Tranche E of portal-full-production-refactor
// (plan §G). Canonical URL /admin/masters/boms.
//
// View-only BOM browser. Editing lives at the legacy /admin/boms/* AMMC
// slice 6 surfaces and is explicitly out of scope per plan §G (editing is
// owned by the separate BOM-deep-logic window / future Tranche J).
//
// Consumed backend surfaces (all verified-existing in Tranche D; none
// invented):
//   GET /api/boms/heads?limit=1000
//   GET /api/boms/versions?bom_head_id=<id>   (per-row version count)
//   GET /api/items?limit=1000                 (item_name lookup)
//
// Columns: item (linked to /admin/masters/items/<item_id>), bom_head_id,
// supply_method badge, active_version_id (short), version count, status.
// Row click → /admin/masters/boms/<bom_head_id>.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Search } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

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

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMastersBomsListPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "masters", "bom_head", "all"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "masters", "items", "all-for-bom-list"],
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
      if (statusFilter === "active" && !h.active_version_id) return false;
      if (statusFilter === "inactive" && h.active_version_id) return false;
      if (!q) return true;
      const item = itemsById.get(h.parent_ref_id);
      return (
        h.bom_head_id.toLowerCase().includes(q) ||
        h.parent_ref_id.toLowerCase().includes(q) ||
        (item?.item_name ?? "").toLowerCase().includes(q) ||
        (h.display_family ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, itemsById, statusFilter]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · Masters"
        title="Bills of materials"
        description="View-only BOM browser. One BOM head per manufactured / repack item. Click a row to review versions and lines."
        meta={
          <>
            <Badge tone="neutral" dotted>
              {headsQuery.data?.count ?? rows.length} heads
            </Badge>
            <Badge tone="info" dotted>
              view-only
            </Badge>
          </>
        }
      />

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
              placeholder="Filter by head id, item id, item name, or family…"
              className="input h-9 w-full pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="font-semibold uppercase tracking-sops text-3xs text-fg-subtle">
              Active
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input h-9"
            >
              <option value="all">All heads</option>
              <option value="active">With active version</option>
              <option value="inactive">No active version</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="BOM heads"
        title={`${filtered.length} shown`}
        contentClassName="p-0"
      >
        {headsQuery.isLoading || itemsQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading BOM heads…</div>
        ) : headsQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(headsQuery.error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">No BOM heads match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>BOM / Item</Th>
                  <Th align="right">Output</Th>
                  <Th>Type</Th>
                  <Th>Active version</Th>
                  <Th align="right">Versions</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <BomHeadListRow
                    key={h.bom_head_id}
                    head={h}
                    item={itemsById.get(h.parent_ref_id) ?? null}
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

// ---------------------------------------------------------------------------
// Row (per-row version count + item link)
// ---------------------------------------------------------------------------

function BomHeadListRow({
  head,
  item,
}: {
  head: BomHeadRow;
  item: ItemRow | null;
}): JSX.Element {
  const router = useRouter();
  const bomHref = `/admin/masters/boms/${encodeURIComponent(head.bom_head_id)}`;

  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "masters", "bom_version", "by-head", head.bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(head.bom_head_id)}&limit=1000`,
      ),
  });

  const versionCount =
    versionsQuery.data?.count ?? versionsQuery.data?.rows.length ?? null;

  const activeVersionLabel = versionsQuery.data?.rows.find(
    (v) => v.bom_version_id === head.active_version_id,
  )?.version_label ?? null;

  const displayName =
    item?.item_name ?? head.parent_name ?? head.parent_ref_id;

  return (
    <tr
      className="cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
      onClick={() => router.push(bomHref)}
    >
      {/* BOM / Item — whole row clicks to BOM head; item external-links separately */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-fg">{displayName}</span>
          {item && (
            <Link
              href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
              className="shrink-0 text-fg-faint hover:text-accent"
              title={`Open item ${item.item_id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          )}
        </div>
        <div className="text-3xs font-mono text-fg-subtle">
          {head.bom_head_id}
        </div>
      </td>
      {/* Output — what this BOM produces */}
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
        {head.final_bom_output_qty}
        {head.final_bom_output_uom ? (
          <span className="ml-1 font-sans text-3xs text-fg-subtle">
            {head.final_bom_output_uom}
          </span>
        ) : null}
      </td>
      {/* Type badge */}
      <td className="px-3 py-2">
        {item ? (
          <Badge tone="info" dotted>
            {item.supply_method}
          </Badge>
        ) : (
          <Badge tone="neutral" dotted>
            {head.bom_kind}
          </Badge>
        )}
      </td>
      {/* Active version — show human-readable label, not UUID */}
      <td className="px-3 py-2">
        {head.active_version_id ? (
          versionsQuery.isLoading ? (
            <span className="text-3xs text-fg-subtle">…</span>
          ) : (
            <Link
              href={`${bomHref}/${encodeURIComponent(head.active_version_id)}`}
              className="font-mono text-xs font-medium text-success-fg hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {activeVersionLabel ?? head.active_version_id.slice(0, 8)}
            </Link>
          )
        ) : (
          <Badge tone="warning" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" strokeWidth={2} />
            No active
          </Badge>
        )}
      </td>
      {/* Version count */}
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
        {versionsQuery.isLoading ? (
          <span className="text-3xs text-fg-subtle">…</span>
        ) : versionCount === null ? (
          "—"
        ) : (
          versionCount
        )}
      </td>
      <td className="px-3 py-2">
        <Badge tone="neutral" dotted>
          {head.status}
        </Badge>
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

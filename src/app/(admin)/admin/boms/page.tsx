"use client";

// ---------------------------------------------------------------------------
// Admin · BOMs list — AMMC v1 Slice 6 UI (un-quarantine).
//
// /admin/boms
//
// Lists bom_head rows with:
//   - bom_head_id (short) + item linkage (item_id, item_name resolved
//     client-side via /api/items list)
//   - supply_method badge (MANUFACTURED / REPACK)
//   - active_version_id (or "No active" warning)
//   - line count of active version (resolved client-side via /api/boms/lines)
//   - readiness pill (via /api/boms/versions/[active_version_id]/readiness)
//
// Row click → /admin/boms/[head_id] (version list + New draft).
//
// Backend surfaces consumed:
//   - GET /api/boms/heads?limit=1000
//   - GET /api/items?limit=1000            (item_name lookup)
//   - GET /api/boms/versions/[id]/readiness (per row; enabled when active)
//   - GET /api/boms/lines?bom_version_id=  (per row line count)
//
// A13 §1 simplification: row-level readiness + line-count probes are fired
// per-visible-row via TanStack Query with TTL — small catalog (<100 items)
// keeps this cheap. If the catalog grows, backend can be extended with an
// `?include_active_summary=true` flag on /api/boms/heads.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";

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

interface ReadinessPayload {
  is_ready?: boolean;
  blockers?: unknown[];
}

interface BomLineRow {
  line_id: string;
  bom_version_id: string;
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

export default function AdminBomsListPage(): JSX.Element {
  const [query, setQuery] = useState("");

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
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((h) => {
      const item = itemsById.get(h.parent_ref_id);
      return (
        h.bom_head_id.toLowerCase().includes(q) ||
        h.parent_ref_id.toLowerCase().includes(q) ||
        (item?.item_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, itemsById]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · BOMs"
        title="Bills of materials"
        description="One BOM head per manufactured / repack item. Click a row to review versions or open the draft editor."
        meta={
          <>
            <Badge tone="neutral" dotted>
              {headsQuery.data?.count ?? rows.length} heads
            </Badge>
          </>
        }
      />

      <SectionCard
        eyebrow="Filter"
        title="Search"
        contentClassName="p-4"
      >
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
            strokeWidth={2}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by head id, item id, or item name…"
            className="input h-9 w-full pl-9"
          />
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
                  <Th>Item</Th>
                  <Th>BOM head</Th>
                  <Th>Supply method</Th>
                  <Th>Active version</Th>
                  <Th align="right">Lines</Th>
                  <Th>Readiness</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <BomHeadRow
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

function BomHeadRow({
  head,
  item,
}: {
  head: BomHeadRow;
  item: ItemRow | null;
}): JSX.Element {
  const activeId = head.active_version_id;

  const readinessQuery = useQuery<ReadinessPayload>({
    queryKey: ["admin", "bom_version", activeId, "readiness"],
    queryFn: () =>
      fetchJson(`/api/boms/versions/${encodeURIComponent(activeId!)}/readiness`),
    enabled: !!activeId,
  });

  const linesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "bom_lines", "by-version", activeId],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(activeId!)}&limit=1000`,
      ),
    enabled: !!activeId,
  });

  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}`}
          className="font-medium text-fg hover:text-accent"
        >
          {item?.item_name ?? head.parent_name ?? head.parent_ref_id}
        </Link>
        <div className="text-3xs font-mono text-fg-subtle">
          {head.parent_ref_id}
        </div>
      </td>
      <td className="px-3 py-2 text-xs font-mono text-fg-muted">
        <Link
          href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}`}
          className="hover:text-accent"
        >
          {head.bom_head_id}
        </Link>
      </td>
      <td className="px-3 py-2">
        {item ? (
          <Badge tone="info" dotted>
            {item.supply_method}
          </Badge>
        ) : (
          <span className="text-3xs text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {activeId ? (
          <span className="font-mono text-3xs text-fg-muted">
            {activeId.slice(0, 8)}…
          </span>
        ) : (
          <Badge tone="warning" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" /> No active
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
        {activeId ? (
          linesQuery.isLoading ? (
            <span className="text-3xs text-fg-subtle">…</span>
          ) : (
            (linesQuery.data?.count ?? linesQuery.data?.rows.length ?? 0)
          )
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2">
        {activeId ? (
          readinessQuery.isLoading ? (
            <span className="text-3xs text-fg-subtle">…</span>
          ) : (
            <ReadinessPill readiness={readinessQuery.data ?? null} />
          )
        ) : (
          <ReadinessPill readiness={null} />
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

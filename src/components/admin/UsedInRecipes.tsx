"use client";

import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  DetailTabLoading,
  DetailTabError,
  DetailTabEmpty,
} from "@/components/patterns/DetailPage";

// ---------------------------------------------------------------------------
// UsedInRecipes — "which active recipes use this master?" tab.
//
// Shape:
//   <UsedInRecipes component_id={...} />   -> recipes that consume this component
//   <UsedInRecipes item_id={...} />        -> recipes that consume this item
//
// Implementation: client-side fan-out across active BOM heads, parallelized
// via useQueries. The previous 50-head cap (which surfaced as "Contract
// Gap #1") has been removed — Tom now has >50 active BOM heads, and the
// upstream /api/v1/queries/boms/lines endpoint requires `bom_version_id`
// per call, so per-version fan-out is the only available path until a
// dedicated `final_component_id` filter ships upstream. useQueries
// isolates per-version failures, so one slow/failed version no longer
// blocks the whole tab; partial results render with a soft warning.
//
// Items: the locked schema (`bom_lines.final_component_id`) only references
// components, never items. REPACK BOMs consume a component as input. So
// when called with `item_id`, this component renders an empty state by
// design — it is a legitimate "this item is not used as an input in any
// recipe", not a bug.
// ---------------------------------------------------------------------------

// Heads list cap. Matches the limit used by other admin BOM pages
// (/admin/boms, /admin/boms/[head_id]). Tom's factory has well under
// 1000 active BOM heads, so this is effectively unbounded for v1.
const HEAD_LIST_LIMIT = 1000;
// Lines per version cap. Same convention as the BOM detail pages.
const LINES_PER_VERSION_LIMIT = 1000;

interface BomHeadRow {
  bom_head_id: string;
  parent_ref_id: string;
  parent_name: string | null;
  active_version_id: string | null;
  bom_kind: string;
  final_bom_output_qty: string;
  final_bom_output_uom: string | null;
}

interface BomLineRow {
  line_id: string;
  bom_version_id: string;
  line_no: number;
  final_component_id: string;
  final_component_name: string;
  final_component_qty: string;
  component_uom: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Discriminated-union props: caller passes exactly one of component_id /
// item_id. Both surfaces share the same fan-out scaffold; the items path
// short-circuits to empty because the BOM line schema only carries
// final_component_id.
export type UsedInRecipesProps =
  | { component_id: string; item_id?: never }
  | { item_id: string; component_id?: never };

export function UsedInRecipes(props: UsedInRecipesProps): JSX.Element {
  // Items are not referenced by bom_lines.final_component_id in the locked
  // schema, so the answer for an item is always "none". We still call all
  // hooks below (Rules of Hooks) but disable the network so React Query
  // does no work, then short-circuit the render.
  const isItemMode = "item_id" in props && props.item_id != null;
  const componentId = "component_id" in props ? props.component_id : null;

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_heads", "all-for-usage"],
    queryFn: () => fetchJson(`/api/boms/heads?limit=${HEAD_LIST_LIMIT}`),
    staleTime: 5 * 60 * 1000,
    enabled: !isItemMode,
  });

  const heads = headsQuery.data?.rows ?? [];
  const activeHeads = heads.filter((h) => h.active_version_id != null);

  const lineQueries = useQueries({
    queries: activeHeads.map((h) => ({
      queryKey: ["admin", "bom_lines", "by-version", h.active_version_id],
      queryFn: () =>
        fetchJson<ListEnvelope<BomLineRow>>(
          `/api/boms/lines?bom_version_id=${encodeURIComponent(h.active_version_id!)}&limit=${LINES_PER_VERSION_LIMIT}`,
        ),
      staleTime: 5 * 60 * 1000,
      enabled: !isItemMode,
    })),
  });

  if (isItemMode) {
    return (
      <DetailTabEmpty message="This item is not used as an input in any active recipe." />
    );
  }

  if (headsQuery.isLoading) return <DetailTabLoading />;
  if (headsQuery.isError) {
    return <DetailTabError message={(headsQuery.error as Error).message} />;
  }

  // Wait for at least the first paint of every line query before deciding
  // "no matches". Using `isPending` (not `isLoading`) so we don't block
  // forever on retries.
  const anyPending = lineQueries.some((q) => q.isPending);
  if (anyPending) return <DetailTabLoading />;

  // Collect partial-failure context. We render whatever succeeded plus a
  // soft warning so a single failed version doesn't blank the whole tab.
  const failedCount = lineQueries.filter((q) => q.isError).length;

  const matches: Array<{ head: BomHeadRow; line: BomLineRow }> = [];
  for (let i = 0; i < activeHeads.length; i++) {
    const head = activeHeads[i]!;
    const lines = lineQueries[i]?.data?.rows ?? [];
    for (const line of lines) {
      if (line.final_component_id === componentId) {
        matches.push({ head, line });
      }
    }
  }

  if (matches.length === 0) {
    if (failedCount > 0) {
      return (
        <DetailTabError
          message={`Could not load lines for ${failedCount} of ${activeHeads.length} active recipes. No usage of this component was found in the recipes that did load.`}
        />
      );
    }
    return (
      <DetailTabEmpty message="This component is not used in any active recipe." />
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {failedCount > 0 ? (
        <div className="px-1 py-2 text-xs text-warning-fg">
          Note: lines for {failedCount} of {activeHeads.length} active recipes
          could not be loaded. Results below may be incomplete.
        </div>
      ) : null}
      {matches.map(({ head, line }) => (
        <div
          key={`${head.bom_head_id}-${line.line_id}`}
          className="flex items-start justify-between gap-3 px-1 py-2.5 text-sm"
        >
          <div className="min-w-0">
            <Link
              href={`/admin/masters/boms/${encodeURIComponent(head.bom_head_id)}`}
              className="font-medium text-accent hover:underline"
            >
              {head.parent_name ?? head.parent_ref_id}
            </Link>
            <p className="text-xs text-fg-muted">
              <span className="font-mono">{head.bom_kind}</span>
              {" · ref "}
              <span className="font-mono">
                {head.active_version_id?.slice(0, 8) ?? "—"}
              </span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="font-mono text-sm text-fg-strong">
              {line.final_component_qty}
            </span>
            {line.component_uom ? (
              <span className="ml-1 text-xs text-fg-muted">
                {line.component_uom}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

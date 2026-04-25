"use client";

import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  DetailTabLoading,
  DetailTabError,
  DetailTabEmpty,
} from "@/components/patterns/DetailPage";

// ---------------------------------------------------------------------------
// UsedInRecipes — client-side fallback for "which active recipes use this
// component?". Works by fetching all BOM heads then all active-version lines
// in parallel. Capped at MAX_HEADS; above that, shows Contract Gap #1 notice.
//
// Contract Gap #1: GET /api/components/:id/used-in-recipes is the backend
// endpoint needed to replace this client-side fan-out. Until it ships, this
// component provides functional (if slightly expensive) coverage.
// ---------------------------------------------------------------------------

const MAX_HEADS = 50;

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

interface UsedInRecipesProps {
  component_id: string;
}

export function UsedInRecipes({ component_id }: UsedInRecipesProps) {
  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_heads", "all-for-usage"],
    queryFn: () =>
      fetchJson(`/api/boms/heads?limit=${MAX_HEADS + 1}`),
    staleTime: 5 * 60 * 1000,
  });

  const heads = headsQuery.data?.rows ?? [];
  const totalHeads = headsQuery.data?.count ?? 0;
  const tooMany = totalHeads > MAX_HEADS;

  const activeHeads = heads.filter((h) => h.active_version_id != null);

  const lineQueries = useQueries({
    queries: activeHeads.map((h) => ({
      queryKey: ["admin", "bom_lines", "by-version", h.active_version_id],
      queryFn: () =>
        fetchJson<ListEnvelope<BomLineRow>>(
          `/api/boms/lines?bom_version_id=${encodeURIComponent(h.active_version_id!)}&limit=200`,
        ),
      staleTime: 5 * 60 * 1000,
      enabled: !tooMany,
    })),
  });

  if (headsQuery.isLoading) return <DetailTabLoading />;
  if (headsQuery.isError)
    return (
      <DetailTabError message={(headsQuery.error as Error).message} />
    );

  if (tooMany) {
    return (
      <div className="space-y-2 p-3 text-sm text-fg-muted">
        <p>
          There are more than {MAX_HEADS} recipe definitions. A backend filter
          endpoint is required to look up usage efficiently.
        </p>
        <p className="text-xs font-mono text-fg-subtle">Contract Gap #1 — GET /api/components/:id/used-in-recipes</p>
      </div>
    );
  }

  if (lineQueries.some((q) => q.isLoading)) return <DetailTabLoading />;

  const matches: Array<{ head: BomHeadRow; line: BomLineRow }> = [];
  for (let i = 0; i < activeHeads.length; i++) {
    const head = activeHeads[i]!;
    const lines = lineQueries[i]?.data?.rows ?? [];
    for (const line of lines) {
      if (line.final_component_id === component_id) {
        matches.push({ head, line });
      }
    }
  }

  if (matches.length === 0) {
    return (
      <DetailTabEmpty message="This component is not used in any active recipe." />
    );
  }

  return (
    <div className="divide-y divide-border/40">
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

"use client";

// ---------------------------------------------------------------------------
// Planning · BOM Simulation — accessible to planner, admin, viewer.
//
// Purpose: A focused BOM simulation surface for the planning workflow.
// Does NOT require admin:execute. Planners use this to answer:
//   "Do I have enough material to produce X units of [item]?"
//
// Displays:
//   1. BOM picker — search BOMs with active versions by item name or BOM ID
//   2. Once selected: Production quantity simulator (gross explosion)
//   3. Purchase assistant (net requirements / shortage check)
//
// All reads are forwarded to the Railway API via existing /api/boms/* proxy
// routes, which only require a valid Supabase session.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Network } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { BomSimulator } from "@/components/bom/BomSimulator";
import { BomNetRequirements } from "@/components/bom/BomNetRequirements";

// --- Types ------------------------------------------------------------------

interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
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

export default function PlanningBomsPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedHead, setSelectedHead] = useState<BomHeadRow | null>(null);
  const [simulatedQty, setSimulatedQty] = useState<string | undefined>(undefined);

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["planning", "bom_heads", "active"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["planning", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const itemsById = useMemo(() => {
    const map = new Map<string, ItemRow>();
    for (const i of itemsQuery.data?.rows ?? []) map.set(i.item_id, i);
    return map;
  }, [itemsQuery.data]);

  // Only show BOMs that have an active version — inactive BOMs can't be simulated.
  const activeHeads = useMemo(() => {
    return (headsQuery.data?.rows ?? []).filter((h) => h.active_version_id);
  }, [headsQuery.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeHeads;
    return activeHeads.filter((h) => {
      const item = itemsById.get(h.parent_ref_id);
      return (
        h.bom_head_id.toLowerCase().includes(q) ||
        h.parent_ref_id.toLowerCase().includes(q) ||
        (item?.item_name ?? "").toLowerCase().includes(q) ||
        (h.parent_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeHeads, query, itemsById]);

  const displayName = (h: BomHeadRow) =>
    itemsById.get(h.parent_ref_id)?.item_name ?? h.parent_name ?? h.parent_ref_id;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning"
        title="BOM simulation"
        description="Select a BOM to simulate production quantities and check material coverage against current stock."
        meta={
          <Badge tone="neutral" dotted>
            {activeHeads.length} BOMs with active versions
          </Badge>
        }
      />

      {/* BOM picker */}
      {!selectedHead ? (
        <SectionCard
          eyebrow="BOM picker"
          title="Select a BOM to simulate"
          contentClassName="p-4 space-y-3"
        >
          <p className="text-xs text-fg-muted">
            Search by item name, BOM ID, or base mix name. Only BOMs with an
            active version can be simulated.
          </p>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
              strokeWidth={2}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search BOMs…"
              className="input h-9 w-full pl-9"
              autoFocus
            />
          </div>
          {headsQuery.isLoading ? (
            <p className="text-xs text-fg-muted">Loading BOMs…</p>
          ) : headsQuery.isError ? (
            <p className="text-xs text-danger-fg">
              {(headsQuery.error as Error).message}
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-border/50">
              {filtered.length === 0 ? (
                <div className="px-4 py-5 text-sm text-fg-muted">
                  {query ? (
                    "No active BOMs match your search — try a shorter term."
                  ) : activeHeads.length === 0 ? (
                    "No BOMs have an active version yet. Ask your admin to publish a BOM version to enable simulation."
                  ) : (
                    "No active BOMs match your search."
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border/30">
                  {filtered.slice(0, 50).map((h) => (
                    <li key={h.bom_head_id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-bg-subtle/50"
                        onClick={() => setSelectedHead(h)}
                      >
                        <Network className="h-4 w-4 shrink-0 text-fg-faint" strokeWidth={2} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-fg text-sm">
                            {displayName(h)}
                          </div>
                          <div className="text-3xs font-mono text-fg-subtle">
                            {h.bom_head_id} · base {h.final_bom_output_qty}{" "}
                            {h.final_bom_output_uom ?? ""}
                          </div>
                        </div>
                        <Badge tone="neutral" dotted>
                          {h.bom_kind}
                        </Badge>
                      </button>
                    </li>
                  ))}
                  {filtered.length > 50 && (
                    <li className="px-3 py-2 text-xs text-fg-muted">
                      {filtered.length - 50} more — refine your search
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </SectionCard>
      ) : (
        <>
          {/* Selected BOM header */}
          <SectionCard eyebrow="Simulating" contentClassName="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-fg">
                  {displayName(selectedHead)}
                </div>
                <div className="text-3xs font-mono text-fg-subtle">
                  {selectedHead.bom_head_id} · base{" "}
                  {selectedHead.final_bom_output_qty}{" "}
                  {selectedHead.final_bom_output_uom ?? ""}
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  setSelectedHead(null);
                  setSimulatedQty(undefined);
                }}
              >
                Change BOM
              </button>
            </div>
          </SectionCard>

          {/* Simulator + purchase assistant */}
          <BomSimulator
            headId={selectedHead.bom_head_id}
            baseOutputQty={selectedHead.final_bom_output_qty}
            outputUom={selectedHead.final_bom_output_uom}
            hasActiveVersion={!!selectedHead.active_version_id}
            onSimulated={setSimulatedQty}
          />
          <BomNetRequirements
            headId={selectedHead.bom_head_id}
            baseOutputQty={selectedHead.final_bom_output_qty}
            outputUom={selectedHead.final_bom_output_uom}
            hasActiveVersion={!!selectedHead.active_version_id}
            suggestedQty={simulatedQty}
          />
        </>
      )}
    </>
  );
}

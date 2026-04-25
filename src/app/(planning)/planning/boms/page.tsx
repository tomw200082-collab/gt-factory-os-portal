"use client";

// ---------------------------------------------------------------------------
// Planning · BOM Simulation — accessible to planner, admin, viewer.
//
// Purpose: A focused BOM simulation surface for the planning workflow.
// Does NOT require admin:execute. Planners use this to answer:
//   "Do I have enough material to produce X units of [item]?"
//
// Displays:
//   1. At-risk shortcuts — items from the latest planning run with blocked
//      feasibility, so planners can go directly to the items that need
//      coverage review (no need to know which BOM to check)
//   2. BOM picker — search BOMs with active versions by item name or BOM ID
//   3. Once selected: Production quantity simulator (gross explosion)
//   4. Purchase assistant (net requirements / shortage check)
//
// All reads are forwarded to the Railway API via existing /api/* proxy routes.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Network,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
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

type FeasibilityStatus =
  | "ready_now"
  | "ready_if_purchase_executes"
  | "blocked_missing_bom"
  | "blocked_missing_supplier_mapping"
  | "blocked_stock_gap"
  | "blocked_missing_pack_conversion"
  | "blocked_ambiguous_supplier";

interface RecRow {
  recommendation_id: string;
  item_id: string | null;
  item_name: string | null;
  feasibility_status: FeasibilityStatus;
  shortage_date: string | null;
  required_qty: string;
  recommended_qty: string;
  uom: string | null;
  current_stock_bal: string | null;
}

interface RunSummaryRow {
  run_id: string;
  executed_at: string;
  status: "draft" | "running" | "completed" | "failed" | "superseded";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  summary: {
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

type ListEnvelope<T> = { rows: T[]; count: number; total?: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Could not load data. Check your connection and try refreshing.");
  }
  return (await res.json()) as T;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function supplyMethodLabel(s: string | undefined): string {
  if (s === "MANUFACTURED") return "Manufactured";
  if (s === "BOUGHT_FINISHED") return "Bought finished";
  if (s === "REPACK") return "Repack";
  return s ?? "—";
}

function feasibilityLabel(s: FeasibilityStatus): string {
  if (s === "blocked_stock_gap") return "Stock gap";
  if (s === "blocked_missing_bom") return "No BOM";
  if (s === "blocked_missing_supplier_mapping") return "No supplier";
  if (s === "blocked_ambiguous_supplier") return "Ambiguous supplier";
  if (s === "blocked_missing_pack_conversion") return "Pack conversion missing";
  if (s === "ready_if_purchase_executes") return "Pending PO";
  return s.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlanningBomsPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedHead, setSelectedHead] = useState<BomHeadRow | null>(null);
  const [simulatedQty, setSimulatedQty] = useState<string | undefined>(undefined);
  const [selectedRec, setSelectedRec] = useState<RecRow | null>(null);

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["planning", "bom_heads", "active"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
    staleTime: 2 * 60_000,
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["planning", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
    staleTime: 5 * 60_000,
  });

  // Latest planning run — for at-risk shortcuts
  const runsQuery = useQuery<ListEnvelope<RunSummaryRow>>({
    queryKey: ["planning", "runs", "latest"],
    queryFn: () => fetchJson("/api/planning/runs"),
    staleTime: 2 * 60 * 1000,
  });
  const latestRun = runsQuery.data?.rows?.[0] ?? null;

  // Production recommendations from latest run — for at-risk shortcuts
  const latestRunRecsQuery = useQuery<ListEnvelope<RecRow>>({
    queryKey: ["planning", "bom-page", "recs", latestRun?.run_id ?? "none"],
    queryFn: () =>
      fetchJson(
        `/api/planning/runs/${encodeURIComponent(latestRun!.run_id)}/recommendations?type=production`,
      ),
    enabled: Boolean(latestRun?.run_id && latestRun.status === "completed"),
    staleTime: 2 * 60 * 1000,
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

  // Index BOM heads by parent_ref_id so at-risk shortcuts can find them quickly
  const headByItemId = useMemo(() => {
    const map = new Map<string, BomHeadRow>();
    for (const h of activeHeads) {
      if (h.parent_ref_id) map.set(h.parent_ref_id, h);
    }
    return map;
  }, [activeHeads]);

  // At-risk recs: production recs that are blocked or pending PO
  const atRiskRecs = useMemo(() => {
    const recs = latestRunRecsQuery.data?.rows ?? [];
    return recs
      .filter(
        (r) =>
          r.feasibility_status !== "ready_now" &&
          r.item_id !== null,
      )
      .slice(0, 8);
  }, [latestRunRecsQuery.data]);

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

      {/* At-risk shortcuts — error state when runs query fails */}
      {runsQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-softer/40 px-4 py-2 text-xs text-warning-fg">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Could not load latest planning run — at-risk shortcuts unavailable. You can still search and select a BOM manually below.
        </div>
      )}

      {/* At-risk shortcuts — items from latest run needing coverage review */}
      {latestRun && latestRun.status === "completed" && (
        <SectionCard
          eyebrow={
            latestRunRecsQuery.isLoading
              ? "Latest run"
              : latestRunRecsQuery.isError
                ? "Latest run"
                : atRiskRecs.length > 0
                  ? `${atRiskRecs.length} item${atRiskRecs.length !== 1 ? "s" : ""} need coverage review`
                  : "Latest run"
          }
          title={
            latestRunRecsQuery.isError
              ? "Could not load recommendations"
              : atRiskRecs.length > 0
                ? "Simulate these items first"
                : latestRunRecsQuery.isLoading
                  ? "Loading…"
                  : "No blocked production items in the latest run"
          }
          tone={latestRunRecsQuery.isError ? "warning" : atRiskRecs.length > 0 ? "warning" : undefined}
          contentClassName={atRiskRecs.length > 0 ? "p-0" : "px-4 py-3"}
        >
          {latestRunRecsQuery.isLoading ? (
            <p className="text-xs text-fg-muted">Checking latest planning run…</p>
          ) : latestRunRecsQuery.isError ? (
            <div className="flex items-center gap-2 text-xs text-warning-fg">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Failed to load recommendations for this run. Check your connection and try refreshing.
              <Link
                href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                className="ml-auto inline-flex items-center gap-1 text-3xs text-fg-muted hover:text-fg"
              >
                View run <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          ) : atRiskRecs.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-fg-muted">
                No blocked production items in the latest run.
              </p>
              <Link
                href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                className="inline-flex items-center gap-1 text-3xs text-fg-muted hover:text-fg"
              >
                Review run
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border/40">
                {atRiskRecs.map((rec) => {
                  const head = rec.item_id
                    ? headByItemId.get(rec.item_id) ?? null
                    : null;
                  const isBlocked = rec.feasibility_status.startsWith("blocked_");
                  return (
                    <li
                      key={rec.recommendation_id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <AlertTriangle
                        className={`h-3.5 w-3.5 shrink-0 ${isBlocked ? "text-danger-fg" : "text-warning-fg"}`}
                        strokeWidth={2}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-fg">
                            {rec.item_name ?? rec.item_id ?? "—"}
                          </span>
                          <Badge
                            tone={isBlocked ? "danger" : "warning"}
                            dotted
                          >
                            {feasibilityLabel(rec.feasibility_status)}
                          </Badge>
                          {rec.shortage_date ? (
                            <span className="text-3xs text-fg-muted">
                              Shortage by {fmtDate(rec.shortage_date)}
                            </span>
                          ) : null}
                        </div>
                        {rec.required_qty && rec.current_stock_bal ? (
                          <div className="mt-0.5 text-3xs text-fg-muted">
                            Need {rec.required_qty}{rec.uom ? ` ${rec.uom}` : ""} · On hand {rec.current_stock_bal}{rec.uom ? ` ${rec.uom}` : ""}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {head ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-3xs font-semibold text-accent hover:underline"
                            onClick={() => {
                              setSelectedHead(head);
                              setSelectedRec(rec);
                              setSimulatedQty(rec.required_qty);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Simulate
                            <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
                          </button>
                        ) : null}
                        {(rec.feasibility_status === "blocked_missing_bom" ||
                          rec.feasibility_status === "blocked_missing_supplier_mapping" ||
                          rec.feasibility_status === "blocked_ambiguous_supplier") &&
                          rec.item_id ? (
                          <Link
                            href={`/admin/masters/items/${encodeURIComponent(rec.item_id)}`}
                            className="inline-flex items-center gap-1 text-3xs text-fg-muted hover:text-fg"
                            title="Fix in item master"
                          >
                            Fix in master →
                          </Link>
                        ) : rec.feasibility_status === "blocked_stock_gap" && latestRun ? (
                          <Link
                            href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                            className="inline-flex items-center gap-1 text-3xs text-fg-muted hover:text-fg"
                            title="Approve purchase recommendations to address stock gap"
                          >
                            Approve recs →
                          </Link>
                        ) : !head ? (
                          <span className="text-3xs text-fg-subtle">No active BOM</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
                <span className="text-3xs text-fg-subtle">
                  Latest planning run · horizon starts {fmtDate(latestRun.planning_horizon_start_at)} · {latestRun.planning_horizon_weeks} weeks
                </span>
                <Link
                  href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                  className="inline-flex items-center gap-1 text-3xs text-accent hover:underline"
                >
                  Full run detail
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* BOM picker */}
      {!selectedHead ? (
        <SectionCard
          eyebrow="BOM picker"
          title="Select a BOM to simulate"
          contentClassName="p-4 space-y-3"
        >
          <p className="text-xs text-fg-muted">
            Search by item name. Only BOMs with an active version can be simulated.
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
              Failed to load BOMs. Check your connection and try refreshing.
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
                        onClick={() => { setSelectedHead(h); setSelectedRec(null); setSimulatedQty(undefined); }}
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
                          {supplyMethodLabel(itemsById.get(h.parent_ref_id)?.supply_method ?? h.bom_kind)}
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
                  setSelectedRec(null);
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
            demandContext={selectedRec ? {
              source: `Planning run — production recommendation`,
              required_qty: selectedRec.required_qty,
              uom: selectedRec.uom,
              shortage_date: selectedRec.shortage_date,
              feasibility_label: feasibilityLabel(selectedRec.feasibility_status),
            } : undefined}
          />
        </>
      )}
    </>
  );
}

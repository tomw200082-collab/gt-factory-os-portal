"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, MinusCircle, HelpCircle } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { formatQty } from "@/lib/utils/format-quantity";
import { cn } from "@/lib/cn";
import type { SimulatableProduct } from "./ProductionSimulatorShell";
import { SimulationTable, type SimulationLine } from "./SimulationTable";

// ---------------------------------------------------------------------------
// SimulationResults — calls the live simulate endpoint for the PACK head
// (with the target output qty) and, if a linked BASE head exists, calls
// simulate for the BASE head with the total base liters required to produce
// the target output. Results from both heads are merged into the existing
// SimulationLine[] shape rendered by SimulationTable.
//
// Per-line classification: simulate's response does NOT include per-line
// bom_kind; tagging by head bom_kind was wrong because a single head can
// hold liquids + packaging together. We fetch the components map and
// surface each component's `component_class` (the real classifier on the
// component master).
//
// Stock coverage: net-requirements endpoint provides per-component on-hand
// vs required, including coverage status. We call it for each head we
// simulated so coverage uses the same gross-required values the simulator
// shows.
// ---------------------------------------------------------------------------

interface SimulationResultsProps {
  product: SimulatableProduct;
  targetQty: number;
}

interface SimulatorLine {
  line_no: number;
  component_id: string;
  component_name: string;
  component_uom: string | null;
  base_component_qty: string;
  unit_ratio: string;
  required_qty: string;
  formula: string;
}

interface SimulateResponse {
  bom_head_id: string;
  bom_type: string | null;
  item_name: string | null;
  active_version_id: string;
  version_label: string;
  base_output_qty: string;
  output_uom: string | null;
  target_qty: number;
  math_note: string;
  lines: SimulatorLine[];
  warnings: string[];
}

interface SimulateError {
  reason_code?: string;
  detail?: string;
}

type CoverageStatus = "covered" | "partial" | "not_covered" | "no_stock_data";

interface NetLine {
  line_no: number;
  component_id: string;
  component_name: string;
  component_uom: string | null;
  gross_required_qty: string;
  available_qty: string;
  available_source: string;
  net_shortage_qty: string;
  coverage_status: CoverageStatus;
  coverage_pct: string;
  supplier_id: string | null;
  supplier_short: string | null;
  supplier_phone: string | null;
}

interface NetRequirementsResponse {
  bom_head_id: string;
  target_qty: number;
  total_lines: number;
  lines_covered: number;
  lines_partial: number;
  lines_not_covered: number;
  lines_no_stock_data: number;
  availability_note: string;
  balances_as_of: string | null;
  lines: NetLine[];
  warnings: string[];
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  component_group: string | null;
}

interface ListEnvelope<T> {
  rows: T[];
  count?: number;
  total?: number;
}

interface SimulationNotice {
  message: string;
  tone: "warning" | "info";
}

interface SimulationData {
  pack: SimulateResponse | null;
  base: SimulateResponse | null;
  packCoverage: NetRequirementsResponse | null;
  baseCoverage: NetRequirementsResponse | null;
  componentClassById: Map<string, string | null>;
  warnings: string[];
  notices: SimulationNotice[];
}

async function fetchSimulate(
  headId: string,
  qty: number,
): Promise<SimulateResponse> {
  const url = `/api/boms/heads/${encodeURIComponent(headId)}/simulate?qty=${qty}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json ?? {}) as SimulateError;
    throw new Error(
      e.detail ?? `Simulation failed for ${headId} (HTTP ${res.status}).`,
    );
  }
  return json as SimulateResponse;
}

async function fetchNetRequirements(
  headId: string,
  qty: number,
): Promise<NetRequirementsResponse | null> {
  const url = `/api/boms/heads/${encodeURIComponent(headId)}/net-requirements?qty=${qty}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      // Coverage failure must not break the simulation — return null so the
      // panel can render a "could not load coverage" state instead.
      return null;
    }
    return (await res.json()) as NetRequirementsResponse;
  } catch {
    return null;
  }
}

async function fetchComponents(): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  try {
    const res = await fetch("/api/components?limit=2000", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return map;
    const env = (await res.json()) as ListEnvelope<ComponentRow>;
    for (const c of env.rows ?? []) {
      map.set(c.component_id, c.component_class ?? null);
    }
  } catch {
    // Best-effort lookup. Empty map → lines render with class "—".
  }
  return map;
}

async function loadSimulationData(
  product: SimulatableProduct,
  targetQty: number,
): Promise<SimulationData> {
  const warnings: string[] = [];
  const notices: SimulationNotice[] = [];

  // Compute base qty up front so all parallel fetches see the same number.
  // Source priority: explicit items.base_fill_qty_per_unit, else derived
  // from pack_size + sales_uom for volume UOMs (see resolveBaseFillQtyPerUnit
  // in ProductionSimulatorShell). When derived, tell the operator quietly
  // so they know where the number came from.
  let baseLiters: number | null = null;
  if (product.baseHead) {
    const fillPerUnit = product.baseFill.qtyPerUnit;
    if (fillPerUnit && fillPerUnit > 0) {
      baseLiters = targetQty * fillPerUnit;
      if (product.baseFill.source === "derived") {
        notices.push({
          tone: "info",
          message: `BASE volume derived from pack size (${fillPerUnit} L per unit). Set base_fill_qty_per_unit on the item to override.`,
        });
      }
    } else {
      // Distinguish "no pack_size at all" from "pack_size is in a non-volume
      // UOM like KG/G" so the operator can tell which fix is needed.
      const packSizeNum = product.packSize ? parseFloat(product.packSize) : NaN;
      const hasUsablePackSize = Number.isFinite(packSizeNum) && packSizeNum > 0;
      const uom = product.salesUom?.toUpperCase() ?? null;
      const isVolumeUom = uom === "L" || uom === "ML";
      let reason: string;
      if (!hasUsablePackSize) {
        reason = "pack_size is missing on the item";
      } else if (!uom) {
        reason = "sales_uom is missing on the item";
      } else if (!isVolumeUom) {
        reason = `sales_uom is ${uom} (not a liquid volume), so pack_size cannot be used to derive base volume`;
      } else {
        reason = "the item has no usable pack_size or sales_uom";
      }
      warnings.push(
        `BASE BOM is linked but base_fill_qty_per_unit cannot be resolved: ${reason}. Set base_fill_qty_per_unit on the item so BASE component requirements scale correctly.`,
      );
    }
  }

  const [pack, base, packCoverage, baseCoverage, componentClassById] =
    await Promise.all([
      fetchSimulate(product.packHead.bom_head_id, targetQty),
      product.baseHead && baseLiters !== null
        ? fetchSimulate(product.baseHead.bom_head_id, baseLiters).catch(
            (err: unknown) => {
              warnings.push(
                `BASE simulation failed: ${err instanceof Error ? err.message : "unknown error"}`,
              );
              return null;
            },
          )
        : Promise.resolve(null),
      fetchNetRequirements(product.packHead.bom_head_id, targetQty),
      product.baseHead && baseLiters !== null
        ? fetchNetRequirements(product.baseHead.bom_head_id, baseLiters)
        : Promise.resolve(null),
      fetchComponents(),
    ]);

  return {
    pack,
    base,
    packCoverage,
    baseCoverage,
    componentClassById,
    warnings,
    notices,
  };
}

function buildSimulationLines(data: SimulationData): SimulationLine[] {
  const out: SimulationLine[] = [];
  const targetQty = data.pack?.target_qty ?? 0;
  const classMap = data.componentClassById;

  // Build coverage lookup: component_id → coverage info.
  // Net-requirements may run on multiple heads; merge into one map.
  // If the same component appears in both PACK and BASE coverage feeds (rare
  // — typically PACK and BASE BOMs hold disjoint components), prefer the
  // entry whose head served the simulator line (PACK wins for PACK lines,
  // BASE wins for BASE lines). We index by `${headId}:${componentId}`.
  const coverageByKey = new Map<string, NetLine>();
  if (data.packCoverage && data.pack) {
    for (const c of data.packCoverage.lines) {
      coverageByKey.set(`${data.pack.bom_head_id}:${c.component_id}`, c);
    }
  }
  if (data.baseCoverage && data.base) {
    for (const c of data.baseCoverage.lines) {
      coverageByKey.set(`${data.base.bom_head_id}:${c.component_id}`, c);
    }
  }

  function buildLineForHead(
    line: SimulatorLine,
    headPrefix: string,
    headId: string,
  ): SimulationLine {
    const requiredQty = parseFloat(line.required_qty);
    const qtyPerUnit =
      targetQty > 0 && Number.isFinite(requiredQty)
        ? requiredQty / targetQty
        : parseFloat(line.unit_ratio);
    const cov = coverageByKey.get(`${headId}:${line.component_id}`) ?? null;
    return {
      id: `${headPrefix}-${headId}-${line.line_no}`,
      componentId: line.component_id,
      componentName: line.component_name,
      componentClass: classMap.get(line.component_id) ?? null,
      qtyPerUnit: Number.isFinite(qtyPerUnit) ? qtyPerUnit : 0,
      requiredQty: Number.isFinite(requiredQty) ? requiredQty : 0,
      uom: line.component_uom ?? "UNIT",
      coverage: cov
        ? {
            availableQty:
              cov.coverage_status === "no_stock_data"
                ? 0
                : parseFloat(cov.available_qty),
            netShortageQty: parseFloat(cov.net_shortage_qty),
            status: cov.coverage_status,
          }
        : null,
    };
  }

  if (data.pack) {
    for (const line of data.pack.lines) {
      out.push(buildLineForHead(line, "pack", data.pack.bom_head_id));
    }
  }
  if (data.base) {
    for (const line of data.base.lines) {
      out.push(buildLineForHead(line, "base", data.base.bom_head_id));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// StockCoveragePanel — renders per-component on-hand vs required from the
// /api/boms/heads/[head_id]/net-requirements endpoint. Mirrors the OLD
// /planning/boms BomNetRequirements component but pared down to the data
// the production simulator already has.
// ---------------------------------------------------------------------------

interface StockCoveragePanelProps {
  lines: SimulationLine[];
  packCoverage: NetRequirementsResponse | null;
  baseCoverage: NetRequirementsResponse | null;
  hasLinkedBase: boolean;
}

function CoverageIcon({ status }: { status: CoverageStatus }): JSX.Element {
  if (status === "covered")
    return <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" strokeWidth={2} />;
  if (status === "partial")
    return <MinusCircle className="h-3.5 w-3.5 text-warning-fg" strokeWidth={2} />;
  if (status === "not_covered")
    return <AlertTriangle className="h-3.5 w-3.5 text-danger-fg" strokeWidth={2} />;
  return <HelpCircle className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />;
}

function coverageLabel(status: CoverageStatus): string {
  if (status === "covered") return "Covered";
  if (status === "partial") return "Partial";
  if (status === "not_covered") return "Shortage";
  return "No data";
}

function StockCoveragePanel({
  lines,
  packCoverage,
  baseCoverage,
  hasLinkedBase,
}: StockCoveragePanelProps): JSX.Element {
  // If neither coverage call returned anything, show a soft notice.
  if (!packCoverage && (!hasLinkedBase || !baseCoverage)) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning-softer/40 px-4 py-3 text-xs text-warning-fg">
        Could not load stock coverage data — the net-requirements feed did not
        respond. Try refreshing the page.
      </div>
    );
  }

  // Aggregate counters across both heads (PACK + BASE).
  let total = 0;
  let covered = 0;
  let partial = 0;
  let notCovered = 0;
  let noData = 0;
  for (const c of [packCoverage, baseCoverage]) {
    if (!c) continue;
    total += c.total_lines;
    covered += c.lines_covered;
    partial += c.lines_partial;
    notCovered += c.lines_not_covered;
    noData += c.lines_no_stock_data;
  }

  const linesWithCoverage = lines.filter((l) => l.coverage !== null);
  const balancesAsOf =
    packCoverage?.balances_as_of ?? baseCoverage?.balances_as_of ?? null;

  if (linesWithCoverage.length === 0) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning-softer/40 px-4 py-3 text-xs text-warning-fg">
        Net-requirements responded but did not return per-line coverage rows.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-bg-subtle/50 px-3 py-2 text-xs">
        <span className="font-semibold text-fg">{total} components:</span>
        {covered > 0 && (
          <Badge tone="success" dotted>
            {covered} covered
          </Badge>
        )}
        {partial > 0 && (
          <Badge tone="warning" dotted>
            {partial} partial
          </Badge>
        )}
        {notCovered > 0 && (
          <Badge tone="danger" dotted>
            {notCovered} short
          </Badge>
        )}
        {noData > 0 && (
          <Badge tone="neutral" dotted>
            {noData} no data
          </Badge>
        )}
        {balancesAsOf ? (
          <span className="ml-auto text-3xs text-fg-muted">
            On-hand as of:{" "}
            <span className="font-mono">
              {new Date(balancesAsOf).toLocaleString(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle/60 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left">Component</th>
              <th className="px-4 py-2 text-right">Required</th>
              <th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Shortage</th>
              <th className="px-4 py-2 text-left">Coverage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {[...linesWithCoverage]
              .sort((a, b) => {
                const order: Record<CoverageStatus, number> = {
                  not_covered: 0,
                  partial: 1,
                  no_stock_data: 2,
                  covered: 3,
                };
                return (
                  order[a.coverage!.status] - order[b.coverage!.status]
                );
              })
              .map((l) => {
                const cov = l.coverage!;
                const isShort =
                  cov.status === "partial" || cov.status === "not_covered";
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      isShort ? "bg-danger-softer/20" : undefined,
                    )}
                  >
                    <td className="px-4 py-2 font-medium text-fg-strong">
                      {l.componentName}
                      <div className="text-3xs font-mono text-fg-subtle">
                        {l.componentId}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg">
                      {formatQty(l.requiredQty, l.uom)}
                      <span className="ml-1 text-3xs text-fg-muted">
                        {l.uom}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg">
                      {cov.status === "no_stock_data"
                        ? "—"
                        : formatQty(cov.availableQty, l.uom)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right tabular-nums font-semibold",
                        cov.netShortageQty > 0
                          ? "text-danger-fg"
                          : "text-fg-muted",
                      )}
                    >
                      {cov.netShortageQty > 0
                        ? formatQty(cov.netShortageQty, l.uom)
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <CoverageIcon status={cov.status} />
                        <span>{coverageLabel(cov.status)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <p className="text-3xs text-fg-muted">
        Coverage compares gross required quantities against current on-hand
        stock balances only. It does not account for supplier lead times,
        stock committed to other production runs, or open POs not yet
        received.
      </p>
    </div>
  );
}

export function SimulationResults({
  product,
  targetQty,
}: SimulationResultsProps) {
  const dataQuery = useQuery<SimulationData>({
    queryKey: [
      "production-simulation",
      "simulate",
      product.packHead.bom_head_id,
      product.baseHead?.bom_head_id ?? null,
      targetQty,
    ],
    queryFn: () => loadSimulationData(product, targetQty),
    staleTime: 30_000,
  });

  if (dataQuery.isLoading) {
    return (
      <SectionCard>
        <div className="text-xs text-fg-muted">Running simulation…</div>
      </SectionCard>
    );
  }

  if (dataQuery.isError) {
    return (
      <SectionCard>
        <div className="text-xs text-danger-fg">
          {dataQuery.error instanceof Error
            ? dataQuery.error.message
            : "Could not load BOM data for this product. Try refreshing."}
        </div>
      </SectionCard>
    );
  }

  const data = dataQuery.data!;
  const lines = buildSimulationLines(data);

  const hasPack = !!data.pack;
  const hasBase = !!data.base;
  const hasLinkedBase = !!product.baseHead;

  const warnings: string[] = [...data.warnings];
  if (data.pack && data.pack.warnings.length > 0) {
    warnings.push(...data.pack.warnings);
  }
  if (data.base && data.base.warnings.length > 0) {
    warnings.push(...data.base.warnings);
  }
  const infoNotices = data.notices.filter((n) => n.tone === "info");
  // Earlier the page emitted a "PACK-only recipe — no BASE liquid mix is
  // linked" notice whenever there was no separate BASE head. That message
  // was misleading: many MANUFACTURED items use a single combined BOM
  // (liquids + packaging), not a 2-tier BASE→PACK split. The notice is
  // dropped — the head's actual contents speak for themselves.

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        eyebrow="Results"
        title={`Component requirements for ${targetQty.toLocaleString()} units`}
        description={`Combined BASE + PACK requirements for ${product.displayName}.`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {hasPack ? (
              <Badge tone="neutral" dotted>
                {data.pack?.bom_type ?? "Recipe"}: {data.pack?.lines.length ?? 0} lines
              </Badge>
            ) : null}
            {hasBase ? (
              <Badge tone="info" dotted>
                {data.base?.bom_type ?? "BASE"}: {data.base?.lines.length ?? 0} lines
              </Badge>
            ) : null}
          </div>
        }
        contentClassName="p-0"
      >
        {warnings.length > 0 ? (
          <div className="space-y-1 border-b border-border/60 bg-warning-softer/40 px-4 py-3 text-xs text-warning-fg">
            {warnings.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        ) : null}
        {infoNotices.length > 0 ? (
          <div className="space-y-1 border-b border-info/30 bg-info-softer/40 px-4 py-3 text-xs text-info-fg">
            {infoNotices.map((n, i) => (
              <div key={i}>{n.message}</div>
            ))}
          </div>
        ) : null}
        <SimulationTable lines={lines} />
      </SectionCard>

      <SectionCard
        eyebrow="Coverage"
        title="Stock coverage"
        description="Compare required quantities against on-hand stock."
      >
        <StockCoveragePanel
          lines={lines}
          packCoverage={data.packCoverage}
          baseCoverage={data.baseCoverage}
          hasLinkedBase={hasLinkedBase}
        />
      </SectionCard>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import type { SimulatableProduct } from "./ProductionSimulatorShell";
import { SimulationTable, type SimulationLine } from "./SimulationTable";

// ---------------------------------------------------------------------------
// SimulationResults — calls the live simulate endpoint for the PACK head
// (with the target output qty) and, if a linked BASE head exists, calls
// simulate for the BASE head with the total base liters required to produce
// the target output. Results from both heads are merged into the existing
// SimulationLine[] shape rendered by SimulationTable.
//
// The simulate endpoint returns lines that already include the math against
// the requested quantity, so this component does not multiply on the
// client. We rely on the server to apply qty_per_l_output and pack ratios.
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

interface SimulationData {
  pack: SimulateResponse | null;
  base: SimulateResponse | null;
  warnings: string[];
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

async function loadSimulationData(
  product: SimulatableProduct,
  targetQty: number,
): Promise<SimulationData> {
  const warnings: string[] = [];

  // 1. Run PACK / REPACK simulation at the requested output qty.
  const pack = await fetchSimulate(product.packHead.bom_head_id, targetQty);

  // 2. If a linked BASE head exists, compute required base liters and run
  //    a second simulation against the BASE head. The base BOM is
  //    typically scaled in liters — we multiply targetQty by the item's
  //    base_fill_qty_per_unit to get total liters.
  let base: SimulateResponse | null = null;
  if (product.baseHead) {
    const fillPerUnit = product.baseFillQtyPerUnit;
    if (fillPerUnit && fillPerUnit > 0) {
      const baseLiters = targetQty * fillPerUnit;
      try {
        base = await fetchSimulate(
          product.baseHead.bom_head_id,
          baseLiters,
        );
      } catch (err) {
        warnings.push(
          `BASE simulation failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    } else {
      warnings.push(
        "BASE BOM is linked but base_fill_qty_per_unit is missing on the item, so BASE component requirements cannot be scaled.",
      );
    }
  }

  return { pack, base, warnings };
}

function buildSimulationLines(data: SimulationData): SimulationLine[] {
  const out: SimulationLine[] = [];
  const targetQty = data.pack?.target_qty ?? 0;

  if (data.pack) {
    for (const line of data.pack.lines) {
      const requiredQty = parseFloat(line.required_qty);
      const qtyPerUnit =
        targetQty > 0 && Number.isFinite(requiredQty)
          ? requiredQty / targetQty
          : parseFloat(line.unit_ratio);
      out.push({
        id: `pack-${data.pack.bom_head_id}-${line.line_no}`,
        componentId: line.component_id,
        componentName: line.component_name,
        type: "PACK",
        qtyPerUnit: Number.isFinite(qtyPerUnit) ? qtyPerUnit : 0,
        requiredQty: Number.isFinite(requiredQty) ? requiredQty : 0,
        uom: line.component_uom ?? "UNIT",
      });
    }
  }

  if (data.base) {
    for (const line of data.base.lines) {
      const requiredQty = parseFloat(line.required_qty);
      const qtyPerUnit =
        targetQty > 0 && Number.isFinite(requiredQty)
          ? requiredQty / targetQty
          : parseFloat(line.unit_ratio);
      out.push({
        id: `base-${data.base.bom_head_id}-${line.line_no}`,
        componentId: line.component_id,
        componentName: line.component_name,
        type: "BASE",
        qtyPerUnit: Number.isFinite(qtyPerUnit) ? qtyPerUnit : 0,
        requiredQty: Number.isFinite(requiredQty) ? requiredQty : 0,
        uom: line.component_uom ?? "UNIT",
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// StockCoveragePanel — placeholder. The portal sandbox does not yet expose a
// stock-projection repo (no projection / stock-balance store under
// src/lib/repositories). Wire-up is deferred until that repo lands.
// ---------------------------------------------------------------------------
function StockCoveragePanel() {
  return (
    <div className="rounded-md border border-border/60 bg-bg-subtle/40 px-4 py-3 text-3xs text-fg-muted">
      Stock coverage data pending — a stock projection feed has not been wired
      into the planner sandbox yet. This panel will compare each required
      quantity against on-hand stock once the projection repo lands.
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

  const notices: string[] = [...data.warnings];
  if (data.pack && data.pack.warnings.length > 0) {
    notices.push(...data.pack.warnings);
  }
  if (data.base && data.base.warnings.length > 0) {
    notices.push(...data.base.warnings);
  }
  if (hasPack && !hasLinkedBase) {
    notices.push(
      "PACK-only recipe — no BASE liquid mix is linked to this product.",
    );
  }

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
                PACK lines: {data.pack?.lines.length ?? 0}
              </Badge>
            ) : null}
            {hasBase ? (
              <Badge tone="info" dotted>
                BASE lines: {data.base?.lines.length ?? 0}
              </Badge>
            ) : null}
          </div>
        }
        contentClassName="p-0"
      >
        {notices.length > 0 ? (
          <div className="space-y-1 border-b border-border/60 bg-warning-softer/40 px-4 py-3 text-xs text-warning-fg">
            {notices.map((n, i) => (
              <div key={i}>{n}</div>
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
        <StockCoveragePanel />
      </SectionCard>
    </div>
  );
}

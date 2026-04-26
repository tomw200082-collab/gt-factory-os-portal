"use client";

import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { bomsRepo } from "@/lib/repositories";
import type {
  BomHeadDto,
  BomLineDto,
  ItemDto,
} from "@/lib/contracts/dto";
import { SimulationTable, type SimulationLine } from "./SimulationTable";

interface SimulationResultsProps {
  product: ItemDto;
  targetQty: number;
}

interface ResolvedBom {
  head: BomHeadDto;
  lines: BomLineDto[];
}

interface SimulationData {
  pack: ResolvedBom | null;
  base: ResolvedBom | null;
  packMissingActiveVersion: boolean;
  baseMissingActiveVersion: boolean;
}

async function loadSimulationData(item: ItemDto): Promise<SimulationData> {
  const { pack, base } = await bomsRepo.getProductBoms(item);

  let packResolved: ResolvedBom | null = null;
  let packMissingActiveVersion = false;
  if (pack) {
    if (pack.active_version_id) {
      const lines = await bomsRepo.listLines(pack.active_version_id);
      packResolved = { head: pack, lines };
    } else {
      packMissingActiveVersion = true;
    }
  }

  let baseResolved: ResolvedBom | null = null;
  let baseMissingActiveVersion = false;
  if (base) {
    if (base.active_version_id) {
      const lines = await bomsRepo.listLines(base.active_version_id);
      baseResolved = { head: base, lines };
    } else {
      baseMissingActiveVersion = true;
    }
  }

  return {
    pack: packResolved,
    base: baseResolved,
    packMissingActiveVersion,
    baseMissingActiveVersion,
  };
}

function buildSimulationLines(
  product: ItemDto,
  targetQty: number,
  data: SimulationData,
): SimulationLine[] {
  const out: SimulationLine[] = [];

  if (data.pack) {
    for (const line of data.pack.lines) {
      if (line.status !== "ACTIVE") continue;
      const componentId = line.final_component_id ?? "";
      const componentName =
        line.final_component_name ?? line.final_component_id ?? "(unnamed)";
      const uom = line.component_uom ?? "UNIT";
      const qtyPerUnit = line.final_component_qty ?? 0;
      const requiredQty = targetQty * qtyPerUnit;
      out.push({
        id: `pack-${line.line_id}`,
        componentId,
        componentName,
        type: "PACK",
        qtyPerUnit,
        requiredQty,
        uom,
      });
    }
  }

  if (data.base) {
    const fillPerUnit = product.base_fill_qty_per_unit ?? 0;
    for (const line of data.base.lines) {
      if (line.status !== "ACTIVE") continue;
      const componentId = line.final_component_id ?? "";
      const componentName =
        line.final_component_name ?? line.final_component_id ?? "(unnamed)";
      const uom = line.component_uom ?? "UNIT";
      const qtyPerL = line.qty_per_l_output ?? 0;
      // qtyPerUnit = base liters per finished unit × ingredient qty per L of base.
      const qtyPerUnit = fillPerUnit * qtyPerL;
      const requiredQty = targetQty * qtyPerUnit;
      out.push({
        id: `base-${line.line_id}`,
        componentId,
        componentName,
        type: "BASE",
        qtyPerUnit,
        requiredQty,
        uom,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// StockCoveragePanel — placeholder. The portal sandbox does not yet expose a
// stock-projection repo (no projection / stock-balance store under
// src/lib/repositories). Wire-up is deferred until that repo lands.
// TODO: replace with real coverage once a stock projection repo exists.
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
      "boms",
      product.item_id,
      product.primary_bom_head_id,
      product.base_bom_head_id,
    ],
    queryFn: () => loadSimulationData(product),
    staleTime: 60_000,
  });

  if (dataQuery.isLoading) {
    return (
      <SectionCard>
        <div className="text-xs text-fg-muted">Loading recipe…</div>
      </SectionCard>
    );
  }

  if (dataQuery.isError) {
    return (
      <SectionCard>
        <div className="text-xs text-danger-fg">
          Could not load BOM data for this product. Try refreshing.
        </div>
      </SectionCard>
    );
  }

  const data = dataQuery.data!;
  const lines = buildSimulationLines(product, targetQty, data);

  const hasPack = !!data.pack;
  const hasBase = !!data.base;
  const baseMissingFill =
    hasBase &&
    (product.base_fill_qty_per_unit === null ||
      product.base_fill_qty_per_unit === 0);

  const notices: string[] = [];
  if (!hasPack && !hasBase) {
    notices.push(
      "This product has no active BOM. Check the BOM module to link or activate one.",
    );
  } else {
    if (hasPack && !hasBase) {
      notices.push("PACK-only recipe — no BASE liquid mix is linked.");
    }
    if (hasBase && !hasPack) {
      notices.push("BASE-only recipe — no PACK packaging BOM is linked.");
    }
    if (data.packMissingActiveVersion) {
      notices.push(
        "PACK BOM is linked but has no active version. Activate a draft to include PACK lines.",
      );
    }
    if (data.baseMissingActiveVersion) {
      notices.push(
        "BASE BOM is linked but has no active version. Activate a draft to include BASE lines.",
      );
    }
    if (baseMissingFill) {
      notices.push(
        "BASE recipe info incomplete — base_fill_qty_per_unit is missing on this item, so BASE lines cannot be scaled.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        eyebrow="Results"
        title={`Component requirements for ${targetQty.toLocaleString()} units`}
        description={`Combined BASE + PACK requirements for ${product.item_name}.`}
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

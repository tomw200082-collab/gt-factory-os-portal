"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileWarning } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";
import type {
  BomLineRow,
  SimulatableProduct,
} from "./ProductionSimulatorShell";
import { resolveBaseFillFromRecipe } from "./ProductionSimulatorShell";
import {
  SimulationTable,
  type CoverageStatus,
  type MaterialGroup,
  type SimulationLine,
} from "./SimulationTable";

// ---------------------------------------------------------------------------
// SimulationResults — runs the live simulation for the chosen product and
// renders the answer.
//
// Flow:
//   1. Simulate the PACK head at the target unit count.
//   2. If a BASE head is linked, read litres-of-base-per-unit straight from
//      the PACK recipe. If the recipe cannot supply it, the run is BLOCKED —
//      no guessed numbers, just a "fix the BOM" message.
//   3. Simulate the BASE head at the total base litres required.
//   4. Join on-hand coverage from net-requirements and render one grouped
//      table: ingredients, packaging, everything in exact recipe ratios.
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

interface SimulationData {
  /** Non-null → the run is blocked; render the reason, no table. */
  blocked: string | null;
  lines: SimulationLine[];
  packHeadId: string;
  packVersionLabel: string;
  baseHeadId: string | null;
  baseVersionLabel: string | null;
  baseLitresPerUnit: number | null;
  baseTotalLitres: number | null;
  balancesAsOf: string | null;
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

async function fetchNetRequirements(
  headId: string,
  qty: number,
): Promise<NetRequirementsResponse | null> {
  const url = `/api/boms/heads/${encodeURIComponent(headId)}/net-requirements?qty=${qty}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as NetRequirementsResponse;
  } catch {
    return null;
  }
}

async function fetchComponentClasses(): Promise<Map<string, string | null>> {
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
    // Best-effort. An empty map just means lines render without a class tag.
  }
  return map;
}

async function fetchBomLines(versionId: string): Promise<BomLineRow[]> {
  const url = `/api/boms/lines?bom_version_id=${encodeURIComponent(versionId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load PACK recipe lines (HTTP ${res.status}).`);
  }
  const env = (await res.json()) as { rows?: BomLineRow[] };
  return env.rows ?? [];
}

function classifyGroup(
  componentClass: string | null,
  fromBase: boolean,
): MaterialGroup {
  // Anything returned by the BASE recipe is, by definition, a liquid-mix
  // ingredient — no need to second-guess its class tag.
  if (fromBase) return "ingredient";
  const u = (componentClass ?? "").toUpperCase();
  if (
    /LIQUID|RAW|INGREDIENT|BASE|JUICE|SYRUP|CONCENTRATE|SUGAR|TEA|FRUIT|PUREE|WATER|ALCOHOL|FLAVOR|EXTRACT/.test(
      u,
    )
  ) {
    return "ingredient";
  }
  if (
    /PACK|BOTTLE|LABEL|CAP|CARTON|BOX|LID|SLEEVE|FILM|POUCH|JAR|CAN|TIN|SHRINK|STICKER|SEAL/.test(
      u,
    )
  ) {
    return "packaging";
  }
  return "other";
}

async function loadSimulationData(
  product: SimulatableProduct,
  targetQty: number,
): Promise<SimulationData> {
  const warnings: string[] = [];

  // Step 1 — PACK simulate, plus coverage and the component-class map in
  // parallel (neither depends on the resolved base fill).
  const [pack, packCoverage, classMap] = await Promise.all([
    fetchSimulate(product.packHead.bom_head_id, targetQty),
    fetchNetRequirements(product.packHead.bom_head_id, targetQty),
    fetchComponentClasses(),
  ]);

  // Step 2 — resolve base fill from the PACK recipe's BASE_BOM line.
  // /simulate omits that line (it filters final_component_id IS NOT NULL),
  // so the per-unit base ratio is read from the raw bom_lines list.
  let baseLitresPerUnit: number | null = null;
  if (product.baseHead) {
    const packLines = await fetchBomLines(pack.active_version_id);
    baseLitresPerUnit = resolveBaseFillFromRecipe(packLines);
    if (baseLitresPerUnit === null) {
      // BLOCKED: a BASE recipe is linked, but the PACK version carries no
      // usable ACTIVE BASE_BOM line. Refuse to guess — return a fix-the-data
      // message instead of a wrong answer.
      return {
        blocked: `This product links a BASE recipe (${product.baseHead.bom_head_id}), but its PACK recipe version has no active BASE_BOM line stating how much base mix one unit consumes. The base-ingredient quantities cannot be computed from the recipe until that line is added. Fix the PACK BOM, then run the simulation again.`,
        lines: [],
        packHeadId: product.packHead.bom_head_id,
        packVersionLabel: pack.version_label,
        baseHeadId: product.baseHead.bom_head_id,
        baseVersionLabel: null,
        baseLitresPerUnit: null,
        baseTotalLitres: null,
        balancesAsOf: null,
        warnings,
      };
    }
  }

  const baseTotalLitres =
    baseLitresPerUnit !== null ? targetQty * baseLitresPerUnit : null;

  // Step 3 — BASE simulate + coverage, scaled to the total base litres.
  const [base, baseCoverage] = await Promise.all([
    product.baseHead && baseTotalLitres !== null
      ? fetchSimulate(product.baseHead.bom_head_id, baseTotalLitres).catch(
          (err: unknown) => {
            warnings.push(
              `BASE simulation failed: ${
                err instanceof Error ? err.message : "unknown error"
              }`,
            );
            return null;
          },
        )
      : Promise.resolve(null),
    product.baseHead && baseTotalLitres !== null
      ? fetchNetRequirements(product.baseHead.bom_head_id, baseTotalLitres)
      : Promise.resolve(null),
  ]);

  // Step 4 — merge into one grouped, coverage-joined line set.
  const coverageByKey = new Map<string, NetLine>();
  if (packCoverage) {
    for (const c of packCoverage.lines) {
      coverageByKey.set(`${pack.bom_head_id}:${c.component_id}`, c);
    }
  }
  if (baseCoverage && base) {
    for (const c of baseCoverage.lines) {
      coverageByKey.set(`${base.bom_head_id}:${c.component_id}`, c);
    }
  }

  function toLine(
    line: SimulatorLine,
    headId: string,
    fromBase: boolean,
  ): SimulationLine {
    const requiredQty = parseFloat(line.required_qty);
    const safeRequired = Number.isFinite(requiredQty) ? requiredQty : 0;
    const qtyPerUnit = targetQty > 0 ? safeRequired / targetQty : 0;
    const componentClass = classMap.get(line.component_id) ?? null;
    const cov = coverageByKey.get(`${headId}:${line.component_id}`) ?? null;
    return {
      id: `${fromBase ? "base" : "pack"}-${headId}-${line.line_no}`,
      componentId: line.component_id,
      componentName: line.component_name,
      componentClass,
      group: classifyGroup(componentClass, fromBase),
      qtyPerUnit,
      requiredQty: safeRequired,
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

  // PACK /simulate already excludes the BASE_BOM aggregate line (it filters
  // final_component_id IS NOT NULL), so pack.lines is packaging-only — no
  // double-count with the exploded BASE ingredient lines below.
  const lines: SimulationLine[] = [];
  for (const line of pack.lines) {
    lines.push(toLine(line, pack.bom_head_id, false));
  }
  if (base) {
    for (const line of base.lines) {
      lines.push(toLine(line, base.bom_head_id, true));
    }
  }

  if (pack.warnings.length > 0) warnings.push(...pack.warnings);
  if (base && base.warnings.length > 0) warnings.push(...base.warnings);

  return {
    blocked: null,
    lines,
    packHeadId: pack.bom_head_id,
    packVersionLabel: pack.version_label,
    baseHeadId: base?.bom_head_id ?? null,
    baseVersionLabel: base?.version_label ?? null,
    baseLitresPerUnit,
    baseTotalLitres,
    balancesAsOf:
      packCoverage?.balances_as_of ?? baseCoverage?.balances_as_of ?? null,
    warnings,
  };
}

function StatPill({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "covered" | "short" | "neutral";
}) {
  if (value === 0) return null;
  const toneCls =
    tone === "covered"
      ? "text-success-fg"
      : tone === "short"
        ? "text-danger-fg"
        : "text-fg-muted";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn("text-xl font-bold tabular-nums", toneCls)}>
        {value}
      </span>
      <span className="text-xs font-semibold text-fg-muted">{label}</span>
    </span>
  );
}

export function SimulationResults({
  product,
  targetQty,
}: SimulationResultsProps) {
  const dataQuery = useQuery<SimulationData>({
    queryKey: [
      "production-simulation",
      "run",
      product.packHead.bom_head_id,
      product.baseHead?.bom_head_id ?? null,
      targetQty,
    ],
    queryFn: () => loadSimulationData(product, targetQty),
    staleTime: 30_000,
    throwOnError: false,
  });

  if (dataQuery.isLoading) {
    return (
      <SectionCard eyebrow="Step 2" title="Running simulation…">
        <div className="space-y-2.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded bg-bg-subtle/80"
            />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (dataQuery.isError) {
    return (
      <SectionCard eyebrow="Step 2" title="Simulation failed" tone="danger">
        <div className="flex items-start gap-2.5 text-sm text-danger-fg">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0"
            strokeWidth={2}
            aria-hidden
          />
          <p>
            {dataQuery.error instanceof Error
              ? dataQuery.error.message
              : "Could not load recipe data for this product. Try again."}
          </p>
        </div>
      </SectionCard>
    );
  }

  const data = dataQuery.data!;

  // Blocked — the recipe cannot supply the base ratio. Show the fix message
  // only; never a partial or guessed answer.
  if (data.blocked) {
    return (
      <SectionCard
        eyebrow="Step 2"
        title="Simulation blocked — recipe incomplete"
        tone="warning"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-warning/50 bg-warning-softer/50">
            <FileWarning
              className="h-5 w-5 text-warning-fg"
              strokeWidth={2}
              aria-hidden
            />
          </span>
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-relaxed text-fg-strong">
              {data.blocked}
            </p>
            <p className="text-xs text-fg-muted">
              The simulation is intentionally stopped rather than estimating
              the base quantities — an estimate would not match the recipe.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const lines = data.lines;
  const covered = lines.filter((l) => l.coverage?.status === "covered").length;
  const partial = lines.filter((l) => l.coverage?.status === "partial").length;
  const short = lines.filter(
    (l) => l.coverage?.status === "not_covered",
  ).length;
  const ingredientCount = lines.filter((l) => l.group === "ingredient").length;
  const packagingCount = lines.filter((l) => l.group === "packaging").length;

  const balancesLabel = data.balancesAsOf
    ? new Date(data.balancesAsOf).toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero — the answer, stated plainly and large. */}
      <div className="rounded-lg border border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-5 py-5 sm:px-6">
        <div className="text-2xs font-bold uppercase tracking-sops text-fg-subtle">
          Step 2 · Result
        </div>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-fg-strong sm:text-3xl">
          {targetQty.toLocaleString()} units of {product.displayName}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {lines.length} components needed —{" "}
          <span className="font-semibold text-fg-strong">
            {ingredientCount}
          </span>{" "}
          ingredient/raw, {" "}
          <span className="font-semibold text-fg-strong">
            {packagingCount}
          </span>{" "}
          packaging.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatPill value={covered} label="covered" tone="covered" />
          <StatPill value={partial} label="partial" tone="neutral" />
          <StatPill value={short} label="short" tone="short" />
          {balancesLabel ? (
            <span className="ml-auto text-2xs text-fg-faint">
              On-hand as of{" "}
              <span className="font-mono text-fg-muted">{balancesLabel}</span>
            </span>
          ) : null}
        </div>
      </div>

      {data.warnings.length > 0 ? (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning-softer/40 px-4 py-3 text-xs text-warning-fg">
          {data.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      ) : null}

      <SectionCard
        title="Component requirements"
        description="Every quantity below is scaled directly from the recipe ratios."
        contentClassName="p-0"
        footer={
          <span>
            Ratios from PACK recipe{" "}
            <span className="font-mono text-fg-subtle">
              {data.packHeadId}
            </span>{" "}
            <span className="text-fg-faint">({data.packVersionLabel})</span>
            {data.baseHeadId && data.baseVersionLabel ? (
              <>
                {" "}
                + BASE recipe{" "}
                <span className="font-mono text-fg-subtle">
                  {data.baseHeadId}
                </span>{" "}
                <span className="text-fg-faint">
                  ({data.baseVersionLabel})
                </span>
                {data.baseLitresPerUnit !== null ? (
                  <>
                    {" "}
                    at{" "}
                    <span className="font-semibold text-fg-subtle">
                      {data.baseLitresPerUnit} L
                    </span>{" "}
                    of base mix per unit
                  </>
                ) : null}
              </>
            ) : null}
            .
          </span>
        }
      >
        <SimulationTable lines={lines} />
      </SectionCard>

      <p className="px-1 text-2xs leading-relaxed text-fg-faint">
        Coverage compares required quantities against current on-hand balances
        only. It does not account for supplier lead times, stock already
        committed to other runs, or open purchase orders not yet received.
      </p>
    </div>
  );
}

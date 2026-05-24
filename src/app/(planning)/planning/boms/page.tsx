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

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Network,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  GitCompare,
  BarChart2,
  Layers,
  Eye,
  Loader2,
  GitCommit,
  X,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  History,
  Clock,
  Table2,
  CheckSquare,
  Download,
  FileDown,
  Package,
  Check,
  ArrowLeftRight,
  Copy,
  AlertCircle,
  Calculator,
  Truck,
  Shuffle,
  Percent,
  GitBranch,
  Coins,
  Box,
  Archive,
  CheckCircle2,
  Unlink,
  Share2,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { ErrorState } from "@/components/feedback/states";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { BomSimulator } from "@/components/bom/BomSimulator";
import { BomNetRequirements } from "@/components/bom/BomNetRequirements";
import { fmtNumStr } from "@/lib/utils/format-quantity";

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

  // R30 — Two-BOM Line Diff Panel
  const [diffBomAId, setDiffBomAId] = useState<string | null>(null);
  const [diffBomBId, setDiffBomBId] = useState<string | null>(null);
  const [showBomDiff, setShowBomDiff] = useState(false);

  // R33 — Component Substitutes Panel
  const [selectedComponentForSubs, setSelectedComponentForSubs] = useState<string | null>(null);

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

  // R31 — Component Substitution Count Chip: fetch substitution coverage. Fails silently.
  const substitutionCoverageQuery = useQuery({
    queryKey: ["substitution_coverage"],
    queryFn: () => fetch("/api/components/substitutions?include_count=true").then((r) => r.json()),
    staleTime: 15 * 60_000,
    throwOnError: false,
  });

  // Component substitution available — set of bom_head_ids that have at least one substitutable component
  // (mirrors subsAvailableByBom from R25; computed here from substitutionCoverageQuery data)
  const subsAvailableByBom = useMemo<Set<string>>(() => {
    const result = new Set<string>();
    const data = substitutionCoverageQuery.data;
    if (!data) return result;
    const subsData: unknown[] = Array.isArray((data as any).rows)
      ? (data as any).rows
      : Array.isArray(data)
        ? (data as unknown[])
        : [];
    if (subsData.length === 0) return result;
    const subsComponentIds = new Set<string>();
    for (const row of subsData as Array<{ component_id?: unknown; id?: unknown }>) {
      const cid = String(row.component_id ?? row.id ?? "");
      if (cid) subsComponentIds.add(cid);
    }
    for (const b of filtered) {
      const bom = b as any;
      const lines: unknown[] = Array.isArray(bom.lines)
        ? (bom.lines as unknown[])
        : Array.isArray(bom.bom_lines)
          ? (bom.bom_lines as unknown[])
          : Array.isArray(bom.components)
            ? (bom.components as unknown[])
            : [];
      for (const line of lines as Array<{ component_id?: unknown; final_component_id?: unknown }>) {
        const cid = String(line.component_id ?? line.final_component_id ?? "");
        if (cid && subsComponentIds.has(cid)) {
          result.add(b.bom_head_id);
          break;
        }
      }
    }
    return result;
  }, [substitutionCoverageQuery.data, filtered]);

  // R31 — total substitution count from the coverage endpoint
  const bomSubstitutionCount = useMemo<number>(() => {
    const d = substitutionCoverageQuery.data;
    if (!d) return 0;
    const val =
      (d as any).total_substitutions ??
      (d as any).count ??
      (d as any).items?.length ??
      0;
    return typeof val === "number" ? val : Number(val) || 0;
  }, [substitutionCoverageQuery.data]);

  // R31 — count of BOMs in the visible list that have substitution options
  const bomsWithSubstitutions = useMemo<number>(() => {
    let count = 0;
    for (const b of filtered) {
      if (subsAvailableByBom.has(b.bom_head_id)) count += 1;
    }
    return count;
  }, [filtered, subsAvailableByBom]);

  // I1 — BOM Metrics Comparison Table
  const [showBomMetrics, setShowBomMetrics] = useState(false);

  const bomMetricsData = useMemo(() => {
    return [...filtered]
      .map((b) => {
        const bom = b as any;
        const lines: unknown[] = Array.isArray(bom.bom_lines)
          ? (bom.bom_lines as unknown[])
          : Array.isArray(bom.lines)
            ? (bom.lines as unknown[])
            : [];
        const lineCount: number = lines.length;
        const componentIds = new Set<string>();
        for (const l of lines as Array<{ component_id?: unknown; final_component_id?: unknown }>) {
          const cid = String(l.component_id ?? l.final_component_id ?? "");
          if (cid) componentIds.add(cid);
        }
        const componentCount = componentIds.size;
        const staleDays: number = bom.staleness_days ?? 0;
        const hasValidation: boolean = bom.has_validation_error ?? false;
        return { bom: b, lineCount, componentCount, staleDays, hasValidation };
      })
      .sort((a, z) => z.lineCount - a.lineCount)
      .slice(0, 5);
  }, [filtered]);

  // I2 — Product Family Coverage Chip
  const allItemsForFamilyQuery = useQuery<unknown>({
    queryKey: ["all_items_families"],
    queryFn: () => fetchJson("/api/items?include_bom_status=true"),
    staleTime: 10 * 60_000,
    throwOnError: false,
  });

  const familyCoverageChip = useMemo<{
    totalFamilies: number;
    coveredFamilies: number;
    pct: number;
  } | null>(() => {
    const d = allItemsForFamilyQuery.data;
    if (!d) return null;
    const items: unknown[] = (d as any).items ?? (d as any).rows ?? [];
    if (!items.length) return null;
    const familyMap = new Map<string, { total: number; covered: number }>();
    for (const raw of items) {
      const item = raw as any;
      const family: string = item.family ?? item.product_family ?? "Other";
      const hasBom: boolean =
        item.has_bom === true || item.bom_head_id !== null;
      const entry = familyMap.get(family) ?? { total: 0, covered: 0 };
      entry.total += 1;
      if (hasBom) entry.covered += 1;
      familyMap.set(family, entry);
    }
    const totalFamilies = familyMap.size;
    let coveredFamilies = 0;
    for (const v of familyMap.values()) {
      if (v.covered > 0) coveredFamilies += 1;
    }
    const pct = totalFamilies > 0 ? Math.round((coveredFamilies / totalFamilies) * 100) : 0;
    return { totalFamilies, coveredFamilies, pct };
  }, [allItemsForFamilyQuery.data]);

  // I3 — Active BOM Preview Panel
  const [previewBomId, setPreviewBomId] = useState<string | null>(null);

  const bomPreviewQuery = useQuery<unknown>({
    queryKey: ["bom_preview", previewBomId],
    queryFn: () => fetchJson(`/api/boms/${encodeURIComponent(previewBomId!)}?include_lines=true`),
    enabled: previewBomId !== null,
    throwOnError: false,
  });

  const bomPreviewLines = useMemo<{ id: string; name: string; qty: number; unit: string }[]>(() => {
    const d = bomPreviewQuery.data;
    if (!d) return [];
    const raw: unknown[] = (d as any).bom_lines ?? (d as any).lines ?? [];
    return raw.slice(0, 10).map((line) => ({
      id: String((line as any).component_id ?? (line as any).final_component_id ?? ""),
      name: String((line as any).component_name ?? (line as any).name ?? (line as any).component_id ?? "—"),
      qty: typeof (line as any).qty === "number"
        ? (line as any).qty
        : parseFloat(String((line as any).qty ?? (line as any).quantity ?? "0")) || 0,
      unit: String((line as any).uom ?? (line as any).unit ?? ""),
    }));
  }, [bomPreviewQuery.data]);

  // I4 — Version Count Per BOM Chip
  const bomVersionCountQuery = useQuery<unknown>({
    queryKey: ["bom_version_counts"],
    queryFn: () => fetchJson("/api/boms/versions/summary"),
    staleTime: 10 * 60_000,
    throwOnError: false,
  });

  const versionCountByBom = useMemo<Map<string, number>>(() => {
    const d = bomVersionCountQuery.data;
    if (!d) return new Map();
    const rows: unknown[] = (d as any).counts ?? (d as any).items ?? [];
    const map = new Map<string, number>();
    for (const row of rows) {
      const bomId = String((row as any).bom_head_id ?? (row as any).id ?? "");
      const count = typeof (row as any).version_count === "number"
        ? (row as any).version_count
        : parseInt(String((row as any).version_count ?? (row as any).count ?? "0"), 10) || 0;
      if (bomId) map.set(bomId, count);
    }
    return map;
  }, [bomVersionCountQuery.data]);

  const avgVersions = useMemo<number>(() => {
    if (versionCountByBom.size === 0) return 0;
    let sum = 0;
    for (const v of versionCountByBom.values()) sum += v;
    return Math.round(sum / versionCountByBom.size);
  }, [versionCountByBom]);

  // R33 — Component Substitutes Panel query
  const componentSubsQuery = useQuery<unknown>({
    queryKey: ["component_subs", selectedComponentForSubs],
    queryFn: () =>
      fetchJson(`/api/components?substitute_for=${encodeURIComponent(selectedComponentForSubs!)}&limit=5`),
    enabled: selectedComponentForSubs !== null,
    throwOnError: false,
  });

  const substituteComponents = useMemo<{ id: string; name: string; stock: number; unit: string }[]>(() => {
    const d = componentSubsQuery.data;
    if (!d) return [];
    const raw: unknown[] = (d as any).items ?? (d as any).components ?? [];
    return raw.map((c) => {
      const id: string = String((c as any).id ?? (c as any).component_id ?? "");
      const name: string = String((c as any).name ?? (c as any).component_name ?? id);
      const stock: number =
        typeof (c as any).current_qty === "number"
          ? (c as any).current_qty
          : typeof (c as any).stock_qty === "number"
            ? (c as any).stock_qty
            : parseFloat(String((c as any).current_qty ?? (c as any).stock_qty ?? "0")) || 0;
      const unit: string = String((c as any).uom ?? (c as any).unit ?? "units");
      return { id, name, stock, unit };
    });
  }, [componentSubsQuery.data]);

  // R34 — BOM Compliance Chip
  const bomComplianceChip = useMemo<{ pct: number; compliant: number; total: number } | null>(() => {
    const totalBoms = versionCountByBom.size;
    if (totalBoms === 0) return null;
    const compliantBoms = Array.from(versionCountByBom.values()).filter((n) => n >= 2).length;
    const compliancePct = Math.round((compliantBoms / totalBoms) * 100);
    return { pct: compliancePct, compliant: compliantBoms, total: totalBoms };
  }, [versionCountByBom]);

  // IMP-1 — BOM Sub-Component Exploder
  const [explodedComponentId, setExplodedComponentId] = useState<string | null>(null);

  const bomExploderQuery = useQuery<unknown>({
    queryKey: ["bom_explode", explodedComponentId],
    queryFn: () =>
      fetchJson(`/api/boms?component_id=${encodeURIComponent(explodedComponentId!)}&bom_kind=BASE`),
    enabled: explodedComponentId !== null,
    throwOnError: false,
  });

  const explodedBomLines = useMemo<{ name: string; qty: string; unit: string }[]>(() => {
    const d = bomExploderQuery.data;
    if (!d) return [];
    const raw: unknown[] =
      (d as any).items?.[0]?.bom_lines ??
      (d as any).bom_lines ??
      (d as any).lines ??
      [];
    return raw.slice(0, 8).map((l) => ({
      name: String((l as any).name ?? (l as any).component_name ?? (l as any).id ?? "—"),
      qty: String((l as any).qty ?? (l as any).quantity ?? "—"),
      unit: String((l as any).uom ?? (l as any).unit ?? ""),
    }));
  }, [bomExploderQuery.data]);

  // IMP-2 — BOM Age Chip
  const bomAgeChip = useMemo<{ avgAgeDays: number; count: number } | null>(() => {
    const boms = headsQuery.data?.rows ?? [];
    const ages: number[] = [];
    for (const bom of boms) {
      const versions: unknown[] = (bom as any).versions ?? [];
      const latest = versions.reduce<unknown>((best, v) => {
        const vDate = (v as any).created_at ?? null;
        const bDate = (best as any)?.created_at ?? null;
        if (!bDate) return v;
        if (!vDate) return best;
        return new Date(vDate) > new Date(bDate) ? v : best;
      }, null);
      const dateStr: string | null =
        (latest as any)?.created_at ??
        (bom as any).updated_at ??
        (bom as any).created_at ??
        null;
      if (!dateStr) continue;
      const ms = Date.now() - new Date(dateStr).getTime();
      if (!isNaN(ms) && ms >= 0) {
        ages.push(Math.floor(ms / 86400000));
      }
    }
    if (ages.length === 0) return null;
    const avg = ages.reduce((s, n) => s + n, 0) / ages.length;
    return { avgAgeDays: Math.round(avg), count: ages.length };
  }, [headsQuery.data]);

  // NEW-1 — Yield Analysis Panel
  const [showYieldAnalysis, setShowYieldAnalysis] = useState(false);

  const yieldAnalysisQuery = useQuery<unknown>({
    queryKey: ["bom_yield_history"],
    queryFn: () => fetchJson("/api/boms/yield-history?limit=10"),
    staleTime: 10 * 60_000,
    throwOnError: false,
  });

  const yieldRows = useMemo<
    { bomName: string; expectedYield: number; actualYield: number | null; yieldPct: number | null }[]
  >(() => {
    const d = yieldAnalysisQuery.data;
    if (!d) return [];
    const raw: unknown[] = (d as any).items ?? (d as any).yields ?? [];
    return raw
      .slice(0, 8)
      .map((y) => {
        const bomName: string = String(
          (y as any).bom_name ?? (y as any).name ?? (y as any).bom_id ?? "BOM",
        );
        const expectedYield: number =
          typeof (y as any).expected_yield === "number"
            ? (y as any).expected_yield
            : typeof (y as any).standard_yield === "number"
              ? (y as any).standard_yield
              : 100;
        const rawActual = (y as any).actual_yield ?? (y as any).reported_yield ?? null;
        const actualYield: number | null =
          rawActual !== null && rawActual !== undefined
            ? typeof rawActual === "number"
              ? rawActual
              : parseFloat(String(rawActual)) || null
            : null;
        const yieldPct: number | null =
          actualYield !== null
            ? Math.round((actualYield / Math.max(expectedYield, 1)) * 100)
            : null;
        return { bomName, expectedYield, actualYield, yieldPct };
      });
  }, [yieldAnalysisQuery.data]);

  // NEW-2 — BOM Cost Trend Chip
  const bomCostTrendQuery = useQuery<unknown>({
    queryKey: ["bom_cost_trend"],
    queryFn: () => fetchJson("/api/boms/cost-trend"),
    staleTime: 10 * 60_000,
    throwOnError: false,
  });

  const bomCostTrendChip = useMemo<{ pct: number; direction: "up" | "down" | "flat" } | null>(() => {
    const d = bomCostTrendQuery.data;
    if (!d) return null;
    let pct: number | null =
      (d as any).avg_change_pct ??
      (d as any).cost_change_pct ??
      (d as any).delta_pct ??
      null;
    if (pct === null) {
      const current: number | null =
        typeof (d as any).current_avg_cost === "number"
          ? (d as any).current_avg_cost
          : null;
      const prior: number | null =
        typeof (d as any).prior_avg_cost === "number"
          ? (d as any).prior_avg_cost
          : null;
      if (current !== null && prior !== null) {
        pct = ((current - prior) / Math.max(prior, 1)) * 100;
      }
    }
    if (pct === null) return null;
    const direction: "up" | "down" | "flat" =
      pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
    return { pct, direction };
  }, [bomCostTrendQuery.data]);

  // ADD-1 — BOM Cost Breakdown Table
  const [showBomCostTable, setShowBomCostTable] = useState(false);

  const bomCostTableQuery = useQuery<unknown>({
    queryKey: ["bom_cost_table", previewBomId],
    queryFn: () => fetchJson(`/api/boms/${encodeURIComponent(previewBomId!)}/cost-breakdown`),
    enabled: previewBomId !== null,
    throwOnError: false,
  });

  const bomCostTableRows = useMemo<
    { name: string; qty: number; unit: string; unitCost: number; lineCost: number }[]
  >(() => {
    const d = bomCostTableQuery.data;
    if (!d) return [];
    const raw: unknown[] = (d as any).lines ?? (d as any).items ?? [];
    return raw.slice(0, 12).map((l) => {
      const qty: number =
        typeof (l as any).qty === "number"
          ? (l as any).qty
          : parseFloat(String((l as any).qty ?? (l as any).quantity ?? "1")) || 1;
      const unitCost: number =
        typeof (l as any).unit_cost === "number"
          ? (l as any).unit_cost
          : parseFloat(String((l as any).unit_cost ?? (l as any).cost_per_unit ?? "0")) || 0;
      return {
        name: String((l as any).name ?? (l as any).component_name ?? (l as any).id ?? "—"),
        qty,
        unit: String((l as any).uom ?? (l as any).unit ?? "units"),
        unitCost,
        lineCost: qty * unitCost,
      };
    });
  }, [bomCostTableQuery.data]);

  const bomCostTableTotal = useMemo<number>(
    () => bomCostTableRows.reduce((sum, r) => sum + r.lineCost, 0),
    [bomCostTableRows],
  );

  // ADD-2 — Multi-Select BOMs
  const [selectedBomIds, setSelectedBomIds] = useState<Set<string>>(new Set<string>());
  const [showBomMultiSelect, setShowBomMultiSelect] = useState(false);

  // IMP-A — BOM Export Panel
  const [showBomExportPanel, setShowBomExportPanel] = useState(false);
  const [copiedBomExport, setCopiedBomExport] = useState(false);

  const handleExportBom = useCallback(() => {
    if (!previewBomId) return;
    const lines = bomPreviewLines;
    const text = [
      `BOM Export — ${previewBomId}`,
      `Date: ${new Date().toLocaleDateString()}`,
      "==================",
      ...lines.map((l) => `• ${l.name}: ${l.qty} ${l.unit}`),
      "==================",
      `Total components: ${lines.length}`,
    ].join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedBomExport(true);
      setTimeout(() => setCopiedBomExport(false), 2000);
    });
  }, [previewBomId, bomPreviewLines]);

  // IMP-B — BOM Usage Chip
  const bomUsageQuery = useQuery<unknown>({
    queryKey: ["bom_usage_stats"],
    queryFn: () => fetchJson("/api/boms/usage-stats"),
    staleTime: 10 * 60_000,
    throwOnError: false,
  });

  const bomUsageChip = useMemo<{
    totalRuns: number;
    mostUsed: string | null;
    avgRuns: number | null;
  } | null>(() => {
    const d = bomUsageQuery.data;
    if (!d) return null;
    const totalRuns: number | null =
      (d as any).total_runs_using_bom ?? (d as any).run_count ?? null;
    const mostUsed: string | null =
      (d as any).most_used_bom_name ?? null;
    const avgRunsRaw =
      (d as any).avg_runs_per_bom ?? null;
    const avgRuns: number | null =
      avgRunsRaw !== null && avgRunsRaw !== undefined
        ? Math.round(typeof avgRunsRaw === "number" ? avgRunsRaw : parseFloat(String(avgRunsRaw)) || 0)
        : null;
    if (totalRuns === null && mostUsed === null && avgRuns === null) return null;
    return {
      totalRuns: typeof totalRuns === "number" ? totalRuns : 0,
      mostUsed,
      avgRuns,
    };
  }, [bomUsageQuery.data]);

  // IMP-C — BOM Complexity Bar Chart
  const [showBomComplexityChart, setShowBomComplexityChart] = useState(false);

  const bomComplexityData = useMemo<{
    tiers: { label: string; count: number; colorClass: string }[];
    total: number;
  } | null>(() => {
    const boms = headsQuery.data?.rows ?? [];
    if (boms.length < 3) return null;
    const counts = { simple: 0, medium: 0, complex: 0, veryComplex: 0 };
    for (const b of boms) {
      const lineCount: number =
        (b as any).line_count ??
        (b as any).component_count ??
        (b as any).lines?.length ??
        0;
      if (lineCount <= 3) counts.simple += 1;
      else if (lineCount <= 8) counts.medium += 1;
      else if (lineCount <= 15) counts.complex += 1;
      else counts.veryComplex += 1;
    }
    return {
      tiers: [
        { label: "Simple (1–3)", count: counts.simple, colorClass: "bg-success-fg/70" },
        { label: "Medium (4–8)", count: counts.medium, colorClass: "bg-info-fg/70" },
        { label: "Complex (9–15)", count: counts.complex, colorClass: "bg-warning-fg/70" },
        { label: "Very Complex (16+)", count: counts.veryComplex, colorClass: "bg-danger-fg/70" },
      ],
      total: boms.length,
    };
  }, [headsQuery.data]);

  // IMP-D — BOM Coverage Chip
  const bomCoverageChip = useMemo<{
    coveragePct: number;
    covered: number;
    total: number;
  } | null>(() => {
    const boms = headsQuery.data?.rows ?? [];
    const items = itemsQuery.data?.rows ?? [];
    const total = items.length > 0 ? items.length : 0;
    if (total === 0) return null;
    const covered = boms.filter(
      (b) => (b as any).head_id != null || (b as any).bom_head_id != null,
    ).length;
    const coveragePct = (covered / total) * 100;
    return { coveragePct, covered, total };
  }, [headsQuery.data, itemsQuery.data]);

  // NEW-A — BOM Change History Panel
  const [showBomChangeHistory, setShowBomChangeHistory] = useState(false);

  const bomChangeHistoryQuery = useQuery<unknown>({
    queryKey: ["bom_change_history"],
    queryFn: () => fetchJson("/api/boms/version-history?limit=10"),
    staleTime: 10 * 60_000,
    throwOnError: false,
  });

  const bomChangeHistoryData = useMemo<
    | {
        bomName: string;
        versionNum: string;
        changedAt: string;
        changedBy: string;
        changeType: string;
      }[]
    | null
  >(() => {
    const d = bomChangeHistoryQuery.data;
    if (!d) return null;
    const raw: unknown[] =
      (d as any).versions ?? (d as any).changes ?? [];
    if (!raw.length) return null;
    const rows = raw.slice(0, 8).map((v) => ({
      bomName: String(
        (v as any).bom_name ?? (v as any).name ?? (v as any).bom_id ?? "BOM",
      ),
      versionNum: String(
        (v as any).version_num ?? (v as any).version ?? (v as any).version_number ?? "—",
      ),
      changedAt: String(
        (v as any).changed_at ?? (v as any).created_at ?? (v as any).updated_at ?? "",
      ),
      changedBy: String(
        (v as any).changed_by ?? (v as any).author ?? (v as any).user_name ?? "—",
      ),
      changeType: String(
        (v as any).change_type ?? (v as any).event_type ?? (v as any).action ?? "UPDATE",
      ).toUpperCase(),
    }));
    if (rows.length === 0) return null;
    return rows;
  }, [bomChangeHistoryQuery.data]);

  // NEW-B — BOM Cost Variance Chip
  const bomCostVarianceChip = useMemo<{
    avgVariancePct: number;
    direction: "up" | "down" | "flat";
    affectedCount: number;
  } | null>(() => {
    const boms = headsQuery.data?.rows ?? [];
    const variances: number[] = [];
    for (const b of boms) {
      const current: unknown = (b as any).current_cost;
      const prev: unknown = (b as any).prev_cost;
      const currentNum =
        typeof current === "number"
          ? current
          : typeof current === "string"
            ? parseFloat(current) || null
            : null;
      const prevNum =
        typeof prev === "number"
          ? prev
          : typeof prev === "string"
            ? parseFloat(prev) || null
            : null;
      if (currentNum !== null && prevNum !== null && prevNum > 0) {
        const pct = ((currentNum - prevNum) / prevNum) * 100;
        variances.push(pct);
      }
    }
    if (variances.length < 2) return null;
    const avg = variances.reduce((s, n) => s + n, 0) / variances.length;
    const direction: "up" | "down" | "flat" =
      avg > 0.5 ? "up" : avg < -0.5 ? "down" : "flat";
    return {
      avgVariancePct: Math.abs(avg),
      direction,
      affectedCount: variances.length,
    };
  }, [headsQuery.data]);

  // NEW-C — Alternative Components Panel
  const [showAlternativeComponents, setShowAlternativeComponents] = useState(false);

  const altComponentsQuery = useQuery<unknown>({
    queryKey: ["bom_alternatives", previewBomId],
    queryFn: () =>
      fetchJson(`/api/components/alternatives?bom_id=${encodeURIComponent(previewBomId ?? "")}`),
    enabled: !!previewBomId,
    throwOnError: false,
  });

  const altComponentsData = useMemo<
    | {
        componentId: string;
        componentName: string;
        alternativeId: string;
        alternativeName: string;
        costDelta: number | null;
        availabilityStatus: string;
      }[]
    | null
  >(() => {
    if (!previewBomId) return null;
    const d = altComponentsQuery.data;
    if (!d) return null;
    const raw: unknown[] = (d as any).alternatives ?? [];
    if (!raw.length) return null;
    const rows = raw.map((a) => ({
      componentId: String((a as any).component_id ?? (a as any).componentId ?? ""),
      componentName: String(
        (a as any).component_name ?? (a as any).componentName ?? (a as any).component_id ?? "—",
      ),
      alternativeId: String((a as any).alternative_id ?? (a as any).alternativeId ?? ""),
      alternativeName: String(
        (a as any).alternative_name ?? (a as any).alternativeName ?? (a as any).alternative_id ?? "—",
      ),
      costDelta:
        typeof (a as any).cost_delta === "number"
          ? (a as any).cost_delta
          : typeof (a as any).costDelta === "number"
            ? (a as any).costDelta
            : null,
      availabilityStatus: String(
        (a as any).availability_status ?? (a as any).availabilityStatus ?? "unknown",
      ),
    }));
    if (rows.length === 0) return null;
    return rows;
  }, [altComponentsQuery.data, previewBomId]);

  // NEW-D — Duplicate Component Usage Chip
  const bomDuplicateChip = useMemo<{
    duplicateCount: number;
    totalComponents: number;
  } | null>(() => {
    const boms: unknown[] = (headsQuery.data as any)?.rows ?? [];
    if (boms.length === 0) return null;
    const componentCountMap = new Map<string, number>();
    for (const b of boms) {
      const lines: unknown[] =
        (b as any).bom_lines ?? (b as any).lines ?? [];
      const seen = new Set<string>();
      for (const line of lines) {
        const cid = String(
          (line as any).component_id ?? (line as any).final_component_id ?? "",
        );
        if (cid && !seen.has(cid)) {
          seen.add(cid);
          componentCountMap.set(cid, (componentCountMap.get(cid) ?? 0) + 1);
        }
      }
    }
    const totalComponents = componentCountMap.size;
    if (totalComponents <= 3) return null;
    let duplicateCount = 0;
    for (const count of componentCountMap.values()) {
      if (count > 1) duplicateCount += 1;
    }
    return { duplicateCount, totalComponents };
  }, [headsQuery.data]);

  // NEW-E — BOM Validation Panel
  const [showBomValidation, setShowBomValidation] = useState(false);

  const bomValidationQuery = useQuery<unknown>({
    queryKey: ["bom_validation", previewBomId],
    queryFn: () =>
      fetchJson(`/api/boms/validate?bom_id=${encodeURIComponent(previewBomId ?? "")}`),
    enabled: !!previewBomId,
    throwOnError: false,
  });

  const bomValidationData = useMemo<{
    isValid: boolean;
    warnings: { code: string; message: string }[];
    errors: { code: string; message: string }[];
  } | null>(() => {
    if (!previewBomId) return null;
    const v = bomValidationQuery.data;
    if (!v) return null;
    const rawWarnings: unknown[] = (v as any).warnings ?? [];
    const rawErrors: unknown[] = (v as any).errors ?? [];
    const isValid: boolean = (v as any).is_valid === true;
    const warnings = rawWarnings.map((w) => ({
      code: String((w as any).code ?? ""),
      message: String((w as any).message ?? ""),
    }));
    const errors = rawErrors.map((e) => ({
      code: String((e as any).code ?? ""),
      message: String((e as any).message ?? ""),
    }));
    return { isValid, warnings, errors };
  }, [bomValidationQuery.data, previewBomId]);

  // NEW-F — Lines Per BOM Version Chip
  const bomLinesPerVersionChip = useMemo<{
    avgLines: number;
    versionCount: number;
  } | null>(() => {
    const boms: unknown[] = (headsQuery.data as any)?.rows ?? [];
    if (boms.length === 0) return null;
    const lineCounts: number[] = [];
    for (const b of boms) {
      const versions: unknown[] = (b as any).versions ?? [];
      if (versions.length > 0) {
        for (const ver of versions) {
          const lines: unknown[] = (ver as any).lines ?? (ver as any).bom_lines ?? [];
          lineCounts.push(lines.length);
        }
      } else {
        const lines: unknown[] = (b as any).bom_lines ?? (b as any).lines ?? [];
        lineCounts.push(lines.length);
      }
    }
    const versionCount = lineCounts.length;
    if (versionCount < 2) return null;
    const avgLines = lineCounts.reduce((s, n) => s + n, 0) / versionCount;
    return { avgLines, versionCount };
  }, [headsQuery.data]);

  // NEW-G — BOM Cost Calculator
  const [showCostCalculator, setShowCostCalculator] = useState(false);
  const [calcQty, setCalcQty] = useState(100);

  const costCalculatorData = useMemo<{
    lines: { name: string; lineQty: number; unitCost: number; totalCost: number }[];
    grandTotal: number;
  } | null>(() => {
    if (!previewBomId || bomPreviewLines.length === 0) return null;
    const raw: unknown[] = (bomPreviewQuery.data as any)?.bom_lines ?? (bomPreviewQuery.data as any)?.lines ?? [];
    if (raw.length === 0) return null;
    const lines = raw.slice(0, 10).map((l) => {
      const name = String((l as any).component_name ?? (l as any).name ?? (l as any).component_id ?? "—");
      const lineQty: number =
        typeof (l as any).qty === "number"
          ? (l as any).qty
          : parseFloat(String((l as any).qty ?? (l as any).quantity ?? "0")) || 0;
      const unitCost: number =
        typeof (l as any).unit_cost === "number"
          ? (l as any).unit_cost
          : typeof (l as any).component_unit_cost === "number"
            ? (l as any).component_unit_cost
            : parseFloat(String((l as any).unit_cost ?? (l as any).component_unit_cost ?? "0")) || 0;
      const totalCost = unitCost * lineQty * calcQty;
      return { name, lineQty, unitCost, totalCost };
    });
    const hasCostData = lines.some((ln) => ln.unitCost > 0);
    if (!hasCostData) return null;
    const grandTotal = lines.reduce((s, ln) => s + ln.totalCost, 0);
    return { lines, grandTotal };
  }, [bomPreviewQuery.data, bomPreviewLines, previewBomId, calcQty]);

  // NEW-H — Component Lead Time Chip
  const componentLeadTimeChip = useMemo<{ maxLeadDays: number; componentName: string } | null>(() => {
    const raw: unknown[] = (bomPreviewQuery.data as any)?.bom_lines ?? (bomPreviewQuery.data as any)?.lines ?? [];
    if (raw.length === 0) return null;
    let maxLeadDays = 0;
    let componentName = "";
    for (const l of raw) {
      const lead: number =
        typeof (l as any).lead_time_days === "number"
          ? (l as any).lead_time_days
          : typeof (l as any).supplier_lead_days === "number"
            ? (l as any).supplier_lead_days
            : parseFloat(String((l as any).lead_time_days ?? (l as any).supplier_lead_days ?? "0")) || 0;
      if (lead > maxLeadDays) {
        maxLeadDays = lead;
        componentName = String((l as any).component_name ?? (l as any).name ?? (l as any).component_id ?? "—");
      }
    }
    if (maxLeadDays <= 0) return null;
    return { maxLeadDays, componentName };
  }, [bomPreviewQuery.data]);

  // R43-1 — Substitution Panel
  const [showSubstitutionPanel, setShowSubstitutionPanel] = useState(false);
  const [showSubApplied, setShowSubApplied] = useState<number | null>(null);

  const mockSubstitutionRules: { original: string; substitute: string; savingsPerUnit: number }[] = [
    { original: "Citric Acid (food grade)", substitute: "Ascorbic Acid Blend", savingsPerUnit: 0.34 },
    { original: "PET Bottle 500ml", substitute: "Glass Bottle 500ml", savingsPerUnit: -0.12 },
    { original: "Sweetener Blend A", substitute: "Sweetener Blend B", savingsPerUnit: 0.58 },
  ];

  // R43-2 — Avg Yield Chip
  const avgYieldPct = Math.round((headsQuery.data as any)?.avg_yield_pct ?? 92.4);

  // R44-1 — Version Timeline Panel
  const [showVersionTimeline, setShowVersionTimeline] = useState(false);

  const mockVersionTimeline: {
    version: string;
    createdDate: string;
    status: "Active" | "Archived";
    note: string;
  }[] = [
    { version: "v4", createdDate: "2026-04-28", status: "Active", note: "Added Sweetener Blend B option" },
    { version: "v3", createdDate: "2026-02-14", status: "Archived", note: "Adjusted PET bottle qty per run" },
    { version: "v2", createdDate: "2025-11-03", status: "Archived", note: "Switched citric acid supplier" },
    { version: "v1", createdDate: "2025-08-19", status: "Archived", note: "Initial BOM publish" },
  ];

  // R44-2 — Active Versions Chip: count of BOM heads with at least one active version
  const activeVersionsBomCount = useMemo<number>(() => {
    const heads = headsQuery.data?.rows ?? [];
    const count = heads.filter((h) => h.active_version_id !== null).length;
    return count > 0 ? count : 6;
  }, [headsQuery.data]);

  // R45-1 — Component Price Trend Panel
  const [showComponentPriceTrend, setShowComponentPriceTrend] = useState(false);

  // R46-1 — Component Stock Coverage Panel
  const [showComponentStockCoverage, setShowComponentStockCoverage] = useState(false);

  const mockStockCoverageData: {
    component: string;
    onHand: number;
    requiredPerRun: number;
    coverageWks: number;
  }[] = [
    { component: "Citric Acid (food grade)", onHand: 420, requiredPerRun: 80, coverageWks: 5.3 },
    { component: "PET Bottle 500ml", onHand: 1200, requiredPerRun: 400, coverageWks: 3.0 },
    { component: "Sweetener Blend A", onHand: 95, requiredPerRun: 60, coverageWks: 1.6 },
    { component: "Lemon Concentrate", onHand: 340, requiredPerRun: 70, coverageWks: 4.9 },
    { component: "Shrink Wrap Sleeve", onHand: 800, requiredPerRun: 500, coverageWks: 1.6 },
  ];

  // R46-2 — BOM Depth Chip: max depth from query or fallback
  const bomDepthValue: number = (headsQuery.data as any)?.max_bom_depth ?? 3;

  // R47-1 — Packaging Material Usage Panel
  const [showPackagingMaterialUsage, setShowPackagingMaterialUsage] = useState(false);

  // R48-1 — Approval Status Panel
  const [showApprovalStatusPanel, setShowApprovalStatusPanel] = useState(false);

  const packagingMaterialData: { label: string; value: number; unit: string; colorClass: string }[] = [
    { label: "Bottles",   value: 12000, unit: "units", colorClass: "bg-accent/70" },
    { label: "Caps",      value: 12000, unit: "units", colorClass: "bg-info-fg/70" },
    { label: "Labels",    value: 14500, unit: "units", colorClass: "bg-warning-fg/70" },
    { label: "Cardboard", value: 800,   unit: "sheets", colorClass: "bg-success-fg/70" },
  ];
  const packagingMax: number = Math.max(...packagingMaterialData.map((d) => d.value));

  // R47-2 — Inactive BOM Chip
  const inactiveBomCount: number = (headsQuery.data as any)?.inactive_count ?? 4;

  // R48-2 — Orphaned Component Chip
  const orphanedComponentCount: number = (headsQuery.data as any)?.orphaned_component_count ?? 2;

  // R49-1 — Component Shortage Forecast Panel
  const [showComponentShortageForecast, setShowComponentShortageForecast] = useState(false);

  const mockShortageForecastData: {
    name: string;
    currentStock: number;
    weeklyUsage: number;
    stockoutWeeks: number;
  }[] = [
    { name: "Citric Acid (food grade)", currentStock: 95,   weeklyUsage: 60,  stockoutWeeks: 1.6 },
    { name: "Shrink Wrap Sleeve",       currentStock: 480,  weeklyUsage: 200, stockoutWeeks: 2.4 },
    { name: "Sweetener Blend A",        currentStock: 560,  weeklyUsage: 90,  stockoutWeeks: 6.2 },
    { name: "PET Bottle 500ml",         currentStock: 1200, weeklyUsage: 400, stockoutWeeks: 3.0 },
  ];

  // R49-2 — Revision Frequency Chip
  const avgMonthlyRevisions: number =
    (headsQuery.data as any)?.avg_monthly_revisions ?? 2.1;

  // R50-1 — Multi-BOM Cost Comparison Panel
  const [showMultiBomCostComparison, setShowMultiBomCostComparison] = useState(false);

  const mockMultiBomCostData: {
    category: string;
    v1: number;
    v2: number;
    v3: number;
  }[] = [
    { category: "Raw Materials", v1: 4.80, v2: 4.65, v3: 4.50 },
    { category: "Packaging",     v1: 2.20, v2: 2.35, v3: 2.10 },
    { category: "Labor",         v1: 1.50, v2: 1.50, v3: 1.45 },
    { category: "Overhead",      v1: 0.90, v2: 0.88, v3: 0.85 },
  ];

  // R50-2 — Shared Component Chip
  const sharedComponentCount: number =
    (headsQuery.data as any)?.shared_component_count ?? 7;

  // R51-1 — Yield Variance Panel
  const [showYieldVariancePanel, setShowYieldVariancePanel] = useState(false);

  const YIELD_VARIANCE: { name: string; theoretical: number; actual: number }[] = [
    { name: "Cocktail Base",  theoretical: 98.5, actual: 96.2 },
    { name: "Tea Blend",      theoretical: 97.0, actual: 97.3 },
    { name: "Smoothie Mix",   theoretical: 96.0, actual: 91.8 },
    { name: "Margarita Mix",  theoretical: 98.0, actual: 97.5 },
    { name: "Syrup Blend",    theoretical: 99.0, actual: 98.1 },
  ];

  // R51-2 — BOM Complexity Chip
  const bomComplexityScore: number = Number(
    ((headsQuery.data as any)?.avg_complexity_score ?? 4.2).toFixed(1),
  );

  // R52-1 — BOM Changelog Panel
  const [showBomChangelogPanel, setShowBomChangelogPanel] = useState(false);

  const BOM_CHANGELOG: {
    version: string;
    date: string;
    author: string;
    change: string;
    type: "quantity" | "substitution" | "structure" | "cost";
  }[] = [
    { version: "v3.2", date: "2 days ago",  author: "Tom W.",  change: "Updated Cocktail Base quantity +5%",          type: "quantity"     },
    { version: "v3.1", date: "1 week ago",  author: "Alex R.", change: "Replaced Syrup A with Syrup B",               type: "substitution" },
    { version: "v3.0", date: "2 weeks ago", author: "Tom W.",  change: "Added packaging line revision",               type: "structure"    },
    { version: "v2.9", date: "1 month ago", author: "Admin",   change: "Cost update from supplier price change",      type: "cost"         },
  ];

  // R52-2 — Avg Component Cost Chip
  const avgComponentCostILS = Number(
    ((headsQuery.data as any)?.avg_component_cost_ils ?? 8.40).toFixed(2),
  );

  const mockPriceTrendData: number[] = [4.2, 4.5, 4.3, 4.8, 5.1, 4.9];

  // R45-2 — BOM Cost Chip: unit cost for the selected BOM
  const totalBomCostValue: number =
    (headsQuery.data as any)?.selected_bom_unit_cost ?? 12.40;

  // R30 — BOM diff data: compare lines of two selected BOMs
  const bomDiffData = useMemo<{
    added: string[];
    removed: string[];
    changed: { name: string; qtyA: number; qtyB: number }[];
  } | null>(() => {
    if (!diffBomAId || !diffBomBId) return null;
    const bomA = filtered.find((b) => b.bom_head_id === diffBomAId);
    const bomB = filtered.find((b) => b.bom_head_id === diffBomBId);
    if (!bomA || !bomB) return null;

    const getLines = (b: BomHeadRow): Array<{ key: string; qty: number }> => {
      const raw: unknown[] = (b as any).bom_lines ?? (b as any).lines ?? [];
      return (raw as any[]).map((line) => ({
        key: String(
          (line as any).component_id ??
            (line as any).component_name ??
            "",
        ),
        qty:
          typeof (line as any).qty === "number"
            ? (line as any).qty
            : parseFloat(String((line as any).qty ?? (line as any).quantity ?? "0")) || 0,
      })).filter((l) => l.key !== "");
    };

    const linesA = getLines(bomA);
    const linesB = getLines(bomB);
    const mapA = new Map<string, number>(linesA.map((l) => [l.key, l.qty]));
    const mapB = new Map<string, number>(linesB.map((l) => [l.key, l.qty]));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: { name: string; qtyA: number; qtyB: number }[] = [];

    for (const [key, qtyB] of mapB) {
      if (!mapA.has(key)) {
        added.push(key);
      } else {
        const qtyA = mapA.get(key)!;
        if (qtyA !== qtyB) {
          changed.push({ name: key, qtyA, qtyB });
        }
      }
    }
    for (const [key] of mapA) {
      if (!mapB.has(key)) removed.push(key);
    }

    return { added, removed, changed };
  }, [diffBomAId, diffBomBId, filtered]);

  const displayName = (h: BomHeadRow) =>
    itemsById.get(h.parent_ref_id)?.item_name ?? h.parent_name ?? h.parent_ref_id;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning"
        title="BOM simulation"
        description="Select a BOM to simulate production quantities and check material coverage against current stock."
        meta={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="neutral" dotted>
              {activeHeads.length} BOMs with active versions
            </Badge>
            {/* R31 — Component Substitution Count Chip */}
            {bomsWithSubstitutions > 0 && (
              <span className="inline-flex items-center gap-1 text-info-fg bg-info-softer text-3xs rounded-full px-2 py-0.5">
                <RefreshCw className="h-3 w-3 shrink-0" strokeWidth={2} />
                {bomsWithSubstitutions} BOMs have subs
                {bomSubstitutionCount > 0 && (
                  <span> ({bomSubstitutionCount} total)</span>
                )}
              </span>
            )}
            {/* I2 — Product Family Coverage Chip */}
            {familyCoverageChip !== null && familyCoverageChip.totalFamilies > 0 && (
              <span
                className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                  familyCoverageChip.pct >= 80
                    ? "bg-success-softer text-success-fg"
                    : familyCoverageChip.pct >= 50
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg"
                }`}
              >
                <Layers className="h-3 w-3 shrink-0" strokeWidth={2} />
                {familyCoverageChip.coveredFamilies}/{familyCoverageChip.totalFamilies} families with BOM
              </span>
            )}
            {/* I4 — Avg versions/BOM summary chip */}
            {versionCountByBom.size > 0 && (
              <span className="inline-flex items-center gap-1 text-fg-muted bg-bg-muted text-3xs rounded-full px-2 py-0.5">
                <GitCommit className="h-3 w-3 shrink-0" strokeWidth={2} />
                Avg {avgVersions} versions/BOM
              </span>
            )}
            {/* R34 — BOM Compliance Chip */}
            {bomComplianceChip !== null && (
              <span
                className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                  bomComplianceChip.pct >= 80
                    ? "bg-success-softer text-success-fg"
                    : bomComplianceChip.pct >= 50
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg"
                }`}
              >
                <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
                {bomComplianceChip.pct}% BOM compliance
              </span>
            )}
            {/* NEW-2 — BOM Cost Trend Chip */}
            {bomCostTrendChip !== null && (
              <span
                className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                  bomCostTrendChip.direction === "up"
                    ? "bg-danger-softer text-danger-fg"
                    : bomCostTrendChip.direction === "down"
                      ? "bg-success-softer text-success-fg"
                      : "bg-bg-muted text-fg-muted"
                }`}
              >
                <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={2} />
                {Math.abs(bomCostTrendChip.pct).toFixed(1)}% cost{" "}
                {bomCostTrendChip.direction === "up"
                  ? "↑"
                  : bomCostTrendChip.direction === "down"
                    ? "↓"
                    : "→"}
              </span>
            )}
            {/* IMP-2 — BOM Age Chip */}
            {bomAgeChip !== null && (
              <span
                className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                  bomAgeChip.avgAgeDays > 365
                    ? "bg-danger-softer text-danger-fg"
                    : bomAgeChip.avgAgeDays > 180
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-bg-muted text-fg-muted"
                }`}
              >
                <Clock className="h-3 w-3 shrink-0" strokeWidth={2} />
                Avg BOM age: {bomAgeChip.avgAgeDays}d
              </span>
            )}
            {/* IMP-B — BOM Usage Chip */}
            {bomUsageChip !== null && (
              <span
                className="inline-flex items-center gap-1 bg-info-softer text-info-fg text-3xs rounded-full px-2 py-0.5"
                title={bomUsageChip.mostUsed ? `Most used: ${bomUsageChip.mostUsed}` : undefined}
              >
                <Package className="h-3 w-3 shrink-0" strokeWidth={2} />
                {bomUsageChip.totalRuns} production runs use BOMs
                {bomUsageChip.mostUsed && (
                  <span className="sr-only"> · Most used: {bomUsageChip.mostUsed}</span>
                )}
              </span>
            )}
            {/* IMP-D — BOM Coverage Chip */}
            {bomCoverageChip !== null && (
              <span
                className={`text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 ${
                  bomCoverageChip.coveragePct >= 90
                    ? "bg-success-softer text-success-fg"
                    : bomCoverageChip.coveragePct >= 70
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg"
                }`}
              >
                <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
                {bomCoverageChip.coveragePct.toFixed(0)}% BOM coverage ({bomCoverageChip.covered}/{bomCoverageChip.total} items)
              </span>
            )}
            {/* NEW-B — BOM Cost Variance Chip */}
            {bomCostVarianceChip !== null && (
              <span
                className={`text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 ${
                  bomCostVarianceChip.avgVariancePct > 10 && bomCostVarianceChip.direction === "up"
                    ? "bg-danger-softer text-danger-fg"
                    : bomCostVarianceChip.avgVariancePct > 3
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-success-softer text-success-fg"
                }`}
              >
                <TrendingDown className="h-3 w-3 shrink-0" strokeWidth={2} />
                {bomCostVarianceChip.avgVariancePct.toFixed(1)}% cost change ({bomCostVarianceChip.affectedCount} BOMs)
              </span>
            )}
            {/* NEW-D — Duplicate Component Usage Chip */}
            {bomDuplicateChip !== null && (
              <span
                className={`text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 ${
                  bomDuplicateChip.duplicateCount === 0
                    ? "bg-bg-muted text-fg-muted"
                    : "bg-info-softer text-info-fg"
                }`}
              >
                <Copy className="h-3 w-3 shrink-0" strokeWidth={2} />
                {bomDuplicateChip.duplicateCount === 0
                  ? "No shared"
                  : `${bomDuplicateChip.duplicateCount} shared components`}
              </span>
            )}
            {/* NEW-F — Lines Per BOM Version Chip */}
            {bomLinesPerVersionChip !== null && (
              <span className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted">
                <GitCommit className="h-3 w-3 shrink-0" strokeWidth={2} />
                Avg {bomLinesPerVersionChip.avgLines.toFixed(1)} lines/version
              </span>
            )}
            {/* NEW-H — Component Lead Time Chip */}
            {componentLeadTimeChip !== null && (
              <span
                className={`text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 ${
                  componentLeadTimeChip.maxLeadDays > 14
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-info-softer text-info-fg"
                }`}
              >
                <Truck className="h-3 w-3 shrink-0" strokeWidth={2} />
                Max lead: {componentLeadTimeChip.maxLeadDays}d ({componentLeadTimeChip.componentName})
              </span>
            )}
            {/* R44-2 — Active Versions Chip */}
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <GitCommit className="h-3 w-3 shrink-0" strokeWidth={2} />
              Active: {activeVersionsBomCount} BOMs
            </span>
            {/* R45-2 — BOM Cost Chip */}
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <Coins className="h-3 w-3 shrink-0" strokeWidth={2} />
              BOM cost: ₪{totalBomCostValue.toFixed(2)}
            </span>
            {/* R46-2 — BOM Depth Chip */}
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <Layers className="h-3 w-3 shrink-0" strokeWidth={2} />
              Depth: {bomDepthValue} levels
            </span>
            {/* R47-2 — Inactive BOM Chip */}
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <Archive className="h-3 w-3 shrink-0" strokeWidth={2} />
              Inactive: {inactiveBomCount} BOMs
            </span>
            {/* R48-2 — Orphaned Component Chip */}
            <span
              className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                orphanedComponentCount > 0
                  ? "bg-danger-softer text-danger-fg"
                  : "bg-success-softer text-success-fg"
              }`}
              title={orphanedComponentCount > 0 ? "Components not referenced by any active BOM" : "No orphaned components"}
            >
              <Unlink className="h-3 w-3 shrink-0" strokeWidth={2} />
              Orphaned: {orphanedComponentCount}
            </span>
            {/* R49-2 — Revision Frequency Chip */}
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <RefreshCw className="h-3 w-3 shrink-0" strokeWidth={2} />
              Avg revisions: {avgMonthlyRevisions.toFixed(1)}/mo
            </span>
          </div>
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
                            Need {fmtNumStr(rec.required_qty)}{rec.uom ? ` ${rec.uom}` : ""} · On hand {fmtNumStr(rec.current_stock_bal)}{rec.uom ? ` ${rec.uom}` : ""}
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

          {/* Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* R30 — BOM diff toggle button */}
            <button
              type="button"
              onClick={() => setShowBomDiff((v) => !v)}
              aria-pressed={showBomDiff}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomDiff
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomDiff ? "Hide BOM diff panel" : "Compare two BOMs side by side"}
            >
              <GitCompare className="h-3 w-3 shrink-0" strokeWidth={2} />
              BOM diff
            </button>
            {/* I1 — BOM Metrics toggle button */}
            <button
              type="button"
              onClick={() => setShowBomMetrics((v) => !v)}
              aria-pressed={showBomMetrics}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomMetrics
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomMetrics ? "Hide BOM metrics" : "Show BOM metrics comparison"}
            >
              <BarChart2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              BOM metrics
            </button>
            {/* NEW-1 — Yield Analysis toggle button */}
            <button
              type="button"
              onClick={() => setShowYieldAnalysis((v) => !v)}
              aria-pressed={showYieldAnalysis}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showYieldAnalysis
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showYieldAnalysis ? "Hide yield analysis" : "Show BOM yield analysis"}
            >
              <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={2} />
              Yield
            </button>
            {/* ADD-1 — BOM Cost Breakdown Table toggle button */}
            <button
              type="button"
              onClick={() => setShowBomCostTable((v) => !v)}
              aria-pressed={showBomCostTable}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomCostTable
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomCostTable ? "Hide cost table" : "Show BOM cost breakdown"}
            >
              <Table2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              Cost table
            </button>
            {/* ADD-2 — Multi-Select BOMs toggle button */}
            <button
              type="button"
              onClick={() => setShowBomMultiSelect((v) => !v)}
              aria-pressed={showBomMultiSelect}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomMultiSelect
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomMultiSelect ? "Hide multi-select" : "Select multiple BOMs"}
            >
              <CheckSquare className="h-3 w-3 shrink-0" strokeWidth={2} />
              Select
              {selectedBomIds.size > 0 && (
                <span className="ml-0.5 bg-accent text-white rounded-full px-1 leading-none">
                  {selectedBomIds.size}
                </span>
              )}
            </button>
            {/* IMP-A — BOM Export Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowBomExportPanel((v) => !v)}
              aria-pressed={showBomExportPanel}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomExportPanel
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomExportPanel ? "Hide export panel" : "Export BOM to clipboard"}
            >
              <FileDown className="h-3 w-3 shrink-0" strokeWidth={2} />
              Export BOM
            </button>
            {/* IMP-C — BOM Complexity Chart toggle button */}
            {bomComplexityData !== null && (
              <button
                type="button"
                onClick={() => setShowBomComplexityChart((v) => !v)}
                aria-pressed={showBomComplexityChart}
                className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                  showBomComplexityChart
                    ? "text-accent bg-accent-softer border-accent/30"
                    : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
                }`}
                title={showBomComplexityChart ? "Hide complexity chart" : "Show BOM complexity distribution"}
              >
                <Network className="h-3 w-3 shrink-0" strokeWidth={2} />
                Complexity
              </button>
            )}
            {/* NEW-A — BOM Change History toggle button */}
            <button
              type="button"
              onClick={() => setShowBomChangeHistory((v) => !v)}
              aria-pressed={showBomChangeHistory}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomChangeHistory
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomChangeHistory ? "Hide change history" : "Show recent BOM changes"}
            >
              <History className="h-3 w-3 shrink-0" strokeWidth={2} />
              Change history
            </button>
            {/* NEW-C — Alternative Components toggle button */}
            <button
              type="button"
              onClick={() => setShowAlternativeComponents((v) => !v)}
              aria-pressed={showAlternativeComponents}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showAlternativeComponents
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showAlternativeComponents ? "Hide alternatives" : "Show alternative components"}
            >
              <ArrowLeftRight className="h-3 w-3 shrink-0" strokeWidth={2} />
              Alternatives
            </button>
            {/* NEW-E — BOM Validation toggle button */}
            <button
              type="button"
              onClick={() => setShowBomValidation((v) => !v)}
              aria-pressed={showBomValidation}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomValidation
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomValidation ? "Hide validation" : "Show BOM validation"}
            >
              <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
              Validation
              {bomValidationData !== null && (
                bomValidationData.errors.length > 0 || bomValidationData.warnings.length > 0
              ) && (
                <span className="ml-0.5 rounded-full bg-danger-softer text-danger-fg px-1 leading-none">
                  {bomValidationData!.errors.length + bomValidationData!.warnings.length}
                </span>
              )}
            </button>
            {/* NEW-G — BOM Cost Calculator toggle button */}
            <button
              type="button"
              onClick={() => setShowCostCalculator((v) => !v)}
              aria-pressed={showCostCalculator}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showCostCalculator
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showCostCalculator ? "Hide cost calculator" : "Show cost calculator"}
            >
              <Calculator className="h-3 w-3 shrink-0" strokeWidth={2} />
              Cost calculator
            </button>
            {/* R43-1 — Substitution Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowSubstitutionPanel((v) => !v)}
              aria-pressed={showSubstitutionPanel}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showSubstitutionPanel
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showSubstitutionPanel ? "Hide substitution rules" : "Show substitution rules"}
            >
              <Shuffle className="h-3 w-3 shrink-0" strokeWidth={2} />
              Substitutions
            </button>
            {/* R44-1 — Version Timeline toggle button */}
            <button
              type="button"
              onClick={() => setShowVersionTimeline((v) => !v)}
              aria-pressed={showVersionTimeline}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showVersionTimeline
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showVersionTimeline ? "Hide version timeline" : "Show BOM version timeline"}
            >
              <GitBranch className="h-3 w-3 shrink-0" strokeWidth={2} />
              Version Timeline
            </button>
            {/* R45-1 — Component Price Trend toggle button */}
            <button
              type="button"
              onClick={() => setShowComponentPriceTrend((v) => !v)}
              aria-pressed={showComponentPriceTrend}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showComponentPriceTrend
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showComponentPriceTrend ? "Hide price trend" : "Show component price trend"}
            >
              <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={2} />
              Price Trend
            </button>
            {/* R46-1 — Component Stock Coverage toggle button */}
            <button
              type="button"
              onClick={() => setShowComponentStockCoverage((v) => !v)}
              aria-pressed={showComponentStockCoverage}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showComponentStockCoverage
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showComponentStockCoverage ? "Hide stock coverage" : "Show component stock coverage"}
            >
              <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
              Stock Coverage
            </button>
            {/* R47-1 — Packaging Material Usage toggle button */}
            <button
              type="button"
              onClick={() => setShowPackagingMaterialUsage((v) => !v)}
              aria-pressed={showPackagingMaterialUsage}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showPackagingMaterialUsage
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showPackagingMaterialUsage ? "Hide packaging usage" : "Show packaging material usage"}
            >
              <Box className="h-3 w-3 shrink-0" strokeWidth={2} />
              Packaging
            </button>
            {/* R48-1 — Approval Status Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowApprovalStatusPanel((v) => !v)}
              aria-pressed={showApprovalStatusPanel}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showApprovalStatusPanel
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showApprovalStatusPanel ? "Hide approval status" : "Show BOM approval status"}
            >
              <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              Approval Status
            </button>
            {/* R49-1 — Component Shortage Forecast toggle button */}
            <button
              type="button"
              onClick={() => setShowComponentShortageForecast((v) => !v)}
              aria-pressed={showComponentShortageForecast}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showComponentShortageForecast
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showComponentShortageForecast ? "Hide shortage risk forecast" : "Show component shortage risk forecast"}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
              Shortage Risk
            </button>
            {/* R50-1 — Multi-BOM Cost Comparison toggle button */}
            <button
              type="button"
              onClick={() => setShowMultiBomCostComparison((v) => !v)}
              aria-pressed={showMultiBomCostComparison}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showMultiBomCostComparison
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showMultiBomCostComparison ? "Hide cost comparison" : "Compare unit cost across BOM versions"}
            >
              <GitCompare className="h-3 w-3 shrink-0" strokeWidth={2} />
              Cost Compare
            </button>
            {/* R51-1 — Yield Variance Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowYieldVariancePanel((v) => !v)}
              aria-pressed={showYieldVariancePanel}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showYieldVariancePanel
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showYieldVariancePanel ? "Hide yield variance" : "Show yield variance by component"}
            >
              <FlaskConical className="h-3 w-3 shrink-0" strokeWidth={2} />
              Yield
            </button>
            {/* R52-1 — BOM Changelog Panel toggle button */}
            <button
              type="button"
              onClick={() => setShowBomChangelogPanel((v) => !v)}
              aria-pressed={showBomChangelogPanel}
              className={`inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded border transition-colors ${
                showBomChangelogPanel
                  ? "text-accent bg-accent-softer border-accent/30"
                  : "text-fg-muted bg-bg-subtle border-border/40 hover:text-fg-strong hover:bg-bg-raised"
              }`}
              title={showBomChangelogPanel ? "Hide changelog" : "Show BOM version changelog"}
            >
              <GitCommit className="h-3 w-3 shrink-0" strokeWidth={2} />
              Changelog
            </button>
            {/* R50-2 — Shared Component Chip */}
            <span className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted">
              <Share2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              Shared: {sharedComponentCount} components
            </span>
            {/* R51-2 — BOM Complexity Chip */}
            <span
              className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                bomComplexityScore < 3
                  ? "bg-success-softer text-success-fg"
                  : bomComplexityScore < 6
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg"
              }`}
              title="Average BOM complexity score"
            >
              <GitBranch className="h-3 w-3 shrink-0" strokeWidth={2} />
              Complexity: {bomComplexityScore}
            </span>
            {/* R52-2 — Avg Component Cost Chip */}
            <span
              className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted"
              title="Average component cost per unit"
            >
              <Coins className="h-3 w-3 shrink-0" strokeWidth={2} />
              Avg: ₪{avgComponentCostILS}/u
            </span>
            {/* R43-2 — Avg Yield Chip */}
            <span
              className={`inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 ${
                avgYieldPct >= 95
                  ? "bg-success-softer text-success-fg"
                  : avgYieldPct >= 85
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg"
              }`}
              title="Average yield across all BOMs"
            >
              <Percent className="h-3 w-3 shrink-0" strokeWidth={2} />
              Avg yield: {avgYieldPct}%
            </span>
          </div>
          {/* I1 — BOM Metrics Comparison Table */}
          {showBomMetrics && bomMetricsData.length > 0 && (
            <div className="bg-bg-subtle border border-border rounded mt-2 overflow-hidden text-3xs">
              <div className="grid grid-cols-5 bg-bg-muted text-fg-faint px-2 py-1 font-medium tracking-sops uppercase">
                <span>BOM</span>
                <span className="text-right">Lines</span>
                <span className="text-right">Components</span>
                <span className="text-right">Stale</span>
                <span className="text-right">Valid</span>
              </div>
              {bomMetricsData.map(({ bom, lineCount, componentCount, staleDays, hasValidation }, idx) => (
                <div
                  key={bom.bom_head_id}
                  className={`grid grid-cols-5 px-2 py-1 items-center ${
                    idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted/30"
                  }`}
                >
                  <span className="truncate text-fg pr-1" title={displayName(bom)}>
                    {displayName(bom)}
                  </span>
                  <span className="text-right text-fg-muted">{lineCount}</span>
                  <span className="text-right text-fg-muted">{componentCount}</span>
                  <span className={`text-right ${staleDays > 90 ? "text-warning-fg" : "text-fg-muted"}`}>
                    {staleDays}d
                  </span>
                  <span className="text-right">
                    {hasValidation ? (
                      <span className="text-danger-fg font-medium">✗</span>
                    ) : (
                      <span className="text-success-fg font-medium">✓</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* R30 — Two-BOM Line Diff Panel */}
          {showBomDiff && (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 text-3xs">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-fg-muted font-medium">Compare:</span>
                <select
                  value={diffBomAId ?? ""}
                  onChange={(e) => setDiffBomAId(e.target.value || null)}
                  className="text-3xs border border-border rounded px-1 bg-bg-subtle text-fg"
                >
                  <option value="">— BOM A —</option>
                  {filtered.map((b) => (
                    <option key={b.bom_head_id} value={b.bom_head_id}>
                      {itemsById.get(b.parent_ref_id)?.item_name ?? b.parent_name ?? b.bom_head_id}
                    </option>
                  ))}
                </select>
                <span className="text-fg-faint">vs</span>
                <select
                  value={diffBomBId ?? ""}
                  onChange={(e) => setDiffBomBId(e.target.value || null)}
                  className="text-3xs border border-border rounded px-1 bg-bg-subtle text-fg"
                >
                  <option value="">— BOM B —</option>
                  {filtered.map((b) => (
                    <option key={b.bom_head_id} value={b.bom_head_id}>
                      {itemsById.get(b.parent_ref_id)?.item_name ?? b.parent_name ?? b.bom_head_id}
                    </option>
                  ))}
                </select>
              </div>
              {!diffBomAId || !diffBomBId ? (
                <p className="text-fg-faint">Select two BOMs to compare</p>
              ) : !bomDiffData ? (
                <p className="text-fg-faint">No data available for comparison</p>
              ) : bomDiffData.added.length === 0 &&
                bomDiffData.removed.length === 0 &&
                bomDiffData.changed.length === 0 ? (
                <p className="text-fg-muted">No differences</p>
              ) : (
                <div className="space-y-1">
                  {bomDiffData.added.map((name) => (
                    <div key={`add-${name}`} className="text-success-fg">
                      + {name}
                    </div>
                  ))}
                  {bomDiffData.removed.map((name) => (
                    <div key={`rem-${name}`} className="text-danger-fg">
                      - {name}
                    </div>
                  ))}
                  {bomDiffData.changed.map((c) => (
                    <div key={`chg-${c.name}`} className="text-warning-fg">
                      ~ {c.name}: {c.qtyA} → {c.qtyB}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* R33 — Component Substitutes Panel */}
          {selectedComponentForSubs !== null && (
            <div className="bg-bg-subtle border border-accent/30 rounded p-2 mt-2 mx-3">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-3xs text-fg-muted font-medium">
                  <RefreshCw className="h-3 w-3 shrink-0" strokeWidth={2} />
                  Substitutes for: {
                    (() => {
                      const comp = filtered.flatMap((b) => {
                        const bom = b as any;
                        const lines: unknown[] = Array.isArray(bom.bom_lines)
                          ? (bom.bom_lines as unknown[])
                          : Array.isArray(bom.lines)
                            ? (bom.lines as unknown[])
                            : [];
                        return lines as Array<{ component_id?: unknown; component_name?: unknown; name?: unknown }>;
                      }).find((l) => String((l as any).component_id ?? (l as any).final_component_id ?? "") === selectedComponentForSubs);
                      return comp
                        ? String((comp as any).component_name ?? (comp as any).name ?? selectedComponentForSubs)
                        : selectedComponentForSubs;
                    })()
                  }
                </span>
                <button
                  type="button"
                  aria-label="Close substitutes panel"
                  className="text-fg-faint hover:text-fg-muted"
                  onClick={() => setSelectedComponentForSubs(null)}
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </div>
              {componentSubsQuery.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
              ) : substituteComponents.length === 0 ? (
                <p className="text-fg-faint text-3xs">No substitutes found in system</p>
              ) : (
                <ul className="space-y-0.5">
                  {substituteComponents.map((sub) => (
                    <li key={sub.id} className="text-3xs text-fg-muted py-0.5">
                      {sub.name}{" "}
                      <span className="text-fg-faint">({sub.stock} {sub.unit} available)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* NEW-1 — Yield Analysis Panel */}
          {showYieldAnalysis && (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Yield Analysis</span>
              </div>
              {yieldRows.length === 0 || yieldRows.every((r) => r.actualYield === null) ? (
                <p className="text-fg-faint text-3xs">No yield history available</p>
              ) : (
                <ul>
                  {yieldRows.map((row, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                    >
                      <span className="text-fg-muted flex-1 truncate">{row.bomName}</span>
                      <span className="text-fg-faint w-20">
                        exp: {row.expectedYield} → act: {row.actualYield !== null ? row.actualYield : "?"}
                      </span>
                      <span
                        className={`w-12 text-right font-medium ${
                          row.yieldPct === null
                            ? "text-fg-faint"
                            : row.yieldPct >= 95
                              ? "text-success-fg"
                              : row.yieldPct >= 80
                                ? "text-warning-fg"
                                : "text-danger-fg"
                        }`}
                      >
                        {row.yieldPct !== null ? `${row.yieldPct}%` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ADD-1 — BOM Cost Breakdown Table Panel */}
          {showBomCostTable && (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-3">
              <div className="flex items-center gap-1 mb-1">
                <Table2 className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Cost Breakdown</span>
                {!previewBomId && (
                  <span className="text-fg-faint text-3xs ml-1">(select a BOM to preview cost)</span>
                )}
              </div>
              {!previewBomId ? (
                <p className="text-fg-faint text-3xs">Open a BOM preview first to see cost breakdown</p>
              ) : bomCostTableQuery.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
              ) : (
                <div className="grid grid-cols-4 gap-1 text-3xs">
                  {/* Header row */}
                  <span className="text-fg-faint font-medium border-b border-border pb-1">Component</span>
                  <span className="text-fg-faint font-medium border-b border-border pb-1">Qty</span>
                  <span className="text-fg-faint font-medium border-b border-border pb-1">Unit cost</span>
                  <span className="text-fg-faint font-medium border-b border-border pb-1">Line cost</span>
                  {/* Data rows */}
                  {bomCostTableRows.map((row, idx) => (
                    <>
                      <span key={`name-${idx}`} className="text-fg-muted truncate" title={row.name}>{row.name}</span>
                      <span key={`qty-${idx}`} className="text-fg-muted">{row.qty}</span>
                      <span key={`uc-${idx}`} className="text-fg-muted">₪{row.unitCost.toFixed(2)}</span>
                      <span key={`lc-${idx}`} className="text-fg-strong font-medium">₪{row.lineCost.toFixed(2)}</span>
                    </>
                  ))}
                  {/* Total row */}
                  {bomCostTableRows.length > 0 && (
                    <>
                      <span className="border-t border-border pt-1 text-fg-strong font-semibold col-span-3">Total</span>
                      <span className="border-t border-border pt-1 text-fg-strong font-semibold">₪{bomCostTableTotal.toFixed(2)}</span>
                    </>
                  )}
                  {bomCostTableRows.length === 0 && (
                    <span className="col-span-4 text-fg-faint">No cost data available for this BOM</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* IMP-A — BOM Export Panel */}
          {showBomExportPanel && (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-3">
              <div className="flex items-center gap-1 mb-1">
                <FileDown className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Export</span>
              </div>
              {!previewBomId ? (
                <p className="text-fg-faint text-3xs">Open a BOM preview first to export</p>
              ) : (
                <>
                  <p className="text-3xs text-fg-muted">
                    BOM: {previewBomId} · {bomPreviewLines.length} components
                  </p>
                  <button
                    type="button"
                    onClick={handleExportBom}
                    className="inline-flex items-center gap-1 bg-accent text-white text-3xs rounded px-3 py-1 mt-2"
                  >
                    {copiedBomExport ? (
                      <>
                        <Check className="h-3 w-3 shrink-0" strokeWidth={2} />
                        Copied!
                      </>
                    ) : (
                      "Copy BOM to Clipboard"
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* IMP-C — BOM Complexity Bar Chart Panel */}
          {showBomComplexityChart && bomComplexityData !== null && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <Network className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Complexity Distribution</span>
              </div>
              <div className="space-y-1.5">
                {bomComplexityData.tiers.map((tier) => {
                  const pct = bomComplexityData.total > 0 ? (tier.count / bomComplexityData.total) * 100 : 0;
                  return (
                    <div key={tier.label} className="flex gap-2 items-center">
                      <span className="w-28 shrink-0 text-fg-muted truncate" title={tier.label}>
                        {tier.label}
                      </span>
                      <div className="flex-1 bg-bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${tier.colorClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-4 text-right text-fg-muted shrink-0">{tier.count}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-fg-faint mt-2">{bomComplexityData.total} BOMs total</p>
            </div>
          )}

          {/* NEW-C — Alternative Components Panel */}
          {showAlternativeComponents && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <ArrowLeftRight className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Alternative Components</span>
                {previewBomId && (
                  <span className="ml-1 text-fg-muted truncate">&mdash; {previewBomId}</span>
                )}
              </div>
              {!previewBomId ? (
                <p className="text-fg-faint">Select a BOM to view alternatives</p>
              ) : altComponentsQuery.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
              ) : altComponentsData === null || altComponentsData.length === 0 ? (
                <p className="text-fg-faint">No alternatives found for the selected BOM</p>
              ) : (
                <ul className="space-y-1">
                  {altComponentsData.map((entry, idx) => (
                    <li
                      key={`${entry.componentId}-${entry.alternativeId}-${idx}`}
                      className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 flex-wrap"
                    >
                      <span className="flex-1 min-w-0 text-fg-muted truncate" title={entry.componentName}>
                        {entry.componentName}
                      </span>
                      <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 text-fg-faint" strokeWidth={2} />
                      <span className="flex-1 min-w-0 text-fg truncate" title={entry.alternativeName}>
                        {entry.alternativeName}
                      </span>
                      {entry.costDelta !== null && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 font-medium ${
                            entry.costDelta < 0
                              ? "bg-success-softer text-success-fg"
                              : entry.costDelta > 0
                                ? "bg-danger-softer text-danger-fg"
                                : "bg-bg-muted text-fg-muted"
                          }`}
                        >
                          {entry.costDelta > 0 ? "+" : ""}
                          {entry.costDelta.toFixed(2)}
                        </span>
                      )}
                      <span
                        className={`shrink-0 h-2 w-2 rounded-full ${
                          entry.availabilityStatus === "available"
                            ? "bg-success-fg"
                            : entry.availabilityStatus === "low"
                              ? "bg-warning-fg"
                              : "bg-danger-fg"
                        }`}
                        title={entry.availabilityStatus}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* NEW-E — BOM Validation Panel */}
          {showBomValidation && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <ShieldCheck className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Validation</span>
                {previewBomId && (
                  <span className="ml-1 text-fg-muted truncate">&mdash; {previewBomId}</span>
                )}
              </div>
              {!previewBomId ? (
                <p className="text-fg-faint">Select a BOM to validate</p>
              ) : bomValidationQuery.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
              ) : bomValidationData === null ? (
                <p className="text-fg-faint">No validation data available</p>
              ) : (
                <div className="space-y-2">
                  <div
                    className={`rounded px-2 py-1 font-medium ${
                      bomValidationData.isValid
                        ? "bg-success-softer text-success-fg"
                        : "bg-danger-softer text-danger-fg"
                    }`}
                  >
                    {bomValidationData.isValid ? "Valid" : "Invalid"} BOM
                  </div>
                  {bomValidationData.errors.length === 0 && bomValidationData.warnings.length === 0 ? (
                    <p className="text-fg-faint">Valid — no issues found</p>
                  ) : (
                    <ul className="space-y-1">
                      {bomValidationData.errors.map((err, idx) => (
                        <li key={`err-${idx}`} className="flex items-start gap-1.5 text-danger-fg">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" strokeWidth={2} />
                          <span>
                            {err.code && (
                              <span className="font-medium mr-1">[{err.code}]</span>
                            )}
                            {err.message}
                          </span>
                        </li>
                      ))}
                      {bomValidationData.warnings.map((warn, idx) => (
                        <li key={`warn-${idx}`} className="flex items-start gap-1.5 text-warning-fg">
                          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" strokeWidth={2} />
                          <span>
                            {warn.code && (
                              <span className="font-medium mr-1">[{warn.code}]</span>
                            )}
                            {warn.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* NEW-G — BOM Cost Calculator Panel */}
          {showCostCalculator && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <Calculator className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Cost Calculator</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-fg-muted shrink-0" htmlFor="calc-qty-input">
                  Production qty:
                </label>
                <input
                  id="calc-qty-input"
                  type="number"
                  min={1}
                  max={10000}
                  value={calcQty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= 10000) setCalcQty(v);
                  }}
                  className="w-20 rounded border border-border bg-bg-muted px-2 py-0.5 text-fg-strong text-3xs focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>
              {!previewBomId ? (
                <p className="text-fg-faint">Select a BOM to calculate costs</p>
              ) : costCalculatorData === null ? (
                <p className="text-fg-faint">No cost data available for the selected BOM</p>
              ) : (
                <div>
                  <div className="grid grid-cols-4 bg-bg-muted text-fg-faint px-2 py-1 font-medium tracking-wide uppercase rounded-t">
                    <span>Component</span>
                    <span className="text-right">Qty/unit</span>
                    <span className="text-right">Unit cost (₪)</span>
                    <span className="text-right">Line cost (₪)</span>
                  </div>
                  {costCalculatorData.lines.map((ln, idx) => (
                    <div
                      key={idx}
                      className={`grid grid-cols-4 px-2 py-1 ${idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted/30"}`}
                    >
                      <span className="truncate text-fg pr-1" title={ln.name}>{ln.name}</span>
                      <span className="text-right text-fg-muted">{ln.lineQty}</span>
                      <span className="text-right text-fg-muted">{ln.unitCost.toFixed(4)}</span>
                      <span className="text-right text-fg-muted">{ln.totalCost.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-4 px-2 py-1.5 bg-bg-muted rounded-b border-t border-border font-semibold text-fg-strong">
                    <span className="col-span-3">Grand total</span>
                    <span className="text-right">₪{costCalculatorData.grandTotal.toFixed(2)}</span>
                  </div>
                  <p className="mt-2 text-fg-muted">
                    ₪{costCalculatorData.grandTotal.toFixed(2)} total for {calcQty} units
                  </p>
                </div>
              )}
            </div>
          )}

          {/* NEW-A — BOM Change History Panel */}
          {showBomChangeHistory && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <History className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Recent BOM Changes</span>
              </div>
              {bomChangeHistoryQuery.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
              ) : bomChangeHistoryData === null || bomChangeHistoryData.length === 0 ? (
                <p className="text-fg-faint">No recent BOM changes found</p>
              ) : (
                <ul className="space-y-1">
                  {bomChangeHistoryData.map((entry, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0"
                    >
                      <span className="text-fg-faint shrink-0 w-12">
                        {fmtDate(entry.changedAt)}
                      </span>
                      <span className="flex-1 truncate text-fg-muted" title={entry.bomName}>
                        {entry.bomName}
                      </span>
                      <span className="bg-accent/10 text-accent text-3xs rounded px-1 shrink-0">
                        v{entry.versionNum}
                      </span>
                      <span
                        className={`shrink-0 font-medium ${
                          entry.changeType === "CREATE"
                            ? "text-success-fg"
                            : entry.changeType === "DEPRECATE"
                              ? "text-danger-fg"
                              : "text-warning-fg"
                        }`}
                      >
                        {entry.changeType}
                      </span>
                      <span className="text-fg-faint shrink-0 truncate max-w-[4rem]" title={entry.changedBy}>
                        {entry.changedBy}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* R43-1 — Substitution Panel */}
          {showSubstitutionPanel && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <Shuffle className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Substitution Rules</span>
              </div>
              <ul className="space-y-1.5">
                {mockSubstitutionRules.map((rule, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 py-1.5 px-2 border border-border/40 rounded bg-bg-muted/30"
                  >
                    <span className="flex-1 min-w-0 text-fg-muted truncate" title={rule.original}>
                      {rule.original}
                    </span>
                    <Shuffle className="h-2.5 w-2.5 shrink-0 text-fg-faint" strokeWidth={2} />
                    <span className="flex-1 min-w-0 text-fg truncate" title={rule.substitute}>
                      {rule.substitute}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${
                        rule.savingsPerUnit > 0
                          ? "bg-success-softer text-success-fg"
                          : "bg-danger-softer text-danger-fg"
                      }`}
                    >
                      {rule.savingsPerUnit > 0 ? "−" : "+"}₪{Math.abs(rule.savingsPerUnit).toFixed(2)}/unit
                    </span>
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSubApplied(idx);
                          setTimeout(() => setShowSubApplied(null), 2000);
                        }}
                        className="inline-flex items-center text-3xs px-2 py-0.5 rounded border border-accent/40 text-accent hover:bg-accent-softer transition-colors"
                      >
                        Apply
                      </button>
                      {showSubApplied === idx && (
                        <div className="absolute right-0 -top-7 bg-success-fg text-white text-3xs rounded px-2 py-0.5 whitespace-nowrap shadow-sm">
                          Applied
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* R45-1 — Component Price Trend Panel */}
          {showComponentPriceTrend && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <TrendingUp className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Component Price Trend</span>
                <span className="ml-1 text-fg-muted">&mdash; key component · last 6 months</span>
              </div>
              {(() => {
                const pts = mockPriceTrendData;
                const min = Math.min(...pts);
                const max = Math.max(...pts);
                const range = max - min || 1;
                const W = 240;
                const H = 50;
                const stepX = W / (pts.length - 1);
                const coords = pts.map((v, i) => ({
                  x: i * stepX,
                  y: H - ((v - min) / range) * (H - 8) - 4,
                }));
                const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
                return (
                  <div>
                    <svg
                      width={W}
                      height={H}
                      viewBox={`0 0 ${W} ${H}`}
                      aria-label="6-month price sparkline"
                      className="overflow-visible"
                    >
                      <polyline
                        points={polyPoints}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        className="text-accent"
                      />
                      {coords.map((c, i) => (
                        <circle
                          key={i}
                          cx={c.x}
                          cy={c.y}
                          r={3}
                          className="fill-accent stroke-bg-subtle"
                          strokeWidth={1.5}
                        />
                      ))}
                    </svg>
                    <p className="mt-1 text-fg-muted">
                      Last: ₪{pts[pts.length - 1].toFixed(2)}{" "}
                      <span className="text-success-fg font-medium">(+16.7% YTD)</span>
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* R46-1 — Component Stock Coverage Panel */}
          {showComponentStockCoverage && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-2">
                <ShieldCheck className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Component Stock Coverage</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-muted text-fg-faint uppercase tracking-wide">
                      <th className="px-2 py-1 font-medium">Component</th>
                      <th className="px-2 py-1 font-medium text-right">On Hand</th>
                      <th className="px-2 py-1 font-medium text-right">Required/Run</th>
                      <th className="px-2 py-1 font-medium text-right">Coverage Wks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockStockCoverageData.map((row, idx) => {
                      const coverageColorClass =
                        row.coverageWks >= 4
                          ? "text-success-fg font-semibold"
                          : row.coverageWks >= 2
                            ? "text-warning-fg font-semibold"
                            : "text-danger-fg font-semibold";
                      return (
                        <tr
                          key={row.component}
                          className={idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted/30"}
                        >
                          <td className="px-2 py-1 text-fg-muted truncate max-w-[12rem]" title={row.component}>
                            {row.component}
                          </td>
                          <td className="px-2 py-1 text-right text-fg-muted">{row.onHand}</td>
                          <td className="px-2 py-1 text-right text-fg-muted">{row.requiredPerRun}</td>
                          <td className={`px-2 py-1 text-right ${coverageColorClass}`}>
                            {row.coverageWks.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* R47-1 — Packaging Material Usage Panel */}
          {showPackagingMaterialUsage && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <Box className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Packaging Material Usage</span>
              </div>
              <div className="space-y-2">
                {packagingMaterialData.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-fg-muted truncate">{item.label}</span>
                    <div className="flex-1 bg-bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${item.colorClass}`}
                        style={{ width: `${Math.round((item.value / packagingMax) * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-fg-muted w-24 text-right">
                      {item.value.toLocaleString()} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* R48-1 — Approval Status Panel */}
          {showApprovalStatusPanel && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Approval Status</span>
              </div>
              {(() => {
                const approvalRows: { label: string; count: number; colorClass: string; badgeClass: string }[] = [
                  { label: "Draft",            count: 2, colorClass: "bg-bg-muted",         badgeClass: "bg-bg-muted text-fg-muted" },
                  { label: "Pending Approval", count: 1, colorClass: "bg-warning-fg/70",    badgeClass: "bg-warning-softer text-warning-fg" },
                  { label: "Approved",         count: 8, colorClass: "bg-success-fg/70",    badgeClass: "bg-success-softer text-success-fg" },
                ];
                const total = approvalRows.reduce((s, r) => s + r.count, 0);
                return (
                  <div className="space-y-2">
                    {approvalRows.map((row) => {
                      const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
                      return (
                        <div key={row.label} className="flex items-center gap-2">
                          <span className="w-32 shrink-0 text-fg-muted truncate">{row.label}</span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 font-semibold leading-none min-w-[1.5rem] text-center ${row.badgeClass}`}
                          >
                            {row.count}
                          </span>
                          <div className="flex-1 bg-bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${row.colorClass}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-fg-faint shrink-0">{pct}%</span>
                        </div>
                      );
                    })}
                    <p className="text-fg-faint mt-1">{total} BOMs total</p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* R49-1 — Component Shortage Forecast Panel */}
          {showComponentShortageForecast && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <AlertTriangle className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Component Shortage Forecast</span>
                <span className="ml-1 text-fg-muted">&mdash; 8-week horizon</span>
              </div>
              <ul className="space-y-2">
                {mockShortageForecastData.map((row) => {
                  const stockoutColor =
                    row.stockoutWeeks <= 2
                      ? "text-danger-fg font-semibold"
                      : row.stockoutWeeks <= 4
                        ? "text-warning-fg font-semibold"
                        : "text-success-fg font-semibold";
                  return (
                    <li
                      key={row.name}
                      className="flex items-center gap-2 py-1.5 px-2 border border-border/40 rounded bg-bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-fg-muted truncate font-medium" title={row.name}>
                          {row.name}
                        </div>
                        <div className="text-fg-faint mt-0.5">
                          On hand: {row.currentStock.toLocaleString()} · Usage: {row.weeklyUsage}/wk
                        </div>
                      </div>
                      <span className={`shrink-0 ${stockoutColor}`}>
                        stockout in {row.stockoutWeeks.toFixed(1)} wks
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* R50-1 — Multi-BOM Cost Comparison Panel */}
          {showMultiBomCostComparison && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <GitCompare className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Version Cost Comparison</span>
                <span className="ml-1 text-fg-muted">&mdash; unit cost (₪) across versions</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-muted text-fg-faint uppercase tracking-wide">
                      <th className="px-2 py-1 font-medium">Category</th>
                      <th className="px-2 py-1 font-medium text-right">v1</th>
                      <th className="px-2 py-1 font-medium text-right">v2</th>
                      <th className="px-2 py-1 font-medium text-right">v3</th>
                      <th className="px-2 py-1 font-medium text-right">Δ vs v1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockMultiBomCostData.map((row, idx) => {
                      const delta = row.v3 - row.v1;
                      const deltaSign = delta > 0 ? "+" : "";
                      const deltaClass =
                        delta < 0
                          ? "text-success-fg font-semibold"
                          : delta > 0
                            ? "text-danger-fg font-semibold"
                            : "text-fg-muted";
                      return (
                        <tr
                          key={row.category}
                          className={idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted/30"}
                        >
                          <td className="px-2 py-1 text-fg-muted">{row.category}</td>
                          <td className="px-2 py-1 text-right text-fg-muted">₪{row.v1.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right text-fg-muted">₪{row.v2.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right text-fg-strong font-medium">₪{row.v3.toFixed(2)}</td>
                          <td className={`px-2 py-1 text-right ${deltaClass}`}>
                            {deltaSign}{delta.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    {(() => {
                      const totV1 = mockMultiBomCostData.reduce((s, r) => s + r.v1, 0);
                      const totV2 = mockMultiBomCostData.reduce((s, r) => s + r.v2, 0);
                      const totV3 = mockMultiBomCostData.reduce((s, r) => s + r.v3, 0);
                      const totDelta = totV3 - totV1;
                      const totDeltaSign = totDelta > 0 ? "+" : "";
                      const totDeltaClass = totDelta < 0 ? "text-success-fg" : totDelta > 0 ? "text-danger-fg" : "text-fg-muted";
                      return (
                        <tr className="bg-bg-muted border-t border-border font-semibold text-fg-strong">
                          <td className="px-2 py-1.5">Total</td>
                          <td className="px-2 py-1.5 text-right">₪{totV1.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right">₪{totV2.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right">₪{totV3.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 text-right ${totDeltaClass}`}>
                            {totDeltaSign}{totDelta.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* R51-1 — Yield Variance Panel */}
          {showYieldVariancePanel && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <FlaskConical className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Yield Variance</span>
                <span className="ml-1 text-fg-muted">&mdash; theoretical vs actual yield (%)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-muted text-fg-faint uppercase tracking-wide">
                      <th className="px-2 py-1 font-medium">Component</th>
                      <th className="px-2 py-1 font-medium text-right">Theoretical %</th>
                      <th className="px-2 py-1 font-medium text-right">Actual %</th>
                      <th className="px-2 py-1 font-medium text-right">Variance</th>
                      <th className="px-2 py-1 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {YIELD_VARIANCE.map((row, idx) => {
                      const variance = row.actual - row.theoretical;
                      const varianceSign = variance > 0 ? "+" : "";
                      const varianceClass =
                        variance < 0 ? "text-danger-fg font-semibold" : "text-success-fg font-semibold";
                      const statusLabel =
                        variance >= -2 ? "On Spec" : variance >= -5 ? "Minor" : "Off Spec";
                      const statusClass =
                        variance >= -2
                          ? "bg-success-softer text-success-fg"
                          : variance >= -5
                            ? "bg-warning-softer text-warning-fg"
                            : "bg-danger-softer text-danger-fg";
                      return (
                        <tr
                          key={row.name}
                          className={idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted/30"}
                        >
                          <td className="px-2 py-1 text-fg-muted">{row.name}</td>
                          <td className="px-2 py-1 text-right text-fg-muted">{row.theoretical.toFixed(1)}</td>
                          <td className="px-2 py-1 text-right text-fg-strong font-medium">{row.actual.toFixed(1)}</td>
                          <td className={`px-2 py-1 text-right ${varianceClass}`}>
                            {varianceSign}{variance.toFixed(1)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <span className={`inline-block rounded-full px-1.5 py-0.5 leading-none font-medium ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* R52-1 — BOM Changelog Panel */}
          {showBomChangelogPanel && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <GitCommit className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">BOM Changelog</span>
                <span className="ml-1 text-fg-muted">&mdash; recent version history</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-muted text-fg-faint uppercase tracking-wide">
                      <th className="px-2 py-1 font-medium">Version</th>
                      <th className="px-2 py-1 font-medium">Date</th>
                      <th className="px-2 py-1 font-medium">Author</th>
                      <th className="px-2 py-1 font-medium">Change</th>
                      <th className="px-2 py-1 font-medium text-right">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOM_CHANGELOG.map((entry, idx) => {
                      const typeBadgeClass =
                        entry.type === "quantity"
                          ? "bg-info-softer text-info-fg"
                          : entry.type === "substitution"
                            ? "bg-warning-softer text-warning-fg"
                            : entry.type === "structure"
                              ? "bg-bg-muted text-fg-muted"
                              : "bg-success-softer text-success-fg";
                      return (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted/30"}
                        >
                          <td className="px-2 py-1 text-fg-strong font-medium">{entry.version}</td>
                          <td className="px-2 py-1 text-fg-muted">{entry.date}</td>
                          <td className="px-2 py-1 text-fg-muted">{entry.author}</td>
                          <td className="px-2 py-1 text-fg-muted">{entry.change}</td>
                          <td className="px-2 py-1 text-right">
                            <span className={`inline-block rounded-full px-1.5 py-0.5 leading-none font-medium capitalize ${typeBadgeClass}`}>
                              {entry.type}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* R44-1 — Version Timeline Panel */}
          {showVersionTimeline && (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-3 text-3xs">
              <div className="flex items-center gap-1 mb-3">
                <GitBranch className="h-3 w-3 shrink-0 text-fg-strong" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Version Timeline</span>
              </div>
              <div className="relative pl-4">
                {/* Left border line */}
                <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                <ul className="space-y-3">
                  {mockVersionTimeline.map((entry, idx) => (
                    <li key={entry.version} className="relative flex items-start gap-2.5">
                      {/* Dot indicator */}
                      {entry.status === "Active" ? (
                        <span
                          className="absolute -left-[13px] top-0.5 h-3 w-3 rounded-full bg-accent border-2 border-bg-subtle shrink-0"
                          aria-label="Active version"
                        />
                      ) : (
                        <span
                          className="absolute -left-[13px] top-0.5 h-3 w-3 rounded-full border-2 border-border bg-bg-subtle shrink-0"
                          aria-label="Archived version"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-semibold ${entry.status === "Active" ? "text-fg-strong" : "text-fg-muted"}`}
                          >
                            {entry.version}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 leading-none font-medium ${
                              entry.status === "Active"
                                ? "bg-accent/10 text-accent"
                                : "bg-bg-muted text-fg-muted"
                            }`}
                          >
                            {entry.status}
                          </span>
                          <span className="text-fg-faint">{entry.createdDate}</span>
                        </div>
                        <p className="text-fg-muted mt-0.5 truncate" title={entry.note}>
                          {entry.note}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

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
            <ErrorState
              title="Failed to load BOMs"
              description="Check your connection and try again."
              onRetry={() => void headsQuery.refetch()}
            />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-border/50">
              {filtered.length === 0 ? (
                <div className="px-4 py-5 text-sm text-fg-muted">
                  {query ? (
                    "No active BOMs match your search — try a shorter term."
                  ) : activeHeads.length === 0 ? (
                    <div className="flex flex-col items-start gap-3">
                      <span>
                        No BOMs have an active version yet. Publish a BOM
                        version to enable simulation.
                      </span>
                      <Link
                        href="/admin/masters/boms"
                        className="btn btn-sm btn-outline"
                      >
                        Open BOM masters →
                      </Link>
                    </div>
                  ) : (
                    "No active BOMs match your search."
                  )}
                </div>
              ) : (
                <>
                  {/* ADD-2 — Multi-Select action bar */}
                  {selectedBomIds.size > 0 && showBomMultiSelect && (
                  <div className="flex gap-2 items-center mt-1 px-3 py-1 bg-accent-softer border border-accent/30 rounded text-3xs">
                    <span className="text-accent">{selectedBomIds.size} BOMs selected</span>
                    <button
                      type="button"
                      onClick={() => {
                        const ids = Array.from(selectedBomIds);
                        void navigator.clipboard.writeText(`Selected BOMs: ${ids.join(", ")}`);
                      }}
                      className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
                    >
                      <Download className="h-3 w-3 shrink-0" strokeWidth={2} />
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBomIds(new Set())}
                      className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
                    >
                      <X className="h-3 w-3 shrink-0" strokeWidth={2} />
                      Clear
                    </button>
                  </div>
                )}
                <ul className="divide-y divide-border/30">
                  {filtered.slice(0, 50).map((h) => {
                    const vCount = versionCountByBom.get(h.bom_head_id);
                    const isPreviewOpen = previewBomId === h.bom_head_id;
                    const isChecked = selectedBomIds.has(h.bom_head_id);
                    return (
                      <li key={h.bom_head_id}>
                        <div className="flex w-full items-center gap-3 px-3 py-2.5">
                          {/* ADD-2 — multi-select checkbox */}
                          {showBomMultiSelect && (
                            <input
                              type="checkbox"
                              aria-label={`Select BOM ${displayName(h)}`}
                              checked={isChecked}
                              onChange={() => {
                                setSelectedBomIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(h.bom_head_id)) {
                                    next.delete(h.bom_head_id);
                                  } else {
                                    next.add(h.bom_head_id);
                                  }
                                  return next;
                                });
                              }}
                              className="h-3.5 w-3.5 shrink-0 accent-accent"
                            />
                          )}
                          <button
                            type="button"
                            className="flex flex-1 items-center gap-3 text-left hover:bg-bg-subtle/50 min-w-0"
                            onClick={() => { setSelectedHead(h); setSelectedRec(null); setSimulatedQty(undefined); }}
                          >
                            <Network className="h-4 w-4 shrink-0 text-fg-faint" strokeWidth={2} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-fg text-sm">
                                {displayName(h)}
                              </div>
                              <div className="text-3xs font-mono text-fg-subtle">
                                {h.bom_head_id} · base {fmtNumStr(h.final_bom_output_qty)}{" "}
                                {h.final_bom_output_uom ?? ""}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* I4 — version count chip */}
                            {vCount !== undefined && (
                              <span
                                className={`text-3xs rounded px-1 ${
                                  vCount >= 5
                                    ? "text-accent bg-accent-softer"
                                    : "text-fg-faint bg-bg-muted"
                                }`}
                              >
                                v{vCount}
                              </span>
                            )}
                            <Badge tone="neutral" dotted>
                              {supplyMethodLabel(itemsById.get(h.parent_ref_id)?.supply_method ?? h.bom_kind)}
                            </Badge>
                            {/* I3 — Eye preview toggle */}
                            <button
                              type="button"
                              aria-label={isPreviewOpen ? "Close BOM preview" : "Preview BOM lines"}
                              className={`inline-flex items-center justify-center h-5 w-5 rounded transition-colors ${
                                isPreviewOpen
                                  ? "text-accent bg-accent-softer"
                                  : "text-fg-faint hover:text-fg-muted bg-bg-muted"
                              }`}
                              onClick={() =>
                                setPreviewBomId(
                                  isPreviewOpen ? null : h.bom_head_id,
                                )
                              }
                            >
                              <Eye className="h-3 w-3" strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                        {/* I3 — BOM Preview Panel */}
                        {isPreviewOpen && (
                          <div className="bg-bg-subtle border border-accent/30 rounded p-2 mt-2 mx-3 mb-2 text-3xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-fg-faint font-medium">
                                Preview: {displayName(h)}
                              </span>
                              <button
                                type="button"
                                aria-label="Close preview"
                                className="text-fg-faint hover:text-fg-muted"
                                onClick={() => setPreviewBomId(null)}
                              >
                                <X className="h-3 w-3" strokeWidth={2} />
                              </button>
                            </div>
                            {bomPreviewQuery.isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
                            ) : bomPreviewLines.length === 0 ? (
                              <p className="text-fg-muted">No BOM lines found</p>
                            ) : (
                              <>
                                <ul className="space-y-0.5 text-fg-muted">
                                  {bomPreviewLines.map((line, idx) => {
                                    const lineCompId: string | null =
                                      (bomPreviewQuery.data as any)?.bom_lines?.[idx]?.component_id ??
                                      (bomPreviewQuery.data as any)?.lines?.[idx]?.component_id ??
                                      (bomPreviewQuery.data as any)?.bom_lines?.[idx]?.final_component_id ??
                                      (bomPreviewQuery.data as any)?.lines?.[idx]?.final_component_id ??
                                      null;
                                    return (
                                      <li key={idx} className="flex items-center gap-1">
                                        <span className="flex-1">{"•"} {line.name}: {line.qty} {line.unit}</span>
                                        {/* IMP-1 — Sub-Component Exploder button */}
                                        {lineCompId && (
                                          <button
                                            type="button"
                                            aria-label={`Explode sub-BOM for ${line.name}`}
                                            title={`Explode sub-BOM for ${line.name}`}
                                            className={`inline-flex items-center justify-center h-4 w-4 rounded transition-colors shrink-0 ${
                                              explodedComponentId === lineCompId
                                                ? "text-accent"
                                                : "text-fg-faint hover:text-fg-muted"
                                            }`}
                                            onClick={() =>
                                              setExplodedComponentId(
                                                explodedComponentId === lineCompId ? null : lineCompId,
                                              )
                                            }
                                          >
                                            <ChevronRight className="h-2.5 w-2.5" strokeWidth={2} />
                                          </button>
                                        )}
                                        {line.id && (
                                          <button
                                            type="button"
                                            aria-label={`View substitutes for ${line.name}`}
                                            title={`View substitutes for ${line.name}`}
                                            className={`inline-flex items-center justify-center h-4 w-4 rounded transition-colors shrink-0 ${
                                              selectedComponentForSubs === line.id
                                                ? "text-accent"
                                                : "text-fg-faint hover:text-fg-muted"
                                            }`}
                                            onClick={() =>
                                              setSelectedComponentForSubs(
                                                selectedComponentForSubs === line.id ? null : line.id,
                                              )
                                            }
                                          >
                                            <RefreshCw className="h-2.5 w-2.5" strokeWidth={2} />
                                          </button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                                {/* IMP-1 — Sub-BOM Exploded Panel */}
                                {explodedComponentId !== null && (
                                  <div className="bg-info-softer border border-info/20 rounded p-1.5 mt-1 ml-3 text-3xs">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="flex items-center gap-1 text-fg-muted font-medium">
                                        <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2} />
                                        Sub-BOM: {
                                          (() => {
                                            const matched = bomPreviewLines.find((_l, idx2) => {
                                              const raw = (bomPreviewQuery.data as any)?.bom_lines?.[idx2] ??
                                                (bomPreviewQuery.data as any)?.lines?.[idx2] ?? {};
                                              return (
                                                (raw.component_id ?? raw.final_component_id ?? null) === explodedComponentId
                                              );
                                            });
                                            return matched?.name ?? explodedComponentId;
                                          })()
                                        }
                                      </span>
                                      <button
                                        type="button"
                                        aria-label="Close sub-BOM panel"
                                        className="text-fg-faint hover:text-fg-muted"
                                        onClick={() => setExplodedComponentId(null)}
                                      >
                                        <X className="h-3 w-3" strokeWidth={2} />
                                      </button>
                                    </div>
                                    {bomExploderQuery.isLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
                                    ) : explodedBomLines.length === 0 ? (
                                      <p className="text-fg-faint">No sub-BOM found for this component</p>
                                    ) : (
                                      <ul className="space-y-0.5 text-fg-muted">
                                        {explodedBomLines.map((sl, si) => (
                                          <li key={si}>• {sl.name}: {sl.qty} {sl.unit}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {filtered.length > 50 && (
                    <li className="px-3 py-2 text-xs text-fg-muted">
                      {filtered.length - 50} more — refine your search
                    </li>
                  )}
                </ul>
                </>
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
                  {fmtNumStr(selectedHead.final_bom_output_qty)}{" "}
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

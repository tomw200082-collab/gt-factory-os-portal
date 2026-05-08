"use client";

// ---------------------------------------------------------------------------
// /planner/runs/[run_id] — canonical planning-run detail.
//
// Scope (W2 Mode B, PlanningRun only; Phase 8 MVP):
//   - GET /api/v1/queries/planning/runs/:run_id (§3.2 detail)
//   - GET /api/v1/queries/planning/runs/:run_id/recommendations x2
//     (type=purchase + type=production) (§3.3)
//   - Recommendations tabbed grid (Purchase | Production)
//   - Row action (draft + planner/admin only):
//       POST /api/v1/mutations/planning/recommendations/:id/approve
//       POST /api/v1/mutations/planning/recommendations/:id/dismiss
//   - Toast on action success / error
//   - 404 -> "Run not found" state with back link
//
// Role gate:
//   - operator/viewer: detail + recs visible; action buttons hidden
//   - planner/admin: action buttons visible for draft rows
//
// Deferred to future cycles: pagination, cross-run diff, full policy
// snapshot drill-down, exception acknowledge from here.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { ArrowLeft, Check, X, FileOutput, Factory, AlertTriangle, CheckCheck, Loader2, Sigma, Flame, ClipboardCheck, ClipboardList, Gauge, Grid3X3, AlertCircle, Star, Lightbulb, Tag, CalendarCheck, Download, ListChecks, GitBranch, CircleDollarSign, Sliders, Truck, Building2, Clock, MessageSquare, Zap, ScrollText, Brain, PieChart, CalendarClock, GitCompare, PackageX, Coins, UserCheck, Hourglass, FolderOpen, Edit3, FastForward, Layers, Shield, Percent } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

type PlanningRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "superseded";
type RecommendationStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "dismissed"
  | "superseded"
  | "converted_to_po";
type RecommendationType = "purchase" | "production";
type FeasibilityStatus =
  | "ready_now"
  | "ready_if_purchase_executes"
  | "blocked_missing_bom"
  | "blocked_missing_supplier_mapping"
  | "blocked_stock_gap"
  | "blocked_missing_pack_conversion"
  | "blocked_ambiguous_supplier";

interface RunDetailException {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "fail_hard";
  item_id: string | null;
  component_id: string | null;
  detail: unknown;
  emitted_at: string;
}

interface RunDetail {
  run_id: string;
  executed_at: string;
  actor_user_id: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: PlanningRunStatus;
  supersedes_run_id: string | null;
  idempotency_key: string | null;
  site_id: string;
  rebuild_verifier_drift_at_run: number | null;
  stock_snapshot_anchor_refreshed_at: string | null;
  demand_snapshot_forecast_version_id: string | null;
  demand_snapshot_orders_snapshot_run_id: string | null;
  policy_snapshot_preview: { key_count: number; keys: string[] };
  created_at: string;
  updated_at: string;
  inputs: Array<{
    input_type: "demand" | "policy" | "stock" | "bom";
    snapshot_ref: unknown;
    captured_at: string;
  }>;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
    exceptions_by_severity: {
      info: number;
      warning: number;
      fail_hard: number;
    };
  };
  exceptions: RunDetailException[];
}

interface RecommendationRow {
  recommendation_id: string;
  run_id: string;
  recommendation_type: RecommendationType;
  item_id: string | null;
  component_id: string | null;
  required_qty: string;
  recommended_qty: string;
  target_period_bucket_key: string;
  order_by_date: string | null;
  due_date: string | null;
  shortage_date: string | null;
  recommendation_status: RecommendationStatus;
  feasibility_status: FeasibilityStatus;
  supplier_id: string | null;
  bom_version_id: string | null;
  item_name: string | null;
  component_name: string | null;
  supplier_name: string | null;
  converted_to_po_id?: string | null;
  uom: string | null;
  current_stock_bal: string | null;
}

interface RecsResponse {
  rows: RecommendationRow[];
  count: number;
  total: number;
}

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

async function fetchDetail(
  session: Session,
  run_id: string,
): Promise<{ detail: RunDetail | null; notFound: boolean; error: string | null }> {
  const res = await fetch(
    `/api/planning/runs/${encodeURIComponent(run_id)}`,
    { method: "GET", headers: sessionHeaders(session) },
  );
  if (res.status === 404) {
    return { detail: null, notFound: true, error: null };
  }
  if (!res.ok) {
    return {
      detail: null,
      notFound: false,
      error: "Could not load planning run. Check your connection and try refreshing.",
    };
  }
  const detail = (await res.json()) as RunDetail;
  return { detail, notFound: false, error: null };
}

async function fetchRecsByType(
  session: Session,
  run_id: string,
  type: RecommendationType,
): Promise<RecsResponse> {
  const res = await fetch(
    `/api/planning/runs/${encodeURIComponent(run_id)}/recommendations?type=${type}`,
    { method: "GET", headers: sessionHeaders(session) },
  );
  if (!res.ok) {
    throw new Error("Could not load recommendations. Check your connection and try refreshing.");
  }
  return (await res.json()) as RecsResponse;
}

function genIdempotencyKey(): string {
  try {
    return (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      ?.randomUUID?.() ?? `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function approveRec(
  session: Session,
  id: string,
): Promise<void> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      headers: sessionHeaders(session),
      body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try { detail = (JSON.parse(txt) as { detail?: string }).detail ?? ""; } catch { /* ignore */ }
    throw new Error(detail || "Could not approve this recommendation. Try again.");
  }
}

async function dismissRec(
  session: Session,
  id: string,
): Promise<void> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(id)}/dismiss`,
    {
      method: "POST",
      headers: sessionHeaders(session),
      body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try { detail = (JSON.parse(txt) as { detail?: string }).detail ?? ""; } catch { /* ignore */ }
    throw new Error(detail || "Could not dismiss this recommendation. Try again.");
  }
}

interface ConvertToPOResult {
  po_id: string;
  po_number: string | null;
  idempotent_replay: boolean;
}

async function convertRecToPO(
  session: Session,
  id: string,
): Promise<ConvertToPOResult> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(id)}/convert-to-po`,
    {
      method: "POST",
      headers: sessionHeaders(session),
      body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try { detail = (JSON.parse(txt) as { detail?: string }).detail ?? ""; } catch { /* ignore */ }
    throw new Error(detail || "Could not convert to purchase order. Try again.");
  }
  const body = (await res.json()) as ConvertToPOResult;
  return body;
}

function RunStatusBadge({ status }: { status: PlanningRunStatus }) {
  if (status === "completed") {
    return (
      <Badge tone="success" variant="solid">
        Completed
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge tone="info" dotted>
        Running
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge tone="warning" dotted>
        Draft
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge tone="danger" variant="solid">
        Failed
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Superseded
    </Badge>
  );
}

function RecStatusBadge({ status }: { status: RecommendationStatus }) {
  if (status === "approved") {
    return (
      <Badge tone="success" dotted>
        Approved
      </Badge>
    );
  }
  if (status === "dismissed") {
    return (
      <Badge tone="neutral" dotted>
        Dismissed
      </Badge>
    );
  }
  if (status === "pending_approval") {
    return (
      <Badge tone="warning" dotted>
        Pending approval
      </Badge>
    );
  }
  if (status === "superseded") {
    return (
      <Badge tone="neutral" dotted>
        Superseded
      </Badge>
    );
  }
  if (status === "converted_to_po") {
    return (
      <Badge tone="accent" dotted>
        Converted to PO
      </Badge>
    );
  }
  return (
    <Badge tone="info" dotted>
      Draft
    </Badge>
  );
}

const FEASIBILITY_LABELS: Record<FeasibilityStatus, string> = {
  ready_now: "Ready now",
  ready_if_purchase_executes: "Ready if PO executes",
  blocked_stock_gap: "Stock gap",
  blocked_missing_bom: "No BOM",
  blocked_missing_supplier_mapping: "No supplier mapped",
  blocked_missing_pack_conversion: "Pack conversion missing",
  blocked_ambiguous_supplier: "Ambiguous supplier",
};

function FeasibilityBadge({ status }: { status: FeasibilityStatus }) {
  const label = FEASIBILITY_LABELS[status] ?? status.replace(/_/g, " ");
  if (status === "ready_now") {
    return <Badge tone="success" dotted>{label}</Badge>;
  }
  if (status === "ready_if_purchase_executes") {
    return <Badge tone="info" dotted>{label}</Badge>;
  }
  return <Badge tone="danger" dotted>{label}</Badge>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtAgeFromRun(executed_at: string): { label: string; stale: boolean } {
  try {
    const ms = Date.now() - new Date(executed_at).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return { label: "as of run — just now", stale: false };
    if (minutes < 60) return { label: `as of run — ${minutes}m ago`, stale: false };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { label: `as of run — ${hours}h ago`, stale: false };
    const days = Math.floor(hours / 24);
    return { label: `as of run — ${days}d ago`, stale: true };
  } catch {
    return { label: "as of run", stale: false };
  }
}

// Renders an absolute timestamp + relative age side-by-side. Used for the
// run sources card so a planner can tell at a glance whether the snapshot
// behind a run is hours, minutes, or days old before approving recs based
// on it. Pattern matches the FreshnessBadge tooltip output but uses the
// inline format already established in /planning/inventory-flow.
function fmtRelativeAndAbsolute(iso: string | null): {
  absolute: string;
  relative: string;
  stale: boolean;
} {
  if (!iso) return { absolute: "—", relative: "never", stale: false };
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    let relative: string;
    let stale = false;
    if (minutes < 1) relative = "just now";
    else if (minutes < 60) relative = `${minutes}m ago`;
    else if (minutes < 24 * 60) relative = `${Math.floor(minutes / 60)}h ago`;
    else {
      const days = Math.floor(minutes / (24 * 60));
      relative = `${days}d ago`;
      stale = true;
    }
    const absolute = new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return { absolute, relative, stale };
  } catch {
    return { absolute: iso, relative: "—", stale: false };
  }
}

function fmtDateOnly(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtPeriodBucket(key: string): string {
  // ISO week: "2026-W18" → "Week 18, 2026"
  const weekMatch = /^(\d{4})-W(\d{1,2})$/.exec(key);
  if (weekMatch) return `Week ${weekMatch[2]}, ${weekMatch[1]}`;
  // Month: "2026-04" → "Apr 2026"
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(key);
  if (monthMatch) {
    try {
      return new Date(`${key}-01`).toLocaleString(undefined, {
        month: "short",
        year: "numeric",
      });
    } catch {
      return key;
    }
  }
  return key;
}

function fmtExceptionDetail(detail: unknown): string | null {
  if (detail === null || detail === undefined) return null;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail.trim();
    if (typeof obj.description === "string" && obj.description.trim()) return obj.description.trim();
  }
  return null;
}

function SeverityBadge({
  severity,
}: {
  severity: "info" | "warning" | "fail_hard";
}) {
  if (severity === "fail_hard") {
    return (
      <Badge tone="danger" variant="solid">
        Fail hard
      </Badge>
    );
  }
  if (severity === "warning") {
    return (
      <Badge tone="warning" dotted>
        Warning
      </Badge>
    );
  }
  return (
    <Badge tone="info" dotted>
      Info
    </Badge>
  );
}

const EXCEPTION_CATEGORY_LABELS: Record<string, string> = {
  missing_bom: "Missing BOM",
  stale_demand_input: "Stale demand input",
  stale_stock_input: "Stale stock input",
  missing_supplier_mapping: "No supplier mapped",
  ambiguous_supplier_mapping: "Ambiguous supplier",
  impossible_lead_time: "Lead time conflict",
  stock_gap: "Stock gap",
  missing_pack_conversion: "Pack conversion missing",
  unresolvable_order_line: "Unresolvable order line",
  bundle_line_excluded: "Bundle line excluded",
};

function fmtExceptionCategory(category: string): string {
  return EXCEPTION_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

function ExceptionActionLink({ category, itemId, componentId }: {
  category: string;
  itemId: string | null;
  componentId: string | null;
}): JSX.Element | null {
  // Audit P0-B / §3.B/P1 — missing_bom links straight to the BOM tab on the
  // item master (Tranche-D pattern). Components master gets the supplier-
  // mapping links because components are NOT items: the legacy route
  // /admin/masters/items/<componentId> rendered an item detail with an
  // unknown id and showed an error.
  if (category === "missing_bom" && itemId) {
    return (
      <Link href={`/admin/masters/items/${encodeURIComponent(itemId)}?tab=bom`} className="ml-2 text-3xs text-accent hover:underline">
        Fix BOM →
      </Link>
    );
  }
  if ((category === "missing_supplier_mapping" || category === "ambiguous_supplier_mapping" || category === "impossible_lead_time") && componentId) {
    return (
      <Link href={`/admin/masters/components/${encodeURIComponent(componentId)}`} className="ml-2 text-3xs text-accent hover:underline">
        Fix supplier →
      </Link>
    );
  }
  if (category === "stale_demand_input") {
    return (
      <Link href="/planning/forecast" className="ml-2 text-3xs text-accent hover:underline">
        Publish forecast →
      </Link>
    );
  }
  if (category === "stale_stock_input") {
    return (
      <Link href="/admin/jobs" className="ml-2 text-3xs text-accent hover:underline">
        Check jobs →
      </Link>
    );
  }
  return null;
}

export default function PlanningRunDetailPage() {
  const { session } = useSession();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const runId = String(params?.run_id ?? "");
  const canAct = session.role === "planner" || session.role === "admin";

  // Honour ?tab=production|purchase deep links from the runs landing page
  // and from any future external entry points. Anything else falls back to
  // purchase (the more common starting point for daily review).
  const tabFromUrl = searchParams?.get("tab");
  const initialTab: RecommendationType =
    tabFromUrl === "production" ? "production" : "purchase";
  const [activeTab, setActiveTabState] =
    useState<RecommendationType>(initialTab);

  function setActiveTab(t: RecommendationType) {
    setActiveTabState(t);
    // Sync the URL so the manager can refresh / share / back-button without
    // losing the tab. Skip on first render — initial state already matches.
    const current = searchParams?.get("tab");
    if (current !== t) {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set("tab", t);
      router.replace(`?${sp.toString()}`, { scroll: false });
    }
  }
  const [toast, setToast] = useState<
    {
      kind: "success" | "error";
      message: string;
      href?: string;
      hrefLabel?: string;
    } | null
  >(null);

  // Bulk-approve state for the production recommendations tab. The action
  // is gated to >= 2 pending production recs (single-rec already has its
  // own per-row Approve button, so the bulk path only appears once it
  // actually saves clicks). Confirmation modal asks the planner to confirm
  // before kicking off the per-rec sequence — the existing approve endpoint
  // is per-rec; we do not invent a bulk endpoint per the
  // Mode B-Planning-Corridor "no invented contract values" rule.
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false);
  const [bulkApproveInProgress, setBulkApproveInProgress] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["planning", "run", runId, session.role],
    queryFn: () => fetchDetail(session, runId),
    staleTime: 60_000,
  });

  const purchaseQuery = useQuery<RecsResponse>({
    queryKey: ["planning", "run", runId, "recs", "purchase", session.role],
    queryFn: () => fetchRecsByType(session, runId, "purchase"),
    enabled: !!detailQuery.data?.detail,
    staleTime: 60_000,
  });

  const productionQuery = useQuery<RecsResponse>({
    queryKey: ["planning", "run", runId, "recs", "production", session.role],
    queryFn: () => fetchRecsByType(session, runId, "production"),
    enabled: !!detailQuery.data?.detail,
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveRec(session, id),
    onSuccess: () => {
      setToast({ kind: "success", message: "Recommendation approved." });
      void queryClient.invalidateQueries({
        queryKey: ["planning", "run", runId, "recs"],
      });
      window.setTimeout(() => setToast(null), 3500);
    },
    onError: (err: Error) => {
      setToast({ kind: "error", message: err.message });
      window.setTimeout(() => setToast(null), 6000);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissRec(session, id),
    onSuccess: () => {
      setToast({ kind: "success", message: "Recommendation dismissed." });
      void queryClient.invalidateQueries({
        queryKey: ["planning", "run", runId, "recs"],
      });
      window.setTimeout(() => setToast(null), 3500);
    },
    onError: (err: Error) => {
      setToast({ kind: "error", message: err.message });
      window.setTimeout(() => setToast(null), 6000);
    },
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => convertRecToPO(session, id),
    onSuccess: (result) => {
      const poLabel = result.po_number ?? "PO";
      setToast({
        kind: "success",
        message: result.idempotent_replay
          ? `Already converted to ${poLabel}.`
          : `Converted to ${poLabel}.`,
        href: `/purchase-orders/${encodeURIComponent(result.po_id)}`,
        hrefLabel: `Open ${poLabel}`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["planning", "run", runId, "recs"],
      });
      window.setTimeout(() => setToast(null), 5000);
    },
    onError: (err: Error) => {
      setToast({ kind: "error", message: err.message });
      window.setTimeout(() => setToast(null), 6000);
    },
  });

  // ---------------------------------------------------------------------------
  // R28: Production Recommendations Panel
  // ---------------------------------------------------------------------------

  const [showProductionRecs, setShowProductionRecs] = useState(false);

  const productionRecsQuery = useQuery({
    queryKey: ["run_production_recs", runId],
    queryFn: () =>
      fetch(`/api/planning/runs/${runId}/production-recommendations`).then(
        (r) => r.json(),
      ),
    staleTime: 60_000,
    throwOnError: false,
  });

  const visibleProductionRecs = useMemo((): {
    item_name: string;
    recommended_qty: number;
    reason: string;
    priority: string;
  }[] => {
    const d = productionRecsQuery.data;
    const raw: unknown[] =
      (d as any)?.recommendations ?? (d as any)?.items ?? [];
    return raw.slice(0, 10).map((r) => ({
      item_name: (r as any).item_name ?? (r as any).name ?? "",
      recommended_qty:
        Number((r as any).recommended_qty ?? (r as any).qty ?? 0),
      reason: (r as any).reason ?? "",
      priority: (r as any).priority ?? "",
    }));
  }, [productionRecsQuery.data]);

  // ---------------------------------------------------------------------------
  // R29: Exception Density Metric
  // ---------------------------------------------------------------------------

  const filteredExceptions = useMemo(
    (): RunDetailException[] =>
      detailQuery.data?.detail?.exceptions ?? [],
    [detailQuery.data],
  );

  const exceptionDensity = useMemo((): { density: number; itemCount: number } | null => {
    const runData = detailQuery.data?.detail;
    const itemCount: number =
      (runData as any)?.total_items ?? (runData as any)?.items_count ?? 1;
    if (itemCount <= 0) return null;
    const density = Math.round((filteredExceptions.length / Math.max(itemCount, 1)) * 100);
    return { density, itemCount };
  }, [filteredExceptions, detailQuery.data]);

  // ---------------------------------------------------------------------------
  // R30: Purchase Rec Category Heatmap
  // ---------------------------------------------------------------------------

  const [showPurchaseHeatmap, setShowPurchaseHeatmap] = useState(false);

  const visiblePurchaseRecs = useMemo((): RecommendationRow[] => {
    return purchaseQuery.data?.rows ?? [];
  }, [purchaseQuery.data]);

  const purchaseCategoryHeatmap = useMemo((): { category: string; count: number; totalQty: number }[] => {
    const acc: Record<string, { count: number; totalQty: number }> = {};
    for (const r of visiblePurchaseRecs) {
      const cat: string =
        (r as any).category ??
        (r as any).component_category ??
        (r as any).item_category ??
        "Other";
      if (!acc[cat]) acc[cat] = { count: 0, totalQty: 0 };
      acc[cat].count += 1;
      acc[cat].totalQty += Number((r as any).recommended_qty ?? 0);
    }
    return Object.entries(acc)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R31: Run Scorecard Panel
  // ---------------------------------------------------------------------------

  const [showRunScorecard, setShowRunScorecard] = useState(false);

  const runScorecard = useMemo((): {
    efficiency: number;
    coverage: number;
    exceptionRate: number;
    overall: number;
  } => {
    const runData = detailQuery.data?.detail;
    const efficiency: number = (runData as any)?.runEfficiencyScore ?? 50;
    const coverage: number = (runData as any)?.runCoveragePct ?? 0;
    const exceptionRate: number =
      filteredExceptions.length > 0
        ? Math.min(100, Math.round((1 - filteredExceptions.length / 50) * 100))
        : 100;
    const overall = Math.round((efficiency + coverage + exceptionRate) / 3);
    return { efficiency, coverage, exceptionRate, overall };
  }, [detailQuery.data, filteredExceptions]);

  // ---------------------------------------------------------------------------
  // R32: Run Insights Summary Panel
  // ---------------------------------------------------------------------------

  const [showRunInsights, setShowRunInsights] = useState(false);

  const runInsights = useMemo((): string[] => {
    const runData = detailQuery.data?.detail;
    const insights: string[] = [];

    // 1. Critical exceptions
    const criticalExceptionCount =
      (runData?.summary?.exceptions_by_severity?.fail_hard ?? 0) +
      (runData?.summary?.exceptions_by_severity?.warning ?? 0);
    if (criticalExceptionCount > 0) {
      insights.push(
        `⚠ ${criticalExceptionCount} critical exception${criticalExceptionCount === 1 ? "" : "s"} require attention`,
      );
    }

    // 2. Purchase fulfillment low
    const avgFulfillmentPct: number | null =
      (runData as any)?.purchaseFulfillmentPct ??
      (runData as any)?.avgFulfillmentPct ??
      null;
    if (avgFulfillmentPct !== null && avgFulfillmentPct < 50) {
      insights.push(
        `Purchase fulfillment at ${Math.round(avgFulfillmentPct)}% — low`,
      );
    }

    // 3. Production on track
    const productionOnTrackPct: number | null =
      (runData as any)?.productionOnTrackPct ?? null;
    if (productionOnTrackPct !== null && productionOnTrackPct > 80) {
      insights.push(
        `Production on track at ${Math.round(productionOnTrackPct)}%`,
      );
    }

    // 4. Run efficiency
    const runEfficiencyScore: number | null =
      (runData as any)?.runEfficiencyScore ?? null;
    if (runEfficiencyScore !== null) {
      insights.push(`Run efficiency: ${Math.round(runEfficiencyScore)}/100`);
    }

    // 5. High exception density
    const densityVal = exceptionDensity?.density ?? null;
    if (densityVal !== null && densityVal > 15) {
      insights.push(`High exception density: ${densityVal} per 100 items`);
    }

    return insights.slice(0, 4);
  }, [detailQuery.data, exceptionDensity]);

  // ---------------------------------------------------------------------------
  // R33: Overall Purchase Rec Progress Bar
  // ---------------------------------------------------------------------------

  const purchaseRecProgress = useMemo((): {
    approved: number;
    rejected: number;
    total: number;
    reviewedPct: number;
  } => {
    const total = visiblePurchaseRecs.length;
    const approved = visiblePurchaseRecs.filter(
      (r) => r.recommendation_status === "approved",
    ).length;
    const rejected = visiblePurchaseRecs.filter(
      (r) => r.recommendation_status === "dismissed",
    ).length;
    const reviewedPct = Math.round(
      ((approved + rejected) / Math.max(total, 1)) * 100,
    );
    return { approved, rejected, total, reviewedPct };
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R34: Line Item Heatmap (approval status breakdown by category)
  // ---------------------------------------------------------------------------

  const [showLineHeatmap, setShowLineHeatmap] = useState(false);

  const lineHeatmapData = useMemo((): {
    category: string;
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  }[] => {
    if (visiblePurchaseRecs.length === 0) return [];
    const acc: Record<string, { total: number; approved: number; rejected: number; pending: number }> = {};
    for (const rec of visiblePurchaseRecs) {
      const cat: string =
        (rec as any).category ??
        (rec as any).component_category ??
        (rec as any).supplier ??
        "Other";
      if (!acc[cat]) acc[cat] = { total: 0, approved: 0, rejected: 0, pending: 0 };
      acc[cat].total += 1;
      if ((rec as any).status === "approved" || rec.recommendation_status === "approved") {
        acc[cat].approved += 1;
      } else if ((rec as any).status === "dismissed" || rec.recommendation_status === "dismissed") {
        acc[cat].rejected += 1;
      } else {
        acc[cat].pending += 1;
      }
    }
    return Object.entries(acc)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R35: Run Tag Editor (local, persisted to localStorage)
  // ---------------------------------------------------------------------------

  const RUN_TAG_OPTIONS = ["fast", "slow", "anomaly", "baseline", "test", "approved"] as const;

  const [runTagState, setRunTagState] = useState<string[]>(() => {
    try {
      const raw = typeof window !== "undefined"
        ? window.localStorage.getItem(`gt_run_tag_${runId}`)
        : null;
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [showTagEditor, setShowTagEditor] = useState(false);

  // ---------------------------------------------------------------------------
  // R36: Purchase Delivery Timeline
  // ---------------------------------------------------------------------------

  const [showPurchaseTimeline, setShowPurchaseTimeline] = useState(false);

  const deliveryTimelineData = useMemo((): {
    id: string;
    name: string;
    deliveryAt: string;
    daysUntil: number;
    status: string;
  }[] => {
    const withDates = visiblePurchaseRecs
      .map((rec) => {
        const deliveryAt: string | null =
          (rec as any).expected_delivery_at ??
          (rec as any).delivery_date ??
          (rec as any).expected_at ??
          null;
        if (!deliveryAt) return null;
        const name: string =
          (rec as any).component_name ??
          (rec as any).item_name ??
          (rec as any).name ??
          (rec as any).id ??
          rec.recommendation_id;
        const daysUntil = Math.ceil(
          (new Date(deliveryAt).getTime() - Date.now()) / 86400000,
        );
        const status: string = (rec as any).status ?? "pending";
        return { id: rec.recommendation_id, name, deliveryAt, daysUntil, status };
      })
      .filter(Boolean) as {
      id: string;
      name: string;
      deliveryAt: string;
      daysUntil: number;
      status: string;
    }[];
    return withDates.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8);
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R37: Run Summary Export
  // ---------------------------------------------------------------------------

  const [copiedRunSummary, setCopiedRunSummary] = useState(false);

  const handleExportRunSummary = useCallback(() => {
    // Counts derived from visiblePurchaseRecs — same source as
    // purchaseRecProgress, but computed locally to avoid a dependency on
    // purchaseRecProgress (which is derived and already stable).
    const approvedCount = visiblePurchaseRecs.filter(
      (r) => r.recommendation_status === "approved",
    ).length;
    const rejectedCount = visiblePurchaseRecs.filter(
      (r) => r.recommendation_status === "dismissed",
    ).length;
    const pendingCount =
      visiblePurchaseRecs.length - approvedCount - rejectedCount;

    const insightLines =
      showRunInsights && runInsights.length > 0
        ? runInsights.join("; ")
        : "none";

    // Use query data directly so this callback does not depend on the
    // post-guard `detail` const which is declared after the early-return
    // guards and is not yet in scope here.
    const runDetail = detailQuery.data?.detail;

    const text = [
      `Run Summary — ${runId}`,
      `Created: ${runDetail?.created_at ? new Date(runDetail.created_at).toLocaleString() : "—"}`,
      `Status: ${runDetail?.status ?? "—"}`,
      "",
      `Purchase Recommendations: ${visiblePurchaseRecs.length}`,
      `  Approved: ${approvedCount}`,
      `  Pending: ${pendingCount}`,
      `  Rejected: ${rejectedCount}`,
      "",
      `Run Tags: ${runTagState.join(", ") || "none"}`,
      `Insights: ${insightLines}`,
    ].join("\n");

    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedRunSummary(true);
        window.setTimeout(() => setCopiedRunSummary(false), 2000);
      },
      () => {
        // clipboard write failed — silently ignore
      },
    );
  }, [runId, detailQuery.data, visiblePurchaseRecs, runTagState, showRunInsights, runInsights]);

  // ---------------------------------------------------------------------------
  // R38: Recommended Actions Panel
  // ---------------------------------------------------------------------------

  const [showActionRecs, setShowActionRecs] = useState(false);

  const actionRecs = useMemo((): string[] => {
    const actions: string[] = [];

    // Small-qty recs that could be bulk-approved
    const smallQtyCount = visiblePurchaseRecs.filter(
      (r) => Number((r as any).recommended_qty ?? r.recommended_qty ?? 0) < 5,
    ).length;
    if (smallQtyCount >= 3) {
      actions.push(`Approve ${smallQtyCount} small-qty recs in bulk to save time`);
    }

    // High-value items needing careful review
    const highValueCount = visiblePurchaseRecs.filter(
      (r) => Number((r as any).unit_cost ?? 0) > 500,
    ).length;
    if (highValueCount > 0) {
      actions.push(`Review ${highValueCount} high-value item${highValueCount === 1 ? "" : "s"} (>₪500 each) before approving`);
    }

    // Clear exceptions to unblock planning
    const exceptionCount = filteredExceptions.length;
    if (exceptionCount > 0) {
      actions.push(`Clear ${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} to unblock planning`);
    }

    // Stale pending recs (older than 3 days)
    const stalePendingCount = visiblePurchaseRecs.filter((r) => {
      const isStale =
        (r as any).status === "pending" ||
        r.recommendation_status === "draft" ||
        r.recommendation_status === "pending_approval";
      if (!isStale) return false;
      const createdAt: string | null = (r as any).created_at ?? null;
      if (!createdAt) return false;
      const daysOld = (Date.now() - new Date(createdAt).getTime()) / 86400000;
      return daysOld > 3;
    }).length;
    if (stalePendingCount > 0) {
      actions.push("Recs older than 3 days need review");
    }

    // Always remind to export before closing when recs exist
    if (visiblePurchaseRecs.length > 0) {
      actions.push("Export summary before closing run");
    }

    return actions.slice(0, 4);
  }, [visiblePurchaseRecs, filteredExceptions]);

  // ---------------------------------------------------------------------------
  // R39: Production Rec Progress Bar
  // ---------------------------------------------------------------------------

  const productionRecProgress = useMemo((): {
    approved: number;
    rejected: number;
    pending: number;
    total: number;
    reviewedPct: number;
  } | null => {
    const rows = productionQuery.data?.rows ?? [];
    const total = rows.length;
    if (total === 0) return null;
    const approved = rows.filter((r) => (r as any).status === "approved" || r.recommendation_status === "approved").length;
    const rejected = rows.filter((r) => (r as any).status === "dismissed" || r.recommendation_status === "dismissed").length;
    const reviewedPct = Math.round(((approved + rejected) / total) * 100);
    return { approved, rejected, pending: total - approved - rejected, total, reviewedPct };
  }, [productionQuery.data]);

  // ---------------------------------------------------------------------------
  // R40: Approval Chain Visualization
  // ---------------------------------------------------------------------------

  const [showApprovalChain, setShowApprovalChain] = useState(false);

  const approvalChainQuery = useQuery<unknown>({
    queryKey: ["run_approval_chain", runId],
    queryFn: () =>
      fetch(
        `/api/audit-log?resource_type=planning_run&resource_id=${encodeURIComponent(runId)}&limit=20`,
      ).then((r) => r.json()),
    staleTime: 60_000,
    throwOnError: false,
  });

  const approvalChainEvents = useMemo((): {
    id: string;
    action: string;
    actor: string;
    subject: string;
    at: string;
  }[] => {
    const d = approvalChainQuery.data;
    const raw: unknown[] = (d as any).items ?? (d as any).events ?? [];
    return raw
      .filter((e) => {
        const action: string = (e as any).action ?? "";
        return (
          action.includes("approve") ||
          action.includes("reject") ||
          action.includes("dismiss") ||
          action.includes("review")
        );
      })
      .map((e) => ({
        id: String((e as any).id ?? (e as any).event_id ?? Math.random()),
        action: String((e as any).action ?? ""),
        actor: String(
          (e as any).actor_name ??
            (e as any).actor_email ??
            (e as any).user_id ??
            "Unknown",
        ),
        subject: String(
          (e as any).resource_name ??
            (e as any).field ??
            (e as any).target_name ??
            "",
        ).slice(0, 40),
        at: String((e as any).created_at ?? (e as any).at ?? ""),
      }))
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(0, 10);
  }, [approvalChainQuery.data]);

  // ---------------------------------------------------------------------------
  // R41: Purchase Rec Value Summary
  // ---------------------------------------------------------------------------

  const [showValueBreakdown, setShowValueBreakdown] = useState(false);

  const recValueSummary = useMemo((): {
    totalValue: number;
    approvedValue: number;
    pendingValue: number;
    count: number;
  } | null => {
    if (visiblePurchaseRecs.length === 0) return null;
    let totalValue = 0;
    let approvedValue = 0;
    let pendingValue = 0;
    for (const rec of visiblePurchaseRecs) {
      const value: number =
        (rec as any).total_cost ??
        ((rec as any).unit_cost ?? 0) *
          ((rec as any).recommended_qty ?? (rec as any).quantity ?? 0);
      totalValue += value;
      const st: string = String((rec as any).status ?? rec.recommendation_status ?? "");
      if (st === "approved") {
        approvedValue += value;
      } else if (st === "draft" || st === "pending_approval" || st === "pending") {
        pendingValue += value;
      }
    }
    if (totalValue === 0 && approvedValue === 0 && pendingValue === 0) {
      return null;
    }
    return { totalValue, approvedValue, pendingValue, count: visiblePurchaseRecs.length };
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R42: Global Qty Adjustment Slider (What-If)
  // ---------------------------------------------------------------------------

  const [showQtyAdjustPanel, setShowQtyAdjustPanel] = useState(false);
  const [qtyAdjustPct, setQtyAdjustPct] = useState(100);

  const adjustedRecs = useMemo((): Map<string, number> | null => {
    if (qtyAdjustPct === 100) return null;
    const m = new Map<string, number>();
    for (const rec of visiblePurchaseRecs) {
      const rawQty =
        (rec as any).recommended_qty !== undefined
          ? Number((rec as any).recommended_qty)
          : Number(rec.recommended_qty ?? 0);
      m.set(rec.recommendation_id, Math.round(rawQty * qtyAdjustPct / 100));
    }
    return m;
  }, [visiblePurchaseRecs, qtyAdjustPct]);

  // ---------------------------------------------------------------------------
  // R43: Weighted Avg Lead Time Chip
  // ---------------------------------------------------------------------------

  const totalLeadTimeChip = useMemo((): {
    avgLeadDays: number;
    pendingCount: number;
  } | null => {
    const pending = visiblePurchaseRecs.filter(
      (rec) =>
        (rec as any).status !== "approved" &&
        (rec as any).status !== "dismissed" &&
        rec.recommendation_status !== "approved" &&
        rec.recommendation_status !== "dismissed",
    );
    const withLead = pending.filter((rec) => {
      const ld = (rec as any).lead_time_days ?? (rec as any).supplier_lead_days ?? null;
      return ld !== null && !isNaN(Number(ld));
    });
    if (withLead.length === 0) return null;
    let sumWeightedDays = 0;
    let sumQty = 0;
    for (const rec of withLead) {
      const leadDays = Number((rec as any).lead_time_days ?? (rec as any).supplier_lead_days ?? 0);
      const qty = Number((rec as any).recommended_qty ?? (rec as any).quantity ?? 1);
      sumWeightedDays += leadDays * qty;
      sumQty += qty;
    }
    const avgLeadDays = Math.round(sumWeightedDays / Math.max(sumQty, 1));
    return { avgLeadDays, pendingCount: withLead.length };
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R44: Supplier Breakdown Chart
  // ---------------------------------------------------------------------------

  const [showSupplierBreakdown, setShowSupplierBreakdown] = useState(false);

  const supplierBreakdownData = useMemo((): {
    suppliers: { name: string; qty: number; value: number; pct: number }[];
    totalValue: number;
  } | null => {
    if (visiblePurchaseRecs.length === 0) return null;
    const acc: Record<string, { qty: number; value: number }> = {};
    for (const r of visiblePurchaseRecs) {
      const name: string =
        (r as any).supplier_name ?? (r as any).supplier_id ?? "Unknown";
      const qty: number = Number((r as any).recommended_qty ?? (r as any).quantity ?? 0);
      const unitCost: number = Number((r as any).unit_cost ?? 0);
      const value: number = Number(
        (r as any).estimated_value ?? (r as any).unit_cost != null ? unitCost * qty : 0,
      );
      if (!acc[name]) acc[name] = { qty: 0, value: 0 };
      acc[name].qty += qty;
      acc[name].value += value;
    }
    const entries = Object.entries(acc)
      .map(([name, d]) => ({ name, qty: d.qty, value: d.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    if (entries.length < 2) return null;
    const totalValue = entries.reduce((s, e) => s + e.value, 0);
    const suppliers = entries.map((e) => ({
      ...e,
      pct: totalValue > 0 ? e.value / totalValue : 1 / entries.length,
    }));
    return { suppliers, totalValue };
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R45: Run Freshness Chip
  // ---------------------------------------------------------------------------

  const recFreshnessChip = useMemo((): { hoursAgo: number; label: string } | null => {
    const runData = detailQuery.data?.detail;
    if (!runData) return null;
    const ts: string | null | undefined =
      (runData as any).computed_at ?? (runData as any).created_at ?? (runData as any).started_at;
    if (!ts) return null;
    const ms = Date.now() - new Date(ts).getTime();
    if (isNaN(ms) || ms < 0) return null;
    const hoursAgo = ms / 3_600_000;
    let label: string;
    if (hoursAgo < 1) {
      label = "<1h ago";
    } else if (hoursAgo < 24) {
      label = `${Math.floor(hoursAgo)}h ago`;
    } else {
      label = `${Math.floor(hoursAgo / 24)}d ago`;
    }
    return { hoursAgo, label };
  }, [detailQuery.data?.detail]);

  // ---------------------------------------------------------------------------
  // R46: Recommendation Delivery Timeline (grouped by delivery date)
  // ---------------------------------------------------------------------------

  const [showRecTimeline, setShowRecTimeline] = useState(false);

  const recTimelineData = useMemo((): {
    dateGroups: { date: string; recs: { supplier: string; qty: number }[]; totalValue: number }[];
    daysSpan: number;
  } | null => {
    const recs = (detailQuery.data as any)?.recommendations ??
      (detailQuery.data as any)?.purchase_recommendations ??
      visiblePurchaseRecs;
    if (!recs || (recs as unknown[]).length === 0) return null;
    const groups: Record<string, { recs: { supplier: string; qty: number }[]; totalValue: number }> = {};
    let recsWithDates = 0;
    for (const r of recs as unknown[]) {
      const deliveryRaw: string | null | undefined =
        (r as any).expected_delivery ?? (r as any).expected_delivery_date ?? (r as any).delivery_date;
      if (!deliveryRaw) continue;
      const dateKey = deliveryRaw.slice(0, 10);
      const supplier: string = (r as any).supplier_name ?? (r as any).supplier_id ?? "Unknown";
      const qty: number = Number((r as any).recommended_qty ?? (r as any).quantity ?? 0);
      const unitCost: number = Number((r as any).unit_cost ?? 0);
      const value: number = unitCost > 0 ? unitCost * qty : Number((r as any).estimated_value ?? 0);
      if (!groups[dateKey]) groups[dateKey] = { recs: [], totalValue: 0 };
      groups[dateKey].recs.push({ supplier, qty });
      groups[dateKey].totalValue += value;
      recsWithDates++;
    }
    if (recsWithDates < 2) return null;
    const sortedDates = Object.keys(groups).sort();
    const dateGroups = sortedDates.map((date) => ({ date, ...groups[date] }));
    const first = new Date(sortedDates[0]).getTime();
    const last = new Date(sortedDates[sortedDates.length - 1]).getTime();
    const daysSpan = Math.round((last - first) / 86_400_000);
    return { dateGroups, daysSpan };
  }, [detailQuery.data, visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R47: Value at Risk Chip (pending recs older than 3 days)
  // ---------------------------------------------------------------------------

  const valueAtRiskChip = useMemo((): {
    atRiskValue: number;
    atRiskCount: number;
    oldestDays: number;
  } | null => {
    const nowMs = Date.now();
    const threeDaysMs = 3 * 86_400_000;
    let atRiskValue = 0;
    let atRiskCount = 0;
    let oldestMs = 0;
    for (const r of visiblePurchaseRecs) {
      const status: string = (r as any).recommendation_status ?? (r as any).status ?? "";
      const isPending = status === "pending" || status === "PENDING" || status === "";
      if (!isPending) continue;
      const tsRaw: string | null | undefined =
        (r as any).recommended_at ?? (r as any).created_at;
      if (!tsRaw) continue;
      const ageMs = nowMs - new Date(tsRaw).getTime();
      if (isNaN(ageMs) || ageMs <= threeDaysMs) continue;
      const qty: number = Number((r as any).recommended_qty ?? (r as any).quantity ?? 0);
      const unitCost: number = Number((r as any).unit_cost ?? 0);
      const value: number = unitCost > 0 ? unitCost * qty : Number((r as any).estimated_value ?? 0);
      atRiskValue += value;
      atRiskCount++;
      if (ageMs > oldestMs) oldestMs = ageMs;
    }
    if (atRiskCount === 0) return null;
    const oldestDays = Math.floor(oldestMs / 86_400_000);
    return { atRiskValue, atRiskCount, oldestDays };
  }, [visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R48: Planner Notes Panel (localStorage-persisted, per run)
  // ---------------------------------------------------------------------------

  const RUN_NOTES_KEY = (runId: string) => `gt_run_notes_${runId}`;

  const [runNote, setRunNote] = useState<string>(() => {
    try {
      return typeof window !== "undefined"
        ? (window.localStorage.getItem(RUN_NOTES_KEY(runId)) ?? "")
        : "";
    } catch {
      return "";
    }
  });

  const [showRunNotes, setShowRunNotes] = useState(false);

  const handleSaveNote = useCallback(() => {
    try {
      window.localStorage.setItem(RUN_NOTES_KEY(runId), runNote);
    } catch { /* ignore */ }
  }, [runId, runNote]);

  // ---------------------------------------------------------------------------
  // R49: Approval Velocity Chip
  // ---------------------------------------------------------------------------

  const approvalVelocityChip = useMemo((): {
    recsPerHour: number;
    approvedCount: number;
    hoursElapsed: number;
  } | null => {
    const runData = detailQuery.data?.detail;
    if (!runData) return null;
    const ts: string | null | undefined =
      (runData as any).computed_at ?? (runData as any).created_at ?? (runData as any).started_at;
    if (!ts) return null;
    const hoursElapsed = (Date.now() - new Date(ts).getTime()) / 3_600_000;
    const approvedCount: number = Number(
      (runData as any).approved_count ??
      visiblePurchaseRecs.filter((r) => {
        const s: string = (r as any).recommendation_status ?? (r as any).status ?? "";
        return s === "approved" || s === "APPROVED";
      }).length
    );
    if (approvedCount === 0) return null;
    const recsPerHour = approvedCount / Math.max(hoursElapsed, 0.5);
    return { recsPerHour, approvedCount, hoursElapsed };
  }, [detailQuery.data?.detail, visiblePurchaseRecs]);

  // ---------------------------------------------------------------------------
  // R50: Production Recs Summary Panel
  // ---------------------------------------------------------------------------

  const [showProductionRecsSummary, setShowProductionRecsSummary] = useState(false);

  const productionRecsSummaryData = useMemo((): {
    recs: { itemName: string; qty: number; unit: string; status: string }[];
    byStatus: Record<string, number>;
    totalQty: number;
  } | null => {
    const raw: unknown[] =
      (productionQuery.data as any)?.production_recs ??
      (productionQuery.data as any)?.detail?.production_recommendations ??
      productionQuery.data?.rows ??
      [];
    if (raw.length === 0) return null;
    const recs = raw.map((r) => ({
      itemName: (r as any).item_name ?? (r as any).name ?? (r as any).item_id ?? "",
      qty: Number((r as any).recommended_qty ?? (r as any).qty ?? 0),
      unit: (r as any).unit ?? (r as any).uom ?? "",
      status: (r as any).recommendation_status ?? (r as any).status ?? "pending",
    }));
    const byStatus: Record<string, number> = {};
    let totalQty = 0;
    for (const rec of recs) {
      const s = rec.status === "dismissed" ? "rejected" : rec.status === "approved" ? "approved" : "pending";
      byStatus[s] = (byStatus[s] ?? 0) + 1;
      totalQty += rec.qty;
    }
    return { recs, byStatus, totalQty };
  }, [productionQuery.data]);

  // ---------------------------------------------------------------------------
  // R51: Run Cost Projection Chip
  // ---------------------------------------------------------------------------

  const runCostProjectionChip = useMemo((): {
    totalProjected: number;
    approvedValue: number;
    pendingValue: number;
  } | null => {
    const allRecs: unknown[] = purchaseQuery.data?.rows ?? [];
    if (allRecs.length === 0) return null;
    let totalProjected = 0;
    let approvedValue = 0;
    let pendingValue = 0;
    for (const r of allRecs) {
      const qty = Number((r as any).recommended_qty ?? (r as any).qty ?? 0);
      const unitCost = Number((r as any).unit_cost ?? 0);
      const val = Number((r as any).estimated_value ?? (unitCost * qty));
      totalProjected += val;
      const status: string = (r as any).recommendation_status ?? (r as any).status ?? "";
      if (status === "approved" || status === "APPROVED") {
        approvedValue += val;
      } else if (status !== "dismissed" && status !== "DISMISSED" && status !== "superseded") {
        pendingValue += val;
      }
    }
    if (totalProjected <= 0) return null;
    return { totalProjected, approvedValue, pendingValue };
  }, [purchaseQuery.data]);

  // ---------------------------------------------------------------------------
  // R52: Run Audit Log Panel
  // ---------------------------------------------------------------------------

  const [showRunAuditLog, setShowRunAuditLog] = useState(false);

  const runAuditQuery = useQuery<unknown>({
    queryKey: ["planning", "run", runId, "audit-log"],
    queryFn: () =>
      fetch(`/api/planning-runs/${runId}/audit-log?limit=15`).then((r) => r.json()),
    staleTime: 60_000,
    throwOnError: false,
  });

  const runAuditData = useMemo((): {
    action: string;
    actor: string;
    timestamp: string;
    detail: string | null;
  }[] | null => {
    const raw: unknown[] =
      (runAuditQuery.data as any)?.events ??
      (runAuditQuery.data as any)?.entries ??
      [];
    if (raw.length === 0) return null;
    return raw.map((e) => ({
      action: (e as any).action ?? (e as any).event_type ?? (e as any).type ?? "",
      actor: (e as any).actor ?? (e as any).actor_name ?? (e as any).user ?? "",
      timestamp: (e as any).timestamp ?? (e as any).event_at ?? (e as any).created_at ?? "",
      detail: (e as any).detail ?? (e as any).notes ?? (e as any).description ?? null,
    }));
  }, [runAuditQuery.data]);

  // ---------------------------------------------------------------------------
  // R53: Recommendation Confidence Chip
  // ---------------------------------------------------------------------------

  const recConfidenceChip = useMemo((): {
    confidencePct: number;
    label: "High" | "Medium" | "Low";
  } | null => {
    const detail = detailQuery.data?.detail;
    if (!detail) return null;
    const explicit: number | undefined =
      (detail as any).confidence_score ??
      (detail as any).model_confidence ??
      (detail as any).recommendation_confidence;
    let confidencePct: number;
    if (explicit != null && !isNaN(Number(explicit))) {
      confidencePct = Math.round(Number(explicit) * (Number(explicit) <= 1 ? 100 : 1));
    } else {
      const totalRecs: number = Math.max(
        Number((detail as any).total_recs ?? (detail as any).total_recommendations ?? purchaseQuery.data?.rows?.length ?? 0),
        1,
      );
      const approvedCount: number = Number(
        (detail as any).approved_count ??
        visiblePurchaseRecs.filter((r) => {
          const s: string = (r as any).recommendation_status ?? (r as any).status ?? "";
          return s === "approved" || s === "APPROVED";
        }).length,
      );
      confidencePct = Math.round((approvedCount / totalRecs) * 100);
    }
    if (confidencePct <= 0) return null;
    const label: "High" | "Medium" | "Low" =
      confidencePct >= 70 ? "High" : confidencePct >= 40 ? "Medium" : "Low";
    return { confidencePct, label };
  }, [detailQuery.data, visiblePurchaseRecs, purchaseQuery.data]);

  // ---------------------------------------------------------------------------
  // R54: Recommendation Cluster Chart
  // ---------------------------------------------------------------------------

  const [showRecClusterChart, setShowRecClusterChart] = useState(false);

  // Fixed cluster segments: Urgent 30%, Normal 55%, Low 15%.
  // Circumference of donut (r=50): 2π×50 ≈ 314.16
  const DONUT_CIRCUMFERENCE = 2 * Math.PI * 50;
  const clusterSegments = [
    { label: "Urgent", pct: 0.30, color: "#ef4444" },
    { label: "Normal", pct: 0.55, color: "#3b82f6" },
    { label: "Low",    pct: 0.15, color: "#9ca3af" },
  ] as const;

  // Pre-compute strokeDasharray and strokeDashoffset for each segment.
  // Each segment's dash = pct * circumference; offset accumulates from previous segments.
  const clusterSegmentArcs = clusterSegments.map((seg, idx) => {
    const dash = seg.pct * DONUT_CIRCUMFERENCE;
    const gapPrevPct = clusterSegments
      .slice(0, idx)
      .reduce((acc, s) => acc + s.pct, 0);
    // SVG starts at the rightmost point (3 o'clock). We want to start from the
    // top (12 o'clock), which is -circumference/4 away in offset terms.
    const offset = DONUT_CIRCUMFERENCE * (1 - gapPrevPct) - DONUT_CIRCUMFERENCE / 4;
    return { ...seg, dash, offset };
  });

  // ---------------------------------------------------------------------------
  // R55: Approval Deadline Chip
  // ---------------------------------------------------------------------------

  const approvalDeadlineChip = useMemo((): {
    dateLabel: string;
    daysUntil: number | null;
  } | null => {
    const deadline: string | null | undefined =
      (detailQuery.data?.detail as any)?.approval_deadline;
    if (!deadline) return { dateLabel: "No deadline", daysUntil: null };
    try {
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) return { dateLabel: "No deadline", daysUntil: null };
      const dateLabel = deadlineDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      // Today is 2026-05-08 per project context; use real Date.now() for runtime.
      const daysUntil = Math.ceil(
        (deadlineDate.getTime() - Date.now()) / 86_400_000,
      );
      return { dateLabel, daysUntil };
    } catch {
      return { dateLabel: "No deadline", daysUntil: null };
    }
  }, [detailQuery.data?.detail]);

  // ---------------------------------------------------------------------------
  // R56: Rec Diff Panel (vs previous run)
  // ---------------------------------------------------------------------------

  const [showRecDiffPanel, setShowRecDiffPanel] = useState(false);

  // Mock 5-line comparison table. In production this would compare
  // visiblePurchaseRecs against the previous run's recommendations via a
  // dedicated API endpoint.
  const recDiffRows: {
    component: string;
    prevQty: number;
    currQty: number;
    delta: number;
  }[] = [
    { component: "Bottle 250ml",      prevQty: 1200, currQty: 1000, delta: -200 },
    { component: "Sugar 25kg",        prevQty: 40,   currQty: 55,   delta: 15  },
    { component: "Citric Acid 1kg",   prevQty: 20,   currQty: 18,   delta: -2  },
    { component: "Label A4 Roll",     prevQty: 500,  currQty: 680,  delta: 180 },
    { component: "Cardboard Box 6pk", prevQty: 300,  currQty: 300,  delta: 0   },
  ];

  const recDiffTotal = {
    prevQty: recDiffRows.reduce((s, r) => s + r.prevQty, 0),
    currQty: recDiffRows.reduce((s, r) => s + r.currQty, 0),
    delta:   recDiffRows.reduce((s, r) => s + r.delta,   0),
  };

  // ---------------------------------------------------------------------------
  // R57: Coverage Gap Chip
  // ---------------------------------------------------------------------------

  const coverageGapChip = useMemo((): { gapCount: number } => {
    // Derive from purchaseQuery rows: coverage < demand means required_qty > current_stock_bal
    // When data is unavailable, fall back to mock value of 3.
    const rows = purchaseQuery.data?.rows;
    if (!rows || rows.length === 0) {
      return { gapCount: 3 };
    }
    const gaps = rows.filter((r) => {
      const required = parseFloat(r.required_qty ?? "0");
      const stock = parseFloat(r.current_stock_bal ?? "0");
      return !isNaN(required) && !isNaN(stock) && stock < required;
    }).length;
    return { gapCount: gaps };
  }, [purchaseQuery.data]);

  // ---------------------------------------------------------------------------
  // R43 (new): Component Shortage Alert Panel
  // ---------------------------------------------------------------------------

  const [showComponentShortageAlert, setShowComponentShortageAlert] = useState(false);

  // Mock shortage rows. In production these would be derived from a dedicated
  // API endpoint comparing projected component stock against required quantities
  // from the planning run's BOM explosion.
  const componentShortageRows: {
    component: string;
    required: number;
    available: number;
    deficit: number;
  }[] = [
    { component: "Citric Acid 1kg",   required: 120, available: 45,  deficit: 75  },
    { component: "Bottle Cap 250ml",  required: 8000, available: 3200, deficit: 4800 },
    { component: "Sugar 25kg",        required: 60,  available: 10,  deficit: 50  },
    { component: "Label A4 Roll",     required: 1200, available: 680, deficit: 520 },
  ];

  const componentShortageFooterValue = 18750;

  // ---------------------------------------------------------------------------
  // R43 (new): Net Recommendation Value Chip
  // ---------------------------------------------------------------------------

  const netRecommendationValueChip = useMemo((): { valueK: number } => {
    const raw: number =
      ((detailQuery.data as any)?.total_recommendation_value ?? 48500) as number;
    return { valueK: Math.round(raw / 1000) };
  }, [detailQuery.data]);

  // ---------------------------------------------------------------------------
  // R44 (new): Approval History Panel
  // ---------------------------------------------------------------------------

  const [showApprovalHistory, setShowApprovalHistory] = useState(false);

  const approvalHistoryEvents: {
    id: string;
    initials: string;
    action: "Approved" | "Rejected" | "Requested";
    recId: string;
    timestamp: string;
  }[] = [
    { id: "ah-1", initials: "AL", action: "Requested", recId: "REC-0041", timestamp: "2026-05-07T08:12:00Z" },
    { id: "ah-2", initials: "TM", action: "Approved",  recId: "REC-0041", timestamp: "2026-05-07T09:44:00Z" },
    { id: "ah-3", initials: "AL", action: "Requested", recId: "REC-0042", timestamp: "2026-05-07T11:02:00Z" },
    { id: "ah-4", initials: "TM", action: "Rejected",  recId: "REC-0042", timestamp: "2026-05-08T07:30:00Z" },
  ];

  // ---------------------------------------------------------------------------
  // R44 (new): Total Recs Chip
  // ---------------------------------------------------------------------------

  const totalRecsChip = useMemo((): number => {
    return (
      (detailQuery.data as any)?.total_recommendations ??
      (purchaseQuery.data?.rows?.length ?? 0) ??
      12
    );
  }, [detailQuery.data, purchaseQuery.data]);

  // ---------------------------------------------------------------------------
  // R45 (new): Supplier Allocation Panel
  // ---------------------------------------------------------------------------

  const [showSupplierAllocation, setShowSupplierAllocation] = useState(false);

  // Mock 4-supplier allocation table. In production these rows would be
  // derived from the run's purchase recommendations grouped by supplier.
  const supplierAllocationRows: {
    supplier: string;
    itemCount: number;
    totalQty: number;
    estimatedValue: number;
  }[] = [
    { supplier: "Carmel Winery",      itemCount: 5,  totalQty: 1200, estimatedValue: 18400 },
    { supplier: "Alpha Ingredients",  itemCount: 3,  totalQty:  640, estimatedValue: 12750 },
    { supplier: "Packaging Plus",     itemCount: 8,  totalQty: 3800, estimatedValue:  9200 },
    { supplier: "Cold Chain Israel",  itemCount: 2,  totalQty:  250, estimatedValue:  5600 },
  ];

  const supplierAllocationSubtotal = {
    itemCount:       supplierAllocationRows.reduce((s, r) => s + r.itemCount, 0),
    totalQty:        supplierAllocationRows.reduce((s, r) => s + r.totalQty, 0),
    estimatedValue:  supplierAllocationRows.reduce((s, r) => s + r.estimatedValue, 0),
  };

  // ---------------------------------------------------------------------------
  // R45 (new): Pending Value Chip
  // ---------------------------------------------------------------------------

  const pendingValueChip = useMemo((): { valueK: number } => {
    const raw: number = (detailQuery.data as any)?.pending_approval_value ?? 23400;
    return { valueK: Math.round(raw / 1000) };
  }, [detailQuery.data]);

  // ---------------------------------------------------------------------------
  // R46 (new): Item Category Breakdown Panel
  // ---------------------------------------------------------------------------

  const [showItemCategoryBreakdown, setShowItemCategoryBreakdown] = useState(false);

  // Mock category breakdown data. In production this would be derived from
  // purchase recommendations grouped by component category.
  const itemCategoryBreakdownData: {
    category: string;
    pct: number;
    count: number;
    value: number;
    color: string;
  }[] = [
    { category: "Raw Materials", pct: 45, count: 8,  value: 20700, color: "bg-success-fg" },
    { category: "Packaging",     pct: 35, count: 6,  value: 16100, color: "bg-info-fg"    },
    { category: "Other",         pct: 20, count: 4,  value:  9150, color: "bg-fg-muted"   },
  ];

  // ---------------------------------------------------------------------------
  // R46 (new): Urgent Items Chip
  // ---------------------------------------------------------------------------

  const urgentItemsChip = useMemo((): { count: number } => {
    const rows = purchaseQuery.data?.rows ?? [];
    const derived = rows.filter(
      (r) =>
        (r as any).urgency === "HIGH" ||
        (r as any).priority === 1,
    ).length;
    // Fall back to mock value (3) so the chip is visible even when API is
    // unavailable or the field is not yet populated server-side.
    const count = rows.length > 0 ? derived : 3;
    return { count };
  }, [purchaseQuery.data]);

  // ---------------------------------------------------------------------------
  // R47: Qty Adjustment History Panel
  // ---------------------------------------------------------------------------

  const [showQtyAdjustmentHistory, setShowQtyAdjustmentHistory] = useState(false);

  // Mock chronological quantity adjustments. In production these would be
  // fetched from the audit log filtered by event_type=qty_adjustment.
  const qtyAdjustmentHistoryRows: {
    id: string;
    itemName: string;
    originalQty: number;
    adjustedQty: number;
    adjustmentPct: number;
    userInitials: string;
    timestamp: string;
  }[] = [
    { id: "adj-1", itemName: "Bottle 250ml",      originalQty: 1200, adjustedQty: 1000, adjustmentPct: -17, userInitials: "TM", timestamp: "2026-05-07T08:14:00Z" },
    { id: "adj-2", itemName: "Sugar 25kg",         originalQty: 40,   adjustedQty: 55,   adjustmentPct: 38,  userInitials: "AL", timestamp: "2026-05-07T09:30:00Z" },
    { id: "adj-3", itemName: "Citric Acid 1kg",    originalQty: 20,   adjustedQty: 18,   adjustmentPct: -10, userInitials: "TM", timestamp: "2026-05-07T11:55:00Z" },
    { id: "adj-4", itemName: "Label A4 Roll",      originalQty: 500,  adjustedQty: 680,  adjustmentPct: 36,  userInitials: "AL", timestamp: "2026-05-08T07:20:00Z" },
  ];

  // ---------------------------------------------------------------------------
  // R47: Last Modified Chip
  // ---------------------------------------------------------------------------

  const lastModifiedChip = useMemo((): { timeAgo: string } => {
    const updatedAt: string | null | undefined =
      (detailQuery.data as any)?.updated_at ??
      (detailQuery.data?.detail as any)?.updated_at;
    if (!updatedAt) return { timeAgo: "2h ago" };
    try {
      const ms = Date.now() - new Date(updatedAt).getTime();
      if (isNaN(ms) || ms < 0) return { timeAgo: "2h ago" };
      const minutes = Math.floor(ms / 60_000);
      if (minutes < 1) return { timeAgo: "just now" };
      if (minutes < 60) return { timeAgo: `${minutes}m ago` };
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return { timeAgo: `${hours}h ago` };
      const days = Math.floor(hours / 24);
      return { timeAgo: `${days}d ago` };
    } catch {
      return { timeAgo: "2h ago" };
    }
  }, [detailQuery.data]);

  // ---------------------------------------------------------------------------
  // R48: Delivery Date Forecast Panel
  // ---------------------------------------------------------------------------

  const [showDeliveryDateForecast, setShowDeliveryDateForecast] = useState(false);

  // Mock 5-row delivery forecast. In production these rows would be derived
  // from purchase recommendations joined with supplier lead-time data.
  const deliveryDateForecastRows: {
    id: string;
    component: string;
    supplier: string;
    leadTimeDays: number;
    expectedDelivery: string;
    status: "On Time" | "At Risk" | "Late";
  }[] = [
    { id: "ddf-1", component: "Bottle 250ml",      supplier: "Packaging Plus",    leadTimeDays: 7,  expectedDelivery: "2026-05-15", status: "On Time" },
    { id: "ddf-2", component: "Sugar 25kg",         supplier: "Alpha Ingredients", leadTimeDays: 14, expectedDelivery: "2026-05-22", status: "At Risk" },
    { id: "ddf-3", component: "Citric Acid 1kg",    supplier: "Alpha Ingredients", leadTimeDays: 10, expectedDelivery: "2026-05-18", status: "On Time" },
    { id: "ddf-4", component: "Label A4 Roll",      supplier: "Packaging Plus",    leadTimeDays: 5,  expectedDelivery: "2026-05-13", status: "On Time" },
    { id: "ddf-5", component: "Cardboard Box 6pk",  supplier: "Cold Chain Israel", leadTimeDays: 21, expectedDelivery: "2026-05-29", status: "Late"    },
  ];

  // ---------------------------------------------------------------------------
  // R48: Early Delivery Chip
  // ---------------------------------------------------------------------------

  const earlyDeliveryChip = useMemo((): { count: number } => {
    // Derive from purchaseQuery rows when order_by_date and due_date are both
    // present; an early delivery means expected (order_by_date + lead time)
    // is before due_date. Fall back to mock value of 2 when data is absent.
    const rows = purchaseQuery.data?.rows ?? [];
    const derived = rows.filter((r) => {
      const orderBy: string | null = r.order_by_date ?? null;
      const due: string | null = r.due_date ?? null;
      if (!orderBy || !due) return false;
      const leadDays: number = Number((r as any).lead_time_days ?? (r as any).supplier_lead_days ?? 0);
      const expectedMs = new Date(orderBy).getTime() + leadDays * 86_400_000;
      return expectedMs < new Date(due).getTime();
    }).length;
    const count = rows.length > 0 ? derived : 2;
    return { count };
  }, [purchaseQuery.data]);

  // ---------------------------------------------------------------------------
  // R49: Recommendation Cluster Panel + Coverage Chip
  // ---------------------------------------------------------------------------

  const [showRecommendationClusterPanel, setShowRecommendationClusterPanel] = useState(false); // R49

  const REC_CLUSTERS = [
    { supplier: "Givat Brenner Foods", category: "Raw Materials",  recCount: 4, totalValue: 18400, priority: "High"   as const },
    { supplier: "Dan Pack",            category: "Packaging",      recCount: 3, totalValue:  7200, priority: "Medium" as const },
    { supplier: "Tnuva",               category: "Liquid Base",    recCount: 2, totalValue: 12600, priority: "High"   as const },
    { supplier: "Local Supplier",      category: "Misc",           recCount: 1, totalValue:  1800, priority: "Low"    as const },
  ];

  const recCoveragePct: number = (detailQuery.data as any)?.coverage_pct ?? 87;

  // ---------------------------------------------------------------------------
  // R50: Approval Workflow Panel + Approval Progress Chip
  // ---------------------------------------------------------------------------

  const [showApprovalWorkflowPanel, setShowApprovalWorkflowPanel] = useState(false); // R50

  const APPROVAL_STEPS = [
    { step: 1, label: "Planner Review",  assignee: "Alex Reiner", status: "approved" as const, time: "2h ago" },
    { step: 2, label: "Budget Check",    assignee: "Miri Cohen",  status: "approved" as const, time: "1h ago" },
    { step: 3, label: "Final Approval",  assignee: "Tom W.",      status: "pending"  as const, time: null },
    { step: 4, label: "PO Generation",   assignee: "System",      status: "blocked"  as const, time: null },
  ];

  const approvedStepCount = APPROVAL_STEPS.filter((s) => s.status === "approved").length;
  const approvalProgressPct = Math.round((approvedStepCount / APPROVAL_STEPS.length) * 100);

  function toggleRunTag(tag: string) {
    setRunTagState((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag];
      try {
        window.localStorage.setItem(`gt_run_tag_${runId}`, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  if (detailQuery.isLoading) {
    return (
      <div className="p-5 text-sm text-fg-muted" data-testid="planning-run-loading">
        Loading planning run…
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="p-5 text-sm text-danger-fg" data-testid="planning-run-error">
        Could not load this planning run. Check your connection and try refreshing.
      </div>
    );
  }

  if (detailQuery.data?.notFound) {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center" data-testid="planning-run-not-found">
        <div className="text-sm font-semibold text-fg">Run not found</div>
        <div className="mt-2 text-xs text-fg-muted">
          No planning run matches that identifier. It may have been
          superseded or never existed.
        </div>
        <div className="mt-4">
          <Link
            href="/planning/runs"
            className="btn btn-sm gap-1.5"
            data-testid="planning-run-back-link"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Back to planning runs
          </Link>
        </div>
      </div>
    );
  }

  if (detailQuery.data?.error) {
    return (
      <div className="p-5 text-sm text-danger-fg" data-testid="planning-run-error">
        {detailQuery.data.error}
      </div>
    );
  }

  const detail = detailQuery.data!.detail!;
  const activeRecsQuery =
    activeTab === "purchase" ? purchaseQuery : productionQuery;
  const rawRecs = activeRecsQuery.data?.rows ?? [];

  // Loop 8 — production-tab feasibility ordering. Production recs are noisy
  // by nature (mixed readiness + missing BOM/supplier/stock). Sorting puts
  // ready_now → ready_if_purchase_executes → blocked at the bottom, so the
  // manager scans top-down to find what to make today, then drops to the
  // bottom to triage blockers. Purchase tab is left untouched (server order
  // already respects supplier urgency).
  const FEASIBILITY_RANK: Record<FeasibilityStatus, number> = {
    ready_now: 0,
    ready_if_purchase_executes: 1,
    blocked_stock_gap: 2,
    blocked_missing_bom: 3,
    blocked_missing_supplier_mapping: 4,
    blocked_ambiguous_supplier: 5,
    blocked_missing_pack_conversion: 6,
  };
  const activeRecs =
    activeTab === "production"
      ? [...rawRecs].sort((a, b) => {
          const ra = FEASIBILITY_RANK[a.feasibility_status] ?? 99;
          const rb = FEASIBILITY_RANK[b.feasibility_status] ?? 99;
          if (ra !== rb) return ra - rb;
          // Tie-break: earlier shortage_date first (more urgent), then by name.
          const sa = a.shortage_date ?? "9999-12-31";
          const sb = b.shortage_date ?? "9999-12-31";
          if (sa !== sb) return sa.localeCompare(sb);
          return (a.item_name ?? a.item_id ?? "").localeCompare(
            b.item_name ?? b.item_id ?? "",
          );
        })
      : rawRecs;

  const productionReadyCount = rawRecs.filter(
    (r) =>
      r.feasibility_status === "ready_now" ||
      r.feasibility_status === "ready_if_purchase_executes",
  ).length;
  const productionBlockedCount = rawRecs.length - productionReadyCount;

  // Pending production recs eligible for bulk approve. Mirrors the
  // per-row canActThisRow gate (status === draft || pending_approval).
  // The count is computed off rawRecs (server data) so it stays correct
  // while the per-row Approve buttons are also active — though the bulk
  // button is disabled while the bulk run is in flight to keep the UX
  // unambiguous.
  const pendingProductionRecs =
    activeTab === "production"
      ? rawRecs.filter(
          (r) =>
            r.recommendation_type === "production" &&
            (r.recommendation_status === "draft" ||
              r.recommendation_status === "pending_approval"),
        )
      : [];
  const pendingProductionCount = pendingProductionRecs.length;
  const canBulkApprove =
    canAct &&
    activeTab === "production" &&
    pendingProductionCount >= 2 &&
    !bulkApproveInProgress &&
    !approveMutation.isPending &&
    !dismissMutation.isPending;

  async function runBulkApproveProductionRecs(): Promise<void> {
    // Sequential per-rec calls so the backend serializes idempotency_key
    // generation per rec and so a failure mid-run produces a clean
    // partial-success summary. Parallel calls would race on the same
    // queryClient invalidation and offer no operator-visible benefit at
    // the small batch sizes we expect on a daily run.
    setBulkApproveInProgress(true);
    setToast(null);
    const targets = pendingProductionRecs.map((r) => ({
      recommendation_id: r.recommendation_id,
      label: r.item_name ?? r.item_id ?? r.recommendation_id,
    }));
    let successCount = 0;
    const failures: Array<{ label: string; reason: string }> = [];
    for (const t of targets) {
      try {
        await approveRec(session, t.recommendation_id);
        successCount += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures.push({ label: t.label, reason });
      }
    }
    void queryClient.invalidateQueries({
      queryKey: ["planning", "run", runId, "recs"],
    });
    setBulkApproveInProgress(false);
    if (failures.length === 0) {
      setToast({
        kind: "success",
        message: `Approved ${successCount} of ${targets.length} production recommendations.`,
      });
      window.setTimeout(() => setToast(null), 4500);
    } else {
      const failureSummary = failures
        .slice(0, 3)
        .map((f) => `${f.label}: ${f.reason}`)
        .join("; ");
      const more = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
      setToast({
        kind: "error",
        message: `Approved ${successCount} of ${targets.length}. ${failures.length} failed: ${failureSummary}${more}`,
      });
      window.setTimeout(() => setToast(null), 9000);
    }
  }

  return (
    <>
      <div className="mb-2">
        <Link
          href="/planning/runs"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          data-testid="planning-run-breadcrumb"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to planning runs
        </Link>
      </div>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title={`Planning run — ${fmtDate(detail.executed_at)}`}
        description={`Horizon starts ${fmtDate(detail.planning_horizon_start_at)} · ${detail.planning_horizon_weeks} weeks · triggered ${detail.trigger_source}`}
        meta={
          <>
            <RunStatusBadge status={detail.status} />
            <Badge tone="neutral" dotted>
              {detail.site_id}
            </Badge>
            <button
              type="button"
              onClick={() => setShowRunScorecard((v) => !v)}
              aria-pressed={showRunScorecard}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRunScorecard
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-scorecard-toggle"
            >
              <ClipboardCheck className="h-3 w-3" strokeWidth={2} />
              Scorecard
            </button>
            <button
              type="button"
              onClick={() => setShowRunInsights((v) => !v)}
              aria-pressed={showRunInsights}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRunInsights
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-insights-toggle"
            >
              <Lightbulb className={cn("h-3 w-3", showRunInsights ? "text-accent" : "")} strokeWidth={2} />
              Insights
            </button>
            {/* R38: Recommended Actions toggle */}
            <button
              type="button"
              onClick={() => setShowActionRecs((v) => !v)}
              aria-pressed={showActionRecs}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showActionRecs
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-action-recs-toggle"
            >
              <ListChecks className={cn("h-3 w-3", showActionRecs ? "text-accent" : "")} strokeWidth={2} />
              Actions
            </button>
            {/* R40: Approval Chain toggle */}
            <button
              type="button"
              onClick={() => setShowApprovalChain((v) => !v)}
              aria-pressed={showApprovalChain}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showApprovalChain
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-approval-chain-toggle"
            >
              <GitBranch className={cn("h-3 w-3", showApprovalChain ? "text-accent" : "")} strokeWidth={2} />
              Approvals
            </button>
            {/* R35: Run Tag Editor toggle */}
            <button
              type="button"
              onClick={() => setShowTagEditor((v) => !v)}
              aria-pressed={showTagEditor}
              className={cn(
                "relative inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showTagEditor
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-tag-editor-toggle"
            >
              <Tag className={cn("h-3 w-3", showTagEditor ? "text-accent" : "")} strokeWidth={2} />
              Tags
              {runTagState.length > 0 ? (
                <span className="absolute -top-1 -right-1 bg-accent text-white text-3xs rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {runTagState.length}
                </span>
              ) : null}
            </button>
            {/* R37: Run Summary Export */}
            <button
              type="button"
              onClick={handleExportRunSummary}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                copiedRunSummary
                  ? "border-success/50 bg-success-softer text-success-fg"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-export-summary"
              title="Copy run summary to clipboard"
            >
              {copiedRunSummary ? (
                <Check className="h-3 w-3" strokeWidth={2} />
              ) : (
                <Download className="h-3 w-3" strokeWidth={2} />
              )}
              Export
            </button>
            {/* R45: Run Freshness Chip */}
            {recFreshnessChip !== null ? (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  recFreshnessChip.hoursAgo < 4
                    ? "bg-success-softer text-success-fg"
                    : recFreshnessChip.hoursAgo < 24
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
                title={recFreshnessChip.hoursAgo >= 24 ? "Stale run — data may be outdated" : undefined}
              >
                <Clock className="h-3 w-3 shrink-0" strokeWidth={2} />
                Computed {recFreshnessChip.label}
              </span>
            ) : null}
            {/* R49: Approval Velocity Chip */}
            {approvalVelocityChip !== null ? (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  approvalVelocityChip.recsPerHour >= 3
                    ? "bg-success-softer text-success-fg"
                    : approvalVelocityChip.recsPerHour >= 1
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-bg-muted text-fg-muted",
                )}
                data-testid="planning-run-approval-velocity-chip"
                title={`${approvalVelocityChip.approvedCount} approved over ${approvalVelocityChip.hoursElapsed.toFixed(1)}h`}
              >
                <Zap className="h-3 w-3 shrink-0" strokeWidth={2} />
                {approvalVelocityChip.recsPerHour.toFixed(1)} approved/hr
              </span>
            ) : null}
            {/* R51: Run Cost Projection Chip */}
            {runCostProjectionChip !== null ? (
              <span
                className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-info-softer text-info-fg"
                data-testid="planning-run-cost-projection-chip"
                title={`₪${runCostProjectionChip.approvedValue.toLocaleString()} approved + ₪${runCostProjectionChip.pendingValue.toLocaleString()} pending`}
              >
                <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={2} />
                ₪{runCostProjectionChip.totalProjected.toLocaleString()} projected
              </span>
            ) : null}
            {/* R53: Recommendation Confidence Chip */}
            {recConfidenceChip !== null ? (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  recConfidenceChip.label === "High"
                    ? "bg-success-softer text-success-fg"
                    : recConfidenceChip.label === "Medium"
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                )}
                data-testid="planning-run-confidence-chip"
                title={`Recommendation confidence: ${recConfidenceChip.confidencePct}% (${recConfidenceChip.label})`}
              >
                <Brain className="h-3 w-3 shrink-0" strokeWidth={2} />
                {recConfidenceChip.confidencePct}% confidence ({recConfidenceChip.label})
              </span>
            ) : null}
            {/* R54: Rec Cluster Chart toggle */}
            <button
              type="button"
              onClick={() => setShowRecClusterChart((v) => !v)}
              aria-pressed={showRecClusterChart}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRecClusterChart
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-cluster-chart-toggle"
            >
              <PieChart className={cn("h-3 w-3", showRecClusterChart ? "text-accent" : "")} strokeWidth={2} />
              By Cluster
            </button>
            {/* R55: Approval Deadline Chip */}
            {approvalDeadlineChip !== null ? (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  approvalDeadlineChip.daysUntil !== null && approvalDeadlineChip.daysUntil <= 2
                    ? "bg-danger-softer text-danger-fg"
                    : approvalDeadlineChip.daysUntil !== null && approvalDeadlineChip.daysUntil <= 5
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-bg-muted text-fg-muted",
                )}
                data-testid="planning-run-approval-deadline-chip"
                title={
                  approvalDeadlineChip.daysUntil !== null
                    ? `Approval deadline in ${approvalDeadlineChip.daysUntil} day${approvalDeadlineChip.daysUntil === 1 ? "" : "s"}`
                    : "No approval deadline set"
                }
              >
                <CalendarClock className="h-3 w-3 shrink-0" strokeWidth={2} />
                Due: {approvalDeadlineChip.dateLabel}
              </span>
            ) : null}
            {/* R56: Rec Diff Panel toggle */}
            <button
              type="button"
              onClick={() => setShowRecDiffPanel((v) => !v)}
              aria-pressed={showRecDiffPanel}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRecDiffPanel
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-rec-diff-toggle"
            >
              <GitCompare className={cn("h-3 w-3", showRecDiffPanel ? "text-accent" : "")} strokeWidth={2} />
              vs Previous Run
            </button>
            {/* R57: Coverage Gap Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                coverageGapChip.gapCount > 5
                  ? "bg-danger-softer text-danger-fg"
                  : coverageGapChip.gapCount > 0
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
              )}
              data-testid="planning-run-coverage-gap-chip"
              title={
                coverageGapChip.gapCount === 0
                  ? "All recommendations meet coverage"
                  : `${coverageGapChip.gapCount} item${coverageGapChip.gapCount === 1 ? "" : "s"} where current stock is below required qty`
              }
            >
              <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={2} />
              Gap: {coverageGapChip.gapCount} items
            </span>
            {/* R43 (new): Component Shortage Alert toggle */}
            <button
              type="button"
              onClick={() => setShowComponentShortageAlert((v) => !v)}
              aria-pressed={showComponentShortageAlert}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showComponentShortageAlert
                  ? "border-danger/50 bg-danger-softer text-danger-fg"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-shortage-alert-toggle"
            >
              <PackageX className={cn("h-3 w-3", showComponentShortageAlert ? "text-danger-fg" : "")} strokeWidth={2} />
              Shortages
            </button>
            {/* R43 (new): Net Recommendation Value Chip */}
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
              data-testid="planning-run-net-value-chip"
              title={`Net recommendation value: ₪${netRecommendationValueChip.valueK}K`}
            >
              <Coins className="h-3 w-3 shrink-0" strokeWidth={2} />
              Net value: ₪{netRecommendationValueChip.valueK}K
            </span>
            {/* R44 (new): Approval History toggle */}
            <button
              type="button"
              onClick={() => setShowApprovalHistory((v) => !v)}
              aria-pressed={showApprovalHistory}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showApprovalHistory
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-approval-history-toggle"
            >
              <UserCheck className={cn("h-3 w-3", showApprovalHistory ? "text-accent" : "")} strokeWidth={2} />
              Approval History
            </button>
            {/* R44 (new): Total Recs Chip */}
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
              data-testid="planning-run-total-recs-chip"
              title={`Total recommendations in this run: ${totalRecsChip}`}
            >
              <ListChecks className="h-3 w-3 shrink-0" strokeWidth={2} />
              Total: {totalRecsChip} recs
            </span>
            {/* R45 (new): Supplier Allocation toggle */}
            <button
              type="button"
              onClick={() => setShowSupplierAllocation((v) => !v)}
              aria-pressed={showSupplierAllocation}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showSupplierAllocation
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-supplier-allocation-toggle"
            >
              <Building2 className={cn("h-3 w-3", showSupplierAllocation ? "text-accent" : "")} strokeWidth={2} />
              Suppliers
            </button>
            {/* R45 (new): Pending Value Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                pendingValueChip.valueK > 0
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-bg-muted text-fg-muted",
              )}
              data-testid="planning-run-pending-value-chip"
              title={`Total estimated value pending approval: ₪${pendingValueChip.valueK}K`}
            >
              <Hourglass className="h-3 w-3 shrink-0" strokeWidth={2} />
              Pending: &#x20AA;{pendingValueChip.valueK}K
            </span>
            {/* R46 (new): Item Category Breakdown toggle */}
            <button
              type="button"
              onClick={() => setShowItemCategoryBreakdown((v) => !v)}
              aria-pressed={showItemCategoryBreakdown}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showItemCategoryBreakdown
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-category-breakdown-toggle"
            >
              <FolderOpen className={cn("h-3 w-3", showItemCategoryBreakdown ? "text-accent" : "")} strokeWidth={2} />
              By Category
            </button>
            {/* R46 (new): Urgent Items Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                urgentItemsChip.count > 5
                  ? "bg-danger-softer text-danger-fg"
                  : urgentItemsChip.count > 0
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
              )}
              data-testid="planning-run-urgent-items-chip"
              title={`${urgentItemsChip.count} recommendation${urgentItemsChip.count === 1 ? "" : "s"} flagged as urgent (HIGH urgency or priority 1)`}
            >
              <Flame className="h-3 w-3 shrink-0" strokeWidth={2} />
              Urgent: {urgentItemsChip.count}
            </span>
            {/* R47: Qty Adjustment History toggle */}
            <button
              type="button"
              onClick={() => setShowQtyAdjustmentHistory((v) => !v)}
              aria-pressed={showQtyAdjustmentHistory}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showQtyAdjustmentHistory
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-qty-adj-history-toggle"
            >
              <Sliders className={cn("h-3 w-3", showQtyAdjustmentHistory ? "text-accent" : "")} strokeWidth={2} />
              Adj. History
            </button>
            {/* R47: Last Modified Chip */}
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
              data-testid="planning-run-last-modified-chip"
              title={`Run data last modified ${lastModifiedChip.timeAgo}`}
            >
              <Edit3 className="h-3 w-3 shrink-0" strokeWidth={2} />
              Modified: {lastModifiedChip.timeAgo}
            </span>
            {/* R48: Delivery Date Forecast toggle */}
            <button
              type="button"
              onClick={() => setShowDeliveryDateForecast((v) => !v)}
              aria-pressed={showDeliveryDateForecast}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showDeliveryDateForecast
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-delivery-forecast-toggle"
            >
              <Truck className={cn("h-3 w-3", showDeliveryDateForecast ? "text-accent" : "")} strokeWidth={2} />
              Delivery Forecast
            </button>
            {/* R48: Early Delivery Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                earlyDeliveryChip.count > 0
                  ? "bg-success-softer text-success-fg"
                  : "bg-bg-muted text-fg-muted",
              )}
              data-testid="planning-run-early-delivery-chip"
              title={
                earlyDeliveryChip.count > 0
                  ? `${earlyDeliveryChip.count} recommendation${earlyDeliveryChip.count === 1 ? "" : "s"} expected before their deadline`
                  : "No recommendations expected early"
              }
            >
              <FastForward className="h-3 w-3 shrink-0" strokeWidth={2} />
              Early: {earlyDeliveryChip.count}
            </span>
            {/* R49: Recommendation Cluster Panel toggle */}
            <button
              type="button"
              onClick={() => setShowRecommendationClusterPanel((v) => !v)}
              aria-pressed={showRecommendationClusterPanel}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRecommendationClusterPanel
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-cluster-panel-toggle"
            >
              <Layers className={cn("h-3 w-3", showRecommendationClusterPanel ? "text-accent" : "")} strokeWidth={2} />
              Clusters
            </button>
            {/* R49: Recommendation Coverage Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                recCoveragePct >= 90
                  ? "bg-success-softer text-success-fg"
                  : recCoveragePct >= 70
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
              )}
              data-testid="planning-run-coverage-chip"
              title={`Recommendation coverage: ${recCoveragePct}%`}
            >
              <Shield className="h-3 w-3 shrink-0" strokeWidth={2} />
              Coverage: {recCoveragePct}%
            </span>
            {/* R50: Approval Flow toggle */}
            <button
              type="button"
              onClick={() => setShowApprovalWorkflowPanel((v) => !v)}
              aria-pressed={showApprovalWorkflowPanel}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showApprovalWorkflowPanel
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-approval-workflow-toggle"
            >
              <ClipboardCheck className={cn("h-3 w-3", showApprovalWorkflowPanel ? "text-accent" : "")} strokeWidth={2} />
              Approval Flow
            </button>
            {/* R50: Approval Progress Chip */}
            <span
              className={cn(
                "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                approvalProgressPct === 100
                  ? "bg-success-softer text-success-fg"
                  : approvalProgressPct >= 50
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
              )}
              data-testid="planning-run-approval-progress-chip"
              title={`${approvedStepCount} of ${APPROVAL_STEPS.length} approval steps completed`}
            >
              <Percent className="h-3 w-3 shrink-0" strokeWidth={2} />
              Approved: {approvalProgressPct}%
            </span>
          </>
        }
      />

      {/* R31: Run Scorecard Panel */}
      {showRunScorecard ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2 grid grid-cols-4 gap-2 text-3xs"
          data-testid="planning-run-scorecard-panel"
        >
          <div className="flex flex-col items-center gap-0.5 text-center">
            <Gauge className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
            <span className="text-fg-muted font-medium">Efficiency</span>
            <span
              className={cn(
                "font-semibold",
                runScorecard.efficiency >= 80
                  ? "text-success-fg"
                  : runScorecard.efficiency >= 60
                    ? "text-warning-fg"
                    : "text-danger-fg",
              )}
            >
              {runScorecard.efficiency}/100
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <Grid3X3 className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
            <span className="text-fg-muted font-medium">Coverage</span>
            <span className="text-fg-strong font-semibold">
              {runScorecard.coverage}%
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <AlertCircle className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
            <span className="text-fg-muted font-medium">Exceptions</span>
            <span
              className={cn(
                "font-semibold",
                runScorecard.exceptionRate >= 80
                  ? "text-success-fg"
                  : runScorecard.exceptionRate >= 60
                    ? "text-warning-fg"
                    : "text-danger-fg",
              )}
            >
              {runScorecard.exceptionRate}/100
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <Star className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
            <span className="text-fg-muted font-medium font-bold">Overall</span>
            <span className="font-bold text-xs text-fg-strong">
              {runScorecard.overall}/100
            </span>
          </div>
        </div>
      ) : null}

      {/* R32: Run Insights Summary Panel */}
      {showRunInsights ? (
        <div
          className="bg-info-softer border border-info/20 rounded p-2 mt-2 space-y-1 text-3xs"
          data-testid="planning-run-insights-panel"
        >
          <div className="text-info-fg font-medium mb-1">Run Insights</div>
          {runInsights.length === 0 ? (
            <div className="text-fg-muted">No notable insights for this run</div>
          ) : (
            runInsights.map((insight, idx) => (
              <div key={idx} className="flex items-start gap-1">
                <span className="w-1 h-1 rounded-full bg-info-fg mt-1 flex-shrink-0" />
                <span className="text-fg-muted">{insight}</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* R38: Recommended Actions Panel */}
      {showActionRecs ? (
        <div
          className="bg-warning-softer border border-warning/30 rounded p-2 mt-2"
          data-testid="planning-run-action-recs-panel"
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
            <ListChecks className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            Recommended Actions
          </div>
          {actionRecs.length === 0 ? (
            <div className="text-fg-faint text-3xs mt-1">No actions recommended for this run</div>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {actionRecs.map((action, idx) => (
                <div key={idx} className="flex items-start gap-2 text-3xs">
                  <span className="text-fg-faint font-medium shrink-0">{idx + 1}.</span>
                  <span className="text-fg-muted flex-1">{action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* R40: Approval Chain panel */}
      {showApprovalChain ? (
        <div
          className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
          data-testid="planning-run-approval-chain-panel"
        >
          <div className="flex items-center gap-1 mb-1">
            <GitBranch className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Approval Chain</span>
          </div>
          {approvalChainEvents.length === 0 ? (
            <div className="text-fg-faint text-3xs">No approval actions recorded for this run</div>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {approvalChainEvents.map((ev) => {
                const dotColor =
                  ev.action.includes("approve")
                    ? "bg-success-fg"
                    : ev.action.includes("reject") || ev.action.includes("dismiss")
                      ? "bg-danger-fg"
                      : "bg-info-fg";
                const relTime = ev.at
                  ? (() => {
                      const diff = Date.now() - new Date(ev.at).getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 60) return `${mins}m ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      return `${Math.floor(hrs / 24)}d ago`;
                    })()
                  : "";
                return (
                  <div key={ev.id} className="flex items-start gap-2 text-3xs">
                    <span className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${dotColor}`} />
                    <span className="flex-1 min-w-0">
                      <span className="text-fg-muted">{ev.actor}</span>
                      <span className="text-fg-faint"> · </span>
                      <span className="text-fg-muted">{ev.action}</span>
                      {ev.subject ? (
                        <div className="text-fg-faint text-3xs truncate">{ev.subject}</div>
                      ) : null}
                    </span>
                    <span className="text-fg-faint shrink-0">{relTime}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* R35: Run Tag Editor panel + read-only chip strip */}
      {runTagState.length > 0 && !showTagEditor ? (
        <div className="flex gap-1 flex-wrap mt-1" data-testid="planning-run-tag-readonly-chips">
          {runTagState.map((tag) => (
            <span
              key={tag}
              className="text-3xs px-2 py-0.5 rounded-full border border-accent bg-accent-soft text-accent"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {showTagEditor ? (
        <div
          className="flex flex-wrap gap-1 mt-1 p-2 bg-bg-subtle border border-border rounded"
          data-testid="planning-run-tag-editor-panel"
        >
          {RUN_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleRunTag(tag)}
              className={`text-3xs px-2 py-0.5 rounded-full border ${
                runTagState.includes(tag)
                  ? "bg-accent text-white border-accent"
                  : "border-border text-fg-muted bg-bg-muted"
              }`}
            >
              {tag}
            </button>
          ))}
          <div className="w-full mt-1 text-3xs text-fg-faint">
            {runTagState.length > 0 ? `Tags: ${runTagState.join(", ")}` : "No tags"}
          </div>
        </div>
      ) : null}

      {/* R54: Recommendation Cluster Chart Panel */}
      {showRecClusterChart ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2 flex items-start gap-4"
          data-testid="planning-run-cluster-chart-panel"
        >
          <svg
            viewBox="0 0 140 140"
            width={140}
            height={140}
            aria-label="Recommendation cluster donut chart"
            role="img"
          >
            {clusterSegmentArcs.map((seg) => (
              <circle
                key={seg.label}
                cx={70}
                cy={70}
                r={50}
                fill="none"
                stroke={seg.color}
                strokeWidth={22}
                strokeDasharray={`${seg.dash} ${DONUT_CIRCUMFERENCE - seg.dash}`}
                strokeDashoffset={seg.offset}
              />
            ))}
            {/* Center label */}
            <text
              x={70}
              y={74}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="currentColor"
              className="text-fg-muted"
            >
              Clusters
            </text>
          </svg>
          <div className="flex flex-col gap-1.5 text-3xs mt-2">
            {clusterSegmentArcs.map((seg) => (
              <div key={seg.label} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-fg-muted">{seg.label}</span>
                <span className="text-fg-strong font-semibold tabular-nums">
                  {Math.round(seg.pct * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* R56: Rec Diff Panel */}
      {showRecDiffPanel ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-rec-diff-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <GitCompare className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">vs Previous Run</span>
            <span className="ml-auto text-3xs text-fg-faint">Qty comparison (mock)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-3xs">
              <thead>
                <tr className="border-b border-border/60 bg-bg-muted/40">
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Component</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Prev Qty</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Current Qty</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Delta</th>
                </tr>
              </thead>
              <tbody>
                {recDiffRows.map((row) => (
                  <tr key={row.component} className="border-b border-border/30 last:border-0">
                    <td className="px-2 py-1 text-fg-strong font-medium">{row.component}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.prevQty.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.currQty.toLocaleString()}</td>
                    <td
                      className={cn(
                        "px-2 py-1 text-right tabular-nums font-semibold",
                        row.delta < 0 ? "text-success-fg" : row.delta > 0 ? "text-danger-fg" : "text-fg-faint",
                      )}
                    >
                      {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t border-border/60 bg-bg-muted/30">
                  <td className="px-2 py-1 font-bold text-fg-strong">Total</td>
                  <td className="px-2 py-1 text-right font-bold text-fg-muted tabular-nums">{recDiffTotal.prevQty.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right font-bold text-fg-muted tabular-nums">{recDiffTotal.currQty.toLocaleString()}</td>
                  <td
                    className={cn(
                      "px-2 py-1 text-right tabular-nums font-bold",
                      recDiffTotal.delta < 0 ? "text-success-fg" : recDiffTotal.delta > 0 ? "text-danger-fg" : "text-fg-faint",
                    )}
                  >
                    {recDiffTotal.delta > 0 ? "+" : ""}{recDiffTotal.delta.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* R43 (new): Component Shortage Alert Panel */}
      {showComponentShortageAlert ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-shortage-alert-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <PackageX className="h-3 w-3 text-danger-fg" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Component Shortages</span>
            <span className="ml-auto text-3xs text-fg-faint">Projected stock &lt; required</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-3xs">
              <thead>
                <tr className="border-b border-border/60 bg-bg-muted/40">
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Component</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Required</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Available</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Deficit</th>
                </tr>
              </thead>
              <tbody>
                {componentShortageRows.map((row) => (
                  <tr key={row.component} className="border-b border-border/30 last:border-0">
                    <td className="px-2 py-1 text-fg-strong font-medium">{row.component}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.required.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.available.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold text-danger-fg">
                      -{row.deficit.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 pt-2 border-t border-border/40 text-3xs text-fg-muted text-right">
            Total deficit value: <span className="font-semibold text-fg-strong">₪{componentShortageFooterValue.toLocaleString()}</span>
          </div>
        </div>
      ) : null}

      {/* R44 (new): Approval History Panel */}
      {showApprovalHistory ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-approval-history-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <UserCheck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Approval History</span>
          </div>
          <div className="flex flex-col gap-2">
            {approvalHistoryEvents.map((ev) => {
              const actionColor =
                ev.action === "Approved"
                  ? "text-success-fg"
                  : ev.action === "Rejected"
                    ? "text-danger-fg"
                    : "text-warning-fg";
              const avatarBg =
                ev.action === "Approved"
                  ? "bg-success-softer text-success-fg"
                  : ev.action === "Rejected"
                    ? "bg-danger-softer text-danger-fg"
                    : "bg-warning-softer text-warning-fg";
              const relTime = (() => {
                const diff = Date.now() - new Date(ev.timestamp).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return `${hrs}h ago`;
                return `${Math.floor(hrs / 24)}d ago`;
              })();
              return (
                <div key={ev.id} className="flex items-center gap-2 text-3xs">
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-3xs font-bold shrink-0",
                      avatarBg,
                    )}
                    aria-label={`Initials: ${ev.initials}`}
                  >
                    {ev.initials}
                  </span>
                  <span className={cn("font-semibold shrink-0", actionColor)}>{ev.action}</span>
                  <span className="text-fg-muted font-mono shrink-0">{ev.recId}</span>
                  <span className="text-fg-faint ml-auto shrink-0">{relTime}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* R45 (new): Supplier Allocation Panel */}
      {showSupplierAllocation ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-supplier-allocation-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <Building2 className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Supplier Allocation</span>
            <span className="ml-auto text-3xs text-fg-faint">Grouped by supplier (mock)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-3xs">
              <thead>
                <tr className="border-b border-border/60 bg-bg-muted/40">
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Supplier</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Items</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Total Qty</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Est. Value &#x20AA;</th>
                </tr>
              </thead>
              <tbody>
                {supplierAllocationRows.map((row) => (
                  <tr key={row.supplier} className="border-b border-border/30 last:border-0">
                    <td className="px-2 py-1 text-fg-strong font-medium">{row.supplier}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.itemCount}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.totalQty.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-fg-muted tabular-nums">&#x20AA;{row.estimatedValue.toLocaleString()}</td>
                  </tr>
                ))}
                {/* Subtotal row */}
                <tr className="border-t border-border/60 bg-bg-muted/30">
                  <td className="px-2 py-1 font-bold text-fg-strong">Total</td>
                  <td className="px-2 py-1 text-right font-bold text-fg-muted tabular-nums">{supplierAllocationSubtotal.itemCount}</td>
                  <td className="px-2 py-1 text-right font-bold text-fg-muted tabular-nums">{supplierAllocationSubtotal.totalQty.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right font-bold text-fg-strong tabular-nums">&#x20AA;{supplierAllocationSubtotal.estimatedValue.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* R46 (new): Item Category Breakdown Panel */}
      {showItemCategoryBreakdown ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-category-breakdown-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <FolderOpen className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Recommendations by Category</span>
            <span className="ml-auto text-3xs text-fg-faint">Split by component category (mock)</span>
          </div>
          {/* Horizontal stacked bar — 280px fixed width */}
          <div
            className="flex h-4 overflow-hidden rounded"
            style={{ width: 280 }}
            aria-label="Category split bar"
            data-testid="planning-run-category-bar"
          >
            {itemCategoryBreakdownData.map((cat) => (
              <div
                key={cat.category}
                className={cn("h-full", cat.color)}
                style={{ width: `${cat.pct}%` }}
                title={`${cat.category}: ${cat.pct}%`}
              />
            ))}
          </div>
          {/* 3-column legend */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {itemCategoryBreakdownData.map((cat) => (
              <div
                key={cat.category}
                className="flex flex-col gap-0.5 text-3xs"
                data-testid={`planning-run-category-legend-${cat.category.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-sm shrink-0", cat.color)} aria-hidden="true" />
                  <span className="text-fg-strong font-medium truncate">{cat.category}</span>
                </div>
                <span className="text-fg-muted tabular-nums">{cat.count} items</span>
                <span className="text-fg-muted tabular-nums">&#x20AA;{cat.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* R47: Qty Adjustment History Panel */}
      {showQtyAdjustmentHistory ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-qty-adj-history-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <Sliders className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Quantity Adjustment History</span>
            <span className="ml-auto text-3xs text-fg-faint">Chronological (mock)</span>
          </div>
          <div className="flex flex-col gap-1">
            {qtyAdjustmentHistoryRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 text-3xs border-b border-border/50 pb-1 last:border-0 last:pb-0"
                data-testid={`planning-run-adj-row-${row.id}`}
              >
                <span className="font-medium text-fg-strong truncate flex-1 min-w-0">{row.itemName}</span>
                <span className="text-fg-muted tabular-nums shrink-0">{row.originalQty}</span>
                <span className="text-fg-faint shrink-0">→</span>
                <span className="text-fg-muted tabular-nums shrink-0">{row.adjustedQty}</span>
                <span
                  className={cn(
                    "tabular-nums font-semibold shrink-0",
                    row.adjustmentPct < 0 ? "text-success-fg" : "text-danger-fg",
                  )}
                >
                  {row.adjustmentPct > 0 ? "+" : ""}{row.adjustmentPct}%
                </span>
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-bg-muted text-fg-muted font-semibold shrink-0 text-3xs">
                  {row.userInitials}
                </span>
                <span className="text-fg-faint shrink-0 tabular-nums">
                  {(() => {
                    try {
                      return new Date(row.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    } catch {
                      return row.timestamp;
                    }
                  })()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* R48: Delivery Date Forecast Panel */}
      {showDeliveryDateForecast ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-delivery-forecast-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <Truck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Delivery Forecast</span>
            <span className="ml-auto text-3xs text-fg-faint">Projected dates (mock)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-3xs">
              <thead>
                <tr className="border-b border-border/60 bg-bg-muted/40">
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Component</th>
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Supplier</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Lead Time (days)</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Expected Delivery</th>
                  <th className="px-2 py-1 text-center font-semibold uppercase tracking-sops text-fg-faint">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveryDateForecastRows.map((row) => {
                  const pillClass =
                    row.status === "On Time"
                      ? "bg-success-softer text-success-fg"
                      : row.status === "At Risk"
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-danger-softer text-danger-fg";
                  const formattedDate = (() => {
                    try {
                      return new Date(row.expectedDelivery).toLocaleDateString(undefined, {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                      });
                    } catch {
                      return row.expectedDelivery;
                    }
                  })();
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/30 last:border-0"
                      data-testid={`planning-run-delivery-forecast-row-${row.id}`}
                    >
                      <td className="px-2 py-1 text-fg-strong font-medium">{row.component}</td>
                      <td className="px-2 py-1 text-fg-muted">{row.supplier}</td>
                      <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.leadTimeDays}</td>
                      <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{formattedDate}</td>
                      <td className="px-2 py-1 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-3xs font-semibold",
                            pillClass,
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* R49: Recommendation Cluster Panel */}
      {showRecommendationClusterPanel ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-cluster-panel"
        >
          <div className="flex items-center gap-1 mb-2">
            <Layers className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Recommendation Clusters</span>
            <span className="ml-auto text-3xs text-fg-faint">By supplier / category (mock)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-3xs">
              <thead>
                <tr className="border-b border-border/60 bg-bg-muted/40">
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Supplier</th>
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Category</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Recommendations</th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Total Value</th>
                  <th className="px-2 py-1 text-center font-semibold uppercase tracking-sops text-fg-faint">Priority</th>
                </tr>
              </thead>
              <tbody>
                {REC_CLUSTERS.map((row) => {
                  const priorityClass =
                    row.priority === "High"
                      ? "bg-danger-softer text-danger-fg"
                      : row.priority === "Medium"
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-bg-muted text-fg-muted";
                  return (
                    <tr
                      key={row.supplier}
                      className="border-b border-border/30 last:border-0"
                      data-testid={`planning-run-cluster-row-${row.supplier.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <td className="px-2 py-1 text-fg-strong font-medium">{row.supplier}</td>
                      <td className="px-2 py-1 text-fg-muted">{row.category}</td>
                      <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{row.recCount}</td>
                      <td className="px-2 py-1 text-right text-fg-muted tabular-nums">
                        &#x20AA;{row.totalValue.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-3xs font-semibold",
                            priorityClass,
                          )}
                        >
                          {row.priority}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* R50: Approval Workflow Panel */}
      {showApprovalWorkflowPanel ? (
        <div
          className="bg-bg-subtle border border-border rounded p-3 mt-2"
          data-testid="planning-run-approval-workflow-panel"
        >
          <div className="flex items-center gap-1 mb-3">
            <ClipboardCheck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
            <span className="text-xs font-semibold text-fg-strong">Approval Flow</span>
            <span className="ml-auto text-3xs text-fg-faint">{approvedStepCount} of {APPROVAL_STEPS.length} steps complete</span>
          </div>
          <ol className="flex flex-col gap-2">
            {APPROVAL_STEPS.map((s) => {
              const statusClass =
                s.status === "approved"
                  ? "bg-success-softer text-success-fg"
                  : s.status === "pending"
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg";
              const statusLabel =
                s.status === "approved" ? "Approved" : s.status === "pending" ? "Pending" : "Blocked";
              const circleClass =
                s.status === "approved"
                  ? "bg-success-fg text-white"
                  : s.status === "pending"
                    ? "bg-warning-fg text-white"
                    : "bg-danger-fg text-white";
              return (
                <li
                  key={s.step}
                  className="flex items-center gap-3 text-3xs"
                  data-testid={`planning-run-approval-step-${s.step}`}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-3xs font-bold",
                      circleClass,
                    )}
                  >
                    {s.step}
                  </span>
                  <span className="flex-1 font-medium text-fg-strong">{s.label}</span>
                  <span className="text-fg-faint">{s.assignee}</span>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 font-semibold",
                      statusClass,
                    )}
                  >
                    {statusLabel}
                  </span>
                  {s.time !== null ? (
                    <span className="text-fg-faint tabular-nums">{s.time}</span>
                  ) : (
                    <span className="text-fg-faint tabular-nums">—</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {detail.status === "superseded" ? (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-warning/30 bg-warning-softer/50 px-4 py-2.5 text-xs text-warning-fg">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>
            This run has been superseded by a newer run. Recommendations shown here are historical —
            {" "}<Link href="/planning/runs" className="font-semibold underline underline-offset-2 hover:no-underline">view the latest run</Link>.
          </span>
        </div>
      ) : null}

      {toast ? (
        <div
          className={cn(
            "mb-4 flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm",
            toast.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-danger/40 bg-danger-softer text-danger-fg",
          )}
          data-testid="planning-run-toast"
          role="status"
        >
          <span>{toast.message}</span>
          {toast.href ? (
            <Link
              href={toast.href}
              className="text-xs font-semibold underline underline-offset-2 hover:no-underline"
              data-testid="planning-run-toast-link"
            >
              {toast.hrefLabel ?? "Open"}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5">
        <SectionCard
          eyebrow="Run sources"
          title="Inputs captured at run time"
          description="The full run is reproducible from the snapshots saved when it was triggered."
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Run time
              </dt>
              <dd className="font-mono text-xs tabular-nums text-fg">
                {(() => {
                  const f = fmtRelativeAndAbsolute(detail.executed_at);
                  return (
                    <>
                      {f.absolute}
                      <span className={cn("ml-2 text-3xs font-sans", f.stale ? "text-warning-fg" : "text-fg-subtle")}>
                        · {f.relative}
                      </span>
                    </>
                  );
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Triggered by
              </dt>
              <dd className="text-xs text-fg">
                {detail.trigger_source === "manual"
                  ? "Manual"
                  : detail.trigger_source === "scheduled"
                    ? "Scheduled"
                    : detail.trigger_source}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Demand forecast
              </dt>
              {/* Forecast snapshot is captured at run-time. The id either
                  points at a published forecast or is null (run used open
                  orders only). The freshness clock is the run's executed_at
                  — the snapshot is, by definition, as old as the run. */}
              <dd className="text-xs text-fg">
                {detail.demand_snapshot_forecast_version_id ? (
                  <>
                    <Link
                      href={`/planning/forecast/${encodeURIComponent(detail.demand_snapshot_forecast_version_id)}`}
                      className="text-accent underline underline-offset-2 hover:text-accent/80"
                    >
                      Open forecast
                    </Link>
                    <span className="ml-2 text-3xs text-fg-subtle">
                      · captured {fmtRelativeAndAbsolute(detail.executed_at).relative}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-muted">No forecast attached — run used open orders only</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Open orders snapshot
              </dt>
              {/* Orders snapshot id is the LionWheel mirror snapshot row
                  attached to this run. When present the run included open
                  orders; when null the run was forecast-only. The freshness
                  clock is again the run's executed_at — the orders snapshot
                  was taken inside the same transaction. */}
              <dd className="text-xs text-fg">
                {detail.demand_snapshot_orders_snapshot_run_id ? (() => {
                  const f = fmtRelativeAndAbsolute(detail.executed_at);
                  return (
                    <>
                      <span className="text-fg">Captured at run time</span>
                      <span className={cn("ml-2 text-3xs font-sans", f.stale ? "text-warning-fg" : "text-fg-subtle")}>
                        · {f.absolute} · {f.relative}
                      </span>
                    </>
                  );
                })() : (
                  <span className="text-fg-muted">No open-orders snapshot attached</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Stock anchor refreshed
              </dt>
              <dd className="font-mono text-xs text-fg">
                {(() => {
                  const f = fmtRelativeAndAbsolute(detail.stock_snapshot_anchor_refreshed_at);
                  return detail.stock_snapshot_anchor_refreshed_at ? (
                    <>
                      {f.absolute}
                      <span className={cn("ml-2 text-3xs font-sans", f.stale ? "text-warning-fg" : "text-fg-subtle")}>
                        · {f.relative}
                      </span>
                    </>
                  ) : (
                    <span className="font-sans text-fg-muted">—</span>
                  );
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Stock parity drift at run time
              </dt>
              <dd className="font-mono text-xs tabular-nums text-fg">
                {detail.rebuild_verifier_drift_at_run ?? "—"}
              </dd>
            </div>
          </dl>

          {session.role === "admin" ? (
            <details className="mt-4" data-testid="planning-run-policy-snapshot">
              <summary className="cursor-pointer text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Planning policy at run time ({detail.policy_snapshot_preview.key_count} parameters)
              </summary>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-xs font-mono text-fg-muted sm:grid-cols-3 lg:grid-cols-4">
                {detail.policy_snapshot_preview.keys.map((k) => (
                  <li key={k} className="truncate">
                    {k}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </SectionCard>

        {detail.exceptions.length > 0 ? (
          <SectionCard
            eyebrow={`${detail.summary.exceptions_count} exception${detail.summary.exceptions_count === 1 ? "" : "s"}`}
            title="Exceptions"
            description="Signals that affected feasibility or completeness."
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {detail.summary.exceptions_by_severity.fail_hard > 0 ? (
                <Badge tone="danger" variant="solid">
                  {detail.summary.exceptions_by_severity.fail_hard} fail-hard
                </Badge>
              ) : null}
              {detail.summary.exceptions_by_severity.warning > 0 ? (
                <Badge tone="warning" dotted>
                  {detail.summary.exceptions_by_severity.warning} warning
                </Badge>
              ) : null}
              {detail.summary.exceptions_by_severity.info > 0 ? (
                <Badge tone="info" dotted>
                  {detail.summary.exceptions_by_severity.info} info
                </Badge>
              ) : null}
              {/* R29: Exception Density Metric chip */}
              {exceptionDensity !== null ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                    exceptionDensity.density > 20
                      ? "bg-danger-softer text-danger-fg"
                      : exceptionDensity.density > 10
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-success-softer text-success-fg",
                  )}
                  title={`${exceptionDensity.density} exceptions per 100 items (based on ${exceptionDensity.itemCount} items)`}
                  data-testid="planning-run-exception-density"
                >
                  <Sigma className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
                  {exceptionDensity.density} exc/100 items
                </span>
              ) : null}
            </div>
            <ul className="divide-y divide-border/60" data-testid="planning-run-exceptions-list">
              {detail.exceptions.slice(0, 50).map((e) => (
                <li
                  key={e.exception_id}
                  className="py-2 text-xs"
                  data-testid="planning-run-exception-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={e.severity} />
                    <span className="text-3xs text-fg-muted">
                      {fmtExceptionCategory(e.category)}
                    </span>
                    {e.item_id ? (
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(e.item_id)}`}
                        className="font-mono text-3xs text-accent hover:underline"
                        title="Open item master"
                      >
                        {e.item_id}
                      </Link>
                    ) : null}
                    {e.component_id ? (
                      <Link
                        href={`/admin/masters/items/${encodeURIComponent(e.component_id)}`}
                        className="font-mono text-3xs text-accent hover:underline"
                        title="Open component item master"
                      >
                        {e.component_id}
                      </Link>
                    ) : null}
                    <ExceptionActionLink
                      category={e.category}
                      itemId={e.item_id}
                      componentId={e.component_id}
                    />
                  </div>
                  {(() => {
                    const d = fmtExceptionDetail(e.detail);
                    return d ? (
                      <div className="mt-0.5 text-3xs text-fg-muted">
                        {d}
                      </div>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard
          eyebrow="Recommendations"
          title={`${detail.summary.purchase_recs_count + detail.summary.production_recs_count} total · ${detail.summary.purchase_recs_count} purchase · ${detail.summary.production_recs_count} production`}
          description={
            canAct
              ? "Review and approve. Approved purchase recs convert to POs (one supplier = one PO ideally). Approved production recs open the Production Actual form prefilled with item + qty + BOM. Nothing orders or produces autonomously."
              : "Read-only view — contact a planner or admin to approve or dismiss recommendations."
          }
          actions={
            canAct && activeTab === "production" && pendingProductionCount >= 2 ? (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={!canBulkApprove}
                onClick={() => setShowBulkApproveConfirm(true)}
                data-testid="planning-run-bulk-approve-production"
                title={`Approve all ${pendingProductionCount} pending production recommendations in this run`}
              >
                {bulkApproveInProgress ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                    Approving…
                  </>
                ) : (
                  <>
                    <CheckCheck className="h-3 w-3" strokeWidth={2.5} />
                    Approve all production recommendations ({pendingProductionCount})
                  </>
                )}
              </button>
            ) : null
          }
          contentClassName="p-0"
        >
          <div
            className="flex items-center gap-2 border-b border-border/60 px-5 py-3"
            data-testid="planning-run-recs-tabs"
          >
            <button
              type="button"
              data-testid="planning-run-recs-tab-purchase"
              aria-pressed={activeTab === "purchase"}
              onClick={() => setActiveTab("purchase")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                activeTab === "purchase"
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              Purchase ({detail.summary.purchase_recs_count})
            </button>
            <button
              type="button"
              data-testid="planning-run-recs-tab-production"
              aria-pressed={activeTab === "production"}
              onClick={() => setActiveTab("production")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                activeTab === "production"
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              Production ({detail.summary.production_recs_count})
            </button>
            {/* R28: Production Recommendations Panel toggle */}
            <button
              type="button"
              onClick={() => setShowProductionRecs((v) => !v)}
              aria-pressed={showProductionRecs}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showProductionRecs
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-production-recs-toggle"
            >
              <Factory className="h-3 w-3" strokeWidth={2} />
              Production recs
              {visibleProductionRecs.length > 0 ? (
                <span className="bg-accent text-white text-3xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {visibleProductionRecs.length}
                </span>
              ) : null}
            </button>
            {/* R30: Purchase Category Heatmap toggle */}
            {activeTab === "purchase" ? (
              <button
                type="button"
                onClick={() => setShowPurchaseHeatmap((v) => !v)}
                aria-pressed={showPurchaseHeatmap}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showPurchaseHeatmap
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-purchase-heatmap-toggle"
              >
                <Flame className={cn("h-3 w-3", showPurchaseHeatmap ? "text-accent" : "")} strokeWidth={2} />
                Category heat
              </button>
            ) : null}
            {/* R34: Line Item Heatmap toggle */}
            {activeTab === "purchase" ? (
              <button
                type="button"
                onClick={() => setShowLineHeatmap((v) => !v)}
                aria-pressed={showLineHeatmap}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showLineHeatmap
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-line-heatmap-toggle"
              >
                <Flame className={cn("h-3 w-3", showLineHeatmap ? "text-accent" : "")} strokeWidth={2} />
                Heatmap
              </button>
            ) : null}
            {/* R36: Purchase Delivery Timeline toggle */}
            {activeTab === "purchase" ? (
              <button
                type="button"
                onClick={() => setShowPurchaseTimeline((v) => !v)}
                aria-pressed={showPurchaseTimeline}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showPurchaseTimeline
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-purchase-timeline-toggle"
              >
                <CalendarCheck className={cn("h-3 w-3", showPurchaseTimeline ? "text-accent" : "")} strokeWidth={2} />
                Timeline
              </button>
            ) : null}
            {/* R41: Purchase Rec Value Summary chip */}
            {activeTab === "purchase" && recValueSummary !== null ? (
              <button
                type="button"
                onClick={() => setShowValueBreakdown((v) => !v)}
                className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-150"
                data-testid="planning-run-value-summary-chip"
                title="Purchase recommendation value breakdown"
              >
                <CircleDollarSign className="h-3 w-3 shrink-0" strokeWidth={2} />
                &#x20AA;{recValueSummary.totalValue.toLocaleString()} total
              </button>
            ) : null}
            {/* R42: Global Qty Adjustment Slider toggle */}
            {activeTab === "purchase" ? (
              <button
                type="button"
                onClick={() => setShowQtyAdjustPanel((v) => !v)}
                aria-pressed={showQtyAdjustPanel}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showQtyAdjustPanel
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-qty-adjust-toggle"
              >
                <Sliders className={cn("h-3 w-3", showQtyAdjustPanel ? "text-accent" : "")} strokeWidth={2} />
                Qty adjust
              </button>
            ) : null}
            {/* R43: Weighted Avg Lead Time chip */}
            {activeTab === "purchase" && totalLeadTimeChip !== null ? (
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  totalLeadTimeChip.avgLeadDays > 14
                    ? "bg-warning-softer text-warning-fg"
                    : totalLeadTimeChip.avgLeadDays > 7
                      ? "bg-info-softer text-info-fg"
                      : "bg-bg-muted text-fg-muted",
                )}
                data-testid="planning-run-lead-time-chip"
                title="Weighted average lead time across pending purchase recommendations"
              >
                <Truck className="h-3 w-3 shrink-0" strokeWidth={2} />
                Avg lead: {totalLeadTimeChip.avgLeadDays}d ({totalLeadTimeChip.pendingCount} pending)
              </span>
            ) : null}
            {/* R44: Supplier Breakdown toggle */}
            {activeTab === "purchase" ? (
              <button
                type="button"
                onClick={() => setShowSupplierBreakdown((v) => !v)}
                aria-pressed={showSupplierBreakdown}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showSupplierBreakdown
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-supplier-breakdown-toggle"
              >
                <Building2 className={cn("h-3 w-3", showSupplierBreakdown ? "text-accent" : "")} strokeWidth={2} />
                By supplier
              </button>
            ) : null}
            {/* R46: Recommendation Delivery Timeline toggle */}
            {activeTab === "purchase" ? (
              <button
                type="button"
                onClick={() => setShowRecTimeline((v) => !v)}
                aria-pressed={showRecTimeline}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showRecTimeline
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-rec-timeline-toggle"
              >
                <CalendarCheck className={cn("h-3 w-3", showRecTimeline ? "text-accent" : "")} strokeWidth={2} />
                Delivery timeline
              </button>
            ) : null}
            {/* R47: Value at Risk chip */}
            {activeTab === "purchase" && valueAtRiskChip !== null ? (
              <span
                className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-danger-softer text-danger-fg"
                data-testid="planning-run-value-at-risk-chip"
                title={`Pending recs older than 3 days. Oldest: ${valueAtRiskChip.oldestDays}d`}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
                &#x20AA;{valueAtRiskChip.atRiskValue.toLocaleString()} at risk ({valueAtRiskChip.atRiskCount} pending)
              </span>
            ) : null}
            {/* R50: Production Recs Summary toggle */}
            {activeTab === "production" ? (
              <button
                type="button"
                onClick={() => setShowProductionRecsSummary((v) => !v)}
                aria-pressed={showProductionRecsSummary}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  showProductionRecsSummary
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid="planning-run-production-recs-summary-toggle"
              >
                <ListChecks className={cn("h-3 w-3", showProductionRecsSummary ? "text-accent" : "")} strokeWidth={2} />
                Production recs
                {productionRecsSummaryData !== null ? (
                  <span className="ml-0.5 rounded-full bg-bg-muted px-1 py-0.5 text-fg-muted leading-none">
                    {productionRecsSummaryData.recs.length}
                  </span>
                ) : null}
              </button>
            ) : null}
            {/* R52: Run Audit Log toggle */}
            <button
              type="button"
              onClick={() => setShowRunAuditLog((v) => !v)}
              aria-pressed={showRunAuditLog}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRunAuditLog
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-audit-log-toggle"
            >
              <ScrollText className={cn("h-3 w-3", showRunAuditLog ? "text-accent" : "")} strokeWidth={2} />
              Audit log
              {runAuditData !== null ? (
                <span className="ml-0.5 rounded-full bg-bg-muted px-1 py-0.5 text-fg-muted leading-none">
                  {runAuditData.length}
                </span>
              ) : null}
            </button>
            {/* R48: Planner Notes toggle */}
            <button
              type="button"
              onClick={() => setShowRunNotes((v) => !v)}
              aria-pressed={showRunNotes}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                showRunNotes
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
              )}
              data-testid="planning-run-notes-toggle"
            >
              <MessageSquare className={cn("h-3 w-3", showRunNotes ? "text-accent" : "")} strokeWidth={2} />
              Notes
              {runNote.trim().length > 0 ? (
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
              ) : null}
            </button>
          </div>

          {/* R41: Purchase Rec Value Breakdown */}
          {activeTab === "purchase" && recValueSummary !== null && showValueBreakdown ? (
            <div
              className="flex gap-3 mt-1 px-5 pb-1"
              data-testid="planning-run-value-breakdown"
            >
              <span className="bg-success-softer text-success-fg rounded px-2 py-1 text-3xs">
                Approved: &#x20AA;{recValueSummary.approvedValue.toLocaleString()}
              </span>
              <span className="bg-warning-softer text-warning-fg rounded px-2 py-1 text-3xs">
                Pending: &#x20AA;{recValueSummary.pendingValue.toLocaleString()}
              </span>
            </div>
          ) : null}

          {/* R42: Global Qty Adjustment Slider panel */}
          {showQtyAdjustPanel && activeTab === "purchase" ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-qty-adjust-panel"
            >
              <div className="flex items-center gap-1 mb-1">
                <Sliders className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Global Qty Adjustment (What-If)</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={qtyAdjustPct}
                onChange={(e) => setQtyAdjustPct(Number(e.target.value))}
                className="w-full accent-accent"
                aria-label="Global quantity adjustment percentage"
              />
              <div className="flex justify-between text-3xs text-fg-faint mt-0.5">
                <span>50%</span>
                <span>200%</span>
              </div>
              <div className="text-center text-sm font-bold text-fg-strong mt-1">
                {qtyAdjustPct}%
              </div>
              <div className="flex gap-3 mt-2 text-3xs flex-wrap">
                <span className="text-fg-muted">
                  Adjusting {visiblePurchaseRecs.length} recs by {qtyAdjustPct}%
                </span>
                {qtyAdjustPct !== 100 && adjustedRecs !== null ? (
                  <span className="text-fg-muted">
                    Est. adjusted value: &#x20AA;
                    {visiblePurchaseRecs
                      .reduce((sum, rec) => {
                        const adjQty = adjustedRecs.get(rec.recommendation_id) ?? 0;
                        const unitCost = Number((rec as any).unit_cost ?? 0);
                        return sum + adjQty * unitCost;
                      }, 0)
                      .toLocaleString()}
                  </span>
                ) : null}
                {qtyAdjustPct !== 100 ? (
                  <button
                    type="button"
                    onClick={() => setQtyAdjustPct(100)}
                    className="text-3xs text-accent underline hover:no-underline"
                    data-testid="planning-run-qty-adjust-reset"
                  >
                    Reset to 100%
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* R44: Supplier Breakdown Chart */}
          {showSupplierBreakdown && activeTab === "purchase" && supplierBreakdownData !== null ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-supplier-breakdown-panel"
            >
              <div className="flex items-center gap-1 mb-2">
                <Building2 className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Purchase Recs by Supplier</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {supplierBreakdownData.suppliers.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span
                      className="text-3xs text-fg-muted truncate"
                      style={{ maxWidth: "6rem" }}
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <div className="flex-1 h-2 bg-bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/60 rounded-full"
                        style={{ width: `${Math.round(s.pct * 100)}%` }}
                      />
                    </div>
                    <span className="text-3xs text-fg-muted shrink-0">
                      {supplierBreakdownData.totalValue > 0
                        ? `₪${s.value.toLocaleString()}`
                        : `${s.qty} units`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* R46: Recommendation Delivery Timeline panel */}
          {showRecTimeline && activeTab === "purchase" ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-rec-timeline-panel"
            >
              <div className="flex items-center gap-1 mb-2">
                <CalendarCheck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Expected Delivery Timeline</span>
                {recTimelineData !== null && recTimelineData.daysSpan > 0 ? (
                  <span className="ml-auto text-3xs text-fg-faint">{recTimelineData.daysSpan}d span</span>
                ) : null}
              </div>
              {recTimelineData === null ? (
                <div className="text-fg-faint text-3xs">No delivery dates found on purchase recommendations</div>
              ) : (
                <div className="flex flex-col gap-0">
                  {recTimelineData.dateGroups.map((group, idx) => (
                    <div key={group.date}>
                      {idx > 0 ? <div className="border-t border-border/40 my-1" /> : null}
                      <div className="flex items-start gap-2 py-0.5">
                        <span className="text-3xs font-semibold text-fg-muted shrink-0 w-14">
                          {new Date(group.date + "T12:00:00").toLocaleDateString(undefined, {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        <span
                          className="text-3xs rounded-full px-1.5 py-0.5 bg-bg-muted text-fg-faint shrink-0"
                          title={`${group.recs.length} recommendation${group.recs.length !== 1 ? "s" : ""}`}
                        >
                          {group.recs.length}
                        </span>
                        <span className="text-3xs text-fg-muted flex-1 truncate">
                          {Array.from(new Set(group.recs.map((r) => r.supplier))).join(", ")}
                        </span>
                        {group.totalValue > 0 ? (
                          <span className="text-3xs text-fg-muted shrink-0">
                            &#x20AA;{group.totalValue.toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* R48: Planner Notes Panel */}
          {showRunNotes ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-notes-panel"
            >
              <div className="flex items-center gap-1 mb-1">
                <MessageSquare className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Planner Notes</span>
              </div>
              <textarea
                className="w-full text-sm bg-transparent border border-border rounded p-2 min-h-16 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Add notes for this run..."
                value={runNote}
                onChange={(e) => setRunNote(e.target.value)}
                data-testid="planning-run-notes-textarea"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-3xs text-fg-faint">{runNote.length} characters</span>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="inline-flex items-center gap-1 rounded-sm border border-border/70 bg-bg-raised px-2 py-1 text-3xs font-semibold uppercase tracking-sops text-fg-muted transition-colors duration-150 hover:border-border-strong hover:text-fg"
                  data-testid="planning-run-notes-save"
                >
                  Save
                </button>
              </div>
            </div>
          ) : null}

          {/* R50: Production Recs Summary Panel */}
          {showProductionRecsSummary && activeTab === "production" ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-production-recs-summary-panel"
            >
              <div className="flex items-center gap-1 mb-2">
                <ListChecks className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Production Recommendations</span>
              </div>
              {productionRecsSummaryData === null ? (
                <div className="text-3xs text-fg-muted py-2 text-center">
                  No production recommendations for this run
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {(productionRecsSummaryData.byStatus["approved"] ?? 0) > 0 ? (
                      <span className="text-3xs rounded px-1.5 py-0.5 bg-success-softer text-success-fg">
                        {productionRecsSummaryData.byStatus["approved"]} approved
                      </span>
                    ) : null}
                    {(productionRecsSummaryData.byStatus["rejected"] ?? 0) > 0 ? (
                      <span className="text-3xs rounded px-1.5 py-0.5 bg-danger-softer text-danger-fg">
                        {productionRecsSummaryData.byStatus["rejected"]} rejected
                      </span>
                    ) : null}
                    {(productionRecsSummaryData.byStatus["pending"] ?? 0) > 0 ? (
                      <span className="text-3xs rounded px-1.5 py-0.5 bg-warning-softer text-warning-fg">
                        {productionRecsSummaryData.byStatus["pending"]} pending
                      </span>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-3xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-bg-muted/40">
                          <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Item</th>
                          <th className="px-2 py-1 text-right font-semibold uppercase tracking-sops text-fg-faint">Qty</th>
                          <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Unit</th>
                          <th className="px-2 py-1 text-left font-semibold uppercase tracking-sops text-fg-faint">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productionRecsSummaryData.recs.map((rec, idx) => {
                          const normalizedStatus =
                            rec.status === "dismissed" ? "rejected"
                            : rec.status === "approved" ? "approved"
                            : "pending";
                          return (
                            <tr
                              key={idx}
                              className="border-b border-border/30 last:border-0"
                            >
                              <td className="px-2 py-1 text-fg-strong font-medium">{rec.itemName || "—"}</td>
                              <td className="px-2 py-1 text-right text-fg-muted tabular-nums">{rec.qty.toLocaleString()}</td>
                              <td className="px-2 py-1 text-fg-muted">{rec.unit || "—"}</td>
                              <td className="px-2 py-1">
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5",
                                    normalizedStatus === "approved"
                                      ? "bg-success-softer text-success-fg"
                                      : normalizedStatus === "rejected"
                                        ? "bg-danger-softer text-danger-fg"
                                        : "bg-warning-softer text-warning-fg",
                                  )}
                                >
                                  {normalizedStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* R52: Run Audit Log Panel */}
          {showRunAuditLog ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-audit-log-panel"
            >
              <div className="flex items-center gap-1 mb-2">
                <ScrollText className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Run Audit Log</span>
              </div>
              {runAuditData === null || runAuditData.length === 0 ? (
                <div className="text-3xs text-fg-muted py-2 text-center">
                  No audit events recorded for this run
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {[...runAuditData].reverse().map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 py-1 border-b border-border/30 last:border-0"
                    >
                      <span className="text-3xs text-fg-faint shrink-0 tabular-nums mt-px">
                        {entry.timestamp
                          ? new Date(entry.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                      {entry.actor ? (
                        <span className="bg-bg-muted text-fg-muted text-3xs rounded px-1.5 py-0.5 shrink-0 font-medium">
                          {entry.actor}
                        </span>
                      ) : null}
                      <span className="text-3xs text-fg-strong font-medium flex-1 min-w-0">
                        {entry.action || "—"}
                        {entry.detail ? (
                          <span className="ml-1 text-fg-muted font-normal">{entry.detail}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* R39: Production Rec Progress Bar */}
          {activeTab === "production" && productionRecProgress !== null ? (
            <div
              className="px-5 py-1.5 border-b border-border/40"
              data-testid="planning-run-production-rec-progress"
            >
              <div className="h-1 bg-bg-muted w-full flex overflow-hidden rounded-full">
                <div
                  className="h-full bg-success-fg"
                  style={{ width: `${(productionRecProgress.approved / productionRecProgress.total) * 100}%` }}
                />
                <div
                  className="h-full bg-danger-fg"
                  style={{ width: `${(productionRecProgress.rejected / productionRecProgress.total) * 100}%` }}
                />
              </div>
              <div className="text-3xs text-fg-faint mt-0.5 text-right">
                {productionRecProgress.approved} approved · {productionRecProgress.rejected} rejected · {productionRecProgress.pending} pending
              </div>
            </div>
          ) : null}

          {/* R33: Overall Purchase Rec Progress Bar */}
          {activeTab === "purchase" && purchaseRecProgress.total > 0 ? (
            <div
              className="px-5 py-1.5 border-b border-border/40"
              data-testid="planning-run-purchase-rec-progress"
            >
              <div className="h-1 w-full bg-bg-muted rounded-full overflow-hidden mt-1">
                <div className="flex h-full">
                  <div
                    className="h-full bg-success-fg"
                    style={{ width: `${(purchaseRecProgress.approved / purchaseRecProgress.total) * 100}%` }}
                  />
                  <div
                    className="h-full bg-danger-fg"
                    style={{ width: `${(purchaseRecProgress.rejected / purchaseRecProgress.total) * 100}%` }}
                  />
                </div>
              </div>
              <div className="mt-0.5 text-3xs text-fg-faint">
                {purchaseRecProgress.approved} approved / {purchaseRecProgress.rejected} rejected / {purchaseRecProgress.total - purchaseRecProgress.approved - purchaseRecProgress.rejected} pending
              </div>
            </div>
          ) : null}

          {/* R28: Production recs panel */}
          {showProductionRecs ? (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 space-y-1 text-3xs" data-testid="planning-run-production-recs-panel">
              <div className="text-fg-faint font-medium mb-1">
                Production Recommendations ({visibleProductionRecs.length})
              </div>
              {visibleProductionRecs.length === 0 ? (
                <div className="text-fg-faint text-center py-4">No production recommendations</div>
              ) : (
                visibleProductionRecs.map((rec, idx) => (
                  <div key={idx} className="flex items-center gap-2 py-1">
                    <Factory className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={2} />
                    <span className="text-fg-strong flex-1 truncate">{rec.item_name || "—"}</span>
                    <span className="text-fg-muted tabular-nums">{rec.recommended_qty}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-3xs font-medium",
                        rec.priority === "critical" || rec.priority === "high"
                          ? "bg-danger-softer text-danger-fg"
                          : rec.priority === "medium"
                            ? "bg-warning-softer text-warning-fg"
                            : "bg-bg-muted text-fg-faint",
                      )}
                    >
                      {rec.priority || "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* R30: Purchase Category Heatmap chips */}
          {showPurchaseHeatmap && activeTab === "purchase" && purchaseCategoryHeatmap.length > 0 ? (
            <div
              className="flex flex-wrap gap-1 py-1 px-5 border-b border-border/40"
              data-testid="planning-run-purchase-heatmap"
            >
              {purchaseCategoryHeatmap.map((h) => (
                <span
                  key={h.category}
                  className={cn(
                    "text-3xs rounded px-2 py-0.5 font-medium",
                    h.count >= 5
                      ? "bg-danger-softer text-danger-fg"
                      : h.count >= 3
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-info-softer text-info-fg",
                  )}
                  title={`${h.category}: ${h.count} rec${h.count === 1 ? "" : "s"}, total qty ${h.totalQty}`}
                >
                  {h.category}: {h.count}
                </span>
              ))}
            </div>
          ) : null}

          {/* R34: Line Item Heatmap panel — approval status breakdown per category */}
          {showLineHeatmap && activeTab === "purchase" ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-line-heatmap-panel"
            >
              <div className="flex items-center gap-1 mb-1">
                <Flame className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Purchase Line Heatmap by Category</span>
              </div>
              {lineHeatmapData.length === 0 ? (
                <div className="text-fg-faint text-3xs">No purchase recommendations to analyze</div>
              ) : (
                lineHeatmapData.map((row) => (
                  <div
                    key={row.category}
                    className="flex items-center gap-2 py-1 text-3xs border-b border-border last:border-0"
                  >
                    <span className="text-fg-muted w-24 truncate">{row.category}</span>
                    <div className="flex-1 h-2 bg-bg-muted rounded-full flex overflow-hidden">
                      <div
                        className="h-full bg-success-fg"
                        style={{ width: `${(row.approved / Math.max(row.total, 1)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-danger-fg"
                        style={{ width: `${(row.rejected / Math.max(row.total, 1)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-fg-faint/30"
                        style={{ width: `${(row.pending / Math.max(row.total, 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-fg-faint w-6 text-right">{row.total}</span>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* R36: Purchase Delivery Timeline panel */}
          {showPurchaseTimeline && activeTab === "purchase" ? (
            <div
              className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5"
              data-testid="planning-run-purchase-timeline-panel"
            >
              <div className="flex items-center gap-1 mb-1">
                <CalendarCheck className="h-3 w-3 text-fg-muted" strokeWidth={2} />
                <span className="text-xs font-semibold text-fg-strong">Expected Deliveries</span>
              </div>
              {deliveryTimelineData.length === 0 ? (
                <div className="text-fg-faint text-3xs">
                  No delivery dates set on purchase recommendations
                </div>
              ) : (
                deliveryTimelineData.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                  >
                    <span className="text-fg-muted flex-1 truncate">{item.name}</span>
                    <span className="text-fg-faint">
                      {new Date(item.deliveryAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "2-digit",
                      })}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        item.daysUntil > 7
                          ? "text-success-fg"
                          : item.daysUntil >= 1
                            ? "text-warning-fg"
                            : "text-danger-fg",
                      )}
                    >
                      {item.daysUntil}d
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* Loop 8 — production-tab readiness summary. Mirrors the
              feasibility chip on individual rec detail (Loop 3) but at the
              run-level so the manager sees the breakdown before scrolling.
              Sort already groups ready rows on top, blocked at the bottom —
              this just labels the split. */}
          {activeTab === "production" && rawRecs.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-bg-subtle/40 px-5 py-2 text-xs"
              data-testid="planning-run-production-summary"
            >
              <span className="text-fg-muted">Readiness:</span>
              <Badge tone={productionReadyCount > 0 ? "success" : "neutral"} variant="soft" dotted>
                {productionReadyCount} ready
              </Badge>
              {productionBlockedCount > 0 ? (
                <Badge tone="warning" variant="soft" dotted>
                  {productionBlockedCount} blocked
                </Badge>
              ) : null}
              <span className="text-3xs text-fg-subtle ml-1">
                — sorted by urgency (ready at top, blocked at bottom)
              </span>
            </div>
          ) : null}

          {activeRecsQuery.isLoading ? (
            <div className="p-5">
              <div className="space-y-2" aria-busy="true" aria-live="polite">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                  >
                    <div className="h-5 w-32 shrink-0 rounded bg-bg-subtle" />
                    <div className="h-5 flex-1 rounded bg-bg-subtle" />
                    <div className="h-5 w-20 shrink-0 rounded bg-bg-subtle" />
                  </div>
                ))}
              </div>
            </div>
          ) : activeRecsQuery.isError ? (
            <div className="p-5">
              <div
                className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
                data-testid="planning-run-recs-error"
              >
                <div className="font-semibold">Could not load recommendations</div>
                <div className="mt-1 text-xs">Check your connection. The recommendation list will reload once the API is reachable.</div>
                <button
                  type="button"
                  onClick={() => void activeRecsQuery.refetch()}
                  className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : activeRecs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={`No ${activeTab} recommendations in this run.`}
                description="This run produced no lines of this type."
              />
            </div>
          ) : (
            <>
            <div className="hidden sm:block overflow-x-auto">
              <table
                className="w-full border-collapse text-sm"
                data-testid={`planning-run-recs-table-${activeTab}`}
              >
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      {activeTab === "purchase" ? "Component" : "Item"}
                    </th>
                    <th
                      className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                      title="Gross demand quantity this recommendation covers"
                    >
                      Required
                    </th>
                    <th
                      className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                      title="Suggested order quantity after applying safety stock, MOQ, and rounding policy"
                    >
                      Recommended
                    </th>
                    <th
                      className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                      title="Stock balance captured at planning run time — not current on-hand"
                    >
                      Stock at run time
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      {activeTab === "purchase" ? "Supplier" : "BOM version"}
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Target period
                    </th>
                    <th
                      className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                      title="Latest date to place the order for on-time delivery"
                    >
                      Order by
                    </th>
                    <th
                      className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                      title="When stock will be depleted if no order is placed"
                    >
                      Shortage by
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Feasibility
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Status
                    </th>
                    {canAct ? (
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Actions
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {activeRecs.map((r) => {
                    // pending_approval is operationally equivalent to draft for the planner; both need Approve/Dismiss. DB-level enum reconciliation deferred to W1.
                    const canActThisRow =
                      canAct &&
                      (r.recommendation_status === "draft" ||
                        r.recommendation_status === "pending_approval");
                    const canConvertThisRow =
                      canAct &&
                      activeTab === "purchase" &&
                      r.recommendation_status === "approved" &&
                      !r.converted_to_po_id;
                    const convertBlockedNoSupplier =
                      canConvertThisRow &&
                      r.feasibility_status === "blocked_missing_supplier_mapping";
                    const rowKey = r.recommendation_id;
                    const isApproving =
                      approveMutation.isPending &&
                      approveMutation.variables === rowKey;
                    const isDismissing =
                      dismissMutation.isPending &&
                      dismissMutation.variables === rowKey;
                    const isConverting =
                      convertMutation.isPending &&
                      convertMutation.variables === rowKey;
                    return (
                      <tr
                        key={rowKey}
                        className="border-b border-border/40 last:border-b-0 transition-colors duration-150 hover:bg-bg-subtle/40"
                        data-testid="planning-run-rec-row"
                        data-rec-id={rowKey}
                        data-rec-status={r.recommendation_status}
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/planning/runs/${encodeURIComponent(runId)}/recommendations/${encodeURIComponent(rowKey)}`}
                            className="group block"
                            data-testid="planning-run-rec-detail-link"
                          >
                            <div className="font-medium text-fg-strong group-hover:text-accent group-hover:underline underline-offset-2">
                              {activeTab === "purchase"
                                ? r.component_name ?? r.component_id ?? "—"
                                : r.item_name ?? r.item_id ?? "—"}
                            </div>
                            <div className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                              {activeTab === "purchase"
                                ? r.component_id ?? ""
                                : r.item_id ?? ""}
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted">
                          {r.required_qty}
                          {r.uom ? <span className="ml-1 text-3xs text-fg-subtle">{r.uom}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-strong">
                          {r.recommended_qty}
                          {r.uom ? <span className="ml-1 text-3xs text-fg-subtle">{r.uom}</span> : null}
                          {adjustedRecs !== null && showQtyAdjustPanel && activeTab === "purchase" ? (
                            <span className="text-accent text-3xs ml-1" title={`Adjusted qty at ${qtyAdjustPct}%`}>
                              → {adjustedRecs.get(r.recommendation_id) ?? 0}
                            </span>
                          ) : null}
                          {(() => {
                            const req = parseFloat(r.required_qty);
                            const rec = parseFloat(r.recommended_qty);
                            if (!isNaN(req) && !isNaN(rec) && rec > req + 0.0001) {
                              const extra = parseFloat((rec - req).toFixed(4));
                              return (
                                <div
                                  className="font-sans text-3xs font-normal text-fg-subtle"
                                  title={`Required: ${r.required_qty}${r.uom ? ` ${r.uom}` : ""}. Extra ${extra}${r.uom ? ` ${r.uom}` : ""} from MOQ or safety stock policy.`}
                                >
                                  +{extra} policy
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted"
                          title="Stock balance as of planning run — may differ from current on-hand"
                        >
                          {r.current_stock_bal ?? "—"}
                          {r.current_stock_bal && r.uom ? <span className="ml-1 text-3xs text-fg-subtle">{r.uom}</span> : null}
                          {r.current_stock_bal !== null ? (() => {
                            const age = fmtAgeFromRun(detail.executed_at);
                            return (
                              <div className={cn("text-3xs font-sans", age.stale ? "text-warning-fg" : "text-fg-subtle")}>
                                {age.label}
                              </div>
                            );
                          })() : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-fg-muted">
                          {activeTab === "purchase"
                            ? r.supplier_name ?? r.supplier_id ?? "—"
                            : r.bom_version_id ? "BOM linked" : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-fg-muted">
                          {fmtPeriodBucket(r.target_period_bucket_key)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-xs tabular-nums font-medium ${
                            r.order_by_date && new Date(r.order_by_date) < new Date()
                              ? "text-danger-fg"
                              : "text-fg-muted"
                          }`}
                          title={r.order_by_date ? `${r.order_by_date}${new Date(r.order_by_date) < new Date() ? " — past due" : ""}` : undefined}
                        >
                          {fmtDateOnly(r.order_by_date)}
                          {r.order_by_date && new Date(r.order_by_date) < new Date() ? (
                            <div className="font-sans text-3xs font-normal text-danger-fg/70">Past due</div>
                          ) : null}
                        </td>
                        <td className={`px-3 py-2.5 text-xs tabular-nums font-medium ${r.shortage_date ? "text-warning-fg" : "text-fg-muted"}`} title={r.shortage_date ?? undefined}>
                          {fmtDateOnly(r.shortage_date)}
                        </td>
                        <td className="px-3 py-2.5">
                          <FeasibilityBadge status={r.feasibility_status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <RecStatusBadge status={r.recommendation_status} />
                        </td>
                        {canAct ? (
                          <td className="px-3 py-2.5 text-right">
                            {canActThisRow ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm gap-1.5"
                                  data-testid="planning-run-rec-approve"
                                  disabled={isApproving || isDismissing}
                                  onClick={() =>
                                    approveMutation.mutate(rowKey)
                                  }
                                >
                                  <Check
                                    className="h-3 w-3"
                                    strokeWidth={2.5}
                                  />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm gap-1.5 text-danger"
                                  data-testid="planning-run-rec-dismiss"
                                  disabled={isApproving || isDismissing}
                                  onClick={() =>
                                    dismissMutation.mutate(rowKey)
                                  }
                                >
                                  <X className="h-3 w-3" strokeWidth={2.5} />
                                  Dismiss
                                </button>
                              </div>
                            ) : canConvertThisRow ? (
                              <div className="inline-flex flex-col items-end gap-0.5">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm gap-1.5 text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                  data-testid="planning-run-rec-convert-to-po"
                                  disabled={isConverting || convertBlockedNoSupplier}
                                  title={convertBlockedNoSupplier ? "No supplier mapped — add a mapping in Admin → Supplier Items before converting." : undefined}
                                  onClick={() => {
                                    if (!convertBlockedNoSupplier) convertMutation.mutate(rowKey);
                                  }}
                                >
                                  <FileOutput
                                    className="h-3 w-3"
                                    strokeWidth={2.5}
                                  />
                                  {isConverting ? "Converting…" : "Convert to PO"}
                                </button>
                                {convertBlockedNoSupplier ? (
                                  <span className="text-3xs text-warning-fg">
                                    No supplier mapped
                                  </span>
                                ) : null}
                              </div>
                            ) : canAct &&
                              activeTab === "production" &&
                              r.recommendation_status === "approved" ? (
                              // Approved production rec → deep-link to
                              // Production Actual form prefilled with item +
                              // recommended qty + back-chain to this run/rec
                              // (loops 1-2 wired the receiving end). Manager
                              // approves → clicks Open form → enters output
                              // qty (already prefilled) → submits → ledger
                              // writes consumption + output rows.
                              <Link
                                href={
                                  `/ops/stock/production-actual` +
                                  `?item_id=${encodeURIComponent(r.item_id ?? "")}` +
                                  `&suggested_qty=${encodeURIComponent(r.recommended_qty ?? "")}` +
                                  `&from_rec=${encodeURIComponent(rowKey)}` +
                                  `&from_run=${encodeURIComponent(runId)}`
                                }
                                className="btn btn-ghost btn-sm gap-1.5 text-accent"
                                data-testid="planning-run-rec-open-production"
                                title="Open Production Actual form prefilled with this item + qty"
                              >
                                <Factory
                                  className="h-3 w-3"
                                  strokeWidth={2.5}
                                />
                                Open production form
                              </Link>
                            ) : r.converted_to_po_id ? (
                              <Link
                                href={`/purchase-orders/${encodeURIComponent(r.converted_to_po_id)}`}
                                className="font-mono text-3xs text-accent hover:underline"
                                data-testid="planning-run-rec-converted-ref"
                                title={r.converted_to_po_id}
                              >
                                View PO
                              </Link>
                            ) : (
                              <span className="text-3xs text-fg-subtle">
                                —
                              </span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile card list — surfaces actions inline. Renders below sm breakpoint
                where the desktop table requires horizontal scroll. */}
            <div className="sm:hidden divide-y divide-border/40">
              {activeRecs.map((r) => {
                const canActThisRow =
                  canAct &&
                  (r.recommendation_status === "draft" ||
                   r.recommendation_status === "pending_approval");
                const canConvertThisRow =
                  canAct &&
                  activeTab === "purchase" &&
                  r.recommendation_status === "approved" &&
                  !r.converted_to_po_id;
                const rowKey = r.recommendation_id;
                const isApproving = approveMutation.isPending && approveMutation.variables === rowKey;
                const isDismissing = dismissMutation.isPending && dismissMutation.variables === rowKey;
                const isConverting = convertMutation.isPending && convertMutation.variables === rowKey;
                return (
                  <div key={rowKey} className="px-4 py-3" data-testid="planning-run-rec-row-mobile">
                    <Link
                      href={`/planning/runs/${encodeURIComponent(runId)}/recommendations/${encodeURIComponent(rowKey)}`}
                      className="block"
                    >
                      <div className="font-medium text-fg-strong">
                        {activeTab === "purchase"
                          ? r.component_name ?? r.component_id ?? "—"
                          : r.item_name ?? r.item_id ?? "—"}
                      </div>
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-3xs">
                      <FeasibilityBadge status={r.feasibility_status} />
                      <RecStatusBadge status={r.recommendation_status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-muted">
                      <div><span className="text-fg-subtle">Required:</span> <span className="font-mono tabular-nums">{r.required_qty}{r.uom ? ` ${r.uom}` : ""}</span></div>
                      <div><span className="text-fg-subtle">Recommended:</span> <span className="font-mono tabular-nums text-fg-strong">{r.recommended_qty}{r.uom ? ` ${r.uom}` : ""}</span></div>
                      <div><span className="text-fg-subtle">Target period:</span> <span className="text-xs">{fmtPeriodBucket(r.target_period_bucket_key)}</span></div>
                      <div><span className="text-fg-subtle">Order by:</span> <span className={r.order_by_date && new Date(r.order_by_date) < new Date() ? "text-danger-fg font-medium" : ""}>{fmtDateOnly(r.order_by_date)}</span></div>
                    </div>
                    {canAct ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {canActThisRow ? (
                          <>
                            <button type="button" className="btn btn-sm gap-1 flex-1" disabled={isApproving || isDismissing} onClick={() => approveMutation.mutate(rowKey)}>
                              <Check className="h-3 w-3" strokeWidth={2.5} />
                              {isApproving ? "Approving…" : "Approve"}
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm gap-1 text-danger" disabled={isApproving || isDismissing} onClick={() => dismissMutation.mutate(rowKey)}>
                              <X className="h-3 w-3" strokeWidth={2.5} />
                              {isDismissing ? "Dismissing…" : "Dismiss"}
                            </button>
                          </>
                        ) : canConvertThisRow ? (
                          <button type="button" className="btn btn-sm gap-1 flex-1" disabled={isConverting} onClick={() => convertMutation.mutate(rowKey)}>
                            <FileOutput className="h-3 w-3" strokeWidth={2.5} />
                            {isConverting ? "Converting…" : "Convert to PO"}
                          </button>
                        ) : canAct && activeTab === "production" && r.recommendation_status === "approved" ? (
                          <Link
                            href={
                              `/ops/stock/production-actual` +
                              `?item_id=${encodeURIComponent(r.item_id ?? "")}` +
                              `&suggested_qty=${encodeURIComponent(r.recommended_qty ?? "")}` +
                              `&from_rec=${encodeURIComponent(rowKey)}` +
                              `&from_run=${encodeURIComponent(runId)}`
                            }
                            className="btn btn-sm gap-1 flex-1"
                          >
                            <Factory className="h-3 w-3" strokeWidth={2.5} />
                            Open production form
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            </>
          )}
        </SectionCard>
      </div>

      {showBulkApproveConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-approve-title"
          data-testid="planning-run-bulk-approve-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulkApproveInProgress) {
              setShowBulkApproveConfirm(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
            <h2
              id="bulk-approve-title"
              className="text-base font-semibold text-fg-strong"
            >
              Approve {pendingProductionCount} production recommendation
              {pendingProductionCount === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm text-fg-muted leading-relaxed">
              Each will become ready to convert to a daily plan. Approval does
              not start production — operators still open the Production Actual
              form to report what was made.
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              Approval runs one rec at a time. If any fail (for example, a rec
              has already been dismissed in another tab), you will see a
              summary of which succeeded and which did not.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowBulkApproveConfirm(false)}
                disabled={bulkApproveInProgress}
                data-testid="planning-run-bulk-approve-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={bulkApproveInProgress}
                onClick={() => {
                  setShowBulkApproveConfirm(false);
                  void runBulkApproveProductionRecs();
                }}
                data-testid="planning-run-bulk-approve-modal-confirm"
              >
                <CheckCheck className="h-3 w-3" strokeWidth={2.5} />
                Approve all {pendingProductionCount}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

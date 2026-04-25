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
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, X, FileOutput, AlertTriangle } from "lucide-react";
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
  if (category === "missing_bom" && itemId) {
    return (
      <Link href={`/admin/masters/items/${encodeURIComponent(itemId)}`} className="ml-2 text-3xs text-accent hover:underline">
        Fix BOM →
      </Link>
    );
  }
  if ((category === "missing_supplier_mapping" || category === "ambiguous_supplier_mapping" || category === "impossible_lead_time") && componentId) {
    return (
      <Link href={`/admin/masters/items/${encodeURIComponent(componentId)}`} className="ml-2 text-3xs text-accent hover:underline">
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
  const queryClient = useQueryClient();
  const runId = String(params?.run_id ?? "");
  const canAct = session.role === "planner" || session.role === "admin";

  const [activeTab, setActiveTab] =
    useState<RecommendationType>("purchase");
  const [toast, setToast] = useState<
    {
      kind: "success" | "error";
      message: string;
      href?: string;
      hrefLabel?: string;
    } | null
  >(null);

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
      const poLabel = result.po_number ?? result.po_id.slice(0, 8);
      setToast({
        kind: "success",
        message: result.idempotent_replay
          ? `Already converted to PO ${poLabel}.`
          : `Converted to PO ${poLabel}.`,
        href: `/purchase-orders/${encodeURIComponent(result.po_id)}`,
        hrefLabel: `Open PO ${poLabel}`,
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
  const activeRecs = activeRecsQuery.data?.rows ?? [];

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
        title={`Run ${detail.run_id.slice(0, 8)}`}
        description={`Horizon ${fmtDate(detail.planning_horizon_start_at)} · ${detail.planning_horizon_weeks} weeks · triggered ${detail.trigger_source}`}
        meta={
          <>
            <RunStatusBadge status={detail.status} />
            <Badge tone="neutral" dotted>
              {detail.site_id}
            </Badge>
          </>
        }
      />

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
          eyebrow="Snapshot refs"
          title="Inputs captured at run time"
          description="This run is reproducible byte-for-byte from these snapshot references."
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Executed at
              </dt>
              <dd className="font-mono text-xs tabular-nums text-fg">
                {fmtDate(detail.executed_at)}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Triggered by
              </dt>
              <dd className="font-mono text-xs text-fg">
                {detail.actor_user_id.slice(0, 8)}…
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Demand — forecast version
              </dt>
              <dd className="font-mono text-xs text-fg">
                {detail.demand_snapshot_forecast_version_id?.slice(0, 8) ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Demand — orders snapshot
              </dt>
              <dd className="font-mono text-xs text-fg">
                {detail.demand_snapshot_orders_snapshot_run_id?.slice(0, 8) ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Stock anchor refreshed
              </dt>
              <dd className="font-mono text-xs text-fg">
                {fmtDate(detail.stock_snapshot_anchor_refreshed_at)}
              </dd>
            </div>
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Stock parity drift at run
              </dt>
              <dd className="font-mono text-xs tabular-nums text-fg">
                {detail.rebuild_verifier_drift_at_run ?? "—"}
              </dd>
            </div>
          </dl>

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
          title={`${detail.summary.purchase_recs_count + detail.summary.production_recs_count} total`}
          description={
            canAct
              ? "Review each line and approve or dismiss. Approved purchase lines stage to PO creation; nothing orders autonomously."
              : "Read-only view — contact a planner or admin to approve or dismiss recommendations."
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
          </div>

          {activeRecsQuery.isLoading ? (
            <div className="p-5 text-xs text-fg-muted">Loading recommendations…</div>
          ) : activeRecsQuery.isError ? (
            <div
              className="p-5 text-xs text-danger-fg"
              data-testid="planning-run-recs-error"
            >
              Could not load recommendations. Check your connection and try refreshing.
            </div>
          ) : activeRecs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={`No ${activeTab} recommendations in this run.`}
                description="This run produced no lines of this type."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                    const canActThisRow =
                      canAct && r.recommendation_status === "draft";
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
                          <div className="font-medium text-fg-strong">
                            {activeTab === "purchase"
                              ? r.component_name ?? r.component_id ?? "—"
                              : r.item_name ?? r.item_id ?? "—"}
                          </div>
                          <div className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                            {activeTab === "purchase"
                              ? r.component_id ?? ""
                              : r.item_id ?? ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted">
                          {r.required_qty}
                          {r.uom ? <span className="ml-1 text-3xs text-fg-subtle">{r.uom}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-strong">
                          {r.recommended_qty}
                          {r.uom ? <span className="ml-1 text-3xs text-fg-subtle">{r.uom}</span> : null}
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
                        </td>
                        <td className="px-3 py-2.5 text-xs text-fg-muted">
                          {activeTab === "purchase"
                            ? r.supplier_name ?? r.supplier_id ?? "—"
                            : r.bom_version_id?.slice(0, 8) ?? "—"}
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
                            ) : r.converted_to_po_id ? (
                              <Link
                                href={`/purchase-orders/${encodeURIComponent(r.converted_to_po_id)}`}
                                className="font-mono text-3xs text-accent hover:underline"
                                data-testid="planning-run-rec-converted-ref"
                                title={r.converted_to_po_id}
                              >
                                PO {r.converted_to_po_id.slice(0, 8)}…
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
          )}
        </SectionCard>
      </div>
    </>
  );
}

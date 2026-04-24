// ---------------------------------------------------------------------------
// Unified Inbox feature — client-side fetchers (Tranche B §D, Path A).
//
// Path A (adopted 2026-04-21 by governor re-dispatch): pending approval rows
// for Waste/Adjustment and Physical Count are derived from the exceptions
// stream rather than from dedicated list endpoints. Upstream exposes no list
// endpoint for those forms (verified against api/src/waste-adjustments/route.ts
// and api/src/physical-counts/route.ts — only POST submit + POST per-id
// approve/reject + (PC) GET /open snapshot). The exception handlers of both
// forms emit pending-state rows with category in {positive_adjustment,
// loss_above_threshold, count_large_variance} and related_entity_id = the
// submission_id, which preserves the deep-link contract already in place for
// /inbox/approvals/{waste,physical-count}/[submission_id].
//
// No backend authorship. No invented query params. Where /api/exceptions
// accepts a single-value `category` filter (Zod shape at
// api/src/exceptions/schemas.ts lines 41-44), we prefer one-call-without-
// category plus client-side partitioning to minimize HTTP round-trips (one
// GET vs four GETs).
// ---------------------------------------------------------------------------

import { get } from "@/lib/api/client";
import type { Result } from "@/lib/api/client";
import {
  ALL_APPROVAL_EXCEPTION_CATEGORIES,
  PHYSICAL_COUNT_APPROVAL_CATEGORIES,
  WASTE_APPROVAL_CATEGORIES,
  type InboxFilter,
  type InboxRow,
  type InboxRowType,
  type InboxSeverity,
} from "./types";

// ---------------------------------------------------------------------------
// Upstream row shapes (verbatim mirrors). Kept local to this file — the
// broader portal contract mirror under src/lib/contracts/ is scoped to form
// contracts and is not the right home for these read-model projections.
// ---------------------------------------------------------------------------
interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: InboxSeverity;
  source: string;
  title: string;
  detail: string | null;
  status: "open" | "acknowledged" | "resolved" | "auto_resolved";
  created_at: string;
  recommended_action: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

interface ExceptionsListResponse {
  rows: ExceptionRow[];
  count: number;
}

interface PlanningRunListRow {
  run_id: string;
  executed_at: string;
  status: "draft" | "running" | "completed" | "failed" | "superseded";
  // other fields omitted — not used by inbox
}

interface PlanningRunListResponse {
  rows: PlanningRunListRow[];
  count: number;
  total: number;
}

interface PlanningRecommendationRow {
  recommendation_id: string;
  run_id: string;
  recommendation_type: "purchase" | "production";
  item_id: string | null;
  component_id: string | null;
  recommendation_status: string;
  created_at: string;
  item_name: string | null;
  component_name: string | null;
  supplier_name: string | null;
  // other fields carried on `raw`, not read
}

interface PlanningRecommendationListResponse {
  rows: PlanningRecommendationRow[];
  count: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Summary projection — pick the most human-readable field on an exception
// without inventing one. Upstream handlers always set title; we fall back to
// detail → category as a belt-and-suspenders chain.
// ---------------------------------------------------------------------------
function summarizeException(row: ExceptionRow): string {
  if (row.title && row.title.trim().length > 0) return row.title;
  if (row.detail && row.detail.trim().length > 0) return row.detail;
  return row.category;
}

function rawIsObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null;
}

function readEntityIdFromExceptionRaw(
  raw: Record<string, unknown>,
  key: "item_id" | "component_id",
): string | null {
  const v = raw[key];
  if (typeof v === "string") return v;
  return null;
}

// ---------------------------------------------------------------------------
// Internal: one GET of /api/exceptions for the working set.
//
// The upstream query shape (api/src/exceptions/schemas.ts) accepts:
//   - status: comma list, defaults to 'open,acknowledged' when omitted
//   - category: single string, optional
//   - severity: enum, optional
//
// We ask for the default status window (open + acknowledged) and partition
// rows client-side into approval vs non-approval streams.
// ---------------------------------------------------------------------------
async function fetchAllWorkingExceptions(
  signal?: AbortSignal,
): Promise<Result<ExceptionsListResponse>> {
  return get<ExceptionsListResponse>("/api/exceptions?status=open,acknowledged", {
    signal,
  });
}

// ---------------------------------------------------------------------------
// Shared mapping helpers for exception → InboxRow.
// ---------------------------------------------------------------------------
function toApprovalInboxRow(
  row: ExceptionRow,
  type: Extract<InboxRowType, "approval:waste" | "approval:physical_count">,
): InboxRow {
  // Deep-link relies on related_entity_id being the submission_id. Upstream
  // handlers always set this when related_entity_type === 'form_submission'.
  // Fall back to the exception_id itself if missing (degenerate row — will
  // 404 on click, which is the correct visible failure mode rather than a
  // silent misroute).
  const submissionId = row.related_entity_id ?? row.exception_id;
  const pathBase =
    type === "approval:waste"
      ? "/inbox/approvals/waste/"
      : "/inbox/approvals/physical-count/";

  const itemId = rawIsObject(row)
    ? readEntityIdFromExceptionRaw(row as unknown as Record<string, unknown>, "item_id")
    : null;
  const componentId = rawIsObject(row)
    ? readEntityIdFromExceptionRaw(
        row as unknown as Record<string, unknown>,
        "component_id",
      )
    : null;

  return {
    id: row.exception_id,
    type,
    category: row.category,
    severity: row.severity,
    created_at: row.created_at,
    summary: summarizeException(row),
    item_id: itemId,
    component_id: componentId,
    deep_link: pathBase + encodeURIComponent(submissionId),
    // Approvals surface via deep-link review. No inline accept/reject in
    // Tranche B — the detail pages own the approve/reject workflow.
    inline_actions: [],
    raw: row,
  };
}

// Maps exception categories to their actionable fix surface.
// Returning "/inbox" means "stay in inbox — inline actions are the fix path."
function resolveExceptionDeepLink(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("lionwheel_unknown_sku") || c.includes("sku_unresolved") || c.includes("unknown_sku"))
    return "/admin/sku-aliases";
  if (c.startsWith("lionwheel_") || c.startsWith("shopify_") || c.startsWith("gi_") || c.includes("stale"))
    return "/admin/integrations";
  if (c.includes("po_line_over_receipt"))
    return "/purchase-orders";
  if (c.includes("missing_supplier") || c.includes("missing_bom"))
    return "/admin/sku-map";
  return "/inbox";
}

function toExceptionInboxRow(row: ExceptionRow): InboxRow {
  const itemId = rawIsObject(row)
    ? readEntityIdFromExceptionRaw(row as unknown as Record<string, unknown>, "item_id")
    : null;
  const componentId = rawIsObject(row)
    ? readEntityIdFromExceptionRaw(
        row as unknown as Record<string, unknown>,
        "component_id",
      )
    : null;

  return {
    id: row.exception_id,
    type: `exception:${row.category}` as InboxRowType,
    category: row.category,
    severity: row.severity,
    created_at: row.created_at,
    summary: summarizeException(row),
    item_id: itemId,
    component_id: componentId,
    deep_link: resolveExceptionDeepLink(row.category),
    inline_actions:
      row.status === "open"
        ? ["acknowledge", "resolve"]
        : row.status === "acknowledged"
          ? ["resolve"]
          : [],
    raw: row,
  };
}

// ---------------------------------------------------------------------------
// Public fetchers — one per source stream. TanStack Query consumes these via
// the inbox page `useQueries`.
// ---------------------------------------------------------------------------

/**
 * Pending Waste/Adjustment approvals.
 *
 * Maps exceptions with category in WASTE_APPROVAL_CATEGORIES to
 * `approval:waste` inbox rows. Deep-links to
 * /inbox/approvals/waste/{submission_id}.
 */
export async function fetchPendingWasteApprovals(
  signal?: AbortSignal,
): Promise<InboxRow[]> {
  const res = await fetchAllWorkingExceptions(signal);
  if (!res.ok) {
    throw buildFetchError("pending waste approvals", res);
  }
  const rows = res.data.rows.filter((r) =>
    (WASTE_APPROVAL_CATEGORIES as readonly string[]).includes(r.category),
  );
  return rows.map((r) => toApprovalInboxRow(r, "approval:waste"));
}

/**
 * Pending Physical Count approvals.
 *
 * Maps exceptions with category in PHYSICAL_COUNT_APPROVAL_CATEGORIES to
 * `approval:physical_count` inbox rows. Deep-links to
 * /inbox/approvals/physical-count/{submission_id}.
 */
export async function fetchPendingPhysicalCountApprovals(
  signal?: AbortSignal,
): Promise<InboxRow[]> {
  const res = await fetchAllWorkingExceptions(signal);
  if (!res.ok) {
    throw buildFetchError("pending physical count approvals", res);
  }
  const rows = res.data.rows.filter((r) =>
    (PHYSICAL_COUNT_APPROVAL_CATEGORIES as readonly string[]).includes(
      r.category,
    ),
  );
  return rows.map((r) => toApprovalInboxRow(r, "approval:physical_count"));
}

/**
 * Pending planning-run recommendation approvals.
 *
 * Two-step fetch:
 *   1. GET /api/planning/runs?status=completed&limit=1 for the latest run.
 *   2. If a run exists, GET /api/planning/runs/:run_id/recommendations
 *      ?status=pending_approval for its pending recs.
 *
 * 404 or empty at any step → [] (treated as empty, not an error).
 */
export async function fetchPendingPlanningRecApprovals(
  signal?: AbortSignal,
): Promise<InboxRow[]> {
  const runsRes = await get<PlanningRunListResponse>(
    "/api/planning/runs?status=completed&limit=1",
    { signal },
  );

  if (!runsRes.ok) {
    if (runsRes.status === 404) return [];
    throw buildFetchError("planning runs list", runsRes);
  }

  const run = runsRes.data.rows[0];
  if (!run) return [];

  const recsRes = await get<PlanningRecommendationListResponse>(
    `/api/planning/runs/${encodeURIComponent(run.run_id)}/recommendations?status=pending_approval`,
    { signal },
  );

  if (!recsRes.ok) {
    if (recsRes.status === 404) return [];
    throw buildFetchError("planning run recommendations", recsRes);
  }

  return recsRes.data.rows.map((rec) => toPlanningRecInboxRow(rec, run.run_id));
}

function toPlanningRecInboxRow(
  rec: PlanningRecommendationRow,
  runId: string,
): InboxRow {
  const type: InboxRowType =
    rec.recommendation_type === "production"
      ? "approval:production_recommendation"
      : "approval:purchase_recommendation";

  // Prefer the richer name field for summary; fall back to id.
  const entityLabel =
    rec.item_name ??
    rec.component_name ??
    rec.item_id ??
    rec.component_id ??
    "unknown";

  const prefix =
    rec.recommendation_type === "production"
      ? "Production recommendation"
      : "Purchase recommendation";

  const supplierTail = rec.supplier_name ? ` — ${rec.supplier_name}` : "";
  const summary = `${prefix}: ${entityLabel}${supplierTail}`;

  return {
    id: rec.recommendation_id,
    type,
    category:
      rec.recommendation_type === "production"
        ? "production_recommendation_pending"
        : "purchase_recommendation_pending",
    // Planning recs do not carry a severity axis. Inbox treats them as
    // 'warning' (needs human action) for visual grouping. This is a UI
    // projection, not an invented backend field.
    severity: "warning",
    created_at: rec.created_at,
    summary,
    item_id: rec.item_id,
    component_id: rec.component_id,
    deep_link: `/planning/runs/${encodeURIComponent(runId)}`,
    inline_actions: [],
    raw: rec,
  };
}

/**
 * Non-approval exceptions.
 *
 * Maps exceptions whose category is NOT in the approval-category set to
 * `exception:<category>` inbox rows. This is the bucket that drives the
 * inline acknowledge/resolve actions in Tranche B.
 */
export async function fetchExceptions(
  signal?: AbortSignal,
): Promise<InboxRow[]> {
  const res = await fetchAllWorkingExceptions(signal);
  if (!res.ok) {
    throw buildFetchError("exceptions", res);
  }
  const rows = res.data.rows.filter(
    (r) => !ALL_APPROVAL_EXCEPTION_CATEGORIES.includes(r.category),
  );
  return rows.map(toExceptionInboxRow);
}

// ---------------------------------------------------------------------------
// Merging + sorting.
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<InboxSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function compareForFilter(
  a: InboxRow,
  b: InboxRow,
  sort: InboxFilter["sort"],
): number {
  if (sort === "severity_then_age") {
    const d = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (d !== 0) return d;
  }
  // age_only, or tiebreak: newest first (larger ISO string wins under
  // lexicographic sort for RFC3339 / ISO-8601 UTC timestamps).
  if (a.created_at > b.created_at) return -1;
  if (a.created_at < b.created_at) return 1;
  return 0;
}

/**
 * Flatten, dedupe by id, and sort per the supplied filter.
 */
export function mergeInboxRows(
  sources: InboxRow[][],
  filter: InboxFilter,
): InboxRow[] {
  const byId = new Map<string, InboxRow>();
  for (const src of sources) {
    for (const row of src) {
      // First write wins — source order matters. Inbox page passes
      // approvals-first, exceptions-last so an approval row shadows any
      // later exception with the same exception_id (shouldn't happen in
      // practice, but belt-and-suspenders).
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  const flat = Array.from(byId.values());
  flat.sort((a, b) => compareForFilter(a, b, filter.sort));
  return flat;
}

// ---------------------------------------------------------------------------
// View filter — applied AFTER merge. Approval rows are included in both
// "approvals" and the domain bucket (e.g. "stock" for approval:waste /
// approval:physical_count; "planning" for approval:*_recommendation).
// ---------------------------------------------------------------------------

const INTEGRATION_CATEGORY_HINTS = [
  "lionwheel",
  "shopify",
  "green_invoice",
  "integration_",
  "freshness",
  "stale_",
];

const DATA_QUALITY_CATEGORY_HINTS = [
  "unmapped",
  "ambiguous",
  "missing_mapping",
  "missing_supplier",
  "dupe_",
  "integrity_",
];

function matchesHint(category: string, hints: string[]): boolean {
  const lower = category.toLowerCase();
  return hints.some((h) => lower.includes(h));
}

function rowMatchesView(
  row: InboxRow,
  view: InboxFilter["view"],
  currentUserId: string | null,
): boolean {
  if (view === "all") return true;
  if (view === "approvals") return row.type.startsWith("approval:");
  if (view === "exceptions") return row.type.startsWith("exception:");
  if (view === "stock") {
    return (
      row.type === "approval:waste" ||
      row.type === "approval:physical_count" ||
      (row.type.startsWith("exception:") && row.category.startsWith("stock_"))
    );
  }
  if (view === "planning") {
    return (
      row.type === "approval:purchase_recommendation" ||
      row.type === "approval:production_recommendation" ||
      (row.type.startsWith("exception:") &&
        (row.category.startsWith("planning_") ||
          row.category.startsWith("recommendation_")))
    );
  }
  if (view === "integrations") {
    return (
      row.type.startsWith("exception:") &&
      matchesHint(row.category, INTEGRATION_CATEGORY_HINTS)
    );
  }
  if (view === "data_quality") {
    return (
      row.type.startsWith("exception:") &&
      matchesHint(row.category, DATA_QUALITY_CATEGORY_HINTS)
    );
  }
  if (view === "mine") {
    // "Mine" = rows the current user can act on. With Tranche B's
    // actor-identity shape (session.user_id from useSession) and the raw
    // exception/rec rows, the strict "assigned to me" filter has no
    // backend-authoritative field to key on. We widen to: any row whose
    // raw payload carries a *_by_user_id field matching the current user.
    // If no user id is known, show nothing under this view (truthful
    // empty state).
    if (!currentUserId) return false;
    if (!rawIsObject(row.raw)) return false;
    for (const k of Object.keys(row.raw)) {
      if (!k.endsWith("_by_user_id") && !k.endsWith("_user_id")) continue;
      const v = (row.raw as Record<string, unknown>)[k];
      if (typeof v === "string" && v === currentUserId) return true;
    }
    return false;
  }
  return true;
}

export function applyInboxView(
  rows: InboxRow[],
  view: InboxFilter["view"],
  currentUserId: string | null,
): InboxRow[] {
  if (view === "all") return rows;
  return rows.filter((r) => rowMatchesView(r, view, currentUserId));
}

// ---------------------------------------------------------------------------
// Error mapping.
// ---------------------------------------------------------------------------
function buildFetchError(
  label: string,
  res: Exclude<Result<unknown>, { ok: true }>,
): Error {
  const reason = res.reason_code ? ` ${res.reason_code}` : "";
  const detail = res.detail ? ` — ${res.detail}` : "";
  return new Error(
    `${label} fetch failed (HTTP ${res.status}${reason})${detail}`,
  );
}

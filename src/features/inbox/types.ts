// ---------------------------------------------------------------------------
// Unified Inbox feature — types.
//
// Introduced by Tranche B of portal-full-production-refactor (plan §D).
//
// The inbox merges typed rows from multiple upstream sources into a single
// triage surface. Row sources in Tranche B:
//   1. Pending Waste/Adjustment approvals (derived from /api/exceptions
//      categories 'positive_adjustment' and 'loss_above_threshold' per Path A
//      adopted by the re-dispatch — upstream exposes no list endpoint).
//   2. Pending Physical Count approvals (derived from /api/exceptions
//      category 'count_large_variance' — same Path A).
//   3. Pending planning-run recommendation approvals (from
//      /api/planning/runs + /api/planning/runs/:run_id/recommendations).
//   4. Non-approval exceptions (other categories from /api/exceptions).
//
// Severity enum is verbatim from upstream api/src/exceptions/schemas.ts:
//   'info' | 'warning' | 'critical'
// No 'fail_hard' mapping — that token belongs to the planning-runs exception
// aggregate (a different enum space) and is not surfaced in the inbox row.
// ---------------------------------------------------------------------------

export type InboxRowType =
  | "approval:waste"
  | "approval:physical_count"
  | "approval:purchase_recommendation"
  | "approval:production_recommendation"
  // Non-approval exceptions keep the upstream category as the discriminator
  // suffix. Free-form by migration invariant (0010_exceptions.sql) — do not
  // enumerate the tail.
  | `exception:${string}`;

export type InboxSeverity = "info" | "warning" | "critical";

export interface InboxRow {
  id: string;
  type: InboxRowType;
  category: string;
  severity: InboxSeverity;
  created_at: string;
  summary: string;
  item_id: string | null;
  component_id: string | null;
  deep_link: string;
  inline_actions: Array<"acknowledge" | "resolve">;
  // Preserve the original upstream row for future features (deep-inspection
  // drawer, per-category renderers, etc). Shape intentionally untyped — do
  // not rely on it in Tranche B code paths.
  raw: unknown;
}

export type InboxView =
  | "all"
  | "approvals"
  | "exceptions"
  | "stock"
  | "planning"
  | "integrations"
  | "data_quality"
  | "mine";

export type InboxSort = "severity_then_age" | "age_only";

export interface InboxFilter {
  view: InboxView;
  sort: InboxSort;
}

export const INBOX_VIEWS: readonly InboxView[] = [
  "all",
  "approvals",
  "exceptions",
  "stock",
  "planning",
  "integrations",
  "data_quality",
  "mine",
] as const;

export const INBOX_SORTS: readonly InboxSort[] = [
  "severity_then_age",
  "age_only",
] as const;

// ---------------------------------------------------------------------------
// Categories flagged as approval-equivalent. Rows with these categories are
// emitted as approval:* rows (NOT exception rows), since they represent a
// submission waiting on planner/admin action rather than an operational
// anomaly surfaced for triage-only.
//
// Source (waste): api/src/waste-adjustments/handler.ts exceptionAttrsFor()
// Source (physical-count): api/src/physical-counts/handler.ts pending insert
// ---------------------------------------------------------------------------
export const WASTE_APPROVAL_CATEGORIES = [
  "positive_adjustment",
  "loss_above_threshold",
] as const;

export const PHYSICAL_COUNT_APPROVAL_CATEGORIES = [
  "count_large_variance",
] as const;

export const ALL_APPROVAL_EXCEPTION_CATEGORIES: readonly string[] = [
  ...WASTE_APPROVAL_CATEGORIES,
  ...PHYSICAL_COUNT_APPROVAL_CATEGORIES,
];

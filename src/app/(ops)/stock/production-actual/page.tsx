"use client";

// Deep-link integration with planning recommendations and Daily Production Plan:
// /stock/production-actual?item_id=<id>&suggested_qty=<n>&from_rec=<rec_id>&from_run=<run_id>
//   — item_id pre-selects the producible item dropdown
//   — suggested_qty pre-fills the output_qty field (operator can override)
//   — from_rec / from_run surface a "this run is authorized by..." breadcrumb
//
// /stock/production-actual?from_plan_id=<plan_id>
//   — pre-selects item from production_plan.item_id
//   — pre-fills output_qty from production_plan.planned_qty
//   — submits with body.from_plan_id; on success, the plan flips to status=done
//   — handles 4 plan conflict codes (PLAN_NOT_FOUND, PLAN_ITEM_MISMATCH,
//     PLAN_ALREADY_COMPLETED, PLAN_CANCELLED) with re-submit-without-link
//     fallbacks (Tom-locked conflict UX per W1 checkpoint).
// All params are optional; the form works identically without them.

// ---------------------------------------------------------------------------
// Production Actual — operator form (live API backed).
//
// CLAUDE.md §"Production reporting v1" locked semantics:
//   output_qty + scrap_qty + notes only; system computes standard consumption
//   from pinned BOM version; NO manual per-component actual.
//
// Step 1 — Pick item: dropdown of items filtered to supply_method ∈
// {MANUFACTURED, REPACK} (client-side filter against
// GET /api/items?status=ACTIVE&limit=1000). Selecting item and clicking
// "Open" calls GET /api/production-actuals/open?item_id=<id> which returns
// pinned bom_version_id + bom_lines snapshot.
//
// Step 2 — Enter qty + submit: form shows pinned BOM version id +
// expandable expected-consumption preview (multiplies bom_lines × (output +
// scrap) / bom_final_output_qty client-side; server re-explodes
// authoritatively). Submit POSTs to /api/production-actuals with
// bom_version_id_pinned carried from Step 1.
//
// 409 conflict handling:
//   STALE_BOM_VERSION   → "BOM changed while form was open" + restart
//   WRONG_SUPPLY_METHOD → "Item is not manufactured / repacked"
//   UOM_MISMATCH        → reason map entry + detail
//   PLAN_NOT_FOUND      → "Linked plan no longer exists. Submit without linking?"
//   PLAN_ITEM_MISMATCH  → "Plan is for a different product. Submit anyway?"
//   PLAN_ALREADY_COMPLETED → "Plan was already completed."
//   PLAN_CANCELLED      → "Plan was cancelled. Submit without linking?"
//
// Role gate: operator + planner + admin submit; viewer sees read-only banner
// (middleware allows access, backend returns 403 on submit attempts).
// Tom-approved 2026-06-15: planners report production in this factory.
// ---------------------------------------------------------------------------

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import {
  computeAfterBalance,
  exceedsVarianceBand,
  fmtShortfallMessage,
  varianceReasonLabel,
  VARIANCE_REASON_CODES,
  VARIANCE_REASON_LABELS,
  type VarianceReasonCode,
} from "./_lib/report-helpers";

// ---------------------------------------------------------------------------
// Production Actual contract — inlined.
//
// Mirror of api/src/production-actuals/schemas.ts. Inlined per repo
// convention; the portal does not import directly from the backend tree.
// Keep byte-aligned with upstream schema; drift is a bug.
// ---------------------------------------------------------------------------

interface BomLineSnapshot {
  line_id: string;
  component_id: string;
  component_name: string;
  final_component_qty: string; // preserves precision
  component_uom: string | null;
  // Per-row source tag added by the two-head BOM explosion (Tranche 2 of the
  // 2026-05-02 two-head BOM repair). 'pack' = line came from the pack (or
  // single-head MANUFACTURED/REPACK) BOM; 'base' = line came from the linked
  // base liquid BOM. When the item has no linked base, every row is 'pack'.
  source: "pack" | "base";
  // C10 (Tranche 050): current on-hand for this component from
  // private_core.current_balances at form-open time (text, qty_8dp; '0'
  // when the component has no balance rows). Display-only — the submit-time
  // shortage gate on the server remains authoritative.
  available_qty: string;
}

interface ProductionActualOpenResponse {
  item_id: string;
  item_name: string;
  supply_method: "MANUFACTURED" | "REPACK";
  output_uom_default: string;
  bom_version_id_pinned: string;
  bom_head_id: string;
  bom_version_label: string;
  bom_final_output_qty: string;
  bom_final_output_uom: string;
  // Two-head BOM fields (Tranche 2). All non-null only when the item has a
  // linked base (liquid) BOM; null on single-head items (pure MANUFACTURED
  // or REPACK with no linked base). When non-null, the preview renders the
  // pack and base lines under separate sub-headings and a composition banner
  // explains the per-unit base draw.
  base_bom_version_id_pinned: string | null;
  base_bom_head_id: string | null;
  base_bom_version_label: string | null;
  base_bom_final_output_qty: string | null;
  base_bom_final_output_uom: string | null;
  base_qty_per_pack_unit: string | null;
  // 0237 (Tranche 052) — true when the open call carried a from_plan_id
  // whose plan has a recipe override: the base-source bom_lines below ARE
  // the improvised liquid recipe (server-converted to batch-equivalent
  // quantities so the existing scaling math holds). Packaging unchanged.
  customized_recipe: boolean;
  bom_lines: BomLineSnapshot[];
}

interface ProductionActualSubmit {
  idempotency_key: string;
  event_at: string;
  item_id: string;
  bom_version_id_pinned: string;
  // Two-head pin (Tranche 2). Pass through whatever the OPEN response
  // returned: the linked base BOM version id when the item has a linked
  // base, NULL when single-head. Backend uses this for STALE_BOM_VERSION
  // detection on the base head (mirror semantics of bom_version_id_pinned).
  base_bom_version_id_pinned: string | null;
  output_qty: number;
  scrap_qty: number;
  output_uom: string;
  notes: string | null;
  // Optional link back to a Daily Production Plan row. When provided, the
  // backend flips production_plan.completed_submission_id NULL→submission_id
  // inside the same transaction as the production_actual + ledger writes.
  // See api/src/production-actuals/schemas.ts ProductionActualSubmitSchema.
  from_plan_id?: string | null;
  // C8 (Tranche 050): optional structured variance reason + free-text note,
  // persisted on production_actual and exposed in list + detail responses.
  variance_reason_code?: VarianceReasonCode | null;
  variance_note?: string | null;
}

interface ProductionActualCommitted {
  submission_id: string;
  status: "posted";
  event_at: string;
  posted_at: string;
  item_id: string;
  bom_version_id_pinned: string;
  output_qty: string;
  scrap_qty: string;
  output_uom: string;
  output_ledger_row_id: string;
  scrap_ledger_row_id: string | null;
  consumption: Array<{
    component_id: string;
    consumption_qty: string;
    component_uom: string | null;
    stock_ledger_movement_id: string;
  }>;
  idempotent_replay: boolean;
  // Linked plan id when the submit included a valid from_plan_id; null
  // otherwise. On idempotent replay this reflects the link state at first
  // commit (back-looked-up; not re-resolved from the request body).
  linked_plan_id: string | null;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  sku: string | null;
  status: string;
  supply_method: string;
  sales_uom: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

// ---------------------------------------------------------------------------
// Production plan row — mirror of api/src/production-plan/schemas.ts.
// We only need the fields we actually consume from the prefill query.
// ---------------------------------------------------------------------------
interface ProductionPlanRow {
  plan_id: string;
  plan_date: string;
  item_id: string;
  item_name: string | null;
  planned_qty: string;
  uom: string;
  // B4 (Tranche 050): the API now passes the raw five-value DB status
  // through; rendered_state remains the derived compat field this form
  // keys its behavior on.
  status: "draft" | "planned" | "in_production" | "completed" | "cancelled";
  rendered_state: "planned" | "done" | "cancelled";
  bom_version_id_pinned: string | null;
  bom_version_label: string | null;
  completed_submission_id: string | null;
}

interface ListProductionPlanResponse {
  rows: ProductionPlanRow[];
  count: number;
  as_of: string;
}

// ---------------------------------------------------------------------------
// History row — mirrors GET /api/v1/queries/production-actuals.
// ---------------------------------------------------------------------------
interface ProductionActualListRow {
  submission_id: string;
  item_id: string;
  item_name: string;
  output_qty: string;
  scrap_qty: string;
  output_uom: string;
  bom_version_label: string;
  event_at: string;
  posted_at: string;
  consumption_count: number;
  // C8/B5 (Tranche 050): structured variance reason + reversal status.
  // The list response does NOT carry the reporter — that lives on the
  // detail endpoint only.
  variance_reason_code: VarianceReasonCode | null;
  variance_note: string | null;
  reversed: boolean;
  reversed_by_submission_id: string | null;
  reversed_at: string | null;
}

// ---------------------------------------------------------------------------
// Submission detail — mirror of GET /api/v1/queries/production-actuals/:id
// (api/src/production-actuals/schemas.ts ProductionActualDetailResponse).
// ---------------------------------------------------------------------------
interface ProductionActualDetailLedgerRow {
  movement_id: string;
  movement_type: string; // PRODUCTION_* or PRODUCTION_*_REVERSAL
  item_id: string; // component_id for consumption rows; FG item for output/scrap
  item_name: string | null;
  qty_delta: string; // signed text (qty_8dp)
  uom: string | null;
  source: "pack" | "base" | null; // consumption rows only
  related_movement_id: string | null;
}

interface ProductionActualDetailResponse {
  submission_id: string;
  kind: "production_actual" | "reversal";
  event_at: string;
  posted_at: string;
  reported_by_user_id: string;
  reported_by: string | null;

  item_id: string | null;
  item_name: string | null;
  output_qty: string | null;
  scrap_qty: string | null;
  output_uom: string | null;
  notes: string | null;
  bom_version_id_pinned: string | null;
  bom_version_label: string | null;
  base_bom_version_id_pinned: string | null;
  variance_reason_code: VarianceReasonCode | null;
  variance_note: string | null;

  // Plan currently linked via completed_submission_id. Cleared (null) once
  // the submission is reversed — the plan returned to reportable.
  linked_plan_id: string | null;

  reversed: boolean;
  reversed_by_submission_id: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  reverses_submission_id: string | null;

  ledger_rows: ProductionActualDetailLedgerRow[];
  consumption: ProductionActualDetailLedgerRow[];
}

// Mirror of ProductionActualReverseResponse (B5).
interface ProductionActualReverseResponse {
  reversal_submission_id: string;
  original_submission_id: string;
  status: "posted";
  posted_at: string;
  reason: string;
  reversed_movement_count: number;
  consumption_reversal_count: number;
  output_reversal_count: number;
  scrap_reversal_count: number;
  plan_unlinked_id: string | null;
  idempotent_replay: boolean;
}

// ---------------------------------------------------------------------------
// Formatting helpers — English / LTR locale forced for date output to
// prevent the Hebrew-month abbreviation regression cited in §8 of the audit.
// ---------------------------------------------------------------------------
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
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

function fmtPlanDate(ymd: string): string {
  // Plan dates are YYYY-MM-DD strings; render as "May 1, 2026" en-US locale.
  try {
    const d = new Date(ymd + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return ymd;
  }
}

function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function supplyMethodLabel(sm: string | null | undefined): string {
  if (sm === "MANUFACTURED") return "Manufactured";
  if (sm === "REPACK") return "Repack";
  if (sm === "BOUGHT_FINISHED") return "Bought finished";
  return "Unknown supply method";
}

// ---------------------------------------------------------------------------
// Relative time helper — for event_at and history rows.
// ---------------------------------------------------------------------------
function fmtRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Variance display — implements W4 contract §3 / §4.1 (post-submit
// confirmation panel). The contract's canonical formula is computed
// client-side here because POST /api/v1/mutations/production-actuals does
// NOT echo planned_qty in its response (linked_plan_id is exposed but the
// plan row itself is not denormalized — GAP-VAR-4 in the contract). The form
// already has the linked plan in state via `linkedPlan` (the row the user
// selected pre-submit), which carries planned_qty + uom + plan_date.
//
// Numbers stay bit-identical to the /planning/production-plan plan-row
// display (W4 contract §10.1 acceptance criterion) because both surfaces
// derive from the same inputs (planned_qty + output_qty) using the same
// formula. The plan-row variance is pre-computed by the backend and read
// from completed_actual.variance_qty / variance_pct; here we re-derive
// because the production_actual response shape predates GAP-VAR-2 closure.
//
// CLAUDE.md production reporting v1 lock: scrap is excluded from variance.
// ---------------------------------------------------------------------------
const VARIANCE_ON_TARGET_THRESHOLD_PCT = 2.0;

type VarianceSign = "on_target" | "over" | "under";

interface VarianceComputation {
  variance_qty: number;
  variance_pct: number | null;
  variance_sign: VarianceSign;
}

function computeVariance(
  outputQtyStr: string,
  plannedQtyStr: string,
): VarianceComputation {
  const output = parseFloat(outputQtyStr);
  const planned = parseFloat(plannedQtyStr);
  if (!Number.isFinite(output) || !Number.isFinite(planned)) {
    return { variance_qty: 0, variance_pct: null, variance_sign: "on_target" };
  }
  const variance = output - planned;
  // §3.5: planned=0 unreachable per CHECK; defensively map to NULL pct.
  if (planned <= 0) {
    return {
      variance_qty: variance,
      variance_pct: null,
      variance_sign: variance === 0 ? "on_target" : "over",
    };
  }
  const pct = (variance / planned) * 100;
  const band = Math.abs(planned) * (VARIANCE_ON_TARGET_THRESHOLD_PCT / 100);
  const sign: VarianceSign =
    variance > band ? "over" : variance < -band ? "under" : "on_target";
  return { variance_qty: variance, variance_pct: pct, variance_sign: sign };
}

function fmtVarianceQty(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const formatted = Number.isInteger(abs)
    ? abs.toFixed(0)
    : abs.toFixed(2).replace(/\.?0+$/, "");
  return n > 0 ? `+${formatted}` : `−${formatted}`;
}

function fmtVariancePct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0.0%";
  const abs = Math.abs(n);
  return `${n > 0 ? "+" : "−"}${abs.toFixed(1)}%`;
}

const VARIANCE_SIGN_LABEL: Record<VarianceSign, string> = {
  on_target: "On target",
  over: "Over",
  under: "Under",
};
const VARIANCE_SIGN_ICON: Record<VarianceSign, string> = {
  on_target: "✓",
  over: "↑",
  under: "↓",
};

// W4 §4.1 disclaimer copy. Mandatory on the post-submit confirmation per
// §A13 row 10. Cites the CLAUDE.md production reporting v1 lock so an
// operator who reads it understands why scrap is not in the formula.
const VARIANCE_DISCLAIMER =
  "Variance compares output to planned quantity. It does not include scrap " +
  "(per the production reporting v1 model: output is the good-output metric, " +
  "scrap is loss). The variance is for visibility only and does not affect " +
  "stock — your production has been posted and stock is updated.";

// ---------------------------------------------------------------------------
// Reason-code → English short-label map. Keyed by ProductionActualConflictReason
// from api/src/production-actuals/schemas.ts. Each label is the operator-facing
// one-liner; longer detail (when admin) shows below in mono.
// ---------------------------------------------------------------------------
const REASON_CODE_LABELS: Record<string, string> = {
  ITEM_NOT_FOUND: "Item not found in master data.",
  ITEM_INACTIVE: "Item is inactive — production cannot post against it.",
  WRONG_SUPPLY_METHOD:
    "This item is not manufactured or repacked. Production reports do not apply.",
  NO_BOM_HEAD: "No active BOM is configured for this item.",
  NO_ACTIVE_BOM_VERSION: "Item has no active BOM version. Configure one before reporting production.",
  STALE_BOM_VERSION:
    "The BOM was updated since this form opened. Reopen the form to pin the new version.",
  UOM_MISMATCH:
    "The unit of measure does not match the item. Check the UoM field and resubmit.",
  UNIT_NOT_FOUND: "The unit of measure code is not recognized.",
  IDEMPOTENCY_KEY_REUSED:
    "This submission was already received. If you do not see it linked, reopen the form.",
  NO_BOM_LINES: "The pinned BOM has no component lines. Configure the BOM before reporting production.",
  PLAN_NOT_FOUND: "The linked plan no longer exists.",
  PLAN_ITEM_MISMATCH: "This plan is for a different product.",
  PLAN_ALREADY_COMPLETED: "This plan was already completed.",
  PLAN_CANCELLED: "This plan was cancelled.",
};

function reasonCodeLabel(reason: string): string {
  return REASON_CODE_LABELS[reason] ?? `Submission rejected. Code: ${reason}.`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try again.`,
    );
  }
  return (await res.json()) as T;
}

type Phase = "pick" | "entering" | "submitting" | "done";
interface DoneState {
  kind: "success" | "error" | "stale";
  message: string;
  detail?: string;
  // Plan-conflict variants surface inline retry-without-link buttons.
  planConflict?:
    | "PLAN_NOT_FOUND"
    | "PLAN_ITEM_MISMATCH"
    | "PLAN_ALREADY_COMPLETED"
    | "PLAN_CANCELLED";
  // Persisted committed response (for the success panel only).
  committed?: ProductionActualCommitted;
  committedItemName?: string;
  // Tranche 041 — snapshot captured at commit time, so the success panel's
  // consumption table can resolve component names after setSnapshot(null)
  // clears the live form state.
  committedSnapshot?: ProductionActualOpenResponse;
  // Tranche 048 (C7) — the linked plan row captured at commit time.
  // fromPlanId is cleared on success (which nulls the derived `linkedPlan`),
  // so the success panel reads the plan from here for the variance row and
  // the "Re-plan remainder" action.
  committedPlan?: ProductionPlanRow | null;
}

// Decimal-string arithmetic helpers (keep server-side precision intact for
// the preview panel; the server re-explodes authoritatively on submit).
function stringDiv(num: string, denom: string, prodQty: number): string {
  const n = Number(num);
  const d = Number(denom);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return "?";
  const r = (n * prodQty) / d;
  const s = r.toFixed(4);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// ---------------------------------------------------------------------------
// Step indicator component — visual 2-step progress bar.
// ---------------------------------------------------------------------------
function StepIndicator({ phase }: { phase: Phase }) {
  const step = phase === "pick" ? 1 : 2;
  return (
    <div className="mb-8 flex items-center gap-3" aria-label="Form progress">
      {/* Step 1 */}
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-base font-bold transition-colors shadow-sm",
            step === 1
              ? "bg-accent text-white"
              : "bg-success text-white",
          )}
          aria-current={step === 1 ? "step" : undefined}
        >
          {step > 1 ? (
            <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : "1"}
        </div>
        <span
          className={cn(
            "text-sm font-semibold",
            step === 1 ? "text-fg" : "text-fg-muted",
          )}
        >
          Select product
        </span>
      </div>

      {/* Connector */}
      <div
        className={cn(
          "h-1 flex-1 rounded-full transition-colors",
          step > 1 ? "bg-success/60" : "bg-border",
        )}
      />

      {/* Step 2 */}
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-base font-bold transition-colors shadow-sm",
            step === 2
              ? "bg-accent text-white"
              : "border-2 border-border bg-bg text-fg-muted",
          )}
          aria-current={step === 2 ? "step" : undefined}
        >
          2
        </div>
        <span
          className={cn(
            "text-sm font-semibold",
            step === 2 ? "text-fg" : "text-fg-muted",
          )}
        >
          Enter quantities
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tranche 050 (B2) — read-only submission detail view, rendered when the
// page is opened with ?submission_id=. Shows the committed report (or a
// reversal envelope), the full consumption table with movement ids, plan
// linkage + variance, reversal status, and the admin-only "Reverse this
// report" action (B5).
//
// Role detection: client-side via useSession() (SessionProvider →
// /api/me → app_users.role). The backend enforces the admin gate
// authoritatively (403) regardless of what the client renders.
// ---------------------------------------------------------------------------
function planLookupWindow(): { from: string; to: string } {
  const today = new Date();
  const back = new Date(today);
  back.setDate(today.getDate() - 30);
  const fwd = new Date(today);
  fwd.setDate(today.getDate() + 90);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: ymd(back), to: ymd(fwd) };
}

function fmtSignedQty(qtyDelta: string): string {
  const n = Number(qtyDelta);
  if (!Number.isFinite(n)) return qtyDelta;
  return fmtNumStr(String(Math.abs(n)));
}

function SubmissionDetailView({ submissionId }: { submissionId: string }) {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const detailQuery = useQuery<ProductionActualDetailResponse>({
    queryKey: ["production-actuals", "detail", submissionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/production-actuals/${encodeURIComponent(submissionId)}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.status === 404) {
        throw new Error(
          "Production report not found. It may have been submitted on another environment, or the link is stale.",
        );
      }
      if (!res.ok) {
        throw new Error(
          `Could not load the production report (HTTP ${res.status}). Check your connection and try again.`,
        );
      }
      return (await res.json()) as ProductionActualDetailResponse;
    },
    retry: false,
  });
  const detail = detailQuery.data ?? null;

  // Plan-linkage variance — the detail response carries linked_plan_id only,
  // so resolve the plan row through the list endpoint (no GET-by-id exists;
  // same wide-window pattern as the form's from_plan_id prefill).
  const planWindow = useMemo(() => planLookupWindow(), []);
  const linkedPlanId = detail?.linked_plan_id ?? null;
  const planQuery = useQuery<ListProductionPlanResponse>({
    queryKey: [
      "production-plan",
      "detail-link",
      linkedPlanId,
      planWindow.from,
      planWindow.to,
    ],
    queryFn: () =>
      fetchJson(
        `/api/production-plan?from=${encodeURIComponent(planWindow.from)}&to=${encodeURIComponent(planWindow.to)}&include_completed=true`,
      ),
    enabled: Boolean(linkedPlanId),
    staleTime: 60_000,
    retry: false,
  });
  const linkedPlan = useMemo<ProductionPlanRow | null>(() => {
    if (!linkedPlanId) return null;
    return (
      (planQuery.data?.rows ?? []).find((r) => r.plan_id === linkedPlanId) ??
      null
    );
  }, [linkedPlanId, planQuery.data]);

  // ----- Reverse action state (B5) -----
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  // One idempotency key per dialog-open, so a retry of the same confirm is
  // an idempotent replay rather than a second reversal attempt.
  const reverseKeyRef = useRef<string>("");
  const [reverse, setReverse] = useState<{
    state: "idle" | "pending" | "success" | "error";
    message?: string;
    result?: ProductionActualReverseResponse;
  }>({ state: "idle" });

  function openReverseDialog(): void {
    reverseKeyRef.current = newIdempotencyKey();
    setReverseReason("");
    setReverse({ state: "idle" });
    setReverseOpen(true);
  }

  async function handleReverseConfirm(): Promise<void> {
    const reason = reverseReason.trim();
    if (!reason) return;
    setReverse({ state: "pending" });
    try {
      const res = await fetch(
        `/api/production-actuals/${encodeURIComponent(submissionId)}/reverse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: reverseKeyRef.current,
            reason,
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as unknown;
      if (
        res.ok &&
        body &&
        typeof body === "object" &&
        (body as { status?: unknown }).status === "posted"
      ) {
        const result = body as ProductionActualReverseResponse;
        setReverse({ state: "success", result });
        setReverseOpen(false);
        // The reversal undid stock impact and may have returned the linked
        // plan to reportable — refresh the board and the history list.
        void queryClient.invalidateQueries({ queryKey: ["production-plan"] });
        void queryClient.invalidateQueries({
          queryKey: ["production-actuals", "history"],
        });
        void detailQuery.refetch();
        return;
      }
      if (res.status === 409) {
        const reasonCode =
          body && typeof body === "object"
            ? String((body as { reason_code?: unknown }).reason_code ?? "")
            : "";
        setReverse({
          state: "error",
          message:
            reasonCode === "ALREADY_REVERSED"
              ? "This report was already reversed. Refreshing the view."
              : "The reversal was rejected. Reopen the dialog and try again.",
        });
        if (reasonCode === "ALREADY_REVERSED") void detailQuery.refetch();
        return;
      }
      if (res.status === 403) {
        setReverse({
          state: "error",
          message:
            "Not authorized. Reversing a production report requires the admin role.",
        });
        return;
      }
      if (res.status === 404) {
        setReverse({
          state: "error",
          message: "This production report no longer exists.",
        });
        return;
      }
      if (res.status === 503) {
        setReverse({
          state: "error",
          message:
            "Break-glass active — platform writes are temporarily paused. Try again later.",
        });
        return;
      }
      setReverse({
        state: "error",
        message: `Could not reverse the report (HTTP ${res.status}). Try again.`,
      });
    } catch {
      setReverse({
        state: "error",
        message:
          "Network error reversing the report. Check your connection and try again.",
      });
    }
  }

  const isReversalRecord = detail?.kind === "reversal";
  const canReverse =
    isAdmin && detail !== null && detail.kind === "production_actual" && !detail.reversed;

  const variance =
    detail && detail.output_qty && linkedPlan
      ? computeVariance(detail.output_qty, linkedPlan.planned_qty)
      : null;

  return (
    <div dir="ltr" data-testid="production-actual-detail">
      <WorkflowHeader
        size="section"
        eyebrow={isReversalRecord ? "Reversal record" : "Production report"}
        title={
          detail?.item_name ??
          (isReversalRecord ? "Production reversal" : "Production report")
        }
        description={
          isReversalRecord
            ? "Mirrored reversal rows. The original report's stock impact has been undone."
            : "Committed production report. Stock has already been updated by this submission."
        }
      />

      <div className="mb-4">
        <Link
          href="/stock/production-actual"
          className="btn btn-sm gap-1.5"
          data-testid="production-actual-detail-back"
        >
          ← Back to report form
        </Link>
      </div>

      {/* Reverse success confirmation */}
      {reverse.state === "success" && reverse.result ? (
        <div
          className="mb-4 rounded-md border border-success/40 bg-success-softer px-4 py-3 text-sm text-success-fg"
          role="status"
          data-testid="production-actual-reverse-success"
        >
          <div className="font-medium">
            Report reversed. The stock impact has been undone with{" "}
            {reverse.result.reversed_movement_count} mirrored ledger row
            {reverse.result.reversed_movement_count !== 1 ? "s" : ""}.
          </div>
          <div className="mt-1 text-xs opacity-90">
            {reverse.result.consumption_reversal_count} consumption ·{" "}
            {reverse.result.output_reversal_count} output ·{" "}
            {reverse.result.scrap_reversal_count} scrap
            {reverse.result.plan_unlinked_id ? (
              <>
                {" "}
                — the linked plan was returned to the board as reportable.
              </>
            ) : null}
          </div>
          <div className="mt-1 font-mono text-3xs opacity-80">
            reversal ref: {reverse.result.reversal_submission_id}
          </div>
        </div>
      ) : null}

      {detailQuery.isLoading ? (
        <SectionCard title="Loading production report…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        </SectionCard>
      ) : detailQuery.isError ? (
        <SectionCard title="Could not load the production report">
          <div
            className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
            data-testid="production-actual-detail-error"
          >
            <div className="font-semibold">
              {(detailQuery.error as Error).message}
            </div>
            <button
              type="button"
              onClick={() => void detailQuery.refetch()}
              className="mt-2 text-xs font-medium underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </SectionCard>
      ) : detail ? (
        <div className="space-y-5">
          {/* Reversal-status banner on a reversed original */}
          {detail.kind === "production_actual" && detail.reversed ? (
            <div
              className="rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
              role="status"
              data-testid="production-actual-detail-reversed-banner"
            >
              <div className="font-medium">This report has been reversed.</div>
              <div className="mt-1 text-xs opacity-90">
                {detail.reversed_at ? (
                  <>Reversed {fmtDate(detail.reversed_at)}. </>
                ) : null}
                {detail.reversal_reason ? (
                  <>Reason: {detail.reversal_reason}. </>
                ) : null}
                It no longer contributes to stock truth — mirrored reversal
                rows were posted to the ledger.
              </div>
              {detail.reversed_by_submission_id ? (
                <Link
                  href={`/stock/production-actual?submission_id=${encodeURIComponent(detail.reversed_by_submission_id)}`}
                  className="mt-1 inline-block text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  View the reversal record (who and when) →
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* Reversal-envelope banner */}
          {isReversalRecord ? (
            <div
              className="rounded-md border border-info/40 bg-info-softer px-4 py-3 text-sm text-info-fg"
              role="status"
              data-testid="production-actual-detail-reversal-banner"
            >
              <div className="font-medium">
                This is a reversal record — it undoes a previous production
                report.
              </div>
              <div className="mt-1 text-xs opacity-90">
                Reversed by {detail.reported_by ?? detail.reported_by_user_id}{" "}
                on {fmtDate(detail.posted_at || detail.event_at)}.
                {detail.reversal_reason ? (
                  <> Reason: {detail.reversal_reason}.</>
                ) : null}
              </div>
              {detail.reverses_submission_id ? (
                <Link
                  href={`/stock/production-actual?submission_id=${encodeURIComponent(detail.reverses_submission_id)}`}
                  className="mt-1 inline-block text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  View the original report →
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* Summary card */}
          <SectionCard
            title={isReversalRecord ? "Reversal summary" : "Report summary"}
          >
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
              {detail.output_qty !== null ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-fg-subtle">
                    Output
                  </div>
                  <div className="mt-0.5 font-mono text-3xl font-bold tabular-nums text-fg">
                    {fmtNumStr(detail.output_qty)}
                    <span className="ml-1 text-base font-normal">
                      {detail.output_uom}
                    </span>
                  </div>
                </div>
              ) : null}
              {detail.scrap_qty !== null && Number(detail.scrap_qty) > 0 ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-fg-subtle">
                    Scrap
                  </div>
                  <div className="mt-0.5 font-mono text-lg tabular-nums text-fg">
                    {fmtNumStr(detail.scrap_qty)}
                    <span className="ml-1 text-sm font-normal">
                      {detail.output_uom}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {detail.item_name || detail.item_id ? (
                <div>
                  <dt className="text-xs text-fg-subtle">Item</dt>
                  <dd className="mt-0.5 font-medium text-fg">
                    {detail.item_name ?? detail.item_id}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-fg-subtle">Event time</dt>
                <dd className="mt-0.5 text-fg">{fmtDate(detail.event_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Reported by</dt>
                <dd
                  className="mt-0.5 text-fg"
                  data-testid="production-actual-detail-reporter"
                >
                  {detail.reported_by ?? detail.reported_by_user_id}
                </dd>
              </div>
              {detail.posted_at ? (
                <div>
                  <dt className="text-xs text-fg-subtle">Posted</dt>
                  <dd className="mt-0.5 text-fg">{fmtDate(detail.posted_at)}</dd>
                </div>
              ) : null}
              {detail.bom_version_label ? (
                <div>
                  <dt className="text-xs text-fg-subtle">Pinned BOM</dt>
                  <dd className="mt-0.5 font-mono text-fg">
                    {detail.bom_version_label}
                  </dd>
                </div>
              ) : null}
              {detail.variance_reason_code ? (
                <div>
                  <dt className="text-xs text-fg-subtle">Variance reason</dt>
                  <dd className="mt-0.5 text-fg">
                    {varianceReasonLabel(detail.variance_reason_code)}
                    {detail.variance_note ? (
                      <span className="text-fg-muted">
                        {" "}
                        — {detail.variance_note}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
              {detail.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-subtle">Notes</dt>
                  <dd className="mt-0.5 text-fg">{detail.notes}</dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-3 font-mono text-3xs text-fg-muted">
              ref: {detail.submission_id}
            </div>
          </SectionCard>

          {/* Plan linkage + variance */}
          {detail.linked_plan_id ? (
            <SectionCard title="Linked production plan">
              <div className="text-sm">
                <span className="font-mono text-xs">{detail.linked_plan_id}</span>
                {linkedPlan ? (
                  <span className="text-fg-muted">
                    {" "}
                    · {fmtPlanDate(linkedPlan.plan_date)} · planned{" "}
                    <span className="font-mono tabular-nums">
                      {fmtNumStr(linkedPlan.planned_qty)} {linkedPlan.uom}
                    </span>
                  </span>
                ) : planQuery.isLoading ? (
                  <span className="text-fg-muted"> · loading plan details…</span>
                ) : (
                  <span className="text-fg-muted">
                    {" "}
                    · plan details not visible in the current window
                  </span>
                )}
              </div>
              {variance ? (
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  data-testid="production-actual-detail-variance"
                  data-variance-sign={variance.variance_sign}
                  title={VARIANCE_DISCLAIMER}
                >
                  <span className="font-mono tabular-nums">
                    Variance:{" "}
                    <span
                      className={
                        variance.variance_sign === "on_target"
                          ? "text-success-fg"
                          : "text-warning-fg"
                      }
                    >
                      {fmtVarianceQty(variance.variance_qty)}{" "}
                      {detail.output_uom}{" "}
                      ({fmtVariancePct(variance.variance_pct)})
                    </span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-semibold uppercase",
                      variance.variance_sign === "on_target"
                        ? "bg-success-softer text-success-fg"
                        : "bg-warning-softer text-warning-fg",
                    )}
                  >
                    <span aria-hidden>
                      {VARIANCE_SIGN_ICON[variance.variance_sign]}
                    </span>
                    {VARIANCE_SIGN_LABEL[variance.variance_sign]}
                  </span>
                </div>
              ) : null}
              <div className="mt-2">
                <Link
                  href="/planning/production-plan"
                  className="text-xs font-medium underline underline-offset-2 hover:no-underline"
                  data-testid="production-actual-detail-plan-link"
                >
                  View on the daily plan board →
                </Link>
              </div>
            </SectionCard>
          ) : null}

          {/* Consumption table */}
          <SectionCard
            title={
              isReversalRecord
                ? "Reversed component consumption"
                : "Component consumption"
            }
            description={
              isReversalRecord
                ? "Mirrored PRODUCTION_CONSUMPTION_REVERSAL rows — quantities were returned to stock."
                : "Computed from the pinned BOM at submit time and posted to the stock ledger."
            }
          >
            {detail.consumption.length === 0 ? (
              <div className="text-xs text-fg-muted">
                No component consumption rows.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60">
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Component
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Quantity
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Unit
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Movement id
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.consumption.map((c) => (
                      <tr
                        key={c.movement_id}
                        className="border-b border-border/40 last:border-b-0 even:bg-bg-subtle/30"
                        data-testid="production-actual-detail-consumption-row"
                      >
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium text-fg">
                              {c.item_name ?? c.item_id}
                            </span>
                            {c.source ? (
                              <span className="rounded-sm border border-border/60 px-1 py-px text-[10px] uppercase tracking-wide text-fg-muted">
                                {c.source}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-fg">
                          {fmtSignedQty(c.qty_delta)}
                        </td>
                        <td className="px-3 py-2 text-fg-muted">
                          {c.uom ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-3xs text-fg-muted">
                          {c.movement_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Admin-only reverse action (B5) */}
          {canReverse ? (
            <SectionCard
              title="Danger zone"
              description="Reversing posts mirrored ledger rows that undo this report's stock impact. The original rows are never deleted."
            >
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={openReverseDialog}
                data-testid="production-actual-detail-reverse"
              >
                Reverse this report
              </button>
              {reverse.state === "error" && reverse.message ? (
                <div
                  className="mt-2 text-xs text-danger-fg"
                  role="alert"
                  data-testid="production-actual-reverse-error"
                >
                  {reverse.message}
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      {/* Reverse confirm dialog — REQUIRED reason */}
      {reverseOpen && detail ? (
        <div
          dir="ltr"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
          role="dialog"
          aria-modal="true"
          data-testid="production-actual-reverse-dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget && reverse.state !== "pending") {
              setReverseOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-fg-strong">
              Reverse this production report?
            </h2>
            <p className="mt-1 text-3xs text-fg-muted">
              {detail.item_name ?? detail.item_id} ·{" "}
              {detail.output_qty ? fmtNumStr(detail.output_qty) : ""}{" "}
              {detail.output_uom ?? ""}
            </p>
            <div className="mt-3 rounded border border-warning/30 bg-warning-softer/30 p-3 text-xs text-warning-fg">
              <span className="font-medium">Heads up: </span>
              Reversing undoes this report&apos;s stock impact — consumed
              components return to stock and the produced output is removed.
              If the report was linked to a plan, the plan returns to the
              board as reportable. This cannot be un-reversed; you would
              submit a fresh report instead.
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleReverseConfirm();
              }}
            >
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Reason for reversal *
                </span>
                <textarea
                  rows={3}
                  className="input min-h-[4rem]"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. wrong quantity entered, reported against the wrong item"
                  required
                  autoFocus
                  data-testid="production-actual-reverse-reason"
                />
              </label>
              {reverse.state === "error" && reverse.message ? (
                <div
                  className="rounded border border-danger/40 bg-danger-softer px-3 py-2 text-3xs text-danger-fg"
                  role="alert"
                >
                  {reverse.message}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setReverseOpen(false)}
                  disabled={reverse.state === "pending"}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-danger"
                  disabled={
                    reverseReason.trim().length === 0 ||
                    reverse.state === "pending"
                  }
                  data-testid="production-actual-reverse-confirm"
                >
                  {reverse.state === "pending"
                    ? "Reversing…"
                    : "Reverse report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ProductionActualPage() {
  const { session } = useSession();
  // Tom-approved 2026-06-15: planners may report production (matches backend
  // gate + the authorize.ts stock:execute lattice). Only viewer is read-only.
  const canSubmit =
    session.role === "operator" ||
    session.role === "planner" ||
    session.role === "admin";
  const isAdmin = session.role === "admin";

  const queryClient = useQueryClient();
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Item search state — for the searchable combobox in Step 1.
  // ---------------------------------------------------------------------------
  const [itemSearch, setItemSearch] = useState<string>("");
  const [comboboxOpen, setComboboxOpen] = useState<boolean>(false);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const comboboxInputRef = useRef<HTMLInputElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Dropdown position — fixed positioning avoids clipping by overflow-x-hidden
  // on AppShellChrome. Recalculated on open, scroll, and resize.
  // ---------------------------------------------------------------------------
  const [dropdownRect, setDropdownRect] = useState<{
    top: number; left: number; width: number; maxHeight: number;
  } | null>(null);

  const recalcDropdown = useCallback(() => {
    if (!comboboxInputRef.current) return;
    const r = comboboxInputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openDownward = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    if (openDownward) {
      setDropdownRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        maxHeight: Math.min(320, Math.max(120, spaceBelow)),
      });
    } else {
      // Open upward when more space above
      setDropdownRect({
        top: r.top - Math.min(320, Math.max(120, spaceAbove)) - 4,
        left: r.left,
        width: r.width,
        maxHeight: Math.min(320, Math.max(120, spaceAbove)),
      });
    }
  }, []);

  useEffect(() => {
    if (!comboboxOpen) { setDropdownRect(null); return; }
    recalcDropdown();
    window.addEventListener("scroll", recalcDropdown, { capture: true, passive: true });
    window.addEventListener("resize", recalcDropdown, { passive: true });
    return () => {
      window.removeEventListener("scroll", recalcDropdown, true);
      window.removeEventListener("resize", recalcDropdown);
    };
  }, [comboboxOpen, recalcDropdown]);

  // Close combobox when clicking outside. Checks both the input wrapper and
  // the fixed-positioned dropdown list (which lives outside the DOM subtree).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideInput = comboboxRef.current?.contains(target);
      const insideDropdown = dropdownListRef.current?.contains(target);
      if (!insideInput && !insideDropdown) {
        setComboboxOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // Relative time ticker — refreshes the event_at relative label every 30s.
  // ---------------------------------------------------------------------------
  const [relTimeTick, setRelTimeTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRelTimeTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const historyQuery = useQuery<ListEnvelope<ProductionActualListRow>>({
    queryKey: ["production-actuals", "history"],
    queryFn: () =>
      fetch("/api/production-actuals/history?limit=10", {
        headers: { Accept: "application/json" },
      }).then((r) => {
        // Graceful degrade: if endpoint not yet deployed, surface nothing.
        if (!r.ok) throw new Error(`history ${r.status}`);
        return r.json() as Promise<ListEnvelope<ProductionActualListRow>>;
      }),
    staleTime: 60_000,
    // Do not throw to error boundary on 404 / 500 — endpoint may not be live yet.
    retry: false,
  });

  const historyRows = historyQuery.data?.rows ?? [];

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "PRODUCIBLE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
  });

  // Filter to items the Production Actual form applies to — MANUFACTURED or
  // REPACK. BOUGHT_FINISHED is explicitly rejected by the handler (409
  // WRONG_SUPPLY_METHOD) with a defense-in-depth DB trigger behind it.
  const producibleItems = useMemo<ItemRow[]>(() => {
    const rows = itemsQuery.data?.rows ?? [];
    return rows
      .filter(
        (r) => r.supply_method === "MANUFACTURED" || r.supply_method === "REPACK",
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [itemsQuery.data]);

  // Filtered items for combobox dropdown.
  const filteredItems = useMemo<ItemRow[]>(() => {
    if (!itemSearch.trim()) return producibleItems;
    const q = itemSearch.toLowerCase();
    return producibleItems.filter(
      (r) =>
        r.item_name.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q),
    );
  }, [producibleItems, itemSearch]);

  const filteredManufactured = filteredItems.filter(
    (r) => r.supply_method === "MANUFACTURED",
  );
  const filteredRepack = filteredItems.filter(
    (r) => r.supply_method === "REPACK",
  );

  // Query-string-driven deep-link prefill from planning recommendations OR
  // Daily Production Plan board. Read once on mount; do not stomp manually
  // typed values on subsequent re-renders.
  const searchParams = useSearchParams();
  // Tranche 050 (B2) — ?submission_id= switches the page into the read-only
  // submission detail view (rendered at the bottom of this component, after
  // every hook has run).
  const submissionIdParam = searchParams?.get("submission_id") ?? null;
  const initialItemId = searchParams?.get("item_id") ?? "";
  const initialSuggestedQty = fmtNumStr(searchParams?.get("suggested_qty") ?? "");
  const fromRecId = searchParams?.get("from_rec") ?? null;
  const fromRunId = searchParams?.get("from_run") ?? null;
  const fromPlanIdParam = searchParams?.get("from_plan_id") ?? null;

  // Live state for the plan link. Starts at the URL value; cleared by the
  // user via "Submit without linking" buttons on PLAN_* conflicts.
  const [fromPlanId, setFromPlanId] = useState<string | null>(fromPlanIdParam);

  // Fetch the linked plan (if any) so we can show the operator the plan
  // context up-front and prefill item + qty. We use the LIST endpoint with
  // a wide window because there is no GET-by-id endpoint; we filter
  // client-side. Window = today − 7d to today + 90d (covers re-runs of
  // older plans + the 90-day window cap on the API).
  const planQueryWindow = useMemo(() => {
    const today = new Date();
    const back = new Date(today);
    back.setDate(today.getDate() - 30);
    const fwd = new Date(today);
    fwd.setDate(today.getDate() + 90);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: ymd(back), to: ymd(fwd) };
  }, []);

  const planQuery = useQuery<ListProductionPlanResponse>({
    queryKey: [
      "production-plan",
      "by-id",
      fromPlanId,
      planQueryWindow.from,
      planQueryWindow.to,
    ],
    queryFn: () =>
      fetchJson(
        `/api/production-plan?from=${encodeURIComponent(planQueryWindow.from)}&to=${encodeURIComponent(planQueryWindow.to)}&include_completed=true`,
      ),
    enabled: Boolean(fromPlanId),
    staleTime: 60_000,
    retry: false,
  });

  const linkedPlan = useMemo<ProductionPlanRow | null>(() => {
    if (!fromPlanId) return null;
    const rows = planQuery.data?.rows ?? [];
    return rows.find((r) => r.plan_id === fromPlanId) ?? null;
  }, [fromPlanId, planQuery.data]);

  // Derived initial qty: when the operator landed via from_plan_id and the
  // plan is found, the planned_qty wins over an explicitly passed
  // ?suggested_qty (the plan is the more authoritative source).
  const planSuggestedQty =
    linkedPlan && linkedPlan.rendered_state === "planned"
      ? linkedPlan.planned_qty
      : null;

  const [selectedItemId, setSelectedItemId] = useState<string>(initialItemId);
  const [phase, setPhase] = useState<Phase>("pick");
  const [snapshot, setSnapshot] = useState<ProductionActualOpenResponse | null>(
    null,
  );
  const [eventAt, setEventAt] = useState<string>(nowLocalDateTime());
  const [outputQty, setOutputQty] = useState<string>(initialSuggestedQty);
  const [scrapQty, setScrapQty] = useState<string>("0");

  // Apply the plan-derived prefill once the plan query lands. This runs
  // separately from the items-prefill effect so we don't race the two
  // queries against each other.
  const planPrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (planPrefillAppliedRef.current) return;
    if (!fromPlanId) {
      planPrefillAppliedRef.current = true;
      return;
    }
    if (planQuery.isLoading || planQuery.isError) return;
    if (!linkedPlan) {
      // Plan not in the window — surface inline below; do not stomp item.
      planPrefillAppliedRef.current = true;
      return;
    }
    // Prefer plan.item_id over URL ?item_id= when the two disagree.
    if (!selectedItemId || selectedItemId !== linkedPlan.item_id) {
      setSelectedItemId(linkedPlan.item_id);
    }
    if (!outputQty && planSuggestedQty) {
      setOutputQty(planSuggestedQty);
    }
    planPrefillAppliedRef.current = true;
  }, [
    fromPlanId,
    planQuery.isLoading,
    planQuery.isError,
    linkedPlan,
    planSuggestedQty,
    selectedItemId,
    outputQty,
  ]);

  // One-shot apply of URL-driven item_id prefill. If items query confirms
  // the item exists but isn't producible (BOUGHT_FINISHED), surface a small
  // inline notice and clear so the operator picks manually.
  const itemPrefillAppliedRef = useRef(false);
  const [prefillRejected, setPrefillRejected] = useState<string | null>(null);
  useEffect(() => {
    if (itemPrefillAppliedRef.current) return;
    if (!initialItemId) {
      itemPrefillAppliedRef.current = true;
      return;
    }
    if (itemsQuery.isLoading || itemsQuery.isError) return;
    const match = producibleItems.find((r) => r.item_id === initialItemId);
    if (!match) {
      const allItems = itemsQuery.data?.rows ?? [];
      const exists = allItems.find((r) => r.item_id === initialItemId);
      setPrefillRejected(
        exists
          ? `Item ${exists.item_name ?? initialItemId} (${supplyMethodLabel(exists.supply_method)}) is not produced or repacked here. Production reports do not apply. Pick a manufactured or repack item from the list.`
          : `Item ${initialItemId} was not found. Pick an item from the list.`,
      );
      setSelectedItemId("");
      setOutputQty("");
    }
    itemPrefillAppliedRef.current = true;
  }, [
    initialItemId,
    itemsQuery.isLoading,
    itemsQuery.isError,
    itemsQuery.data,
    producibleItems,
  ]);

  const [outputUom, setOutputUom] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // ---------------------------------------------------------------------------
  // Tranche 050 (C8) — variance reason. When the report is linked to a live
  // plan and |output − planned| exceeds the ±2% band, the operator is asked
  // for a structured reason (strongly suggested). Submitting without one
  // requires the explicit "Skip reason" affordance.
  // ---------------------------------------------------------------------------
  const [varianceReasonCode, setVarianceReasonCode] = useState<
    VarianceReasonCode | ""
  >("");
  const [varianceNote, setVarianceNote] = useState<string>("");
  const [varianceReasonSkipped, setVarianceReasonSkipped] =
    useState<boolean>(false);
  const [varianceReasonError, setVarianceReasonError] = useState<string | null>(
    null,
  );
  // Default to expanded so the operator sees expected consumption inline
  // while entering output_qty / scrap_qty — no extra click required to
  // verify the BOM × qty math matches expectation.
  const [previewExpanded, setPreviewExpanded] = useState<boolean>(true);
  const [done, setDone] = useState<DoneState | null>(null);

  // Tranche 048 (C7) — inline state for the "Re-plan remainder" action on
  // the success panel. Reset on every fresh submit and on resetFlow.
  const [replan, setReplan] = useState<{
    state: "idle" | "pending" | "success" | "error";
    message?: string;
    plannedForDate?: string;
  }>({ state: "idle" });

  // Combined loading guard. Pick screen waits for items; once snapshot is
  // resolved we don't need items anymore.
  const isLoadingItems = itemsQuery.isLoading;
  const itemsLoadErr = itemsQuery.error;

  // Keyboard shortcut: Cmd+Enter / Ctrl+Enter triggers submit in step 2.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (
          (phase === "entering" || phase === "submitting") &&
          canSubmit &&
          phase !== "submitting"
        ) {
          void submitProductionActual(fromPlanId);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, canSubmit, fromPlanId],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-advance to Step 2 when the form was opened from a plan card and
  // the item is already known. Fires once: when from_plan_id is in the URL,
  // the selected item is confirmed producible, and the form is still on Step 1.
  const autoOpenFiredRef = useRef(false);
  // Auto-focus the output_qty input on Step 2 so the operator can type
  // immediately after item selection. Mirrors the physical-count pattern.
  const outputQtyInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "entering") {
      const t = setTimeout(() => outputQtyInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [phase]);
  useEffect(() => {
    if (autoOpenFiredRef.current) return;
    if (!fromPlanIdParam) return;
    if (!selectedItemId) return;
    if (phase !== "pick") return;
    if (itemsQuery.isLoading || itemsQuery.isError) return;
    if (!producibleItems.some((r) => r.item_id === selectedItemId)) return;
    autoOpenFiredRef.current = true;
    void handleOpen();
    // handleOpen reads selectedItemId, isAdmin, and stable setters from
    // closure — safe to omit from deps since this effect fires only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPlanIdParam, selectedItemId, phase, itemsQuery.isLoading, itemsQuery.isError, producibleItems]);

  async function handleOpen(e?: React.FormEvent): Promise<void> {
    e?.preventDefault();
    setDone(null);
    if (!selectedItemId) {
      setDone({ kind: "error", message: "Choose an item to produce." });
      return;
    }
    setPhase("submitting");
    try {
      const q = new URLSearchParams({ item_id: selectedItemId });
      // 0237 (Tranche 052) — pass the plan context so a plan-level recipe
      // override replaces the base-source lines in the snapshot and the
      // response flags customized_recipe.
      if (fromPlanId) q.set("from_plan_id", fromPlanId);
      const res = await fetch(
        `/api/production-actuals/open?${q.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      const body = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object") {
        const snap = body as ProductionActualOpenResponse;
        setSnapshot(snap);
        setOutputUom(snap.output_uom_default);
        setPreviewExpanded(snap.bom_lines.length > 0);
        setPhase("entering");
      } else {
        const detail = isAdmin
          ? body
            ? JSON.stringify(body)
            : `HTTP ${res.status}`
          : "Error details available in the system log.";
        setDone({
          kind: "error",
          message: `Could not open the production form (HTTP ${res.status}).`,
          detail,
        });
        setPhase("pick");
      }
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error opening the production form.",
        detail: isAdmin
          ? err instanceof Error
            ? err.message
            : String(err)
          : "Error details available in the system log.",
      });
      setPhase("pick");
    }
  }

  // Preview panel — multiplies bom_lines × (output + scrap) / bom_final_output.
  // Server re-explodes authoritatively; this is informational only.
  // (Declared above the submit callback so the C10 shortage gate can read it.)
  //
  // Two-head note (Tranche 4): the per-row `source` ('pack' | 'base') is
  // carried through verbatim so the rendering layer can group lines under
  // the two operator-facing sub-headings (רכיבי אריזה / רכיבי נוזל).
  //
  // Pack lines scale linearly with productionQty / bom_final_output_qty.
  //
  // Base lines must use the BASE BOM batch size (base_bom_final_output_qty)
  // as the denominator, and the effective production quantity must be
  // expressed in base-liquid units via base_qty_per_pack_unit:
  //   consumption = (final_component_qty / base_bom_final_output_qty)
  //                 × (productionQty × base_qty_per_pack_unit)
  // Example: 45 KG Sencha Tea per 1000 L base batch; each bottle uses 1 L;
  //   440 bottles → (45/1000) × (440×1) = 19.8 KG, not 19800 KG.
  const previewRows = useMemo(() => {
    if (!snapshot)
      return [] as Array<{
        component_id: string;
        component_name: string;
        consumption_preview: string;
        component_uom: string | null;
        source: "pack" | "base";
        // C10 (Tranche 050): availability columns. Null when either side
        // could not be parsed — render "—" and never block submit.
        availability: ReturnType<typeof computeAfterBalance>;
      }>;
    const productionQty = Number(outputQty || "0") + Number(scrapQty || "0");
    if (!Number.isFinite(productionQty) || productionQty <= 0) return [];
    return snapshot.bom_lines.map((bl) => {
      let consumption_preview: string;
      if (
        bl.source === "base" &&
        snapshot.base_bom_final_output_qty &&
        snapshot.base_qty_per_pack_unit
      ) {
        const baseProdQty =
          productionQty * Number(snapshot.base_qty_per_pack_unit);
        consumption_preview = stringDiv(
          bl.final_component_qty,
          snapshot.base_bom_final_output_qty,
          baseProdQty,
        );
      } else {
        consumption_preview = stringDiv(
          bl.final_component_qty,
          snapshot.bom_final_output_qty,
          productionQty,
        );
      }
      return {
        component_id: bl.component_id,
        component_name: bl.component_name,
        consumption_preview,
        component_uom: bl.component_uom,
        source: bl.source,
        availability: computeAfterBalance(bl.available_qty, consumption_preview),
      };
    });
  }, [snapshot, outputQty, scrapQty]);

  // C10 — rows that would go negative. Submit is disabled while any exist;
  // the server-side shortage gate remains authoritative.
  const shortageRows = useMemo(
    () => previewRows.filter((r) => r.availability?.short),
    [previewRows],
  );

  // C8 — does this submit need a variance reason prompt? Only when linked
  // to a live plan and the output is outside the ±2% band.
  const varianceReasonApplicable =
    linkedPlan !== null &&
    linkedPlan.rendered_state === "planned" &&
    outputQty.trim() !== "" &&
    exceedsVarianceBand(outputQty, linkedPlan.planned_qty);

  const submitProductionActual = useCallback(
    async (overrideFromPlanId: string | null): Promise<void> => {
      if (!snapshot) return;
      setDone(null);
      const outNum = Number(outputQty);
      const scrapNum = Number(scrapQty || "0");
      if (!Number.isFinite(outNum) || outNum < 0) {
        setDone({
          kind: "error",
          message: "Output quantity must be a non-negative number.",
        });
        return;
      }
      if (!Number.isFinite(scrapNum) || scrapNum < 0) {
        setDone({
          kind: "error",
          message: "Scrap quantity must be a non-negative number.",
        });
        return;
      }
      // C10 (Tranche 050) — client-side shortage gate. The server gate is
      // authoritative; this only saves the operator a doomed round-trip.
      // Also covers the Cmd/Ctrl+Enter shortcut, which bypasses the
      // disabled submit button.
      if (shortageRows.length > 0) {
        setDone({
          kind: "error",
          message: shortageRows
            .map((r) =>
              fmtShortfallMessage(
                r.component_name,
                r.availability!.after,
                r.component_uom,
              ),
            )
            .join("; "),
        });
        return;
      }
      // C8 (Tranche 050) — outside the ±2% band a structured reason is
      // strongly suggested; submitting without one requires the explicit
      // "Skip reason" affordance.
      if (
        varianceReasonApplicable &&
        !varianceReasonCode &&
        !varianceReasonSkipped
      ) {
        setVarianceReasonError(
          "Output is outside the ±2% band of the plan. Choose a variance reason below, or use “Skip reason” to submit without one.",
        );
        return;
      }
      setVarianceReasonError(null);
      const envelope: ProductionActualSubmit = {
        idempotency_key: newIdempotencyKey(),
        event_at: (Number.isNaN(new Date(eventAt).getTime()) ? new Date() : new Date(eventAt)).toISOString(),
        item_id: snapshot.item_id,
        bom_version_id_pinned: snapshot.bom_version_id_pinned,
        // Two-head pin pass-through (Tranche 4). Forward exactly what the
        // OPEN response returned — null on single-head items, an id on
        // items with a linked base BOM. Backend stores this in
        // production_actual.base_bom_version_id_pinned (Tranche 1 column)
        // and uses it for base-side STALE_BOM_VERSION detection.
        base_bom_version_id_pinned: snapshot.base_bom_version_id_pinned,
        output_qty: outNum,
        scrap_qty: scrapNum,
        output_uom: outputUom,
        notes: notes ? notes : null,
        // Send from_plan_id only when supplied; backend treats undefined and
        // null identically (both → no plan link).
        ...(overrideFromPlanId ? { from_plan_id: overrideFromPlanId } : {}),
        // C8 (Tranche 050) — structured variance reason + optional note.
        // Sent whenever the operator picked one (even back inside the band
        // after editing); omitted entirely on skip / not-applicable.
        ...(varianceReasonCode
          ? { variance_reason_code: varianceReasonCode }
          : {}),
        ...(varianceReasonCode && varianceNote.trim()
          ? { variance_note: varianceNote.trim() }
          : {}),
      };
      setPhase("submitting");
      try {
        const res = await fetch("/api/production-actuals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
        });
        const body = await res.json().catch(() => null);
        if (
          body &&
          typeof body === "object" &&
          (body as { status?: unknown }).status === "posted"
        ) {
          const committed = body as ProductionActualCommitted;
          setDone({
            kind: "success",
            message: committed.idempotent_replay
              ? "Already posted earlier — no duplicate created."
              : "Inventory has been updated.",
            committed,
            committedItemName: snapshot.item_name,
            // Tranche 041 — capture the snapshot before setSnapshot(null)
            // below, so the consumption table keeps resolving names.
            committedSnapshot: snapshot,
            // Tranche 048 (C7) — capture the linked plan row before
            // setFromPlanId(null) below clears the derived `linkedPlan`.
            committedPlan: committed.linked_plan_id ? linkedPlan : null,
          });
          // Tranche 048 (C7) — a fresh submit resets any prior re-plan state.
          setReplan({ state: "idle" });
          // Refresh the recent-runs history so the new submission appears.
          void queryClient.invalidateQueries({
            queryKey: ["production-actuals", "history"],
          });
          // Refresh the plan list so the linked plan flips to done state on
          // re-navigation back to /planning/production-plan.
          if (overrideFromPlanId) {
            void queryClient.invalidateQueries({
              queryKey: ["production-plan"],
            });
          }
          // Drop ?from_plan_id from the URL on success so a refresh after
          // submit does not re-resurrect the linked-plan banner for a plan
          // that has just been marked done. The success panel itself is
          // already populated from React state and does not need the URL
          // param. Cycle 2 wired the from_plan_id UX; this closes the
          // round-trip by cleaning the URL once the link has been
          // committed. Same cleanup runs for the retry-without-link path
          // because handleResubmitWithoutLink clears the URL before its
          // submitProductionActual(null) call, so this branch is a no-op
          // if the param was already removed.
          if (typeof window !== "undefined" && overrideFromPlanId) {
            const url = new URL(window.location.href);
            if (url.searchParams.has("from_plan_id")) {
              url.searchParams.delete("from_plan_id");
              router.replace(url.pathname + (url.search || ""), {
                scroll: false,
              });
            }
          }
          // Drop the React-state link too so the post-submit panel reads
          // from `done.committed.linked_plan_id` rather than `fromPlanId`,
          // which is intended for the pre-submit banner only.
          setFromPlanId(null);
          // Clear inputs but keep the success panel.
          setSnapshot(null);
          setOutputQty("");
          setScrapQty("0");
          setOutputUom("");
          setNotes("");
          setSelectedItemId("");
          setPhase("done");
          setEventAt(nowLocalDateTime());
          setPreviewExpanded(false);
          // C8 — a fresh form starts with a clean variance-reason slate.
          setVarianceReasonCode("");
          setVarianceNote("");
          setVarianceReasonSkipped(false);
          setVarianceReasonError(null);
          return;
        }
        // 409 INSUFFICIENT_STOCK — generic shape (legacy, not in the new
        // ProductionActualConflictReason enum but still possible from the
        // BOM-explosion path).
        if (
          res.status === 409 &&
          body &&
          typeof body === "object" &&
          (body as { error?: unknown }).error === "INSUFFICIENT_STOCK"
        ) {
          const insuffBody = body as {
            error: string;
            message?: string;
            shortfalls?: Array<{
              component_id: string;
              // C10 (Tranche 050): the backend now denormalizes the
              // component name onto each shortfall row.
              component_name?: string | null;
              required_qty: string | number;
              available_qty: string | number;
            }>;
          };
          // Tranche 041 — never surface raw component_id UUIDs to the
          // operator. Tranche 050 (C10): prefer the response's own
          // component_name; fall back to the in-state BOM snapshot; if any
          // shortfall still can't be resolved, fall back to the API's
          // message string, then to a generic plain-English line.
          const nameByComponentId = new Map<string, string>();
          for (const bl of snapshot.bom_lines) {
            nameByComponentId.set(bl.component_id, bl.component_name);
          }
          const shortfalls = insuffBody.shortfalls ?? [];
          const resolvedLines = shortfalls.map((s) => {
            const name =
              (s.component_name && s.component_name.trim()) ||
              nameByComponentId.get(s.component_id);
            return name
              ? `${name}: need ${fmtNumStr(s.required_qty)}, have ${fmtNumStr(s.available_qty)}`
              : null;
          });
          const allResolved =
            resolvedLines.length > 0 &&
            resolvedLines.every((l): l is string => l !== null);
          const insuffMessage = allResolved
            ? `Insufficient stock: ${resolvedLines.join("; ")}`
            : insuffBody.message ||
              "One or more components are short — check component stock before posting.";
          setDone({
            kind: "error",
            message: insuffMessage,
          });
          setPhase("entering");
          return;
        }
        // 409 conflicts (other reason_codes)
        if (
          res.status === 409 &&
          body &&
          typeof body === "object" &&
          typeof (body as { reason_code?: unknown }).reason_code === "string"
        ) {
          const reason = (body as { reason_code: string; detail?: string })
            .reason_code;
          const detail = (body as { detail?: string }).detail ?? reason;
          const adminDetail = isAdmin
            ? detail
            : "Error details available in the system log.";
          if (reason === "STALE_BOM_VERSION") {
            setDone({
              kind: "stale",
              message: reasonCodeLabel(reason),
              detail: adminDetail,
            });
            setPhase("entering");
            return;
          }
          if (reason === "WRONG_SUPPLY_METHOD") {
            setDone({
              kind: "error",
              message: reasonCodeLabel(reason),
              detail: adminDetail,
            });
            setPhase("pick");
            return;
          }
          // Plan-conflict codes carry a special UX with retry buttons.
          if (
            reason === "PLAN_NOT_FOUND" ||
            reason === "PLAN_ITEM_MISMATCH" ||
            reason === "PLAN_ALREADY_COMPLETED" ||
            reason === "PLAN_CANCELLED"
          ) {
            setDone({
              kind: "error",
              message: reasonCodeLabel(reason),
              detail: adminDetail,
              planConflict: reason,
            });
            setPhase("entering");
            return;
          }
          setDone({
            kind: "error",
            message: reasonCodeLabel(reason),
            detail: adminDetail,
          });
          setPhase("entering");
          return;
        }
        // 503 break-glass
        if (res.status === 503) {
          setDone({
            kind: "error",
            message:
              "Break-glass active — platform writes are temporarily paused.",
            detail: isAdmin
              ? body
                ? JSON.stringify(body)
                : "HTTP 503"
              : "Error details available in the system log.",
          });
          setPhase("entering");
          return;
        }
        // 401/403
        if (res.status === 401 || res.status === 403) {
          setDone({
            kind: "error",
            message:
              res.status === 401
                ? "Not authenticated. Please sign in again."
                : "Not authorized. Operator, planner, or admin role is required to submit.",
            detail: isAdmin
              ? body
                ? JSON.stringify(body)
                : `HTTP ${res.status}`
              : "Error details available in the system log.",
          });
          setPhase("entering");
          return;
        }
        // Fallback
        const detail = isAdmin
          ? body
            ? JSON.stringify(body)
            : `HTTP ${res.status}`
          : "Error details available in the system log.";
        setDone({
          kind: "error",
          message: "Could not submit. Check your connection and try again.",
          detail,
        });
        setPhase("entering");
      } catch (err) {
        setDone({
          kind: "error",
          message: "Network error submitting the production report.",
          detail: isAdmin
            ? err instanceof Error
              ? err.message
              : String(err)
            : "Error details available in the system log.",
        });
        setPhase("entering");
      }
    },
    [
      snapshot,
      outputQty,
      scrapQty,
      outputUom,
      notes,
      eventAt,
      isAdmin,
      queryClient,
      router,
      // Tranche 048 (C7) — keep the captured committedPlan in sync with the
      // plan row visible at submit time.
      linkedPlan,
      // Tranche 050 — C10 shortage gate + C8 variance reason.
      shortageRows,
      varianceReasonApplicable,
      varianceReasonCode,
      varianceNote,
      varianceReasonSkipped,
    ],
  );

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    void submitProductionActual(fromPlanId);
  }

  // "Submit without linking" — clears fromPlanId state AND drops the URL
  // param so a subsequent navigation does not re-resurrect the link.
  async function handleResubmitWithoutLink(): Promise<void> {
    setFromPlanId(null);
    // Drop ?from_plan_id from the URL while preserving everything else.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("from_plan_id");
      router.replace(url.pathname + (url.search || ""));
    }
    // 0237 (Tranche 052) — if the snapshot was opened WITH a plan whose
    // recipe is improvised, its base-source lines ARE the override. A submit
    // without the link consumes per the STANDARD recipe, so submitting
    // against this snapshot would contradict the preview. Re-open without
    // the plan context and let the operator review before submitting again.
    if (snapshot?.customized_recipe) {
      try {
        const q = new URLSearchParams({ item_id: snapshot.item_id });
        const res = await fetch(`/api/production-actuals/open?${q.toString()}`, {
          headers: { Accept: "application/json" },
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body && typeof body === "object") {
          setSnapshot(body as ProductionActualOpenResponse);
        }
      } catch {
        // Keep the prior snapshot — the server-side explosion stays
        // authoritative either way; only the preview is affected.
      }
      setDone({
        kind: "error",
        message:
          "Plan link removed. Without the plan, this run consumes per the STANDARD recipe — review the updated preview and submit again.",
      });
      setPhase("entering");
      return;
    }
    void submitProductionActual(null);
  }

  function resetFlow(): void {
    setSnapshot(null);
    setOutputQty("");
    setScrapQty("0");
    setOutputUom("");
    setNotes("");
    setSelectedItemId("");
    setItemSearch("");
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setPreviewExpanded(false);
    setReplan({ state: "idle" });
    // Tranche 050 (C8)
    setVarianceReasonCode("");
    setVarianceNote("");
    setVarianceReasonSkipped(false);
    setVarianceReasonError(null);
  }

  // ---------------------------------------------------------------------------
  // Tranche 048 (C7 Tier 1) — re-plan the under-produced remainder for
  // tomorrow. POSTs a new production_plan row through the same endpoint and
  // body shape the plan board's ManualAddModal uses
  // (POST /api/production-plan, see production-plan/_lib/usePlans.ts
  // useCreatePlan), with a note linking back to the original plan + report.
  // Plans never write stock — this only adds a row to the board.
  // ---------------------------------------------------------------------------
  function computeReplanRemainder(d: DoneState): number | null {
    if (!d.committed || !d.committedPlan) return null;
    const planned = Number(d.committedPlan.planned_qty);
    const output = Number(d.committed.output_qty);
    if (!Number.isFinite(planned) || !Number.isFinite(output)) return null;
    // Round away float dust; quantities are 4dp at most in the preview math.
    const remainder = Math.round((planned - output) * 1e4) / 1e4;
    return remainder > 0 ? remainder : null;
  }

  async function handleReplanRemainder(): Promise<void> {
    if (!done?.committed || !done.committedPlan) return;
    const remainder = computeReplanRemainder(done);
    if (remainder === null) return;
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const tomorrow = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    setReplan({ state: "pending" });
    try {
      const res = await fetch("/api/production-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: newIdempotencyKey(),
          plan_type: "production",
          plan_date: tomorrow,
          item_id: done.committed.item_id,
          planned_qty: remainder,
          uom: done.committedPlan.uom ?? done.committed.output_uom,
          notes: `Re-planned remainder of plan ${done.committed.linked_plan_id} (production report ${done.committed.submission_id}).`,
        }),
      });
      if (!res.ok) {
        const message =
          res.status === 403
            ? "You don't have permission to add plans (planner or admin role required)."
            : res.status === 422
              ? "The plan data was rejected. Add the remainder manually on the plan board."
              : res.status === 503
                ? "The system is locked right now. Try again later."
                : `Could not add the plan (HTTP ${res.status}).`;
        setReplan({ state: "error", message });
        return;
      }
      // Refresh the board so the new row shows on next navigation.
      void queryClient.invalidateQueries({ queryKey: ["production-plan"] });
      setReplan({ state: "success", plannedForDate: tomorrow });
    } catch {
      setReplan({
        state: "error",
        message: "Network error adding the plan. Check your connection and try again.",
      });
    }
  }

  function restartFromStep1(): void {
    // Same as reset but leave the 'done' banner visible (used after
    // STALE_BOM_VERSION so the operator sees why they're restarting).
    setSnapshot(null);
    setOutputQty("");
    setScrapQty("0");
    setOutputUom("");
    setNotes("");
    setSelectedItemId("");
    setItemSearch("");
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setPreviewExpanded(false);
    // Tranche 050 (C8)
    setVarianceReasonCode("");
    setVarianceNote("");
    setVarianceReasonSkipped(false);
    setVarianceReasonError(null);
  }

  // Split the preview rows into pack vs base groups for the two-head
  // rendering. Memoised so React only recomputes when the underlying
  // previewRows list changes. When the item has no linked base BOM the
  // baseRows list will be empty and the rendering layer hides the
  // "רכיבי נוזל" sub-heading entirely.
  const previewRowsByGroup = useMemo(() => {
    const pack = previewRows.filter((r) => r.source === "pack");
    const base = previewRows.filter((r) => r.source === "base");
    return { pack, base };
  }, [previewRows]);

  // Plan-link banner state derived from the live plan query. This is the
  // small chip at the top of the form that confirms "you are reporting
  // production against plan X for item Y on date Z".
  const planLoadFailed =
    Boolean(fromPlanId) &&
    !planQuery.isLoading &&
    (planQuery.isError || (!linkedPlan && (planQuery.data?.rows ?? []).length >= 0 && !planQuery.isLoading));

  // Derived selected item row for the selected-item card display.
  const selectedItem = useMemo<ItemRow | null>(
    () => producibleItems.find((r) => r.item_id === selectedItemId) ?? null,
    [producibleItems, selectedItemId],
  );

  // Live "Total processed" calculation.
  const totalProcessed = useMemo(() => {
    const out = Number(outputQty || "0");
    const scrap = Number(scrapQty || "0");
    if (!Number.isFinite(out) || !Number.isFinite(scrap)) return null;
    return out + scrap;
  }, [outputQty, scrapQty]);

  // ---------------------------------------------------------------------------
  // Tranche 048 (C6) — one-tap "exactly as planned" fast path. Shown only
  // when the form was opened from a plan card (?from_plan_id=), the plan is
  // live, and the quantity fields are untouched (output still equals the
  // plan's suggested quantity, no scrap). Editing the quantity hides the
  // panel; the full form below always remains available.
  // ---------------------------------------------------------------------------
  const oneTapEligible =
    Boolean(fromPlanId) &&
    linkedPlan !== null &&
    linkedPlan.rendered_state === "planned" &&
    snapshot !== null &&
    canSubmit &&
    outputQty.trim() !== "" &&
    Number(outputQty) === Number(linkedPlan.planned_qty) &&
    Number(scrapQty || "0") === 0;

  // Stepper helpers.
  function stepNum(
    value: string,
    delta: number,
    setter: (v: string) => void,
  ): void {
    const current = Number(value || "0");
    const next = Math.max(0, current + delta);
    setter(Number.isInteger(next) ? String(next) : next.toFixed(2));
  }

  // Tranche 050 (B2) — ?submission_id= renders the read-only committed
  // report instead of the form. Placed after every hook above so the hook
  // order stays stable across the two render modes.
  if (submissionIdParam) {
    return <SubmissionDetailView submissionId={submissionIdParam} />;
  }

  return (
    <div dir="ltr">
      <WorkflowHeader
        size="section"
        eyebrow="Operator form"
        title="Production Report"
        description="Report output and any scrap. Component consumption is computed from the active BOM."
      />

      {/* ======================================================================
          Plan-link banner — only when ?from_plan_id= was supplied.
          ====================================================================== */}
      {fromPlanId ? (
        <div
          className="mb-4 rounded-md border border-info/40 bg-info-softer px-4 py-3 text-sm text-info-fg"
          role="status"
          data-testid="production-actual-from-plan-banner"
        >
          {planQuery.isLoading ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">Linked to a production plan</span>
              <span className="text-xs opacity-80">— loading plan details…</span>
            </div>
          ) : linkedPlan ? (
            <div>
              <div className="flex flex-wrap items-start gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide opacity-70">
                    Plan date
                  </div>
                  <div className="mt-0.5 text-base font-semibold">
                    {fmtPlanDate(linkedPlan.plan_date)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide opacity-70">
                    Target
                  </div>
                  <div className="mt-0.5 text-base font-mono font-bold tabular-nums">
                    {fmtNumStr(linkedPlan.planned_qty)}{" "}
                    <span className="text-sm font-normal">{linkedPlan.uom}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide opacity-70">
                    Item
                  </div>
                  <div className="mt-0.5 font-medium">
                    {linkedPlan.item_name ?? linkedPlan.item_id}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="opacity-80">
                  Progress: target{" "}
                  <span className="font-mono tabular-nums font-semibold">
                    {fmtNumStr(linkedPlan.planned_qty)} {linkedPlan.uom}
                  </span>
                </span>
                <Link
                  href="/planning/production-plan"
                  className="btn btn-ghost btn-sm"
                >
                  View on the daily plan board
                </Link>
              </div>
              {linkedPlan.rendered_state === "done" ? (
                <div className="mt-1 text-xs">
                  This plan is already marked as completed. A new submission
                  would not link to it.
                </div>
              ) : null}
              {linkedPlan.rendered_state === "cancelled" ? (
                <div className="mt-1 text-xs">
                  This plan was cancelled. A new submission would not link to it.
                </div>
              ) : null}
            </div>
          ) : planLoadFailed ? (
            <div>
              <div className="font-medium">
                Linked plan not found
              </div>
              <div className="mt-1 text-xs opacity-90">
                Plan id {fromPlanId} was not visible in the current window. You
                can submit without linking, or
                {" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:no-underline"
                  onClick={() => void planQuery.refetch()}
                >
                  retry the lookup
                </button>
                .
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Production-recommendation breadcrumb — appears only when the form
          was opened via deep-link from a planning recommendation. */}
      {fromRecId || fromRunId ? (
        <div
          className="mb-4 flex flex-wrap items-start gap-2 rounded-md border border-info/40 bg-info-softer px-4 py-3 text-sm text-info-fg"
          role="status"
          data-testid="production-actual-from-rec-banner"
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              Reporting against a planning recommendation
            </div>
            <div className="mt-1 text-xs opacity-90">
              The form was opened from a production recommendation. The
              suggested quantity has been pre-filled; you can adjust before
              submitting.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fromRecId && fromRunId ? (
              <Link
                href={`/planning/runs/${encodeURIComponent(fromRunId)}/recommendations/${encodeURIComponent(fromRecId)}`}
                className="text-xs font-medium underline underline-offset-2 hover:no-underline"
                data-testid="production-actual-from-rec-link"
              >
                Back to the recommendation →
              </Link>
            ) : null}
            {fromRunId ? (
              <Link
                href={`/planning/runs/${encodeURIComponent(fromRunId)}`}
                className="text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                Open the planning run →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Item prefill rejection banner — shows when ?item_id= in URL pointed
          to a non-producible item (e.g. BOUGHT_FINISHED) or unknown id. */}
      {prefillRejected ? (
        <div
          className="mb-4 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="alert"
          data-testid="production-actual-prefill-rejected"
        >
          {prefillRejected}
        </div>
      ) : null}

      {!canSubmit ? (
        <div
          className="mb-4 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="status"
        >
          <div className="font-medium">Read-only view.</div>
          <div className="mt-1 text-xs opacity-80">
            You can view the form and BOM preview, but operators, planners, and
            admins submit production reports. Your current role is{" "}
            <span className="font-semibold">{session.role}</span>.{" "}
            <span className="opacity-70">
              Contact your administrator if you need to report production.
            </span>
          </div>
        </div>
      ) : null}

      {done ? (
        <div
          className={cn(
            "mb-4 rounded-md border px-4 py-3 text-sm",
            done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : done.kind === "stale"
                ? "border-warning/40 bg-warning-softer text-warning-fg"
                : "border-danger/40 bg-danger-softer text-danger-fg",
          )}
          role="status"
        >
          <div className="font-medium">{done.message}</div>

          {/* Success-panel detail — show what was posted, plus contextual
              follow-up links. */}
          {done.kind === "success" && done.committed ? (
            <div className="mt-3 space-y-3 text-xs">
              {/* Large output qty display */}
              <div className="flex flex-wrap items-baseline gap-3">
                <div>
                  <div className="text-xs uppercase opacity-70">Output</div>
                  <div className="mt-0.5 font-mono text-3xl font-bold tabular-nums">
                    {fmtNumStr(done.committed.output_qty)}
                    <span className="ml-1 text-base font-normal">
                      {done.committed.output_uom}
                    </span>
                  </div>
                </div>
                {Number(done.committed.scrap_qty) > 0 ? (
                  <div>
                    <div className="text-xs uppercase opacity-70">Scrap</div>
                    <div className="mt-0.5 font-mono text-lg tabular-nums">
                      {fmtNumStr(done.committed.scrap_qty)}
                      <span className="ml-1 text-sm font-normal">
                        {done.committed.output_uom}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Consumption breakdown table — resolves component_id back
                  to component_name + source (pack/base) using the snapshot's
                  bom_lines that drove the explosion. Tranche 041 — reads
                  done.committedSnapshot (captured at commit time) because
                  the live snapshot is cleared before this panel renders. */}
              {done.committed.consumption.length > 0 ? (() => {
                const bomLookup = new Map<
                  string,
                  { name: string; source: "pack" | "base" }
                >();
                const lookupSnapshot = done.committedSnapshot ?? snapshot;
                if (lookupSnapshot) {
                  for (const bl of lookupSnapshot.bom_lines) {
                    // Pack and base may share a component_id in principle;
                    // last write wins for the name (they'd be the same), and
                    // the source is taken from the consumed row itself below.
                    bomLookup.set(bl.component_id, {
                      name: bl.component_name,
                      source: bl.source,
                    });
                  }
                }
                return (
                  <div className="overflow-x-auto rounded border border-success/20 bg-success-softer/20">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-success/20">
                          <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-wide opacity-70">
                            Component
                          </th>
                          <th className="px-3 py-1.5 text-right text-3xs font-semibold uppercase tracking-wide opacity-70">
                            Consumed
                          </th>
                          <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-wide opacity-70">
                            Unit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {done.committed.consumption.map((c) => {
                          const info = bomLookup.get(c.component_id);
                          const source = info?.source;
                          return (
                            <tr
                              key={c.stock_ledger_movement_id}
                              className="border-b border-success/10 last:border-b-0"
                            >
                              <td className="px-3 py-1.5 text-3xs">
                                {info?.name ? (
                                  <span className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="font-medium">{info.name}</span>
                                    {source ? (
                                      <span className="rounded-sm border border-success/30 px-1 py-px text-[10px] uppercase tracking-wide opacity-70">
                                        {source}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="font-mono opacity-80">
                                    {c.component_id}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                {fmtNumStr(c.consumption_qty)}
                              </td>
                              <td className="px-3 py-1.5 opacity-70">
                                {c.component_uom ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {/* Scrap-vs-RM clarification (GAP-011 operator-training
                        note). Tranche 041 copy-truth fix (decision T1): the
                        backend explodes the BOM over output + scrap, so RM
                        consumption covers scrapped units too. */}
                    {Number(done.committed.scrap_qty) > 0 ? (
                      <div className="border-t border-success/20 px-3 py-2 text-3xs opacity-75">
                        Scrap reduced finished-goods output only.
                        Raw-material consumption is computed from output +
                        scrap ({fmtNumStr(done.committed.output_qty)} good +{" "}
                        {fmtNumStr(done.committed.scrap_qty)} scrap ={" "}
                        {fmtNumStr(
                          (
                            Number(done.committed.output_qty) +
                            Number(done.committed.scrap_qty)
                          ).toFixed(4),
                        )}{" "}
                        processed).
                      </div>
                    ) : null}
                  </div>
                );
              })() : (
                <div className="opacity-70">
                  No components consumed.
                </div>
              )}

              {done.committed.linked_plan_id ? (() => {
                // Tranche 048 — fromPlanId is cleared on success, so the
                // derived `linkedPlan` is null here; read the commit-time
                // capture instead (with the live row as a fallback).
                const plan = done.committedPlan ?? linkedPlan;
                return (
                  <div>
                    Linked plan:{" "}
                    <span className="font-mono">
                      {done.committed.linked_plan_id}
                    </span>
                    {plan ? (
                      <span className="text-fg-muted">
                        {" "}· {fmtPlanDate(plan.plan_date)} ·{" "}
                        {plan.item_name ?? plan.item_id}
                      </span>
                    ) : null}
                  </div>
                );
              })() : null}

              {/* W4 contract §4.1 — variance row on confirmation panel.
                  Shown only when the submission was linked to a plan AND
                  the form still has the linked plan in state (carries
                  planned_qty + uom). On no-link submits (§4.1.1) the
                  variance row is omitted entirely. */}
              {done.committed.linked_plan_id && (done.committedPlan ?? linkedPlan) ? (
                (() => {
                  // Tranche 048 — read the commit-time plan capture; the
                  // derived `linkedPlan` is already null at this point
                  // because the success path clears fromPlanId.
                  const plan = (done.committedPlan ?? linkedPlan)!;
                  const v = computeVariance(
                    done.committed.output_qty,
                    plan.planned_qty,
                  );
                  const isOnTarget = v.variance_sign === "on_target";
                  const borderColor =
                    v.variance_sign === "on_target"
                      ? "border-l-success"
                      : v.variance_sign === "over"
                        ? "border-l-warning"
                        : "border-l-warning";
                  return (
                    <div
                      className={cn(
                        "mt-2 rounded border border-l-4 px-3 py-2",
                        borderColor,
                        isOnTarget
                          ? "border-success/30 bg-success-softer/30"
                          : "border-warning/40 bg-warning-softer/30",
                      )}
                      data-testid="production-actual-variance"
                      data-variance-sign={v.variance_sign}
                    >
                      <div
                        className="flex flex-wrap items-center gap-x-3 gap-y-1"
                        title={VARIANCE_DISCLAIMER}
                      >
                        <span>
                          Plan:{" "}
                          <span className="font-mono tabular-nums">
                            {fmtNumStr(plan.planned_qty)} {plan.uom}
                          </span>
                        </span>
                        <span>
                          Output:{" "}
                          <span className="font-mono tabular-nums">
                            {fmtNumStr(done.committed.output_qty)}{" "}
                            {done.committed.output_uom}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums">
                          Variance:{" "}
                          <span
                            className={
                              isOnTarget ? "text-success-fg" : "text-warning-fg"
                            }
                          >
                            {fmtVarianceQty(v.variance_qty)}{" "}
                            {done.committed.output_uom}
                            {" "}
                            ({fmtVariancePct(v.variance_pct)})
                          </span>
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-semibold uppercase",
                            isOnTarget
                              ? "bg-success-softer text-success-fg"
                              : "bg-warning-softer text-warning-fg",
                          )}
                        >
                          <span aria-hidden>
                            {VARIANCE_SIGN_ICON[v.variance_sign]}
                          </span>
                          {VARIANCE_SIGN_LABEL[v.variance_sign]}
                        </span>
                      </div>
                      <div className="mt-1 text-3xs opacity-75">
                        {VARIANCE_DISCLAIMER}
                      </div>
                    </div>
                  );
                })()
              ) : null}

              {/* Tranche 048 (C7 Tier 1) — when a plan-linked report came in
                  under plan beyond the on-target band (±2%), offer to
                  re-plan the remainder for tomorrow. Creates a new plan row
                  only; stock is unaffected. */}
              {done.committed.linked_plan_id &&
              done.committedPlan &&
              computeVariance(
                done.committed.output_qty,
                done.committedPlan.planned_qty,
              ).variance_sign === "under" &&
              computeReplanRemainder(done) !== null ? (() => {
                const remainder = computeReplanRemainder(done)!;
                const remUom =
                  done.committedPlan!.uom ?? done.committed!.output_uom;
                return (
                  <div
                    className="mt-2 rounded border border-warning/40 bg-warning-softer/30 px-3 py-2"
                    data-testid="production-actual-replan-remainder"
                  >
                    {replan.state === "success" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-success-fg">
                          Remainder of{" "}
                          <span className="font-mono tabular-nums">
                            {fmtNumStr(String(remainder))} {remUom}
                          </span>{" "}
                          planned for tomorrow
                          {replan.plannedForDate
                            ? ` (${fmtPlanDate(replan.plannedForDate)})`
                            : ""}
                          .
                        </span>
                        <Link
                          href="/planning/production-plan"
                          className="text-xs font-medium underline underline-offset-2 hover:no-underline"
                        >
                          View on the daily plan board
                        </Link>
                      </div>
                    ) : (
                      <>
                        <div>
                          Output came in{" "}
                          <span className="font-mono tabular-nums">
                            {fmtNumStr(String(remainder))} {remUom}
                          </span>{" "}
                          under plan. You can put the remainder back on
                          tomorrow&apos;s board.
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={replan.state === "pending"}
                            onClick={() => void handleReplanRemainder()}
                            data-testid="production-actual-replan-button"
                          >
                            {replan.state === "pending"
                              ? "Planning…"
                              : `Re-plan remainder (${fmtNumStr(String(remainder))} ${remUom} for tomorrow)`}
                          </button>
                          {replan.state === "error" && replan.message ? (
                            <span
                              className="text-3xs text-danger-fg"
                              role="alert"
                              data-testid="production-actual-replan-error"
                            >
                              {replan.message}
                            </span>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                );
              })() : null}

              <div className="font-mono text-3xs opacity-80">
                ref: {done.committed.submission_id}
              </div>
            </div>
          ) : null}

          {done.detail ? (
            <div className="mt-1 font-mono text-xs opacity-80">
              {done.detail}
            </div>
          ) : null}

          {/* STALE_BOM_VERSION restart action */}
          {done.kind === "stale" ? (
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={restartFromStep1}
              >
                Reopen the form
              </button>
            </div>
          ) : null}

          {/* Plan-conflict retry actions — surface a single "Submit without
              linking" button on PLAN_NOT_FOUND / PLAN_CANCELLED, and a
              navigation link on PLAN_ALREADY_COMPLETED. PLAN_ITEM_MISMATCH
              is admin-only because letting an operator override item
              identity is dangerous; non-admins see the message but no
              override button. */}
          {done.planConflict === "PLAN_NOT_FOUND" ||
          done.planConflict === "PLAN_CANCELLED" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleResubmitWithoutLink()}
                data-testid="production-actual-submit-without-link"
              >
                Submit without linking
              </button>
              <span className="text-xs opacity-80">
                Re-sends the report without the plan link. The plan will not
                be marked complete.
              </span>
            </div>
          ) : null}

          {done.planConflict === "PLAN_ALREADY_COMPLETED" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/planning/production-plan"
                className="btn btn-sm"
                data-testid="production-actual-view-existing-plan"
              >
                View the daily plan board
              </Link>
              <span className="text-xs opacity-80">
                Another submission already completed this plan.
              </span>
            </div>
          ) : null}

          {done.planConflict === "PLAN_ITEM_MISMATCH" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {isAdmin ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handleResubmitWithoutLink()}
                  data-testid="production-actual-admin-submit-anyway"
                >
                  Submit anyway, without linking
                </button>
              ) : null}
              <Link
                href="/planning/production-plan"
                className="text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                Open the daily plan board to switch plans
              </Link>
            </div>
          ) : null}

          {/* Generic submit-error retry — non-conflict, non-stale failures
              otherwise leave the operator with only a message line. */}
          {done.kind === "error" && !done.planConflict ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void submitProductionActual(fromPlanId)}
                data-testid="production-actual-error-retry"
              >
                Retry
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setDone(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {/* Success-panel follow-up links */}
          {done.kind === "success" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {done.committed?.linked_plan_id ? (
                <Link
                  href="/planning/production-plan"
                  className="btn btn-sm gap-1.5"
                  data-testid="production-actual-success-back-to-plan"
                >
                  ← Back to the daily plan
                </Link>
              ) : null}
              {done.committed?.item_id ? (
                <Link
                  href={`/planning/inventory-flow/${encodeURIComponent(done.committed.item_id)}`}
                  className="btn btn-sm gap-1.5"
                  data-testid="production-actual-success-inventory-flow"
                >
                  Open inventory flow
                </Link>
              ) : null}
              {/* Cycle 12 Part B fix: link to the canonical movement-log
                  surface so the operator can verify the production_output +
                  production_consumption ledger rows posted as expected.
                  Closes W4 cycle-10 acceptance contract §9 PAR-3 (suggested
                  addition; supports rehearsal step 24 — "View posted ledger
                  movement →"). Movement-log displays the most recent rows
                  at the top by default, so the just-posted submission is
                  immediately visible. URL deep-link filter prefill on
                  movement-log is out of this tranche's surface scope and
                  can land in a follow-up. */}
              <Link
                href="/stock/movement-log"
                className="btn btn-sm gap-1.5"
                data-testid="production-actual-success-movement-log"
              >
                View posted ledger →
              </Link>
              {fromRunId ? (
                <Link
                  href={`/planning/runs/${encodeURIComponent(fromRunId)}?tab=production`}
                  className="btn btn-sm gap-1.5"
                  data-testid="production-actual-success-back-to-run"
                >
                  Back to the planning run
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setDone(null);
                  resetFlow();
                }}
                data-testid="production-actual-success-new-report"
              >
                Report another
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ======================================================================
          Form body. Loading / error / pick / entering states are mutually
          exclusive; once the form is in `done` the user sees only the
          success/error panel above plus the recent-runs section below.
          ====================================================================== */}
      {phase === "done" ? null : isLoadingItems ? (
        <SectionCard title="Loading items…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        </SectionCard>
      ) : itemsLoadErr ? (
        <SectionCard title="Could not load items">
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
            <div className="font-semibold">Could not load items</div>
            <div className="mt-1 text-xs">
              {(itemsLoadErr as Error).message}
            </div>
            <button
              type="button"
              onClick={() => void itemsQuery.refetch()}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </SectionCard>
      ) : phase === "pick" ? (
        <div data-testid="production-actual-step-1">
          {/* Step indicator */}
          <StepIndicator phase={phase} />

          <form onSubmit={handleOpen} className="space-y-5 pb-20">
            <SectionCard
              title="Step 1 — Pick the item being produced"
              description="Only manufactured or repacked items appear. If the BOM changes after you open the form, reopen before submitting."
            >
              <div className="grid grid-cols-1 gap-4">
                {/* Searchable combobox */}
                <div>
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Item *
                  </span>
                  <div className="relative" ref={comboboxRef}>
                    <input
                      ref={comboboxInputRef}
                      type="text"
                      className="input"
                      placeholder="Search by name or SKU…"
                      value={itemSearch}
                      data-testid="production-actual-item-combobox"
                      onChange={(e) => {
                        setItemSearch(e.target.value);
                        setComboboxOpen(true);
                        // Clear selected item if the user starts typing something new.
                        if (selectedItemId) setSelectedItemId("");
                      }}
                      onFocus={() => setComboboxOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setComboboxOpen(false);
                      }}
                      autoComplete="off"
                    />
                    {comboboxOpen && dropdownRect && filteredItems.length > 0 ? (
                      <div
                        ref={dropdownListRef}
                        style={{
                          position: "fixed",
                          top: dropdownRect.top,
                          left: dropdownRect.left,
                          width: dropdownRect.width,
                          maxHeight: dropdownRect.maxHeight,
                          zIndex: 9999,
                        }}
                        className="overflow-y-auto rounded-md border border-border bg-bg shadow-xl"
                      >
                        {filteredManufactured.length > 0 ? (
                          <div>
                            <div className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle bg-bg-subtle/60 border-b border-border/40">
                              Manufactured ({filteredManufactured.length})
                            </div>
                            {filteredManufactured.map((r) => (
                              <button
                                key={r.item_id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-bg-subtle/60 transition-colors",
                                  selectedItemId === r.item_id && "bg-accent/10",
                                )}
                                onClick={() => {
                                  setSelectedItemId(r.item_id);
                                  setItemSearch(r.item_name);
                                  setComboboxOpen(false);
                                }}
                              >
                                <span className="font-medium text-fg">
                                  {r.item_name}
                                </span>
                                {r.sku ? (
                                  <span className="ml-2 font-mono text-xs text-fg-muted">
                                    {r.sku}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {filteredRepack.length > 0 ? (
                          <div>
                            <div className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle bg-bg-subtle/60 border-b border-border/40">
                              Repack ({filteredRepack.length})
                            </div>
                            {filteredRepack.map((r) => (
                              <button
                                key={r.item_id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-bg-subtle/60 transition-colors",
                                  selectedItemId === r.item_id && "bg-accent/10",
                                )}
                                onClick={() => {
                                  setSelectedItemId(r.item_id);
                                  setItemSearch(r.item_name);
                                  setComboboxOpen(false);
                                }}
                              >
                                <span className="font-medium text-fg">
                                  {r.item_name}
                                </span>
                                {r.sku ? (
                                  <span className="ml-2 font-mono text-xs text-fg-muted">
                                    {r.sku}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : comboboxOpen && dropdownRect && itemSearch && filteredItems.length === 0 ? (
                      <div
                        ref={dropdownListRef}
                        style={{
                          position: "fixed",
                          top: dropdownRect.top,
                          left: dropdownRect.left,
                          width: dropdownRect.width,
                          zIndex: 9999,
                        }}
                        className="rounded-md border border-border bg-bg shadow-xl"
                      >
                        <div className="px-3 py-3 text-sm text-fg-muted">
                          No items match &ldquo;{itemSearch}&rdquo;
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Selected item card */}
                {selectedItem ? (
                  <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-fg leading-tight">
                          {selectedItem.item_name}
                        </div>
                        {selectedItem.sku ? (
                          <div className="mt-0.5 font-mono text-xs text-fg-muted">
                            SKU: {selectedItem.sku}
                          </div>
                        ) : null}
                      </div>
                      <span className="chip chip-info shrink-0 text-3xs">
                        {supplyMethodLabel(selectedItem.supply_method)}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Item count hint */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-semibold text-fg">
                    {producibleItems.length} producible items
                  </span>
                  <span className="text-fg-muted">·</span>
                  <span className="text-fg-muted">
                    {producibleItems.filter((r) => r.supply_method === "MANUFACTURED").length} manufactured
                  </span>
                  <span className="text-fg-muted">·</span>
                  <span className="text-fg-muted">
                    {producibleItems.filter((r) => r.supply_method === "REPACK").length} repack
                  </span>
                </div>
              </div>
            </SectionCard>
            <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-bg-raised/95 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
              <button
                type="submit"
                className="btn btn-lg btn-primary"
                disabled={!selectedItemId}
              >
                Open production form →
              </button>
            </div>
          </form>
        </div>
      ) : phase === "entering" || phase === "submitting" ? (
        <div data-testid="production-actual-step-2">
          {/* Step indicator */}
          <StepIndicator phase={phase} />

          {/* Tranche 048 (C6) — one-tap confirm fast path. Same submit path
              as the form's submit button (submitProductionActual with the
              live plan link); the full form below stays available for
              adjustments. */}
          {oneTapEligible && linkedPlan ? (
            <div
              className="mb-5 rounded-lg border-2 border-accent/50 bg-accent/5 p-4 sm:p-5"
              data-testid="production-actual-one-tap-panel"
            >
              <div className="text-base font-semibold text-fg-strong">
                Confirm: produced{" "}
                <span className="font-mono tabular-nums">
                  {fmtNumStr(linkedPlan.planned_qty)}
                </span>{" "}
                {linkedPlan.uom} exactly as planned
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                One tap posts the production report with the planned quantity
                and no scrap. Need to adjust? Use the full form below — the
                fast path disappears once you change the quantity.
              </p>
              <button
                type="button"
                className="btn btn-lg btn-primary mt-3 w-full sm:w-auto"
                disabled={phase === "submitting" || shortageRows.length > 0}
                onClick={() => void submitProductionActual(fromPlanId)}
                data-testid="production-actual-one-tap-confirm"
                title={
                  shortageRows.length > 0
                    ? fmtShortfallMessage(
                        shortageRows[0].component_name,
                        shortageRows[0].availability!.after,
                        shortageRows[0].component_uom,
                      )
                    : undefined
                }
              >
                {phase === "submitting"
                  ? "Submitting…"
                  : `Confirm — produced ${fmtNumStr(linkedPlan.planned_qty)} ${linkedPlan.uom}`}
              </button>
              {/* C10 — the fast path is blocked by the same shortage gate
                  as the full form below. */}
              {shortageRows.length > 0 ? (
                <div className="mt-2 text-xs text-danger-fg" role="alert">
                  {fmtShortfallMessage(
                    shortageRows[0].component_name,
                    shortageRows[0].availability!.after,
                    shortageRows[0].component_uom,
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5 pb-20">
            <SectionCard
              title="Step 2 — Enter the produced quantity"
              description="Output = good units. Scrap = consumed but not usable."
            >
              {snapshot ? (
                <div className="mb-4 rounded-md border border-border/60 bg-bg-subtle/40 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold text-fg leading-tight">
                        {snapshot.item_name}
                      </div>
                      {isAdmin ? (
                        <div className="mt-0.5 font-mono text-xs text-fg-muted">
                          {snapshot.item_id}
                        </div>
                      ) : null}
                    </div>
                    <span className="chip chip-info shrink-0 text-3xs">
                      {supplyMethodLabel(snapshot.supply_method)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs">
                    <div>
                      <div className="text-fg-subtle">Pinned BOM</div>
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-fg">
                        <svg className="h-3 w-3 inline-block" viewBox="0 0 24 24" fill="none" aria-label="Locked" role="img"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        {snapshot.bom_version_label}
                      </div>
                    </div>
                    <div>
                      <div className="text-fg-subtle">BOM batch size</div>
                      <div className="mt-0.5">
                        <span className="inline-block rounded bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                          {fmtNumStr(snapshot.bom_final_output_qty)}{" "}
                          {snapshot.bom_final_output_uom} per batch
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Event time */}
                <label className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Event time *
                  </span>
                  <input
                    type="datetime-local"
                    className="input"
                    value={eventAt}
                    onChange={(e) => setEventAt(e.target.value)}
                    required
                  />
                  {/* Relative time label — refreshes every 30s via relTimeTick */}
                  {eventAt ? (
                    <div
                      className="mt-1 text-xs text-fg-muted"
                      key={relTimeTick}
                    >
                      {fmtRelativeTime((Number.isNaN(new Date(eventAt).getTime()) ? new Date() : new Date(eventAt)).toISOString())}
                    </div>
                  ) : null}
                </label>

                {/* Unit of measure — readonly display with pinned label */}
                <label className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Unit of measure *
                  </span>
                  <input
                    className="input"
                    value={outputUom}
                    onChange={(e) => setOutputUom(e.target.value)}
                    required
                  />
                  <div className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
                    <svg className="h-3 w-3 inline-block" viewBox="0 0 24 24" fill="none" aria-label="Locked" role="img"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    <span>Pinned from BOM</span>
                  </div>
                </label>

                {/* Output quantity — hero-sized with steppers */}
                <div className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Output quantity *
                  </span>
                  <div className="flex items-stretch gap-0">
                    <button
                      type="button"
                      className="btn rounded-r-none border-r-0 h-14 px-4 text-2xl font-bold leading-none"
                      data-testid="production-actual-output-stepper-minus"
                      onClick={() => stepNum(outputQty, -1, setOutputQty)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          stepNum(outputQty, -1, setOutputQty);
                        }
                      }}
                      aria-label="Decrease output quantity by 1"
                    >
                      −
                    </button>
                    <input
                      ref={outputQtyInputRef}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      className="input rounded-none h-14 text-4xl font-mono font-bold tabular-nums text-center flex-1 min-w-0"
                      value={outputQty}
                      data-testid="production-actual-output-qty"
                      onChange={(e) => setOutputQty(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="btn rounded-l-none border-l-0 h-14 px-4 text-2xl font-bold leading-none"
                      data-testid="production-actual-output-stepper-plus"
                      onClick={() => stepNum(outputQty, 1, setOutputQty)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          stepNum(outputQty, 1, setOutputQty);
                        }
                      }}
                      aria-label="Increase output quantity by 1"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Scrap quantity — with steppers. The inline hint surfaces
                    the v1 scrap semantic (GAP-011): scrap reduces FG only,
                    NOT RM consumption — RM consumption is based on the
                    output_qty above. Operators MUST understand this. */}
                <div className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Scrap quantity
                  </span>
                  <div className="flex items-stretch gap-0">
                    <button
                      type="button"
                      className="btn rounded-r-none border-r-0 h-12 px-3 text-lg font-bold leading-none"
                      onClick={() => stepNum(scrapQty, -1, setScrapQty)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          stepNum(scrapQty, -1, setScrapQty);
                        }
                      }}
                      aria-label="Decrease scrap quantity by 1"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      className="input rounded-none h-12 text-xl font-mono font-semibold tabular-nums text-center flex-1 min-w-0"
                      value={scrapQty}
                      data-testid="production-actual-scrap-qty"
                      onChange={(e) => setScrapQty(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn rounded-l-none border-l-0 h-12 px-3 text-lg font-bold leading-none"
                      onClick={() => stepNum(scrapQty, 1, setScrapQty)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          stepNum(scrapQty, 1, setScrapQty);
                        }
                      }}
                      aria-label="Increase scrap quantity by 1"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-fg-muted leading-snug">
                    Scrap reduces finished-goods output only — raw-material consumption is computed from output + scrap (the full processed quantity).
                  </div>
                </div>

                {/* Live total processed */}
                {totalProcessed !== null && (outputQty || scrapQty) ? (
                  <div className="sm:col-span-2 rounded bg-bg-subtle/60 border border-border/50 px-3 py-2 text-sm">
                    <span className="text-fg-muted">Total processed: </span>
                    <span className="font-mono font-semibold tabular-nums text-fg">
                      {fmtNumStr(outputQty || "0")} + {fmtNumStr(scrapQty || "0")} ={" "}
                      {totalProcessed.toFixed(
                        totalProcessed % 1 === 0 ? 0 : 2,
                      )}
                    </span>
                    {outputUom ? (
                      <span className="ml-1 text-fg-muted">{outputUom}</span>
                    ) : null}
                  </div>
                ) : null}

                {/* Notes with live character count */}
                <div className="block min-w-0 sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Notes
                  </span>
                  <div className="relative">
                    <textarea
                      className="input min-h-[3rem] w-full"
                      rows={2}
                      value={notes}
                      data-testid="production-actual-notes"
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes (shift, operator comments, etc.)."
                    />
                    <div className="absolute bottom-1.5 right-2 text-3xs text-fg-muted tabular-nums pointer-events-none">
                      {notes.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tranche 050 (C8) — variance reason. Appears only when the
                  report is linked to a live plan and the output is outside
                  the ±2% band. Strongly suggested; "Skip reason" is the
                  explicit opt-out. */}
              {varianceReasonApplicable && linkedPlan ? (
                <div
                  className="mt-4 rounded-md border border-warning/40 bg-warning-softer/30 p-4"
                  data-testid="production-actual-variance-reason-panel"
                >
                  <div className="text-sm font-semibold text-fg">
                    Output is{" "}
                    <span className="font-mono tabular-nums">
                      {fmtVarianceQty(
                        computeVariance(outputQty, linkedPlan.planned_qty)
                          .variance_qty,
                      )}{" "}
                      {outputUom || linkedPlan.uom}
                    </span>{" "}
                    vs the plan — why?
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    A reason helps planning understand recurring variance. It
                    does not change stock.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs font-semibold text-fg">
                        Variance reason
                      </span>
                      <select
                        className="input"
                        value={varianceReasonCode}
                        onChange={(e) => {
                          setVarianceReasonCode(
                            e.target.value as VarianceReasonCode | "",
                          );
                          setVarianceReasonSkipped(false);
                          setVarianceReasonError(null);
                        }}
                        data-testid="production-actual-variance-reason-select"
                      >
                        <option value="">— choose a reason —</option>
                        {VARIANCE_REASON_CODES.map((code) => (
                          <option key={code} value={code}>
                            {VARIANCE_REASON_LABELS[code]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs font-semibold text-fg">
                        Note (optional)
                      </span>
                      <input
                        className="input"
                        value={varianceNote}
                        onChange={(e) => setVarianceNote(e.target.value)}
                        placeholder="e.g. ran out of caps mid-run"
                        maxLength={2000}
                        data-testid="production-actual-variance-note"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {!varianceReasonCode ? (
                      varianceReasonSkipped ? (
                        <span className="text-xs text-fg-muted">
                          Submitting without a variance reason.{" "}
                          <button
                            type="button"
                            className="underline underline-offset-2 hover:no-underline"
                            onClick={() => setVarianceReasonSkipped(false)}
                          >
                            Undo
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setVarianceReasonSkipped(true);
                            setVarianceReasonError(null);
                          }}
                          data-testid="production-actual-variance-skip"
                        >
                          Skip reason
                        </button>
                      )
                    ) : null}
                    {varianceReasonError ? (
                      <span
                        className="text-xs text-danger-fg"
                        role="alert"
                        data-testid="production-actual-variance-reason-error"
                      >
                        {varianceReasonError}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Preview — expected component consumption"
              description="Estimated component consumption from the BOM. Final values are computed at submit."
            >
              {/* 0237 (Tranche 052) — custom-recipe banner. The snapshot's
                  base-source lines already ARE the adjusted recipe (server-
                  side replacement); the preview math below scales those lines
                  verbatim, so no client recomputation contradicts it. */}
              {snapshot?.customized_recipe ? (
                <div
                  className="mb-3 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent"
                  role="note"
                  data-testid="production-actual-custom-recipe-banner"
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <span>
                    <span className="font-semibold">This run uses a custom recipe</span>
                    {" — materials will be consumed per the adjusted recipe."}
                  </span>
                </div>
              ) : null}
              {/* Toggle button styled as a tab with arrow indicator and count badge */}
              <button
                type="button"
                className={cn(
                  "mb-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  previewExpanded
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-border bg-bg-subtle text-fg-muted hover:bg-bg-subtle/80",
                )}
                onClick={() => setPreviewExpanded((v) => !v)}
              >
                <span>{previewExpanded ? "▾" : "▸"}</span>
                <span>
                  {previewExpanded ? "Hide" : "Show"} components
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-3xs font-semibold",
                    previewExpanded
                      ? "bg-accent/20 text-accent"
                      : "bg-bg-subtle/80 text-fg-muted border border-border/60",
                  )}
                >
                  {snapshot?.bom_lines.length ?? 0}
                </span>
              </button>

              {previewExpanded && snapshot ? (
                <>
                  {/* Two-head composition banner — rendered above the preview
                      table when the item has a linked base liquid BOM. The
                      operator-facing copy follows the Tom-locked Hebrew
                      register: "מוצר זה מורכב מאריזה (label) ובסיס נוזל
                      (label). כל יחידה צורכת qty uom בסיס." */}
                  {snapshot.base_bom_version_id_pinned ? (
                    <div className="mb-3 text-sm text-fg-muted">
                      מוצר זה מורכב מאריזה ({snapshot.bom_version_label}) ובסיס
                      נוזל ({snapshot.base_bom_version_label}). כל יחידה צורכת{" "}
                      {fmtNumStr(snapshot.base_qty_per_pack_unit)}{" "}
                      {snapshot.base_bom_final_output_uom} בסיס.
                    </div>
                  ) : null}
                  {previewRows.length === 0 ? (
                    <div className="text-xs text-fg-muted">
                      Enter an output or scrap quantity to see expected
                      consumption.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Pack / single-head sub-group. Always rendered when
                          rows exist (single-head items put every line here). */}
                      {previewRowsByGroup.pack.length > 0 ? (
                        <div>
                          <h3 className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                            רכיבי אריזה ({previewRowsByGroup.pack.length})
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-border/70 bg-bg-subtle/60">
                                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Component
                                  </th>
                                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Required
                                  </th>
                                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Available
                                  </th>
                                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    After
                                  </th>
                                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Unit
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewRowsByGroup.pack.map((r) => (
                                  <tr
                                    key={r.component_id}
                                    className={cn(
                                      "border-b border-border/40 last:border-b-0",
                                      r.availability?.short
                                        ? "bg-danger-softer/40"
                                        : "even:bg-bg-subtle/30",
                                    )}
                                    data-short={r.availability?.short || undefined}
                                  >
                                    <td className="px-3 py-2">
                                      <div className="text-fg-strong">
                                        {r.component_name}
                                      </div>
                                      {isAdmin ? (
                                        <div className="font-mono text-3xs text-fg-muted">
                                          {r.component_id}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-fg">
                                      {r.consumption_preview}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-fg-muted">
                                      {r.availability
                                        ? fmtNumStr(String(r.availability.available))
                                        : "—"}
                                    </td>
                                    <td
                                      className={cn(
                                        "px-3 py-2 text-right font-mono tabular-nums",
                                        r.availability?.short
                                          ? "font-semibold text-danger-fg"
                                          : "text-fg",
                                      )}
                                    >
                                      {r.availability
                                        ? fmtNumStr(String(r.availability.after))
                                        : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-fg-muted">
                                      {r.component_uom ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-1 px-3 text-right text-3xs text-fg-muted">
                            Total {previewRowsByGroup.pack.length} component
                            {previewRowsByGroup.pack.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                      ) : null}

                      {/* Base / liquid sub-group. Rendered ONLY when at least
                          one base line exists (i.e. the item has a linked
                          base BOM AND that BOM has component lines). */}
                      {previewRowsByGroup.base.length > 0 ? (
                        <div>
                          <h3 className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                            רכיבי נוזל ({previewRowsByGroup.base.length})
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-border/70 bg-bg-subtle/60">
                                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Component
                                  </th>
                                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Required
                                  </th>
                                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Available
                                  </th>
                                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    After
                                  </th>
                                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                                    Unit
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewRowsByGroup.base.map((r) => (
                                  <tr
                                    key={r.component_id}
                                    className={cn(
                                      "border-b border-border/40 last:border-b-0",
                                      r.availability?.short
                                        ? "bg-danger-softer/40"
                                        : "even:bg-bg-subtle/30",
                                    )}
                                    data-short={r.availability?.short || undefined}
                                  >
                                    <td className="px-3 py-2">
                                      <div className="text-fg-strong">
                                        {r.component_name}
                                      </div>
                                      {isAdmin ? (
                                        <div className="font-mono text-3xs text-fg-muted">
                                          {r.component_id}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-fg">
                                      {r.consumption_preview}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-fg-muted">
                                      {r.availability
                                        ? fmtNumStr(String(r.availability.available))
                                        : "—"}
                                    </td>
                                    <td
                                      className={cn(
                                        "px-3 py-2 text-right font-mono tabular-nums",
                                        r.availability?.short
                                          ? "font-semibold text-danger-fg"
                                          : "text-fg",
                                      )}
                                    >
                                      {r.availability
                                        ? fmtNumStr(String(r.availability.after))
                                        : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-fg-muted">
                                      {r.component_uom ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-1 px-3 text-right text-3xs text-fg-muted">
                            Total {previewRowsByGroup.base.length} component
                            {previewRowsByGroup.base.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}
            </SectionCard>

            {/* Tranche 050 (C10) — plain-English shortage explanation while
                the submit button is disabled. */}
            {shortageRows.length > 0 ? (
              <div
                className="rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
                role="alert"
                data-testid="production-actual-shortage-warning"
              >
                <div className="font-medium">
                  Not enough component stock for this quantity.
                </div>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                  {shortageRows.map((r) => (
                    <li key={r.component_id}>
                      {fmtShortfallMessage(
                        r.component_name,
                        r.availability!.after,
                        r.component_uom,
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Sticky submit area with backdrop blur. Always-on keyboard
                shortcut hint (hidden on touch / coarse-pointer devices)
                surfaces the Cmd/Ctrl+Enter shortcut without forcing the
                user to hover for the tooltip. */}
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg-raised/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
              {canSubmit && phase !== "submitting" ? (
                <span
                  className="mr-auto hidden text-3xs text-fg-subtle [@media(pointer:fine)]:inline-flex items-center gap-1"
                  aria-hidden="true"
                >
                  <kbd className="rounded border border-border bg-bg px-1 py-px font-mono text-[10px]">⌘</kbd>
                  <span>+</span>
                  <kbd className="rounded border border-border bg-bg px-1 py-px font-mono text-[10px]">Enter</kbd>
                  <span>to submit</span>
                </span>
              ) : null}
              <button
                type="button"
                className="btn focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none"
                onClick={resetFlow}
              >
                Cancel and start over
              </button>
              <button
                type="submit"
                className={cn(
                  "btn btn-lg btn-primary gap-1.5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none",
                  (!canSubmit || phase === "submitting" || shortageRows.length > 0) &&
                    "cursor-not-allowed opacity-60",
                )}
                disabled={
                  phase === "submitting" || !canSubmit || shortageRows.length > 0
                }
                data-testid="production-actual-submit"
                title={
                  !canSubmit
                    ? "Operator or admin role required to submit"
                    : shortageRows.length > 0
                      ? fmtShortfallMessage(
                          shortageRows[0].component_name,
                          shortageRows[0].availability!.after,
                          shortageRows[0].component_uom,
                        )
                      : phase === "submitting"
                        ? "Submitting…"
                        : "Submit (⌘+Enter)"
                }
              >
                {phase === "submitting" ? (
                  "Submitting…"
                ) : !canSubmit ? (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Read-only — operator role required
                  </>
                ) : (
                  "Submit production report"
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------------------
          Recent production runs — last 10 submissions.
          Hidden when the endpoint is not yet deployed (graceful degrade).
          Output = good units produced; FG stock increases by output qty only.
          Scrap = consumed but not usable as finished goods (FG stock unchanged).
      --------------------------------------------------------------------------- */}
      {historyRows.length > 0 ? (
        <div className="mt-8">
          <SectionCard
            title="Recent production reports"
            description="The 10 most recent reports. Output = good units (FG stock increases by output only). Scrap = material consumed but not produced as good output."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Item
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Output
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Scrap
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      BOM version
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Event time
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Variance reason
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Components
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Tranche 050 (C12 partial) — rows click through to the
                      read-only submission detail (?submission_id=). Reversed
                      reports keep their row but are muted + badged. */}
                  {historyRows.map((r) => (
                    <tr
                      key={r.submission_id}
                      className={cn(
                        "cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 even:bg-bg-subtle/30",
                        r.reversed && "opacity-60",
                      )}
                      onClick={() =>
                        router.push(
                          `/stock/production-actual?submission_id=${encodeURIComponent(r.submission_id)}`,
                        )
                      }
                      title="View the full production report"
                      data-testid="production-actual-history-row"
                      data-submission-id={r.submission_id}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/stock/production-actual?submission_id=${encodeURIComponent(r.submission_id)}`}
                            className="font-medium text-fg hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.item_name}
                          </Link>
                          {r.reversed ? (
                            <span
                              className="rounded-sm border border-border/60 bg-bg-subtle px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-fg-muted"
                              data-testid="production-actual-history-reversed-badge"
                            >
                              Reversed
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-fg">
                        {fmtNumStr(r.output_qty)} {r.output_uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-fg-muted">
                        {fmtNumStr(r.scrap_qty)} {r.output_uom}
                      </td>
                      <td className="px-3 py-2 font-mono text-fg-muted">
                        {r.bom_version_label}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        <time
                          dateTime={r.event_at}
                          title={r.event_at}
                        >
                          {fmtRelativeTime(r.event_at)}
                        </time>
                      </td>
                      <td
                        className="px-3 py-2 text-fg-muted"
                        title={r.variance_note ?? undefined}
                      >
                        {varianceReasonLabel(r.variance_reason_code) ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-fg-muted">
                        {r.consumption_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

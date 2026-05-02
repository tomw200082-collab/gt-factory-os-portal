"use client";

// Deep-link integration with planning recommendations and Daily Production Plan:
// /ops/stock/production-actual?item_id=<id>&suggested_qty=<n>&from_rec=<rec_id>&from_run=<run_id>
//   — item_id pre-selects the producible item dropdown
//   — suggested_qty pre-fills the output_qty field (operator can override)
//   — from_rec / from_run surface a "this run is authorized by..." breadcrumb
//
// /ops/stock/production-actual?from_plan_id=<plan_id>
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
// Role gate: operator + admin submit; planner / viewer see read-only banner
// (middleware allows access, backend returns 403 on submit attempts).
// ---------------------------------------------------------------------------

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { useSession } from "@/lib/auth/session-provider";

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
  bom_lines: BomLineSnapshot[];
}

interface ProductionActualSubmit {
  idempotency_key: string;
  event_at: string;
  item_id: string;
  bom_version_id_pinned: string;
  output_qty: number;
  scrap_qty: number;
  output_uom: string;
  notes: string | null;
  // Optional link back to a Daily Production Plan row. When provided, the
  // backend flips production_plan.completed_submission_id NULL→submission_id
  // inside the same transaction as the production_actual + ledger writes.
  // See api/src/production-actuals/schemas.ts ProductionActualSubmitSchema.
  from_plan_id?: string | null;
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
  status: "planned" | "cancelled";
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
}

// Decimal-string arithmetic helpers (keep server-side precision intact for
// the preview panel; the server re-explodes authoritatively on submit).
function stringDiv(num: string, denom: string, prodQty: number): string {
  const n = Number(num);
  const d = Number(denom);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return "?";
  const r = (n * prodQty) / d;
  // 4dp is plenty for a preview UI; server precision is qty_8dp.
  return r.toFixed(4);
}

export default function ProductionActualPage() {
  const { session } = useSession();
  const canSubmit = session.role === "operator" || session.role === "admin";
  const isAdmin = session.role === "admin";

  const queryClient = useQueryClient();
  const router = useRouter();

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

  // Query-string-driven deep-link prefill from planning recommendations OR
  // Daily Production Plan board. Read once on mount; do not stomp manually
  // typed values on subsequent re-renders.
  const searchParams = useSearchParams();
  const initialItemId = searchParams?.get("item_id") ?? "";
  const initialSuggestedQty = searchParams?.get("suggested_qty") ?? "";
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
    back.setDate(today.getDate() - 7);
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
  // Default to expanded so the operator sees expected consumption inline
  // while entering output_qty / scrap_qty — no extra click required to
  // verify the BOM × qty math matches expectation.
  const [previewExpanded, setPreviewExpanded] = useState<boolean>(true);
  const [done, setDone] = useState<DoneState | null>(null);

  // Combined loading guard. Pick screen waits for items; once snapshot is
  // resolved we don't need items anymore.
  const isLoadingItems = itemsQuery.isLoading;
  const itemsLoadErr = itemsQuery.error;

  async function handleOpen(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDone(null);
    if (!selectedItemId) {
      setDone({ kind: "error", message: "Choose an item to produce." });
      return;
    }
    setPhase("submitting");
    try {
      const q = new URLSearchParams({ item_id: selectedItemId });
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
      const envelope: ProductionActualSubmit = {
        idempotency_key: newIdempotencyKey(),
        event_at: new Date(eventAt).toISOString(),
        item_id: snapshot.item_id,
        bom_version_id_pinned: snapshot.bom_version_id_pinned,
        output_qty: outNum,
        scrap_qty: scrapNum,
        output_uom: outputUom,
        notes: notes ? notes : null,
        // Send from_plan_id only when supplied; backend treats undefined and
        // null identically (both → no plan link).
        ...(overrideFromPlanId ? { from_plan_id: overrideFromPlanId } : {}),
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
              ? "Production already recorded."
              : "Inventory has been updated.",
            committed,
            committedItemName: snapshot.item_name,
          });
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
              required_qty: string | number;
              available_qty: string | number;
            }>;
          };
          const shortfallLines = (insuffBody.shortfalls ?? [])
            .map(
              (s) =>
                `${s.component_id}: need ${s.required_qty}, have ${s.available_qty}`,
            )
            .join("; ");
          setDone({
            kind: "error",
            message: `Insufficient stock: ${shortfallLines || (insuffBody.message ?? "check component stock levels.")}`,
            detail: insuffBody.message,
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
                : "Not authorized. Operator or admin role is required to submit.",
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
    void submitProductionActual(null);
  }

  function resetFlow(): void {
    setSnapshot(null);
    setOutputQty("");
    setScrapQty("0");
    setOutputUom("");
    setNotes("");
    setSelectedItemId("");
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setPreviewExpanded(false);
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
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setPreviewExpanded(false);
  }

  // Preview panel — multiplies bom_lines × (output + scrap) / bom_final_output.
  // Server re-explodes authoritatively; this is informational only.
  const previewRows = useMemo(() => {
    if (!snapshot)
      return [] as Array<{
        component_id: string;
        component_name: string;
        consumption_preview: string;
        component_uom: string | null;
      }>;
    const productionQty = Number(outputQty || "0") + Number(scrapQty || "0");
    if (!Number.isFinite(productionQty) || productionQty <= 0) return [];
    return snapshot.bom_lines.map((bl) => ({
      component_id: bl.component_id,
      component_name: bl.component_name,
      consumption_preview: stringDiv(
        bl.final_component_qty,
        snapshot.bom_final_output_qty,
        productionQty,
      ),
      component_uom: bl.component_uom,
    }));
  }, [snapshot, outputQty, scrapQty]);

  // Plan-link banner state derived from the live plan query. This is the
  // small chip at the top of the form that confirms "you are reporting
  // production against plan X for item Y on date Z".
  const planLoadFailed =
    Boolean(fromPlanId) &&
    !planQuery.isLoading &&
    (planQuery.isError || (!linkedPlan && (planQuery.data?.rows ?? []).length >= 0 && !planQuery.isLoading));

  return (
    <div dir="ltr">
      <WorkflowHeader
        eyebrow="Operator form"
        title="Production Report"
        description="Report what you produced and any scrap. The system computes component consumption from the active BOM."
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
              <div className="font-medium">
                Linked to plan {fmtPlanDate(linkedPlan.plan_date)} ·{" "}
                {linkedPlan.item_name ?? linkedPlan.item_id}
              </div>
              <div className="mt-1 text-xs opacity-90">
                Plan target:{" "}
                <span className="font-mono tabular-nums">
                  {linkedPlan.planned_qty} {linkedPlan.uom}
                </span>
                {" · "}
                <Link
                  href="/planning/production-plan"
                  className="underline underline-offset-2 hover:no-underline"
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
          <div className="font-medium">Read-only.</div>
          <div className="mt-1 text-xs opacity-80">
            Your role is {session.role}. Only operator or admin can submit a
            production report.
          </div>
        </div>
      ) : null}

      {done ? (
        <div
          className={
            "mb-4 rounded-md border px-4 py-3 text-sm " +
            (done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : done.kind === "stale"
                ? "border-warning/40 bg-warning-softer text-warning-fg"
                : "border-danger/40 bg-danger-softer text-danger-fg")
          }
          role="status"
        >
          <div className="font-medium">{done.message}</div>

          {/* Success-panel detail — show what was posted, plus contextual
              follow-up links. */}
          {done.kind === "success" && done.committed ? (
            <div className="mt-2 space-y-1 text-xs">
              <div>
                Output:{" "}
                <span className="font-mono tabular-nums">
                  {done.committed.output_qty} {done.committed.output_uom}
                </span>
                {Number(done.committed.scrap_qty) > 0 ? (
                  <>
                    {" · scrap "}
                    <span className="font-mono tabular-nums">
                      {done.committed.scrap_qty} {done.committed.output_uom}
                    </span>
                  </>
                ) : null}
                {" · "}
                {done.committed.consumption.length} component
                {done.committed.consumption.length !== 1 ? "s" : ""} consumed
              </div>
              {done.committed.linked_plan_id ? (
                <div>
                  Linked plan:{" "}
                  <span className="font-mono">
                    {done.committed.linked_plan_id}
                  </span>
                  {linkedPlan ? (
                    <span className="text-fg-muted">
                      {" "}· {fmtPlanDate(linkedPlan.plan_date)} ·{" "}
                      {linkedPlan.item_name ?? linkedPlan.item_id}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* W4 contract §4.1 — variance row on confirmation panel.
                  Shown only when the submission was linked to a plan AND
                  the form still has the linked plan in state (carries
                  planned_qty + uom). On no-link submits (§4.1.1) the
                  variance row is omitted entirely. */}
              {done.committed.linked_plan_id && linkedPlan ? (
                (() => {
                  const v = computeVariance(
                    done.committed.output_qty,
                    linkedPlan.planned_qty,
                  );
                  const isOnTarget = v.variance_sign === "on_target";
                  return (
                    <div
                      className={
                        "mt-2 rounded border px-3 py-2 " +
                        (isOnTarget
                          ? "border-success/30 bg-success-softer/30"
                          : "border-warning/40 bg-warning-softer/30")
                      }
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
                            {linkedPlan.planned_qty} {linkedPlan.uom}
                          </span>
                        </span>
                        <span>
                          Output:{" "}
                          <span className="font-mono tabular-nums">
                            {done.committed.output_qty}{" "}
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
                          className={
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-semibold uppercase " +
                            (isOnTarget
                              ? "bg-success-softer text-success-fg"
                              : "bg-warning-softer text-warning-fg")
                          }
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
        <form onSubmit={handleOpen} className="space-y-5">
          <SectionCard
            title="Step 1 — Pick the item being produced"
            description="Only manufactured or repacked items are listed. If the BOM is updated after this form opens, you will need to reopen before submitting."
          >
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Item *
                </span>
                <select
                  className="input"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  required
                >
                  <option value="">— Pick —</option>
                  <optgroup label="Manufactured">
                    {producibleItems
                      .filter((r) => r.supply_method === "MANUFACTURED")
                      .map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_name} · {r.sku ?? r.item_id}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Repack">
                    {producibleItems
                      .filter((r) => r.supply_method === "REPACK")
                      .map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_name} · {r.sku ?? r.item_id}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
              <div className="text-xs text-fg-muted">
                {`${producibleItems.length} producible items · ${producibleItems.filter((r) => r.supply_method === "MANUFACTURED").length} manufactured · ${producibleItems.filter((r) => r.supply_method === "REPACK").length} repack`}
              </div>
            </div>
          </SectionCard>
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedItemId}
            >
              Continue to entry
            </button>
          </div>
        </form>
      ) : phase === "entering" || phase === "submitting" ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard
            title="Step 2 — Enter the produced quantity"
            description="Output = good units produced. Scrap = material consumed but not usable as finished goods. Both are required; scrap defaults to 0."
          >
            {snapshot ? (
              <div className="mb-3 rounded-md border border-border/60 bg-bg-subtle/40 p-3 text-xs">
                <div>
                  <span className="text-fg-subtle">Producing:</span>{" "}
                  <span className="text-fg font-medium">
                    {snapshot.item_name}
                  </span>
                  {isAdmin ? (
                    <span className="text-fg-muted"> ({snapshot.item_id})</span>
                  ) : null}
                  <span className="ml-2 rounded-sm border border-info/40 bg-info-soft px-1.5 py-0.5 text-3xs text-info-fg">
                    {supplyMethodLabel(snapshot.supply_method)}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">Pinned BOM:</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.bom_version_label}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">BOM produces</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.bom_final_output_qty}{" "}
                    {snapshot.bom_final_output_uom}
                  </span>{" "}
                  <span className="text-fg-subtle">per batch</span>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Event time *
                </span>
                <input
                  type="datetime-local"
                  className="input"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  required
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Unit of measure *
                </span>
                <input
                  className="input"
                  value={outputUom}
                  onChange={(e) => setOutputUom(e.target.value)}
                  required
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Output quantity *
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={outputQty}
                  onChange={(e) => setOutputQty(e.target.value)}
                  required
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Scrap quantity
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={scrapQty}
                  onChange={(e) => setScrapQty(e.target.value)}
                />
              </label>
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Notes
                </span>
                <textarea
                  className="input min-h-[3rem]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (shift, operator comments, etc.)."
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="Preview — expected component consumption"
            description="Estimated component consumption from the BOM and quantities entered. The final value is computed at submit time."
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm mb-3"
              onClick={() => setPreviewExpanded((v) => !v)}
            >
              {previewExpanded ? "Hide components" : "Show components"} (
              {snapshot?.bom_lines.length ?? 0})
            </button>
            {previewExpanded && snapshot ? (
              previewRows.length === 0 ? (
                <div className="text-xs text-fg-muted">
                  Enter an output or scrap quantity to see expected
                  consumption.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border/70 bg-bg-subtle/60">
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Component
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Expected consumption
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Unit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r) => (
                        <tr
                          key={r.component_id}
                          className="border-b border-border/40 last:border-b-0"
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
                          <td className="px-3 py-2 font-mono tabular-nums text-fg">
                            {r.consumption_preview}
                          </td>
                          <td className="px-3 py-2 text-fg-muted">
                            {r.component_uom ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </SectionCard>

          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn" onClick={resetFlow}>
              Cancel and start over
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={phase === "submitting" || !canSubmit}
            >
              {phase === "submitting"
                ? "Submitting…"
                : "Submit production report"}
            </button>
          </div>
        </form>
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
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Components
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((r) => (
                    <tr
                      key={r.submission_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-fg">{r.item_name}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-fg">
                        {r.output_qty} {r.output_uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-fg-muted">
                        {r.scrap_qty} {r.output_uom}
                      </td>
                      <td className="px-3 py-2 font-mono text-fg-muted">
                        {r.bom_version_label}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {fmtDate(r.event_at)}
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

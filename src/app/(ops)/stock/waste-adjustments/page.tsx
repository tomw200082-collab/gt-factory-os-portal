"use client";

// ---------------------------------------------------------------------------
// Waste / Adjustment — operator form (live API backed).
//
// Endgame Phase B1:
//   - Dropdowns fetch from GET /api/items, /api/components (?status=ACTIVE).
//   - Submit posts to /api/waste-adjustments proxy → POST /api/v1/mutations/
//     waste-adjustments.
//   - Contract: src/lib/contracts/waste-adjustments.ts (WasteAdjustmentRequestSchema).
//     Loss / positive direction; reason_code constrained by direction; auto-post vs
//     pending-approval returned by API; UI renders either.
//   - Quarantine stub removed.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { submitStockEvent } from "@/lib/stock/submit";
import { fetchJson } from "@/lib/http/fetchJson";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { SearchableSelect } from "@/components/fields/SearchableSelect";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import { componentItemType } from "@/lib/contracts/components";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Waste / Adjustment contract — inlined.
//
// Mirror of api/src/waste-adjustments/schemas.ts + docs/waste_adjustment_
// runtime_contract.md. Inlined because the local contract file at
// src/lib/contracts/waste-adjustments.ts is intentionally held out of the
// committed tree pending a Gate-3 commit-hygiene tranche. Keep aligned
// with upstream schema.
// ---------------------------------------------------------------------------

type ItemType = "FG" | "RM" | "PKG";

type WasteReasonCode =
  | "breakage"
  | "spoilage"
  | "production_waste"
  | "sampling"
  | "theft_loss"
  | "found_stock"
  | "correction"
  | "other";

const REASON_CODES_BY_DIRECTION: Record<
  "loss" | "positive",
  readonly WasteReasonCode[]
> = {
  loss: [
    "breakage",
    "spoilage",
    "production_waste",
    "sampling",
    "theft_loss",
    "correction",
    "other",
  ],
  positive: ["found_stock", "correction", "other"],
};

const REASON_CODES_REQUIRING_NOTES: readonly WasteReasonCode[] = [
  "theft_loss",
  "found_stock",
  "correction",
  "other",
];

interface WasteAdjustmentRequest {
  idempotency_key: string;
  event_at: string;
  direction: "loss" | "positive";
  item_type: ItemType;
  item_id: string;
  quantity: number;
  unit: string;
  reason_code: string;
  notes: string | null;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  sku: string | null;
  status: string;
  sales_uom: string | null;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  status: string;
  // Drives the stock-event item_type (RM vs PKG). The API rejects an
  // adjustment whose item_type does not match this class — see componentItemType().
  component_class: string | null;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

interface AdjustableRow {
  kind: "item" | "component";
  id: string;
  label: string;
  default_uom: Uom;
  // null when a component's component_class is unknown/missing — the submit
  // is blocked rather than sent with a guessed item_type the API 409s.
  item_type: ItemType | null;
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
  return `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function toUom(raw: string | null | undefined): Uom {
  if (raw && (UOMS as readonly string[]).includes(raw)) return raw as Uom;
  return "UNIT";
}

type SubmitPhase = "idle" | "submitting" | "done";
interface DoneState {
  kind: "success" | "pending" | "error";
  message: string;
  detail?: string;
  itemSummary?: string;
  href?: string;
  hrefLabel?: string;
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------
function getRelativeTime(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (isNaN(diffMs) || diffMs < 0) return "";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hour ago";
  return `${diffHr} hours ago`;
}

// ---------------------------------------------------------------------------
// Reason code labels
// ---------------------------------------------------------------------------
const REASON_LABELS: Record<WasteReasonCode, string> = {
  breakage: "Breakage",
  spoilage: "Spoilage",
  production_waste: "Production waste",
  sampling: "Sampling",
  theft_loss: "Theft / loss",
  found_stock: "Found stock",
  correction: "Correction",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function WasteAdjustmentPage() {
  const queryClient = useQueryClient();
  // Idempotency key for the in-progress adjustment. Generated once and REUSED
  // across retries so a retry after a lost response cannot post a second ledger
  // event (backend dedups on this key). Cleared on a successful post or reset.
  const idemKeyRef = useRef<string | null>(null);
  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "ACTIVE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
  });
  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["master", "components", "ACTIVE"],
    queryFn: () => fetchJson("/api/components?status=ACTIVE&limit=1000"),
  });

  const adjustable: AdjustableRow[] = useMemo(() => {
    const items = itemsQuery.data?.rows ?? [];
    const components = componentsQuery.data?.rows ?? [];
    return [
      ...items.map<AdjustableRow>((i) => ({
        kind: "item",
        id: i.item_id,
        label: `${i.item_name} · ${i.sku ?? i.item_id}`,
        default_uom: toUom(i.sales_uom),
        item_type: "FG",
      })),
      ...components.map<AdjustableRow>((c) => ({
        kind: "component",
        id: c.component_id,
        label: `${c.component_name} · ${c.component_id}`,
        default_uom: toUom(c.inventory_uom ?? c.bom_uom ?? c.purchase_uom),
        // Resolve item_type from the component's class so packaging components
        // submit as PKG, not RM. Mirrors the API's COMPONENT_CLASS_BY_ITEM_TYPE;
        // null (unknown/missing class) blocks the submit in doSubmit().
        item_type: componentItemType(c.component_class),
      })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }, [itemsQuery.data, componentsQuery.data]);

  const byKey = useMemo(() => {
    const m = new Map<string, AdjustableRow>();
    for (const r of adjustable) m.set(`${r.kind}:${r.id}`, r);
    return m;
  }, [adjustable]);

  const [eventAt, setEventAt] = useState<string>(nowLocalDateTime());
  const [direction, setDirection] = useState<"loss" | "positive">("loss");
  const [selKey, setSelKey] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [unit, setUnit] = useState<Uom>("UNIT");
  const [reasonCode, setReasonCode] = useState<WasteReasonCode | "">("");
  const [notes, setNotes] = useState<string>("");
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [done, setDone] = useState<DoneState | null>(null);

  // New state — does NOT replace any existing state
  const [confirmPending, setConfirmPending] = useState(false);
  // Tranche 041 — keeps the confirm panel visible (with a loading Confirm
  // button) until doSubmit resolves, instead of dismissing before the await.
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [notesAttempted, setNotesAttempted] = useState(false);
  const [relativeTime, setRelativeTime] = useState(() => getRelativeTime(nowLocalDateTime()));

  const loading = itemsQuery.isLoading || componentsQuery.isLoading;
  const loadErr = itemsQuery.error || componentsQuery.error;

  const allowedReasons = REASON_CODES_BY_DIRECTION[direction];
  const notesRequired =
    direction === "positive" ||
    (reasonCode !== "" && REASON_CODES_REQUIRING_NOTES.includes(reasonCode));

  const selectedRow = byKey.get(selKey);
  const qtyNum = Number(quantity);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;

  // Update relative time label every 30s
  useEffect(() => {
    const id = setInterval(() => {
      setRelativeTime(getRelativeTime(eventAt));
    }, 30000);
    return () => clearInterval(id);
  }, [eventAt]);

  useEffect(() => {
    setRelativeTime(getRelativeTime(eventAt));
  }, [eventAt]);

  // ---------------------------------------------------------------------------
  // Actual API submission (separated from handleSubmit so the confirm panel
  // can call it after user confirms).
  // ---------------------------------------------------------------------------
  async function doSubmit(row: AdjustableRow, qtyNumLocal: number): Promise<void> {
    if (row.item_type === null) {
      setDone({
        kind: "error",
        message: `"${row.label}" is missing a component classification and can't be adjusted. Ask an admin to set its component class.`,
      });
      return;
    }
    // Guard the datetime-local: a cleared field yields "" and
    // new Date("").toISOString() throws, crashing the submit.
    const whenIso = (() => {
      const d = new Date(eventAt);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    })();
    if (whenIso === null) {
      setDone({
        kind: "error",
        message: "Enter a valid event date and time before submitting.",
      });
      return;
    }
    if (!idemKeyRef.current) idemKeyRef.current = newIdempotencyKey();
    const envelope: WasteAdjustmentRequest = {
      idempotency_key: idemKeyRef.current,
      event_at: whenIso,
      direction,
      item_type: row.item_type,
      item_id: row.id,
      quantity: qtyNumLocal,
      unit,
      reason_code: reasonCode,
      notes: notes ? notes : null,
    };

    setPhase("submitting");
    const summary = `${row.label} · ${direction === "loss" ? "−" : "+"}${qtyNumLocal} ${unit} · ${REASON_LABELS[reasonCode as WasteReasonCode] ?? String(reasonCode).replace(/_/g, " ")}`;
    const result = await submitStockEvent<{
      status?: string;
      submission_id?: string;
      idempotent_replay?: boolean;
    }>("/api/waste-adjustments", envelope);
    switch (result.kind) {
      case "posted":
        setDone({
          kind: "success",
          message: result.idempotentReplay
            ? "Already posted earlier — no duplicate created."
            : "Adjustment posted successfully.",
          itemSummary: summary,
          detail: `ref: ${result.submissionId}`,
        });
        setQuantity("");
        setNotes("");
        setReasonCode("");
        // Submission completed — next submit is a new op; issue a fresh key.
        idemKeyRef.current = null;
        break;
      case "pending":
        // A new approval was created; refresh the inbox so its waste-approval
        // source and unread count reflect it immediately (not after staleTime).
        void queryClient.invalidateQueries({ queryKey: ["inbox"] });
        setDone({
          kind: "pending",
          message: "Adjustment submitted — held for planner approval.",
          itemSummary: summary,
          detail: `ref: ${result.submissionId}`,
          href: result.submissionId
            ? `/inbox/approvals/waste/${encodeURIComponent(result.submissionId)}`
            : undefined,
          hrefLabel: "Open approval",
        });
        setQuantity("");
        setNotes("");
        setReasonCode("");
        // Submission completed — next submit is a new op; issue a fresh key.
        idemKeyRef.current = null;
        break;
      case "rejected":
        // Generic operator line; only a §1-safe string server message reaches detail.
        setDone({
          kind: "error",
          message: "Could not submit. Check your connection and try again.",
          detail: result.serverMessage,
        });
        break;
      case "network":
        setDone({
          kind: "error",
          message: "Network error submitting adjustment.",
          detail:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        });
        break;
    }
    setPhase("done");
  }

  // ---------------------------------------------------------------------------
  // handleSubmit — same validation logic as before; replaces window.confirm
  // with inline confirmPending panel.
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDone(null);
    const row = byKey.get(selKey);
    if (!row) {
      setDone({ kind: "error", message: "Choose an item or component." });
      return;
    }
    const qtyNumLocal = Number(quantity);
    if (!Number.isFinite(qtyNumLocal) || qtyNumLocal <= 0) {
      setDone({ kind: "error", message: "Quantity must be a positive number." });
      return;
    }
    if (!reasonCode) {
      setDone({ kind: "error", message: "Reason is required." });
      return;
    }
    if (notesRequired && !notes.trim()) {
      setNotesAttempted(true);
      setDone({
        kind: "error",
        message:
          direction === "positive"
            ? "Notes are required for positive corrections."
            : `Notes are required for reason '${reasonCode}'.`,
      });
      return;
    }

    // Tranche 041 — BOTH directions go through the inline confirm panel.
    // Loss previously posted a permanent ledger event with no confirmation.
    setConfirmPending(true);
  }

  function handleReset() {
    setSelKey("");
    setQuantity("");
    setNotes("");
    setReasonCode("");
    setDone(null);
    setConfirmPending(false);
    // Form reset — next submit is a new op; issue a fresh idempotency key.
    idemKeyRef.current = null;
    setNotesAttempted(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <WorkflowHeader
        size="section"
        eyebrow="Operator form"
        title="Waste / Adjustment"
        description="Report a loss or positive correction."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Result banner                                                        */}
      {/* ------------------------------------------------------------------ */}
      {done ? (
        <div
          className={cn(
            "mb-6 rounded-xl border px-5 py-5 transition-colors duration-150",
            done.kind === "success" && "border-success/40 bg-success-softer text-success-fg",
            done.kind === "pending" && "border-warning/40 bg-warning-softer text-warning-fg",
            done.kind === "error" && "border-l-4 border-danger bg-danger-softer text-danger-fg pl-5"
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-4">
            {/* Hero icon — large, recognisable from a glance. */}
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                done.kind === "success" && "bg-success/15",
                done.kind === "pending" && "bg-warning/15",
                done.kind === "error" && "bg-danger/15",
              )}
            >
              {done.kind === "success" && (
                <Check className="h-7 w-7" strokeWidth={2} aria-hidden />
              )}
              {done.kind === "pending" && (
                <Clock className="h-7 w-7" strokeWidth={2} aria-hidden />
              )}
              {done.kind === "error" && (
                <XCircle className="h-7 w-7" strokeWidth={2} aria-hidden />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold leading-tight">{done.message}</div>
              {done.itemSummary ? (
                <div className="mt-1.5 text-sm font-medium opacity-90">
                  {done.itemSummary}
                </div>
              ) : null}
              {done.kind === "pending" && (
                <div className="mt-2 text-sm leading-snug opacity-90">
                  <strong>Stock has not changed yet.</strong> A planner reviews this; stock updates only after approval.
                </div>
              )}
              {done.detail ? (
                <div className="mt-2 font-mono text-xs opacity-50">
                  {done.detail}
                </div>
              ) : null}
            </div>
            {done.href ? (
              <Link
                href={done.href}
                className="btn btn-sm shrink-0"
                data-testid="waste-adjustment-banner-link"
              >
                {done.hrefLabel ?? "Open"}
              </Link>
            ) : null}
          </div>

          {(done.kind === "success" || done.kind === "pending") && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-current/10 pt-4">
              {done.kind === "success" ? (
                <Link
                  href="/stock/movement-log"
                  className="btn btn-sm"
                  data-testid="waste-adjustment-success-movement-log"
                >
                  View posted ledger →
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={handleReset}
              >
                Submit another
              </button>
            </div>
          )}

          {done.kind === "error" && (
            <div className="mt-4 border-t border-current/10 pt-4">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDone(null)}
                data-testid="waste-adjustment-error-dismiss"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      ) : null}

      {loading ? (
        <SectionCard title="Loading masters…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        </SectionCard>
      ) : loadErr ? (
        <SectionCard title="Could not load items / components">
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
            <div className="font-semibold">Could not load masters</div>
            <div className="mt-1 text-xs">{(loadErr as Error).message}</div>
            <button
              type="button"
              onClick={() => {
                void itemsQuery.refetch();
                void componentsQuery.refetch();
              }}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline transition-colors duration-150"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 pb-24">

          {/* ---------------------------------------------------------------- */}
          {/* Direction selector                                                */}
          {/* ---------------------------------------------------------------- */}
          <SectionCard title="Direction">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Loss card */}
              <label
                data-testid="waste-direction-loss"
                className={cn(
                  "group relative flex cursor-pointer items-center gap-4 rounded-lg border-2 px-4 py-4 transition-all duration-150",
                  direction === "loss"
                    ? "border-danger bg-danger-softer/40 ring-2 ring-danger/20"
                    : "border-border/70 hover:border-fg-muted"
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  value="loss"
                  checked={direction === "loss"}
                  onChange={() => {
                    setDirection("loss");
                    setReasonCode("");
                  }}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
                    direction === "loss"
                      ? "bg-danger text-white"
                      : "bg-bg-subtle text-danger-fg",
                  )}
                >
                  <ArrowDown className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-lg font-bold leading-tight">Loss</span>
                  <span className="block text-sm text-fg-muted mt-0.5">
                    Breakage, spoilage, spillage
                  </span>
                </span>
              </label>

              {/* Positive card */}
              <label
                data-testid="waste-direction-positive"
                className={cn(
                  "group relative flex cursor-pointer items-center gap-4 rounded-lg border-2 px-4 py-4 transition-all duration-150",
                  direction === "positive"
                    ? "border-warning bg-warning-softer/60 ring-2 ring-warning/20"
                    : "border-border/70 hover:border-fg-muted"
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  value="positive"
                  checked={direction === "positive"}
                  onChange={() => {
                    setDirection("positive");
                    setReasonCode("");
                  }}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
                    direction === "positive"
                      ? "bg-warning text-white"
                      : "bg-bg-subtle text-warning-fg",
                  )}
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-lg font-bold leading-tight">Positive correction</span>
                  <span className="block text-sm text-fg-muted mt-0.5">
                    Found stock, correction
                  </span>
                </span>
              </label>
            </div>
          </SectionCard>

          {/* ---------------------------------------------------------------- */}
          {/* Approval required banner (positive only)                         */}
          {/* ---------------------------------------------------------------- */}
          {direction === "positive" && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg transition-all duration-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
              <span>
                <span className="font-semibold">Approval required.</span>{" "}
                Positive adjustments are held for planner approval before affecting stock.
              </span>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Adjustment fields                                                 */}
          {/* ---------------------------------------------------------------- */}
          <SectionCard title="Adjustment">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              {/* Event time */}
              <label className="block min-w-0">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  Event time *
                  {relativeTime && (
                    <span className="font-normal lowercase normal-case tracking-normal text-fg-muted">
                      — {relativeTime}
                    </span>
                  )}
                </span>
                <input
                  type="datetime-local"
                  className="input transition-colors duration-150"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  required
                />
              </label>

              {/* Item / component combobox */}
              <div className="block min-w-0">
                <span className="mb-2 block text-sm font-semibold text-fg">
                  Item / component *
                </span>
                <div data-testid="waste-item-select">
                  <SearchableSelect
                    value={selKey}
                    onChange={(key) => {
                      setSelKey(key);
                      const row = byKey.get(key);
                      if (row) setUnit(row.default_uom);
                    }}
                    options={adjustable.map((row) => ({
                      value: `${row.kind}:${row.id}`,
                      label: row.label,
                      meta: row.item_type ?? "—",
                    }))}
                    placeholder="Search items and components…"
                    searchPlaceholder="Search items and components…"
                    emptyMessage="No results"
                    ariaLabel="Item or component"
                  />
                </div>
                {/* Selected item chip */}
                {selectedRow && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg-subtle px-2.5 py-0.5 text-xs text-fg-muted">
                    <span className="font-semibold text-fg">{selectedRow.item_type ?? "—"}</span>
                    <span>·</span>
                    <span className="truncate max-w-[16rem]">{selectedRow.label}</span>
                  </div>
                )}
              </div>

              {/* Quantity — hero numeric input */}
              <div className="block min-w-0">
                <span className="mb-2 block text-sm font-semibold text-fg">
                  Quantity *
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn shrink-0 h-14 w-14 flex items-center justify-center text-2xl font-bold leading-none transition-colors duration-150"
                    aria-label="Decrease quantity by 1"
                    onClick={() =>
                      setQuantity((v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n) || n <= 1) return "1";
                        return String(n - 1);
                      })
                    }
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="input flex-1 h-14 text-center text-3xl font-mono font-bold tabular-nums transition-colors duration-150"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    data-testid="waste-quantity"
                  />
                  <button
                    type="button"
                    className="btn shrink-0 h-14 w-14 flex items-center justify-center text-2xl font-bold leading-none transition-colors duration-150"
                    aria-label="Increase quantity by 1"
                    onClick={() =>
                      setQuantity((v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n) || n < 0) return "1";
                        return String(n + 1);
                      })
                    }
                  >
                    +
                  </button>
                </div>
                {/* Signed quantity preview */}
                {qtyValid && (
                  <div
                    className={cn(
                      "mt-2 text-base font-bold tabular-nums",
                      direction === "loss" ? "text-danger-fg" : "text-success-fg"
                    )}
                  >
                    {direction === "loss" ? "−" : "+"}
                    {qtyNum} {unit}
                  </div>
                )}
              </div>

              {/* Unit */}
              <label className="block min-w-0">
                <span className="mb-2 block text-sm font-semibold text-fg">
                  Unit
                </span>
                <select
                  className="input transition-colors duration-150"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Uom)}
                >
                  {UOMS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>

              {/* Reason chips */}
              <div className="block min-w-0 sm:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-fg">
                  Reason *
                </span>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Reason code"
                  data-testid="waste-reason"
                >
                  {allowedReasons.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={cn(
                        "cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all duration-150",
                        reasonCode === r
                          ? "border-accent bg-accent text-white shadow-sm"
                          : "border-border bg-bg text-fg hover:border-fg-muted"
                      )}
                      onClick={() => setReasonCode(r)}
                      aria-pressed={reasonCode === r}
                    >
                      {REASON_LABELS[r]}
                    </button>
                  ))}
                </div>
                {reasonCode && REASON_CODES_REQUIRING_NOTES.includes(reasonCode) && (
                  <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-info-fg">
                    <Info className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    Notes required for this reason
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="block min-w-0 sm:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-fg">
                  Notes {notesRequired ? "*" : ""}
                </span>
                <div className="relative">
                  <textarea
                    className={cn(
                      "input min-h-[3rem] w-full transition-colors duration-150",
                      notesRequired && notesAttempted && !notes.trim()
                        ? "border-danger animate-pulse"
                        : ""
                    )}
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      notesRequired
                        ? "Required for this reason / direction"
                        : "Optional — add context if needed"
                    }
                    required={!!notesRequired}
                    data-testid="waste-notes"
                  />
                  {/* Character count */}
                  <span className="pointer-events-none absolute bottom-1.5 right-2 text-xs text-fg-muted tabular-nums">
                    {notes.length}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ---------------------------------------------------------------- */}
          {/* Inline confirm panel (replaces window.confirm). Tranche 041 —    */}
          {/* gates BOTH directions; loss previously posted with no confirm.   */}
          {/* Panel stays visible (Confirm shows a spinner, Cancel disabled)   */}
          {/* until doSubmit resolves.                                         */}
          {/* ---------------------------------------------------------------- */}
          {confirmPending && (
            <div
              className="rounded-md border border-warning/50 bg-warning-softer px-4 py-4 text-sm text-warning-fg"
              role="alertdialog"
              aria-modal="false"
              aria-label={
                direction === "loss"
                  ? "Confirm loss adjustment"
                  : "Confirm positive adjustment"
              }
              data-testid="waste-confirm-panel"
            >
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
                <p className="font-medium">
                  {direction === "loss" ? (
                    <>
                      You are about to remove{" "}
                      <span className="font-bold">
                        {qtyNum} {unit}
                      </span>{" "}
                      of{" "}
                      <span className="font-bold">
                        {selectedRow?.label ?? "the selected item"}
                      </span>{" "}
                      from stock. The ledger event is permanent — small losses
                      post immediately; larger losses are held for planner
                      approval.
                    </>
                  ) : (
                    <>
                      You are about to add{" "}
                      <span className="font-bold">
                        {qtyNum} {unit}
                      </span>{" "}
                      of{" "}
                      <span className="font-bold">
                        {selectedRow?.label ?? "the selected item"}
                      </span>{" "}
                      to stock. This will be held for planner approval. Once
                      approved, the ledger event is permanent.
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm transition-colors duration-150"
                  data-testid="waste-confirm-proceed"
                  disabled={confirmSubmitting}
                  onClick={async () => {
                    const row = byKey.get(selKey);
                    if (!row) {
                      setConfirmPending(false);
                      return;
                    }
                    setConfirmSubmitting(true);
                    try {
                      await doSubmit(row, Number(quantity));
                    } finally {
                      setConfirmSubmitting(false);
                      setConfirmPending(false);
                    }
                  }}
                >
                  {confirmSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
                      Submitting…
                    </span>
                  ) : (
                    "Confirm"
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-sm transition-colors duration-150"
                  data-testid="waste-confirm-cancel"
                  disabled={confirmSubmitting}
                  onClick={() => setConfirmPending(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Pre-submit "what will change" panel for the LOSS direction.       */}
          {/* Positive direction already has its own confirm panel above.       */}
          {/* Renders only when the form has enough state to describe the       */}
          {/* effect; loss auto-posts under threshold OR holds for approval     */}
          {/* above it (threshold uncalibrated per GAP-010 → no % quoted).      */}
          {/* ---------------------------------------------------------------- */}
          {direction === "loss" &&
          selectedRow &&
          Number.isFinite(qtyNum) &&
          qtyNum > 0 &&
          reasonCode ? (
            <div
              className="rounded-md border border-info/40 bg-info-softer/50 px-4 py-3 text-sm text-info-fg transition-all duration-150"
              role="note"
              data-testid="waste-pre-submit-effect"
            >
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
                <div className="flex-1 space-y-1">
                  <div>
                    On submit, <strong>{selectedRow.label}</strong> stock will{" "}
                    <strong>decrease by {qtyNum} {unit}</strong>{" "}
                    (reason: {REASON_LABELS[reasonCode] ?? reasonCode}).
                  </div>
                  <div className="text-xs opacity-90">
                    Small losses post to the ledger immediately. Larger losses are held for planner approval; in that case stock does not change until approval completes.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Sticky submit bar — prominent primary action. */}
          <div
            className="sticky bottom-0 z-40 -mx-4 px-4 py-4 backdrop-blur-md bg-bg-raised/95 border-t border-border/60 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] flex items-center justify-end gap-3 sm:-mx-6 sm:px-6"
          >
            <button
              type="button"
              className="btn btn-ghost text-sm transition-colors duration-150"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="submit"
              className={cn(
                "btn btn-lg btn-primary transition-colors duration-150",
                phase === "submitting" && "cursor-wait"
              )}
              disabled={phase === "submitting" || confirmPending}
              data-testid="waste-submit"
            >
              {phase === "submitting" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
                  Submitting…
                </span>
              ) : (
                // Tranche 041 — both directions now open the review panel.
                "Review & submit"
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

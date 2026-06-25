"use client";

// ---------------------------------------------------------------------------
// Physical Count — operator form (live API backed).
//
// Endgame Phase B1:
//   - Dropdowns fetch from GET /api/items + /api/components (?status=ACTIVE).
//   - Step 1: GET /api/physical-count/open?item_type=&item_id= opens a
//     blind-count snapshot (NEVER returns snapshot_quantity). 200 returns
//     snapshot_id which operator uses on submit.
//   - Step 2: POST /api/physical-count with snapshot_id + counted_quantity
//     computes delta server-side and either auto-posts (201) or holds pending
//     approval (202).
//   - Blind-count invariant: UI never renders an expected quantity.
//   - Contract: src/lib/contracts/physical-count.ts.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { submitStockEvent } from "@/lib/stock/submit";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import { friendlyCountError } from "@/lib/copy/physical-count-errors";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Physical Count contract — inlined.
//
// Mirror of api/src/physical-counts/schemas.ts + docs/physical_count_runtime
// _contract.md. Inlined because src/lib/contracts/physical-count.ts is held
// out of the committed tree pending a Gate-3 commit-hygiene tranche. Keep
// aligned with upstream schema.
// ---------------------------------------------------------------------------

const PHYSICAL_COUNT_ITEM_TYPES = ["FG", "RM", "PKG"] as const;
type PhysicalCountItemType = (typeof PHYSICAL_COUNT_ITEM_TYPES)[number];

interface PhysicalCountOpenResponse {
  snapshot_id: string;
  item_type: PhysicalCountItemType;
  item_id: string;
  item_display_name: string;
  unit_default: string;
  opened_at: string;
  idempotent_open: boolean;
}

interface PhysicalCountSubmit {
  idempotency_key: string;
  snapshot_id: string;
  event_at: string;
  counted_quantity: number;
  unit: string;
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
  component_class: string | null;
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
}

// Mirror of db/migrations/0132_pre_launch_cleanup.sql:308-318 — PACKAGING /
// PACKAGING_SET / PKG / PACK component_class → item_type=PKG; everything else
// (including NULL component_class) → item_type=RM. Must stay aligned with
// COMPONENT_CLASS_BY_ITEM_TYPE in api/src/physical-counts/handler.ts:88.
function componentItemType(
  componentClass: string | null,
): PhysicalCountItemType {
  const c = (componentClass ?? "").trim().toUpperCase();
  if (c === "PACKAGING" || c === "PACKAGING_SET" || c === "PKG" || c === "PACK") {
    return "PKG";
  }
  return "RM";
}

type ListEnvelope<T> = { rows: T[]; count: number };

interface CountableRow {
  kind: "item" | "component";
  item_type: PhysicalCountItemType;
  id: string;
  label: string;
  default_uom: Uom;
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
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function toUom(raw: string | null | undefined): Uom {
  if (raw && (UOMS as readonly string[]).includes(raw)) return raw as Uom;
  return "UNIT";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

/** Format a date string as relative time (e.g. "just now", "3 min ago"). */
function formatRelative(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

/** Format event_at datetime-local string as relative time. */
function formatEventAtRelative(localDT: string): string {
  const d = new Date(localDT);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (Math.abs(diffSec) < 90) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

type Phase = "pick" | "counting" | "submitting" | "done";
interface DoneState {
  kind: "success" | "pending" | "error";
  message: string;
  detail?: string;
  itemSummary?: string;
  itemName?: string;
  delta?: string;
  href?: string;
  hrefLabel?: string;
  /** Short snapshot id (first 8 chars) for audit-trail correlation. */
  snapshotIdShort?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 2-step progress indicator — bigger, friendlier, accessible. */
function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-0">
      {/* Step 1 */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-bold transition-all duration-150",
            step >= 1
              ? "border-accent bg-accent text-accent-fg shadow-sm"
              : "border-border bg-bg text-fg-muted",
          )}
        >
          {step > 1 ? (
            <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            "1"
          )}
        </div>
        <span
          className={cn(
            "text-sm font-semibold transition-all duration-150",
            step === 1 ? "text-accent" : "text-fg-muted",
          )}
        >
          Select item
        </span>
      </div>

      {/* Connector line */}
      <div
        className={cn(
          "mb-6 h-1 w-20 rounded-full transition-all duration-300",
          step > 1 ? "bg-accent" : "bg-border",
        )}
      />

      {/* Step 2 */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-bold transition-all duration-150",
            step >= 2
              ? "border-accent bg-accent text-accent-fg shadow-sm"
              : "border-border bg-bg text-fg-muted",
          )}
        >
          2
        </div>
        <span
          className={cn(
            "text-sm font-semibold transition-all duration-150",
            step === 2 ? "text-accent" : "text-fg-muted",
          )}
        >
          Count
        </span>
      </div>
    </div>
  );
}

/**
 * Blind-count signpost — slim, calm, present. Communicates the most
 * important rule on this page (expected qty is intentionally hidden)
 * without overwhelming the eye.
 */
function BlindCountBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-bg-raised/70 px-3 py-1 text-xs font-semibold text-fg-muted">
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M2.5 2.5l15 15M8.34 8.34A2.5 2.5 0 0013.66 11.66M6.25 6.25C4.7 7.26 3.5 8.5 2.5 10c1.5 2.5 4.5 5 7.5 5a7.4 7.4 0 003.25-.75M10 5c.84 0 1.65.14 2.41.4C14.1 6.2 15.6 7.9 17.5 10c-.5.83-1.1 1.6-1.75 2.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Blind count
      </div>
    );
  }
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/60 bg-bg-raised/60 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M2.5 2.5l15 15M8.34 8.34A2.5 2.5 0 0013.66 11.66M6.25 6.25C4.7 7.26 3.5 8.5 2.5 10c1.5 2.5 4.5 5 7.5 5a7.4 7.4 0 003.25-.75M10 5c.84 0 1.65.14 2.41.4C14.1 6.2 15.6 7.9 17.5 10c-.5.83-1.1 1.6-1.75 2.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <div className="text-base font-bold text-fg leading-tight">Blind count</div>
        <div className="mt-0.5 text-sm text-fg-muted leading-snug">
          The expected quantity is hidden on purpose. Count what you see.
        </div>
      </div>
    </div>
  );
}

export default function PhysicalCountPage() {
  const queryClient = useQueryClient();
  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "ACTIVE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
  });
  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["master", "components", "ACTIVE"],
    queryFn: () => fetchJson("/api/components?status=ACTIVE&limit=1000"),
  });

  const countable: CountableRow[] = useMemo(() => {
    const items = itemsQuery.data?.rows ?? [];
    const components = componentsQuery.data?.rows ?? [];
    return [
      ...items.map<CountableRow>((i) => ({
        kind: "item",
        item_type: "FG",
        id: i.item_id,
        label: `${i.item_name} · ${i.sku ?? i.item_id}`,
        default_uom: toUom(i.sales_uom),
      })),
      ...components.map<CountableRow>((c) => ({
        kind: "component",
        item_type: componentItemType(c.component_class),
        id: c.component_id,
        label: `${c.component_name} · ${c.component_id}`,
        default_uom: toUom(c.inventory_uom ?? c.bom_uom ?? c.purchase_uom),
      })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }, [itemsQuery.data, componentsQuery.data]);

  const byKey = useMemo(() => {
    const m = new Map<string, CountableRow>();
    for (const r of countable) m.set(`${r.kind}:${r.id}`, r);
    return m;
  }, [countable]);

  // ---------------------------------------------------------------------------
  // Client-side search state — PURELY for display filtering.
  //
  // searchQuery never mutates countable, selKey, or any form-submission state.
  // filteredCountable is a computed read of countable; it never replaces the
  // underlying array, so selKey (which drives submission) is always stable.
  //
  // Invariant: if an operator enters "5" in the count field for item A, then
  // types a search term that hides item A from the selector, then clears the
  // search, item A reappears with "5" intact because countedQty is stored in
  // its own state variable keyed independently of the search state.
  // ---------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tranche 041 — StockTruthDrawer deep-links ?item_id=; pre-fill the
  // pick-step search once on mount so the operator lands on the right item
  // (mirrors the production-actual item_id prefill; one-shot, never stomps
  // a manually typed query afterwards).
  const searchParams = useSearchParams();
  const initialItemId = searchParams?.get("item_id") ?? "";
  const itemPrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (itemPrefillAppliedRef.current) return;
    itemPrefillAppliedRef.current = true;
    if (initialItemId) setSearchQuery(initialItemId);
  }, [initialItemId]);
  const countedQtyInputRef = useRef<HTMLInputElement>(null);
  // Anchor for the portaled dropdown — wraps the input row so we can measure
  // its viewport rect and position the panel directly below it. The wrapper
  // is a stable target across phase transitions (no remount on input refocus).
  const comboAnchorRef = useRef<HTMLDivElement>(null);
  const [comboOpen, setComboOpen] = useState(false);
  // Viewport-relative coordinates for the portaled dropdown. Recomputed on
  // open / scroll (capture phase) / resize so the panel tracks the input as
  // the page shifts, even when an inner scroll container scrolls (mobile
  // keyboard, sticky-element layout shifts, etc.).
  const [comboRect, setComboRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const filteredCountable = useMemo<CountableRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return countable;
    return countable.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [countable, searchQuery]);

  const [selKey, setSelKey] = useState<string>("");
  const [itemTypeOverride, setItemTypeOverride] = useState<
    PhysicalCountItemType | ""
  >("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [snapshot, setSnapshot] = useState<PhysicalCountOpenResponse | null>(
    null,
  );
  const [countedQty, setCountedQty] = useState<string>("");
  const [unit, setUnit] = useState<Uom>("UNIT");
  const [eventAt, setEventAt] = useState<string>(nowLocalDateTime());
  const [notes, setNotes] = useState<string>("");
  const [done, setDone] = useState<DoneState | null>(null);

  // New UI-only states
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // Relative time ticker — refreshes every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loading = itemsQuery.isLoading || componentsQuery.isLoading;
  const loadErr = itemsQuery.error || componentsQuery.error;

  // Auto-focus combobox when on pick phase
  useEffect(() => {
    if (phase === "pick" && !loading && !loadErr) {
      searchInputRef.current?.focus();
    }
  }, [phase, loading, loadErr]);

  // Auto-focus the counted-quantity input the moment Step 2 renders so the
  // operator can start typing without a tap. Important on mobile where any
  // extra tap means an extra second per count.
  useEffect(() => {
    if (phase === "counting") {
      // Small delay to let the input mount after the phase transition.
      const t = setTimeout(() => countedQtyInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Position-tracking for the portaled dropdown.
  // We portal the dropdown to <body> so it can never be clipped by an
  // ancestor `overflow-hidden` / `transform` / `filter` / `contain` rule
  // (the AppShellChrome wrapper applies `overflow-x-hidden` on mobile,
  // which was the root cause of the clipped dropdown on Step 1).
  // - position: fixed → coordinates are viewport-relative; do NOT add scroll
  //   offsets.
  // - useLayoutEffect for the initial measurement so the panel paints in
  //   the right spot on the same frame it opens (no flash at 0,0).
  // - Listen for scroll on the *capture* phase so inner scroll containers
  //   (e.g. the page main, sticky shells, iOS bounce) also fire updates.
  // - Listen for resize for keyboard show/hide on mobile and orientation.
  useLayoutEffect(() => {
    if (!comboOpen) return;
    const measure = () => {
      const el = comboAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setComboRect({ top: r.bottom, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [comboOpen]);

  // Derived: selected row label for the chip display
  const selectedRow = selKey ? byKey.get(selKey) : undefined;

  // ---------------------------------------------------------------------------
  // Business logic — DO NOT MODIFY
  // ---------------------------------------------------------------------------

  async function handleOpen(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDone(null);
    const row = byKey.get(selKey);
    if (!row) {
      setDone({ kind: "error", message: "Choose an item or component." });
      return;
    }
    const effectiveType: PhysicalCountItemType =
      itemTypeOverride || row.item_type;
    setPhase("submitting");
    try {
      const q = new URLSearchParams({
        item_type: effectiveType,
        item_id: row.id,
      });
      const res = await fetch(`/api/physical-count/open?${q.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object") {
        const snap = body as PhysicalCountOpenResponse;
        setSnapshot(snap);
        setUnit(toUom(snap.unit_default));
        setPhase("counting");
      } else {
        setDone({
          kind: "error",
          message: "Could not start the count.",
          detail: friendlyCountError(body, res.status),
        });
        setPhase("pick");
      }
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error opening snapshot.",
        detail: err instanceof Error ? err.message : String(err),
      });
      setPhase("pick");
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!snapshot) return;
    setDone(null);
    const qtyNum = Number(countedQty);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      setDone({
        kind: "error",
        message: "Counted quantity must be a non-negative number.",
      });
      return;
    }
    const envelope: PhysicalCountSubmit = {
      idempotency_key: newIdempotencyKey(),
      snapshot_id: snapshot.snapshot_id,
      event_at: (Number.isNaN(new Date(eventAt).getTime()) ? new Date() : new Date(eventAt)).toISOString(),
      counted_quantity: qtyNum,
      unit,
      notes: notes ? notes : null,
    };
    setPhase("submitting");
    const itemLabel = snapshot
      ? `${snapshot.item_display_name} (${snapshot.item_type} ${snapshot.item_id})`
      : "?";
    const result = await submitStockEvent<{
      status?: string;
      submission_id?: string;
      computed_delta?: string;
      approval_reason?: string;
      idempotent_replay?: boolean;
    }>("/api/physical-count", envelope);
    switch (result.kind) {
      case "posted":
        setDone({
          kind: "success",
          message: result.idempotentReplay
            ? "Already posted earlier — no duplicate created."
            : "Count posted successfully.",
          itemName: snapshot?.item_display_name,
          delta: result.body.computed_delta,
          itemSummary: `${itemLabel} · counted: ${qtyNum} ${unit} · adjustment: ${result.body.computed_delta ?? "?"}`,
          detail: `ref: ${result.submissionId}`,
          snapshotIdShort: snapshot?.snapshot_id?.slice(0, 8),
        });
        resetFlow();
        break;
      case "pending":
        // A new approval was created; refresh the inbox so its physical-count
        // source and unread count reflect it immediately (not after staleTime).
        void queryClient.invalidateQueries({ queryKey: ["inbox"] });
        setDone({
          kind: "pending",
          message:
            "Count variance exceeds threshold — held for planner approval.",
          itemName: snapshot?.item_display_name,
          delta: result.body.computed_delta,
          itemSummary: `${itemLabel} · counted: ${qtyNum} ${unit} · adjustment: ${result.body.computed_delta ?? "?"}`,
          detail: `ref: ${result.submissionId}`,
          href: result.submissionId
            ? `/inbox/approvals/physical-count/${encodeURIComponent(result.submissionId)}`
            : undefined,
          hrefLabel: "Open approval",
          snapshotIdShort: snapshot?.snapshot_id?.slice(0, 8),
        });
        resetFlow();
        break;
      case "rejected":
        setDone({
          kind: "error",
          message: "Could not submit the count.",
          detail: friendlyCountError(result.body, result.status),
        });
        setPhase("counting");
        break;
      case "network":
        setDone({
          kind: "error",
          message: "Network error submitting count.",
          detail:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        });
        setPhase("counting");
        break;
    }
  }

  function resetFlow(): void {
    setSnapshot(null);
    setCountedQty("");
    setNotes("");
    setSelKey("");
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setCancelConfirm(false);
    setSearchQuery("");
    setComboOpen(false);
  }

  async function handleCancel(): Promise<void> {
    // If there's no open snapshot, just reset the client state.
    if (!snapshot) {
      resetFlow();
      return;
    }
    const snapshotId = snapshot.snapshot_id;
    const idempotencyKey = newIdempotencyKey();
    setPhase("submitting");
    try {
      // Fire-and-reset: the POST must land to free the server-side snapshot,
      // but the operator-visible UX should reset regardless of transient
      // network errors (a stuck snapshot would auto-expire server-side and
      // the next /open for the same item would idempotently heal).
      await fetch(
        `/api/physical-count/${encodeURIComponent(snapshotId)}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ idempotency_key: idempotencyKey }),
        },
      );
    } catch {
      // Swallow — client reset still proceeds.
    } finally {
      resetFlow();
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const fgItems = filteredCountable.filter((r) => r.item_type === "FG");
  const rmItems = filteredCountable.filter((r) => r.item_type === "RM");
  const pkgItems = filteredCountable.filter((r) => r.item_type === "PKG");

  /** Parse delta string like "+5.00" or "-3.00" for coloring */
  function parseDeltaSign(delta: string | undefined): "positive" | "negative" | "neutral" {
    if (!delta) return "neutral";
    const trimmed = delta.trim();
    if (trimmed.startsWith("+")) return "positive";
    if (trimmed.startsWith("-")) return "negative";
    const n = parseFloat(trimmed);
    if (!isNaN(n) && n > 0) return "positive";
    if (!isNaN(n) && n < 0) return "negative";
    return "neutral";
  }

  const isStep1Submitting = phase === "submitting" && !snapshot;

  return (
    <>
      <WorkflowHeader
        size="section"
        eyebrow="Operator form"
        title="Physical Count"
        description="Pick an item, count what you see, submit."
      />

      {/* Result banner — unified layout across success / pending / error.
          A 14x14 colored icon badge anchors the eye; an outcome title
          + supporting detail line read top-down; the delta lands as a
          prominent chip when the API returned one; primary action is
          left-most, secondary action is a ghost button to its right;
          ref/snapshot id sits as a faint mono trailer. */}
      {done ? (() => {
        const isSuccess = done.kind === "success";
        const isPending = done.kind === "pending";
        const isError = done.kind === "error";
        const tone = isSuccess
          ? "border-success/40 bg-success-softer text-success-fg"
          : isPending
            ? "border-warning/40 bg-warning-softer text-warning-fg"
            : "border-danger/40 bg-danger-softer text-danger-fg";
        const badgeTone = isSuccess
          ? "bg-success/15 text-success-fg"
          : isPending
            ? "bg-warning/20 text-warning-fg"
            : "bg-danger/15 text-danger-fg";
        const title = isPending
          ? "Held for planner approval"
          : isError
            ? "Count not submitted"
            : done.message;
        const sub = isPending
          ? <>Large variance vs the snapshot. <strong>Stock has not changed yet</strong> — the new anchor is applied only after approval.</>
          : isError
            ? done.message
            : done.itemName;
        const deltaSign = parseDeltaSign(done.delta);
        return (
          <div
            className={cn(
              "mb-6 rounded-2xl border px-5 py-5 transition-all duration-150 sm:px-6",
              tone,
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-4">
              <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full", badgeTone)}>
                {isSuccess && (
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {isPending && (
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {isError && (
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-tight sm:text-xl">{title}</div>
                {sub ? (
                  <div className="mt-1 text-sm leading-snug opacity-90">
                    {isSuccess && done.itemName ? (
                      <span className="font-semibold">{done.itemName}</span>
                    ) : sub}
                  </div>
                ) : null}

                {/* Delta chip — center stage for any non-zero adjustment. */}
                {done.delta ? (
                  <div className={cn(
                    "mt-3 inline-flex items-baseline gap-1.5 rounded-full px-3 py-1 text-base font-bold tabular-nums",
                    deltaSign === "positive"
                      ? "bg-success/20 text-success-fg"
                      : deltaSign === "negative"
                        ? "bg-danger/20 text-danger-fg"
                        : "bg-bg-raised text-fg-muted",
                  )}>
                    <span className="text-xs font-semibold uppercase tracking-sops opacity-75">
                      Adjustment
                    </span>
                    <span>{done.delta}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Action row */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-current/10 pt-4">
              {isSuccess && (
                <Link
                  href="/stock/movement-log"
                  className="btn btn-primary btn-sm"
                  data-testid="physical-count-success-movement-log"
                >
                  View posted ledger →
                </Link>
              )}
              {isPending && done.href && (
                <Link
                  href={done.href}
                  className="btn btn-primary btn-sm"
                  data-testid="physical-count-banner-link"
                >
                  {done.hrefLabel ?? "Open approval"}
                </Link>
              )}
              {isError && snapshot && (
                <button
                  type="button"
                  onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                  className="btn btn-primary btn-sm"
                  data-testid="physical-count-error-retry"
                >
                  Try again
                </button>
              )}
              {!isError && (
                <button
                  type="button"
                  onClick={() => setDone(null)}
                  className="btn btn-ghost btn-sm"
                >
                  Count another item
                </button>
              )}
              {isError && (
                <button
                  type="button"
                  onClick={() => setDone(null)}
                  className="btn btn-ghost btn-sm"
                >
                  Dismiss
                </button>
              )}

              {/* ref + snapshot trailer — faint mono so it doesn't
                  compete; on mobile it stacks under the action buttons. */}
              {(done.detail || done.snapshotIdShort) ? (
                <div className="ml-auto font-mono text-3xs opacity-60">
                  {done.detail}
                  {done.snapshotIdShort ? (
                    <span className="ml-2 opacity-80">· snapshot {done.snapshotIdShort}…</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : null}

      {/* ----------------------------------------------------------------
          Loading / error skeleton
          ---------------------------------------------------------------- */}
      {loading ? (
        <SectionCard title="Loading masters…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            </div>
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        </SectionCard>
      ) : loadErr ? (
        <SectionCard title="Could not load items and components">
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
            <div className="font-semibold">Could not load masters</div>
            <div className="mt-1 text-xs">{(loadErr as Error).message}</div>
            <button
              type="button"
              onClick={() => {
                void itemsQuery.refetch();
                void componentsQuery.refetch();
              }}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      ) : phase === "pick" ? (
        /* ----------------------------------------------------------------
           STEP 1 — Pick item
           ---------------------------------------------------------------- */
        <form onSubmit={handleOpen} className="space-y-6 pb-24" data-testid="physical-count-step-1">
          <StepIndicator step={1} />
          <BlindCountBanner />

          <SectionCard
            title="What are you counting?"
            description="Search by name, code, or scan."
          >
            <div className="space-y-3">
              {/* Selected chip — shows the locked-in choice. Tappable to
                  change. */}
              {selectedRow && !comboOpen ? (
                <div
                  className="flex items-center gap-3 rounded-xl border-2 border-accent/40 bg-accent/5 px-4 py-3 transition-all duration-150"
                  data-testid="physical-count-selected"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
                    <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-bold uppercase tracking-sops",
                    selectedRow.item_type === "FG"
                      ? "bg-info-softer text-info-fg"
                      : selectedRow.item_type === "PKG"
                        ? "bg-warning-softer text-warning-fg"
                        : "bg-bg-raised text-fg-muted",
                  )}>
                    {selectedRow.item_type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
                    {selectedRow.label}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0 transition-all duration-150"
                    onClick={() => {
                      setSelKey("");
                      setComboOpen(true);
                      setTimeout(() => searchInputRef.current?.focus(), 0);
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                /* Combobox input — bigger, with leading search icon and
                    clear button as an inline chip. */
                <div className="relative">
                  <div
                    ref={comboAnchorRef}
                    className="relative flex min-w-0 items-center"
                    data-testid="physical-count-combobox"
                  >
                    <svg
                      className="pointer-events-none absolute left-4 h-5 w-5 text-fg-muted"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="search"
                      className="input h-12 w-full pl-12 pr-12 text-base"
                      placeholder="Search items and components…"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setComboOpen(true);
                      }}
                      onFocus={() => setComboOpen(true)}
                      autoComplete="off"
                      aria-label="Search items and components"
                      data-testid="physical-count-search"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-150"
                        onClick={() => {
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search"
                        data-testid="physical-count-search-clear"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  {/* Result count */}
                  {searchQuery.trim() ? (
                    <p
                      className="mt-2 text-xs text-fg-muted"
                      aria-live="polite"
                      data-testid="physical-count-search-result-count"
                    >
                      {filteredCountable.length > 0
                        ? `${filteredCountable.length} item${filteredCountable.length === 1 ? "" : "s"}`
                        : "No items match your search."}
                    </p>
                  ) : null}

                  {/* Dropdown — portaled to <body> with position: fixed so no
                      ancestor `overflow:hidden` / `transform` / `filter` /
                      `contain` rule can clip it. Coordinates are computed
                      from the input wrapper's getBoundingClientRect() and
                      kept in sync via the layout effect above. */}
                  {comboOpen && comboRect && typeof document !== "undefined"
                    ? createPortal(
                        <div
                          className="z-50 max-h-80 overflow-auto rounded-xl border border-border bg-bg shadow-xl ring-1 ring-border/40"
                          style={{
                            position: "fixed",
                            top: comboRect.top + 6,
                            left: comboRect.left,
                            width: comboRect.width,
                          }}
                          role="listbox"
                          aria-label="Items and components"
                        >
                          {filteredCountable.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-fg-muted">
                              {searchQuery.trim() ? "No items match your search." : "No items available."}
                            </div>
                          ) : (
                            <>
                              {fgItems.length > 0 && (
                                <div>
                                  <div className="sticky top-0 z-10 bg-bg-raised px-4 py-2 text-2xs font-bold uppercase tracking-sops text-fg-muted border-b border-border/60">
                                    Finished Goods
                                  </div>
                                  {fgItems.map((r) => (
                                    <button
                                      key={`${r.kind}:${r.id}`}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-bg-subtle",
                                        selKey === `${r.kind}:${r.id}` && "bg-accent/10 text-accent",
                                      )}
                                      onClick={() => {
                                        setSelKey(`${r.kind}:${r.id}`);
                                        setItemTypeOverride("");
                                        setComboOpen(false);
                                        setSearchQuery("");
                                      }}
                                    >
                                      <span className="shrink-0 rounded-full bg-info-softer px-2 py-0.5 text-2xs font-bold uppercase text-info-fg">FG</span>
                                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                      {selKey === `${r.kind}:${r.id}` && (
                                        <svg className="h-4 w-4 shrink-0 text-accent" viewBox="0 0 16 16" fill="none">
                                          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {rmItems.length > 0 && (
                                <div>
                                  <div className="sticky top-0 z-10 bg-bg-raised px-4 py-2 text-2xs font-bold uppercase tracking-sops text-fg-muted border-b border-border/60">
                                    Raw Materials
                                  </div>
                                  {rmItems.map((r) => (
                                    <button
                                      key={`${r.kind}:${r.id}`}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-bg-subtle",
                                        selKey === `${r.kind}:${r.id}` && "bg-accent/10 text-accent",
                                      )}
                                      onClick={() => {
                                        setSelKey(`${r.kind}:${r.id}`);
                                        setItemTypeOverride("");
                                        setComboOpen(false);
                                        setSearchQuery("");
                                      }}
                                    >
                                      <span className="shrink-0 rounded-full bg-bg-subtle px-2 py-0.5 text-2xs font-bold uppercase text-fg-muted">RM</span>
                                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                      {selKey === `${r.kind}:${r.id}` && (
                                        <svg className="h-4 w-4 shrink-0 text-accent" viewBox="0 0 16 16" fill="none">
                                          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {pkgItems.length > 0 && (
                                <div>
                                  <div className="sticky top-0 z-10 bg-bg-raised px-4 py-2 text-2xs font-bold uppercase tracking-sops text-fg-muted border-b border-border/60">
                                    Packaging
                                  </div>
                                  {pkgItems.map((r) => (
                                    <button
                                      key={`${r.kind}:${r.id}`}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-bg-subtle",
                                        selKey === `${r.kind}:${r.id}` && "bg-accent/10 text-accent",
                                      )}
                                      onClick={() => {
                                        setSelKey(`${r.kind}:${r.id}`);
                                        setItemTypeOverride("");
                                        setComboOpen(false);
                                        setSearchQuery("");
                                      }}
                                    >
                                      <span className="shrink-0 rounded-full bg-warning-softer px-2 py-0.5 text-2xs font-bold uppercase text-warning-fg">PKG</span>
                                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                      {selKey === `${r.kind}:${r.id}` && (
                                        <svg className="h-4 w-4 shrink-0 text-accent" viewBox="0 0 16 16" fill="none">
                                          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
              )}
            </div>

            {/* Advanced — item type override, collapsed by default */}
            <div className="mt-2 border-t border-border/40 pt-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-all duration-150"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                <svg
                  className={cn("h-3.5 w-3.5 transition-transform duration-150", advancedOpen && "rotate-90")}
                  viewBox="0 0 12 12" fill="none"
                >
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Advanced
              </button>
              {advancedOpen && (
                <div className="mt-3">
                  <label className="block min-w-0">
                    <span className="mb-2 block text-sm font-semibold text-fg">
                      Item type override (optional)
                    </span>
                    <select
                      className="input"
                      value={itemTypeOverride}
                      onChange={(e) =>
                        setItemTypeOverride(
                          e.target.value as PhysicalCountItemType | "",
                        )
                      }
                    >
                      <option value="">(use default based on picker)</option>
                      {PHYSICAL_COUNT_ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </SectionCard>

          <div className="flex items-center justify-end gap-2 py-4">
            <button
              type="submit"
              className={cn(
                "btn btn-lg btn-primary transition-all duration-150",
                !selKey && "opacity-50 cursor-not-allowed",
              )}
              disabled={!selKey || isStep1Submitting}
            >
              {isStep1Submitting ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Opening snapshot…
                </>
              ) : (
                <>
                  Start counting
                  <svg className="ml-1.5 h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      ) : phase === "counting" || phase === "submitting" || phase === "done" ? (
        /* ----------------------------------------------------------------
           STEP 2 — Enter counted quantity
           ---------------------------------------------------------------- */
        <form onSubmit={handleSubmit} className="space-y-6 pb-24" data-testid="physical-count-step-2">
          <StepIndicator step={2} />
          <BlindCountBanner compact />

          {/* Snapshot pill — horizontal, calm, never louder than the
              hero qty below. Item identity dominates; snapshot id and
              opened-at are intentionally faint. The chip color codes
              FG / RM / PKG. "Resumed" is signalled only when relevant.
              The full snapshot id is on the title attribute of the
              copy button so curious admins can read it on hover. */}
          {snapshot ? (
            <div
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-bg-raised px-5 py-3.5 sm:gap-4 sm:px-6"
              data-testid="physical-count-snapshot-pill"
            >
              <span className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-2xs font-bold uppercase tracking-sops",
                snapshot.item_type === "FG"
                  ? "bg-info-softer text-info-fg"
                  : snapshot.item_type === "PKG"
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-bg-subtle text-fg-muted",
              )}>
                {snapshot.item_type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-fg leading-tight sm:text-lg">
                  {snapshot.item_display_name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
                  <span>Started {formatRelative(snapshot.opened_at)}</span>
                  {snapshot.idempotent_open ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-warning-fg font-medium">resumed</span>
                    </>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                title={`Snapshot ${snapshot.snapshot_id}`}
                className="shrink-0 rounded-full p-2 text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => void navigator.clipboard.writeText(snapshot.snapshot_id)}
                aria-label="Copy snapshot id"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-7A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}

          {/* Hero quantity block — owns the page. No surrounding
              SectionCard chrome competing for attention; the input
              itself IS the section. */}
          <div className="py-4">
            <div className="text-center">
              <div className="text-sm font-semibold uppercase tracking-sops text-fg-muted">
                How many did you count?
              </div>
            </div>
            <div className="mt-5 flex items-center justify-center gap-3 sm:gap-4" data-testid="physical-count-qty">
              <button
                type="button"
                className="btn flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold leading-none transition-all duration-150 sm:h-20 sm:w-20 sm:text-4xl"
                onClick={() => {
                  const n = parseFloat(countedQty) || 0;
                  setCountedQty(String(Math.max(0, n - 1)));
                }}
                aria-label="Decrease quantity"
                disabled={phase === "submitting"}
              >
                −
              </button>
              <input
                ref={countedQtyInputRef}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0"
                className="input h-20 w-44 text-center text-5xl font-mono font-bold tabular-nums placeholder:text-fg-faint/40 sm:h-24 sm:w-56 sm:text-6xl"
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
                required
                disabled={phase === "submitting"}
                aria-label="Counted quantity"
              />
              <button
                type="button"
                className="btn flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold leading-none transition-all duration-150 sm:h-20 sm:w-20 sm:text-4xl"
                onClick={() => {
                  const n = parseFloat(countedQty) || 0;
                  setCountedQty(String(n + 1));
                }}
                aria-label="Increase quantity"
                disabled={phase === "submitting"}
              >
                +
              </button>
            </div>

            {/* Unit chips — centered under the hero. Once a snapshot is open
                the unit is locked to the item master's counting unit: the
                server refuses any other unit (UNIT_INCOMPATIBLE), so offering
                it would only manufacture an avoidable error (FLOW-209). */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2" data-testid="physical-count-unit">
              {UOMS.map((u) => {
                const lockedUnit = snapshot ? toUom(snapshot.unit_default) : null;
                const lockedOut = lockedUnit !== null && u !== lockedUnit;
                return (
                  <button
                    key={u}
                    type="button"
                    className={cn(
                      "rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all duration-150",
                      unit === u
                        ? "border-accent bg-accent text-accent-fg shadow-sm"
                        : "border-border bg-bg text-fg",
                      lockedOut
                        ? "cursor-not-allowed opacity-35"
                        : "cursor-pointer hover:border-fg-muted",
                    )}
                    onClick={() => setUnit(u as Uom)}
                    disabled={phase === "submitting" || lockedOut}
                    title={
                      lockedOut
                        ? `This item is counted in ${lockedUnit} (set on the item master).`
                        : undefined
                    }
                  >
                    {u}
                  </button>
                );
              })}
            </div>
            {snapshot ? (
              <p className="mt-2 text-center text-2xs text-fg-subtle">
                Unit is set by the item master.
              </p>
            ) : null}
          </div>

          {/* Secondary details — collapsed by default. Event time and
              notes are needed in &lt; 10% of counts; surfacing them on
              demand keeps the primary path uncluttered. */}
          <details className="group rounded-xl border border-border/60 bg-bg-raised/40 [&[open]]:bg-bg-raised">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-fg hover:bg-bg-subtle/50 rounded-xl group-[&[open]]:rounded-b-none transition-colors duration-150">
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 text-fg-muted transition-transform duration-200 group-open:rotate-90" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Event time &amp; notes
              </span>
              <span className="text-xs font-normal text-fg-muted">
                {notes.trim() ? "1 note" : formatEventAtRelative(eventAt)}
              </span>
            </summary>
            <div className="border-t border-border/40 px-5 py-4 space-y-4">
              <label className="block min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">
                    Event time
                  </span>
                  <span className="text-xs text-fg-muted">
                    {formatEventAtRelative(eventAt)}
                  </span>
                </div>
                <input
                  type="datetime-local"
                  className="input"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  required
                  disabled={phase === "submitting"}
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-2 block text-sm font-semibold text-fg">
                  Notes
                </span>
                <div className="relative">
                  <textarea
                    className="input min-h-[3.5rem] w-full resize-y pb-5"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional — note any discrepancy or condition."
                    disabled={phase === "submitting"}
                  />
                  <span className="absolute bottom-1.5 right-2.5 text-3xs text-fg-muted pointer-events-none">
                    {notes.length}
                  </span>
                </div>
              </label>
            </div>
          </details>

          {/* Pre-submit tip — calm, single line. Small variance auto-
              posts; large variance is held for planner approval. The
              threshold is uncalibrated (GAP-010); the copy describes
              both outcomes without quoting a number. */}
          {snapshot && countedQty && Number.isFinite(parseFloat(countedQty)) ? (
            <div
              className="flex items-center gap-3 rounded-xl bg-bg-subtle/60 px-4 py-3 text-sm text-fg-muted"
              role="note"
              data-testid="physical-count-pre-submit-effect"
            >
              <svg className="h-4 w-4 shrink-0 text-info-fg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8h.01M11 12h1v5h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="leading-snug">
                Small variance posts now and replaces the stock anchor for <strong className="text-fg">{snapshot.item_display_name}</strong>. Large variance is held for planner approval — stock will not change until approved.
              </span>
            </div>
          ) : null}

          {/* Cancel-snapshot confirm — inline, danger-toned, two clear
              choices. Keep counting is the obvious primary because the
              destructive path is the rarer intent. */}
          {cancelConfirm ? (
            <div
              className="rounded-xl border border-danger/40 bg-danger-softer px-5 py-4 transition-all duration-150"
              data-testid="physical-count-cancel-confirm"
              role="alertdialog"
            >
              <div className="text-base font-bold text-danger-fg leading-tight">
                Cancel this count?
              </div>
              <div className="mt-1 text-sm text-danger-fg/90 leading-snug">
                The snapshot will be released. Anything you typed is lost.
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setCancelConfirm(false)}
                  autoFocus
                >
                  Keep counting
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => void handleCancel()}
                  disabled={phase === "submitting"}
                  data-testid="physical-count-cancel-proceed"
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Sticky action bar. Submit dominates; cancel is a ghost
              link-style button so it doesn't compete visually, but
              uses danger tone on the confirm step so the destructive
              action is clearly marked. */}
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg-raised/95 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
            <button
              type="button"
              title="This releases the open snapshot. You will start over."
              className="btn btn-ghost btn-sm text-fg-muted hover:text-danger-fg transition-colors duration-150"
              onClick={() => setCancelConfirm(true)}
              disabled={phase === "submitting" || cancelConfirm}
            >
              Cancel snapshot
            </button>

            <button
              type="submit"
              className="btn btn-lg btn-primary transition-all duration-150"
              disabled={phase === "submitting" || !countedQty}
              data-testid="physical-count-submit"
            >
              {phase === "submitting" ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Submitting…
                </>
              ) : (
                <>
                  Submit count
                  <svg className="ml-1.5 h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      ) : null}

      {/* Close combobox on outside click */}
      {comboOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setComboOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}

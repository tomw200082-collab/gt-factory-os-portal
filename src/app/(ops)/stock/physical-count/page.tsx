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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";
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
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 2-step progress indicator */
function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-0">
      {/* Step 1 */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-150",
            step >= 1
              ? "border-accent bg-accent text-white"
              : "border-border bg-bg text-fg-muted",
          )}
        >
          {step > 1 ? (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            "1"
          )}
        </div>
        <span
          className={cn(
            "text-xs font-medium transition-all duration-150",
            step === 1 ? "text-accent" : "text-fg-muted",
          )}
        >
          Select item
        </span>
      </div>

      {/* Connector line */}
      <div
        className={cn(
          "mb-5 h-0.5 w-16 transition-all duration-300",
          step > 1 ? "bg-accent" : "bg-border",
        )}
      />

      {/* Step 2 */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-150",
            step >= 2
              ? "border-accent bg-accent text-white"
              : "border-border bg-bg text-fg-muted",
          )}
        >
          2
        </div>
        <span
          className={cn(
            "text-xs font-medium transition-all duration-150",
            step === 2 ? "text-accent" : "text-fg-muted",
          )}
        >
          Count
        </span>
      </div>
    </div>
  );
}

/** Blind count banner — full on step 1, compact badge on step 2 */
function BlindCountBanner({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-bg-raised px-3 py-1 text-xs font-medium text-fg-muted">
        {/* eye-slash icon */}
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M2.5 2.5l15 15M8.34 8.34A2.5 2.5 0 0013.66 11.66M6.25 6.25C4.7 7.26 3.5 8.5 2.5 10c1.5 2.5 4.5 5 7.5 5a7.4 7.4 0 003.25-.75M10 5c.84 0 1.65.14 2.41.4C14.1 6.2 15.6 7.9 17.5 10c-.5.83-1.1 1.6-1.75 2.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Blind count active
      </div>
    );
  }
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-bg-raised px-4 py-3">
      {/* eye-slash icon */}
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M2.5 2.5l15 15M8.34 8.34A2.5 2.5 0 0013.66 11.66M6.25 6.25C4.7 7.26 3.5 8.5 2.5 10c1.5 2.5 4.5 5 7.5 5a7.4 7.4 0 003.25-.75M10 5c.84 0 1.65.14 2.41.4C14.1 6.2 15.6 7.9 17.5 10c-.5.83-1.1 1.6-1.75 2.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <div className="text-sm font-semibold text-fg">BLIND COUNT</div>
        <div className="mt-0.5 text-xs text-fg-muted">
          You are counting blind — the expected quantity is hidden to keep your count unbiased.
        </div>
      </div>
    </div>
  );
}

export default function PhysicalCountPage() {
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
        const detail = body ? JSON.stringify(body) : `HTTP ${res.status}`;
        setDone({
          kind: "error",
          message: `Failed to open count snapshot (HTTP ${res.status}).`,
          detail,
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
      event_at: new Date(eventAt).toISOString(),
      counted_quantity: qtyNum,
      unit,
      notes: notes ? notes : null,
    };
    setPhase("submitting");
    try {
      const res = await fetch("/api/physical-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            status?: string;
            submission_id?: string;
            computed_delta?: string;
            approval_reason?: string;
            idempotent_replay?: boolean;
          }
        | null;
      if (body && body.status === "posted") {
        const itemLabel = snapshot
          ? `${snapshot.item_display_name} (${snapshot.item_type} ${snapshot.item_id})`
          : "?";
        setDone({
          kind: "success",
          message: body.idempotent_replay
            ? "Count already recorded."
            : "Count posted successfully.",
          itemName: snapshot?.item_display_name,
          delta: body.computed_delta,
          itemSummary: `${itemLabel} · counted: ${qtyNum} ${unit} · adjustment: ${body.computed_delta ?? "?"}`,
          detail: `ref: ${body.submission_id}`,
        });
        resetFlow();
      } else if (body && body.status === "pending") {
        const sid = body.submission_id;
        const itemLabel = snapshot
          ? `${snapshot.item_display_name} (${snapshot.item_type} ${snapshot.item_id})`
          : "?";
        setDone({
          kind: "pending",
          message:
            "Count variance exceeds threshold — held for planner approval.",
          itemName: snapshot?.item_display_name,
          delta: body.computed_delta,
          itemSummary: `${itemLabel} · counted: ${qtyNum} ${unit} · adjustment: ${body.computed_delta ?? "?"}`,
          detail: `ref: ${sid}`,
          href: sid
            ? `/inbox/approvals/physical-count/${encodeURIComponent(sid)}`
            : undefined,
          hrefLabel: "Open approval",
        });
        resetFlow();
      } else {
        const detail = body ? JSON.stringify(body) : `HTTP ${res.status}`;
        setDone({
          kind: "error",
          message: "Could not submit. Check your connection and try again.",
          detail,
        });
        setPhase("counting");
      }
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error submitting count.",
        detail: err instanceof Error ? err.message : String(err),
      });
      setPhase("counting");
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
        eyebrow="Operator form"
        title="Physical Count"
        description="Blind count — enter what you actually see. Expected quantities are hidden to keep the count unbiased."
      />

      {/* ----------------------------------------------------------------
          Result banner — success / pending / error
          ---------------------------------------------------------------- */}
      {done ? (
        <div
          className={cn(
            "mb-6 rounded-xl border px-5 py-4 transition-all duration-150",
            done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : done.kind === "pending"
                ? "border-warning/40 bg-warning-softer text-warning-fg"
                : "border-danger/40 bg-danger-softer text-danger-fg",
          )}
          role="status"
        >
          {done.kind === "success" ? (
            <div className="space-y-3">
              {/* Animated checkmark */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/20">
                  <svg className="h-6 w-6 text-success-fg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-base">{done.message}</div>
                  {done.itemName && (
                    <div className="text-sm font-medium opacity-90">{done.itemName}</div>
                  )}
                </div>
              </div>
              {done.delta && (
                <div className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                  parseDeltaSign(done.delta) === "positive"
                    ? "bg-success/20 text-success-fg"
                    : parseDeltaSign(done.delta) === "negative"
                      ? "bg-danger/20 text-danger-fg"
                      : "bg-bg-raised text-fg-muted",
                )}>
                  Adjustment: {done.delta}
                </div>
              )}
              {done.detail && (
                <div className="font-mono text-xs opacity-60">{done.detail}</div>
              )}
              <button
                type="button"
                onClick={() => setDone(null)}
                className="btn btn-ghost btn-sm transition-all duration-150"
              >
                Count another item
              </button>
            </div>
          ) : done.kind === "pending" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20">
                  <svg className="h-6 w-6 text-warning-fg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-base">{done.itemName ?? "Count submitted"}</div>
                  <div className="text-sm opacity-90">This count has a large variance and is held for planner approval.</div>
                </div>
              </div>
              {done.delta && (
                <div className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                  parseDeltaSign(done.delta) === "positive"
                    ? "bg-success/20 text-success-fg"
                    : parseDeltaSign(done.delta) === "negative"
                      ? "bg-danger/20 text-danger-fg"
                      : "bg-bg-raised text-fg-muted",
                )}>
                  Adjustment: {done.delta}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {done.href ? (
                  <Link
                    href={done.href}
                    className="btn btn-primary btn-sm transition-all duration-150"
                    data-testid="physical-count-banner-link"
                  >
                    {done.hrefLabel ?? "Open approval"}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDone(null)}
                  className="btn btn-ghost btn-sm transition-all duration-150"
                >
                  Count another item
                </button>
              </div>
              {done.detail && (
                <div className="font-mono text-xs opacity-60">{done.detail}</div>
              )}
            </div>
          ) : (
            /* Error */
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{done.message}</div>
              </div>
              {done.itemSummary ? (
                <div className="mt-1 text-xs font-medium opacity-90">{done.itemSummary}</div>
              ) : null}
              {done.detail ? (
                <div className="mt-1 font-mono text-xs opacity-60">{done.detail}</div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

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
        <form onSubmit={handleOpen} className="space-y-5 pb-20" data-testid="physical-count-step-1">
          <StepIndicator step={1} />
          <BlindCountBanner />

          <SectionCard
            title="Step 1 — choose what to count"
            description="Select the item you are about to count. The expected quantity is not shown to keep the count unbiased."
          >
            {/* ------------------------------------------------------------------
                Search / combobox — client-side only. No API calls.
                Filtering changes render visibility only. selKey is stored in
                separate state and is NEVER cleared or mutated by searchQuery.
                countedQty is stored separately from any search state, so
                values entered in the count field persist across search
                interactions (see invariant comment in state declarations above).
                ------------------------------------------------------------------ */}
            <div className="mb-4 space-y-1">
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Item / component *
              </span>

              {/* Selected chip */}
              {selectedRow && !comboOpen ? (
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 transition-all duration-150">
                    <svg className="h-4 w-4 shrink-0 text-accent" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className={cn(
                      "chip shrink-0 text-3xs",
                      selectedRow.item_type === "FG"
                        ? "bg-info-softer text-info-fg"
                        : selectedRow.item_type === "PKG"
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-bg-raised text-fg-muted",
                    )}>
                      {selectedRow.item_type}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium text-fg">
                      {selectedRow.label}
                    </span>
                  </div>
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
                /* Combobox input */
                <div className="relative">
                  <div
                    ref={comboAnchorRef}
                    className="flex min-w-0 items-center gap-2"
                    data-testid="physical-count-combobox"
                  >
                    <input
                      ref={searchInputRef}
                      type="search"
                      className="input min-w-0 flex-1"
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
                        className="btn shrink-0 whitespace-nowrap text-xs transition-all duration-150"
                        onClick={() => {
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search"
                        data-testid="physical-count-search-clear"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  {/* Result count */}
                  {searchQuery.trim() ? (
                    <p
                      className="mt-1 text-xs text-fg-muted"
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
                          className="z-50 max-h-72 overflow-auto rounded-lg border border-border bg-bg shadow-lg"
                          style={{
                            position: "fixed",
                            top: comboRect.top + 4,
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
                                  <div className="sticky top-0 bg-bg-raised px-3 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-muted border-b border-border/50">
                                    Finished Goods
                                  </div>
                                  {fgItems.map((r) => (
                                    <button
                                      key={`${r.kind}:${r.id}`}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-bg-subtle transition-all duration-150",
                                        selKey === `${r.kind}:${r.id}` && "bg-accent/5 text-accent",
                                      )}
                                      onClick={() => {
                                        setSelKey(`${r.kind}:${r.id}`);
                                        setItemTypeOverride("");
                                        setComboOpen(false);
                                        setSearchQuery("");
                                      }}
                                    >
                                      <span className="chip chip-info shrink-0 text-3xs">FG</span>
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
                                  <div className="sticky top-0 bg-bg-raised px-3 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-muted border-b border-border/50">
                                    Raw Materials
                                  </div>
                                  {rmItems.map((r) => (
                                    <button
                                      key={`${r.kind}:${r.id}`}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-bg-subtle transition-all duration-150",
                                        selKey === `${r.kind}:${r.id}` && "bg-accent/5 text-accent",
                                      )}
                                      onClick={() => {
                                        setSelKey(`${r.kind}:${r.id}`);
                                        setItemTypeOverride("");
                                        setComboOpen(false);
                                        setSearchQuery("");
                                      }}
                                    >
                                      <span className="chip shrink-0 text-3xs bg-bg-raised text-fg-muted">RM</span>
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
                                  <div className="sticky top-0 bg-bg-raised px-3 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-muted border-b border-border/50">
                                    Packaging
                                  </div>
                                  {pkgItems.map((r) => (
                                    <button
                                      key={`${r.kind}:${r.id}`}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-bg-subtle transition-all duration-150",
                                        selKey === `${r.kind}:${r.id}` && "bg-accent/5 text-accent",
                                      )}
                                      onClick={() => {
                                        setSelKey(`${r.kind}:${r.id}`);
                                        setItemTypeOverride("");
                                        setComboOpen(false);
                                        setSearchQuery("");
                                      }}
                                    >
                                      <span className="chip chip-warning shrink-0 text-3xs">PKG</span>
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
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
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

          <div className="flex items-center justify-end gap-2 py-3">
            <button
              type="submit"
              className={cn(
                "btn btn-primary transition-all duration-150",
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
        <form onSubmit={handleSubmit} className="space-y-5 pb-20" data-testid="physical-count-step-2">
          <StepIndicator step={2} />
          <BlindCountBanner compact />

          {/* Hero snapshot context card */}
          {snapshot ? (
            <div className="rounded-xl border border-border bg-bg-raised px-5 py-4 transition-all duration-150">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "chip text-3xs",
                      snapshot.item_type === "FG"
                        ? "bg-info-softer text-info-fg"
                        : snapshot.item_type === "PKG"
                          ? "bg-warning-softer text-warning-fg"
                          : "bg-bg-subtle text-fg-muted",
                    )}>
                      {snapshot.item_type}
                    </span>
                    {snapshot.idempotent_open ? (
                      <span className="chip chip-warning text-3xs">
                        Resumed existing snapshot
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-fg leading-tight">
                    {snapshot.item_display_name}
                  </div>
                  <div className="mt-1 text-xs text-fg-muted">
                    {snapshot.item_id}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-3xs font-semibold uppercase tracking-sops text-fg-muted mb-1">
                    Snapshot ID
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-fg">
                      {snapshot.snapshot_id.slice(0, 8)}…
                    </span>
                    <button
                      type="button"
                      title="Copy snapshot ID"
                      className="btn btn-ghost btn-sm p-1 transition-all duration-150"
                      onClick={() => void navigator.clipboard.writeText(snapshot.snapshot_id)}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-7A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-1 text-3xs text-fg-muted">
                    Count started {formatRelative(snapshot.opened_at)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <SectionCard
            title="Step 2 — enter counted quantity"
            description="Counted quantity is what you just physically measured. Do not adjust it for what you expect to be there."
          >
            <div className="space-y-5">
              {/* Hero quantity input with stepper */}
              <div>
                <span className="mb-2 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Counted quantity *
                </span>
                <div className="flex items-center justify-center gap-3" data-testid="physical-count-qty">
                  <button
                    type="button"
                    className="btn btn-ghost flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold transition-all duration-150"
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
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="input w-36 text-center text-2xl font-mono font-bold"
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    required
                    disabled={phase === "submitting"}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold transition-all duration-150"
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
              </div>

              {/* Unit — chip row */}
              <div>
                <span className="mb-2 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Unit
                </span>
                <div className="flex flex-wrap gap-2" data-testid="physical-count-unit">
                  {UOMS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      className={cn(
                        "chip cursor-pointer transition-all duration-150",
                        unit === u
                          ? "bg-accent text-white border-accent"
                          : "bg-bg-raised text-fg-muted hover:bg-bg-subtle",
                      )}
                      onClick={() => setUnit(u as Uom)}
                      disabled={phase === "submitting"}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event time */}
              <label className="block min-w-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Event time *
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

              {/* Notes with char count */}
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Notes
                </span>
                <div className="relative">
                  <textarea
                    className="input min-h-[3rem] w-full resize-y pb-5"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional — note any discrepancies or counting conditions"
                    disabled={phase === "submitting"}
                  />
                  <span className="absolute bottom-1.5 right-2.5 text-3xs text-fg-muted pointer-events-none">
                    {notes.length}
                  </span>
                </div>
              </label>
            </div>
          </SectionCard>

          {/* Cancel confirm inline mini-prompt */}
          {cancelConfirm ? (
            <div
              className="rounded-lg border border-danger/30 bg-danger-softer px-4 py-3 transition-all duration-150"
              data-testid="physical-count-cancel-confirm"
            >
              <div className="text-sm font-medium text-danger-fg">
                Cancel this count? The snapshot will be released and you&apos;ll need to start over.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm bg-danger text-white hover:bg-danger/90 transition-all duration-150"
                  onClick={() => void handleCancel()}
                  disabled={phase === "submitting"}
                  data-testid="physical-count-cancel-proceed"
                >
                  Yes, cancel
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm transition-all duration-150"
                  onClick={() => setCancelConfirm(false)}
                >
                  Keep counting
                </button>
              </div>
            </div>
          ) : null}

          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t border-border bg-bg-raised/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
            {/* Cancel — ghost/danger, shows confirm prompt */}
            <button
              type="button"
              title="This will release the open snapshot"
              className="btn btn-ghost btn-sm flex items-center gap-1.5 text-danger-fg hover:bg-danger-softer transition-all duration-150"
              onClick={() => setCancelConfirm(true)}
              disabled={phase === "submitting" || cancelConfirm}
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Cancel snapshot
            </button>

            <button
              type="submit"
              className="btn btn-primary transition-all duration-150"
              disabled={phase === "submitting"}
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
                "Submit count"
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

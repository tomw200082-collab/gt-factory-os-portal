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
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
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

const WASTE_REASON_CODES = [
  "breakage",
  "spoilage",
  "production_waste",
  "sampling",
  "theft_loss",
  "found_stock",
  "correction",
  "other",
] as const;
type WasteReasonCode = (typeof WASTE_REASON_CODES)[number];

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
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
// SVG icons (inline, no extra dep)
// ---------------------------------------------------------------------------
function IconArrowDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4v12M4 10l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 16V4M4 10l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
      <path d="M7 12.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M14 8a6 6 0 0 1-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Searchable combobox
// ---------------------------------------------------------------------------
interface ComboboxProps {
  options: AdjustableRow[];
  value: string;
  onChange: (key: string, row: AdjustableRow | undefined) => void;
}

function ItemCombobox({ options, value, onChange }: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedRow = options.find((o) => `${o.kind}:${o.id}` === value);
  const displayValue = selectedRow?.label ?? "";

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIdx(0);
    if (!e.target.value) {
      onChange("", undefined);
    }
  }

  function handleSelect(row: AdjustableRow) {
    const key = `${row.kind}:${row.id}`;
    onChange(key, row);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIdx]) handleSelect(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const li = listRef.current.children[activeIdx] as HTMLElement | undefined;
      li?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div ref={containerRef} className="relative" data-testid="waste-item-select">
      <input
        ref={inputRef}
        type="text"
        className="input w-full transition-colors duration-150"
        placeholder={displayValue || "Search items and components…"}
        value={open ? query : displayValue}
        onChange={handleInputChange}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg shadow-lg">
          {query && (
            <div className="border-b border-border px-3 py-1.5 text-xs text-fg-muted">
              {filtered.length} match{filtered.length !== 1 ? "es" : ""}
            </div>
          )}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-fg-muted">No results</li>
            ) : (
              filtered.map((row, i) => {
                const key = `${row.kind}:${row.id}`;
                return (
                  <li
                    key={key}
                    role="option"
                    aria-selected={value === key}
                    className={cn(
                      "cursor-pointer px-3 py-2 text-sm transition-colors duration-150",
                      i === activeIdx ? "bg-accent/10 text-fg" : "text-fg hover:bg-bg-subtle",
                      value === key && "font-medium"
                    )}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(row); }}
                  >
                    <span className="text-xs text-fg-muted mr-2">
                      {row.item_type ?? "—"}
                    </span>
                    {row.label}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function WasteAdjustmentPage() {
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
    const envelope: WasteAdjustmentRequest = {
      idempotency_key: newIdempotencyKey(),
      event_at: new Date(eventAt).toISOString(),
      direction,
      item_type: row.item_type,
      item_id: row.id,
      quantity: qtyNumLocal,
      unit,
      reason_code: reasonCode,
      notes: notes ? notes : null,
    };

    setPhase("submitting");
    try {
      const res = await fetch("/api/waste-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      const body = (await res.json().catch(() => null)) as
        | { status?: string; submission_id?: string; idempotent_replay?: boolean }
        | null;
      if (body && body.status === "posted") {
        setDone({
          kind: "success",
          message: body.idempotent_replay
            ? "Already posted earlier — no duplicate created."
            : "Adjustment posted successfully.",
          itemSummary: `${row.label} · ${direction === "loss" ? "−" : "+"}${qtyNumLocal} ${unit} · ${REASON_LABELS[reasonCode as WasteReasonCode] ?? String(reasonCode).replace(/_/g, " ")}`,
          detail: `ref: ${body.submission_id}`,
        });
        setQuantity("");
        setNotes("");
        setReasonCode("");
      } else if (body && body.status === "pending") {
        const sid = body.submission_id;
        setDone({
          kind: "pending",
          message: "Adjustment submitted — held for planner approval.",
          itemSummary: `${row.label} · ${direction === "loss" ? "−" : "+"}${qtyNumLocal} ${unit} · ${REASON_LABELS[reasonCode as WasteReasonCode] ?? String(reasonCode).replace(/_/g, " ")}`,
          detail: `ref: ${sid}`,
          href: sid
            ? `/inbox/approvals/waste/${encodeURIComponent(sid)}`
            : undefined,
          hrefLabel: "Open approval",
        });
        setQuantity("");
        setNotes("");
        setReasonCode("");
      } else {
        const detail = body ? JSON.stringify(body) : `HTTP ${res.status}`;
        setDone({
          kind: "error",
          message: "Could not submit. Check your connection and try again.",
          detail,
        });
      }
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error submitting adjustment.",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPhase("done");
    }
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

    // Positive direction: show inline confirm panel instead of window.confirm
    if (direction === "positive") {
      setConfirmPending(true);
      return;
    }

    await doSubmit(row, qtyNumLocal);
  }

  function handleReset() {
    setSelKey("");
    setQuantity("");
    setNotes("");
    setReasonCode("");
    setDone(null);
    setConfirmPending(false);
    setNotesAttempted(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <WorkflowHeader
        eyebrow="Operator form"
        title="Waste / Adjustment"
        description="Report a stock loss or positive correction. Positive corrections are held for planner approval before taking effect."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Result banner                                                        */}
      {/* ------------------------------------------------------------------ */}
      {done ? (
        <div
          className={cn(
            "mb-4 rounded-md border px-4 py-3 text-sm transition-colors duration-150",
            done.kind === "success" && "border-success/40 bg-success-softer text-success-fg",
            done.kind === "pending" && "border-warning/40 bg-warning-softer text-warning-fg",
            done.kind === "error" && "border-l-4 border-danger bg-danger-softer text-danger-fg pl-4"
          )}
          role="status"
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <span className="mt-0.5 shrink-0">
              {done.kind === "success" && <IconCheck />}
              {done.kind === "pending" && <IconClock />}
              {done.kind === "error" && <IconX />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{done.message}</div>
                {done.href ? (
                  <Link
                    href={done.href}
                    className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline transition-colors duration-150"
                    data-testid="waste-adjustment-banner-link"
                  >
                    {done.hrefLabel ?? "Open"}
                  </Link>
                ) : null}
              </div>
              {done.itemSummary ? (
                <div className="mt-1 text-xs font-medium opacity-90">
                  {done.itemSummary}
                </div>
              ) : null}
              {done.detail ? (
                <div className="mt-1 font-mono text-xs opacity-60">
                  {done.detail}
                </div>
              ) : null}
              {/* Pending callout — make the most dangerous semantic trap
                  (pending vs posted) unmistakable. */}
              {done.kind === "pending" && (
                <div className="mt-2 text-xs opacity-80">
                  <strong>Stock has not changed yet.</strong> A planner will review this adjustment; stock updates only once it&apos;s approved.
                </div>
              )}
            </div>
          </div>

          {/* Reset button on success/pending */}
          {(done.kind === "success" || done.kind === "pending") && (
            <div className="mt-3 border-t border-current/10 pt-3">
              <button
                type="button"
                className="btn btn-sm transition-colors duration-150"
                onClick={handleReset}
              >
                Submit another adjustment
              </button>
            </div>
          )}

          {/* Dismiss on error — the form stays mounted below, so clearing the
              banner lets the operator correct and resubmit. */}
          {done.kind === "error" && (
            <div className="mt-3 border-t border-current/10 pt-3">
              <button
                type="button"
                className="btn btn-sm transition-colors duration-150"
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
          <SectionCard
            title="Direction"
            description="Loss = breakage/spoilage/spillage (auto-posts below threshold). Positive = found stock / correction (always held for approval)."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Loss card */}
              <label
                data-testid="waste-direction-loss"
                className={cn(
                  "flex flex-1 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm transition-all duration-200",
                  direction === "loss"
                    ? "border-accent bg-accent-soft"
                    : "border-border/80 hover:border-fg-muted"
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
                <span className="mt-0.5 text-danger-fg shrink-0">
                  <IconArrowDown />
                </span>
                <span>
                  <span className="block font-semibold">Loss / write-down</span>
                  <span className="block text-xs text-fg-muted mt-0.5">
                    breakage, spoilage, spillage
                  </span>
                </span>
              </label>

              {/* Positive card */}
              <label
                data-testid="waste-direction-positive"
                className={cn(
                  "flex flex-1 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm transition-all duration-200",
                  direction === "positive"
                    ? "border-warning bg-warning-softer"
                    : "border-border/80 hover:border-fg-muted"
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
                <span className="mt-0.5 text-warning-fg shrink-0">
                  <IconArrowUp />
                </span>
                <span>
                  <span className="block font-semibold">Positive correction</span>
                  <span className="block text-xs text-fg-muted mt-0.5">
                    found stock, correction
                  </span>
                  <span className="mt-1.5 inline-block rounded-sm border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-warning-fg">
                    Approval required
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
              <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
                <span className="mb-1 flex items-center gap-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
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
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Item / component *
                </span>
                <ItemCombobox
                  options={adjustable}
                  value={selKey}
                  onChange={(key, row) => {
                    setSelKey(key);
                    if (row) setUnit(row.default_uom);
                  }}
                />
                {/* Selected item chip */}
                {selectedRow && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg-subtle px-2.5 py-0.5 text-xs text-fg-muted">
                    <span className="font-semibold text-fg">{selectedRow.item_type ?? "—"}</span>
                    <span>·</span>
                    <span className="truncate max-w-[16rem]">{selectedRow.label}</span>
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Quantity *
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm shrink-0 h-11 w-11 min-w-[2.75rem] flex items-center justify-center transition-colors duration-150"
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
                    className="input flex-1 transition-colors duration-150"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    data-testid="waste-quantity"
                  />
                  <button
                    type="button"
                    className="btn btn-sm shrink-0 h-11 w-11 min-w-[2.75rem] flex items-center justify-center transition-colors duration-150"
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
                      "mt-1.5 text-xs font-semibold",
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
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
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
                <span className="mb-2 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
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
                        "chip cursor-pointer px-3 py-1 text-xs font-medium rounded-full border transition-colors duration-150",
                        reasonCode === r
                          ? "bg-accent text-white border-accent"
                          : "border-border/60 bg-bg-subtle text-fg hover:border-fg-muted"
                      )}
                      onClick={() => setReasonCode(r)}
                      aria-pressed={reasonCode === r}
                    >
                      {REASON_LABELS[r]}
                    </button>
                  ))}
                </div>
                {/* Notes-required hint */}
                {reasonCode && REASON_CODES_REQUIRING_NOTES.includes(reasonCode) && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-info-fg">
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 8h.01M11 12h1v5h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Notes required for this reason
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="block min-w-0 sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
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
          {/* Inline confirm panel (replaces window.confirm for positive dir)  */}
          {/* ---------------------------------------------------------------- */}
          {confirmPending && (
            <div
              className="rounded-md border border-warning/50 bg-warning-softer px-4 py-4 text-sm text-warning-fg"
              role="alertdialog"
              aria-modal="false"
              aria-label="Confirm positive adjustment"
              data-testid="waste-confirm-panel"
            >
              <div className="flex items-start gap-2 mb-3">
                <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <p className="font-medium">
                  You are about to add{" "}
                  <span className="font-bold">
                    {qtyNum} {unit}
                  </span>{" "}
                  of{" "}
                  <span className="font-bold">
                    {selectedRow?.label ?? "the selected item"}
                  </span>{" "}
                  to stock. This will be held for planner approval.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm transition-colors duration-150"
                  data-testid="waste-confirm-proceed"
                  onClick={async () => {
                    setConfirmPending(false);
                    const row = byKey.get(selKey);
                    if (row) await doSubmit(row, Number(quantity));
                  }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="btn btn-sm transition-colors duration-150"
                  data-testid="waste-confirm-cancel"
                  onClick={() => setConfirmPending(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Sticky submit bar                                                 */}
          {/* ---------------------------------------------------------------- */}
          <div
            className="sticky bottom-0 z-40 -mx-4 px-4 py-3 backdrop-blur-sm bg-bg-raised/90 border-t border-border/50 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] flex items-center justify-end gap-2 sm:-mx-6 sm:px-6"
          >
            <button
              type="button"
              className="btn btn-ghost transition-colors duration-150"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="submit"
              className={cn(
                "btn btn-primary transition-colors duration-150",
                phase === "submitting" && "cursor-wait"
              )}
              disabled={phase === "submitting" || confirmPending}
              data-testid="waste-submit"
            >
              {phase === "submitting" ? (
                <span className="flex items-center gap-2">
                  <IconSpinner />
                  Submitting…
                </span>
              ) : direction === "positive" ? (
                "Review & submit"
              ) : (
                "Submit adjustment"
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

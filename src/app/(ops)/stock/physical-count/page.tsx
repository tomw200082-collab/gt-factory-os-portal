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
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";

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
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
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

type Phase = "pick" | "counting" | "submitting" | "done";
interface DoneState {
  kind: "success" | "pending" | "error";
  message: string;
  detail?: string;
  itemSummary?: string;
  href?: string;
  hrefLabel?: string;
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
        item_type: "RM",
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

  const loading = itemsQuery.isLoading || componentsQuery.isLoading;
  const loadErr = itemsQuery.error || componentsQuery.error;

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

  return (
    <>
      <WorkflowHeader
        eyebrow="Operator form"
        title="Physical Count"
        description="Blind count — enter what you actually see. Expected quantities are hidden to keep the count unbiased."
      />

      {done ? (
        <div
          className={
            "mb-4 rounded-md border px-4 py-3 text-sm " +
            (done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : done.kind === "pending"
                ? "border-warning/40 bg-warning-softer text-warning-fg"
                : "border-danger/40 bg-danger-softer text-danger-fg")
          }
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">{done.message}</div>
            {done.href ? (
              <Link
                href={done.href}
                className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
                data-testid="physical-count-banner-link"
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
        </div>
      ) : null}

      {loading ? (
        <div className="p-5 text-sm text-fg-muted">Loading masters…</div>
      ) : loadErr ? (
        <div className="p-5 text-sm text-danger-fg">
          {(loadErr as Error).message}
        </div>
      ) : phase === "pick" ? (
        <form onSubmit={handleOpen} className="space-y-5">
          <SectionCard
            title="Step 1 — choose what to count"
            description="Select the item you are about to count. The expected quantity is not shown to keep the count unbiased."
          >
            {/* ------------------------------------------------------------------
                Search / filter — client-side only. No API calls.
                Filtering changes render visibility only. selKey is stored in
                separate state and is NEVER cleared or mutated by searchQuery.
                countedQty is stored separately from any search state, so
                values entered in the count field persist across search
                interactions (see invariant comment in state declarations above).
                ------------------------------------------------------------------ */}
            <div className="mb-3 space-y-1">
              <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Search
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <input
                  ref={searchInputRef}
                  type="search"
                  className="input min-w-0 flex-1"
                  placeholder="Search items…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  aria-label="Search items and components"
                  data-testid="physical-count-search"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="btn shrink-0 whitespace-nowrap text-xs"
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
              {searchQuery.trim() ? (
                <p
                  className="text-xs text-fg-muted"
                  aria-live="polite"
                  data-testid="physical-count-search-result-count"
                >
                  {filteredCountable.length > 0
                    ? `${filteredCountable.length} item${filteredCountable.length === 1 ? "" : "s"}`
                    : "No items match your search."}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Item / component *
                </span>
                <select
                  className="input"
                  value={selKey}
                  onChange={(e) => {
                    setSelKey(e.target.value);
                    setItemTypeOverride("");
                  }}
                  required
                >
                  <option value="">— select —</option>
                  {filteredCountable.length === 0 && searchQuery.trim() ? (
                    <option value="" disabled>
                      No items match your search.
                    </option>
                  ) : (
                    <>
                      <optgroup label="Finished Goods (items)">
                        {filteredCountable
                          .filter((r) => r.kind === "item")
                          .map((r) => (
                            <option
                              key={`${r.kind}:${r.id}`}
                              value={`${r.kind}:${r.id}`}
                            >
                              {r.label}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Raw materials (components)">
                        {filteredCountable
                          .filter((r) => r.kind === "component")
                          .map((r) => (
                            <option
                              key={`${r.kind}:${r.id}`}
                              value={`${r.kind}:${r.id}`}
                            >
                              {r.label}
                            </option>
                          ))}
                      </optgroup>
                    </>
                  )}
                </select>
              </label>
              <label className="block">
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
          </SectionCard>
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selKey}
            >
              Open count snapshot
            </button>
          </div>
        </form>
      ) : phase === "counting" || phase === "submitting" || phase === "done" ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard
            title="Step 2 — enter counted quantity"
            description="Counted quantity is what you just physically measured. Do not adjust it for what you expect to be there."
          >
            {snapshot ? (
              <div className="mb-3 rounded-md border border-border/60 bg-bg-subtle/40 p-3 text-xs">
                <div>
                  <span className="text-fg-subtle">Snapshot:</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.snapshot_id}
                  </span>
                  {snapshot.idempotent_open ? (
                    <span className="ml-2 rounded-sm border border-info/40 bg-info-soft px-1.5 py-0.5 text-3xs text-info-fg">
                      reused open snapshot
                    </span>
                  ) : null}
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">Counting:</span>{" "}
                  <span className="text-fg">
                    {snapshot.item_display_name} ({snapshot.item_type}{" "}
                    {snapshot.item_id})
                  </span>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
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
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Counted quantity *
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={countedQty}
                  onChange={(e) => setCountedQty(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Unit
                </span>
                <select
                  className="input"
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
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Notes
                </span>
                <textarea
                  className="input min-h-[3rem]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </SectionCard>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn"
              onClick={handleCancel}
              disabled={phase === "submitting"}
            >
              Cancel snapshot
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={phase === "submitting"}
            >
              {phase === "submitting" ? "Submitting…" : "Submit count"}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

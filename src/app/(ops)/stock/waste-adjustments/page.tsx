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
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";

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
  item_type: ItemType;
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
        item_type: "RM",
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

  const loading = itemsQuery.isLoading || componentsQuery.isLoading;
  const loadErr = itemsQuery.error || componentsQuery.error;

  const allowedReasons = REASON_CODES_BY_DIRECTION[direction];
  const notesRequired =
    direction === "positive" ||
    (reasonCode && REASON_CODES_REQUIRING_NOTES.includes(reasonCode));

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDone(null);
    const row = byKey.get(selKey);
    if (!row) {
      setDone({ kind: "error", message: "Choose an item or component." });
      return;
    }
    const qtyNum = Number(quantity);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setDone({ kind: "error", message: "Quantity must be a positive number." });
      return;
    }
    if (!reasonCode) {
      setDone({ kind: "error", message: "Reason is required." });
      return;
    }
    if (notesRequired && !notes.trim()) {
      setDone({
        kind: "error",
        message:
          direction === "positive"
            ? "Notes are required for positive corrections."
            : `Notes are required for reason '${reasonCode}'.`,
      });
      return;
    }
    if (direction === "positive") {
      const ok = window.confirm(
        `You are ADDING ${qtyNum} ${unit} of stock. Continue?`,
      );
      if (!ok) return;
    }

    const envelope: WasteAdjustmentRequest = {
      idempotency_key: newIdempotencyKey(),
      event_at: new Date(eventAt).toISOString(),
      direction,
      item_type: row.item_type,
      item_id: row.id,
      quantity: qtyNum,
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
            ? "Adjustment already recorded."
            : "Adjustment posted successfully.",
          itemSummary: `${row.label} · ${direction === "loss" ? "−" : "+"}${qtyNum} ${unit} · ${String(reasonCode).replace(/_/g, " ")}`,
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
          itemSummary: `${row.label} · ${direction === "loss" ? "−" : "+"}${qtyNum} ${unit} · ${String(reasonCode).replace(/_/g, " ")}`,
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

  return (
    <>
      <WorkflowHeader
        eyebrow="Operator form"
        title="Waste / Adjustment"
        description="Report a stock loss or positive correction. Positive corrections are held for planner approval before taking effect."
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
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard
            title="Direction"
            description="Loss = breakage/spoilage/spillage (auto-posts below threshold). Positive = found stock / correction (always held for approval)."
          >
            <div className="flex gap-3">
              {(["loss", "positive"] as const).map((d) => (
                <label
                  key={d}
                  className={
                    "flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm " +
                    (direction === d
                      ? d === "positive"
                        ? "border-warning bg-warning-softer"
                        : "border-accent bg-accent-soft"
                      : "border-border/80")
                  }
                >
                  <input
                    type="radio"
                    name="direction"
                    value={d}
                    checked={direction === d}
                    onChange={() => {
                      setDirection(d);
                      setReasonCode("");
                    }}
                    className="sr-only"
                  />
                  <span className="font-semibold">
                    {d === "loss" ? "Loss / write-down" : "Positive correction"}
                  </span>
                  {d === "positive" ? (
                    <span className="ml-auto rounded-sm border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-warning-fg">
                      Approval required
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Adjustment">
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
                  Item / component *
                </span>
                <select
                  className="input"
                  value={selKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    const row = byKey.get(key);
                    setSelKey(key);
                    if (row) setUnit(row.default_uom);
                  }}
                  required
                >
                  <option value="">— select —</option>
                  <optgroup label="Finished Goods (items)">
                    {adjustable
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
                    {adjustable
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
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Quantity *
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </label>
              <label className="block min-w-0">
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
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Reason *
                </span>
                <select
                  className="input"
                  value={reasonCode}
                  onChange={(e) =>
                    setReasonCode(e.target.value as WasteReasonCode | "")
                  }
                  required
                >
                  <option value="">— select —</option>
                  {allowedReasons.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Notes {notesRequired ? "*" : ""}
                </span>
                <textarea
                  className="input min-h-[3rem]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required={!!notesRequired}
                />
              </label>
            </div>
          </SectionCard>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSelKey("");
                setQuantity("");
                setNotes("");
                setReasonCode("");
                setDone(null);
              }}
            >
              Reset
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={phase === "submitting"}
            >
              {phase === "submitting" ? "Submitting…" : "Submit adjustment"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

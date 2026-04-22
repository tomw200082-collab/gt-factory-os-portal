"use client";

// ---------------------------------------------------------------------------
// Goods Receipt — operator form (live API backed).
//
// Endgame Phase B1 (crystalline-drifting-dusk §B.B1):
//   - Dropdowns fetch from GET /api/items, /api/components, /api/suppliers
//     proxies (server-side Bearer JWT via proxyRequest).
//   - Submit posts to /api/goods-receipts proxy (already live from cutover
//     phase 4), which forwards to POST /api/v1/mutations/goods-receipts.
//   - Active-only filtering via ?status=ACTIVE to keep retired rows out of
//     the UI.
//   - Quarantine stub removed; form is the live surface.
//
// Envelope shape is the GoodsReceiptRequestSchema contract at
// src/lib/contracts/goods-receipts.ts (mirror of API schemas.ts).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";

// ---------------------------------------------------------------------------
// Goods Receipt contract — inlined.
//
// Mirror of the authoritative API schema at
//   api/src/goods-receipts/schemas.ts (GoodsReceiptRequestSchema)
// and the runtime-contract doc
//   docs/goods_receipt_runtime_contract.md §1.1.
//
// Inlined here (rather than imported from src/lib/contracts/goods-receipts.ts)
// because the latter is intentionally held out of the committed tree pending
// a separate Gate-3 commit-hygiene tranche. Keep these types byte-aligned
// with the upstream schema; drift is a bug.
// ---------------------------------------------------------------------------

type ItemType = "FG" | "RM" | "PKG";

interface GoodsReceiptLine {
  item_type: ItemType;
  item_id: string;
  quantity: number;
  unit: string;
  po_line_id: string | null;
  notes: string | null;
}

interface GoodsReceiptRequest {
  idempotency_key: string;
  event_at: string;
  supplier_id: string;
  po_id: string | null;
  notes: string | null;
  lines: GoodsReceiptLine[];
}

interface GoodsReceiptCommittedResponse {
  submission_id: string;
  status: "posted";
  event_at: string;
  posted_at: string;
  supplier_id: string;
  po_id: string | null;
  lines: Array<{
    line_id: string;
    item_type: ItemType;
    item_id: string;
    quantity: string;
    unit: string;
    stock_ledger_movement_id: string;
  }>;
  idempotent_replay: boolean;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
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

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  status: string;
}

type ListEnvelope<T> = { rows: T[]; count: number };

type ReceivableRow = {
  kind: "item" | "component";
  id: string;
  label: string;
  default_uom: Uom;
  item_type: ItemType;
};

function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function toUom(raw: string | null | undefined): Uom {
  if (raw && (UOMS as readonly string[]).includes(raw)) return raw as Uom;
  return "UNIT";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

interface LineDraft {
  receivable_key: string; // "item:<id>" or "component:<id>"
  quantity: string; // keep as string; validated on submit
  unit: Uom;
  notes: string;
}

function emptyLine(): LineDraft {
  return { receivable_key: "", quantity: "", unit: "UNIT", notes: "" };
}

type SubmitPhase = "idle" | "submitting" | "done";
interface DoneState {
  kind: "success" | "error";
  message: string;
  detail?: string;
}

export default function GoodsReceiptPage() {
  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "ACTIVE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
  });
  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["master", "components", "ACTIVE"],
    queryFn: () => fetchJson("/api/components?status=ACTIVE&limit=1000"),
  });
  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["master", "suppliers", "ACTIVE"],
    queryFn: () => fetchJson("/api/suppliers?status=ACTIVE&limit=1000"),
  });

  const receivable: ReceivableRow[] = useMemo(() => {
    const items = itemsQuery.data?.rows ?? [];
    const components = componentsQuery.data?.rows ?? [];
    const itemRows: ReceivableRow[] = items.map((i) => ({
      kind: "item",
      id: i.item_id,
      label: `${i.item_name} · ${i.item_id}`,
      default_uom: toUom(i.sales_uom),
      // FG default when supply_method produces finished goods;
      // BOUGHT_FINISHED / MANUFACTURED / REPACK all live on items.
      // Pick FG for items-table; PKG / RM live on components.
      item_type: "FG",
    }));
    const compRows: ReceivableRow[] = components.map((c) => ({
      kind: "component",
      id: c.component_id,
      label: `${c.component_name} · ${c.component_id}`,
      default_uom: toUom(c.inventory_uom ?? c.bom_uom ?? c.purchase_uom),
      // Conservative default — API will 409 ITEM_TYPE_MISMATCH if wrong.
      item_type: "RM",
    }));
    return [...itemRows, ...compRows].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [itemsQuery.data, componentsQuery.data]);

  const receivableByKey = useMemo(() => {
    const m = new Map<string, ReceivableRow>();
    for (const r of receivable) m.set(`${r.kind}:${r.id}`, r);
    return m;
  }, [receivable]);

  const [eventAt, setEventAt] = useState<string>(nowLocalDateTime());
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [done, setDone] = useState<DoneState | null>(null);

  const loading =
    itemsQuery.isLoading ||
    componentsQuery.isLoading ||
    suppliersQuery.isLoading;
  const loadErr =
    itemsQuery.error || componentsQuery.error || suppliersQuery.error;

  function updateLine(idx: number, patch: Partial<LineDraft>): void {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(idx: number): void {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine()]);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDone(null);
    if (!supplierId) {
      setDone({ kind: "error", message: "Supplier is required." });
      return;
    }
    if (lines.length === 0) {
      setDone({ kind: "error", message: "At least one line is required." });
      return;
    }

    const envelopeLines: GoodsReceiptLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const row = receivableByKey.get(l.receivable_key);
      if (!row) {
        setDone({
          kind: "error",
          message: `Line ${i + 1}: choose an item or component.`,
        });
        return;
      }
      const qtyNum = Number(l.quantity);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        setDone({
          kind: "error",
          message: `Line ${i + 1}: quantity must be a positive number.`,
        });
        return;
      }
      envelopeLines.push({
        item_type: row.item_type,
        item_id: row.id,
        quantity: qtyNum,
        unit: l.unit,
        po_line_id: null,
        notes: l.notes ? l.notes : null,
      });
    }

    const envelope: GoodsReceiptRequest = {
      idempotency_key: newIdempotencyKey(),
      event_at: new Date(eventAt).toISOString(),
      supplier_id: supplierId,
      po_id: null,
      notes: notes ? notes : null,
      lines: envelopeLines,
    };

    setPhase("submitting");
    try {
      const res = await fetch("/api/goods-receipts", {
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
        const committed = body as GoodsReceiptCommittedResponse;
        setDone({
          kind: "success",
          message: committed.idempotent_replay
            ? "Receipt already posted (idempotent replay)."
            : "Receipt posted.",
          detail: `submission_id=${committed.submission_id} · lines=${committed.lines.length}`,
        });
        // Reset form for a fresh submission
        setLines([emptyLine()]);
        setNotes("");
      } else {
        const detail =
          body && typeof body === "object"
            ? JSON.stringify(body)
            : `HTTP ${res.status}`;
        setDone({
          kind: "error",
          message: `Submit failed (HTTP ${res.status}).`,
          detail,
        });
      }
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error submitting receipt.",
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
        title="Goods Receipt"
        description="Record physical goods arrival. Partial receipts are valid. Dropdowns render live master data from the API."
      />

      {done ? (
        <div
          className={
            "mb-4 rounded-md border px-4 py-3 text-sm " +
            (done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-danger/40 bg-danger-softer text-danger-fg")
          }
          role="status"
        >
          <div className="font-medium">{done.message}</div>
          {done.detail ? (
            <div className="mt-1 font-mono text-xs opacity-80">
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
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard title="Receipt context">
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
                  Supplier *
                </span>
                <select
                  className="input"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                >
                  <option value="">— select —</option>
                  {(suppliersQuery.data?.rows ?? []).map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name_official} · {s.supplier_id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Header notes
                </span>
                <textarea
                  className="input min-h-[3rem]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional header-level notes."
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="Lines"
            description="At least one line is required. Quantities must be positive."
          >
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
                >
                  <select
                    className="input"
                    value={line.receivable_key}
                    onChange={(e) => {
                      const key = e.target.value;
                      const row = receivableByKey.get(key);
                      updateLine(idx, {
                        receivable_key: key,
                        unit: row ? row.default_uom : line.unit,
                      });
                    }}
                    required
                  >
                    <option value="">— item or component —</option>
                    <optgroup label="Finished Goods (items)">
                      {receivable
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
                      {receivable
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
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="input"
                    placeholder="Quantity"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(idx, { quantity: e.target.value })
                    }
                    required
                  />
                  <select
                    className="input"
                    value={line.unit}
                    onChange={(e) =>
                      updateLine(idx, { unit: e.target.value as Uom })
                    }
                  >
                    {UOMS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Line notes (optional)"
                    value={line.notes}
                    onChange={(e) =>
                      updateLine(idx, { notes: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addLine}
              >
                + Add line
              </button>
            </div>
          </SectionCard>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setLines([emptyLine()]);
                setNotes("");
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
              {phase === "submitting" ? "Submitting…" : "Submit receipt"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

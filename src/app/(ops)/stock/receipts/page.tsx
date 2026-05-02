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
// Cycle 16 — PO prefill (W4 cycle 8 spec §3.4):
//   - Reads ?po_id={po_id} from URL on mount.
//   - When present: fetches PO header + filtered OPEN/PARTIAL PO lines,
//     locks supplier picker, prepopulates one GR line per OPEN/PARTIAL
//     PO line with received_qty = open_qty (editable downward, upward,
//     or to zero per §3.4.1 / §3.4.3).
//   - Status guard: if PO is RECEIVED/CANCELLED, renders empty-state
//     panel with a "View receipts" link back to the PO detail page;
//     submit is hidden.
//   - PO-less direct entry (no ?po_id=) preserved verbatim — prefill is
//     additive based on the URL param's presence.
//   - Closes W2-FOLLOWUP-RECEIPTS-PO-PREFILL logged at cycle 14 commit
//     19c0025.
//
// Envelope shape is the GoodsReceiptRequestSchema contract at
// src/lib/contracts/goods-receipts.ts (mirror of API schemas.ts).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
  sku: string | null;
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

// Tranche 013: optional PO linkage. Subset of the PurchaseOrderRow shape
// from /api/purchase-orders — only the fields we need to render the picker.
interface PoOption {
  po_id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  expected_receive_date: string | null;
}

// Cycle 16: PO header shape returned by GET /api/purchase-orders/:po_id.
// Used by the URL-driven prefill path (?po_id=) to display PO context and
// enforce the terminal-status guard. Mirrors the response of the canonical
// PO detail endpoint already consumed at /purchase-orders/[po_id]/page.tsx.
interface PurchaseOrderHeader {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
  order_date: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  notes: string | null;
}

interface PurchaseOrderDetailResponse {
  row: PurchaseOrderHeader;
}

interface PoLineOption {
  po_line_id: string;
  line_number: number;
  component_id: string | null;
  component_name: string | null;
  item_id: string | null;
  item_name: string | null;
  ordered_qty: string;
  uom: string;
  received_qty: string;
  open_qty: string;
  line_status: string;
}

interface PoLinesResponse {
  rows: PoLineOption[];
  count: number;
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
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

interface LineDraft {
  receivable_key: string; // "item:<id>" or "component:<id>"
  quantity: string; // keep as string; validated on submit
  unit: Uom;
  notes: string;
  // Tranche 013: optional per-line PO line reference. Empty string = unmatched.
  po_line_id: string;
}

function emptyLine(): LineDraft {
  return {
    receivable_key: "",
    quantity: "",
    unit: "UNIT",
    notes: "",
    po_line_id: "",
  };
}

type SubmitPhase = "idle" | "submitting" | "done";
interface DoneState {
  kind: "success" | "error";
  message: string;
  detail?: string;
  itemSummary?: string;
  // Cycle 16 — post-submit context links rendered when the receipt is
  // attached to a PO. Allows the operator to navigate directly to the PO
  // detail page (to verify status flip OPEN→PARTIAL or →RECEIVED) and to
  // the movement log for ledger verification. Both links are optional;
  // omitted on PO-less receipts. The `movement_log_filter_supported`
  // flag carries an honest disclosure when /stock/movement-log does
  // not yet filter by po_id (W1 follow-up; the link still works as a
  // generic deep-link).
  poId?: string;
  poNumber?: string;
  postedLines?: number;
}

export default function GoodsReceiptPage() {
  // Cycle 16 — URL-driven prefill (W4 spec §3.4). When the operator arrives
  // here from the "Receive against this PO →" CTA on /purchase-orders/[po_id]
  // (cycle 14, commit 19c0025), the URL carries ?po_id=<uuid>. We read it
  // ONCE on mount and lock the supplier picker plus prepopulate lines.
  // Direct-entry path (no ?po_id=) is preserved verbatim.
  const searchParams = useSearchParams();
  const urlPoId = searchParams?.get("po_id") ?? "";

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

  // Tranche 013: open POs for the optional reference dropdown. We fetch
  // OPEN + PARTIAL because either accepts further receipts. The query is
  // tolerant: if the upstream errors or returns zero rows, the dropdown
  // simply hides and manual receipts (po_id=null) keep working.
  const openPosQuery = useQuery<ListEnvelope<PoOption>>({
    queryKey: ["ops", "receipts", "open-pos"],
    queryFn: () =>
      fetchJson(
        "/api/purchase-orders?status=OPEN&status=PARTIAL&limit=200",
      ),
    staleTime: 30_000,
  });

  const receivable: ReceivableRow[] = useMemo(() => {
    const items = itemsQuery.data?.rows ?? [];
    const components = componentsQuery.data?.rows ?? [];
    const itemRows: ReceivableRow[] = items.map((i) => ({
      kind: "item",
      id: i.item_id,
      label: `${i.item_name} · ${i.sku ?? i.item_id}`,
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
  // Line-search state — affects only the option list rendered in each line's
  // item/component select. NEVER touches `lines` state or the submit payload.
  const [lineSearch, setLineSearch] = useState<string>("");

  // Client-side filter for the line item/component picker.
  // Filters only the VISIBLE option list — never changes `lines` state.
  // Case-insensitive match against display label (which includes name + id).
  const filteredReceivable = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return receivable;
    return receivable.filter((r) => r.label.toLowerCase().includes(q));
  }, [receivable, lineSearch]);
  // Tranche 013: optional PO reference. When set, all receipt lines
  // submit with envelope.po_id = poId; per-line po_line_id is picked
  // from the selected PO's lines[].
  //
  // Cycle 16: seeded from ?po_id= URL param so the "Receive against this PO"
  // CTA on /purchase-orders/[po_id] arrives with the PO already linked. The
  // poId state remains mutable in the prefill path so handlePoChange (e.g.,
  // operator clicking the dropdown to clear) still works; supplier locking
  // is enforced separately by the urlPoLocked flag below.
  const [poId, setPoId] = useState<string>(urlPoId);

  // Cycle 16: when prefill is driven by the URL we lock the supplier picker
  // per W4 spec §3.4 step 1. The operator MUST NOT change supplier in this
  // path — the handler-side SUPPLIER_MISMATCH 409 guard remains the
  // last-resort defense, but we don't want them to even attempt it.
  const urlPoLocked = Boolean(urlPoId);

  // Lazy-load the chosen PO's detail to populate the per-line
  // po_line_id picker. enabled only when poId is set so we don't
  // hammer the proxy when no PO is referenced.
  const poDetailQuery = useQuery<PoLinesResponse>({
    queryKey: ["ops", "receipts", "po-lines", poId],
    queryFn: () => fetchJson(`/api/purchase-order-lines?po_id=${encodeURIComponent(poId)}`),
    enabled: !!poId,
    staleTime: 30_000,
  });

  const poLines: PoLineOption[] = useMemo(() => {
    return poDetailQuery.data?.rows ?? [];
  }, [poDetailQuery.data]);

  // Cycle 16 — PO header fetch for URL-driven prefill (W4 spec §3.4 step 1
  // + §3.5.5 status guard). This is in addition to the openPosQuery list
  // because (a) the URL may point at a terminal-status PO that the list
  // omits, and (b) we want the supplier_name display value, which the list
  // shape does not carry. Only enabled in the URL-driven path; a manually
  // chosen PO via the dropdown stays on the openPosQuery's list shape.
  const poHeaderQuery = useQuery<PurchaseOrderDetailResponse>({
    queryKey: ["ops", "receipts", "po-header", urlPoId],
    queryFn: () =>
      fetchJson(`/api/purchase-orders/${encodeURIComponent(urlPoId)}`),
    enabled: urlPoLocked,
    staleTime: 30_000,
  });
  const urlPoHeader = poHeaderQuery.data?.row ?? null;
  // Terminal-status guard per W4 spec §3.5.5 + dispatch instruction.
  const urlPoTerminal =
    urlPoHeader !== null &&
    (urlPoHeader.status === "RECEIVED" || urlPoHeader.status === "CANCELLED");

  // Cycle 16 — prefill effect: once both the PO header and the OPEN/PARTIAL
  // PO lines are loaded, set the supplier from the header and replace the
  // initial empty line draft with one prefilled draft per OPEN/PARTIAL PO
  // line. CLOSED + CANCELLED lines are filtered out (W4 spec §3.4 step 2).
  // Read once per mount: a `prefillApplied` guard prevents stomping the
  // operator's edits on subsequent re-renders. If the operator manually
  // adds/removes lines after prefill, those edits stick.
  const [prefillApplied, setPrefillApplied] = useState(false);
  useEffect(() => {
    if (!urlPoLocked) return;
    if (prefillApplied) return;
    if (urlPoTerminal) return;
    if (!urlPoHeader) return;
    if (poDetailQuery.isLoading) return;
    // Lock supplier from PO header.
    if (!supplierId) {
      setSupplierId(urlPoHeader.supplier_id);
    }
    // Build one line per OPEN/PARTIAL PO line; received_qty default = open_qty.
    // Receivable resolution: try component_id first, then item_id; fall back
    // to leaving the line picker empty (the operator can correct, then the
    // handler's PO_LINE_PARENT_MISMATCH 409 enforces consistency).
    const eligible = poLines.filter(
      (pl) => pl.line_status === "OPEN" || pl.line_status === "PARTIAL",
    );
    if (eligible.length === 0) {
      // No eligible lines — keep the initial empty draft so the empty-state
      // copy below carries the operator to "View receipts". No-op here.
      setPrefillApplied(true);
      return;
    }
    const drafts: LineDraft[] = eligible.map((pl) => {
      const key = pl.component_id
        ? `component:${pl.component_id}`
        : pl.item_id
          ? `item:${pl.item_id}`
          : "";
      const unit = (UOMS as readonly string[]).includes(pl.uom)
        ? (pl.uom as Uom)
        : "UNIT";
      return {
        receivable_key: key,
        quantity: pl.open_qty,
        unit,
        notes: "",
        po_line_id: pl.po_line_id,
      };
    });
    setLines(drafts);
    setPrefillApplied(true);
  }, [
    urlPoLocked,
    prefillApplied,
    urlPoTerminal,
    urlPoHeader,
    poDetailQuery.isLoading,
    poLines,
    supplierId,
  ]);

  // When the operator picks a PO, default the supplier to the PO's
  // supplier so the supplier dropdown stays consistent. The operator can
  // still change it; the API will 409 SUPPLIER_MISMATCH if so.
  function handlePoChange(nextPoId: string): void {
    setPoId(nextPoId);
    if (!nextPoId) {
      // Clear per-line po_line_id selections when un-linking the PO.
      setLines((prev) => prev.map((l) => ({ ...l, po_line_id: "" })));
      return;
    }
    const picked = openPosQuery.data?.rows.find((p) => p.po_id === nextPoId);
    if (picked && !supplierId) {
      setSupplierId(picked.supplier_id);
    }
    // Reset per-line po_line_id since they refer to the previous PO.
    setLines((prev) => prev.map((l) => ({ ...l, po_line_id: "" })));
  }

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
        po_line_id: l.po_line_id ? l.po_line_id : null,
        notes: l.notes ? l.notes : null,
      });
    }

    const envelope: GoodsReceiptRequest = {
      idempotency_key: newIdempotencyKey(),
      event_at: new Date(eventAt).toISOString(),
      supplier_id: supplierId,
      po_id: poId ? poId : null,
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
        // Capture display context from current form state before reset clears it.
        const supplierName =
          suppliersQuery.data?.rows.find((s) => s.supplier_id === supplierId)
            ?.supplier_name_official ?? supplierId;
        const lineParts = lines
          .map((l) => {
            const row = receivableByKey.get(l.receivable_key);
            if (!row || !l.quantity) return null;
            return `${row.label} · ${l.quantity} ${l.unit}`;
          })
          .filter((s): s is string => s !== null);
        const itemSummary = [supplierName, ...lineParts].join(" · ");
        setDone({
          kind: "success",
          message: committed.idempotent_replay
            ? "Receipt already recorded."
            : "Receipt posted successfully.",
          itemSummary,
          detail: `ref: ${committed.submission_id} · ${committed.lines.length} line${committed.lines.length !== 1 ? "s" : ""}`,
          // Cycle 16: carry PO context through to the success panel so the
          // operator can verify status flip + ledger movement without
          // re-navigating manually.
          poId: committed.po_id ?? undefined,
          poNumber: urlPoHeader?.po_number ?? undefined,
          postedLines: committed.lines.length,
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
          message: "Could not submit. Check your connection and try again.",
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
        eyebrow={urlPoLocked && urlPoHeader ? `Receiving against PO ${urlPoHeader.po_number}` : "Operator form"}
        title="Goods Receipt"
        description={
          urlPoLocked && urlPoHeader
            ? `From ${urlPoHeader.supplier_name ?? urlPoHeader.supplier_id}${urlPoHeader.expected_receive_date ? ` · expected ${urlPoHeader.expected_receive_date}` : ""}.`
            : "Record physical goods arrival. Partial receipts are supported."
        }
      />

      {/* Cycle 16 — PO-attached prefill: terminal-status guard panel.
          When the URL points at a RECEIVED or CANCELLED PO, we hide the
          form entirely and show a closed-out empty state with a link
          back to the PO detail's attached-grs tab (W4 spec §3.5.5). */}
      {urlPoLocked && urlPoTerminal && urlPoHeader ? (
        <SectionCard title={`PO ${urlPoHeader.po_number} cannot accept further receipts`}>
          <div
            className="rounded-md border border-border/60 bg-bg-raised p-4 text-sm"
            role="status"
            data-testid="receipts-po-terminal-guard"
          >
            <div className="font-medium text-fg">
              This PO is in {urlPoHeader.status === "RECEIVED" ? "Received" : "Cancelled"} state.
            </div>
            <div className="mt-1 text-fg-muted">
              No additional goods receipts may be posted against PO {urlPoHeader.po_number}
              {urlPoHeader.supplier_name ? ` (${urlPoHeader.supplier_name})` : ""}.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/purchase-orders/${encodeURIComponent(urlPoHeader.po_id)}?tab=attached-grs`}
                className="btn btn-sm btn-primary"
                data-testid="receipts-po-terminal-view-receipts"
              >
                View receipts →
              </Link>
              <Link
                href={`/purchase-orders/${encodeURIComponent(urlPoHeader.po_id)}`}
                className="btn btn-ghost btn-sm"
              >
                Back to PO detail
              </Link>
              <Link
                href="/stock/receipts"
                className="btn btn-ghost btn-sm"
                data-testid="receipts-po-terminal-clear-link"
              >
                Start a manual receipt
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Cycle 16 — PO header context strip rendered above the form when
          prefill is active and the PO is acceptable. Shows PO number,
          supplier, expected date, and a "Cancel / Back to PO" affordance
          per dispatch instruction. Loading state shown while the PO
          header is in flight. */}
      {urlPoLocked && !urlPoTerminal && poHeaderQuery.isLoading ? (
        <SectionCard title="Loading PO context…">
          <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" aria-busy="true" />
        </SectionCard>
      ) : null}
      {urlPoLocked && !urlPoTerminal && poHeaderQuery.isError ? (
        <SectionCard title="Could not load PO context">
          <div
            className="rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
            role="status"
            data-testid="receipts-po-header-error"
          >
            <div className="font-semibold">Could not load PO {urlPoId}</div>
            <div className="mt-1 text-xs">
              {(poHeaderQuery.error as Error).message}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void poHeaderQuery.refetch()}
              >
                Retry
              </button>
              <Link
                href="/stock/receipts"
                className="btn btn-ghost btn-sm"
              >
                Start a manual receipt instead
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : null}
      {urlPoLocked && !urlPoTerminal && urlPoHeader ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info-softer/30 px-4 py-3 text-sm"
          role="note"
          data-testid="receipts-po-context-strip"
        >
          <span className="font-medium text-fg">
            Receiving against PO{" "}
            <span className="font-mono">{urlPoHeader.po_number}</span>
          </span>
          <span className="text-fg-muted">
            {urlPoHeader.supplier_name ?? urlPoHeader.supplier_id}
          </span>
          {urlPoHeader.expected_receive_date ? (
            <span className="text-fg-muted">
              expected {urlPoHeader.expected_receive_date}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={`/purchase-orders/${encodeURIComponent(urlPoHeader.po_id)}`}
              className="btn btn-ghost btn-sm"
              data-testid="receipts-po-back-to-po"
            >
              ← Back to PO
            </Link>
          </span>
        </div>
      ) : null}

      {done ? (
        <div
          className={
            "mb-4 rounded-md border px-4 py-3 text-sm " +
            (done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-danger/40 bg-danger-softer text-danger-fg")
          }
          role="status"
          data-testid={
            done.kind === "success"
              ? "receipt-success-panel"
              : "receipt-error-panel"
          }
        >
          <div className="font-medium">{done.message}</div>
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
          {/* Cycle 16: post-submit nav cluster for PO-attached receipts.
              Renders verbatim links to PO detail + movement log so the
              operator can verify the status flip + ledger movement
              without re-navigating manually. Hidden on PO-less posts
              and on errors. */}
          {done.kind === "success" && done.poId ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/purchase-orders/${encodeURIComponent(done.poId)}`}
                className="btn btn-ghost btn-sm"
                data-testid="receipt-success-back-to-po"
              >
                Back to PO{done.poNumber ? ` ${done.poNumber}` : ""} →
              </Link>
              <Link
                href={`/purchase-orders/${encodeURIComponent(done.poId)}?tab=attached-grs`}
                className="btn btn-ghost btn-sm"
                data-testid="receipt-success-view-attached-grs"
              >
                View receipts on this PO →
              </Link>
              {/*
                Movement log link. The /stock/movement-log surface does
                not yet filter by po_id query param; logged as
                W1-FOLLOWUP-MOVEMENT-LOG-URL-PREFILL (also tracked in
                cycle 12 active_mode entry). The link still routes to
                the unfiltered movement log, which the operator can
                manually scope by submission/event_at.
              */}
              <Link
                href={`/stock/movement-log?po_id=${encodeURIComponent(done.poId)}`}
                className="btn btn-ghost btn-sm"
                data-testid="receipt-success-view-movement-log"
                title="Filter by po_id is not yet supported on the movement log; the link routes to the unfiltered ledger."
              >
                View movement log →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <SectionCard title="Loading masters…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            </div>
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            </div>
          </div>
        </SectionCard>
      ) : loadErr ? (
        <SectionCard title="Could not load suppliers / items / components">
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
            <div className="font-semibold">Could not load masters</div>
            <div className="mt-1 text-xs">{(loadErr as Error).message}</div>
            <button
              type="button"
              onClick={() => {
                void itemsQuery.refetch();
                void componentsQuery.refetch();
                void suppliersQuery.refetch();
              }}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      ) : urlPoLocked && urlPoTerminal ? null : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard title="Receipt context">
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
                  Supplier *
                </span>
                <select
                  className="input"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  disabled={urlPoLocked}
                  data-testid="receipt-supplier-select"
                  aria-describedby={urlPoLocked && urlPoHeader ? "receipt-supplier-locked-caption" : undefined}
                >
                  <option value="">— select —</option>
                  {(suppliersQuery.data?.rows ?? []).map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name_official} · {s.supplier_id}
                    </option>
                  ))}
                </select>
                {urlPoLocked && urlPoHeader ? (
                  <span
                    id="receipt-supplier-locked-caption"
                    className="mt-1 block text-3xs text-fg-muted"
                  >
                    From PO {urlPoHeader.po_number} — supplier locked.
                  </span>
                ) : null}
              </label>
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Reference PO (optional)
                </span>
                <select
                  className="input"
                  value={poId}
                  onChange={(e) => handlePoChange(e.target.value)}
                  data-testid="receipt-po-select"
                  disabled={urlPoLocked}
                >
                  <option value="">— manual receipt (no PO) —</option>
                  {(openPosQuery.data?.rows ?? []).map((p) => (
                    <option key={p.po_id} value={p.po_id}>
                      {p.po_number} · {p.supplier_id} · {p.status}
                      {p.expected_receive_date
                        ? ` · exp ${p.expected_receive_date}`
                        : ""}
                    </option>
                  ))}
                  {/* Cycle 16: when prefill is URL-driven, the PO may not be
                      in the openPosQuery list (cycle 16 source uses a
                      separate header fetch). Render a synthetic option so
                      the disabled select shows the current selection. */}
                  {urlPoLocked && urlPoHeader &&
                    !(openPosQuery.data?.rows ?? []).some((p) => p.po_id === urlPoHeader.po_id) ? (
                    <option key={urlPoHeader.po_id} value={urlPoHeader.po_id}>
                      {urlPoHeader.po_number} · {urlPoHeader.supplier_id} · {urlPoHeader.status}
                    </option>
                  ) : null}
                </select>
                {poId && poDetailQuery.isError ? (
                  <span className="mt-1 block text-3xs text-warning-fg">
                    Couldn&apos;t load PO lines — picker will fall back to
                    unmatched. Try refreshing if this persists.
                  </span>
                ) : null}
                {poId && poDetailQuery.isLoading ? (
                  <span className="mt-1 block text-3xs text-fg-muted">
                    Loading PO lines…
                  </span>
                ) : null}
                {poId && !poDetailQuery.isLoading && poLines.length === 0 ? (
                  <span className="mt-1 block text-3xs text-warning-fg">
                    Selected PO returned no lines — receipt will post with
                    po_id but each line will be unmatched.
                  </span>
                ) : null}
              </label>
              <label className="block min-w-0 sm:col-span-2">
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
            {/* Line search — filters the item/component picker only.
                Does NOT affect lines state or the submit payload. */}
            <div className="mb-3 flex items-center gap-2">
              <input
                type="search"
                className="input flex-1"
                placeholder="Search by name or SKU…"
                value={lineSearch}
                onChange={(e) => setLineSearch(e.target.value)}
                aria-label="Search items and components"
              />
              {lineSearch ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() => setLineSearch("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
                >
                  <label className="block min-w-0">
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle md:hidden">
                      Item or component *
                    </span>
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
                        {filteredReceivable.filter((r) => r.kind === "item").length === 0 ? (
                          <option value="" disabled>No items found</option>
                        ) : (
                          filteredReceivable
                            .filter((r) => r.kind === "item")
                            .map((r) => (
                              <option
                                key={`${r.kind}:${r.id}`}
                                value={`${r.kind}:${r.id}`}
                              >
                                {r.label}
                              </option>
                            ))
                        )}
                      </optgroup>
                      <optgroup label="Raw materials (components)">
                        {filteredReceivable.filter((r) => r.kind === "component").length === 0 ? (
                          <option value="" disabled>No items found</option>
                        ) : (
                          filteredReceivable
                            .filter((r) => r.kind === "component")
                            .map((r) => (
                              <option
                                key={`${r.kind}:${r.id}`}
                                value={`${r.kind}:${r.id}`}
                              >
                                {r.label}
                              </option>
                            ))
                        )}
                      </optgroup>
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle md:hidden">
                      Quantity *
                    </span>
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
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle md:hidden">
                      Unit
                    </span>
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
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle md:hidden">
                      Line notes
                    </span>
                    <input
                      className="input"
                      placeholder="Line notes (optional)"
                      value={line.notes}
                      onChange={(e) =>
                        updateLine(idx, { notes: e.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm md:self-end"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                  >
                    Remove
                  </button>
                  {poId ? (
                    <label
                      className="block sm:col-span-5"
                      data-testid={`receipt-line-${idx}-po-line`}
                    >
                      <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        PO line (optional)
                      </span>
                      <select
                        className="input"
                        value={line.po_line_id}
                        onChange={(e) => {
                          const newPoLineId = e.target.value;
                          const pl = poLines.find((l) => l.po_line_id === newPoLineId);
                          const patch: Partial<LineDraft> = { po_line_id: newPoLineId };
                          if (pl && Number(pl.open_qty) > 0) {
                            patch.quantity = pl.open_qty;
                            if ((UOMS as readonly string[]).includes(pl.uom)) {
                              patch.unit = pl.uom as Uom;
                            }
                          }
                          updateLine(idx, patch);
                        }}
                        disabled={poDetailQuery.isLoading || poLines.length === 0}
                      >
                        <option value="">— unmatched —</option>
                        {poLines.map((pl) => {
                          const nameLabel = pl.component_name ?? pl.item_name ?? pl.component_id ?? pl.item_id ?? "—";
                          const statusNote = pl.line_status === "CLOSED" ? " [CLOSED]" : pl.line_status === "CANCELLED" ? " [CANCELLED]" : "";
                          return (
                            <option key={pl.po_line_id} value={pl.po_line_id}>
                              #{pl.line_number} · {nameLabel} · {pl.open_qty} open / {pl.ordered_qty} ordered {pl.uom}{statusNote}
                            </option>
                          );
                        })}
                      </select>
                      {(() => {
                        if (!line.po_line_id) return null;
                        const selectedPl = poLines.find((pl) => pl.po_line_id === line.po_line_id);
                        if (!selectedPl) return null;
                        if (Number(selectedPl.open_qty) <= 0) {
                          return (
                            <span className="mt-1 block text-3xs text-warning-fg">
                              This line is fully received (open qty: 0) — posting will create an over-receipt.
                            </span>
                          );
                        }
                        return (
                          <span className="mt-1 block text-3xs text-fg-muted">
                            Still outstanding: {selectedPl.open_qty} {selectedPl.uom}
                          </span>
                        );
                      })()}
                    </label>
                  ) : null}
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
                setPoId("");
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

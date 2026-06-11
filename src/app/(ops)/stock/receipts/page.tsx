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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import { componentItemType } from "@/lib/contracts/components";
import { cn } from "@/lib/cn";
// Tranche 020 — Smart-picker UX for PO linkage.
import { ReceiptLandingPicker } from "./_components/ReceiptLandingPicker";
import { POLedgerHeader } from "./_components/POLedgerHeader";
import { POLineMatchCard } from "./_components/POLineMatchCard";
import type { ReceiptTrack } from "./_components/types";
// Tranche 022 — strip 8-dp noise from prefill values before they hit
// the number input.
import { fmtNumStr } from "@/lib/utils/format-quantity";
// Tranche 023 — Lucide icons replace decorative emojis for a more
// professional surface.
import { FilePen, Lightbulb, ArrowDown, Lock } from "lucide-react";

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
  // Drives the goods-receipt item_type (RM vs PKG). The API rejects a line
  // whose item_type does not match this class — see componentItemType().
  component_class: string | null;
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
  // null when a component's component_class is unknown/missing — the line is
  // blocked at submit rather than sent with a guessed item_type the API 409s.
  item_type: ItemType | null;
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
  // UX: posted line details for success display (improvement #19)
  postedLineDetails?: Array<{ label: string; quantity: string; unit: Uom }>;
}

// ---------------------------------------------------------------------------
// UI-only: Relative time helper (improvement #27)
// ---------------------------------------------------------------------------
function relativeTime(dateTimeLocal: string): string {
  if (!dateTimeLocal) return "";
  try {
    const d = new Date(dateTimeLocal);
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (Math.abs(diffSec) < 60) return "just now";
    const diffMin = Math.round(diffSec / 60);
    if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)}m ${diffMin >= 0 ? "ago" : "from now"}`;
    const diffHr = Math.round(diffMin / 60);
    return `${Math.abs(diffHr)}h ${diffHr >= 0 ? "ago" : "from now"}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// UI-only: Searchable Combobox (improvements #5, #10)
// Fully keyboard navigable (↑↓Enter, Esc closes). Closes on outside click.
// All onChange/disabled/value logic is delegated to the caller — this is
// purely a presentation wrapper.
// ---------------------------------------------------------------------------
interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  "data-testid"?: string;
  required?: boolean;
}

function Combobox({ options, value, onChange, placeholder, disabled, inputRef, "data-testid": testId, required }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openList() {
    if (!disabled) {
      setOpen(true);
      setHighlightIdx(0);
    }
  }

  function selectOption(opt: ComboboxOption) {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") openList();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIdx]) selectOption(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlightIdx] as HTMLLIElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        className={cn("input w-full transition-colors duration-150", disabled && "cursor-not-allowed opacity-60")}
        placeholder={open ? "Search…" : (selectedLabel || placeholder || "— select —")}
        value={open ? query : selectedLabel}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlightIdx(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        data-testid={testId}
        required={required && !value}
        autoComplete="off"
        readOnly={disabled}
      />
      {open && !disabled && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-bg-raised shadow-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">No results</li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.value || `__empty_${i}`}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm transition-colors duration-150",
                  i === highlightIdx ? "bg-accent-soft text-accent" : "text-fg hover:bg-bg-subtle",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt);
                }}
                onMouseEnter={() => setHighlightIdx(i)}
                role="option"
                aria-selected={opt.value === value}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI-only: Step progress indicator (improvement #1)
// ---------------------------------------------------------------------------
function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-6 flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step} className="flex flex-1 items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150",
                i < current
                  ? "bg-accent text-white"
                  : i === current
                    ? "bg-accent text-white ring-2 ring-accent ring-offset-2"
                    : "bg-bg-subtle text-fg-muted",
              )}
            >
              {i < current ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8 15.414l-4.707-4.707a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "mt-1 hidden text-3xs font-medium sm:block",
                i === current ? "text-accent" : "text-fg-subtle",
              )}
            >
              {step}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "mx-1 h-px flex-1 transition-colors duration-150",
                i < current ? "bg-accent" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI-only: Spinner SVG (improvement #30)
// ---------------------------------------------------------------------------
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 14.627 0 12 0v4a8 8 0 00-8 8H4z"
      />
    </svg>
  );
}

export default function GoodsReceiptPage() {
  // Cycle 16 — URL-driven prefill (W4 spec §3.4). When the operator arrives
  // here from the "Receive against this PO →" CTA on /purchase-orders/[po_id]
  // (cycle 14, commit 19c0025), the URL carries ?po_id=<uuid>. We read it
  // ONCE on mount and lock the supplier picker plus prepopulate lines.
  // Direct-entry path (no ?po_id=) is preserved verbatim.
  const searchParams = useSearchParams();
  const urlPoId = searchParams?.get("po_id") ?? "";
  const queryClient = useQueryClient();

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
      // Resolve item_type from the component's class so packaging components
      // submit as PKG, not RM. Mirrors the API's COMPONENT_CLASS_BY_ITEM_TYPE;
      // null (unknown/missing class) blocks the line at submit.
      item_type: componentItemType(c.component_class),
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

  // Tranche 020 — track state machine. Gates the Smart Landing Picker.
  //  - undecided: render <ReceiptLandingPicker> at the top, hide the form.
  //  - po:        render <POLedgerHeader>, form active, per-line match cards on.
  //  - manual:    no PO header; form active; supplier-level PO hint surfaces.
  // URL-driven prefill jumps straight to "po"; the manual button below
  // jumps to "manual". A reset returns to "undecided".
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const track: ReceiptTrack = urlPoLocked
    ? "po"
    : poId
      ? "po"
      : manualConfirmed
        ? "manual"
        : "undecided";

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
    // Tranche 020 — extended to also run for landing-picked POs (not
    // just URL-driven). Resolves supplier from either the URL header
    // fetch or the open-POs list, so picking a PO from the Smart Picker
    // yields the same prefilled receipt drafts as arriving with ?po_id=.
    if (!poId) return;
    if (prefillApplied) return;
    if (urlPoLocked && urlPoTerminal) return;
    if (urlPoLocked && !urlPoHeader) return; // wait for header in URL flow
    if (poDetailQuery.isLoading) return;
    if (poLines.length === 0) return; // wait for lines

    // Sync supplier from whichever source is available.
    const landingPick = openPosQuery.data?.rows.find((p) => p.po_id === poId);
    const supplierFromPo =
      urlPoHeader?.supplier_id ?? landingPick?.supplier_id ?? "";
    if (supplierFromPo && supplierId !== supplierFromPo) {
      setSupplierId(supplierFromPo);
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
        // Tranche 022 — prefilled qty enters a number input; strip the
        // 8-dp noise so the operator sees "10" not "10.00000000".
        quantity: fmtNumStr(pl.open_qty),
        unit,
        notes: "",
        po_line_id: pl.po_line_id,
      };
    });
    setLines(drafts);
    setPrefillApplied(true);
  }, [
    poId,
    urlPoLocked,
    prefillApplied,
    urlPoTerminal,
    urlPoHeader,
    poDetailQuery.isLoading,
    poLines,
    openPosQuery.data,
    supplierId,
  ]);

  // When the operator picks a PO, default the supplier to the PO's
  // supplier so the supplier dropdown stays consistent. The operator can
  // still change it; the API will 409 SUPPLIER_MISMATCH if so.
  function handlePoChange(nextPoId: string): void {
    setPoId(nextPoId);
    // Tranche 020 — reset prefill flag so the new PO's lines can seed
    // the receipt drafts (Smart Landing path mirrors the URL-driven
    // path's prefill behavior). The guard in the effect still prevents
    // re-stomping after the operator has edited.
    setPrefillApplied(false);
    if (!nextPoId) {
      // Clear per-line po_line_id selections when un-linking the PO.
      setLines((prev) => prev.map((l) => ({ ...l, po_line_id: "" })));
      return;
    }
    const picked = openPosQuery.data?.rows.find((p) => p.po_id === nextPoId);
    if (picked) {
      // Always sync supplier to the picked PO. Diverging here would just
      // trip the SUPPLIER_MISMATCH 409 at submit.
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
      if (row.item_type === null) {
        setDone({
          kind: "error",
          message: `Line ${i + 1}: "${row.label}" is missing a component classification and can't be received. Ask an admin to set its component class.`,
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
        // Capture per-line details for the bulleted list (improvement #19)
        const postedLineDetails = lines
          .map((l) => {
            const row = receivableByKey.get(l.receivable_key);
            if (!row || !l.quantity) return null;
            return { label: row.label, quantity: l.quantity, unit: l.unit };
          })
          .filter((x): x is { label: string; quantity: string; unit: Uom } => x !== null);
        setDone({
          kind: "success",
          message: committed.idempotent_replay
            ? "Already posted earlier — no duplicate created."
            : "Receipt posted successfully.",
          itemSummary,
          detail: `ref: ${committed.submission_id} · ${committed.lines.length} line${committed.lines.length !== 1 ? "s" : ""}`,
          // Cycle 16: carry PO context through to the success panel so the
          // operator can verify status flip + ledger movement without
          // re-navigating manually.
          poId: committed.po_id ?? undefined,
          poNumber: urlPoHeader?.po_number ?? undefined,
          postedLines: committed.lines.length,
          postedLineDetails,
        });
        // Tranche 042 — a posted receipt changes PO-line received quantities
        // and open-PO statuses; invalidate the whole ["ops","receipts"]
        // prefix so the PO ledger header pills and line tables refresh.
        void queryClient.invalidateQueries({ queryKey: ["ops", "receipts"] });
        // Reset form for a fresh submission
        setLines([emptyLine()]);
        setNotes("");
      } else {
        // Tranche 041 — never show stringified JSON to the operator; prefer
        // the server's message string, else a plain-English fallback.
        const bodyMessage =
          body &&
          typeof body === "object" &&
          typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : null;
        const detail =
          bodyMessage ??
          "Unexpected server response — try again or contact support.";
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

  // ---------------------------------------------------------------------------
  // UI-only state (must not affect business logic)
  // ---------------------------------------------------------------------------

  // #27: Relative time label, updates every 30s
  const [relLabel, setRelLabel] = useState(() => relativeTime(eventAt));
  useEffect(() => {
    setRelLabel(relativeTime(eventAt));
    const id = setInterval(() => setRelLabel(relativeTime(eventAt)), 30_000);
    return () => clearInterval(id);
  }, [eventAt]);

  // #22: Auto-focus supplier combobox.
  // Tranche 020 — Refire on track transition. Previously this only fired
  // once when masters finished loading; with the Smart Landing Picker
  // gating the form, the supplier input doesn't mount until the operator
  // commits to a track, so the original effect no-op'd. Now: focus when
  // the form first appears in manual mode (PO track auto-fills supplier,
  // so leave focus alone there).
  const supplierInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (loading) return;
    if (urlPoLocked) return;
    if (track !== "manual") return;
    supplierInputRef.current?.focus();
  }, [loading, urlPoLocked, track]);

  // #23: Keyboard shortcut ⌘↵ / Ctrl↵ to submit
  const formRef = useRef<HTMLFormElement>(null);
  const handleKeyboardSubmit = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (phase !== "submitting" && formRef.current) {
        formRef.current.requestSubmit();
      }
    }
  }, [phase]);
  useEffect(() => {
    document.addEventListener("keydown", handleKeyboardSubmit);
    return () => document.removeEventListener("keydown", handleKeyboardSubmit);
  }, [handleKeyboardSubmit]);

  // Derived UI state
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
  const shortcutHint = isMac ? "⌘↵ to submit" : "Ctrl+↵ to submit";

  // #3: Live line count badge
  const completeLinesCount = lines.filter(
    (l) => l.receivable_key && Number(l.quantity) > 0,
  ).length;

  // #24: Green dot when at least one complete line
  const hasCompleteLine = completeLinesCount > 0;

  // Tranche 020 — Count of lines that will post as an over-receipt.
  // A line is an over-receipt when its quantity exceeds the matched PO
  // line's open_qty. Matters for the sticky submit-bar warning so the
  // operator sees the exception count before tapping submit.
  const overReceiptCount = useMemo(() => {
    if (!poId || poLines.length === 0) return 0;
    let n = 0;
    for (const l of lines) {
      if (!l.po_line_id) continue;
      const pl = poLines.find((p) => p.po_line_id === l.po_line_id);
      if (!pl) continue;
      const q = Number(l.quantity) || 0;
      const open = Number(pl.open_qty) || 0;
      if (q > open) n++;
    }
    return n;
  }, [lines, poLines, poId]);

  // #12: Duplicate line detection
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Map<number, number>(); // idx → first-seen idx
    lines.forEach((l, i) => {
      if (!l.receivable_key) return;
      if (seen.has(l.receivable_key)) {
        dupes.set(i, seen.get(l.receivable_key)!);
      } else {
        seen.set(l.receivable_key, i);
      }
    });
    return dupes;
  }, [lines]);

  // Supplier combobox options
  const supplierOptions: ComboboxOption[] = useMemo(() => {
    const rows = suppliersQuery.data?.rows ?? [];
    return rows.map((s) => ({
      value: s.supplier_id,
      label: `${s.supplier_name_official} · ${s.supplier_id}`,
    }));
  }, [suppliersQuery.data]);

  // Receivable combobox options per line (uses filteredReceivable for search)
  function getReceivableOptions(): ComboboxOption[] {
    const items = filteredReceivable
      .filter((r) => r.kind === "item")
      .map((r) => ({ value: `${r.kind}:${r.id}`, label: r.label, group: "Finished Goods" }));
    const comps = filteredReceivable
      .filter((r) => r.kind === "component")
      .map((r) => ({ value: `${r.kind}:${r.id}`, label: r.label, group: "Raw materials" }));
    return [...items, ...comps];
  }

  // PO combobox options
  const poOptions: ComboboxOption[] = useMemo(() => {
    const rows = openPosQuery.data?.rows ?? [];
    const opts: ComboboxOption[] = rows.map((p) => ({
      value: p.po_id,
      label: `${p.po_number} · ${p.supplier_id} · ${p.status}${p.expected_receive_date ? ` · exp ${p.expected_receive_date}` : ""}`,
    }));
    // Cycle 16: synthetic option for URL-locked PO not in list
    if (urlPoLocked && urlPoHeader && !rows.some((p) => p.po_id === urlPoHeader.po_id)) {
      opts.unshift({
        value: urlPoHeader.po_id,
        label: `${urlPoHeader.po_number} · ${urlPoHeader.supplier_id} · ${urlPoHeader.status}`,
      });
    }
    return opts;
  }, [openPosQuery.data, urlPoLocked, urlPoHeader]);

  // Selected supplier display name (improvement #6)
  const selectedSupplierName = useMemo(() => {
    return suppliersQuery.data?.rows.find((s) => s.supplier_id === supplierId)?.supplier_name_official ?? "";
  }, [suppliersQuery.data, supplierId]);

  // Tranche 020 — open POs for the selected supplier. Used by the manual-
  // track supplier hint and by future per-line SKU suggestions. Reuses
  // the already-loaded openPosQuery; no extra fetches.
  const supplierOpenPos = useMemo(() => {
    if (!supplierId) return [];
    return (openPosQuery.data?.rows ?? []).filter(
      (p) => p.supplier_id === supplierId,
    );
  }, [openPosQuery.data, supplierId]);

  // Selected PO display (improvement #8)
  const selectedPo = useMemo(() => {
    if (!poId) return null;
    const fromList = openPosQuery.data?.rows.find((p) => p.po_id === poId);
    if (fromList) return fromList;
    if (urlPoLocked && urlPoHeader && urlPoHeader.po_id === poId) {
      return {
        po_id: urlPoHeader.po_id,
        po_number: urlPoHeader.po_number,
        supplier_id: urlPoHeader.supplier_id,
        status: urlPoHeader.status,
        expected_receive_date: urlPoHeader.expected_receive_date,
      } satisfies PoOption;
    }
    return null;
  }, [poId, openPosQuery.data, urlPoLocked, urlPoHeader]);

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

      {/* Tranche 020 — Unified PO Ledger Header. Replaces the Cycle 16
          shimmer strip. Renders for any PO-track receipt (URL-locked or
          operator-picked) and shows aggregate progress instead of a flat
          identity strip. Hidden in terminal-status path (above) and in
          manual / undecided tracks. */}
      {track === "po" && !urlPoTerminal && selectedPo ? (
        <POLedgerHeader
          poId={selectedPo.po_id}
          poNumber={selectedPo.po_number}
          supplierName={
            urlPoHeader?.supplier_name ??
            suppliersQuery.data?.rows.find(
              (s) => s.supplier_id === selectedPo.supplier_id,
            )?.supplier_name_official ??
            selectedPo.supplier_id
          }
          expectedReceiveDate={selectedPo.expected_receive_date}
          status={selectedPo.status}
          poLines={poLines}
          urlLocked={urlPoLocked}
          onSwitch={
            urlPoLocked
              ? undefined
              : () => {
                  // Clear PO selection and return to landing.
                  handlePoChange("");
                  setManualConfirmed(false);
                  setLines([emptyLine()]);
                }
          }
          isLoading={poDetailQuery.isLoading}
        />
      ) : null}

      {/* Success / error banner — hero icon badge + bold title */}
      {done ? (
        <div
          className={cn(
            "mb-6 rounded-xl border px-5 py-5",
            done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-danger/40 bg-danger-softer text-danger-fg",
          )}
          role="status"
          aria-live="polite"
          data-testid={
            done.kind === "success"
              ? "receipt-success-panel"
              : "receipt-error-panel"
          }
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                done.kind === "success" ? "bg-success/15" : "bg-danger/15",
              )}
            >
              {done.kind === "success" ? (
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <div className="flex-1">
              <div className="text-lg font-bold leading-tight">{done.message}</div>
              {/* Per-line stock effect — reinforces the invariant that a
                  posted goods receipt INCREASES stock immediately. The
                  earlier bullet list rendered "Item × qty unit" which
                  implied the direction but did not state it. */}
              {done.kind === "success" && done.postedLineDetails && done.postedLineDetails.length > 0 ? (
                <>
                  <div className="mt-2 text-xs font-medium opacity-90">
                    Stock increased:
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {done.postedLineDetails.map((ld, i) => (
                      <li key={i} className="flex items-center gap-1 text-xs opacity-90">
                        <span className="text-success-fg">+</span>
                        <span>
                          {ld.quantity} {ld.unit} of <strong>{ld.label}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {done.itemSummary && !(done.postedLineDetails && done.postedLineDetails.length > 0) ? (
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
                    className="btn btn-ghost btn-sm transition-colors duration-150"
                    data-testid="receipt-success-back-to-po"
                  >
                    Back to PO{done.poNumber ? ` ${done.poNumber}` : ""} →
                  </Link>
                  <Link
                    href={`/purchase-orders/${encodeURIComponent(done.poId)}?tab=attached-grs`}
                    className="btn btn-ghost btn-sm transition-colors duration-150"
                    data-testid="receipt-success-view-attached-grs"
                  >
                    View receipts on this PO →
                  </Link>
                  {/*
                    Cycle 19 — Movement log link now resolves the ?po_id= filter
                    end-to-end. W1 cycle 18 Task C added the backend filter on
                    /api/v1/queries/stock/ledger; W2 cycle 19 wired the
                    /stock/movement-log page to read ?po_id= from URL, render an
                    active-filter chip with resolved po_number, and provide a
                    "Clear filter" affordance. Closes cycle 12
                    W1-FOLLOWUP-MOVEMENT-LOG-URL-PREFILL.
                  */}
                  <Link
                    href={`/stock/movement-log?po_id=${encodeURIComponent(done.poId)}`}
                    className="btn btn-ghost btn-sm transition-colors duration-150"
                    data-testid="receipt-success-view-movement-log"
                    title="View ledger movements scoped to this PO."
                  >
                    View movement log →
                  </Link>
                </div>
              ) : null}
              {/* #20: Post another receipt button */}
              {done.kind === "success" ? (
                <div className="mt-3">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm transition-colors duration-150"
                    data-testid="receipt-reset"
                    onClick={() => {
                      setLines([emptyLine()]);
                      setNotes("");
                      // Tranche 041 — in the URL-locked flow the supplier
                      // combobox stays disabled and the prefill effect
                      // early-returns on an empty poId, so clearing both
                      // left an un-submittable form. Re-seed the URL's PO
                      // and let prefill re-run instead.
                      if (urlPoLocked) {
                        setPoId(urlPoId);
                        setPrefillApplied(false);
                      } else {
                        setPoId("");
                        setSupplierId("");
                      }
                      // Tranche 020 — also reset the track so the operator
                      // lands back on the Smart Picker (unless URL-locked,
                      // in which case track stays "po" via the urlPoLocked
                      // branch in the track derivation).
                      setManualConfirmed(false);
                      setDone(null);
                      setPhase("idle");
                    }}
                  >
                    Post another receipt
                  </button>
                </div>
              ) : null}
              {/* Error retry — the form stays mounted below, so Retry can
                  re-invoke submit and Dismiss can clear the banner. */}
              {done.kind === "error" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary transition-colors duration-150"
                    data-testid="receipt-error-retry"
                    onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm transition-colors duration-150"
                    data-testid="receipt-error-dismiss"
                    onClick={() => setDone(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        /* #16: Staggered skeleton animation */
        <SectionCard title="Loading masters…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                className="h-9 w-full animate-pulse rounded bg-bg-subtle"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="h-9 w-full animate-pulse rounded bg-bg-subtle"
                style={{ animationDelay: "120ms" }}
              />
            </div>
            <div
              className="h-9 w-full animate-pulse rounded bg-bg-subtle"
              style={{ animationDelay: "240ms" }}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div
                className="h-9 w-full animate-pulse rounded bg-bg-subtle"
                style={{ animationDelay: "360ms" }}
              />
              <div
                className="h-9 w-full animate-pulse rounded bg-bg-subtle"
                style={{ animationDelay: "480ms" }}
              />
              <div
                className="h-9 w-full animate-pulse rounded bg-bg-subtle"
                style={{ animationDelay: "600ms" }}
              />
            </div>
          </div>
        </SectionCard>
      ) : loadErr ? (
        /* #17: Prominent error card with red left border and retry button */
        <SectionCard title="Could not load suppliers / items / components">
          <div className="rounded border-l-4 border-danger bg-danger-softer p-4 text-sm text-danger-fg">
            <div className="font-semibold">Could not load masters</div>
            <div className="mt-1 text-xs">{(loadErr as Error).message}</div>
            <button
              type="button"
              onClick={() => {
                void itemsQuery.refetch();
                void componentsQuery.refetch();
                void suppliersQuery.refetch();
              }}
              className="mt-3 btn btn-sm btn-primary transition-colors duration-150"
            >
              Retry all
            </button>
          </div>
        </SectionCard>
      ) : urlPoLocked && urlPoTerminal ? null : track === "undecided" ? (
        /* Tranche 020 — Smart Landing Picker. Hidden when URL-driven (jumps
            straight to PO track) or when the operator has already chosen a
            track via the picker. */
        <ReceiptLandingPicker
          openPos={openPosQuery.data?.rows ?? []}
          suppliers={suppliersQuery.data?.rows ?? []}
          isLoadingPos={openPosQuery.isLoading}
          onSelectPo={(po) => {
            handlePoChange(po.po_id);
            setLines([emptyLine()]);
          }}
          onStartManual={() => {
            setManualConfirmed(true);
            // Manual mode: clear any prior PO selection.
            if (poId) handlePoChange("");
          }}
        />
      ) : (
        <>
          {/* Tranche 020 — Manual-track context strip (shown when operator
              chose "Receive without PO" on the Landing Picker). Gives a
              clear way back to the picker so the choice doesn't feel
              one-way. */}
          {track === "manual" ? (
            <div
              className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-bg-subtle/60 px-3 py-2 text-xs"
              role="note"
              data-testid="receipts-manual-context-strip"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-raised px-2 py-0.5 font-medium text-fg">
                <FilePen className="h-3.5 w-3.5" aria-hidden="true" />
                Manual receipt — no PO
              </span>
              <span className="text-fg-muted">
                You can switch to a PO at any time.
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto transition-colors duration-150"
                onClick={() => {
                  setManualConfirmed(false);
                  if (poId) handlePoChange("");
                  setLines([emptyLine()]);
                }}
                data-testid="receipts-manual-back-to-picker"
              >
                ← Pick a PO instead
              </button>
            </div>
          ) : null}

          {/* Tranche 020 — Supplier-level PO hint. When the operator is in
              manual mode and has picked a supplier with open POs, surface
              a one-tap nudge to link before submitting. Uses already-
              loaded openPosQuery data; no extra fetches. */}
          {track === "manual" && supplierId && supplierOpenPos.length > 0 ? (
            <div
              className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-info/40 bg-info-softer px-3 py-2 text-xs text-info-fg"
              role="status"
              data-testid="receipts-manual-supplier-hint"
            >
              <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold">
                  {selectedSupplierName || "This supplier"}
                </span>{" "}
                has{" "}
                <span className="font-semibold">
                  {supplierOpenPos.length} open PO
                  {supplierOpenPos.length !== 1 ? "s" : ""}
                </span>
                . Link this receipt to one?
              </span>
              <div className="ml-auto flex items-center gap-1">
                {supplierOpenPos.length === 1 ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary transition-colors duration-150"
                    onClick={() => {
                      handlePoChange(supplierOpenPos[0].po_id);
                      setManualConfirmed(false);
                    }}
                    data-testid="receipts-manual-supplier-hint-link"
                  >
                    Link to {supplierOpenPos[0].po_number} →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary transition-colors duration-150"
                    onClick={() => {
                      setManualConfirmed(false);
                      // Drop back to landing so the operator can pick from the list.
                    }}
                    data-testid="receipts-manual-supplier-hint-browse"
                  >
                    Browse {supplierOpenPos.length} →
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* #1: 3-step progress indicator (client-side visual only) */}
          <StepIndicator
            steps={["Header", "Lines", "Review"]}
            current={
              !supplierId ? 0
                : lines.every((l) => !l.receivable_key) ? 1
                  : 2
            }
          />

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            <SectionCard title="Receipt context">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Event time *
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      className="input flex-1 transition-colors duration-150"
                      value={eventAt}
                      onChange={(e) => setEventAt(e.target.value)}
                      required
                      disabled={phase === "submitting"}
                      data-testid="receipt-event-at"
                    />
                    {/* #27: Relative time label */}
                    {relLabel ? (
                      <span className="shrink-0 text-3xs text-fg-muted">{relLabel}</span>
                    ) : null}
                  </div>
                </label>
                <label className="block min-w-0">
                  <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                    Supplier *
                    {/* #7: Lock icon when urlPoLocked */}
                    {urlPoLocked ? (
                      <Lock
                        className="ml-1 inline h-3 w-3 text-fg-muted"
                        aria-label="Supplier locked"
                      />
                    ) : null}
                  </span>
                  {/* #5: Searchable supplier combobox */}
                  <Combobox
                    options={supplierOptions}
                    value={supplierId}
                    onChange={setSupplierId}
                    placeholder="— select supplier —"
                    disabled={urlPoLocked || phase === "submitting"}
                    inputRef={supplierInputRef}
                    data-testid="receipt-supplier-select"
                    required
                  />
                  {/* #6: Supplier chip when selected and not locked */}
                  {supplierId && selectedSupplierName && !urlPoLocked ? (
                    <span className="mt-1.5 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-3xs font-medium text-accent">
                      {selectedSupplierName}
                    </span>
                  ) : null}
                  {urlPoLocked && urlPoHeader ? (
                    <span
                      id="receipt-supplier-locked-caption"
                      className="mt-1 block text-3xs text-fg-muted"
                    >
                      From PO {urlPoHeader.po_number} — supplier locked.
                    </span>
                  ) : null}
                </label>

                {/* Tranche 020 — PO reference field removed from form.
                    Identity + status + progress are now shown by the
                    sticky <POLedgerHeader> at top; track changes via the
                    Smart Landing Picker or its "Switch" affordance.
                    Only inline error / loading callouts for the PO-lines
                    fetch remain here, so picker degradation is still
                    surfaced to the operator. */}
                {poId && poDetailQuery.isError ? (
                  <div className="sm:col-span-2 rounded-md border border-warning/40 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
                    Couldn&apos;t load PO lines — per-line match will fall
                    back to unmatched. Try refreshing if this persists.
                  </div>
                ) : null}
                {poId && !poDetailQuery.isLoading && !poDetailQuery.isError && poLines.length === 0 ? (
                  <div className="sm:col-span-2 rounded-md border border-warning/40 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
                    Selected PO returned no lines — receipt will post with
                    po_id but each line will be unmatched.
                  </div>
                ) : null}

                {/* #9: Prefill banner */}
                {poId && prefillApplied && lines.some((l) => l.receivable_key) ? (
                  <div className="sm:col-span-2 flex items-center gap-2 rounded-md border border-info/30 bg-info-softer px-3 py-2 text-xs text-info-fg">
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>
                      {lines.filter((l) => l.receivable_key).length} line{lines.filter((l) => l.receivable_key).length !== 1 ? "s" : ""} prefilled from PO — quantities editable
                    </span>
                  </div>
                ) : null}

                <label className="block min-w-0 sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-fg">
                    Header notes
                  </span>
                  <div className="relative">
                    <textarea
                      className="input min-h-[3rem] w-full resize-y transition-colors duration-150"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional header-level notes."
                      disabled={phase === "submitting"}
                      data-testid="receipt-notes"
                    />
                    {/* #21: Live character count */}
                    <span className="pointer-events-none absolute bottom-1.5 right-2 text-3xs text-fg-subtle">
                      {notes.length} chars
                    </span>
                  </div>
                </label>
              </div>
            </SectionCard>

            {/* #3: Live line count badge; #24: green dot when complete line exists */}
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  Lines
                  {/* #24: Green dot */}
                  {hasCompleteLine && (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-success-fg"
                      title="At least one complete line"
                      aria-label="At least one complete line"
                    />
                  )}
                  {/* #3: Count badge */}
                  <span className="ml-0.5 inline-flex items-center rounded-full bg-bg-subtle px-2 py-0.5 text-3xs font-medium text-fg-muted">
                    {lines.length}
                  </span>
                </span>
              }
              description="At least one line is required. Quantities must be positive."
            >
              {/* Line search — filters the item/component picker only.
                  Does NOT affect lines state or the submit payload. */}
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="search"
                  className="input flex-1 transition-colors duration-150"
                  placeholder="Search by name or SKU…"
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                  aria-label="Search items and components"
                  disabled={phase === "submitting"}
                />
                {lineSearch ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0 transition-colors duration-150"
                    onClick={() => setLineSearch("")}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {/* Tranche 020 — Empty-state nudge. When the operator hasn't
                  filled in any line yet (fresh form, single empty draft),
                  give them an unmissable hint at what to do next. Common
                  in manual track; rare in PO track because prefill seeds
                  lines from the PO. */}
              {lines.length === 1 && !lines[0].receivable_key ? (
                <div
                  className="mb-3 flex items-start gap-2 rounded-md border border-dashed border-info/40 bg-info-softer/60 px-3 py-2.5 text-xs text-info-fg"
                  role="note"
                  data-testid="receipt-lines-empty-state"
                >
                  <ArrowDown className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Pick an item or component on the line below to get
                    started. Quantity prefills from PO when matched.
                  </span>
                </div>
              ) : null}
              <div className="space-y-3">
                {lines.map((line, idx) => {
                  const isComplete = !!(line.receivable_key && Number(line.quantity) > 0);
                  const isDupe = duplicateKeys.has(idx);
                  const dupeOfIdx = duplicateKeys.get(idx);
                  const lineRow = receivableByKey.get(line.receivable_key);

                  return (
                    <div
                      key={idx}
                      className={cn(
                        /* #13: accent left border when complete */
                        "relative grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 pl-6 transition-colors duration-150 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] md:pl-3",
                        isComplete && "border-l-2 border-l-accent",
                      )}
                    >
                      {/* #14: Line number badge — Tranche 020: bigger,
                          more visible, color-coded by completion state
                          so the operator can count at a glance. The
                          smaller -2/-2 outward offset keeps the badge
                          inside the SectionCard's p-4 padding even on
                          a 320px viewport. */}
                      <span
                        className={cn(
                          "absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm transition-colors",
                          isComplete
                            ? "bg-accent text-white"
                            : "bg-bg-raised border border-border text-fg",
                        )}
                        aria-label={`Line ${idx + 1}${isComplete ? " — complete" : ""}`}
                      >
                        {idx + 1}
                      </span>

                      {/* #12: Duplicate warning */}
                      {isDupe ? (
                        <div className="col-span-full flex items-center gap-1.5 rounded bg-warning-softer px-2 py-1.5 text-xs text-warning-fg">
                          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {lineRow?.label ?? "Item"} is already on line {(dupeOfIdx ?? 0) + 1}
                        </div>
                      ) : null}

                      <label className="block min-w-0">
                        <span className="mb-2 block text-sm font-semibold text-fg md:hidden">
                          Item or component *
                        </span>
                        {/* #10: Searchable per-line combobox */}
                        <Combobox
                          options={getReceivableOptions()}
                          value={line.receivable_key}
                          onChange={(key) => {
                            const row = receivableByKey.get(key);
                            updateLine(idx, {
                              receivable_key: key,
                              unit: row ? row.default_uom : line.unit,
                            });
                          }}
                          placeholder="— item or component —"
                          disabled={phase === "submitting"}
                          required
                        />
                      </label>

                      <label className="block min-w-0">
                        <span className="mb-2 block text-sm font-semibold text-fg md:hidden">
                          Quantity *
                        </span>
                        {/* Quantity hero — bigger steppers, bolder numeric input. */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border text-lg font-bold leading-none text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-150 disabled:opacity-40"
                            disabled={phase === "submitting"}
                            onClick={() => {
                              const cur = Number(line.quantity) || 0;
                              if (cur > 1) updateLine(idx, { quantity: String(cur - 1) });
                            }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            className="input flex-1 min-w-0 h-12 text-center text-xl font-mono font-semibold tabular-nums transition-colors duration-150"
                            placeholder="Qty"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(idx, { quantity: e.target.value })
                            }
                            required
                            disabled={phase === "submitting"}
                          />
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border text-lg font-bold leading-none text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-150 disabled:opacity-40"
                            disabled={phase === "submitting"}
                            onClick={() => {
                              const cur = Number(line.quantity) || 0;
                              updateLine(idx, { quantity: String(cur + 1) });
                            }}
                          >
                            +
                          </button>
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className="mb-2 block text-sm font-semibold text-fg md:hidden">
                          Unit
                        </span>
                        <select
                          className="input transition-colors duration-150"
                          value={line.unit}
                          onChange={(e) =>
                            updateLine(idx, { unit: e.target.value as Uom })
                          }
                          disabled={phase === "submitting"}
                        >
                          {UOMS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        {/* #15: Default UOM hint */}
                        {lineRow ? (
                          <span className="mt-0.5 block text-3xs text-fg-muted">
                            Default: {lineRow.default_uom}
                          </span>
                        ) : null}
                      </label>

                      <label className="block min-w-0">
                        <span className="mb-2 block text-sm font-semibold text-fg md:hidden">
                          Line notes
                        </span>
                        <input
                          className="input transition-colors duration-150"
                          placeholder="Line notes (optional)"
                          value={line.notes}
                          onChange={(e) =>
                            updateLine(idx, { notes: e.target.value })
                          }
                          disabled={phase === "submitting"}
                        />
                      </label>

                      {/* #29: Remove button with × SVG icon */}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm group flex items-center gap-1 md:self-end transition-colors duration-150"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1 || phase === "submitting"}
                        aria-label={`Remove line ${idx + 1}`}
                      >
                        <svg
                          className="h-4 w-4 text-fg-muted transition-colors duration-150 group-hover:text-danger-fg group-enabled:group-hover:text-danger-fg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="sr-only">Remove</span>
                      </button>

                      {/* Tranche 020 — Per-line PO match card. Replaces
                          the inline native <select> with progress pills
                          (Ordered / Received / Now / Left), a stacked
                          progress bar, and a bold over-receipt callout.
                          The picker itself is friendlier than the
                          previous select — clear line numbers, item
                          names, open/ordered chips, and status. */}
                      {track === "po" && poId ? (
                        <POLineMatchCard
                          mode="po"
                          poLines={poLines}
                          selectedPoLineId={line.po_line_id}
                          receivingQty={line.quantity}
                          onChangeMatch={(poLineId, autoFillQty, autoFillUom) => {
                            const patch: Partial<LineDraft> = {
                              po_line_id: poLineId,
                            };
                            if (autoFillQty !== undefined) {
                              // Tranche 022 — strip 8-dp noise so the qty
                              // input shows "10" not "10.00000000".
                              patch.quantity = fmtNumStr(autoFillQty);
                            }
                            if (
                              autoFillUom &&
                              (UOMS as readonly string[]).includes(autoFillUom)
                            ) {
                              patch.unit = autoFillUom as Uom;
                            }
                            updateLine(idx, patch);
                          }}
                          disabled={
                            poDetailQuery.isLoading || phase === "submitting"
                          }
                          testIdPrefix={`receipt-line-${idx}`}
                        />
                      ) : null}
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm transition-colors duration-150"
                  onClick={addLine}
                  disabled={phase === "submitting"}
                  data-testid="receipt-add-line"
                >
                  + Add line
                </button>
              </div>
            </SectionCard>

            {/* #2: Sticky submit bar */}
            <div
              className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg-raised/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6"
            >
              {/* #4: Receipt summary preview + Tranche 020 over-receipt summary. */}
              {(supplierId || lines.some((l) => l.receivable_key)) ? (
                <div
                  className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted"
                  // aria-live so screen readers announce completion count
                  // changes as the operator fills the form.
                  aria-live="polite"
                  data-testid="receipt-summary-bar"
                >
                  <span>Summary:</span>
                  {selectedSupplierName ? (
                    <span className="font-medium text-fg">{selectedSupplierName}</span>
                  ) : null}
                  {lines.some((l) => l.receivable_key) ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{lines.filter((l) => l.receivable_key).length} line{lines.filter((l) => l.receivable_key).length !== 1 ? "s" : ""}</span>
                      <span aria-hidden="true">·</span>
                      <span>{completeLinesCount} complete</span>
                    </>
                  ) : null}
                  {overReceiptCount > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-danger-softer px-2 py-0.5 text-3xs font-semibold text-danger-fg"
                      data-testid="receipt-summary-over-receipt"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {overReceiptCount} over-receipt
                      {overReceiptCount !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Tranche 020 — quick exit back to the Smart Picker. The
                    Reset button below also returns to Picker, but its
                    label suggests destruction; this affordance is the
                    explicit, friendly path. Hidden in URL-locked flows
                    (no Picker to go back to). */}
                {!urlPoLocked ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm mr-auto transition-colors duration-150"
                    onClick={() => {
                      setLines([emptyLine()]);
                      setNotes("");
                      setPoId("");
                      setManualConfirmed(false);
                      setDone(null);
                    }}
                    disabled={phase === "submitting"}
                    data-testid="receipt-back-to-picker"
                  >
                    ← Pick again
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn transition-colors duration-150"
                  onClick={() => {
                    setLines([emptyLine()]);
                    setNotes("");
                    setPoId("");
                    // Tranche 020 — also unwind the track so reset takes
                    // the operator back to the Smart Picker (unless
                    // URL-locked).
                    setManualConfirmed(false);
                    setDone(null);
                  }}
                  disabled={phase === "submitting"}
                  data-testid="receipt-reset"
                >
                  Reset
                </button>
                {/* #23: Keyboard shortcut hint */}
                <span className="hidden text-3xs text-fg-subtle sm:block">{shortcutHint}</span>
                <button
                  type="submit"
                  className="btn btn-lg btn-primary flex items-center gap-2 transition-colors duration-150"
                  disabled={phase === "submitting"}
                  data-testid="receipt-submit"
                >
                  {/* #30: Spinner when submitting */}
                  {phase === "submitting" ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Submitting…
                    </>
                  ) : (
                    "Submit receipt"
                  )}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </>
  );
}

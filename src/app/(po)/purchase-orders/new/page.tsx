"use client";

// ---------------------------------------------------------------------------
// Purchase Orders · Manual Creation — /purchase-orders/new
//
// 2026-04-26 (CLAUDE.md §"PO workflow" amendment — planner/admin may create a
// PO directly without a planning recommendation, with a mandatory reason).
// 2026-04-27 — converted to English (matching portal convention per a558e9e),
// added SearchableSelect comboboxes for supplier + line orderable, tightened
// visual hierarchy.
//
// Gate: planning:execute (planner + admin only). Operators and viewers see
// an access-restricted message via <RoleGate>.
//
// Submit: POST /api/purchase-orders
//   201 → redirect to /purchase-orders/[po_id]
//   409 idempotent replay → success banner + redirect
//   422 → server error banner with the first issue surfaced
//   503/5xx → connection error banner
// ---------------------------------------------------------------------------

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FilePlus2, Trash2 } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { RoleGate } from "@/lib/auth/role-gate";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/fields/SearchableSelect";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types (mirrors of upstream schemas)
// ---------------------------------------------------------------------------

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  status: string;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
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

interface OrderableRow {
  kind: "item" | "component";
  id: string;
  label: string;
  meta: string;
  default_uom: Uom;
}

interface LineDraft {
  // "item:<id>" | "component:<id>"
  orderable_key: string;
  quantity: string;
  uom: Uom;
}

interface ValidationErrors {
  supplier_id?: string;
  expected_receive_date?: string;
  manual_reason?: string;
  lines?: string;
  line_items?: Record<
    number,
    { orderable_key?: string; quantity?: string; uom?: string }
  >;
  general?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function toUom(raw: string | null | undefined): Uom {
  if (raw && (UOMS as readonly string[]).includes(raw)) return raw as Uom;
  return "UNIT";
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `po_manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

function emptyLine(): LineDraft {
  return { orderable_key: "", quantity: "", uom: "UNIT" };
}

const REQUIRED_LABEL = (
  <span className="ml-0.5 text-danger-fg" aria-hidden>
    *
  </span>
);

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function ManualPoFormInner(): JSX.Element {
  const router = useRouter();

  // --- Master data queries --------------------------------------------------
  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["master", "suppliers", "ACTIVE"],
    queryFn: () => fetchJson("/api/suppliers?status=ACTIVE&limit=500"),
    staleTime: 60_000,
  });

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["master", "components", "ACTIVE"],
    queryFn: () => fetchJson("/api/components?status=ACTIVE&limit=1000"),
    staleTime: 60_000,
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "ACTIVE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
    staleTime: 60_000,
  });

  // Supplier options sorted alphabetically by official name.
  const supplierOptions: SearchableSelectOption[] = useMemo(() => {
    const rows = suppliersQuery.data?.rows ?? [];
    return rows
      .slice()
      .sort((a, b) =>
        a.supplier_name_official.localeCompare(b.supplier_name_official),
      )
      .map((s) => ({
        value: s.supplier_id,
        label: s.supplier_name_official,
        meta: s.supplier_id,
      }));
  }, [suppliersQuery.data]);

  // Unified orderable list: BOUGHT_FINISHED items + all active components,
  // grouped (Item / Component) for visual segmentation in the dropdown.
  const orderables: OrderableRow[] = useMemo(() => {
    const items = (itemsQuery.data?.rows ?? [])
      .filter((i) => i.supply_method === "BOUGHT_FINISHED")
      .map(
        (i): OrderableRow => ({
          kind: "item",
          id: i.item_id,
          label: i.item_name,
          meta: i.sku ?? i.item_id,
          default_uom: toUom(i.sales_uom),
        }),
      );
    const components = (componentsQuery.data?.rows ?? []).map(
      (c): OrderableRow => ({
        kind: "component",
        id: c.component_id,
        label: c.component_name,
        meta: c.component_id,
        default_uom: toUom(c.inventory_uom ?? c.purchase_uom ?? c.bom_uom),
      }),
    );
    return [...items, ...components].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [itemsQuery.data, componentsQuery.data]);

  const orderableOptions: SearchableSelectOption[] = useMemo(
    () =>
      orderables.map((r) => ({
        value: `${r.kind}:${r.id}`,
        label: r.label,
        meta: r.meta,
        group: r.kind === "item" ? "Finished goods" : "Components",
      })),
    [orderables],
  );

  const orderableByKey = useMemo(() => {
    const m = new Map<string, OrderableRow>();
    for (const r of orderables) m.set(`${r.kind}:${r.id}`, r);
    return m;
  }, [orderables]);

  // --- Form state -----------------------------------------------------------
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState(todayPlusDays(7));
  const [manualReason, setManualReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  // --- Submission state -----------------------------------------------------
  type Phase = "idle" | "submitting" | "success" | "idempotent";
  const [phase, setPhase] = useState<Phase>("idle");
  const [successPoId, setSuccessPoId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // --- Line helpers ---------------------------------------------------------
  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateLine = useCallback(
    (idx: number, patch: Partial<LineDraft>) => {
      setLines((prev) =>
        prev.map((l, i) => {
          if (i !== idx) return l;
          const updated = { ...l, ...patch };
          // Auto-set uom from orderable default when picking a new item
          if (
            patch.orderable_key !== undefined &&
            patch.orderable_key !== l.orderable_key
          ) {
            const row = orderableByKey.get(patch.orderable_key);
            if (row) updated.uom = row.default_uom;
          }
          return updated;
        }),
      );
    },
    [orderableByKey],
  );

  // --- Client-side validation -----------------------------------------------
  function validate(): ValidationErrors {
    const errs: ValidationErrors = {};
    const lineErrors: Record<
      number,
      { orderable_key?: string; quantity?: string; uom?: string }
    > = {};

    if (!supplierId.trim()) errs.supplier_id = "Required.";
    if (!expectedDate.trim()) errs.expected_receive_date = "Required.";
    if (!manualReason.trim()) {
      errs.manual_reason = "Required.";
    } else if (manualReason.trim().length < 5) {
      errs.manual_reason = "Reason must be at least 5 characters.";
    }
    if (lines.length === 0) {
      errs.lines = "At least one line is required.";
    } else {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const le: { orderable_key?: string; quantity?: string; uom?: string } =
          {};
        if (!l.orderable_key) le.orderable_key = "Required.";
        if (!l.quantity.trim()) {
          le.quantity = "Required.";
        } else {
          const n = Number(l.quantity);
          if (isNaN(n) || n <= 0) le.quantity = "Must be greater than 0.";
        }
        if (!l.uom) le.uom = "Required.";
        if (Object.keys(le).length > 0) lineErrors[i] = le;
      }
    }
    if (Object.keys(lineErrors).length > 0) errs.line_items = lineErrors;
    return errs;
  }

  // --- Submit ---------------------------------------------------------------
  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setServerError(null);

    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});
    setPhase("submitting");

    const body = {
      idempotency_key: newIdempotencyKey(),
      supplier_id: supplierId,
      expected_receive_date: expectedDate,
      manual_reason: manualReason.trim(),
      notes: notes.trim() || null,
      source_type: "manual" as const,
      lines: lines.map((l) => {
        const row = orderableByKey.get(l.orderable_key);
        if (!row) throw new Error("Orderable not found");
        return {
          ...(row.kind === "component"
            ? { component_id: row.id, item_id: null }
            : { item_id: row.id, component_id: null }),
          qty_ordered: Number(l.quantity),
          uom_id: l.uom,
        };
      }),
    };

    let res: Response;
    try {
      res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setServerError(
        "Could not submit. Check your connection and try again.",
      );
      setPhase("idle");
      return;
    }

    if (res.status === 201 || res.status === 200) {
      const data = (await res.json().catch(() => ({}))) as {
        po_id?: string;
        idempotent_replay?: boolean;
      };
      const poId = data.po_id;
      if (data.idempotent_replay) {
        setPhase("idempotent");
        setSuccessPoId(poId ?? null);
        if (poId) {
          setTimeout(
            () =>
              router.push(`/purchase-orders/${encodeURIComponent(poId)}`),
            1500,
          );
        }
        return;
      }
      setPhase("success");
      setSuccessPoId(poId ?? null);
      if (poId) {
        router.push(`/purchase-orders/${encodeURIComponent(poId)}`);
      }
      return;
    }

    if (res.status === 409) {
      const data = (await res.json().catch(() => ({}))) as { po_id?: string };
      setPhase("idempotent");
      setSuccessPoId(data.po_id ?? null);
      if (data.po_id) {
        setTimeout(
          () =>
            router.push(
              `/purchase-orders/${encodeURIComponent(data.po_id!)}`,
            ),
          1500,
        );
      }
      return;
    }

    if (res.status === 422) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        issues?: Array<{ path: string[]; message: string }>;
      };
      setServerError(
        data.error ??
          (data.issues?.[0]?.message
            ? `Validation error: ${data.issues[0].message}`
            : "Validation error. Check the form and try again."),
      );
      setPhase("idle");
      return;
    }

    // 503 / 5xx
    setServerError("Could not submit. Check your connection and try again.");
    setPhase("idle");
  }

  const masterDataLoading =
    suppliersQuery.isLoading ||
    componentsQuery.isLoading ||
    itemsQuery.isLoading;

  // --- Success / idempotent states ------------------------------------------
  if (phase === "success" || phase === "idempotent") {
    return (
      <>
        <WorkflowHeader eyebrow="Purchase Orders" title="New manual order" />
        <SectionCard>
          <div className="px-6 py-10 text-center space-y-2">
            <div className="text-sm font-semibold text-success-fg">
              {phase === "idempotent"
                ? "This purchase order already exists."
                : "Purchase order created."}
            </div>
            {successPoId && (
              <div className="text-xs text-fg-muted font-mono">
                {successPoId}
              </div>
            )}
            <div className="text-xs text-fg-faint">Redirecting…</div>
          </div>
        </SectionCard>
      </>
    );
  }

  // --- Main form -----------------------------------------------------------
  return (
    <>
      <WorkflowHeader
        eyebrow="Purchase Orders"
        title="New manual order"
        description="Manual purchase order — created without a planning recommendation. A reason is required for traceability."
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/5 px-2.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-warning-fg">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Manual entry
          </span>
        }
        actions={null}
      />

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        noValidate
        className="space-y-5 pb-12"
      >
        {serverError && (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger-fg flex items-start gap-2"
            data-testid="po-new-server-error"
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 mt-0.5"
              aria-hidden
            />
            <span>{serverError}</span>
          </div>
        )}

        {/* Section 1 — Order details */}
        <SectionCard>
          <div className="px-6 py-4 border-b border-border/60">
            <h2 className="text-xs font-semibold text-fg">Order details</h2>
            <p className="mt-0.5 text-3xs text-fg-faint">
              Who you are ordering from, when you expect it, and why this is a
              manual order.
            </p>
          </div>
          <div className="px-6 py-5 space-y-5">
            {/* Supplier + Date — two-column on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="po-new-supplier-trigger"
                  className="block text-xs font-semibold text-fg"
                >
                  Supplier
                  {REQUIRED_LABEL}
                </label>
                <SearchableSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  placeholder="— Select supplier —"
                  searchPlaceholder="Search by supplier name…"
                  emptyMessage="No suppliers match"
                  loading={suppliersQuery.isLoading}
                  disabled={phase === "submitting"}
                  invalid={!!errors.supplier_id}
                  testId="po-new-supplier"
                  ariaLabel="Supplier"
                />
                {errors.supplier_id && (
                  <div className="text-xs text-danger-fg">
                    {errors.supplier_id}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="po-new-expected-date"
                  className="block text-xs font-semibold text-fg"
                >
                  Expected delivery date
                  {REQUIRED_LABEL}
                </label>
                <input
                  id="po-new-expected-date"
                  data-testid="po-new-expected-date"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className={cn(
                    "input w-full",
                    errors.expected_receive_date && "border-danger/60",
                  )}
                  disabled={phase === "submitting"}
                />
                {errors.expected_receive_date && (
                  <div className="text-xs text-danger-fg">
                    {errors.expected_receive_date}
                  </div>
                )}
              </div>
            </div>

            {/* Reason — full width */}
            <div className="space-y-1">
              <label
                htmlFor="po-new-reason"
                className="block text-xs font-semibold text-fg"
              >
                Reason for manual order
                {REQUIRED_LABEL}
              </label>
              <textarea
                id="po-new-reason"
                data-testid="po-new-reason"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Why is this PO being created without a planning recommendation?"
                rows={3}
                className={cn(
                  "input w-full resize-none",
                  errors.manual_reason && "border-danger/60",
                )}
                disabled={phase === "submitting"}
              />
              <p className="text-3xs text-fg-faint">
                Minimum 5 characters. This is recorded on the PO for audit.
              </p>
              {errors.manual_reason && (
                <div className="text-xs text-danger-fg">
                  {errors.manual_reason}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Section 2 — Order lines */}
        <SectionCard>
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold text-fg">Order lines</h2>
              <p className="mt-0.5 text-3xs text-fg-faint">
                Items or components to purchase. Quantity is in the unit you
                pick on each line.
              </p>
            </div>
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle tabular-nums">
              {lines.length} line{lines.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="px-6 py-4 space-y-3">
            {errors.lines && (
              <div className="text-xs text-danger-fg">{errors.lines}</div>
            )}

            {lines.map((line, idx) => {
              const lineErr = errors.line_items?.[idx];
              const selectedOrderable = orderableByKey.get(line.orderable_key);
              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-md border bg-bg-subtle/30 p-4 space-y-3 transition-colors",
                    lineErr
                      ? "border-danger/40"
                      : "border-border/60 hover:border-border",
                  )}
                  data-testid={`po-new-line-${idx}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle tabular-nums">
                      Line {idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-muted hover:text-danger-fg transition-colors"
                        aria-label={`Remove line ${idx + 1}`}
                        data-testid={`po-new-line-remove-${idx}`}
                        disabled={phase === "submitting"}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Item / component picker */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-fg">
                      Item or component
                      {REQUIRED_LABEL}
                    </label>
                    <SearchableSelect
                      value={line.orderable_key}
                      onChange={(v) => updateLine(idx, { orderable_key: v })}
                      options={orderableOptions}
                      placeholder="— Select item or component —"
                      searchPlaceholder="Search by name or SKU…"
                      emptyMessage="No items or components match"
                      loading={
                        itemsQuery.isLoading || componentsQuery.isLoading
                      }
                      disabled={phase === "submitting"}
                      invalid={!!lineErr?.orderable_key}
                      testId={`po-new-line-item-${idx}`}
                      ariaLabel={`Line ${idx + 1} item or component`}
                    />
                    {lineErr?.orderable_key && (
                      <div className="text-xs text-danger-fg">
                        {lineErr.orderable_key}
                      </div>
                    )}
                  </div>

                  {/* Quantity + UoM */}
                  <div className="grid grid-cols-[1fr,auto] gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor={`po-new-line-qty-${idx}`}
                        className="block text-xs font-semibold text-fg"
                      >
                        Quantity
                        {REQUIRED_LABEL}
                      </label>
                      <input
                        id={`po-new-line-qty-${idx}`}
                        data-testid={`po-new-line-qty-${idx}`}
                        type="number"
                        inputMode="decimal"
                        min="0.0001"
                        step="any"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(idx, { quantity: e.target.value })
                        }
                        className={cn(
                          "input w-full tabular-nums",
                          lineErr?.quantity && "border-danger/60",
                        )}
                        disabled={phase === "submitting"}
                      />
                      {lineErr?.quantity && (
                        <div className="text-xs text-danger-fg">
                          {lineErr.quantity}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`po-new-line-uom-${idx}`}
                        className="block text-xs font-semibold text-fg"
                      >
                        UoM
                        {REQUIRED_LABEL}
                      </label>
                      <select
                        id={`po-new-line-uom-${idx}`}
                        data-testid={`po-new-line-uom-${idx}`}
                        value={line.uom}
                        onChange={(e) =>
                          updateLine(idx, { uom: e.target.value as Uom })
                        }
                        className={cn(
                          "input w-24",
                          lineErr?.uom && "border-danger/60",
                        )}
                        disabled={phase === "submitting"}
                      >
                        {UOMS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      {lineErr?.uom && (
                        <div className="text-xs text-danger-fg">
                          {lineErr.uom}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected item meta strip — quiet helper text */}
                  {selectedOrderable && (
                    <div className="text-3xs text-fg-faint font-mono">
                      <span className="uppercase tracking-sops">
                        {selectedOrderable.kind}
                      </span>
                      {" · "}
                      {selectedOrderable.meta}
                      {" · default "}
                      {selectedOrderable.default_uom}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
              data-testid="po-new-add-line"
              disabled={phase === "submitting"}
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
              Add line
            </button>
          </div>
        </SectionCard>

        {/* Section 3 — Notes (optional) */}
        <SectionCard>
          <div className="px-6 py-5 space-y-1">
            <label
              htmlFor="po-new-notes"
              className="block text-xs font-semibold text-fg"
            >
              Notes
              <span className="ml-1 text-3xs font-normal text-fg-faint">
                (optional)
              </span>
            </label>
            <textarea
              id="po-new-notes"
              data-testid="po-new-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything else the receiving team should know…"
              className="input w-full resize-none"
              disabled={phase === "submitting"}
            />
          </div>
        </SectionCard>

        {/* Footer — submit + cancel */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/purchase-orders")}
            disabled={phase === "submitting"}
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="po-new-submit"
            className="btn btn-accent w-full sm:w-auto"
            disabled={phase === "submitting" || masterDataLoading}
          >
            {phase === "submitting" ? "Creating…" : "Create purchase order"}
          </button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page export — gated by planning:execute
// ---------------------------------------------------------------------------

export default function ManualPoCreationPage(): JSX.Element {
  return (
    <RoleGate minimum="planning:execute">
      <ManualPoFormInner />
    </RoleGate>
  );
}

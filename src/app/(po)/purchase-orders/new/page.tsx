"use client";

// ---------------------------------------------------------------------------
// Purchase Orders · Manual Creation — /purchase-orders/new
//
// 2026-04-26 (CLAUDE.md §"PO workflow" amendment — planner/admin may create a
// PO directly without a planning recommendation, with a mandatory reason).
//
// Gate: planning:execute (planner + admin only). Operators and viewers see
// an access-restricted message via <RoleGate>.
//
// Fields:
//   ספק               — supplier picker (required)
//   תאריך אספקה צפוי  — expected delivery date (required, default today+7)
//   סיבה להזמנה       — free-text reason (required, min 5 chars)
//   שורות להזמנה      — dynamic line editor (min 1 line)
//     └─ פריט / חומר גלם  — item or component picker (required)
//     └─ qty             — numeric, >0 (required)
//     └─ uom             — from UOMS enum (required)
//   הערות             — optional notes textarea
//
// Submit: POST /api/purchase-orders
//   201 → redirect to /purchase-orders/[po_id]
//   409 idempotent replay → success banner + redirect
//   422 → field-level validation errors
//   503/5xx → connection error banner
// ---------------------------------------------------------------------------

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { RoleGate } from "@/lib/auth/role-gate";
import { UOMS, type Uom } from "@/lib/contracts/enums";
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

// A unified "orderable" entry combining items (BOUGHT_FINISHED) and components.
interface OrderableRow {
  kind: "item" | "component";
  id: string;
  label: string;
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
  line_items?: Record<number, { orderable_key?: string; quantity?: string; uom?: string }>;
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

// ---------------------------------------------------------------------------
// Form page component — wrapped by RoleGate below
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

  // Unified orderable list: BOUGHT_FINISHED items + all active components.
  const orderables: OrderableRow[] = useMemo(() => {
    const items = (itemsQuery.data?.rows ?? [])
      .filter((i) => i.supply_method === "BOUGHT_FINISHED")
      .map(
        (i): OrderableRow => ({
          kind: "item",
          id: i.item_id,
          label: `${i.item_name} · ${i.sku ?? i.item_id}`,
          default_uom: toUom(i.sales_uom),
        }),
      );
    const components = (componentsQuery.data?.rows ?? []).map(
      (c): OrderableRow => ({
        kind: "component",
        id: c.component_id,
        label: `${c.component_name} · ${c.component_id}`,
        default_uom: toUom(c.inventory_uom ?? c.purchase_uom ?? c.bom_uom),
      }),
    );
    return [...items, ...components].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [itemsQuery.data, componentsQuery.data]);

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
        "לא ניתן לשמור. בדוק את החיבור ונסה שוב.",
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
          setTimeout(() => router.push(`/purchase-orders/${encodeURIComponent(poId)}`), 1500);
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
      // Idempotency replay (same idempotency_key)
      const data = (await res.json().catch(() => ({}))) as { po_id?: string };
      setPhase("idempotent");
      setSuccessPoId(data.po_id ?? null);
      if (data.po_id) {
        setTimeout(
          () => router.push(`/purchase-orders/${encodeURIComponent(data.po_id!)}`),
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
      // Surface first issue as a general error; full field-level mapping is
      // aspirational for v1 — the server Zod errors rarely map 1:1 to form fields.
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
    setServerError("לא ניתן לשמור. בדוק את החיבור ונסה שוב.");
    setPhase("idle");
  }

  const suppliers = suppliersQuery.data?.rows ?? [];
  const masterDataLoading =
    suppliersQuery.isLoading ||
    componentsQuery.isLoading ||
    itemsQuery.isLoading;

  // --- Success / idempotent states ------------------------------------------
  if (phase === "success" || phase === "idempotent") {
    return (
      <>
        <WorkflowHeader
          eyebrow="הזמנות רכש"
          title="צור הזמנת רכש"
        />
        <SectionCard>
          <div className="px-6 py-8 text-center space-y-2">
            <div className="text-sm font-medium text-success-fg">
              {phase === "idempotent"
                ? "הזמנת הרכש כבר קיימת"
                : "הזמנת הרכש נוצרה בהצלחה"}
            </div>
            {successPoId && (
              <div className="text-xs text-fg-muted font-mono">{successPoId}</div>
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
        eyebrow="הזמנות רכש"
        title="צור הזמנת רכש"
        description="הזמנה ידנית — לא מתוך המלצת רכש. נדרשת סיבה."
        meta={null}
        actions={null}
      />

      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        noValidate
        className="space-y-6"
      >
        {serverError && (
          <div
            className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger-fg"
            data-testid="po-new-server-error"
          >
            {serverError}
          </div>
        )}

        <SectionCard>
          <div className="px-6 py-5 space-y-5">

            {/* ספק */}
            <div className="space-y-1">
              <label
                htmlFor="po-new-supplier"
                className="block text-xs font-semibold text-fg"
              >
                ספק
                <span className="ml-1 text-danger-fg" aria-hidden>*</span>
              </label>
              <select
                id="po-new-supplier"
                data-testid="po-new-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={cn(
                  "input w-full",
                  errors.supplier_id && "border-danger/60",
                )}
                disabled={masterDataLoading || phase === "submitting"}
              >
                <option value="">
                  {masterDataLoading ? "Loading suppliers…" : "— Select supplier —"}
                </option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name_official}
                  </option>
                ))}
              </select>
              {errors.supplier_id && (
                <div className="text-xs text-danger-fg">{errors.supplier_id}</div>
              )}
            </div>

            {/* תאריך אספקה צפוי */}
            <div className="space-y-1">
              <label
                htmlFor="po-new-expected-date"
                className="block text-xs font-semibold text-fg"
              >
                תאריך אספקה צפוי
                <span className="ml-1 text-danger-fg" aria-hidden>*</span>
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

            {/* סיבה להזמנה */}
            <div className="space-y-1">
              <label
                htmlFor="po-new-reason"
                className="block text-xs font-semibold text-fg"
              >
                סיבה להזמנה
                <span className="ml-1 text-danger-fg" aria-hidden>*</span>
              </label>
              <textarea
                id="po-new-reason"
                data-testid="po-new-reason"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="תאר את הסיבה להזמנה הידנית"
                rows={3}
                className={cn(
                  "input w-full resize-none",
                  errors.manual_reason && "border-danger/60",
                )}
                disabled={phase === "submitting"}
              />
              {errors.manual_reason && (
                <div className="text-xs text-danger-fg">{errors.manual_reason}</div>
              )}
            </div>

          </div>
        </SectionCard>

        {/* שורות להזמנה */}
        <SectionCard>
          <div className="px-6 py-4 border-b border-border/60">
            <span className="text-xs font-semibold text-fg">
              שורות להזמנה
            </span>
            {errors.lines && (
              <span className="ml-2 text-xs text-danger-fg">{errors.lines}</span>
            )}
          </div>
          <div className="px-6 py-4 space-y-4">
            {lines.map((line, idx) => {
              const lineErr = errors.line_items?.[idx];
              return (
                <div
                  key={idx}
                  className="rounded-md border border-border/60 bg-bg-subtle/30 p-4 space-y-3"
                  data-testid={`po-new-line-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      שורה {idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-3xs text-danger-fg hover:text-danger-fg/80 transition-colors"
                        aria-label={`Remove line ${idx + 1}`}
                        data-testid={`po-new-line-remove-${idx}`}
                      >
                        הסר
                      </button>
                    )}
                  </div>

                  {/* פריט / חומר גלם */}
                  <div className="space-y-1">
                    <label
                      htmlFor={`po-new-line-item-${idx}`}
                      className="block text-xs font-semibold text-fg"
                    >
                      פריט / חומר גלם
                      <span className="ml-1 text-danger-fg" aria-hidden>*</span>
                    </label>
                    <select
                      id={`po-new-line-item-${idx}`}
                      data-testid={`po-new-line-item-${idx}`}
                      value={line.orderable_key}
                      onChange={(e) =>
                        updateLine(idx, { orderable_key: e.target.value })
                      }
                      className={cn(
                        "input w-full",
                        lineErr?.orderable_key && "border-danger/60",
                      )}
                      disabled={masterDataLoading || phase === "submitting"}
                    >
                      <option value="">
                        {masterDataLoading ? "Loading…" : "— Select item / component —"}
                      </option>
                      {orderables.map((r) => (
                        <option key={`${r.kind}:${r.id}`} value={`${r.kind}:${r.id}`}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    {lineErr?.orderable_key && (
                      <div className="text-xs text-danger-fg">
                        {lineErr.orderable_key}
                      </div>
                    )}
                  </div>

                  {/* Quantity + UOM row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor={`po-new-line-qty-${idx}`}
                        className="block text-xs font-semibold text-fg"
                      >
                        כמות
                        <span className="ml-1 text-danger-fg" aria-hidden>*</span>
                      </label>
                      <input
                        id={`po-new-line-qty-${idx}`}
                        data-testid={`po-new-line-qty-${idx}`}
                        type="number"
                        min="0.0001"
                        step="any"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(idx, { quantity: e.target.value })
                        }
                        className={cn(
                          "input w-full",
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
                        יחידה
                        <span className="ml-1 text-danger-fg" aria-hidden>*</span>
                      </label>
                      <select
                        id={`po-new-line-uom-${idx}`}
                        data-testid={`po-new-line-uom-${idx}`}
                        value={line.uom}
                        onChange={(e) =>
                          updateLine(idx, { uom: e.target.value as Uom })
                        }
                        className={cn(
                          "input w-full",
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
                        <div className="text-xs text-danger-fg">{lineErr.uom}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-semibold transition-colors"
              data-testid="po-new-add-line"
              disabled={phase === "submitting"}
            >
              + הוסף שורה
            </button>
          </div>
        </SectionCard>

        {/* הערות (optional) */}
        <SectionCard>
          <div className="px-6 py-5 space-y-1">
            <label
              htmlFor="po-new-notes"
              className="block text-xs font-semibold text-fg"
            >
              הערות
              <span className="ml-1 text-3xs text-fg-faint">(optional)</span>
            </label>
            <textarea
              id="po-new-notes"
              data-testid="po-new-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input w-full resize-none"
              disabled={phase === "submitting"}
            />
          </div>
        </SectionCard>

        {/* Submit / Cancel */}
        <div className="flex items-center gap-3 pb-8">
          <button
            type="submit"
            data-testid="po-new-submit"
            className="btn btn-accent w-full sm:w-auto"
            disabled={phase === "submitting" || masterDataLoading}
          >
            {phase === "submitting" ? "שומר…" : "צור הזמנת רכש"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/purchase-orders")}
            disabled={phase === "submitting"}
          >
            ביטול
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

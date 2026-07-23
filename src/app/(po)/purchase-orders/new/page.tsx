"use client";

// ---------------------------------------------------------------------------
// Purchase Orders · Manual Creation — /purchase-orders/new
//
// 2026-04-26 (CLAUDE.md §"PO workflow" amendment — planner/admin may create a
// PO directly without a planning recommendation, with a mandatory reason).
// 2026-04-27 — converted to English (matching portal convention per a558e9e),
// added SearchableSelect comboboxes for supplier + line orderable, tightened
// visual hierarchy.
// 2026-05-29 (Tranche 027 — procurement-shared-line-editor) — the field + line
// UI and master-data wiring moved into the reusable <PoLineEditor> + the
// useOrderables hook so the planned procurement focus mode can embed the same
// editor. This page keeps ownership of submit / success / 422-mapping / the
// RoleGate, and uses the editor in "manual" mode. No behaviour change.
//
// Gate: planning:execute (planner + admin only). Operators and viewers see
// an access-restricted message via <RoleGate>.
//
// Submit: POST /api/purchase-orders
//   201 → durable success state with a link to /purchase-orders/[po_id]
//   409 idempotent replay → idempotent state + link
//   422 → per-field errors mapped from Zod issues[] (first invalid field focused)
//   503/5xx → connection error banner
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { RoleGate } from "@/lib/auth/role-gate";
import { cn } from "@/lib/cn";
import { PoLineEditor } from "@/components/purchase-orders/PoLineEditor";
import { useOrderables } from "@/components/purchase-orders/useOrderables";
import { useSupplierItemsByOrderable } from "@/components/purchase-orders/useSupplierItems";
import {
  approvedSupplierItems,
  countPriceVarianceWarnings,
  emptyLine,
  summarizePoDraft,
  todayPlusDays,
  validatePoDraft,
  type LineDraft,
  type ValidationErrors,
} from "@/components/purchase-orders/types";
import { formatIls } from "@/lib/utils/format-money";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `po_manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// COPY-039: matches [po_id]/page.tsx's fmtDate — same corridor, same format.
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function ManualPoFormInner(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Tranche 065 (FLOW-A2) — a freshly created PO must show up in the PO
  // list (["planner","purchase-orders",…]), PO detail surfaces
  // (["purchase-orders",…]), and the goods-receipt open-PO dropdown
  // (["ops","receipts","open-pos"]) without a manual reload. Mirrors the
  // usePlacePo invalidation set in purchase-session/_lib/api.ts.
  const invalidatePoLists = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["planner", "purchase-orders"],
    });
    void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    void queryClient.invalidateQueries({
      queryKey: ["ops", "receipts", "open-pos"],
    });
  }, [queryClient]);

  // --- Master data (shared hook) --------------------------------------------
  const {
    supplierOptions,
    suppliersById,
    orderableOptions,
    orderableByKey,
    suppliersLoading,
    itemsLoading,
    componentsLoading,
    isLoading: masterDataLoading,
    isError: masterDataError,
    retry: retryMasterData,
  } = useOrderables();

  // --- Form state -----------------------------------------------------------
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState(todayPlusDays(7));
  // Tranche 047 (D2) — once the operator edits the date by hand we never
  // override it with a lead-time default again.
  const [dateTouched, setDateTouched] = useState(false);
  const [manualReason, setManualReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  // Tranche 047 (D1) — supplier_items per selected line (cached per
  // orderable; powers the comparison strip, MOQ hints, no-mapping warnings,
  // and the D2 lead-time date default).
  const { byOrderable: supplierItemsByOrderable } = useSupplierItemsByOrderable(
    lines.map((l) => l.orderable_key),
  );

  // Tranche 047 (D2) — default expected date from the chosen supplier's lead
  // time: max supplier_items.lead_time_days across the chosen lines, else the
  // supplier's default_lead_time_days, else 7. Computed inline (cheap) — the
  // supplier-items map is rebuilt per render.
  let defaultLeadDays: number | null = null;
  if (supplierId) {
    let maxLead: number | null = null;
    for (const l of lines) {
      const rows = supplierItemsByOrderable.get(l.orderable_key);
      if (!rows) continue;
      for (const r of approvedSupplierItems(rows)) {
        if (r.supplier_id !== supplierId || r.lead_time_days == null) continue;
        if (maxLead == null || r.lead_time_days > maxLead) {
          maxLead = r.lead_time_days;
        }
      }
    }
    defaultLeadDays =
      maxLead ?? suppliersById.get(supplierId)?.default_lead_time_days ?? 7;
  }

  useEffect(() => {
    if (dateTouched || !supplierId || defaultLeadDays == null) return;
    setExpectedDate(todayPlusDays(defaultLeadDays));
  }, [dateTouched, supplierId, defaultLeadDays]);

  const expectedDateHint =
    !dateTouched && supplierId && defaultLeadDays != null
      ? `based on ${defaultLeadDays}-day lead time`
      : null;
  // Price Truth (Tranche 043) — when at least one line carries an entered
  // price, the operator confirms (default checked) that small deltas may
  // write back to the supplier-item catalog cost. Sent only in that case.
  const [confirmPriceUpdate, setConfirmPriceUpdate] = useState(true);

  // --- Submission state -----------------------------------------------------
  type Phase = "idle" | "submitting" | "success" | "idempotent";
  const [phase, setPhase] = useState<Phase>("idle");
  const [successPoId, setSuccessPoId] = useState<string | null>(null);
  // Tranche 065 (FLOW-N02) — display the human po_number when the POST
  // response carries it; UUID fragment stays as the fallback (the backend
  // is adding the field in parallel, so code defensively).
  const [successPoNumber, setSuccessPoNumber] = useState<string | null>(null);
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

  // Price Truth (Tranche 043) — per-line unit_price_net rides along only
  // when the operator actually typed one; confirm_price_update (and its
  // checkbox) only exist when at least one line carries a price.
  const anyPriceEntered = lines.some(
    (l) => (l.unit_price_net ?? "").trim() !== "",
  );

  // Price/cost accuracy — how many lines carry a price that diverges materially
  // from the catalog cost (warn/high). Drives a caution next to the catalog
  // write-back confirmation so a fat-finger price is reviewed before it updates
  // the supplier catalog.
  const priceVarianceWarnings = countPriceVarianceWarnings(
    lines,
    supplierItemsByOrderable,
    supplierId,
  );

  // --- Submit ---------------------------------------------------------------
  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setServerError(null);

    const clientErrors = validatePoDraft(
      { supplierId, expectedDate, manualReason, notes, lines },
      "manual",
    );
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
      manual_reason: manualReason.trim() || null,
      notes: notes.trim() || null,
      source_type: "manual" as const,
      lines: lines.map((l) => {
        const priceRaw = (l.unit_price_net ?? "").trim();
        const row = orderableByKey.get(l.orderable_key);
        if (!row) throw new Error("Orderable not found");
        // Tranche 047 (D1) — include the comparison-strip pin only when it
        // belongs to the chosen header supplier: the backend resolves the
        // pin against the PO supplier and would 409 on a mismatch.
        const pinRows = supplierItemsByOrderable.get(l.orderable_key) ?? [];
        const pin = l.supplier_item_id
          ? pinRows.find((r) => r.supplier_item_id === l.supplier_item_id)
          : undefined;
        const pinMatchesSupplier = pin && pin.supplier_id === supplierId;
        return {
          ...(row.kind === "component"
            ? { component_id: row.id, item_id: null }
            : { item_id: row.id, component_id: null }),
          qty_ordered: Number(l.quantity),
          uom_id: l.uom,
          ...(priceRaw !== "" ? { unit_price_net: Number(priceRaw) } : {}),
          ...(pinMatchesSupplier
            ? { supplier_item_id: pin.supplier_item_id }
            : {}),
        };
      }),
      ...(anyPriceEntered
        ? { confirm_price_update: confirmPriceUpdate }
        : {}),
    };

    let res: Response;
    try {
      res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setServerError("Could not submit. Check your connection and try again.");
      setPhase("idle");
      return;
    }

    if (res.status === 201 || res.status === 200) {
      const data = (await res.json().catch(() => ({}))) as {
        po_id?: string;
        po_number?: string;
        idempotent_replay?: boolean;
      };
      const poId = data.po_id;
      // Durable terminal state — never auto-redirect away from the
      // confirmation. The operator must see what happened and click
      // through. Closes the "silent success on redirect" risk Agent 2A
      // flagged and matches the spec invariant "No success state may
      // be toast-only".
      setPhase(data.idempotent_replay ? "idempotent" : "success");
      setSuccessPoId(poId ?? null);
      setSuccessPoNumber(
        typeof data.po_number === "string" && data.po_number
          ? data.po_number
          : null,
      );
      invalidatePoLists();
      return;
    }

    if (res.status === 409) {
      const data = (await res.json().catch(() => ({}))) as {
        po_id?: string;
        po_number?: string;
        error?: string;
        detail?: string;
      };
      // Price Truth (Tranche 043) — the DB-layer price validation surfaces
      // as a 409 token (not a Zod 422 with issues[]). The message does not
      // identify the offending line, so highlight the price field on every
      // line that carries an entered price, mirroring the 422 per-field
      // mapping pattern (inline error + banner + focus first field).
      if (
        data.error === "INVALID_PRICE" ||
        data.error === "INVALID_SUPPLIER_ITEM"
      ) {
        const lineFieldErrors: Record<
          number,
          {
            orderable_key?: string;
            quantity?: string;
            uom?: string;
            unit_price_net?: string;
          }
        > = {};
        let firstFocusId: string | null = null;
        lines.forEach((l, idx) => {
          if ((l.unit_price_net ?? "").trim() === "") return;
          lineFieldErrors[idx] = {
            unit_price_net:
              data.error === "INVALID_PRICE"
                ? "The server rejected this price. Enter a number of 0 or more, or leave it blank."
                : "The server could not match a supplier item for this priced line.",
          };
          if (!firstFocusId) firstFocusId = `po-new-line-price-${idx}`;
        });
        setErrors(
          Object.keys(lineFieldErrors).length > 0
            ? { line_items: lineFieldErrors }
            : {},
        );
        setServerError(
          "The entered price was rejected — see the highlighted line price fields below.",
        );
        if (firstFocusId && typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            const el = document.getElementById(firstFocusId!);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              if (
                "focus" in el &&
                typeof (el as HTMLElement).focus === "function"
              ) {
                (el as HTMLElement).focus({ preventScroll: true });
              }
            }
          });
        }
        setPhase("idle");
        return;
      }
      setPhase("idempotent");
      setSuccessPoId(data.po_id ?? null);
      setSuccessPoNumber(
        typeof data.po_number === "string" && data.po_number
          ? data.po_number
          : null,
      );
      invalidatePoLists();
      return;
    }

    if (res.status === 422) {
      // Audit P0-2 closure — map structured Zod issues to per-field errors
      // so the operator sees the offending field highlighted inline rather
      // than a single generic "VALIDATION_ERROR" toast at the top. Backend
      // returns issues[] with `path` arrays per Zod convention; we walk the
      // path and write into the existing `errors` shape.
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        issues?: Array<{ path: Array<string | number>; message: string }>;
      };
      const fieldErrors: ValidationErrors = {};
      const lineFieldErrors: Record<
        number,
        { orderable_key?: string; quantity?: string; uom?: string }
      > = {};
      let mappedCount = 0;
      let firstFocusId: string | null = null;
      for (const issue of data.issues ?? []) {
        const p = issue.path;
        if (!Array.isArray(p) || p.length === 0) continue;
        const head = String(p[0]);
        if (head === "supplier_id") {
          fieldErrors.supplier_id = issue.message;
          mappedCount++;
          if (!firstFocusId) firstFocusId = "po-new-supplier-trigger";
        } else if (head === "expected_receive_date") {
          fieldErrors.expected_receive_date = issue.message;
          mappedCount++;
          if (!firstFocusId) firstFocusId = "po-new-expected-date";
        } else if (head === "manual_reason") {
          fieldErrors.manual_reason = issue.message;
          mappedCount++;
          if (!firstFocusId) firstFocusId = "po-new-reason";
        } else if (head === "lines") {
          if (typeof p[1] === "number") {
            const idx = p[1];
            const sub = p.length > 2 ? String(p[2]) : null;
            const slot = (lineFieldErrors[idx] ??= {});
            if (sub === "qty_ordered") {
              slot.quantity = issue.message;
              if (!firstFocusId) firstFocusId = `po-new-line-qty-${idx}`;
            } else if (sub === "uom_id") {
              slot.uom = issue.message;
              if (!firstFocusId) firstFocusId = `po-new-line-uom-${idx}`;
            } else {
              // catch-all for component_id/item_id constraints
              slot.orderable_key = issue.message;
              if (!firstFocusId) firstFocusId = `po-new-line-item-${idx}`;
            }
            mappedCount++;
          } else {
            fieldErrors.lines = issue.message;
            mappedCount++;
          }
        }
      }
      if (Object.keys(lineFieldErrors).length > 0) {
        fieldErrors.line_items = lineFieldErrors;
      }
      if (mappedCount > 0) {
        setErrors(fieldErrors);
        setServerError(
          `Please fix ${mappedCount} field${mappedCount === 1 ? "" : "s"} below — see the highlighted error message${mappedCount === 1 ? "" : "s"}.`,
        );
        // Scroll the first invalid field into view + focus.
        if (firstFocusId && typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            const el = document.getElementById(firstFocusId!);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              if (
                "focus" in el &&
                typeof (el as HTMLElement).focus === "function"
              ) {
                (el as HTMLElement).focus({ preventScroll: true });
              }
            }
          });
        }
      } else {
        // Fall back to a friendlier banner if the backend gave us only a
        // generic `error` token like "VALIDATION_ERROR" with no issues[].
        const genericToken = data.error ?? "";
        const isOpaqueToken =
          /^[A-Z_]+$/.test(genericToken) && genericToken.length > 0;
        setServerError(
          isOpaqueToken
            ? "Validation failed on the server. Please re-check supplier, line items, and quantities, then try again."
            : // COPY-031: a raw Zod issue message ("Expected number, received
              // string") used to fall through here — developer-facing text,
              // not an operator-facing one.
              genericToken || "Validation error. Check the form and try again.",
        );
      }
      setPhase("idle");
      return;
    }

    // 503 / 5xx
    setServerError("Could not submit. Check your connection and try again.");
    setPhase("idle");
  }

  // --- Success / idempotent states ------------------------------------------
  // Durable terminal state — no auto-redirect. Operator confirms what
  // happened and chooses the next action explicitly.
  if (phase === "success" || phase === "idempotent") {
    return (
      <>
        <WorkflowHeader size="section" eyebrow="Purchase Orders" title="New manual order" />
        <SectionCard>
          <div
            className="px-6 py-10 text-center space-y-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex justify-center">
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  phase === "idempotent" ? "bg-warning/20" : "bg-success/20",
                )}
              >
                {phase === "idempotent" ? (
                  <svg
                    className="h-7 w-7 text-warning-fg"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg
                    className="h-7 w-7 text-success-fg"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="text-base font-semibold">
              {phase === "idempotent"
                ? "Already posted earlier — no duplicate created."
                : "Purchase order created."}
            </div>
            <div className="text-xs text-fg-muted">
              {phase === "idempotent"
                ? "We re-fetched the original PO; submitting again did not create another one."
                : "Status: Open. Add receipts when goods arrive."}
            </div>
            {(successPoNumber || successPoId) && (
              <div className="text-3xs text-fg-faint font-mono">
                {successPoNumber
                  ? `PO ${successPoNumber}`
                  : // COPY-038: "ref" is developer shorthand for an operator surface.
                    `Order ID: ${successPoId!.slice(0, 8)}…`}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {successPoId && (
                <Link
                  href={`/purchase-orders/${encodeURIComponent(successPoId)}`}
                  className="btn btn-sm btn-accent"
                  data-testid="po-new-view-po"
                >
                  View purchase order →
                </Link>
              )}
              <Link
                href="/purchase-orders"
                className="btn btn-sm"
                data-testid="po-new-go-to-list"
              >
                Back to purchase orders
              </Link>
              <Link
                href="/purchase-orders/new"
                className="btn btn-sm btn-ghost"
                data-testid="po-new-create-another"
              >
                Create another
              </Link>
            </div>
          </div>
        </SectionCard>
      </>
    );
  }

  // --- Main form -----------------------------------------------------------
  return (
    <>
      <WorkflowHeader
        size="section"
        eyebrow="Purchase Orders"
        title="New manual order"
        description="Manual purchase orders are not reviewed by the planning engine. Use this only for urgent or exceptional needs not covered by a planning recommendation. Providing a reason is optional but recommended for audit traceability."
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
        {masterDataError && (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger-fg flex items-start gap-2"
            data-testid="po-new-masterdata-error"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1">
              <div className="font-semibold">Could not load master data</div>
              <div className="mt-0.5 text-xs text-fg-muted">
                Suppliers, components, or items failed to load. The form cannot
                be submitted until they are available.
              </div>
              <button
                type="button"
                onClick={retryMasterData}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {serverError && (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger-fg flex items-start gap-2"
            data-testid="po-new-server-error"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span>{serverError}</span>
          </div>
        )}

        <PoLineEditor
          mode="manual"
          supplierId={supplierId}
          expectedDate={expectedDate}
          manualReason={manualReason}
          notes={notes}
          lines={lines}
          onSupplierChange={setSupplierId}
          onExpectedDateChange={(v) => {
            setDateTouched(true);
            setExpectedDate(v);
          }}
          onManualReasonChange={setManualReason}
          onNotesChange={setNotes}
          onAddLine={addLine}
          onRemoveLine={removeLine}
          onUpdateLine={updateLine}
          errors={errors}
          disabled={phase === "submitting"}
          supplierOptions={supplierOptions}
          orderableOptions={orderableOptions}
          orderableByKey={orderableByKey}
          suppliersLoading={suppliersLoading}
          itemsLoading={itemsLoading}
          componentsLoading={componentsLoading}
          supplierItemsByOrderable={supplierItemsByOrderable}
          expectedDateHint={expectedDateHint}
        />

        {/* Tranche 065 (FLOW-N01) — reactive read-only summary of what
            submit will create, so the operator confirms the shape of the
            order before committing. Money shows only when at least one
            line carries an entered price. */}
        {(() => {
          const summary = summarizePoDraft(lines);
          if (!supplierId && summary.lineCount === 0) return null;
          // COPY-027: never fall back to the raw supplier UUID.
          const supplierName = supplierId
            ? suppliersById.get(supplierId)?.supplier_name_official ?? "Supplier"
            : null;
          return (
            <div
              className="rounded-md border border-border/60 bg-bg-subtle/40 px-4 py-3 text-sm text-fg"
              role="status"
              aria-live="polite"
              data-testid="po-new-draft-summary"
            >
              <span className="font-semibold">Creating a purchase order</span>{" "}
              with {summary.lineCount} line
              {summary.lineCount !== 1 ? "s" : ""}
              {supplierName ? (
                <>
                  {" "}
                  for <bdi className="font-semibold">{supplierName}</bdi>
                </>
              ) : null}
              {expectedDate ? <>, expected {fmtDate(expectedDate)}</> : null}
              {summary.totalValue !== null ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-mono tabular-nums font-semibold">
                    {formatIls(summary.totalValue)}
                  </span>{" "}
                  across {summary.pricedLineCount} priced line
                  {summary.pricedLineCount !== 1 ? "s" : ""}
                </>
              ) : null}
              .
            </div>
          );
        })()}

        {/* Price write-back confirmation — only when a price was entered */}
        {anyPriceEntered && (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <input
                id="po-new-confirm-price-update"
                data-testid="po-new-confirm-price-update"
                type="checkbox"
                checked={confirmPriceUpdate}
                onChange={(e) => setConfirmPriceUpdate(e.target.checked)}
                disabled={phase === "submitting"}
                className="mt-0.5"
              />
              <label
                htmlFor="po-new-confirm-price-update"
                className="text-sm text-fg"
              >
                Update catalog prices from this order
                <span className="block text-3xs font-normal text-fg-faint">
                  Small changes apply right away; bigger changes wait for admin
                  approval under Price updates.
                </span>
              </label>
            </div>
            {confirmPriceUpdate && priceVarianceWarnings > 0 && (
              <div
                role="alert"
                data-testid="po-new-price-variance-caution"
                className="flex items-start gap-1.5 rounded-md border border-warning/50 bg-warning/5 px-3 py-2 text-xs text-warning-fg"
              >
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                <span>
                  {priceVarianceWarnings} line
                  {priceVarianceWarnings === 1 ? "" : "s"}{" "}
                  {priceVarianceWarnings === 1
                    ? "has a price that differs"
                    : "have prices that differ"}{" "}
                  a lot from the catalog. Review{" "}
                  {priceVarianceWarnings === 1 ? "it" : "them"} before letting
                  this order update catalog prices.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer — submit + cancel */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
          <button
            type="button"
            className="btn btn-ghost w-full sm:w-auto"
            onClick={() => router.push("/purchase-orders")}
            disabled={phase === "submitting"}
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="po-new-submit"
            className="btn btn-lg btn-accent w-full sm:w-auto"
            disabled={
              phase === "submitting" || masterDataLoading || masterDataError
            }
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

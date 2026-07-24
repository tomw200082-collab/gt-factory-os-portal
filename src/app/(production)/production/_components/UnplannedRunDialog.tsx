"use client";

// ---------------------------------------------------------------------------
// UnplannedRunDialog — "start an extra run". Pick the product, type how many,
// start. The backend tags the run unplanned + flags it immediately (Tom is
// told); it never blocks. Simple English, touch-first (≥44px), full keyboard +
// focus handling. On success it jumps straight into the run's picking screen.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/cn";
import { t } from "../_lib/copy";
import { useDialogA11y } from "../_lib/use-dialog-a11y";
import type {
  CreateUnplannedRunResponse,
  PickerItemRow,
} from "../_lib/types";

type ItemsEnvelope = { rows: PickerItemRow[]; count: number };

async function fetchProducibleItems(): Promise<ItemsEnvelope> {
  const res = await fetch("/api/items?status=ACTIVE&limit=1000", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(t("error_load_products"));
  }
  const body = (await res.json()) as ItemsEnvelope;
  const rows = (body.rows ?? []).filter(
    (r) => r.supply_method === "MANUFACTURED" || r.supply_method === "REPACK",
  );
  return { rows, count: rows.length };
}

export function UnplannedRunDialog({
  open,
  onClose,
  todayDate,
}: {
  open: boolean;
  onClose: () => void;
  todayDate: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickerItemRow | null>(null);
  const [qty, setQty] = useState("");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const itemsQuery = useQuery<ItemsEnvelope>({
    queryKey: ["production-runs", "unplanned-items"],
    queryFn: fetchProducibleItems,
    enabled: open,
    staleTime: 60_000,
  });

  // Reset field state on open (focus + Escape + trap come from useDialogA11y).
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(null);
      setQty("");
      setValidationMsg(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const rows = itemsQuery.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows.slice(0, 40);
    return rows
      .filter(
        (r) =>
          r.item_name.toLowerCase().includes(q) ||
          (r.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [itemsQuery.data, search]);

  const mutation = useMutation<CreateUnplannedRunResponse, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/production-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: selected!.item_id,
          target_qty: Number(qty),
          uom: selected!.sales_uom ?? "UNIT",
        }),
      });
      if (res.status === 503) {
        throw new Error(t("error_break_glass"));
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(body?.detail ?? body?.error ?? t("error_generic"));
      }
      return (await res.json()) as CreateUnplannedRunResponse;
    },
    onSuccess: (run) => {
      void qc.invalidateQueries({ queryKey: ["production-runs", "today", todayDate] });
      onClose();
      router.push(`/production/runs/${encodeURIComponent(run.run_id)}`);
    },
  });

  const a11y = useDialogA11y({
    active: open,
    onClose,
    closeDisabled: mutation.isPending,
  });

  if (!open) return null;

  function stepQty(delta: number) {
    const current = Number(qty);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, base + delta);
    setQty(String(next));
  }

  function handleStart() {
    if (!selected) {
      setValidationMsg(t("unplanned_need_item"));
      return;
    }
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setValidationMsg(t("unplanned_need_qty"));
      return;
    }
    setValidationMsg(null);
    mutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !mutation.isPending && onClose()}
      data-testid="unplanned-run-dialog-backdrop"
    >
      <div
        ref={a11y.dialogRef}
        onKeyDown={a11y.onKeyDown}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unplanned-run-title"
        className="reveal flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-bg shadow-pop outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="unplanned-run-dialog"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <h2 id="unplanned-run-title" className="text-lg font-bold text-fg-strong">
              {t("unplanned_title")}
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">{t("unplanned_body")}</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm -mr-2 -mt-1 h-11 w-11 shrink-0 p-0"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label={t("close_dialog")}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Item picker */}
          <div>
            <label
              htmlFor="unplanned-item-search"
              className="mb-1.5 block text-sm font-semibold text-fg"
            >
              {t("unplanned_pick_item")}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                strokeWidth={2}
                aria-hidden
              />
              <input
                id="unplanned-item-search"
                ref={(el) => {
                  a11y.initialFocusRef.current = el;
                }}
                type="text"
                className="input h-12 pl-9"
                placeholder={t("unplanned_pick_item_ph")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="unplanned-item-search"
                autoComplete="off"
                aria-describedby={
                  validationMsg && !selected ? "unplanned-validation" : undefined
                }
              />
            </div>

            {/* Persistent live region — announces the filtered result count to
                screen-reader users as they type (A11Y). Always mounted. */}
            <span
              className="sr-only"
              aria-live="polite"
              aria-atomic="true"
              data-testid="unplanned-search-count"
            >
              {itemsQuery.isLoading || itemsQuery.isError
                ? ""
                : filtered.length === 0
                  ? t("unplanned_no_results")
                  : `${filtered.length} ${t("unplanned_results")}`}
            </span>

            <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border/70">
              {itemsQuery.isLoading ? (
                <div className="p-3 text-sm text-fg-muted" aria-live="polite">
                  {t("loading")}
                </div>
              ) : itemsQuery.isError ? (
                <div className="p-3 text-sm text-danger-fg" role="alert">
                  {(itemsQuery.error as Error).message}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-sm text-fg-muted">—</div>
              ) : (
                <ul data-testid="unplanned-item-list">
                  {filtered.map((item) => {
                    const isSel = selected?.item_id === item.item_id;
                    return (
                      <li key={item.item_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(item);
                            setValidationMsg(null);
                            if (!qty) setQty("1");
                          }}
                          aria-pressed={isSel}
                          data-testid={`unplanned-item-${item.item_id}`}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 border-b border-border/40 px-3 py-3 text-left transition-colors last:border-b-0",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
                            isSel
                              ? "bg-accent-soft text-accent"
                              : "hover:bg-bg-subtle/60",
                          )}
                        >
                          <span className="min-w-0 truncate text-sm font-medium">
                            {item.item_name}
                          </span>
                          {item.sku ? (
                            <span className="shrink-0 font-mono text-2xs text-fg-muted">
                              {item.sku}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Quantity — big stepper */}
          <div>
            <label
              htmlFor="unplanned-qty"
              className="mb-1.5 block text-sm font-semibold text-fg"
            >
              {t("unplanned_qty")}
              {selected?.sales_uom ? (
                <span className="ml-1.5 text-xs font-normal text-fg-muted">
                  ({selected.sales_uom})
                </span>
              ) : null}
            </label>
            <div className="flex items-stretch">
              <button
                type="button"
                className="btn h-14 rounded-r-none border-r-0 px-4"
                onClick={() => stepQty(-1)}
                disabled={mutation.isPending}
                aria-label="Decrease quantity"
              >
                <Minus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
              <input
                id="unplanned-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input h-14 min-w-0 flex-1 rounded-none text-center font-mono text-4xl font-bold tabular-nums"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setValidationMsg(null);
                }}
                data-testid="unplanned-qty"
                aria-describedby={
                  [
                    validationMsg && selected ? "unplanned-validation" : null,
                    mutation.isError ? "unplanned-run-error" : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              />
              <button
                type="button"
                className="btn h-14 rounded-l-none border-l-0 px-4"
                onClick={() => stepQty(1)}
                disabled={mutation.isPending}
                aria-label="Increase quantity"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>

          {validationMsg ? (
            <p
              id="unplanned-validation"
              className="text-sm font-medium text-danger-fg"
              role="alert"
            >
              {validationMsg}
            </p>
          ) : null}
          {mutation.isError ? (
            <p
              id="unplanned-run-error"
              className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
              role="alert"
              data-testid="unplanned-run-error"
            >
              {mutation.error.message}
            </p>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 border-t border-border/70 px-5 py-4">
          <button
            type="button"
            className="btn btn-primary btn-lg flex-1 gap-2"
            onClick={handleStart}
            disabled={mutation.isPending}
            data-testid="unplanned-run-start"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("unplanned_starting")}
              </>
            ) : (
              t("unplanned_start")
            )}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            {t("unplanned_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

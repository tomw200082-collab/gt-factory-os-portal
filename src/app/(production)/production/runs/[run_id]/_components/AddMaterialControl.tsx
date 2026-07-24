"use client";

// ---------------------------------------------------------------------------
// AddMaterialControl — corrections on an ACTIVE run. Add more of a material or
// return some, as append-only deltas (never a rewrite of the original pick).
// Each save posts one material-delta ledger movement. Simple English, big
// touch targets. Shown only once the run is active (PICKING / IN_PRODUCTION).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Loader2, Minus, MinusCircle, Plus, PlusCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";
import { t } from "../../../_lib/copy";
import type { MaterialDeltaBody, PickListLine } from "../../../_lib/types";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `md_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type Mode = "add" | "return" | null;

export function AddMaterialControl({
  runId,
  lines,
  onChanged,
}: {
  runId: string;
  lines: PickListLine[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [componentKey, setComponentKey] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const selectedLine = useMemo(
    () => lines.find((l) => `${l.source}:${l.component_id}` === componentKey) ?? null,
    [lines, componentKey],
  );

  const mutation = useMutation<void, Error>({
    mutationFn: async () => {
      if (!selectedLine) throw new Error(t("active_pick_item"));
      const n = Number(qty);
      if (!Number.isFinite(n) || n <= 0) throw new Error(t("unplanned_need_qty"));
      const body: MaterialDeltaBody = {
        idempotency_key: newKey(),
        event_at: new Date().toISOString(),
        component_id: selectedLine.component_id,
        source: selectedLine.source,
        direction: mode === "return" ? "return" : "consume",
        qty: n,
        notes: notes.trim() || null,
      };
      const res = await fetch(
        `/api/production-runs/${encodeURIComponent(runId)}/material-delta`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.status === 503) throw new Error(t("error_break_glass"));
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(b?.detail ?? b?.error ?? t("error_generic"));
      }
    },
    onSuccess: () => {
      setOkMsg(mode === "return" ? t("active_return_done") : t("active_add_done"));
      setMode(null);
      setComponentKey("");
      setQty("1");
      setNotes("");
      onChanged();
      void qc.invalidateQueries({ queryKey: ["production-runs", "pick-list", runId] });
    },
  });

  function step(delta: number) {
    const current = Number(qty);
    const base = Number.isFinite(current) ? current : 0;
    setQty(String(Math.max(0, base + delta)));
  }

  function openMode(next: Mode) {
    setMode(next);
    setOkMsg(null);
    mutation.reset();
  }

  return (
    <SectionCard title={t("active_heading")} density="compact">
      {mode === null ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn btn-lg flex-1 gap-1.5"
            onClick={() => openMode("add")}
            data-testid="active-add-open"
          >
            <PlusCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
            {t("active_add")}
          </button>
          <button
            type="button"
            className="btn btn-lg flex-1 gap-1.5"
            onClick={() => openMode("return")}
            data-testid="active-return-open"
          >
            <MinusCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
            {t("active_return")}
          </button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="active-delta-form">
          {/* Material */}
          <div>
            <label
              htmlFor="active-material"
              className="mb-1.5 block text-sm font-semibold text-fg"
            >
              {t("active_pick_item")}
            </label>
            <select
              id="active-material"
              className="input h-12"
              value={componentKey}
              onChange={(e) => setComponentKey(e.target.value)}
              data-testid="active-material"
            >
              <option value="">—</option>
              {lines.map((l) => (
                <option key={`${l.source}:${l.component_id}`} value={`${l.source}:${l.component_id}`}>
                  {l.component_name}
                </option>
              ))}
            </select>
          </div>

          {/* Qty */}
          <div>
            <label
              htmlFor="active-qty"
              className="mb-1.5 block text-sm font-semibold text-fg"
            >
              {mode === "return" ? t("active_return_qty") : t("active_add_qty")}
              {selectedLine ? (
                <span className="ml-1.5 text-xs font-normal text-fg-muted">
                  ({selectedLine.uom})
                </span>
              ) : null}
            </label>
            <div className="flex items-stretch">
              <button
                type="button"
                className="btn h-14 rounded-r-none border-r-0 px-4"
                onClick={() => step(-1)}
                aria-label="Less"
              >
                <Minus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
              <input
                id="active-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input h-14 min-w-0 flex-1 rounded-none text-center font-mono text-3xl font-bold tabular-nums"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                data-testid="active-qty"
              />
              <button
                type="button"
                className="btn h-14 rounded-l-none border-l-0 px-4"
                onClick={() => step(1)}
                aria-label="More"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="active-notes"
              className="mb-1.5 block text-sm font-semibold text-fg"
            >
              {t("active_notes")}
            </label>
            <input
              id="active-notes"
              type="text"
              className="input h-11"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="active-notes"
            />
          </div>

          {mutation.isError ? (
            <p
              className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
              role="alert"
              data-testid="active-delta-error"
            >
              {mutation.error.message}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              className={cn("btn btn-primary btn-lg flex-1 gap-2")}
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              data-testid="active-delta-save"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("active_saving")}
                </>
              ) : mode === "return" ? (
                t("active_return_save")
              ) : (
                t("active_add_save")
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-lg"
              onClick={() => openMode(null)}
              disabled={mutation.isPending}
            >
              {t("pick_cancel")}
            </button>
          </div>
        </div>
      )}

      {okMsg ? (
        <p
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-success-fg"
          role="status"
          data-testid="active-delta-ok"
        >
          {okMsg}
        </p>
      ) : null}
    </SectionCard>
  );
}

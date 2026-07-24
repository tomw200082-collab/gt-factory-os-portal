"use client";

// ---------------------------------------------------------------------------
// EditQtySheet — bottom sheet to set the ACTUAL amount taken for one material.
// Big touch stepper, "I did not take this" escape hatch, Save. Physical truth:
// whatever the operator types is accepted; the row flags shortage/excess but
// nothing here blocks. Full focus + Escape handling.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../../../_lib/copy";
import { useDialogA11y } from "../../../_lib/use-dialog-a11y";
import { type PickResolution } from "../_lib/pick";
import type { PickListLine } from "../../../_lib/types";

export function EditQtySheet({
  line,
  resolution,
  onSave,
  onNotTaken,
  onClose,
}: {
  line: PickListLine | null;
  resolution?: PickResolution;
  onSave: (qty: number) => void;
  onNotTaken: () => void;
  onClose: () => void;
}) {
  const initial = useMemo(() => {
    if (!line) return "";
    if (resolution && resolution.state !== "NOT_COLLECTED") {
      return String(resolution.picked_qty);
    }
    return fmtNumStr(line.required_qty);
  }, [line, resolution]);

  const [value, setValue] = useState(initial);
  const a11y = useDialogA11y({ active: line != null, onClose });

  useEffect(() => {
    if (line) setValue(initial);
  }, [line, initial]);

  const parsed = Number(value);
  const positive = Number.isFinite(parsed) && parsed > 0;

  if (!line) return null;

  // Same big-name resolution as PickRow: the Latin floor name leads for the
  // weak-Hebrew-reader operator; fall back to component_name when unset.
  const displayName = line.floor_name ?? line.component_name;

  function step(delta: number) {
    const current = Number(value);
    const base = Number.isFinite(current) ? current : 0;
    setValue(String(Math.max(0, base + delta)));
  }

  function handleSave() {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) onSave(n);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      data-testid="edit-qty-backdrop"
    >
      <div
        ref={a11y.dialogRef}
        onKeyDown={a11y.onKeyDown}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-qty-title"
        className="reveal w-full max-w-md rounded-t-2xl border border-border bg-bg p-5 shadow-pop outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="edit-qty-sheet"
      >
        <h2 id="edit-qty-title" className="text-lg font-bold text-fg-strong">
          {t("pick_edit_title")}
        </h2>
        <p className="mt-0.5 truncate text-sm text-fg-muted">
          {displayName}
          <span className="ml-2 text-fg-muted">
            {t("pick_need")}{" "}
            <span className="font-mono tabular-nums">
              {fmtNumStr(line.required_qty)} {line.uom}
            </span>
            {" · "}
            {t("pick_on_hand")}{" "}
            <span className="font-mono tabular-nums">
              {fmtNumStr(line.on_hand)} {line.uom}
            </span>
          </span>
        </p>

        {/* Big stepper */}
        <div className="mt-4 flex items-stretch">
          <button
            type="button"
            className="btn h-16 rounded-r-none border-r-0 px-5"
            onClick={() => step(-1)}
            aria-label="Decrease quantity"
          >
            <Minus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </button>
          <input
            ref={(el) => {
              a11y.initialFocusRef.current = el;
            }}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className="input h-16 min-w-0 flex-1 rounded-none text-center font-mono text-5xl font-bold tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="edit-qty-input"
            aria-label={`${displayName} — ${t("pick_edit_title")}`}
            aria-describedby={!positive ? "edit-qty-hint" : undefined}
          />
          <button
            type="button"
            className="btn h-16 rounded-l-none border-l-0 px-5"
            onClick={() => step(1)}
            aria-label="Increase quantity"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        <div className="mt-1 text-center text-sm font-medium text-fg-subtle">
          {line.uom}
        </div>

        {/* 0 / empty is a valid "did not take it" — but say so, and route it
            through the explicit button below rather than a silent Save. */}
        {!positive ? (
          <p
            id="edit-qty-hint"
            className="mt-2 text-center text-xs font-medium text-fg-muted"
            data-testid="edit-qty-hint"
          >
            {t("pick_not_taken_hint")}
          </p>
        ) : null}

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-primary btn-lg w-full"
            onClick={handleSave}
            disabled={!positive}
            title={!positive ? t("pick_not_taken_hint") : undefined}
            data-testid="edit-qty-save"
          >
            {t("pick_save")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className={cn("btn btn-lg flex-1 gap-1.5 text-danger-fg")}
              onClick={onNotTaken}
              data-testid="edit-qty-not-taken"
            >
              {t("pick_mark_not_collected")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-lg"
              onClick={onClose}
            >
              {t("pick_cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

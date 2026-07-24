"use client";

// ---------------------------------------------------------------------------
// EditQtySheet — bottom sheet to set the ACTUAL amount taken for one material.
// Big touch stepper, "I did not take this" escape hatch, Save. Physical truth:
// whatever the operator types is accepted; the row flags shortage/excess but
// nothing here blocks. Full focus + Escape handling.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../../../_lib/copy";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = useMemo(() => {
    if (!line) return "";
    if (resolution && resolution.state !== "NOT_COLLECTED") {
      return String(resolution.picked_qty);
    }
    return fmtNumStr(line.required_qty);
  }, [line, resolution]);

  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (line) {
      setValue(initial);
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => window.clearTimeout(id);
    }
  }, [line, initial]);

  useEffect(() => {
    if (!line) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [line, onClose]);

  if (!line) return null;

  function step(delta: number) {
    const current = Number(value);
    const base = Number.isFinite(current) ? current : 0;
    setValue(String(Math.max(0, base + delta)));
  }

  function handleSave() {
    const n = Number(value);
    onSave(Number.isFinite(n) && n > 0 ? n : 0);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      data-testid="edit-qty-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-qty-title"
        className="reveal w-full max-w-md rounded-t-2xl border border-border bg-bg p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="edit-qty-sheet"
      >
        <h2 id="edit-qty-title" className="text-lg font-bold text-fg-strong">
          {t("pick_edit_title")}
        </h2>
        <p className="mt-0.5 truncate text-sm text-fg-muted">
          {line.component_name}
          <span className="ml-2 text-fg-subtle">
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
            aria-label="Less"
          >
            <Minus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </button>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className="input h-16 min-w-0 flex-1 rounded-none text-center font-mono text-5xl font-bold tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="edit-qty-input"
          />
          <button
            type="button"
            className="btn h-16 rounded-l-none border-l-0 px-5"
            onClick={() => step(1)}
            aria-label="More"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        <div className="mt-1 text-center text-sm font-medium text-fg-subtle">
          {line.uom}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-primary btn-lg w-full"
            onClick={handleSave}
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

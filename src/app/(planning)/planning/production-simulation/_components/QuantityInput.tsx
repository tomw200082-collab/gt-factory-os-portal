"use client";

import { Play } from "lucide-react";

interface QuantityInputProps {
  value: number;
  onChange: (next: number) => void;
  onSubmit: () => void;
  disabled?: boolean;
  canSubmit?: boolean;
}

/**
 * Target-output field plus the Simulate action. The number is shown large and
 * bold because it is the second decision the operator makes — it should read
 * as clearly as the answer it produces.
 */
export function QuantityInput({
  value,
  onChange,
  onSubmit,
  disabled,
  canSubmit = true,
}: QuantityInputProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-sops text-fg-subtle">
          Target output
        </span>
        <div className="flex items-baseline gap-2 rounded-md border border-border/70 bg-bg-raised px-4 transition-colors focus-within:border-accent">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="h-12 w-32 bg-transparent text-2xl font-bold tabular-nums text-fg-strong outline-none disabled:cursor-not-allowed disabled:opacity-50"
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              onChange(Number.isFinite(next) ? next : 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!disabled && canSubmit) onSubmit();
              }
            }}
            disabled={disabled}
            data-testid="production-simulation-qty-input"
          />
          <span className="shrink-0 pb-0.5 text-sm font-semibold text-fg-muted">
            units
          </span>
        </div>
      </label>
      <button
        type="button"
        className="btn btn-primary h-12 gap-2 px-6 text-base font-bold"
        onClick={onSubmit}
        disabled={disabled || !canSubmit}
        data-testid="production-simulation-simulate-button"
      >
        <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        Simulate
      </button>
    </div>
  );
}

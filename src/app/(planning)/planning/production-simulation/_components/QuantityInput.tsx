"use client";

import { Play } from "lucide-react";

interface QuantityInputProps {
  value: number;
  onChange: (next: number) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function QuantityInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: QuantityInputProps) {
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Target output (units)
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step={1}
          className="w-32 rounded-sm border border-border/70 bg-bg-raised px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!disabled) onSubmit();
            }
          }}
          disabled={disabled}
          data-testid="production-simulation-qty-input"
        />
      </label>
      <button
        type="button"
        className="btn btn-primary btn-sm gap-1.5"
        onClick={onSubmit}
        disabled={disabled || !Number.isFinite(value) || value <= 0}
        data-testid="production-simulation-simulate-button"
      >
        <Play className="h-3 w-3" strokeWidth={2.5} />
        Simulate
      </button>
    </div>
  );
}

"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import type { Uom } from "@/lib/contracts/enums";

interface QuantityInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "min" | "step"> {
  unit?: Uom;
  allowDecimal?: boolean;
  errored?: boolean;
}

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  function QuantityInput(
    { unit, allowDecimal = true, errored, className, ...rest },
    ref
  ) {
    return (
      <div className="group relative flex items-stretch">
        <input
          ref={ref}
          type="number"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          step={allowDecimal ? "0.001" : "1"}
          min="0"
          className={cn(
            "input pr-12 text-right font-mono tabular-nums text-fg-strong",
            errored && "input-error",
            className
          )}
          {...rest}
        />
        {unit ? (
          <span
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center border-l border-border/60 bg-bg-subtle/50 px-2.5 font-mono text-2xs font-semibold uppercase tracking-sops text-fg-subtle"
            aria-hidden
          >
            {unit}
          </span>
        ) : null}
      </div>
    );
  }
);

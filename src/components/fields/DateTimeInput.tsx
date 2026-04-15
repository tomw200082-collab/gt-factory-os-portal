"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface DateTimeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  errored?: boolean;
}

export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  function DateTimeInput({ errored, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="datetime-local"
        className={cn(
          "input font-mono tabular-nums text-fg-strong",
          errored && "input-error",
          className
        )}
        {...rest}
      />
    );
  }
);

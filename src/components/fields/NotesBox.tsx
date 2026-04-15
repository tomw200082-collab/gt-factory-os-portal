"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface NotesBoxProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  errored?: boolean;
}

export const NotesBox = forwardRef<HTMLTextAreaElement, NotesBoxProps>(
  function NotesBox({ errored, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn("textarea", errored && "input-error", className)}
        {...rest}
      />
    );
  }
);

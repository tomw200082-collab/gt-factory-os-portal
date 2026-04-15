import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldGridProps {
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

const COL: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function FieldGrid({
  columns = 2,
  children,
  className,
}: FieldGridProps) {
  return (
    <div className={cn("grid gap-x-5 gap-y-5", COL[columns], className)}>
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  span?: 1 | 2 | 3 | 4;
  children: ReactNode;
}

const SPAN: Record<number, string> = {
  1: "",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  optional,
  span = 1,
  children,
}: FieldProps) {
  return (
    <div className={cn(SPAN[span])}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-sops text-fg-muted"
      >
        <span className="flex items-center gap-1">
          {label}
          {required ? (
            <span className="text-danger" aria-label="required">
              *
            </span>
          ) : null}
        </span>
        {optional && !required ? (
          <span className="text-3xs font-medium normal-case tracking-normal text-fg-faint">
            optional
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <div className="field-error" role="alert">
          <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={2.25} />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}

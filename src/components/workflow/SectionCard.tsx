import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
  tone?: "default" | "warning" | "danger" | "info" | "success";
  density?: "comfortable" | "compact";
}

const TONE_CLASSES: Record<NonNullable<SectionCardProps["tone"]>, string> = {
  default: "",
  warning: "border-warning/50",
  danger: "border-danger/50",
  info: "border-info/50",
  success: "border-success/50",
};

export function SectionCard({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  contentClassName,
  footer,
  tone = "default",
  density = "comfortable",
}: SectionCardProps) {
  return (
    <section
      className={cn("card", TONE_CLASSES[tone], className)}
    >
      {(title || actions || eyebrow) && (
        <div className="flex items-start justify-between gap-4 rounded-t-md border-b border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-accent">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="text-lg font-bold tracking-tight text-fg-strong">
                {title}
              </h2>
            ) : null}
            {description ? (
              <div className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      <div
        className={cn(
          density === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-6",
          contentClassName
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="rounded-b-md border-t border-border/70 bg-bg-subtle/60 px-4 py-3 text-xs text-fg-muted sm:px-5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

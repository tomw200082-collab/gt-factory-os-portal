import type { ReactNode } from "react";

interface WorkflowHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Top-of-page header. Eyebrow establishes context, title is the one thing
 * the user came to see, description is the explicit promise, meta sits under
 * as status chips, actions live on the right. A hairline rule closes the
 * header and starts the page content rhythm.
 */
export function WorkflowHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  children,
}: WorkflowHeaderProps) {
  return (
    <header className="flex flex-col gap-4 pb-6 sm:gap-6 sm:pb-8 reveal">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="dot bg-accent" aria-hidden />
              <div className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
                {eyebrow}
              </div>
            </div>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tighter text-fg-strong sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
      <div
        className="h-px w-full bg-gradient-to-r from-border via-border/50 to-transparent"
        aria-hidden
      />
    </header>
  );
}

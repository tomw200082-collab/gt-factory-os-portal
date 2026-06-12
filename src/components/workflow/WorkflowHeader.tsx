import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface WorkflowHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /**
   * Optional "back" link rendered above the eyebrow. Gives every page a
   * standard, visible exit so detail/sub-pages are never dead ends.
   */
  backHref?: string;
  backLabel?: string;
  /**
   * Visual scale (Tranche 049 / VISUAL-010).
   *   "page"    — destination surfaces (dashboard, planning hub): text-3xl/4xl.
   *   "section" — operational list/form pages: text-xl/2xl with tighter
   *               eyebrow spacing, so working surfaces read as tools, not
   *               landing pages.
   */
  size?: "page" | "section";
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
  backHref,
  backLabel = "Back",
  size = "page",
}: WorkflowHeaderProps) {
  const isSection = size === "section";
  return (
    <header className="flex flex-col gap-4 pb-6 sm:gap-6 sm:pb-8 reveal">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-sops text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
              {backLabel}
            </Link>
          ) : null}
          {eyebrow ? (
            <div
              className={
                isSection
                  ? "mb-1.5 flex items-center gap-2"
                  : "mb-2 flex items-center gap-2"
              }
            >
              <span className="dot bg-accent" aria-hidden />
              <div className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
                {eyebrow}
              </div>
            </div>
          ) : null}
          <h1
            className={
              isSection
                ? "text-xl font-bold tracking-tight text-fg-strong sm:text-2xl"
                : "text-3xl font-bold tracking-tight text-fg-strong sm:text-4xl"
            }
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-fg-muted">
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

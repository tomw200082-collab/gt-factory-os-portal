import type { ReactNode } from "react";

interface FormActionsBarProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  leading?: ReactNode;
  hint?: string;
}

/**
 * Sticky action footer. Lives at the bottom of long forms so the submit
 * action is always one mouse-move away. Leading slot holds dirty indicators
 * and hints; right side is always secondary → primary.
 */
export function FormActionsBar({
  primary,
  secondary,
  leading,
  hint,
}: FormActionsBarProps) {
  return (
    <div className="sticky bottom-6 z-20 mt-6">
      <div className="card-raised flex flex-wrap items-center justify-between gap-3 rounded-lg border-border/80 bg-bg-raised/95 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3 text-xs text-fg-muted">
          {leading}
          {hint ? (
            <span className="flex items-center gap-1.5">
              {leading ? (
                <span className="h-3 w-px bg-border/60" aria-hidden />
              ) : null}
              <span>{hint}</span>
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}

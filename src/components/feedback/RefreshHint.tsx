import { cn } from "@/lib/cn";

// RefreshHint — the shared "data is on screen and a refetch is running" hint
// (tranche 206, spec §5). Show it when `isFetching && !isLoading`: the region
// keeps its data, this says so quietly.
//
//   <RefreshHint active={q.isFetching && !q.isLoading} />                  // "Updating…"
//   <RefreshHint active={...} locale="he" />                               // "מתעדכן…" (sales only)
//   <RefreshHint active={...} label="Syncing stock…" className="ml-auto" />
//
// It is a polite live region that is always mounted, with its height reserved,
// so the hint appearing never moves the page and a screen reader hears the text
// when it is inserted. No looping animation: a still dot and a short fade.

export interface RefreshHintProps {
  /** True while a refetch runs over data that is already on screen. */
  active: boolean;
  /** Overrides the default text. */
  label?: string;
  /** Picks the default text: English (factory, default) or Hebrew (sales). */
  locale?: "en" | "he";
  className?: string;
}

const DEFAULT_LABEL = { en: "Updating…", he: "מתעדכן…" } as const;

export function RefreshHint({ active, label, locale = "en", className }: RefreshHintProps) {
  const text = label ?? DEFAULT_LABEL[locale];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-active={active ? "true" : "false"}
      className={cn("gt-refresh-hint", className)}
    >
      {active ? (
        <span className="gt-refresh-hint__inner">
          <span className="gt-refresh-hint__dot" aria-hidden="true" />
          {text}
        </span>
      ) : null}
    </div>
  );
}

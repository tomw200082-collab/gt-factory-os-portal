"use client";

// ---------------------------------------------------------------------------
// <GroupFilterBar> — shared group chip bar (Tranche 044, Groups v1).
//
// Renders one chip per group (Badge-like pill: selected = filled tone fill,
// unselected = outline), an optional "ללא קבוצה" chip for the NO_GROUP
// bucket, optional per-chip counts, and a "Clear" text button whenever
// anything is selected.
//
// Visual language follows the inventory-flow FilterBar family chips
// (rounded-sm bordered pills, text-3xs, hover lift) so group chips read
// as the same control family across /inventory, the flow pages, and any
// future group-aware surface. Tone colors come from the shared
// BADGE_TONE_CLASSES lookup keyed by each group's color_token.
//
// RTL-safe: layout uses flex + gap only (no directional margins), and chip
// labels carry dir="auto" so Hebrew group names render correctly inside an
// LTR page shell.
//
// Mobile (Tranche 051, FLOW-015): below sm the row no longer wraps — it
// scrolls horizontally inside a <ScrollFade> whose right-edge gradient
// signals off-screen chips and hides at scroll end. From sm up the row
// wraps exactly as before (no visual change at md+).
//
// Selection model is owned by the caller (controlled component): `selected`
// is an array of group keys (and/or the NO_GROUP sentinel); `onToggle(key)`
// fires per chip; `onClear()` resets. Single- vs multi-select semantics are
// therefore a caller decision.
// ---------------------------------------------------------------------------

import { cn } from "@/lib/cn";
import { BADGE_TONE_CLASSES } from "@/components/ui/Badge";
import { ScrollFade } from "@/components/ui/ScrollFade";
import {
  NO_GROUP,
  NO_GROUP_LABEL,
  groupLabel,
  groupTone,
  type GroupLike,
} from "@/lib/taxonomy/groups";

export interface GroupFilterBarProps {
  /** Groups to render, in the order given (callers pre-sort by display_order). */
  groups: readonly GroupLike[];
  /** Optional per-key counts (keyed by group key and/or NO_GROUP). */
  counts?: Record<string, number>;
  /** Selected group keys (may include the NO_GROUP sentinel). */
  selected: string[];
  /** Toggle handler — fired with the chip's group key (or NO_GROUP). */
  onToggle: (key: string) => void;
  /** Clear-all handler — rendered only while something is selected. */
  onClear: () => void;
  /** Render the trailing "ללא קבוצה" chip for the null-key bucket. */
  allowNoGroup?: boolean;
  /** Optional leading row label (e.g. "לפי קו מוצר"). */
  label?: string;
  /** data-testid prefix; chips get `${testId}-chip-${key}`. */
  testId?: string;
  /** Accessible name for the chip group. Defaults to `label` when present. */
  ariaLabel?: string;
  className?: string;
}

interface ChipDescriptor {
  key: string;
  label: string;
  tone: ReturnType<typeof groupTone>;
}

export function GroupFilterBar({
  groups,
  counts,
  selected,
  onToggle,
  onClear,
  allowNoGroup = false,
  label,
  testId = "group-filter",
  ariaLabel,
  className,
}: GroupFilterBarProps): JSX.Element | null {
  if (groups.length === 0 && !allowNoGroup) return null;

  const chips: ChipDescriptor[] = groups.map((g) => ({
    key: g.key,
    label: groupLabel(g),
    tone: groupTone(g.color_token),
  }));
  if (allowNoGroup) {
    chips.push({ key: NO_GROUP, label: NO_GROUP_LABEL, tone: "neutral" });
  }

  const anySelected = selected.length > 0;

  return (
    <ScrollFade
      className={cn("min-w-0", className)}
      contentClassName="flex flex-wrap items-center gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5"
      contentProps={{
        role: "group",
        "aria-label": ariaLabel ?? label ?? "Group filters",
        "data-testid": testId,
      }}
    >
      {label ? (
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle max-sm:shrink-0">
          {label}
        </span>
      ) : null}
      {chips.map((chip) => {
        const active = selected.includes(chip.key);
        const count = counts?.[chip.key];
        const toneCls = BADGE_TONE_CLASSES[chip.tone];
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onToggle(chip.key)}
            aria-pressed={active}
            data-testid={`${testId}-chip-${chip.key}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-medium transition-all duration-150",
              "max-sm:shrink-0 max-sm:whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              active
                ? cn(toneCls.soft, "shadow-sm")
                : "border-border bg-bg-subtle text-fg-muted hover:-translate-y-px hover:border-accent/40 hover:text-fg hover:shadow-sm",
            )}
          >
            <span dir="auto">{chip.label}</span>
            {count != null ? (
              <span className="tabular-nums font-semibold" aria-label={`${count}`}>
                ({count})
              </span>
            ) : null}
          </button>
        );
      })}
      {anySelected ? (
        <button
          type="button"
          onClick={onClear}
          data-testid={`${testId}-clear`}
          className="text-2xs font-medium text-accent underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-sm:shrink-0"
        >
          Clear
        </button>
      ) : null}
    </ScrollFade>
  );
}

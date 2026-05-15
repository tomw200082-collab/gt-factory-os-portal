// ---------------------------------------------------------------------------
// StatusBadge — submission-state badge.
//
// Tranche 0A consolidation (2026-05-15): the generic <Badge> primitive and the
// shared BADGE_TONE_CLASSES tone lookup now live in @/components/ui/Badge. This
// file is kept at its historical path as:
//   - a re-export shim for `Badge` and `BADGE_TONE_CLASSES` so the ~55 callers
//     that import them from "@/components/badges/StatusBadge" do not break, and
//   - a thin <StatusBadge> wrapper that maps SubmissionState onto the primitive.
//
// The old per-tone TONE_CLASSES map that used to live here is deleted — it is
// replaced by BADGE_TONE_CLASSES in the canonical module. STYLE_FOR_STATE below
// now carries only the verbatim label string + tone + animated flag per state.
//
// HARD RULE for Tranche 0A: every label string is verbatim from the
// pre-consolidation map. No copy changes.
// ---------------------------------------------------------------------------

import type { SubmissionState } from "@/lib/contracts/enums";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

// Re-export the primitive + shared tone lookup from their historical path.
export { Badge, BADGE_TONE_CLASSES } from "@/components/ui/Badge";
export type { BadgeProps, BadgeTone, BadgeVariant, BadgeSize } from "@/components/ui/Badge";

/**
 * Submission-state badge: dot + compact uppercase label.
 *
 * The dot color is the semantic signal; the pill is low-chrome so many
 * of these can sit in a row without competing.
 *
 * Label strings + tone + animated flag only — class strings come from
 * BADGE_TONE_CLASSES via the <Badge> primitive.
 */
const STYLE_FOR_STATE: Record<
  SubmissionState,
  { label: string; tone: BadgeTone; animated?: boolean; className?: string }
> = {
  queued: { label: "Queued", tone: "muted" },
  submitting: { label: "Submitting", tone: "info", animated: true },
  committed: { label: "Committed", tone: "success" },
  pending_approval: { label: "Pending approval", tone: "warning", animated: true },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  failed_retriable: { label: "Retry pending", tone: "warning" },
  failed_terminal: { label: "Failed", tone: "danger" },
  discarded: { label: "Discarded", tone: "muted", className: "line-through" },
};

interface StatusBadgeProps {
  state: SubmissionState;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  const s = STYLE_FOR_STATE[state];
  return (
    <Badge
      tone={s.tone}
      size="xs"
      dot
      animated={s.animated}
      className={s.className}
    >
      {s.label}
    </Badge>
  );
}

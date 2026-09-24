// ---------------------------------------------------------------------------
// Tranche 0A consolidation (2026-05-15): the generic <Badge> primitive and the
// shared BADGE_TONE_CLASSES tone lookup live in @/components/ui/Badge. This
// file is kept at its historical path only as a re-export shim, so the ~55
// callers that import them from "@/components/badges/StatusBadge" do not break.
// (Tranche 178 removed the <StatusBadge> wrapper that also lived here; nothing
// rendered it.)
// ---------------------------------------------------------------------------

// Re-export the primitive + shared tone lookup from their historical path.
export { Badge, BADGE_TONE_CLASSES } from "@/components/ui/Badge";
export type { BadgeProps, BadgeTone, BadgeVariant, BadgeSize } from "@/components/ui/Badge";

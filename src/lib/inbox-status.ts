// Macro-status compression — internal 8-state status enum → planner-facing
// 2-state ('open' / 'closed').
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.11
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.2

export type InternalStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'auto_resolved'
  | 'pending_gi_action'
  | 'gi_draft_created'
  | 'gi_action_failed'
  | 'dismissed';

export type MacroStatus = 'open' | 'closed';

const OPEN_STATES = new Set<string>([
  'open',
  'acknowledged',
  'pending_gi_action',
  'gi_action_failed',
]);

const CLOSED_STATES = new Set<string>([
  'resolved',
  'auto_resolved',
  'dismissed',
  'gi_draft_created',
]);

export function compressStatus(internal: string): MacroStatus {
  if (OPEN_STATES.has(internal)) return 'open';
  if (CLOSED_STATES.has(internal)) return 'closed';
  // Defensive default: any unknown status renders as 'open' so the planner
  // notices it (rather than silently disappearing into the History tab).
  return 'open';
}

export function isOpen(internal: string): boolean {
  return compressStatus(internal) === 'open';
}

export function isClosed(internal: string): boolean {
  return compressStatus(internal) === 'closed';
}

/**
 * Visual hint for the row — whether it should render with the
 * "acknowledged-but-still-open" muted styling. Per spec §1.7, Warning
 * cards in 'acknowledged' status remain visible but visually silenced.
 */
export function isVisuallyMuted(internal: string): boolean {
  return internal === 'acknowledged';
}

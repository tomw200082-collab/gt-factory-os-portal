// Shared cancel-reason vocabulary for the procurement corridor.
//
// COPY-110, open since the 2026-07-16 gate: the planner's FocusCard and the
// office manager's PlacementRow each carried their own hand-written list, so
// the same act was recorded in two vocabularies and the audit trail did not
// line up. Tom delegated the call (2026-07-30).
//
// Decision: NOT one flat list, and NOT two unrelated ones.
//
// They are two different questions asked at two different moments, and merging
// them would make every cancel a scan through options that cannot apply —
// slower, and less clear:
//
//   • Dropping a RECOMMENDATION before it is an order (planner, in-session) —
//     "why am I not ordering this at all?"
//   • Discarding an APPROVED PO out of the placement queue (office manager) —
//     "why am I not placing an order we already approved?"
//
// So: one module, two named subsets, and every reason that means the same thing
// in both places is spelled identically — which is what the audit trail needed.
// `אחר` (free text) stays available on both, so no one is ever stuck without a
// truthful answer.

/** True in both moments: the need is gone, or the line is a duplicate. */
const SHARED = ["כבר לא נדרש", "כפילות"] as const;

/**
 * Planner, cancelling a recommendation inside a purchase session. The reasons
 * are about the RECOMMENDATION being wrong or premature.
 */
export const SESSION_CANCEL_REASONS = [
  ...SHARED,
  "המלצת המנוע שגויה",
  "לבחון שוב בסבב הבא",
] as const;

/**
 * Office manager, discarding an approved PO from the placement queue. The
 * reasons are about REALITY at the moment of the supplier call.
 */
export const PLACEMENT_CANCEL_REASONS = [
  ...SHARED,
  "הוזמן בערוץ אחר",
  "הספק לא זמין",
  "מחיר/תנאים לא מתאימים",
] as const;

/** The free-text escape, identical on both surfaces. */
export const CANCEL_REASON_OTHER = "אחר" as const;

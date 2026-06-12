// ---------------------------------------------------------------------------
// /planning/purchase-calendar — SUPERSEDED. Permanent redirect to
// /planning/procurement?view=calendar.
//
// Tranche 045 (planning consolidation): the procurement page carries its own
// calendar view (Tranche 033 CalendarView, via the in-page list/calendar
// toggle). Tranche 065 (FLOW-A14): that toggle now honours ?view=calendar,
// so this redirect lands the planner directly on the calendar view instead
// of requiring an extra tap.
//
// KEEP the sibling _lib/ directory (usePurchaseCalendar) — left in place per
// the tranche manifest; only page.tsx is replaced.
//
// Pre-redirect page preserved in git history.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function PurchaseCalendarRedirectPage() {
  redirect("/planning/procurement?view=calendar");
}

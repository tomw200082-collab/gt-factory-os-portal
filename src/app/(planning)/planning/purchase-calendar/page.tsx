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
// The sibling _lib/ (usePurchaseCalendar) that tranche 045 left in place was
// removed in tranche 178: nothing imported it after this redirect.
//
// Pre-redirect page preserved in git history.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function PurchaseCalendarRedirectPage() {
  redirect("/planning/procurement?view=calendar");
}

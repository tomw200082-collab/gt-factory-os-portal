// ---------------------------------------------------------------------------
// /planning/purchase-calendar — SUPERSEDED. Permanent redirect to
// /planning/procurement.
//
// Tranche 045 (planning consolidation): the procurement page carries its own
// calendar view (Tranche 033 CalendarView, via the in-page list/calendar
// toggle). That toggle is local component state — not URL-controlled — so
// this redirect targets the procurement page plainly; the planner switches
// to the calendar view with one tap.
//
// KEEP the sibling _lib/ directory (usePurchaseCalendar) — left in place per
// the tranche manifest; only page.tsx is replaced.
//
// Pre-redirect page preserved in git history.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function PurchaseCalendarRedirectPage() {
  redirect("/planning/procurement");
}

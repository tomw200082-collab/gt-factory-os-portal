// ---------------------------------------------------------------------------
// /planning/weekly-outlook — SUPERSEDED. Permanent redirect to
// /planning/inventory-flow.
//
// Tranche 045 (planning consolidation): Inventory Flow is the daily-granular
// replacement for the weekly outlook snapshot (per-item daily projection with
// shortage tiers). The URL is preserved as a redirect so bookmarks and
// inbound links keep working.
//
// Pre-redirect page preserved in git history.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function WeeklyOutlookRedirectPage() {
  redirect("/planning/inventory-flow");
}

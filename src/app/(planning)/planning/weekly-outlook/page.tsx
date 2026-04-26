// ---------------------------------------------------------------------------
// /planning/weekly-outlook — DEPRECATED.
//
// Replaced by /planning/inventory-flow on 2026-04-26 (corridor amendment §C
// + Tom direct authorization, single tranche replacement). This route
// survives one release as a redirect; nav-manifest entry has been
// renamed and repointed.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function WeeklyOutlookRedirect(): never {
  redirect("/planning/inventory-flow");
}

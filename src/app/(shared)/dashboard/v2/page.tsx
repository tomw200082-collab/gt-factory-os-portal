// ---------------------------------------------------------------------------
// /dashboard/v2 — DEPRECATED. Permanent redirect to /dashboard.
//
// Authority: Tom decision R0-1 (2026-05-08) graduated v2 content forward
// into /dashboard. v2 URL is preserved as a redirect so any bookmarks or
// inbound links continue to work.
//
// Pre-graduation file preserved in git history at commit 9e2212e (and
// earlier) under window2-portal-sandbox.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function DashboardV2RedirectPage() {
  redirect("/dashboard");
}

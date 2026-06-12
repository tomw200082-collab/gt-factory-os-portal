// ---------------------------------------------------------------------------
// /planning/purchase-session — SUPERSEDED. Permanent redirect to
// /planning/procurement.
//
// Tranche 045 (planning consolidation): the merged procurement front door
// (Tranche 028) plus focus mode (Tranche 029) fully supersede the classic
// per-PO session screen. The URL is preserved as a redirect so bookmarks and
// inbound links keep working.
//
// KEEP the sibling _lib/ directory — the procurement page and the dashboard
// urgent-procurement block import useCurrentSession / useStartSession and the
// PurchaseSession types from there.
//
// Pre-redirect page preserved in git history.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function PurchaseSessionRedirectPage() {
  redirect("/planning/procurement");
}

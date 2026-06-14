import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/boms — legacy redirect to the canonical Masters BOM list.
//
// Tranche 066 (route consolidation): the canonical recipe/BOM surface is
// /admin/masters/boms. This route is kept as a permanent redirect so old links
// (bookmarks, cross-page links, readiness fix-now links) keep resolving.
// ---------------------------------------------------------------------------

export default function AdminBomsLegacyRedirect() {
  redirect("/admin/masters/boms");
}

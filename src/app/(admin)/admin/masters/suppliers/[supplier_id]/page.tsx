import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/masters/suppliers/[supplier_id] — retired view-only detail.
//
// The Tranche D read-only masters tree for suppliers is superseded by the
// legacy rich detail at /admin/suppliers/[supplier_id], which is strictly
// richer (full supplier surface, inline edits, status toggle, po-history
// tab wired to upstream). Cross-links have been rewritten to point directly
// at the canonical target; this redirect preserves outstanding bookmarks
// (including inbound links from /purchase-orders/[po_id]).
// ---------------------------------------------------------------------------

export default async function AdminMastersSupplierRedirect({
  params,
}: {
  params: Promise<{ supplier_id: string }>;
}) {
  const { supplier_id } = await params;
  redirect(`/admin/suppliers/${encodeURIComponent(supplier_id)}`);
}

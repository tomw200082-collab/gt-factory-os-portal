import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/masters/items/[item_id] — retired view-only detail.
//
// The Tranche D read-only masters tree for items is superseded by the
// Product 360 hero at /admin/products/[item_id], which exposes a strictly
// richer surface (7 tabs incl. BOM, components, suppliers, planning,
// history) and supports inline edit. Cross-links have been rewritten to
// point at the canonical target directly; this redirect preserves any
// outstanding bookmarks and typed URLs.
// ---------------------------------------------------------------------------

export default async function AdminMastersItemRedirect({
  params,
}: {
  params: Promise<{ item_id: string }>;
}) {
  const { item_id } = await params;
  redirect(`/admin/products/${encodeURIComponent(item_id)}`);
}

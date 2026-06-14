import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/products/[item_id] — redirect to the canonical item detail surface.
//
// Tranche 066 (route consolidation): the two parallel item-detail surfaces are
// merged onto the authority-designated canonical
// /admin/masters/items/[item_id] (CLAUDE.md Recipe-Readiness corridor; the
// items list links there). This former "Product 360" route is kept as a
// permanent redirect so old links (the new-product wizard, bookmarks,
// cross-page links) keep resolving. SKU-alias management lives at
// /admin/sku-aliases.
// ---------------------------------------------------------------------------

export default async function AdminProductDetailLegacyRedirect({
  params,
}: {
  params: Promise<{ item_id: string }>;
}) {
  const { item_id } = await params;
  redirect(`/admin/masters/items/${encodeURIComponent(item_id)}`);
}

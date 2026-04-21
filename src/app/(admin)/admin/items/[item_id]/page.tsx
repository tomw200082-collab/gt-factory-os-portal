import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/items/[item_id] — legacy redirect to Product 360.
//
// AMMC v1 Slice 5 (crystalline-drifting-dusk §C.2 Entity list + detail):
// the item detail surface is the Product 360 hero at
// /admin/products/[item_id]. This route exists as a permanent redirect
// target so that old links (notifications, bookmarks, cross-page links)
// continue to resolve.
// ---------------------------------------------------------------------------

export default async function AdminItemLegacyDetailRedirect({
  params,
}: {
  params: Promise<{ item_id: string }>;
}) {
  const { item_id } = await params;
  redirect(`/admin/products/${encodeURIComponent(item_id)}`);
}

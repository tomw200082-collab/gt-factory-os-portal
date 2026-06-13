import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/items/[item_id] — legacy redirect to the canonical item detail.
//
// Tranche 066 (route consolidation): the canonical item detail surface is
// /admin/masters/items/[item_id] (matches the items list row links). This route
// is kept as a permanent redirect so old links continue to resolve.
// ---------------------------------------------------------------------------

export default async function AdminItemLegacyDetailRedirect({
  params,
}: {
  params: Promise<{ item_id: string }>;
}) {
  const { item_id } = await params;
  redirect(`/admin/masters/items/${encodeURIComponent(item_id)}`);
}

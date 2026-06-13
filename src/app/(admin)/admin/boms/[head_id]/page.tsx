import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/boms/[head_id] — legacy redirect to the canonical Masters BOM head.
//
// Tranche 066 (route consolidation): the canonical surface is
// /admin/masters/boms/[bom_head_id]. Kept as a permanent redirect so old links
// continue to resolve.
// ---------------------------------------------------------------------------

export default async function AdminBomHeadLegacyRedirect({
  params,
}: {
  params: Promise<{ head_id: string }>;
}) {
  const { head_id } = await params;
  redirect(`/admin/masters/boms/${encodeURIComponent(head_id)}`);
}

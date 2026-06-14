import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/boms/[head_id]/versions/[version_id] — legacy redirect to the
// canonical Masters BOM version detail.
//
// Tranche 066 (route consolidation): the canonical version surface is
// /admin/masters/boms/[bom_head_id]/[version_id] (read-only, with an "Edit"
// affordance for drafts). This replaces the duplicate ~1588-line legacy editor;
// the route is kept as a permanent redirect so old links keep resolving.
// ---------------------------------------------------------------------------

export default async function AdminBomVersionLegacyRedirect({
  params,
}: {
  params: Promise<{ head_id: string; version_id: string }>;
}) {
  const { head_id, version_id } = await params;
  redirect(
    `/admin/masters/boms/${encodeURIComponent(head_id)}/${encodeURIComponent(version_id)}`,
  );
}

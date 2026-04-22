import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/masters/components/[component_id] — retired view-only detail.
//
// The Tranche D read-only masters tree for components is superseded by the
// legacy rich detail at /admin/components/[component_id], which is strictly
// richer (inline edit on many fields, supplier-item child management,
// status toggle). Cross-links have been rewritten to point directly at the
// canonical target; this redirect preserves outstanding bookmarks.
// ---------------------------------------------------------------------------

export default async function AdminMastersComponentRedirect({
  params,
}: {
  params: Promise<{ component_id: string }>;
}) {
  const { component_id } = await params;
  redirect(`/admin/components/${encodeURIComponent(component_id)}`);
}

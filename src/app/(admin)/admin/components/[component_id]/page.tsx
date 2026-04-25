import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/components/[component_id] — legacy redirect to canonical masters path.
// The canonical detail surface is /admin/masters/components/[component_id].
// ---------------------------------------------------------------------------

export default async function AdminComponentLegacyRedirect({
  params,
}: {
  params: Promise<{ component_id: string }>;
}) {
  const { component_id } = await params;
  redirect(`/admin/masters/components/${encodeURIComponent(component_id)}`);
}

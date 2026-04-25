import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /admin/suppliers/[supplier_id] — legacy redirect to canonical masters path.
// The canonical detail surface is /admin/masters/suppliers/[supplier_id].
// ---------------------------------------------------------------------------

export default async function AdminSupplierLegacyRedirect({
  params,
}: {
  params: Promise<{ supplier_id: string }>;
}) {
  const { supplier_id } = await params;
  redirect(`/admin/masters/suppliers/${encodeURIComponent(supplier_id)}`);
}

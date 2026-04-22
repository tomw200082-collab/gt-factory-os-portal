import { PendingSurfacePlaceholder } from "@/components/system/PendingSurfacePlaceholder";

export default function StockSubmissionsPage() {
  return (
    <PendingSurfacePlaceholder
      eyebrow="Stock"
      title="My submissions"
      description="Consolidated view of the current user's stock submissions — goods receipts, waste / adjustment, physical count, and production actual — is pending. Each submission form writes to a per-form table today, but no portal-readable cross-form projection keyed by submitter exists yet."
      missingEndpoints={[
        "GET /api/v1/queries/stock/submissions?submitted_by=me",
      ]}
      note="Pending approvals already surface on /inbox. This page will fill the gap between submission and approval so operators can see the state of their own recent posts."
    />
  );
}

import { PendingSurfacePlaceholder } from "@/components/system/PendingSurfacePlaceholder";

export default function AdminUsersPage() {
  return (
    <PendingSurfacePlaceholder
      eyebrow="Admin · system"
      title="Users"
      description="User administration — seat list, role assignment, deactivation, and audit — is not yet available in the portal. Supabase auth and the role lattice are live, but no admin read/write endpoint has been authored for the portal to consume."
      missingEndpoints={[
        "GET /api/v1/queries/users",
        "POST /api/v1/mutations/users/:id/role",
        "POST /api/v1/mutations/users/:id/status",
      ]}
      note="Until this surface lights up, role + seat management is performed directly in Supabase."
    />
  );
}

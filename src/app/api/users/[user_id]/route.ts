import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/users/[user_id] — proxy to Fastify
//   PATCH /api/v1/mutations/admin/users/:user_id
//
// Body: { role?: 'admin'|'planner'|'operator'|'viewer', status?: 'active'|'inactive'|'suspended' }
// At least one field required.
//
// 200: updated user row
// 403: non-admin caller
// 404: user not found
// 409: { reason_code: 'CANNOT_SELF_DEMOTE' } — admin trying to demote own role
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const { user_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/admin/users/${encodeURIComponent(user_id)}`,
    errorLabel: "admin user update",
  });
}

import { proxyRequest } from "@/lib/api-proxy";

// PATCH /api/production-plan/[plan_id]
//   → /api/v1/mutations/production-plan/:id
// Edit OR cancel modes are discriminated by the request body shape.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/production-plan/${encodeURIComponent(plan_id)}`,
    errorLabel: "production plan patch",
  });
}

// DELETE /api/production-plan/[plan_id]
//   → /api/v1/mutations/production-plan/:id
// Hard-deletes a not-yet-produced plan row (planned or cancelled). Done rows
// (linked to a production_actual) come back 409. Planner/admin only.

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "DELETE",
    upstreamPath: `/api/v1/mutations/production-plan/${encodeURIComponent(plan_id)}`,
    errorLabel: "production plan delete",
  });
}

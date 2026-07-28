import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/users/[user_id]/password — proxy to Fastify
//   POST /api/v1/mutations/admin/users/:user_id/password — generate + set
//   GET  /api/v1/queries/users/:user_id/password          — reveal current
//
// 200: { user_id, password } (plaintext — only ever returned on an explicit
//       admin-initiated Generate/Show action, never in the users list)
// 403: non-admin caller
// 404: user not found, or (GET only) no password has been set yet
// 503: password control not configured on this deployment
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const { user_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/admin/users/${encodeURIComponent(user_id)}/password`,
    errorLabel: "admin user password set",
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const { user_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/users/${encodeURIComponent(user_id)}/password`,
    forwardQuery: false,
    errorLabel: "admin user password reveal",
  });
}

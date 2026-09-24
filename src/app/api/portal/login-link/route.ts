import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/portal/login-link — mint a login link for an approved customer
// (Tranche 179). Nothing is sent: the page shows the link for a person to
// copy or to open in WhatsApp.
//
// POST → Fastify POST /api/v1/mutations/portal/login-link
// body: { access_id }
// 200: { url, wa_link }
// 404: no such approved customer · 401: no session · 403: not admin
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/portal/login-link",
    errorLabel: "portal login link",
  });
}

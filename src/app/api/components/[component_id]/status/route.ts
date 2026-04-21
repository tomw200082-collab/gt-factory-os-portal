import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/components/[component_id]/status — proxy to Fastify
//   POST /api/v1/mutations/components/:component_id/status
//
// AMMC v1 Slice 2: admin-only status toggle. Body carries { status,
// if_match_updated_at, idempotency_key }.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ component_id: string }> },
): Promise<Response> {
  const { component_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/components/${encodeURIComponent(component_id)}/status`,
    errorLabel: "components status",
  });
}

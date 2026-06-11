import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/groups/[kind] — mutation proxy (Tranche 044, Groups v1).
//
// POST → Fastify POST /api/v1/mutations/groups/:kind
//        (admin-only create; kind ∈ {product, material}; body carries
//        idempotency_key + key + name_en + name_he + display_order +
//        optional color_token / component_class_hint).
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/groups/${encodeURIComponent(kind)}`,
    errorLabel: "group create",
  });
}

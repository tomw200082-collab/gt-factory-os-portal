import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/boms/versions/[version_id]/lines — proxy to Fastify
//   POST /api/v1/mutations/boms/versions/:version_id/lines
//
// AMMC v1 Slice 6 UI (crystalline-drifting-dusk §G.6 + §D.2 BOM mutations).
// Adds a new BOM line to a DRAFT bom_version. Admin-only upstream. Body:
// { final_component_id, final_component_qty, idempotency_key }.
// Upstream returns 201 on success with the new line row; 409 VERSION_NOT_DRAFT
// if the target version is not status='DRAFT'; 409 COMPONENT_NOT_FOUND on
// unknown component; 422 on Zod validation failure. Backend commit: canonical
// ac75ed1 (Railway redeploy ff39932c-750e-4f43-8721-26cb69beba07).
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/boms/versions/${encodeURIComponent(version_id)}/lines`,
    errorLabel: "bom line add",
  });
}

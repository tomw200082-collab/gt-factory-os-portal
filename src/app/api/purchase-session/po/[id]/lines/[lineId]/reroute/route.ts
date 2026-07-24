import { proxyRequest } from "@/lib/api-proxy";

// 0288 raw-material-first: re-route a session line to a different candidate
// supplier. Proxies to the Fastify mutation.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
): Promise<Response> {
  const { id, lineId } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/purchase-session/po/${encodeURIComponent(
      id,
    )}/lines/${encodeURIComponent(lineId)}/reroute`,
    errorLabel: "purchase session line re-route",
  });
}

import { proxyRequest } from "@/lib/api-proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/physical-counts/${encodeURIComponent(id)}/cancel`,
    errorLabel: "physical-count cancel",
  });
}

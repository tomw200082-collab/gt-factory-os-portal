import { proxyRequest } from "@/lib/api-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/physical-counts/${encodeURIComponent(id)}`,
    errorLabel: "physical-count detail",
  });
}

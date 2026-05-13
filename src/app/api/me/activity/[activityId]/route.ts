import { proxyRequest } from "@/lib/api-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ activityId: string }> },
): Promise<Response> {
  const { activityId } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/me/activity/${encodeURIComponent(activityId)}`,
    errorLabel: "activity detail",
  });
}

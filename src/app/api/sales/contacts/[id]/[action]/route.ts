import { NextResponse } from "next/server";
import { proxyRequest } from "@/lib/api-proxy";
import { badId, isUuid } from "@/app/api/sales/_ids";

// POST /api/sales/contacts/:id/:action → POST /api/v1/mutations/sales/contacts/:id/:action
// Managers only. The action is checked here so nothing but the decisions the
// portal makes (verify, reject) is forwarded under this path; the API's promote
// and redact get a route when a screen uses them.

const ACTIONS = new Set(["verify", "reject"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isUuid(id)) return badId();
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/sales/contacts/${encodeURIComponent(id)}/${action}`,
    errorLabel: `sales contact ${action}`,
  });
}

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Portal proxy: GET /api/forecasts/versions/:version_id
//   -> API GET /api/v1/queries/forecasts/versions/:version_id (G.2)
//
// Authored under W2 Mode B, scoped to Forecast only.
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.FORECASTS_API_BASE ??
  process.env.EXCEPTIONS_API_BASE ??
  process.env.WASTE_ADJUSTMENTS_API_BASE ??
  process.env.GOODS_RECEIPTS_API_BASE ??
  "http://127.0.0.1:3333";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  const fakeSession = req.headers.get("x-fake-session");
  if (!fakeSession) {
    return NextResponse.json(
      { error: "Missing X-Fake-Session (portal shim)" },
      { status: 401 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_BASE}/api/v1/queries/forecasts/versions/${encodeURIComponent(version_id)}`,
      {
        method: "GET",
        headers: { "X-Test-Session": fakeSession },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "forecasts get upstream unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  return new NextResponse(body, { status: upstream.status, headers });
}

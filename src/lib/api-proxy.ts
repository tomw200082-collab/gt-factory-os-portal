// ---------------------------------------------------------------------------
// Server-side API proxy helper
//
// Single source of truth for every `src/app/api/**/route.ts` that forwards to
// the GT Factory OS Fastify API on Railway.
//
// Contract:
// 1. Reads server-side env var `API_BASE` (never NEXT_PUBLIC_). No localhost
//    fallback — missing env var returns 500 in production so the misconfig is
//    loud, not silent.
// 2. Extracts the Supabase session from request cookies via the SSR server
//    client. Missing/expired session returns 401.
// 3. Forwards `Authorization: Bearer <jwt>` to upstream. The legacy
//    X-Fake-Session → X-Test-Session path is removed — dev-shim lives on the
//    API server behind ENABLE_DEV_SHIM_AUTH, not in portal proxies.
// 4. Preserves upstream status + content-type on the response.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProxyOptions {
  /** Upstream HTTP method. GET for reads; POST/PUT/DELETE for mutations. */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Upstream path, starting with `/`. Example: "/api/v1/queries/planning/runs". */
  upstreamPath: string;
  /**
   * Forward the request body to upstream (POST/PUT/PATCH). Ignored for GET.
   * Defaults to true when method is mutating.
   */
  forwardBody?: boolean;
  /**
   * Forward the request querystring (`?status=open&limit=50`). Defaults to true
   * for GET, false for mutations.
   */
  forwardQuery?: boolean;
  /**
   * Human-readable error label surfaced to the client on upstream failure.
   * Example: "planning runs list".
   */
  errorLabel: string;
}

export async function proxyRequest(
  req: Request,
  opts: ProxyOptions,
): Promise<Response> {
  const apiBase = process.env.API_BASE;
  if (!apiBase) {
    return NextResponse.json(
      { error: "API_BASE env var not configured on server" },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const forwardQuery = opts.forwardQuery ?? opts.method === "GET";
  const forwardBody =
    opts.forwardBody ?? ["POST", "PUT", "PATCH"].includes(opts.method);

  let url = `${apiBase}${opts.upstreamPath}`;
  if (forwardQuery) {
    const incoming = new URL(req.url);
    if (incoming.search) url += incoming.search;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  let bodyInit: BodyInit | undefined;
  if (forwardBody) {
    const bodyText = await req.text();
    if (bodyText.length > 0) {
      bodyInit = bodyText;
      headers["Content-Type"] =
        req.headers.get("content-type") ?? "application/json";
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: opts.method,
      headers,
      body: bodyInit,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `${opts.errorLabel} upstream unreachable`,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const responseBody = await upstream.text();
  const responseHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) responseHeaders.set("content-type", ct);

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// ---------------------------------------------------------------------------
// Typed portal API client — substrate primitive.
//
// Introduced by Tranche A of portal-full-production-refactor (plan §C.1).
// Adoption by pages and features happens in later tranches; this file only
// establishes the shape. Current code paths continue to use fetch() + the
// portal proxy routes at src/app/api/** without changes.
//
// Behavior contract:
//   1. Returns a discriminated Result<T> — never throws for network failure
//      or non-2xx responses. Callers pattern-match on result.ok.
//   2. On HTTP 401: the shared handleUnauthorized() helper performs a
//      client-side redirect to /login?redirectTo=<current pathname> (when
//      executed in the browser). Server-side call sites receive an ok=false
//      Result and are expected to surface their own redirect.
//   3. Error envelope decode: upstream API uses { reason_code, detail }
//      plus occasional { error, details } shapes. Both are accepted.
//   4. Content-Type: always application/json on POST/PUT bodies; requests
//      always carry Accept: application/json.
//   5. Idempotency keys: callers pass an optional idempotencyKey; when
//      supplied, it is forwarded as Idempotency-Key header. The client
//      does NOT mint keys — that remains the caller's contract.
//
// Explicitly NOT in this primitive:
//   - Retry/backoff (not defined by plan; belongs to caller policy)
//   - Auth header assembly (Supabase Bearer flows through the portal proxy
//     in src/lib/api-proxy.ts; client-side fetches rely on cookies)
//   - Request-ID tracing (upstream is not wired to consume it yet)
// ---------------------------------------------------------------------------

export type Result<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false;
      status: number;
      reason_code?: string;
      detail?: string;
      raw?: unknown;
    };

interface RequestOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

function currentPathname(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  const redirectTo = encodeURIComponent(currentPathname());
  window.location.href = `/login?redirectTo=${redirectTo}`;
}

async function decodeBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractError(body: unknown): { reason_code?: string; detail?: string } {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const reason_code =
    typeof b.reason_code === "string"
      ? b.reason_code
      : typeof b.error === "string"
        ? b.error
        : undefined;
  const detail =
    typeof b.detail === "string"
      ? b.detail
      : typeof b.message === "string"
        ? b.message
        : typeof b.details === "string"
          ? b.details
          : undefined;
  return { reason_code, detail };
}

async function dispatch<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  body: unknown,
  options: RequestOptions,
): Promise<Result<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason_code: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 401) {
    handleUnauthorized();
    return {
      ok: false,
      status: 401,
      reason_code: "unauthorized",
      detail: "Session expired or not authenticated. Redirecting to login.",
    };
  }

  const decoded = await decodeBody(res);

  if (res.ok) {
    return { ok: true, data: decoded as T, status: res.status };
  }

  const { reason_code, detail } = extractError(decoded);
  return {
    ok: false,
    status: res.status,
    reason_code,
    detail,
    raw: decoded,
  };
}

export function get<T>(url: string, options: RequestOptions = {}): Promise<Result<T>> {
  return dispatch<T>("GET", url, undefined, options);
}

export function post<T>(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<Result<T>> {
  return dispatch<T>("POST", url, body, options);
}

export function put<T>(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<Result<T>> {
  return dispatch<T>("PUT", url, body, options);
}

export function del<T>(
  url: string,
  options: RequestOptions = {},
): Promise<Result<T>> {
  return dispatch<T>("DELETE", url, undefined, options);
}

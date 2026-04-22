// ---------------------------------------------------------------------------
// Observability — reportError / reportWarning.
//
// Single export surface so product code depends on one thing. Current impl
// is intentionally minimal:
//   - Dev (NODE_ENV !== "production"): pretty console.error / console.warn
//     with the structured envelope so issues surface immediately in the
//     browser console.
//   - Prod: same structured log via console (picked up by browser console
//     capture), plus a forward-slot that reads NEXT_PUBLIC_SENTRY_DSN and
//     — once the operator authorizes adding @sentry/nextjs as a dep — will
//     relay through Sentry.captureException. Until then the branch is a
//     no-op, and the console log is the only sink.
//
// Contract:
//   - Never throws. If reporting itself fails, swallow silently (observing
//     the observer is the observer's job, not the reporter's).
//   - Accepts unknown error shapes (Error, string, anything) and normalizes.
// ---------------------------------------------------------------------------

export interface ErrorReport {
  level: "error" | "warning";
  message: string;
  stack?: string;
  digest?: string;
  context?: Record<string, unknown>;
  timestamp: string;
  user_agent?: string;
  url?: string;
}

function normalize(err: unknown): { message: string; stack?: string; digest?: string } {
  if (err instanceof Error) {
    // Next.js wraps errors with a `digest` field for server-side traceability.
    const digest = (err as Error & { digest?: string }).digest;
    return { message: err.message, stack: err.stack, digest };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

function envelope(
  level: "error" | "warning",
  err: unknown,
  context?: Record<string, unknown>,
): ErrorReport {
  const { message, stack, digest } = normalize(err);
  return {
    level,
    message,
    stack,
    digest,
    context,
    timestamp: new Date().toISOString(),
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    url: typeof window !== "undefined" ? window.location.href : undefined,
  };
}

function forwardToPlatform(_report: ErrorReport): void {
  // Placeholder for Sentry / Datadog / custom-ingest. When
  // NEXT_PUBLIC_SENTRY_DSN lands and @sentry/nextjs is installed, replace
  // this body with Sentry.captureException(report). Until then, the sink
  // is the console log emitted by reportError / reportWarning directly.
  //
  // Kept as a separate function so the future wiring is a single edit.
  // Intentionally a no-op.
}

export function reportError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    const report = envelope("error", err, context);
    // Always console.error so the browser devtools + any log-capture layer
    // picks it up.
    // eslint-disable-next-line no-console
    console.error("[obs:error]", report);
    forwardToPlatform(report);
  } catch {
    // Never throw from the observer.
  }
}

export function reportWarning(
  msg: string,
  context?: Record<string, unknown>,
): void {
  try {
    const report = envelope("warning", msg, context);
    // eslint-disable-next-line no-console
    console.warn("[obs:warning]", report);
    forwardToPlatform(report);
  } catch {
    // Never throw from the observer.
  }
}

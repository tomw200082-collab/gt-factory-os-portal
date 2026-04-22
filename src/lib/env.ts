// ---------------------------------------------------------------------------
// Env-var access with fail-fast validation.
//
// Background: before this helper, every module that needed an env var read
// `process.env.X` directly. When the var was missing (misconfigured Vercel
// env, forgotten .env.local), the failure surfaced as a confusing downstream
// error — "fetch failed to undefined/api/...", "supabase client construction
// threw", etc. This helper centralises validation so the error names the
// offending var + a hint.
//
// Contract:
//   - requireEnv(name, hint?) throws a descriptive Error if the env var is
//     unset or an empty string. Used by server-side modules at import time
//     so misconfig fails at boot, not on first request.
//   - publicEnv() returns a frozen object of the NEXT_PUBLIC_* vars that
//     client-side code may consume. `undefined` values pass through (client
//     code decides whether they are required).
//
// Usage:
//   // server module
//   const API_BASE = requireEnv("API_BASE", "Fastify upstream host");
//
//   // client module
//   const { ENABLE_DEV_SHIM_AUTH } = publicEnv();
// ---------------------------------------------------------------------------

export class EnvMissingError extends Error {
  constructor(name: string, hint?: string) {
    const suffix = hint ? ` — ${hint}` : "";
    super(`Missing required environment variable: ${name}${suffix}`);
    this.name = "EnvMissingError";
  }
}

export function requireEnv(name: string, hint?: string): string {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new EnvMissingError(name, hint);
  }
  return raw;
}

export function optionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw;
}

interface PublicEnv {
  readonly NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string | undefined;
  readonly NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH: string | undefined;
  readonly NEXT_PUBLIC_SENTRY_DSN: string | undefined;
}

export function publicEnv(): PublicEnv {
  return Object.freeze({
    NEXT_PUBLIC_SUPABASE_URL: optionalEnv("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH: optionalEnv(
      "NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH",
    ),
    NEXT_PUBLIC_SENTRY_DSN: optionalEnv("NEXT_PUBLIC_SENTRY_DSN"),
  });
}

/**
 * Asserts that all production-critical server env vars are set. Call from
 * the server entry path once (e.g. a root layout server action) so the
 * deploy fails loudly if a var was forgotten in Vercel config.
 */
export function assertServerBootEnv(): void {
  requireEnv("API_BASE", "Fastify upstream host (e.g. https://api.gt-factory.com)");
  // Supabase env vars are NEXT_PUBLIC_ so they're client-visible; validated
  // here too because server-side createSupabaseServerClient consumes them.
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL");
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key");
}

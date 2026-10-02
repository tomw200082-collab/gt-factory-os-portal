# Tranche 199 — TLS verification on every deployment

**Status:** in progress on `claude/tls-verify-guard`.
**Origin:** Tom, 2026-10-02: investigate and safely fix `NODE_TLS_REJECT_UNAUTHORIZED=0` without breaking integrations.

## Finding

- The production runtime logs Node's warning that `NODE_TLS_REJECT_UNAUTHORIZED` is `0`.
  - It has appeared since 2026-06-16.
  - On 2026-10-02 it showed up 16 times on deployment `dpl_Ghsx6Ck5BTQ7DSbZFbGCP7R6mwjq`, from the middleware and from API routes.
  - With it, every outbound call skips certificate checks.
- The flag is not in the code. It is a Vercel project environment variable, and this session cannot read or edit those (403).
- The portal server reaches two hosts only:
  - the API, `gt-factory-os-api-production.up.railway.app`, with a Let's Encrypt `*.up.railway.app` certificate valid to 2026-12-26;
  - Supabase, `rvadsozabmxkkrktwgnv.supabase.co`, with a Google Trust Services `*.supabase.co` certificate valid to 2026-11-24.

  Both verify. Nothing needs the flag.

## Change

- `src/instrumentation.ts` `register()` runs once per server instance, before any request. On a Vercel deployment, if the flag is `0`, it deletes it and logs one line.
- A local run is left untouched.
- Proven in Node: with the flag at `0`, a self-signed server is accepted. After `delete`, the same process refuses it (`DEPTH_ZERO_SELF_SIGNED_CERT`).
- Proven in a `next build` + `next start` with `VERCEL=1`: the line is logged before Ready, and Node's TLS warning never appears.

The Vercel variable itself should still be deleted (Tom, in the dashboard). The guard keeps a deployment safe either way.

## Manifest

manifest:
  - docs/portal-os/tranches/199-tls-verification-guard.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/instrumentation.ts
  - tests/unit/instrumentation-tls.test.ts

## Gates

- Red-first unit test 2/2: the guard removes the flag on a deployment and leaves a local run alone.
- vitest, typecheck, lint, build.
- After deploy:
  - no Node TLS warning in the runtime logs;
  - the guard's line is present;
  - API routes answer as before.

## Rollback

Revert the merge commit.

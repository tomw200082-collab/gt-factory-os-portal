# Tranche 038: login — split-panel hero (design-system handoff)

status: in-progress
created: 2026-05-30
activated: 2026-05-30
scorecard_target_category: ux_polish
expected_delta: +1 ux_polish
sizing: S

## Why this tranche
The GT Factory OS Design System handoff bundle (claude.ai/design, "Operational
Precision") ships a premium **split-panel** sign-in: a dark brand-hero panel on
the left (petrol-teal glow, product promise, three capability ticks) beside the
sign-in form on the right. The live `/login` today is a single centred card —
functionally complete (magic-link, password mode, resend cooldown, gmail
deep-link, dev-shim, callback-error explainer) but visually plain next to the
rest of the portal.

This tranche brings the production login up to the design language **without
touching one line of auth logic**. The entire change is the outer page shell:
the existing card + footer move into the right column of a two-column layout,
and a new presentational hero panel is added to the left. On small screens the
hero collapses and the form renders exactly as it does today.

## Non-negotiable: zero logic change
Everything that makes login *work* lives inside the `<div className="card">`
and the form/handlers above it — and is moved **verbatim**:

- All Supabase calls (`signInWithOtp`, `signInWithPassword`), the two clients,
  `sendMagicLink`, every handler.
- All state (`mode`, `status`, `email`, `password`, `cooldownRemaining`, …).
- All **16 `data-testid`s** (`login-submit`, `login-email-input`,
  `login-sent-state`, `login-resend`, `login-switch-to-password`, …) — preserved
  exactly so the middleware / role-switch / mobile-input-zoom specs and any
  selector keep matching.
- The `explainCallbackError` copy, the resend cooldown timer, the gmail
  deep-link, the dev-shim branch, the `Suspense` boundary.
- Brand mark asset (`/brand/logo.png`) and the `invert dark:invert-0` flip.

Only **markup wrappers + Tailwind token classes** change. No new styling system
(Tailwind + shadcn tokens only). No backend, no contract, no proxy.

## Scope
- `src/app/(auth)/login/page.tsx` — wrap the existing magic-link card in a
  two-column shell; add a left presentational `LoginHero` (brand, promise,
  capability ticks, "Window 2 · Portal" footer). Hero is `hidden lg:flex` so the
  mobile experience is byte-for-byte the current centred card. Dev-shim and
  skeleton states unchanged.

## Manifest (files that may be touched)
manifest:
  - src/app/(auth)/login/page.tsx
  - docs/portal-os/tranches/038-login-split-panel-design.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Revive directives (if any)
revive: []

## Out-of-scope
- Any change to auth logic, Supabase clients, handlers, or state.
- Any `data-testid` rename / removal.
- The dashboard, inbox, stock, planning, PO, admin surfaces (the design bundle
  recreates them too, but production already meets or exceeds those — separate
  evaluation, not this tranche).
- Token / globals.css changes — this tranche styles only with existing tokens.

## Tests / verification
- `tsc --noEmit` clean.
- full `vitest run` green (no login unit spec exists; the page is exercised via
  middleware + e2e — all must stay green).
- `next build` clean.
- `playwright test --grep @mocked` green (dev-shim login path).

## Exit evidence
- one combined verification run (typecheck + vitest + build) pasted on the PR.

## Rollback
Revert the PR; the change is a pure presentational re-wrap of one page plus this
manifest. No data, no schema, no logic.

## Operator approval
- [x] Tom approved in-session (conditional: "approve as long as no existing
  logic is harmed in any way"). This tranche is presentation-only by construction.

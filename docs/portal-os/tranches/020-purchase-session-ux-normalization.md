# Tranche 020: purchase-session-ux-normalization

status: landed-pending-review
created: 2026-05-23
landed: 2026-05-23
scorecard_target_category: data_truthfulness, flow_continuity
expected_delta: +0 (already-strong surface; brings into compliance with locked standard)
sizing: M (1 page rewrite + 2 new local components + 1 e2e spec + audit-doc update)

## Why this tranche
`/planning/purchase-session` shipped 2026-05-16 in full Hebrew under a code-comment-only "planning corridor convention." This conflicts with the locked English-only portal UX standard (`docs/portal_ux_standard.md` §1, 2026-04-30), and the pre-existing planning-corridor normalization plan (`docs/portal_language_direction_audit.md` Phase 2) already schedules every active planning surface for HE→EN normalization. No CLAUDE.md exception covers this surface (the only documented Hebrew exception is the Recipe-Readiness corridor).

This tranche normalizes the surface to the locked standard. Authorized under W2 Mode B-Planning-Corridor per `EXECUTION_POLICY.md` (which explicitly lists "English-only, LTR-only normalization" as allowed). Tom approved scope on 2026-05-23 after reading `TEST-GT-START/docs/ruflo/41_PORTAL_UX_UI_EXPERIMENT_PROPOSAL.md`.

## Scope
1. Replace all Hebrew UI copy with English per the standard term lexicon (`docs/portal_ux_standard.md` §1).
2. Replace `TIER_LABEL` and `STATUS_LABEL` maps with English.
3. Rename the primary placement CTA from "סמן כבוצע" to **"Place Order"** (lexicon-aligned).
4. Replace inline `LoadingState` with a tier-shaped skeleton (`TierCardSkeleton`).
5. Replace the single resolved/total progress bar with a 3-segment stacked breakdown (`ProgressBreakdown`: placed / skipped / pending).
6. Add a session-complete `InfoBanner` rendered when `pending === 0`.
7. Wrap the Hebrew order-document `<pre>` in an LTR `<section>` with an English caption + RTL `<article lang="he">` so the bidi context is semantically explicit.
8. Replace Hebrew error strings in `_lib/api.ts` with English.
9. Add Playwright spec `tests/e2e/purchase-session.spec.ts` covering English chrome, empty state, and order-document semantics.
10. Update `docs/portal_language_direction_audit.md` — add `/planning/purchase-session` as `NORMALIZED 2026-05-23`.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/purchase-session/page.tsx
  - src/app/(planning)/planning/purchase-session/_lib/api.ts
  - src/app/(planning)/planning/purchase-session/_components/TierCardSkeleton.tsx
  - src/app/(planning)/planning/purchase-session/_components/ProgressBreakdown.tsx
  - tests/e2e/purchase-session.spec.ts
  - docs/portal_language_direction_audit.md
  - docs/portal-os/tranches/020-purchase-session-ux-normalization.md
  - docs/portal-os/tranches/_active.txt

## Revive directives (if any)
revive: []

## Out-of-scope (next tranches)
- `/planning/purchase-calendar` — sister surface; same Hebrew issue; fast-follow.
- `blocking_issues` per-item rendering — needs a backend contract for the issue shape; UI-only tranche keeps count-only summary.
- "Skip with reason" mandatory field — product decision needed on whether to require `skip_reason`.
- Date pagination / jump-to-today on `purchase-calendar`.

## Acceptance
- `pnpm typecheck` clean.
- `pnpm build` clean.
- `pnpm lint` clean (no new violations on touched files).
- Hebrew character grep on touched files returns only:
  - Comments that historically reference Hebrew (intentionally removed where present).
  - The page caption note that the order-document body is generated in Hebrew (English text describing it).
  - The Hebrew article inside `<article lang="he">` for the order document body (runtime data, not source code strings).
- Playwright `tests/e2e/purchase-session.spec.ts` passes (or yields the documented empty-state response per A13 convention) at least one terminal state.
- `docs/portal_language_direction_audit.md` updated.

## Authority chain
- `EXECUTION_POLICY.md` Mode B-Planning-Corridor (active).
- `docs/portal_ux_standard.md` §1 — locked English-only, 2026-04-30.
- `docs/portal_language_direction_audit.md` Phase 2 — planning-corridor HE→EN normalization plan.
- `TEST-GT-START/docs/ruflo/40_PORTAL_UX_UI_IMPROVEMENT_AUDIT.md` (audit, 2026-05-23).
- `TEST-GT-START/docs/ruflo/41_PORTAL_UX_UI_EXPERIMENT_PROPOSAL.md` (proposal, 2026-05-23).

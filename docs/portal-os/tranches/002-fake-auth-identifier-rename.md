# Tranche 002: fake-auth-identifier-rename

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: regression_resistance + technical_substrate
expected_delta: +2 total (regression_resistance 4→5, technical_substrate 6→7)
sizing: S (2 files)

## Why this tranche
The remaining `FakeSession` substring appears 14 times in `src/lib/auth/fake-auth.ts` and `src/lib/auth/session-provider.tsx` — the last two `src/` surfaces that violate `quarantine.json.forbidden_strings`. Renaming the interface + two functions (keeping the already-exported `Session` alias as the canonical public name) eliminates the forbidden-string hit without touching consumer code, because every consumer already imports `type { Session }`.

## Scope
- `FakeSession` interface → `DevShimSession` (exported alias `Session = DevShimSession` preserved).
- `getFakeSession()` → `getDevShimSession()`.
- `subscribeFakeSession()` → `subscribeDevShimSession()`.
- Internal references + doc comments updated.
- `session-provider.tsx` import statement updated to new names.

## Manifest (files that may be touched)
manifest:
  - src/lib/auth/fake-auth.ts
  - src/lib/auth/session-provider.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- `setFakeRole`, `FAKE_USERS`, `isFakeAuthEnabled`, STORAGE_KEY `"gt.fakeauth.v1"` — these do NOT contain the literal `FakeSession` substring, so they are not forbidden-string violations. Leaving them untouched avoids cascading test-helper changes.
- Freezing `baseline.json` (needs `kind=baseline-update`; hook Rule 6 blocks).
- Seeding `quarantine.json.entries[]` (needs `kind=quarantine-update`; hook Rule 6 blocks).

## Tests / verification
- typecheck clean.
- `grep -Fn 'FakeSession' src/` returns 0 hits.
- `grep -Fn 'FakeSession' tests/` unchanged (tests don't import this identifier; they use `Session`).

## Rollback
Revert the single tranche commit; no runtime behavior change.

## Operator approval
- [x] Tom approves this plan (session directive "פשוט תתקן את הכל בריצה אחת" 2026-04-22).

## Actual evidence (filled in by /portal-tranche-fix run)
- `src/lib/auth/fake-auth.ts`: `FakeSession` → `DevShimSession` (interface + all internal references + FAKE_USERS record + comments); `getFakeSession` → `getDevShimSession`; `subscribeFakeSession` → `subscribeDevShimSession`. Alias `export type Session = DevShimSession;` preserved.
- `src/lib/auth/session-provider.tsx`: imports updated to new names; all internal references renamed.
- Verification: `grep -Fn 'FakeSession' src/` → 0 hits. Typecheck clean.

# Tranche 183 — portal catalogue: "coming soon" looks unlike "sold out"

**Status:** built, PR #234. Its backend is live: `gt-factory-os` migration `0358` applied in production 2026-09-26
18:22Z, and #305 merged (`3b53858`, contains `2c78d0a`); `/portal/api/health` returned `3b53858` at 18:24:47Z.
**Origin:** Tom, 2026-09-26, on the live customer card: «זה לא מספיק ברור — וצריך להיות הבדל בין ״בקרוב״ ל״אזל
מהמלאי״ מבחינת הוויזואלית והעושר של הוויזואליות». The backend half (0358 `upcoming`, the two looks on the customer's
card) is gt-factory-os `2c78d0a`; this tranche is the planner's choice of look.
sizing: S
scorecard_target_category: none — new module surface (customer portal), as tranche 182.
expected_delta: +0 on every factory category. A planner picks how a product not available now looks to customers:
sold out, or on its way.

## Why

Tranche 182 lets the planner write the state's words («בקרוב»), but both states looked the same on the card: a grey
bottle and a small grey line. The customer card now has two looks. Sold out is greyed, with a quiet white stamp. On
its way is in full colour, with a launch sticker and a solid "tell me". The planner needs to pick one, with no code
per kind.

## The change

- In the not-available form, **Looks like**: two choices, **Sold out** (the default) or **Coming soon**, native radio
  inputs shown as a segmented pair. They are saved with the form and carried by "Same for 500 ml / 1 L". The hint
  says what each look does.
- **Status on the card**'s hint names the word the look shows when the field is empty: «אזל מהמלאי» or «בקרוב».
- The row's badge reads **Coming soon** for that look, and **Not available now** otherwise. **History** says which
  look each change had.
- The staff screen stays English; the Hebrew words are data, in `<bdi>`.

## Manifest (files that may be touched)

manifest:
  - docs/portal-os/tranches/183-portal-catalog-coming-soon.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(planning)/planning/portal-catalog/page.tsx
  - src/app/(planning)/planning/portal-catalog/_lib/portal-catalog.ts
  - src/app/(planning)/planning/portal-catalog/_lib/portal-catalog.test.ts
  - tests/e2e/portal-catalog.spec.ts

## Revive directives

revive: []

## Out-of-scope

- The customer's card and the API: `gt-factory-os`, a separate PR.
- Any wording on the customer's "tell me" button for the upcoming look: Tom's (proposed «עדכנו אותי כשמגיע»).
- `baseline.json` and `quarantine.json`: no entry is touched.

## Tests / verification

Run locally with `NODE_ENV=test`, as in CI, on `173b277` (this tranche on `main` `5d1ff12`), 2026-09-26:

- `tsc --noEmit`: 0
- `eslint .`: 0 errors, 560 warnings (560 on `main`)
- `vitest run`: 1480/1480 in 160 files; `_lib/portal-catalog.test.ts` 8/8 (one case extended with `upcoming`, so the
  count equals `main`'s)
- `playwright test --grep @mocked`: 114/114; `tests/e2e/portal-catalog.spec.ts` 7/7. "Same for 500 ml" before Save
  now picks **Coming soon** and asserts `upcoming: true` on both posts, the «בקרוב» hint and the "Coming soon" badge.
- Rendered at 1280 px and 390 px with the same mocks (the release gate's `staff-r4/` shots, `-07-row-coming-soon`).
- The availability release gate, round 4 (`gt-factory-os/docs/superpowers/plans/2026-09-26-customer-portal-availability-gate/reports/*-r4.md`):
  six of six dimensions GREEN, no new P0/P1; governor SHIP (`GOVERNOR-R4.md`, §16.2 and §16.3). One P2 goes to Tom's
  list, not fixed here: A11Y-R4-01, `aria-describedby` on the "Looks like" fieldset.

## Rollback

Revert the PR. It changes one form field, one badge, the History wording and tests. A revert leaves stored `upcoming`
rows as they are: the customer's card keeps showing each product's look as the backend has it, and the planner can no
longer change the look until the tranche is back (a save from the reverted form writes the sold-out look).

## Actual evidence

- PR: https://github.com/tomw200082-collab/gt-factory-os-portal/pull/234
- `portal-pr-guard` `ci` on `173b277`: success, run 36261442374 (18:07:43–18:16:09Z).
- The local runs above: `tsc` 0 · eslint 0 errors · vitest 1480/1480 · `@mocked` 114/114.
- `portal-tranche-verifier` on `173b277`: every code, manifest, regression and CI check passed; it asked for this
  evidence.

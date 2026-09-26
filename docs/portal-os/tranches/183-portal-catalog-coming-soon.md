# Tranche 183 — portal catalogue: "coming soon" looks unlike "sold out"

**Status:** built, draft PR. Merges after `gt-factory-os` migration `0358` is applied and its API change is live.
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

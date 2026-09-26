# Tranche 184 — portal catalogue: a product on its way is never "back" in the planner's words

**Status:** built, PR #235. The customer page's half is live: `gt-factory-os` #307 merged (`d404e2d`), and
`/portal/api/health` returned `d404e2d` at 20:45:36Z. Neither half depends on the other.
**Origin:** Tom, 2026-09-26, on the live «בקרוב» card: «זה יפה אבל כתוב עדיין לגבי חוזר וזה לא חוזר למלאי- זה משהו
אחר. תתאים את זה כך שזה יהיה ברור ממש ללקוח וחוויית ux מושלמת.»
sizing: S
scorecard_target_category: none — new module surface (customer portal), as tranche 182.
expected_delta: +0 on every factory category. What a planner sends or picks for a customer is true for a product
coming back and for one arriving for the first time.

## Why

A customer who tapped "tell me" on a product on its way (tranche 183's Coming soon look) is told, when it arrives, the
approved text «היי 🙂 {product} חזר למלאי ואפשר להזמין שוב בפורטל.»: "back in stock, order again". A product that
never sold is neither back nor ordered again.

## The change

- `RESTOCK_TEXT` becomes «היי 🙂 {product} כבר כאן, ואפשר להזמין בפורטל.» ("{product} is here, and you can order it in
  the portal"). It is true for both looks, and it takes no gender or number from the product's name. One text, no
  branch: the look is cleared when the product is marked available, which is when a planner sends it.
- The three one-tap messages follow the look (COPY-A04, round 5): Sold out keeps «חוזר בשבוע הבא», «בייצור, חוזר
  בקרוב», «בדרך מהספק, חוזר בקרוב»; Coming soon offers «מגיע בשבוע הבא», «בייצור, מגיע בקרוב», «בדרך מהספק, מגיע
  בקרוב». Changing the look carries a chosen chip into the new look's words (`withLook`); the planner's own words stay.
- The unit tests and the `@mocked` spec assert the new text and the chips.

## Manifest (files that may be touched)

manifest:
  - docs/portal-os/tranches/184-portal-catalog-restock-text.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(planning)/planning/portal-catalog/page.tsx
  - src/app/(planning)/planning/portal-catalog/_lib/portal-catalog.ts
  - src/app/(planning)/planning/portal-catalog/_lib/portal-catalog.test.ts
  - tests/e2e/portal-catalog.spec.ts

## Revive directives

revive: []

## Out-of-scope

- The customer card's "tell me" words and cart messages: `gt-factory-os`, the same branch.
- `baseline.json` and `quarantine.json`: no entry is touched.

## Tests / verification

Run locally with `NODE_ENV=test`, as in CI, on `0132a62`, 2026-09-26:

- `tsc --noEmit`: 0
- `eslint` on the tranche's files: 0
- `_lib/portal-catalog.test.ts`: 9/9. The new case checks that a change of look carries a chip into the new look's
  words in both directions, that the planner's own words and a null stay as written, and that no Coming soon chip
  says «חוזר» or runs past `NOTE_MAX`.
- `tests/e2e/portal-catalog.spec.ts`: 7/7. "Same for" after **Coming soon** posts `return_note: "בייצור, מגיע בקרוב"`;
  the waiting list's WhatsApp link carries «היי 🙂 CALM 1000ml כבר כאן, ואפשר להזמין בפורטל.».
- The availability release gate, round 5 (`gt-factory-os/docs/superpowers/plans/2026-09-26-customer-portal-availability-gate/reports/COPY-r5.md`):
  COPY first read AMBER on COPY-A04 (the «חוזר» chips on a coming-soon product), fixed in `0132a62`, then GREEN. The
  governor re-affirmed on `0132a62` (`GOVERNOR-R5b.md`, §16.5).

## Rollback

Revert the PR. It changes one constant, the chip list, the look radio's handler and tests. A revert brings back the
«חוזר» chips and WhatsApp text; every stored row stays as written.

## Actual evidence

- PR: https://github.com/tomw200082-collab/gt-factory-os-portal/pull/235
- `portal-pr-guard` `ci` on `0132a62`: success, run 36270405434 (20:41:46–20:47:21Z).
- The local runs above: `tsc` 0 · eslint 0 · unit 9/9 · spec 7/7.

# Tranche 184 — portal catalogue: a product on its way is never "back" in the planner's words

**Status:** built, draft PR. The customer page's half ships in `gt-factory-os` on the same branch; neither depends on
the other.
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

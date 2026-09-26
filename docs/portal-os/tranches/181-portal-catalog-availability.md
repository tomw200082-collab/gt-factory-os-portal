# Tranche 181 — portal catalogue: what customers can order, set by a planner

**Status:** built, draft PR. Merges after `gt-factory-os` migration `0357` is applied and its API PR is live (the
masterprompt's W6 order: migration → API → this screen). Planned as 180 (the masterprompt's D9 and D12 name it so);
renumbered 181 on 2026-09-26 when #232 took 180 on `main`.
**Origin:** `gt-factory-os/docs/superpowers/plans/2026-09-26-customer-portal-availability-masterprompt.md`, W4,
with Tom's brainstorm answers of 2026-09-26 in its §1.1. The staff half of the availability switch; the API, the
table and the customer's card are in `gt-factory-os`.
sizing: M
scorecard_target_category: none — new module surface (customer portal) outside the 10-category factory rubric (the
Tranche 162 precedent).
expected_delta: +0 on every factory category. A planner or admin can mark any portal product not available now, say
when it is expected back and what to offer instead, and work the list of customers who asked to be told, without SQL,
a deploy or Tom.

## Why

Tom, 2026-09-26: a smart but simple way to mark products unavailable, fast, planner and up; products stay shown to
customers with a short explanation and an expected return date. Until now every sellable product was orderable,
always: nothing but a code change could take one off the customer's portal.

## The change

New planning page `/planning/portal-catalog`, English. Product names are Shopify's (`title` + `variant_title`, e.g.
`DETOX 1000ml`); customers see the portal page's own names. Every SKU of the customer portal's catalogue (40), grouped
as the customer page groups them: teas by flavour with both sizes, then matcha and powders, fruit purées,
accessories. Each row:

- the product, its SKU, and **On hand** from stock truth: a read-only hint, shown as returned (negative included) or
  "—" when the SKU is not mapped. It never changes anything.
- **Available / Not available now**, a switch that posts at once. Customers see it on their next page load. Marked
  available, the outage's date, message, alternative and note end with it (the API stores none), so the next outage
  starts clean and never re-publishes an old line.
- while not available: **Expected back** (a date), **Message to customers** (one line, at most 25 characters, with three
  preset chips that fill it: `חוזר בשבוע הבא` · `בייצור, חוזר בקרוב` · `בדרך מהספק, חוזר בקרוב`), **Suggest instead**
  (any other catalogue product, none by default; nothing is suggested automatically) and an **Internal note**, saved
  together with **Save**. A date that has passed is marked "Expected date passed"; customers no longer see it.
- on tea rows, **Same for 500 ml** / **Same for 1 L**: the form as it stands applied to the other size, saved on
  this row first when it has unsaved changes (one or two posts; never pointing the other size at itself).
- "Changed by … · when", and "Not available for N days".
- **Waiting: N**, the customers who tapped "tell me when it is back". Planners and admins expand it: each customer's
  name, branch and phone, a WhatsApp link with the approved text typed
  (`היי 🙂 {product} חזר למלאי ואפשר להזמין שוב בפורטל.`, gate record §5.4 U-11) that a person sends, and **Mark
  notified**. Nothing on this page messages anyone. Operators and viewers see the count only.
- **History**, every change for the SKU, newest first (a native `<details>`).
- A refused change is said on its row in plain words: never a status code or the API's own field names.

A product that is available again while customers are still waiting moves to a **Back in stock — customers waiting**
section at the top until every request is marked notified.

One route handler per backend route, each a plain `proxyRequest` forward:

| Portal route | Upstream |
|---|---|
| `GET /api/portal/catalog` | `GET /api/v1/queries/portal/catalog` |
| `POST /api/portal/catalog/[sku]` | `POST /api/v1/mutations/portal/catalog/:sku` |
| `GET /api/portal/catalog/[sku]/requests` | `GET /api/v1/queries/portal/catalog/:sku/requests` |
| `POST /api/portal/catalog/[sku]/requests/[id]/notified` | `POST /api/v1/mutations/portal/catalog/:sku/requests/:id/notified` |

**Who can open it.** `(planning)/layout.tsx` gates at `planning:read` (operator, planner, admin, viewer). Every control
is disabled without `planning:execute` (operator and viewer hold `planning: "read"`), and the Waiting list does not
expand for them. The API is the real guard: the list answers the four factory roles, every change and the Waiting list
answer planner and admin only (403 otherwise).

**Where it is listed.** One Planning-group row in `src/lib/nav/manifest.ts` ("Portal catalogue", `min_role:
"planner"`, `planning:execute`), one row in `docs/portal-os/route-manifest.json`.

## Manifest (files that may be touched)

manifest:
  - docs/portal-os/tranches/181-portal-catalog-availability.md
  - docs/portal-os/tranches/179-portal-registrations.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - docs/portal-os/route-manifest.json
  - src/app/(planning)/planning/portal-catalog/page.tsx
  - src/app/(planning)/planning/portal-catalog/_lib/portal-catalog.ts
  - src/app/(planning)/planning/portal-catalog/_lib/portal-catalog.test.ts
  - src/app/api/portal/catalog/route.ts
  - src/app/api/portal/catalog/[sku]/route.ts
  - src/app/api/portal/catalog/[sku]/requests/route.ts
  - src/app/api/portal/catalog/[sku]/requests/[id]/notified/route.ts
  - src/lib/nav/manifest.ts
  - tests/e2e/portal-catalog.spec.ts

## Revive directives

revive: []

## Out-of-scope

- The backend routes, the `customer_portal` tables and the customer's card: `gt-factory-os`, a separate PR.
- Any automatic message to a customer, any date suggested from the production plan (Tom, 2026-09-26), any automatic
  alternative (the sibling size included): a person chooses and sends.
- Shopify: availability here never touches Shopify or stock truth.
- `baseline.json` and `quarantine.json`: no entry is touched.

## Tests / verification

Run locally with `NODE_ENV=test`, as in CI (this container sets `NODE_ENV=production`, which loads React's
production build and fails every `act()`-based vitest suite on `main` too), on `86a94d2`, 2026-09-26 16:22–16:31Z:

- `tsc --noEmit`: 0
- `eslint .`: 0 errors, 560 warnings (560 on `main`)
- `vitest run`: 1470/1470 in 159 files (1462 on `main` at `07bbbe5`; the 8 new cover `_lib/portal-catalog.ts`)
- `playwright test --grep @mocked`: 114/114, 7 of them new in `tests/e2e/portal-catalog.spec.ts`:
  - one row per catalogue SKU, grouped, with the on-hand hint;
  - a flip posts the whole row, and Save posts the date, a preset message and the alternative;
  - "Same for 500 ml" writes the other size and never points it at itself;
  - before Save, "Same for 500 ml" saves the form here first;
  - a passed date is marked;
  - an operator sees every control disabled and the waiting count only;
  - the waiting list carries the approved WhatsApp text and names each control for its customer, and Mark notified drops
    the count.
- Rendered at 1280 px and 390 px with the same mocks (the release gate's `staff/` shots): no horizontal scroll.
- The availability release gate, `gt-factory-os/docs/superpowers/plans/2026-09-26-customer-portal-availability-gate.md`:
  six dimensions GREEN after round 2. This screen's round-1 P1s (FLOW-A01, INTER-A-04, COPY-A01, COPY-A02, A11Y-A-02)
  are fixed in `86a94d2`.
- Merge only after `gt-factory-os` migration `0357` is applied and its API PR (#302) is live.

## Rollback

Revert the PR. It only adds a page, four proxies, one nav row and docs. A revert leaves every product as last set: one
marked not available stays so for customers until an available row is written through the API (planner or admin).

## Actual evidence

- PR: https://github.com/tomw200082-collab/gt-factory-os-portal/pull/231
- `portal-pr-guard` `ci` on `86a94d2`: success, run 36255345522 (16:24:36–16:32:26Z). It runs eslint, `tsc`, vitest,
  Playwright `@mocked` and the registry-presence check.
- The local runs above: `tsc` 0 · eslint 0 errors · vitest 1470/1470 · `@mocked` 114/114.
- `main` merged in `b9ac571`: #232 took 180, so this tranche is 181.

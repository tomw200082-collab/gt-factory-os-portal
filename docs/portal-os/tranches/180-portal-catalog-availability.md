# Tranche 180 — portal catalogue: what customers can order, set by a planner

**Status:** built, draft PR. Merges after `gt-factory-os` migration `0357` is applied and its API PR is live (the
masterprompt's W6 order: migration → API → this screen).
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
- **Available / Not available now**, a switch that posts at once. Customers see it on their next page load.
- while not available: **Expected back** (a date), **Message to customers** (one line, at most 25 characters, with three
  preset chips that fill it: `חוזר בשבוע הבא` · `בייצור, חוזר בקרוב` · `בדרך מהספק, חוזר בקרוב`), **Suggest instead**
  (any other catalogue product, none by default; nothing is suggested automatically) and an **Internal note**, saved
  together with **Save**. A date that has passed is marked "Expected date passed"; customers no longer see it.
- on tea rows, **Same for 500 ml** / **Same for 1 L**: the row's whole state applied to the other size (one post).
- "Changed by … · when", and "Not available for N days".
- **Waiting: N**, the customers who tapped "tell me when it is back". Planners and admins expand it: each customer's
  name, branch and phone, a WhatsApp link with the approved text typed
  (`היי 🙂 {product} חזר למלאי ואפשר להזמין שוב בפורטל.`, gate record §5.4 U-11) that a person sends, and **Mark
  notified**. Nothing on this page messages anyone. Operators and viewers see the count only.
- **History**, every change for the SKU, newest first (a native `<details>`).

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
  - docs/portal-os/tranches/180-portal-catalog-availability.md
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

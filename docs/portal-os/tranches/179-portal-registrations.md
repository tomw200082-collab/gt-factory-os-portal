# Tranche 179 — portal registrations: the staff screen

**Status:** built, not merged. **Awaiting Tom's written D1 approval of the customer-portal module. Do not merge.**
**Origin:** the customer-portal overnight masterprompt, W5 (`gt-factory-os/docs/superpowers/plans/2026-09-24-customer-portal-overnight-masterprompt.md`),
built to its r2 staff-route contract. The staff half of the customer ordering portal; the API it calls is being built
in parallel in `gt-factory-os`.
sizing: M
scorecard_target_category: none — new module surface (customer portal) outside the 10-category factory rubric.
expected_delta: +0 on every factory category. An admin can approve a customer's portal access request by linking it to
its Shopify customer, hand an approved customer a login link, and revoke access, without SQL.

## Why

An unknown phone that asks to log in to the ordering portal gets a registration form. Each request waits
for a person at GT to say which Shopify customer (branch) it belongs to. Until now there is no screen for that.
Separately, an approved customer needs a way in while WhatsApp sending is broken: a login link a person
sends by hand. And access that was given has to be withdrawable from the same place.

## The change

New admin page `/admin/portal-registrations`, English, two tabs:

- **Pending** — every pending registration: phone, business name, branch/city, contact name, the suggested
  Shopify customer and when it was requested, oldest first. Each row has its own customer search, scoped to that
  registration (`registration_id`): each result shows name · city · order count and whether the registration's
  phone is on that customer's Shopify record (*Phone matches* / *Phone does not match*; a mismatch is neutral, many
  records carry no phone). A pick, then **Approve** (sends the picked `shopify_customer_id`) or **Reject**, each
  behind a confirm; the approve confirm repeats the phone match. After an approval the row keeps its place and
  offers **Send approval on WhatsApp**, a link that opens the returned `wa_link` in a new tab. A person presses
  send; nothing here messages a customer. 404 / 409 / 422 answers are explained in plain words on the row.
- **Login link** — search approved customers (`customer_portal.access` rows that are not revoked, keyed by
  `access_id`). **Create login link** shows the returned `url` with **Copy** and **Open WhatsApp** (the returned
  `wa_link`, new tab). **Revoke access** asks first, posts, then refreshes the list; a status line names who was
  revoked, since the row leaves the list.

Both tabs stay mounted while switching, so a typed search or a created link is not lost.

One route handler per backend route, each a plain `proxyRequest` forward like every other handler:

| Portal route | Upstream |
|---|---|
| `GET /api/portal/registrations` | `GET /api/v1/queries/portal/registrations` (query forwarded: `?status=pending`) |
| `GET /api/portal/customer-search` | `GET /api/v1/queries/portal/customer-search` (`?q=&registration_id=`) |
| `POST /api/portal/registrations/[id]/decide` | `POST /api/v1/mutations/portal/registrations/:id/decide` |
| `GET /api/portal/approved` | `GET /api/v1/queries/portal/approved` (`?q=`) |
| `POST /api/portal/login-link` | `POST /api/v1/mutations/portal/login-link` (`{access_id}`) |
| `POST /api/portal/access/[id]/revoke` | `POST /api/v1/mutations/portal/access/:id/revoke` (`{}`) |

**Who can open it.** `(admin)/layout.tsx` wraps every `/admin/*` page in `<RoleGate minimum="admin:execute">`, and
only `admin` holds `admin:execute` in `ROLE_CAPABILITY_LATTICE` (`src/lib/auth/authorize.ts`). The middleware
`/admin` row (admin only) covers the URL for the day the role reaches the JWT. Upstream, every one of the six
routes answers 401 without a session and 403 to a non-admin. The page adds no gate of its own.

**Where it is listed.** One Admin-group row in `src/lib/nav/manifest.ts` ("Portal registrations"), one row in
`docs/portal-os/route-manifest.json`.

The response shapes are the backend contract as dispatched with this tranche; they live in
`_lib/portal-registrations.ts`, next to the pure helpers the page uses (error wording per action, the Shopify
customer number, the order-count label, the date format), which are unit-tested.

## Manifest (files that may be touched)

manifest:
  - docs/portal-os/tranches/179-portal-registrations.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - docs/portal-os/route-manifest.json
  - src/app/(admin)/admin/portal-registrations/page.tsx
  - src/app/(admin)/admin/portal-registrations/_lib/portal-registrations.ts
  - src/app/(admin)/admin/portal-registrations/_lib/portal-registrations.test.ts
  - src/app/api/portal/registrations/route.ts
  - src/app/api/portal/registrations/[id]/decide/route.ts
  - src/app/api/portal/customer-search/route.ts
  - src/app/api/portal/approved/route.ts
  - src/app/api/portal/login-link/route.ts
  - src/app/api/portal/access/[id]/revoke/route.ts
  - src/lib/nav/manifest.ts
  - tests/e2e/portal-registrations.spec.ts

## Revive directives

revive: []

## Out-of-scope

- The backend routes, the `customer_portal` schema and the launch flag: `gt-factory-os`, a separate PR.
- Sending anything to a customer. Both WhatsApp buttons are links a person follows and sends from.
- `baseline.json` and `quarantine.json`: no entry is touched.

## Tests / verification

Run locally with `NODE_ENV` unset, as in CI (this container sets `NODE_ENV=production`, which loads React's
production build and fails every `act()`-based vitest suite on `main` too).

- `tsc --noEmit`: 0
- `eslint .`: 0 errors, 560 warnings (560 on `main`)
- `vitest run`: 1459/1459 (1443/1443 on `main`; the 16 new cover `_lib/portal-registrations.ts`)
- `playwright test --grep @mocked`: 107/107, 5 of them new in `tests/e2e/portal-registrations.spec.ts` — the pending
  list renders oldest first; the search sends `registration_id`, results show the phone match, and pick + approve
  sends the picked id and shows the WhatsApp link; a 409 is explained on the row; the login-link tab creates a link
  by `access_id` and shows the URL; revoke asks first (cancel sends nothing), posts `{}` as JSON, refreshes the list
- `next build`: succeeds; `/admin/portal-registrations` and the six `/api/portal/*` handlers are in the route table
- Rendered at 1280px and 390px with the same mocks: no horizontal scroll
- Merge only after Tom's written D1 approval and after the backend routes are live.

## Rollback

Revert the PR. It only adds a page, six proxies, one nav row and docs.

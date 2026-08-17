# Product

<!-- impeccable:product-schema 1 -->

> **Source of these facts.** Written 2026-08-17 from Tom's sales-workspace masterprompt
> (`gt-factory-os-production-brain/docs/plans/2026-08-17-sales-portal-ui-masterprompt.md`)
> and its two same-day addenda, which he pasted as written approval and which lock every
> product decision below. No fact here is inferred; each traces to that document or to the
> portal's own `CLAUDE.md`. This record covers the **GT Sales Workspace** surface; the
> factory portal that surrounds it is an incumbent system documented by its own tranches.

## Platform

web

## Users

**Primary user: Tom** — owner of GT Everyday, a small beverage-base factory in Israel
selling wholesale to HoReCa (cafés, restaurants, bars, hotel chains). He works the sales
motion himself, mostly **on his phone, between factory tasks**. His job on this surface is
not "manage a database" — it is *"tell me who to call right now, and let me record what
happened in one tap."*

**Second user, designed for but not built for yet:** an additional agent (Erik) joins
later. The queue is therefore computed per assignee from day one (`assignee = current
user OR unassigned`; admins see everything), so no rework is needed when he arrives. No
agent-management or permissions UI exists in v1.

Other portal roles (operator, planner, viewer/bookkeeper) do **not** use this surface.
Sales access is admin-only in v1.

## Product Purpose

Make GT's inbound-lead motion repeatable and honest.

188 real leads sit in the database. **99 of them arrived after the old intake pipeline
died on 2026-06-07 and were never seen by a human.** One of those is a churned customer
(ליוניל יזמות / פטיו) who re-filled the lead form and got silence. The workspace exists so
that never happens again.

Success, stated once: Tom logs in on his phone, picks "מכירות", and lands on a **Today
queue** that tells him exactly what to do now — call these two new leads, follow up on
these three, one returning customer needs attention. Every call ends with a one-tap
outcome that schedules the next touch. A CRM fails as a database you visit; it succeeds as
a queue that tells you what to do.

## Positioning

A workflow-first queue, not a record store. Three things a neighboring CRM could not
truthfully copy here:

- **Winning is proven, never clicked.** `status='won'` requires a Shopify order reference
  at the database level. There is no "won" button anywhere, ever — the UI shows conversion
  as evidence with the order ref.
- **A queue item clears only by a captured outcome.** No "handled, roughly." Every
  recorded outcome writes its events *and* a next-touch date in one transaction, so an
  open lead without a next touch cannot exist after any touch.
- **It sits inside the factory system**, one login away from stock, orders and production
  truth — so a lead that becomes a customer is not a second universe.

## Operating Context

- **Phone-first, one-handed, mid-task.** Desktop is the secondary case.
- Hebrew, RTL, throughout. Calls go out via `tel:`, messages via `wa.me` with pre-filled
  templates. The user leaves the app to act and returns to record what happened — the
  outcome sheet is triggered by that return, not by a button.
- Lives inside the GT Factory OS portal (Next.js 15 App Router, Supabase auth): a
  post-login switchboard (`/apps`) splits **ייצור** from **מכירות**; the sales workspace is
  its own route group with its own chrome and its own scoped tokens. The factory surfaces
  are untouched by it.
- Installable as a PWA ("GT Sales", opens on the Today queue).

## Capabilities and Constraints

**Screens — four, no more.** `/sales/today` (the work queue; `/sales` redirects here),
`/sales/leads` (full table: status tabs, search, drawer), `/sales/orgs` (businesses:
account card + timeline), `/sales/settings` (minimal: WhatsApp templates + SLA hours —
reached from the header, not a bottom tab).

**The Today queue**, in display order: conversions (celebration) · returning customers
(highest urgency, visually distinct) · new leads (SLA clock) · due follow-ups. Empty state
is a designed "סיימת להיום ✓". A one-line stats strip, no charts.

**The outcome loop:** התקשר · וואטסאפ · דחה · אבוד on every actionable card. Returning to
the app after a call/WhatsApp raises one sheet with four large buttons — ענה, מתקדם /
לא ענה / וואטסאפ נשלח / אבוד (reason required).

**Terminology.** Schema values are `new` / `working` / `won` / `lost` and are never
translated in data; they display as חדש / בטיפול / הומר ✓ / אבוד. Events are append-only —
corrections are new events, never edits.

**SLA.** A badge shows before first touch only (green within the parameter, default 24h;
red past it) and disappears afterwards. A timer on everything is a timer on nothing.

**Hard constraints.**
- Nothing is ever sent to a lead or customer from this product. Outreach automation stays
  behind a frozen flag (`SALES_CUSTOMER_OUTREACH_WRITE_ENABLED`, `false`).
- Lead rows are personal data of people who are not customers: no names or phone numbers
  in commits, PR bodies, or uncropped screenshots; no exports in git.
- The surface never writes factory stock truth.
- Deliberately **not** built: reports/insights screen, agent management, permissions UI,
  call scripts, duplicate merge, bulk actions, import of the 560-customer base.

## Brand Commitments

- Name in-product: **GT Sales** (Hebrew UI label "מכירות"). Logo asset:
  `public/brand/logo.png`.
- **Take monday.com's structure, reject its identity.** Structure: a colored status pill as
  the row's visual anchor; dense grouped tables with sticky headers; a side panel over
  navigation; always-visible search; one strong accent for the single primary action per
  screen. Identity: no monday palette, no color-everywhere. **Color is reserved for status
  pills, SLA badges, and the one primary action — nothing else.**
- Typography: **Rubik** (chosen for its Hebrew), tabular numerals on every number and date.
- White surfaces, hairline borders, an 8px spacing grid, motion 150–200ms with intent.
- Quieter than the factory portal it lives beside, and unmistakably calmer than monday.

## Evidence on Hand

- **Real data, in production:** 188 leads, 186 businesses, dating 2023-06-18 → 2026-08-09
  (Supabase `sales_core`). 99 unseen since 2026-06-07. 39 old organic rows carry no phone
  or email (uncontactable history). 2 rows flagged as possible duplicates. 3 businesses
  matched to existing Shopify customers with a **dated** snapshot.
- Snapshots are dated facts and render as such ("נכון ל-<date>"). Where a snapshot is
  absent, the surface shows nothing — it must never invent a customer value, an order
  count, or a churn status.
- Design and decision record: the 2026-08-10 spec
  (`docs/superpowers/specs/2026-08-10-sales-leads-pipeline-design.md`) and the 2026-08-17
  masterprompt, both in the production-brain repo.
- No user research, no testimonials, no benchmarks exist for this surface. Future work must
  not fabricate them.

## Product Principles

1. **The queue is the product.** If a screen does not tell Tom what to do next, it is a
   database view and it has failed.
2. **Truth beats convenience.** Winning is proven by an order; a missing snapshot renders
   as absence, not as a guess; corrections are new events.
3. **One tap must close the loop.** Any interaction that ends without a recorded outcome
   and a next date is an unfinished interaction.
4. **Color carries meaning, never decoration.** Status and SLA only, plus one accent for
   the single primary action per screen.
5. **Phone-first, Hebrew-first.** Thumb reach, 44px targets, RTL logical properties — the
   desktop view is the adaptation, not the origin.

## Accessibility & Inclusion

- Hebrew RTL via `dir="rtl"` and CSS logical properties throughout; Latin fragments inside
  Hebrew are bidi-isolated.
- Touch targets ≥44px; the outcome sheet's four buttons are deliberately large (one-handed,
  mid-task, often standing in a factory).
- Designed empty, loading and error states on every surface, including a network-error
  state with retry.
- The portal's iOS 16px input-font floor applies (prevents focus zoom on phones).

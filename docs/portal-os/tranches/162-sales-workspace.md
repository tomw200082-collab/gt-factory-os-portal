# Tranche 162 — GT Sales Workspace: `/apps` switchboard + `(sales)` route group

status: landed (Phase B executed 2026-08-17; evidence below)
created: 2026-08-17
scorecard_target_category: none — new module surface outside the 10-category factory rubric.
expected_delta: +0 on every factory category. The factory scorecard must not regress; that IS the gate.
sizing: XL — authorized as a single tranche by Tom's 2026-08-17 masterprompt
  (`gt-factory-os-production-brain/docs/plans/2026-08-17-sales-portal-ui-masterprompt.md`),
  which he pasted as written approval. One tranche because the workspace ships as one
  coherent surface behind one route group; the plan splits it into ~20 independently
  verifiable TDD tasks.

## Why this tranche

The sales workspace (masterprompt §1): Tom logs in on his phone, picks "מכירות", and lands
on a Today queue that says exactly what to do now. 188 real leads are live in
`sales_core`; 99 arrived after the old intake died and were never seen. The portal side
does not exist at all. This tranche builds `/apps` + route group `(sales)` (Today queue +
one-tap outcome loop, Leads table + drawer, Orgs, quick-add, search, PWA, settings),
Hebrew-first RTL, admin-only.

Plan (authoritative for Phase B):
`gt-factory-os-production-brain/docs/superpowers/plans/2026-08-17-sales-workspace-implementation.md`

## Scope

- `/apps` post-login switchboard (ייצור / מכירות), cookie-remembered choice, admin-only sales card.
- `(sales)` route group: own layout (`dir="rtl"` `lang="he"` `data-app="sales"`), own chrome
  (mobile bottom tabs היום · לידים · עסקים, slim desktop sidebar, ⌘K), Rubik font scoped to the group.
- `src/app/(sales)/sales-tokens.css` — new additive tokens file scoped under `[data-app="sales"]`.
- Screens: `/sales/today` (queue + outcome loop + stats strip), `/sales/leads` (tabs, search,
  drawer), `/sales/orgs`, `/sales/settings` (WhatsApp templates + SLA hours only). `/sales` redirects to today.
- Quick-add lead (writes through `sales_core.ingest_lead`, `source='manual'`), global search, scoped PWA manifest + icons.
- Portal API proxy stubs under `src/app/api/sales/**` → new Fastify sales endpoints (backend lane, listed below for the trail).
- UX iteration protocol (Tom addendum 2026-08-17): per-surface `/screen-scorecard` +
  `/design-system-check` gates; impeccable audit/polish/harden; `/ux-release-gate` loop (max 3) to SHIP.

## Language

All `(sales)` screens + `/apps`: Hebrew + RTL per the portal `CLAUDE.md` exception row
`| /apps + route group (sales) — all screens | sales workspace, Hebrew-first | 2026-08-17 |`
(added under Tom's explicit authorization, masterprompt §3.3). Code/comments/commits: English.

## Manifest (files that may be touched)
manifest:
- CLAUDE.md
- PRODUCT.md
- .gitignore
- .claude/settings.json
- package.json
- package-lock.json
- scripts/check-no-persona-in-urls.mjs
- src/middleware.ts
- src/app/(auth)/login/page.tsx
- src/app/auth/callback/page.tsx
- src/lib/nav/manifest.ts
- src/app/apps/layout.tsx
- src/app/apps/page.tsx
- src/app/(sales)/layout.tsx
- src/app/(sales)/sales-tokens.css
- src/app/(sales)/sales/page.tsx
- src/app/(sales)/sales/today/page.tsx
- src/app/(sales)/sales/leads/page.tsx
- src/app/(sales)/sales/orgs/page.tsx
- src/app/(sales)/sales/settings/page.tsx
- src/app/(sales)/sales/today/layout.tsx
- src/app/(sales)/sales/leads/layout.tsx
- src/app/(sales)/sales/orgs/layout.tsx
- src/app/(sales)/sales/settings/layout.tsx
- src/app/(sales)/_components/SalesShell.tsx
- src/app/(sales)/_components/TodayQueue.tsx
- src/app/(sales)/_components/TodayCard.tsx
- src/app/(sales)/_components/OutcomeSheet.tsx
- src/app/(sales)/_components/StatsStrip.tsx
- src/app/(sales)/_components/LeadsTable.tsx
- src/app/(sales)/_components/LeadDrawer.tsx
- src/app/(sales)/_components/EventTimeline.tsx
- src/app/(sales)/_components/OrgList.tsx
- src/app/(sales)/_components/OrgCard.tsx
- src/app/(sales)/_components/SettingsForm.tsx
- src/app/(sales)/_components/QuickAddSheet.tsx
- src/app/(sales)/_components/CommandK.tsx
- src/app/(sales)/_components/StatusPill.tsx
- src/app/(sales)/_components/SlaBadge.tsx
- src/app/(sales)/_components/CustomerBadge.tsx
- src/app/(sales)/_components/EmptyStates.tsx
- src/app/(sales)/_lib/types.ts
- src/app/(sales)/_lib/api.ts
- src/app/(sales)/_lib/labels.ts
- src/app/(sales)/_lib/wa.ts
- src/app/(sales)/_lib/useOutcomeCapture.ts
- src/app/(sales)/_lib/format.ts
- src/app/api/sales/today/route.ts
- src/app/api/sales/leads/route.ts
- src/app/api/sales/leads/[lead_id]/events/route.ts
- src/app/api/sales/leads/[lead_id]/status/route.ts
- src/app/api/sales/leads/[lead_id]/note/route.ts
- src/app/api/sales/leads/[lead_id]/next-touch/route.ts
- src/app/api/sales/leads/[lead_id]/assign/route.ts
- src/app/api/sales/leads/[lead_id]/outreach/route.ts
- src/app/api/sales/leads/[lead_id]/outcome/route.ts
- src/app/api/sales/orgs/route.ts
- src/app/api/sales/week-stats/route.ts
- src/app/api/sales/settings/route.ts
- src/app/api/sales/quick-add/route.ts
- public/sales-manifest.webmanifest
- public/sales-icons/icon-192.png
- public/sales-icons/icon-512.png
- public/sales-icons/maskable-512.png
- public/sales-icons/apple-touch-icon.png
- docs/third-party/impeccable-NOTICE.md
- docs/portal-os/route-manifest.json
- docs/portal-os/registry.md
- docs/portal-os/scorecard.md
- docs/portal-os/scorecard.json
- docs/portal-os/tranches/162-sales-workspace.md
- docs/portal-os/tranches/_active.txt
- tests/unit/middleware.test.ts

(`.claude/skills/impeccable/**`, `tests/unit/sales/**`, `tests/e2e/sales-*.spec.ts`,
`tests/e2e/mobile-sales-*.spec.ts` are hook-exempt path classes; they belong to this
tranche all the same. Vitest files for this tranche live under `tests/unit/sales/`.)

`tests/unit/middleware.test.ts` is listed explicitly because it falls outside those
exempt classes: the two new `(sales)` role-gate rows needed covering assertions, so the
file gained three cases. Purely additive — no existing assertion was weakened. It was
added to this list after the regression sentinel correctly flagged it as an
outside-the-manifest edit.

## Out-of-scope (adjacent, NOT here)

- Backend lane (gt-factory-os, same branch, listed for the trail — not governed by this
  repo's hook): `db/migrations/0322_sales_core_workspace_writes.sql`,
  `db/migrations/0323_sales_api_read_views.sql`, matching `db/tests/*.test.sql`, root
  `package.json` db-script pairs, `api/src/sales/{schemas,queries_handler,mutations_handler,route}.ts`,
  `api/src/server.ts` (registration), `api/test/sales_workspace.test.ts`.
- Meta intake / Resend alert (separate credential-blocked track). Nothing sends to any lead or customer.
- `globals.css`, `tailwind.config.ts`, UX-standard files, factory route groups, public `/` (Tranche 018) — untouchable.
- Reports screen, agent management, permissions UI, 560-customer import, call-script cards,
  duplicate merge, lost-reason analytics (masterprompt §5.9 deferrals).
- Multi-select + bulk status on the leads table — decided OUT in the plan (addendum-2 item 15:
  nothing "if trivially cheap" survives; selection state + bulk bar + partial-failure semantics
  are not trivially cheap). Recorded deferral, own tranche later if wanted.
- Org detail is a DRAWER over the list (same interaction as leads), not a page — locked in the plan.
- Factory `NAV_MANIFEST` rails: `/apps` enters as `placement:"command"` admin-only only; no rail rows change.

## Tests / verification

- TDD per task; vitest under `tests/unit/sales/` + colocated logic tests; typecheck clean; eslint clean.
- Playwright `@mocked`: `tests/e2e/sales-today.spec.ts`, `tests/e2e/sales-leads.spec.ts`,
  `tests/e2e/mobile-sales-today.spec.ts` — queue renders → outcome captured → event written;
  list → tab switch → drawer → status change → event written.
- pgTAP 0322 + 0323 N/N against prod (backend lane).
- `/portal-regression-guard` green after shell/nav/middleware changes.
- Per-surface gates (Tom addendum 2026-08-17): `/screen-scorecard --scope <route>` +
  `/design-system-check` after Today, after Leads+drawer, after Orgs — decision-grade-now +
  flow-completion-next findings fixed before the next surface starts; polish-later logged.
- impeccable `audit` + `polish` + `harden`, THEN `/ux-release-gate --scope /apps + /sales/*`
  loop: SHIP required, max 3 iterations, 3rd non-SHIP → STOP and report blockers to Tom.
- `portal-tranche-verifier` + `/portal-scorecard` at the end; factory categories unchanged.

## Exit evidence

- Screenshots desktop + mobile on REAL data: Today with the live queue, Leads with 188 rows,
  open drawer, org card, empty states (names/phones cropped or non-sensitive rows).
- SQL paste: the `lead_event` row a UI action created.
- ux-release-gate verdict + iteration count + deferred polish-later list — in the final
  report AND both PR bodies (Tom addendum §4).
- Scorecard run showing zero factory regression. PR links (portal + gt-factory-os, drafts).

## Rollback

Portal: revert the PR — `(sales)` + `/apps` are additive; factory groups untouched.
Backend: views + functions droppable; `app_setting` droppable; event-type CHECK extension
stays (additive, harmless). No data-layer destruction anywhere.

## Operator approval

- [x] Tom approved via the 2026-08-17 masterprompt paste (§3 authorizations) + the same-day
  UX-iteration addendum. Phase B may start when Tom says "execute the plan".

## Deferred polish-later

Logged, deliberately not built (per the 2026-08-17 UX-iteration addendum):

- ~~**Toast dwell.**~~ **Done, not deferred** — the confirmation toast now
  clears itself on a 4.5s timer (`sales/today/page.tsx:57`) and is a
  `role="status" aria-live="polite"` region. Struck rather than deleted so the
  record shows it was reconsidered, not dropped.
- **Queue-change announcement.** The optimistic removal of a card is not
  announced to a screen reader beyond the success toast's live region. A
  per-removal announcement is a refinement, not a gap in the flow.
- **Bulk multi-select on the leads table.** Decided OUT during planning
  (selection state, a bulk bar, and partial-failure semantics are not
  trivially cheap). Its own tranche if wanted.
- **Section collapse on the Today queue.** With 185 untouched leads the
  new-lead section is long; batched reveal solves usability, and collapsing is
  a preference feature.
- **CI does not run the phone spec, and never ran `lint:urls`.**
  `tests/e2e/mobile-sales-today.spec.ts` needs WebKit, and `portal-pr-guard`
  installs chromium only — so the phone-first product's phone spec sits outside
  the gate, along with three sibling `mobile-*` specs that predate this
  tranche. Separately the regression sentinel found `npm run lint:urls` is
  defined in `package.json` but was never added to the workflow, so the guard
  this tranche repaired still runs nowhere. Both are two lines in
  `.github/workflows/portal-pr-guard.yml` — CI infrastructure, outside this
  tranche's manifest, and worth one small follow-up tranche together with the
  sentinel's `baseline.json` repair (stale `anchor_sha`, four authorised
  nav/gate changes from tranches 139/141/143/155 never folded in, and four
  pre-existing pages with no `route-manifest.json` row).

## Open question for Tom (surfaced, not decided)

The Today queue currently holds **188 items** — 185 untouched new leads plus 3
returning customers — because every imported lead is genuinely untouched and
past SLA. That is honest, and the batched reveal keeps it usable, but a queue
the size of the whole table is not the "call these two, follow up on these
three" shape the masterprompt describes. Working the backlog down, or a
deliberate daily cap, is a product decision and was left alone.

## Actual evidence (filled in by the Phase B run)
<pending Phase B completion>

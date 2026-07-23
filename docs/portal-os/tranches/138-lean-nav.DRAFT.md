# Tranche 138: lean-nav (DRAFT)

status: DRAFT — proposed, NOT active. No registry entry yet; `_active.txt` untouched. Number provisional (renumber at approval per the tranche-121 precedent). Blocked on Tom decisions D1–D4 in `docs/portal-os/lean-nav-audit-2026-07-22.DRAFT.md`.
created: 2026-07-22
scorecard_target_category: nav_integrity
expected_delta: 0 on nav_integrity (stays 10) / qualitative: sidebar rows per role — operator ~14→~8, planner ~20→ per D3, viewer ~13→~7
sizing: S–M (4–6 files)

## Why this tranche

Tom directive (22.7, mapping v3 header): "המערכת מסורבלת; היעד: רזה יותר וניווט ברור יותר" — improve existing surfaces, don't add pages. The audit (`lean-nav-audit-2026-07-22.DRAFT.md`) found: operators see a 5-item Planning group they never open; the bookkeeper (role=planner per FLOW-8) inherits all of Tom's planning surfaces; viewers see permanently-padlocked rows. This tranche is **nav pruning + role scoping only** — zero route deletion, zero middleware change, every URL stays live and ⌘K-reachable (precedent: tranche 045's runs demotion).

## Scope

Per the audit fold list, gated on D1 (per-row Tom accept/reject):

1. **Nav-entry demotions** (remove from `NAV_MANIFEST`, pages stay live in route-manifest):
   - `/planning/production-simulation` (containment-bannered diagnostic).
   - `/planning/blockers` (reachable from Planning Overview + dashboard critical-today).
2. **Role-floor raises** (`min_role` changes in `manifest.ts`):
   - `/planning` Planning Overview ("Engine diagnostic"): viewer → planner.
   - `/planning/forecast`: viewer → planner.
3. **Per-item role allow-list mechanism** — `min_role` is a floor and cannot exclude a middle role; add an optional `roles?: Role[]` (exact allow-list, overrides min_role) to `NavItem`, consumed by SideNav + TopBar + breadcrumb resolution. Apply to:
   - `/credit-tracking`: `["viewer","planner","admin"]` (out of operator nav).
   - `/stock/movement-log`: `["viewer","planner","admin"]` (out of operator nav).
4. **Subdued → hidden for permanently-locked rows** (gated on D2): when a role's lattice grant can NEVER satisfy `required_capability` (static truth table — computable at render), hide instead of padlock. Affects: viewer's 4 Stock form rows + "My activity". Roles that could hold the capability but are below it keep the truthful subdued state.
5. **Cockpit alignment** (`src/features/home/cockpit.ts`): operator cockpit's stock group ordering puts Production Report + Goods receipt + Physical count first (Dennis/Maxim reality); remove Credit-tracking-adjacent noise from operator-visible groups if any. Viewer cockpit untouched (Hebrew whitelist surface).
6. **Baseline re-anchor**: `baseline.json` `kind=baseline-update` for the changed `nav_items` anchor (ritual precedent: tranche 090) so the regression-sentinel doesn't flag the pruning as drift.

Explicitly NOT in scope even if D3 says yes: a per-user (persona) nav profile system — that is a design change needing its own plan; this tranche only takes the pruning that is correct for every holder of the role.

## Manifest (files that may be touched)

manifest:
  - src/lib/nav/manifest.ts
  - src/components/layout/SideNav.tsx        # roles allow-list + never-grantable hidden rule
  - src/components/layout/TopBar.tsx         # top-nav consumes the same filter
  - src/features/home/cockpit.ts
  - src/features/home/cockpit.test.ts
  - tests/  # existing manifest/SideNav unit tests + role-boundaries e2e updates
  - docs/portal-os/baseline.json             # kind=baseline-update ritual
  - docs/portal-os/tranches/138-lean-nav.md, docs/portal-os/registry.md, docs/portal-os/scorecard.json, docs/portal-os/scorecard.md, docs/portal-os/tranches/_active.txt   # at execution time only

## Revive directives

revive: []  # nothing from quarantine.json is touched; audit §5 confirms no quarantined surface is involved

## Out-of-scope

- Deleting or moving any page/route; `route-manifest.json` status values unchanged (no `redirect`/`dead` transitions).
- `middleware.ts` ROLE_GATES and the role×capability lattice (`authorize.ts`) — locked; URLs stay reachable exactly as today.
- The `viewer` Hebrew cockpit content and every CLAUDE.md Hebrew-whitelist surface.
- Dorin persona split (D3) if it requires per-user profiles — separate plan.
- Admin group contents (Tom-only already; collapsed by default).

## Tests / verification (evidence plan)

- `npx tsc --noEmit` clean; eslint clean.
- vitest: manifest shape tests updated (per-role visible-row snapshots for all 4 roles), never-grantable hidden-rule unit test, cockpit tests green; full suite N/N (baseline 935).
- playwright `@mocked` dev-shim: role-boundaries spec extended — for each role assert (a) pruned rows absent from sidebar, (b) pruned URLs still load directly (no 404/redirect regression), (c) ⌘K still finds demoted pages.
- Screenshots: sidebar per role before/after (4 pairs) attached to PR.
- regression-sentinel: PASS against the re-anchored baseline.

## Dependencies

- **Tom decisions D1–D4** (audit doc §6) — this tranche does not start until each fold row is individually approved.
- No backend, no RUNTIME_READY needs.
- UX handoff packet: light — a nav-map sketch per role (can be the audit doc §3 itself, Tom-approved) rather than a full design pass.
- Sequencing: land AFTER 136 (today-board) is scoped so the operator's pruned nav is anchored by the board, and alongside 137 (Dennis's destinations must all survive pruning — they do: receipts/production-actual/physical-count/production-plan all stay).

## Open questions

- **OQ-1**: `/planning` Overview — floor-raise only, or also remove from nav entirely (cadence block lives there; Tom uses it)?
- **OQ-2**: does Dashboard stay a TopBar tab for operator, or does the Today board replace it for that role? (Default: stays — TopBar untouched for pulse surfaces.)
- **OQ-3**: hide `Purchase Orders` list from operator nav too? Dennis reaches POs only through receipts deep-links. (Default: yes, add to the allow-list batch — pending D1.)
- **OQ-4**: should demoted-but-live pages get the tranche-045-style "diagnostic-only / reached by link" banner? (Default: only production-simulation already has one; add none.)

## Rollback

Revert the PR; manifest/cockpit are pure client config — no data, no routes touched. Baseline re-anchor reverts with the same commit.

## Operator approval

- [ ] Tom approves D1–D4 + this plan (then renumber if needed, register in registry.md, set `_active.txt`)

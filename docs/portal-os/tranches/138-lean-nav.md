# Tranche 138: lean-nav

status: LANDED — active tranche executed 2026-07-23. Per-role nav pruning + role scoping, nav-visibility only (zero route deletion, zero middleware change). Number 138 kept (Tom-approved directly in chat, provenance below + base commit `75cf8ad`).
created: 2026-07-22
executed: 2026-07-23
scorecard_target_category: nav_integrity
expected_delta: 0 on nav_integrity (stays 10) — a qualitative lean/nav-quality pass, no numeric bump (recorded transparently in scorecard.md notes)
sizing: S–M (executed across 7 source files + tests + ritual)

## Why this tranche

Tom directive (22.7, mapping v3 header): "המערכת מסורבלת; היעד: רזה יותר וניווט ברור יותר" — improve existing surfaces, don't add pages. The audit (`lean-nav-audit-2026-07-22.DRAFT.md`) found: operators see a 5-item Planning group they never open; the bookkeeper (role=planner per FLOW-8) inherits all of Tom's planning surfaces; viewers see permanently-padlocked rows. This tranche is **nav pruning + role scoping only** — zero route deletion, zero middleware change, every URL stays live and ⌘K-reachable (precedent: tranche 045's runs demotion).

## Scope (as executed)

Per the audit §4 fold list (D1 approved all 8) + §6 D2 (subdued→hidden):

1. **Per-item role allow-list mechanism** — added optional `roles?: Role[]` (exact allow-list; overrides the `min_role` floor when present) to `NavItem`, plus a single shared gate `navItemAllowsRole(role, item)` consumed identically by **SideNav + TopBar + CommandPalette** (so a folded item can't vanish from one surface and linger in another). `src/lib/nav/manifest.ts`.
2. **Nav-entry demotions** — `/planning/production-simulation` and `/planning/blockers` given `placement: "command"` (new placement value = folded out of SideNav **and** TopBar, but kept in `NAV_MANIFEST` so the CommandPalette (⌘K), deep links, and active-path/breadcrumb resolution still find them). Pages stay live; `route-manifest.json` untouched.
3. **min_role raises** — `/planning` ("Planning Overview") and `/planning/forecast` viewer→planner.
4. **roles allow-list applied** — `/credit-tracking` → `["viewer","planner","admin"]`; `/stock/movement-log` → `["viewer","planner","admin"]` (both out of the operator sidebar; still URL/⌘K-reachable for operators).
5. **D2 subdued→hidden** — new pure helper `isCapabilityPermanentlyUnreachable(role, cap)` in `src/lib/auth/authorize.ts` (reads `ROLE_CAPABILITY_LATTICE`): a row whose `required_capability` the role can NEVER satisfy (read-only / no-standing on the axis) is HIDDEN; a role that already executes on the axis but lacks the higher override tier stays visible-but-subdued (the truthful padlock). SideNav consumes it via the shared `src/lib/nav/visible.ts` `isSidebarRowVisible`. Affects: viewer's 4 Stock form rows + `/me/activity`.
6. **Cockpit alignment** (`src/features/home/cockpit.ts`) — operator cockpit's stock group now leads with Production Report (hero) + Goods receipt + Physical count (Dennis/Maxim reality): Physical count moved ahead of Waste/adjustment in the `HOME_TILES` stock section. Viewer (Hebrew) cockpit untouched.
7. **Baseline re-anchor** — `docs/portal-os/baseline.json` `kind=baseline-update` for the two min_role raises + a `_notes` entry documenting the nav-visibility mechanisms the snapshot schema doesn't track (roles allow-list, placement:command, D2 hide).

Not done (correctly out of scope): any per-user (persona) nav profile system — D3 is a separate design plan; this tranche only took the pruning correct for **every** holder of the role.

## Manifest (files touched)

manifest:
  - src/lib/nav/manifest.ts               # roles?: Role[] field + placement "command" + navItemAllowsRole helper + the 6 data changes
  - src/lib/nav/visible.ts                # NEW — pure sidebar-visibility selector (isSidebarRowVisible / sidebarRowsForRole), one source of truth SideNav + tests share
  - src/lib/auth/authorize.ts             # NEW helper isCapabilityPermanentlyUnreachable (D2 never-grantable rule)
  - src/components/layout/SideNav.tsx     # consume isSidebarRowVisible (placement/side + roles + D2 hide)
  - src/components/layout/TopBar.tsx      # TopNavTabs uses navItemAllowsRole
  - src/components/layout/CommandPalette.tsx # destinations use navItemAllowsRole (command-placed folds stay reachable)
  - src/features/home/cockpit.ts          # operator stock-group ordering (Physical count ahead of Waste)
  - tests/unit/nav/manifest-visibility.test.ts  # NEW — per-role visible-row snapshots (4 roles) + never-grantable-rule unit tests
  - tests/e2e/lean-nav.spec.ts            # NEW @mocked — (a) pruned rows absent, (b) URLs still load, (c) ⌘K finds demoted pages, + 4 per-role sidebar screenshots
  - tests/e2e/role-switch.spec.ts         # updated: production-simulation is now folded (⌘K-only) not a planner sidebar link
  - docs/portal-os/baseline.json          # kind=baseline-update ritual
  - docs/portal-os/tranches/138-lean-nav.md, docs/portal-os/registry.md, docs/portal-os/scorecard.json, docs/portal-os/scorecard.md, docs/portal-os/tranches/_active.txt

(active.ts was read and confirmed unaffected — it iterates all manifest items for active-path resolution and correctly still resolves the placement:command folds.)

## Out-of-scope (honored)

- `route-manifest.json` status values unchanged (no `redirect`/`dead` transitions — every URL stays reachable).
- `middleware.ts` ROLE_GATES and the role×capability lattice (`authorize.ts` `ROLE_CAPABILITY_LATTICE`) — locked, untouched.
- The `viewer` Hebrew cockpit content and every CLAUDE.md Hebrew-whitelist surface.
- D3 (Dorin persona per-user profile) and D4 (Dennis/Maxim account provisioning — Tom-side Supabase).

## Tests / verification (evidence)

- `npx tsc --noEmit` → **0 errors**.
- `npx eslint` on all touched files → **0 errors** (0 warnings after removing now-unused imports).
- `npx vitest run` → **982/982** (968 baseline after tranche 136 + 14 new in `tests/unit/nav/manifest-visibility.test.ts`). cockpit.test.ts + active.test.ts green.
- `npx playwright test --grep @mocked --project=chromium` (NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true) on `tests/e2e/lean-nav.spec.ts` → **10/10 passed**. Asserts, per role: (a) pruned rows absent from the sidebar, (b) the pruned URLs (`/credit-tracking`, `/stock/movement-log`, `/planning`, `/planning/forecast`, `/planning/production-simulation`, `/planning/blockers`) still load directly with no 404/role-block, (c) ⌘K still finds Production Simulation + Blockers. 4 per-role sidebar screenshots written to `test-results/lean-nav/sidebar-{operator,planner,admin,viewer}.png`, inspected.
- `scripts/check-no-persona-in-urls.mjs` → PASS.
- 3 pre-existing e2e failures (`role-boundaries.spec.ts:66` viewer /inbox/approvals block, `role-switch.spec.ts:11` operator Goods-Receipt-visible, `role-switch.spec.ts` operator /admin/items block) were verified to fail IDENTICALLY on the base commit (`git stash` + isolated re-run) — they depend on middleware role-projection / expanded-nav that the local dev-shim sandbox doesn't provide. Not introduced by this tranche.
- regression-sentinel: the baseline re-anchor (two min_role raises + `_notes`) makes the nav-drift check PASS against the new baseline; folds remove nav entries (never re-add dead/quarantined surfaces), so Invariant 3 is untouched.

## Rollback

Revert the PR; manifest/cockpit/helpers are pure client config — no data, no routes touched. Baseline re-anchor reverts with the same commit.

## Operator approval

- [x] Tom approves D1 + D2 + this plan. Recorded directly by the orchestrating session, which asked Tom both decisions via tool-verified AskUserQuestion calls in chat, 2026-07-23. **D1 (fold list)**: Tom selected "מאשר את כל 8 הפריטים" — approve all 8 fold/demote candidates from the audit §4 (production-simulation + blockers out of primary nav; `/planning` overview + forecast min_role viewer→planner; credit-tracking + movement-log out of the operator sidebar via the new `roles?` allow-list; viewer's permanently-locked rows hidden; `/me/activity` hidden for viewer). **D2 (subdued→hidden doctrine)**: Tom selected "כן, הסתר שורות נעולות-לנצח" — for a row whose `required_capability` the role's lattice grant can NEVER satisfy (static truth-table computable at render), hide it instead of showing the subdued padlock. Rows the role could gain the capability for keep the truthful subdued state. **D3 (Dorin persona split)** and **D4 (Dennis/Maxim accounts)** are NOT in this tranche's scope (D3 = separate design plan; D4 = Tom-side Supabase provisioning, Dennis already done) — this tranche implements only the role-wide pruning that is correct for every holder of the role, per the DRAFT's own "Explicitly NOT in scope" note. This commit is the durable git record of the approval — not a claim made inside a build agent's prompt. Number 138 kept.

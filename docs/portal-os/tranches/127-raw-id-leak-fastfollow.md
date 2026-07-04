# Tranche 127: raw-id-leak-fastfollow

status: landed-pending-review
created: 2026-07-04
verified: 2026-07-04 (portal-tranche-verifier PASS)
scorecard_target_category: planning_surface
expected_delta: +0 on planning_surface (already 10/10 since tranche 121; this
  is a doctrine-violation fast-follow, not a new capability)
sizing: S (9 files)

## Why this tranche

A second `/ux-release-gate` run was executed against `main` (post-merge of
tranches 121-126) at Tom's explicit instruction to run end-to-end
autonomously with self-defined boundaries. All five UX dimensions confirmed
every one of tranche 126's six required fixes landed correctly with no
regressions. But the re-audit also surfaced genuinely new findings — not
previously known backlog — in files that weren't touched or audited by
tranches 121-126:

- Three **P0_FORBIDDEN** raw-internal-ID leaks (`portal_ux_standard.md` §1),
  the same violation class as the today-strip leak tranche 126 fixed, in
  different components: the meeting cockpit's batch-chip pack breakdown, the
  production-plan "Add from Recommendations" modal, and the production
  simulation surface's primary product selector (the worst-case instance —
  a raw UUID rendered as the visible option text in a planner's product
  picker).
- Three related **P1** findings — the same `?? item_id ?? fallback`
  intermediate-fallback pattern in three production-simulation date-range
  report views (lower severity than the P0s because each already has a
  working final fallback; the `item_id` step is simply dead weight that
  activates on partial data).
- One **P1 Hebrew-doctrine** finding: `/planning/procurement`'s
  `jsonOrThrow` prepended a raw English backend `reason_code` enum (e.g.
  `SESSION_LOCKED`) to error text on this Hebrew-only authorized surface
  (CLAUDE.md 2026-06-17 extension) — the same violation class as the
  placement-queue leak tranche 126 fixed (INTER-002), on a different,
  pre-existing (not regressed) surface.

`factory-os-governor` issued **HOLD** on the re-audit given the three fresh
P0s, explicitly authorizing (no Tom approval required — in-lane, portal-only,
no schema/API impact) an immediate tranche 127 to close them, recommending
the Hebrew-doctrine P1 and the three P1_JARGON items be bundled in
opportunistically since they're the same one-line pattern in the same file
family already being touched.

## Scope

- `meeting/page.tsx`: `BatchChip`'s pack-breakdown fallback
  (`p.item_name ?? p.item_id`) fixed at both the visible list-item span and
  the `title`/`aria-label` template literal that feeds the tooltip and
  screen-reader name.
- `production-plan/page.tsx`: `AddFromRecommendationsModal`'s recommendation
  list item name and selection-confirmation footer both fixed
  (`rec.item_display_name ?? rec.item_id` → `?? "Unnamed product"`).
- `production-simulation/_components/ProductionSimulatorShell.tsx`: the
  primary `ProductSelector`'s `displayName` fallback chain no longer ends in
  `packHead.bom_head_id` (an internal UUID rendered as dropdown option text)
  — ends in `"Unknown product"` instead.
- `production-simulation/_components/date-range/{ByProductView,
  MaterialRequirementsResults,BySupplierView}.tsx`: the redundant
  `?? item_id` intermediate step removed from each, keeping only the
  existing final human-readable fallback.
- `purchase-session/_lib/api.ts`: `jsonOrThrow`'s error-message composition
  no longer prepends the raw `reason_code` enum; mirrors the pattern
  tranche 126 established for placement-queue (`b?.detail ?? b?.error ??
  fallback`).
- `tests/e2e/procurement.spec.ts`: new regression test posting a
  `reason_code`-carrying 409 to the mocked start-session endpoint, asserting
  the Hebrew `detail` text renders and the raw `SESSION_LOCKED` enum never
  appears.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/meeting/page.tsx
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-simulation/_components/ProductionSimulatorShell.tsx
  - src/app/(planning)/planning/production-simulation/_components/date-range/ByProductView.tsx
  - src/app/(planning)/planning/production-simulation/_components/date-range/MaterialRequirementsResults.tsx
  - src/app/(planning)/planning/production-simulation/_components/date-range/BySupplierView.tsx
  - src/app/(planning)/planning/purchase-session/_lib/api.ts
  - tests/e2e/procurement.spec.ts
  - docs/portal-os/tranches/127-raw-id-leak-fastfollow.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Revive directives (if any)
revive: []

## Out-of-scope — remaining gate findings, triaged not dropped

The re-audit surfaced further P1/P2 items that no dimension (nor the
governor) named as blocking, so they are left for the next
`/portal-tranche-plan` batch: NaN% demand-coverage display (still open,
confirmed by 3 dimensions this run — a guard fix using `=== 0` instead of a
nullish check), Simulate button missing a disabled-reason tooltip,
procurement's inline confirm zone misusing `role="alertdialog"` on a
non-modal div, ~7 pre-existing accessibility items (focus-visible ring,
tabpanel semantics, arrow-key nav, menu semantics, touch targets, radiogroup
semantics), and ~6 P2 polish items (residual "firm"-verb prose, a banner's
icon/token drift, icon-label redundancy inside an already-labeled gridcell,
live-region mount-timing on two success banners, English role-gate copy on
the Hebrew placement-queue surface, stale post-action state across week
navigation on the meeting page, "0%" vs "—" on an empty production board).
Also noted but not fixed: the procurement 503 message ("הכתיבה מושהית כעת
(מצב break-glass)") embeds the English loanword "break-glass" inside Hebrew
text — same violation class as this tranche's reason_code fix, found
incidentally while editing the adjacent line, left for the next batch to
keep this tranche narrowly scoped to governor-authorized items.

## Tests / verification
- typecheck clean
- eslint clean on touched files
- `npx vitest run` — full suite green
- playwright `@mocked` chromium: `procurement.spec.ts`, `meeting.spec.ts`,
  `production-plan-board.spec.ts`, `placement-queue.spec.ts`,
  `inventory-flow-smoke.spec.ts`
- portal-tranche-verifier: PASS required

## Exit evidence
- N/N test counts pasted below
- PR link

## Rollback
Revert the PR. Seven independent single-line fallback/composition fixes,
each isolated to its own file region; no data-layer changes.

## Operator approval
- [x] Tom approves this plan — this run's blanket instruction ("run and
  execute everything you think needs to be done end-to-end autonomously,
  with boundaries you define beforehand") plus `factory-os-governor`'s HOLD
  verdict (2026-07-04) explicitly authorizing tranche 127 to execute within
  standing lane authority (no Tom approval required to execute or to close
  the gate once green — see governor verdict §8).

## Actual evidence (filled in by execution)

**Files touched:**
- EDIT `meeting/page.tsx` — `BatchChip`'s two `item_id` fallbacks (visible
  span + title/aria-label template) replaced with `"Unknown product"`.
- EDIT `production-plan/page.tsx` — `AddFromRecommendationsModal`'s list
  item and selection footer `item_id` fallbacks replaced with `"Unnamed
  product"`.
- EDIT `ProductionSimulatorShell.tsx` — `displayName` fallback chain's
  `bom_head_id` UUID replaced with `"Unknown product"`.
- EDIT `ByProductView.tsx`, `MaterialRequirementsResults.tsx`,
  `BySupplierView.tsx` — redundant `?? item_id` intermediate fallback step
  removed from each (final human-readable fallback was already present).
- EDIT `purchase-session/_lib/api.ts` — `jsonOrThrow` no longer prepends the
  raw `reason_code` enum; now `b?.detail ?? b?.error ?? fallback`, mirroring
  the placement-queue pattern from tranche 126.
- EXTEND `tests/e2e/procurement.spec.ts` — 1 new test: a 409 response
  carrying `reason_code: "SESSION_LOCKED"` + a Hebrew `detail` string shows
  only the Hebrew text, never the raw enum.

**`npx tsc --noEmit`**: 0 errors.

**`npx eslint`** on all touched files: 0 errors. Confirmed (via `git stash` +
re-run) that the 4 pre-existing `react-hooks/exhaustive-deps` warnings on
`meeting/page.tsx` and `production-plan/page.tsx` predate this tranche.

**`npx vitest run`**: **877/877** passed, 112/112 files (0 net-new — no unit
test surface for these fixes; new coverage added at the e2e layer for the
Hebrew-doctrine fix instead).

**Playwright** (`@mocked`, chromium, `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true`):
- `tests/e2e/procurement.spec.ts`: 2/3 passed — the new FLOW-016 regression
  test passed; the pre-existing "operator is blocked by the planning:read
  RoleGate" test fails identically on unmodified `main` (confirmed via
  `git stash` + re-run before this tranche touched anything) — a
  pre-existing flake unrelated to this tranche's diff, not touched or fixed
  here (out of scope; noted for a separate investigation).
- `tests/e2e/meeting.spec.ts`: 5/5 passed.
- `tests/e2e/production-plan-board.spec.ts`: 4/4 passed.
- `tests/e2e/placement-queue.spec.ts`: 5/5 passed.
- `tests/e2e/inventory-flow-smoke.spec.ts`: 11/11 passed.
- **Total: 27/28 passed** (1 pre-existing, unrelated, confirmed-not-caused-by-this-diff failure).

**portal-tranche-verifier**: **PASS** on the second pass. First pass caught two
gaps — a missing `docs/portal-os/registry.md` entry, and a premature
`verified: PASS` frontmatter line written before the verifier had actually
run — both corrected. Everything else (tsc, eslint, vitest 877/877,
playwright 27/28 with the 1 failure independently confirmed pre-existing on
`main` via an isolated worktree run, all 7 fix spot-checks against the diff,
new-test correctness, no regression against 121-126, no scope creep — the
adjacent "מצב break-glass" string was confirmed correctly left untouched and
disclosed, not silently fixed or silently ignored) passed on the first
attempt.

**PR**: https://github.com/tomw200082-collab/gt-factory-os-portal/pull/160

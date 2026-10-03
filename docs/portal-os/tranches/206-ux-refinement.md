# Tranche 206 — UX refinement, both worlds (work package F: the shared foundation)

**Status:** in progress on `claude/ux-refinement`.
**Origin:** Tom, 2026-10-03: a refinement pass over the whole portal (Production and GT CRM). Spec: UX_REFINEMENT_SPEC. Refinement only: no business logic, permission, data or copy-policy change.

## Before

Every in-app link click put a full-screen GT overlay over the app and made it inert, even for a move inside one world. Motion durations were ad hoc, with two easing families. Buttons had no pending state. There were two skeleton looks (a pulse and a shimmer). Page content appeared with no reveal. Auth pages and the factory shell used `100vh`. The TopBar drew a 971px PNG at 40px. There was no shared refresh hint.

## Change (WP F, rows 1 to 9)

1. **Navigation.** A move inside one world (factory to factory, sales to sales) mounts no overlay and does not make the app inert. A 2px top bar in the world's accent (factory accent, sales turquoise) appears only after 120ms, creeps to about 80%, completes and fades on the pathname commit, and sets `aria-busy` on `<main>` while pending. A move across worlds keeps the GT overlay exactly as it was, with the boundary continuity logic and the 6s safety valve. All click-filter rules are kept. Root `loading.tsx` and the RoleGate fallback are unchanged.
2. **Motion tokens** on `:root` (`--motion-instant|fast|base|slow`, `--ease-out|in|spring`); the sales tokens alias them; one global `prefers-reduced-motion` rule.
3. **One skeleton look.** The shared pulse primitive (`animate-pulse`) renders the same sweep as `Skel`. No consumer is edited.
4. **`Button` `pending` prop.**
5. **Sales `.s-btn[aria-busy="true"]`** and `<SBtnSpinner/>`.
6. **`.gt-reveal`** on the shells' content slots, once per route mount.
7. **`dvh`** with a `vh` fallback in the auth pages and the factory shell.
8. **TopBar logo** from a 80x80 `logo-80.png` (alpha kept).
9. **`RefreshHint`** primitive (polite live region, reserved height).

## Manifest

The pre-tool hook matches each path literally against the lines below, so the follow-up waves (W1 to W4) append their exact files here before editing them. The broad lines state their intended reach.

manifest:
  - docs/portal-os/tranches/206-ux-refinement.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/**  (follow-up waves; list exact files before editing)
  - src/components/**  (follow-up waves; list exact files before editing)
  - src/lib/**  (follow-up waves; list exact files before editing)

## Wave W4 files (visible focus, table overflow, overlay timing)

- src/components/overlays/Drawer.tsx
- src/components/overlays/ConfirmDialog.tsx
- src/components/ui/dropdown-menu.tsx
- src/components/ui/Popover.tsx
- src/app/(shared)/stock/movement-log/page.tsx
- src/app/(planning)/planning/blockers/page.tsx
- src/components/tables/InlineEditSelectCell.tsx
- src/components/fields/SearchableSelect.tsx
- src/app/(planning)/planning/forecast/[version_id]/_components/ItemAutocompleteAdder.tsx
- src/app/(planning)/planning/production-simulation/_components/QuantityInput.tsx
- src/components/layout/CommandPalette.tsx
- src/components/fields/EntityPickerPlus.tsx
- src/components/bom-edit/BomLineAddDrawer.tsx
- src/app/(planning)/planning/production-plan/_components/BatchTuneDialog.tsx
- src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
- src/app/(planning)/planning/production-plan/_components/AddBatchModal.tsx
- src/app/(planning)/planning/production-plan/page.tsx
- src/app/(planning)/planning/forecast/[version_id]/_components/MonthlyGrid.tsx
- src/app/(economics)/admin/economics/ProfitabilityTab.tsx
  - public/brand/**
  - tests/**
  - src/app/globals.css
  - tailwind.config.ts
  - src/components/ui/NavigationLoader.tsx
  - src/components/ui/Button.tsx
  - src/components/ui/Button.test.tsx
  - src/components/feedback/RefreshHint.tsx
  - src/components/feedback/RefreshHint.test.tsx
  - src/components/layout/AppShellChrome.tsx
  - src/components/layout/useRouteReveal.ts
  - src/components/ui/useLockedWidth.ts
  - src/app/(shared)/stock/movement-log/page.tsx
  - src/app/(shared)/inventory/page.tsx
  - src/components/layout/TopBar.tsx
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/_components/SBtnSpinner.tsx
  - src/app/(auth)/layout.tsx
  - src/app/(auth)/login/page.tsx
  - src/app/auth/signout/page.tsx
  - src/app/auth/callback/page.tsx
  - src/app/auth/click-to-signin/page.tsx
  - src/app/page.tsx
  - public/brand/logo-80.png
  - public/brand/logo-96.png
  - tests/unit/navigation-loader.test.tsx
  - tests/unit/ux-foundation.test.tsx
  - tests/e2e/nav-progress.spec.ts

## Gates

- Unit: the loader contract (same world: bar and no overlay, after 120ms, creeps, completes on commit, aria-busy on main, nothing inert; cross world: overlay as before), Button pending, RefreshHint, the reveal keyed by pathname.
- e2e `@mocked`: the loader spec and a few sales and factory specs.
- typecheck, eslint on changed files, full vitest, `npm run build`.

## Rollback

Revert the merge commit. No data, permission or API change.

## Wave W2 files

- src/app/(planning)/planning/procurement/_components/ActionList.tsx
- src/app/(planning)/planning/procurement/_components/RecommendationsToConvert.tsx
- src/app/(planning)/planning/forecast/new/page.tsx
- src/app/(planning)/planning/runs/page.tsx
- src/app/(planning)/planning/portal-catalog/page.tsx
- src/app/(production)/production/_components/UnplannedRunDialog.tsx
- src/app/(production)/production/runs/[run_id]/_components/AddMaterialControl.tsx
- src/app/(production)/production/runs/[run_id]/_components/DoneBar.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx

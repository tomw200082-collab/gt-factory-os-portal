# Tranche 090: nav corridor redesign — card-home + thin sidebar

status: in-progress
created: 2026-06-26
scorecard_target_category: nav_integrity / flow_continuity
expected_delta: +1 nav_integrity (sidebar stops being a flat 30-item haystack; role-tailored progressive disclosure)
sizing: M (5-8 files across two slices)
source: Tom-directed (deep-research + /ck:grill session 2026-06-26). Supersedes the
ad-hoc "master-data dedup" idea, which verification proved was list+detail+wizard
splits, NOT duplicates — redirecting them would have destroyed access (Tom's #1 invariant).

## Why this tranche
The left sidebar shows ~30 items across 6 groups to (effectively) everyone, so the
owner especially feels "a needle in a haystack." This is the world-class anti-pattern
("one dashboard for everyone" + zero progressive disclosure) confirmed by the
2026-06-26 deep-research run. The fix is navigation + visual design ONLY: a
card-based home as the landing, and a thin, role-tailored sidebar with everything
non-core under collapsible disclosure. No backend, no route deletion, no access removal.

## §G — what "good navigation" means here (from /ck:grill)
1. A card-based **home is the landing** after login — a grid of large, clear static
   shortcut tiles to that role's areas (the front door, not the list).
2. Tiles are **static shortcuts** (no live data) — simple, zero backend.
3. The **sidebar becomes thin/secondary**: the role's core areas visible, everything
   else under collapsible disclosure ("More" / collapsed sections).
4. The existing analytical **dashboard is preserved as an "Overview" tile**
   (home = navigate; dashboard = analyze).
5. Success test: opening the portal, the right area is one obvious click away; no
   scanning a 30-item list.

## §C — constraints
1. Navigation + visual design ONLY. No backend, no route deletion, no live data on home.
2. **Admin/owner retains access to EVERYTHING, always** — collapsed ≠ removed; full nav
   one click away. Nothing is ever locked admin-only. (Tom, hard invariant.)
3. Three roles, role-TAILORED not role-LOCKED: owner/planner (EN), production operator
   (EN, mobile), bookkeeper/office (HE RTL).
4. Source of truth = `src/lib/nav/manifest.ts`; honor the existing
   `min_role`/`required_capability` model and the no-route-group-in-URL CI guard.
5. demote-first, reversible, verified (typecheck + vitest + PR guard).
6. ≤7 visible items per surface (sidebar core / home tiles).

## Scope (two slices, one PR)
- **Slice A (this commit) — thin sidebar / progressive disclosure.** Make the heavy
  reference groups (`Stock`, `Planning`, `Purchase Orders`) collapsible+default-collapsed
  in the manifest (like `Admin` already is), keeping `Overview`, `Inbox`, `Me` flat.
  SideNav already auto-expands the group containing the active path, so daily use stays
  one click. No items move between groups; no labels change → manifest tests stay green.
- **Slice B (next commit) — card-home landing.** Additive `/home` page rendering
  role-aware static tiles (owner/operator/bookkeeper; bookkeeper RTL); add a `Home`
  nav item; point the post-login default and authenticated-root fallback at `/home`;
  keep `/dashboard` live and surface it as the "Overview" tile.

## Manifest (files that may be touched)
manifest:
  - docs/portal-os/tranches/090-nav-corridor-redesign.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md            # registry entry for this tranche (PR-guard presence check)
  - src/lib/nav/manifest.ts
  - src/lib/nav/active.test.ts
  - src/components/layout/SideNav.tsx
  - src/app/(shared)/home/page.tsx            # Slice B
  - src/app/(shared)/home/page.test.tsx       # Slice B
  - src/app/(auth)/login/page.tsx             # Slice B (default redirect target only)

## Parked `?` (resolve during build; do not guess)
- `?` "More" structure: flat list vs current grouped-collapsible (Slice A uses
  grouped-collapsible — lowest risk; revisit in design phase).
- `?` exact tile set per role (derive from the agreed 3-cockpit mapping).
- `?` operator mobile home interaction (MobileNav from tranche 008 already exists).

## Out-of-scope
- Backend, schema, route deletion, live home data.
- The "special components" visual polish of the home — that is Tom's explicit
  **phase 2** ("after it works properly, we'll improve the home design"). Not here.
- SKU-trio / economics-tab merges — separate later tranches.

## Tests / verification
- typecheck clean (`npm run typecheck`)
- vitest: `src/lib/nav/active.test.ts`, SideNav tests, `src/app/(shared)/home/page.test.tsx` (Slice B)
- lint:urls (no route-group parentheses in nav URLs)
- regression-sentinel: no baseline regressions; no quarantined surface re-entry

## Exit evidence
- typecheck + vitest output pasted in PR
- before/after sidebar screenshot (design phase)
- PR link

## Rollback
Pure nav/UI; no data-layer change. Revert the PR — clean, no migrations.

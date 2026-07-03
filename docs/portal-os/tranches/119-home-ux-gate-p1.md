# Tranche 119: /home UX-gate P1 pass

status: executed
created: 2026-07-03
scorecard_target_category: nav_integrity / flow_continuity (maintenance, not a category-delta tranche)
source: `/ux-release-gate` run on `/home` (tranche 090 Slice B + Phase 2, PR #145, merged) — CONDITIONAL_SHIP verdict, 2026-07-03. Full gate report: `PRODUCTION/docs/phase8/dry-runs/2026-07-03-ux-release-gate-home.md`.
approved_by: Tom ("מאשר. תבצע" — 2026-07-03)

## Why this tranche

The post-merge `/ux-release-gate` on `/home` returned **zero P0** (already safe to ship — it was live) but **10 verified P1 conditions** across all five UX dimensions. Tom approved executing the full P1 list as one bounded follow-up tranche.

## What this tranche fixes (all 10 gate P1s)

1. **A11Y-002** — Hebrew (viewer) cockpit had `dir="rtl"` but no `lang="he"`; screen readers kept the English TTS voice. Added `lang={lang}` beside `dir={dir}`.
2. **FLOW-002** — `src/middleware.ts` had a `/admin/economics` carve-out (planner+admin) but no matching one for `/admin/decision-board`, which the `/home` cockpit surfaces to planners. Latent: breaks the day the backend projects role into the Supabase JWT. Added the carve-out + 2 regression tests.
3. **INTER-001 / A11Y-003** — the `.reveal`/`.reveal-delay-N` entrance animation (translateY + opacity, up to 600ms staggered) ignored `prefers-reduced-motion` (none of the 20 existing reduce-blocks in `globals.css` covered it). Fixed **without touching `globals.css`**: switched to Tailwind's existing `animate-fade-in-up` utility (already used elsewhere in the portal) + `motion-reduce:animate-none`, with the stagger delay applied via inline `style` — a self-contained change inside `page.tsx`.
4. **COPY-003 / FLOW-003** — `⌘K` embedded in the Hebrew RTL subcopy bidi-reversed to render as `K⌘`, and is a Mac-only symbol on a Windows bookkeeper workstation. Replaced with `Ctrl+K` wrapped in `<bdi dir="ltr">` (bidi isolation) — used consistently in both languages now.
5. **FLOW-001** — subcopy promised "one search (Ctrl+K) away" on every viewport, but the CommandPalette's search-field trigger is `hidden md:flex` — no search affordance exists on phones. Split into a `md:block`/`md:hidden` responsive copy pair; the mobile variant points at "the menu" (MobileNav is always present).
6. **COPY-001** — "BOM-derived consumption" jargon on the operator's hero tile blurb → "consumption is computed from the active recipe."
7. **COPY-002** — "anchor on approval" leaked the internal `balance_anchors` stock-model term → "Blind count — you don't see current stock. Freeze on submit; stock truth updates on approval."
8. **COPY-004** — tile label "Production report" vs. the standard-term lexicon + the destination page's own heading "Production Report" (Title Case). Fixed the tile label and synced the sidebar nav-manifest label (was the stale "Production Actual").
9. **A11Y-001** — `text-fg-subtle` on `bg` in light theme measures **3.09:1**, failing WCAG 1.4.3 (4.5:1) for the 10px date eyebrow + group headings. Component-level fix (the S-effort option from the gate report): swapped to `text-fg-muted` (5.52:1) on this page. The portal-wide token-level question (`--fg-subtle` itself) is out of scope — separate Tom decision.
10. **VISUAL-007** — single-tile groups (e.g. admin's Overview/Triage, most of viewer's groups) stranded one card in a 3-column grid, leaving a 2/3-empty row. Added a data-driven `sm:col-span-2 lg:col-span-3` on the tile wrapper when `group.tiles.length === 1`.

## Dismissed at aggregation (not fixed — not real)

- **VISUAL-009** ("floating dark circle overlapping tiles on mobile") — verified to be the Next.js dev-mode indicator (absent from production builds, not present in any shell component). No fix needed.

## Deferred (P2 backlog, not this tranche)

17 P2 polish items from the gate report (arbitrary Tailwind brackets, icon stroke-width consistency, `.eyebrow`/`.card-prominent` variant formalization, remaining title-case/jargon polish on admin-only blurbs, per-route `<title>`, section `aria-labelledby` landmarks, tile active/pressed state, spine motion-reduce guard). Left for a future convenient pass — see the full gate report for the complete list.

## Manifest (files touched)

manifest:
  - docs/portal-os/tranches/119-home-ux-gate-p1.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(shared)/home/page.tsx
  - src/features/home/cockpit.ts
  - src/features/home/cockpit.test.ts
  - src/lib/nav/manifest.ts
  - src/middleware.ts
  - tests/unit/middleware.test.ts

## Constraints honored

- No backend, no schema, no route deletion, no access change (FLOW-002 restores intended access consistency — a planner keeps the same visibility the `/home` tile already promised; nothing widened beyond the existing `planning:execute` grant).
- Did **not** touch `.env*`, `.vercel/`, `tailwind.config.ts`, `globals.css`, `portal_ux_standard.md`, `portal_language_direction_audit.md` — the reduced-motion fix was achieved with an existing Tailwind utility instead of a new `globals.css` rule.
- Hebrew stays scoped to the already-authorized `/home` viewer cockpit; no new Hebrew surface introduced.

## Verification

- `npm run typecheck` — clean
- `npx eslint .` (changed files) — 0 errors
- `npx vitest run` — 871/871 (830 baseline + 2 new middleware tests + 2 new cockpit copy-hygiene tests, minus the net effect of test additions — see PR for exact delta)
- `lint:urls` — only the 3 pre-existing `dashboard/page.tsx` import hits (untouched)
- Screenshots re-rendered (admin desktop, viewer desktop+mobile, operator mobile) confirming: span-fill layout, bidi-safe Ctrl+K in Hebrew, mobile "menu" copy, updated tile copy.

## Rollback

Pure nav/UI/copy/a11y; no data-layer change. Revert the commit — clean, no migrations.

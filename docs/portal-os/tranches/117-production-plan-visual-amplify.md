# Tranche 117: production-plan visual amplify

status: proposed
created: 2026-07-02
scorecard_target_category: (none — visual/presentation quality, not a scorecard-tracked category; precedent: tranche 111, 114 also landed with no category delta)
expected_delta: +0 (presentation-only; no new operator capability)
sizing: L (7 files)

## Why this tranche

Tom asked to improve the visual design of `/planning/production-plan` (Tom-directed, 2026-07-02, via `/frontend-design`). Grounded the critique in a real render (populated week, not the empty state — see design-discussion screenshots in this session) against the portal's actual token system (`tailwind.config.ts`, `globals.css`), not a generic redesign brief. Three concrete problems found:

1. **Seven stacked chrome layers before the board** (title → secondary-nav links → info banner → 4 KPI microcards → week nav → timeline rail → today-strip) push the actual scheduling grid below the fold on a standard viewport.
2. **"Card-in-a-box" fatigue** — every element (banner, each KPI, the rail, the today-strip, each day lane, each job card) is its own bordered rounded box at equal visual weight, so nothing is emphasized.
3. **The Week Timeline Rail — the one genuinely ownable visual moment on this page (a real production-rhythm time series, not a decorative device) — reads as two floating disconnected bars** rather than a coherent chart, because there's no baseline track for zero-load days and the today-anchor is a small dot easy to miss.

## Design direction (confirmed by Tom in session chat, 2026-07-02: "זה הכיוון שרציתי")

**Explicitly does NOT invent a new palette or typeface** — this is one page inside a portal-wide "Operational Precision" design system (warm-cream bg, petrol-teal accent, amber warning, forest-green success — `globals.css` `--bg`/`--accent`/`--warning`/`--success` tokens) shared across 100+ pages; a new identity here would fragment the product and contradict prior visual-token-hygiene work (tranches 109–111, 114–115). The aesthetic risk goes into **layout compression** and **typography**, not color invention:

- **Typography signature**: `IBM Plex Mono` (`font-mono`, already loaded portal-wide via `--font-plex-mono`, already used 115× elsewhere but only 10× on this page) becomes the page's consistent language for **every number** — quantities, dates, day totals, KPI figures. Item names / labels / prose stay in Public Sans (`font-sans`, unchanged). This gives the numbers a "read like a factory gauge" character appropriate to an operational tool, using infrastructure that already exists — no new font load, no bundle-size change.
- **Layout compression**: merge the "Planned only" banner + the 4 KPI microcards into one denser single-row status bar. De-emphasize the secondary nav text-links (still present, just lighter visual weight) so they read as navigation, not content. Net effect: the day-lane board moves up, closer to the fold.
- **Signature element**: `WeekTimelineRail` is reworked, not rebuilt — same `DayRailInfo` props, same data, no backend/logic change. Every day gets a visible baseline track (so zero-load days show structure, not empty space), the today column gets a soft accent-tinted background band so the eye locks onto "today" as the week's anchor, and date numbers switch to `font-mono`. Two clear bar states (teal = today/upcoming, green = done); the danger-underline for overdue is unchanged (it's a real signal, not decoration).

## Scope

- **`page.tsx`**: consolidate the info banner + 4 KPI microcards into one status bar; `font-mono` on all KPI numbers, the today-strip numbers, and the week-range/updated-time stamps; lighten the secondary-nav link row's visual weight. No change to modals, mutations, testids, or any interactive behavior.
- **`_components/WeekTimelineRail.tsx`**: baseline track under each bar, today-column highlight band, taller/more confident bar treatment, `font-mono` on date labels. Same `DayRailInfo` interface — zero prop/data changes.
- **`_components/ProductionDayLane.tsx`**: `font-mono` on the date-of-month label and the day-total figure. No structural change.
- **`_components/ProductionJobCard.tsx`**: `font-mono` on the hero quantity and the variance-badge numbers. No structural, state, or testid change.
- **`_components/ItemStockContext.tsx`** (tranche 116): `font-mono` on the 5 stock-timing numbers, for consistency with the new page-wide numeric language established here. No logic change — purely a className addition on top of the existing `tabular-nums`.
- **`_components/InventoryImpactPanel.tsx`**: `font-mono` on the "+X to finished goods" quantity and the RM-required table figures, same consistency reasoning.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/WeekTimelineRail.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ItemStockContext.tsx
  - src/app/(planning)/planning/production-plan/_components/InventoryImpactPanel.tsx
  - docs/portal-os/tranches/117-production-plan-visual-amplify.md

## Revive directives (if any)
revive: []

## Out-of-scope
- No new color tokens, no `globals.css` / `tailwind.config.ts` changes — only existing utility classes (`font-mono` is already portal-wide infrastructure).
- No new fonts, no bundle-size change.
- No change to `ProductionNoteCard.tsx`, `RecipeOverridePanel.tsx`, `useDialogA11y.ts`, or any data/mutation/hook file — presentation-only on the six files listed.
- No new operator capability, no scorecard-category claim (precedent: 111, 114 landed the same way).
- No change to any `data-testid` attribute — existing Playwright/vitest coverage must not need updates.

## Tests / verification
- typecheck clean (`npx tsc --noEmit`)
- `npx eslint` on all 6 touched files — 0 new errors
- `npx vitest run` — full suite stays green at whatever count it's currently at (presentation-only tranche, no new test cases expected — matches tranche 111 precedent)
- Real render verification (populated week, both desktop + mobile viewports) via the same dev-shim + Playwright approach used for tranche 116, screenshots before/after
- `/ux-release-gate` sweep scoped to this tranche's files before merge (same protocol as tranche 116)
- regression-sentinel: no baseline regressions

## Exit evidence
- Before/after screenshots (desktop + mobile)
- vitest N/N pass count
- PR link

## Rollback
Revert the PR — six edited files regain their prior state; no data-layer, hook, or testid changes, so revert is clean and cannot break any other surface.

## Operator approval
- [x] Tom approves this plan (confirmed in session chat, 2026-07-02: "זה הכיוון שרציתי", after reviewing the grounded critique + proposed direction)

## Actual evidence (filled in by /portal-tranche-fix run)

- Files touched (exactly the manifest, no scope creep): `page.tsx`, `WeekTimelineRail.tsx` (full rewrite), `ProductionDayLane.tsx`, `ProductionJobCard.tsx`, `ItemStockContext.tsx`, `InventoryImpactPanel.tsx`.
- `npx tsc --noEmit`: 0 errors.
- `npx eslint`: 0 errors, 1 pre-existing unrelated warning (page.tsx:246, predates this tranche).
- `npx vitest run`: **849/849** passed — unchanged count, confirming this is genuinely presentation-only (no new test cases needed, matches tranche 111 precedent).
- Real render (dev-shim + `/opt/pw-browsers/chromium`, populated-week fixture with mixed plan states): confirmed the chrome compression, the WeekTimelineRail today-anchor band, and font-mono numeric language all render as designed on desktop (1440×900) and mobile (390×844).

### /ux-release-gate sweep (5 parallel audits, scoped to this tranche's 6 files) — zero P0s

**Fixed (this tranche, before merge):**
- **COPY-001 (P1)** — the compressed banner sentence had drifted from `portal_ux_standard.md` §5's canonical wording ("only" dropped, "actuals" not in the approved lexicon). Restored: "Inventory updates only after actual production is reported."
- **A11Y-001 (P1) / INTER-117-01 (P1) / VISUAL-003 (P2)** — three audits converged on the same nav-links element from different angles: `text-fg-faint` measured ~2.10:1 contrast (WCAG 1.4.3 fail), no vertical padding gave sub-32px touch targets, and `ml-auto` collapsed to left-aligned when the div wrapped to its own row on mobile. One fix resolved all three: `text-fg-muted` (passes at ~5.75:1), `py-2` per link, and `w-full sm:w-auto justify-end sm:justify-start` on the container. Verified the computed `justify-content: flex-end` actually applies via a direct DOM inspection (not just visual read — at 390px the three links nearly fill the row width, so the alignment shift is real but visually subtle).
- **FLOW-117-01 (P2)** — the three nav links used to live inside the `plansQuery.isLoading` ternary and were unreachable from the status bar for the ~1-2s initial load. Restructured so they're a permanent sibling, always rendered.
- **COPY-003 (P2)** — "25% done" → "25% complete", matching the "Completed" status term used on individual plan chips elsewhere on this page.
- **VISUAL-001 (P2)** — WeekTimelineRail baseline track `bg-border/25` measured ~4% contrast against the page background (functionally invisible at normal brightness) → `bg-border/40`.
- **VISUAL-002 (P2)** — the overdue-day underline used `bg-danger/60` while the same state's dot and day-name use the warning-amber family; two color semantics on one state. → `bg-warning/60`.
- **A11Y-002 (P2)** — WeekTimelineRail's non-today date labels at `text-fg-faint text-[10px]` measured ~2.10:1 (WCAG fail) → `text-fg-muted` (today's date label was already `text-fg-strong` and unaffected).
- **A11Y-003 (P2)** — the status bar carries dynamic KPI counts that change on every week navigation with no live-region announcement → added `role="status"` (implicit `aria-live="polite"`).
- **INTER-117-02 (P2)** — the vertical divider between the caveat and KPI stats was `hidden` below the `sm` breakpoint, leaving a ~490-639px band where the caveat sentence and first stat could visually run together → replaced with an always-visible `·` separator matching the idiom used between the stats themselves.
- **INTER-117-03 (P2)** — the UOM label next to each card's hero quantity inherited `font-mono` from its parent (unintentional — the tranche's stated intent was numbers only, not labels), adding unnecessary width for longer UOMs on narrow lanes → added `font-sans` override.

**Deliberately not implemented (documented, not silently dropped):** **VISUAL-004** — the visual audit flagged that "Planned only." reads with less visual weight than its old dedicated-banner treatment, and itself offered "or explicitly accept the de-emphasis as intentional" as a valid resolution. Restoring "only" via COPY-001 already strengthens the sentence's own force; adding a colored chip/dot prefix on top would partly undo the chrome-compression this tranche exists to deliver, and is a design-register decision better made explicitly by Tom in a follow-up than unilaterally added here.

**Re-verified after fixes:** `tsc` 0 errors, `eslint` 0 errors (same 1 pre-existing warning), `vitest` 849/849. Re-rendered both viewports to confirm every fix visually as intended, including a direct computed-style DOM check (not just a screenshot read) for the nav-links alignment fix.

**Verdict: SHIP.** Zero P0s before or after fixes; all four P1s resolved; all P2s fixed except one explicitly-reasoned deferral.

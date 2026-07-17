# Tranche 133 — Procurement / weekly-meeting corridor: close-the-loop follow-ups

**Status:** implemented (pending merge)
**Origin:** Tom-directed (2026-07-16 chat, continuation of the tranche 130-132 procurement-corridor rebuild): "בסוף תתמקד במסך שבו מתבצעת הפגישה השבועית ותשאל אותי שאלות שעולות לך שם מבחינת שיפורים אפשריים... אסור שיהיה מצב שאין פתרון לבעיה כלשהי שעולה שם" — four concrete questions were asked back with a recommendation on each; Tom approved "רוץ עם ההמלצות שלך" (run with your recommendations). Same corridor as tranche 132 (`/planning/procurement`, the weekly-meeting triage screen); no new tranche number was active, so this opens 133 rather than editing 132 post-merge.
**Scope:** `/planning/procurement` triage stage only — same boundary as 132. No portal-side backend authoring beyond the one additive field described below.

## The four questions this tranche closes

1. **Recount-loop closure** — after a planner sees a "לספור קודם" (count first) chip, counts the item, there was no path back to updated recommendations short of hunting for the header's generic "הרצת מושב חדש" button.
2. **Warnings → direct fix-links** — session warning chips explained a problem (tooltip) but never linked to where to fix it; only the double-buy case had any per-row treatment, and even that was tooltip-only.
3. **Mobile IntegrityStrip** — the freshness strip (drift/counts/forecast/firmed-weeks/warnings chips) wrapped to several lines on a phone, pushing the actual order list below the fold before showing anything actionable.
4. **`--fg-faint` contrast** — flagged but deferred at the tranche 132 `/ux-release-gate` run (A11Y-006).

## Changes

1. **`IntegrityStrip` — "רענון המלצות" action.** Shown only when the input actually looks untrustworthy (stock-verification drift, any stale/never-counted lines, or a `stale_stock_input` warning) — never a standing button on a clean session. Calls the page's existing `handleStart` mutation (the same supersede-confirm flow as the header's "הרצת מושב חדש"), so a planner who just finished a physical count gets one click, right next to the count-freshness signal, back to numbers that reflect it. No new mutation, no bypass of the existing "unsaved approvals will be lost" confirm.
2. **Click-to-fix warning chips.** `session-warnings.ts` now resolves a concrete `href` per warning code: `po_missing_expected_delivery` / `po_overdue_receipt` → the first affected `/purchase-orders/[po_id]`; `components_without_supplier` → the affected master-data record, `/admin/masters/components/[id]` or `/admin/masters/items/[id]` depending on `is_item` (see backend change below); `stale_stock_input` has no href by design — its fix *is* the refresh action in (1), not a navigation target. Chips with a resolved href render as real links (`IntegrityStrip`'s chip row, and `ActionList`'s row-level inbound-issue chip, previously tooltip-only even for the flagship double-buy case) with the existing recount-chip a11y pattern (aria-label + title on the link, not a nested tooltip). A chip with no resolvable target (missing `po_id`, pre-migration session) degrades to a plain tooltip badge — never a guessed or broken link.
3. **`components_without_supplier` carries `is_item` (backend, `gt-factory-os` migration 0286).** The warning's source query (`_ps_orders`, STEP 6 of `fn_generate_purchase_session`) already has `is_item` on every row — the two sibling PO-hygiene warnings already expose it, this one just left it out of its `jsonb_build_object`. Additive field, no behavior change. Applied to prod and verified live (deployed function source confirmed to carry the field). The portal parses it defensively (`isItem: boolean | null`) — `null` on sessions generated before 0286 means "no link", never a guess.
4. **Mobile collapse.** `IntegrityStrip` now renders a one-line collapsed summary below `sm` (status word or "N לבדיקה" issue count + chevron, same tone-coloring as the chips it summarizes) that expands to the full chip row on tap. Desktop (`sm:` and up) is unchanged — always the full row. Pure CSS-breakpoint + one boolean of local state; the full detail content stays in the DOM either way (nothing is lost to assistive tech or to `textContent`-based tests).
5. **`--fg-faint` contrast (`globals.css`).** Was 2.01:1 (light) / 2.90:1 (dark) against the page background — well under WCAG AA (4.5:1) for the real informational text this token carries (timestamps, item/line counts, coverage captions), not just decoration. Recomputed via a small Node script (HSL→sRGB→relative-luminance, not eyeballed): light `30 4% 68%` → `30 4% 41%` (4.95:1 vs `--bg`, 4.64:1 vs `--bg-subtle`); dark `42 5% 38%` → `42 5% 51%` (4.71:1 / 4.32:1). Documented in-file: the light-theme fix makes `--fg-faint` slightly darker/more-prominent than `--fg-subtle` (54%) — a deliberate swap, not an oversight, since `--fg-subtle` itself only reaches 3.09:1 and a full ladder re-balance was out of scope for this pass. App-wide token change (not scoped to procurement) since the finding was app-wide.

## Files

- `src/app/(planning)/planning/procurement/_lib/session-warnings.ts` (extended — `poFixHref`, `unassignedFixHref`, `parseUnassignedTargets`, `inboundIssuePrimaryHref`, `WarningChip.href` + tests)
- `src/app/(planning)/planning/procurement/_components/IntegrityStrip.tsx` (refresh action, click-to-fix chip links, mobile collapse + tests)
- `src/app/(planning)/planning/procurement/_components/ActionList.tsx` (inbound-issue chip is now a real link + test)
- `src/app/(planning)/planning/procurement/page.tsx` (wires `onRefresh`/`refreshPending` into `IntegrityStrip`)
- `src/app/globals.css` (`--fg-faint` light + dark)
- `gt-factory-os/db/migrations/0286_components_without_supplier_is_item.sql` (companion backend change)
- `docs/portal-os/tranches/133-procurement-weekly-meeting-followups.md` (this file)

## Evidence

- `npx tsc --noEmit` → clean.
- `npx vitest run` (full suite) → **926/926 pass** (10 new: session-warnings W6-W9, ActionList L13, IntegrityStrip S4a/S4b/S4c/S5/S6).
- 0286 applied to Supabase project `rvadsozabmxkkrktwgnv` and verified live: the deployed `fn_generate_purchase_session` source now contains `'target_id', target_id, 'is_item', is_item` in the `v_unassigned` query.
- Real dev server + Playwright (`PW_CHROME_PATH` sandbox Chromium), `tests/e2e/ux-shot.spec.ts` harness plus a throwaway interaction spec (not committed): desktop + mobile, light + dark, both collapsed and expanded mobile states screenshotted and eyeballed; confirmed live (not just unit-tested) that `components_without_supplier` resolves to `/admin/masters/components/[id]` and the PO warnings resolve to `/purchase-orders/[po_id]`; confirmed the refresh action appears/disappears correctly and both new `--fg-faint` values read as legible-but-quiet in the actual rendered page, both themes.

## Deliberately NOT in this tranche

- `--fg-subtle`'s own sub-AA light-theme contrast (3.09:1) — surfaced as a byproduct of the `--fg-faint` fix, needs its own audit of where it's used before touching it (may be safe at large-text/decorative sites, unverified).
- A11Y-003 (reduced-motion global token), A11Y-004 (alertdialog focus, pre-existing), A11Y-010 (single Tooltip.Provider hoist) — pre-existing `/ux-release-gate` P1/P2 leftovers, unrelated to this batch of four questions.
- ₪-at-risk trend vs. previous session — still needs a "previous session" definition (carried over from 132).

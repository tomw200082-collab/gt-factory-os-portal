# Tranche 135 — Procurement corridor: deepened-gate P0 + S-effort P1 batch

**Status:** implemented (pending merge)
**Numbering note:** originally authored as tranche 134; renumbered to 135 after #174 (report-return-to-plan-card) merged with that number from a parallel session.
**Origin:** `/ux-release-gate` deepened re-run 2026-07-21 (`gt-factory-os-production-brain` `docs/phase8/dry-runs/UX-RELEASE-GATE-procurement-corridor-deepen-2026-07-21.md`, PR #48 — HOLD, 1 P0). Tom approved dispatch in chat 2026-07-21 ("צא לדרך") per the report's "Next action": close INT-P0-1 + the S-effort P1 rows 2–14. M-effort rows (FLOW-102/103, INT-104, COPY-102) and prior-open FLOW-9 / VISUAL-12 / A11Y-2 are explicitly deferred to tranche 136.
**Scope:** one tranche, procurement corridor only (`/planning/procurement` components + `/purchase-orders/placement-queue`). No backend/schema authoring. No `--fg-subtle` token change (site-level swap only, per the gate's S-path).

## Findings closed (gate IDs)

1. **INT-P0-1 (P0)** — double-tap "רענון המלצות" bypassed the supersede confirm: first tap armed `confirmingStart` in the page with zero feedback at the strip button (still enabled — `refreshPending` only tracked `startMut.isPending`), second tap fell through `handleStart`'s guard and fired `supersede:true` silently. Fix: page now passes `refreshConfirming={confirmingStart}` to `IntegrityStrip`; while armed the button is disabled and reads "ממתין לאישור…", so a second tap cannot land and the waiting state is visible at the button itself.
2. **INT-105** — refresh action was invisible on mobile (lives in the collapsed strip detail): collapsed bar now shows a "· רענן" hint (icon + text) whenever the refresh action is available inside.
3. **FLOW-101** — "ללא ספק" click-to-fix chip routed planners into the `(admin)` group (`RoleGate minimum="admin:execute"`) → hard "Access restricted" wall. Chip href is now capability-gated at render (`useCapability("admin:execute")`): non-admins get the tooltip-only badge with an explicit "נדרש מנהל" note — never a dead-end link.
4. **INT-101** — Escape with the FocusCard cancel-with-reason panel open closed the whole FocusMode overlay and silently discarded the typed reason. Panel now handles Escape locally (stops propagation, closes just the panel), and an armed cancel panel (reason selected/typed) counts as dirty so overlay close asks confirm.
5. **INT-102** — PlacementRow expand panel and cancel panel could be open simultaneously (place + cancel CTAs stacked): the toggles are now mutually exclusive.
6. **INT-103 (+A11Y-018)** — placement-queue "נקה סינון" was a bare text-3xs link with no touch target: now `inline-flex min-h-[2rem] items-center px-2`, matching the ActionList twin (INTER-204 pattern).
7. **FLOW-104 (=COPY-06)** — `can_wait` deadlines are extrapolated but rendered without the mandated "~": `decision.ts` can-wait `whyNow` and the ActionList "להזמין עד" caption now carry "~" when trace math produced the date (v1-fallback dates stay plain).
8. **FLOW-105** — cancel-success banner had no path to the PO where the reason persists: `cancelled` state now captures `po_id` and the banner links "צפה בהזמנה" (mirrors the place banner).
9. **COPY-101** — FocusMode never received the tranche-130 corridor vocabulary: flash "ההזמנה נוצרה" → "ההזמנה הועברה לביצוע"; DoneSummary "N בוצעו" → "N הועברו לביצוע" (both branches).
10. **VIS-101** — cancel trigger grammar unified: FocusCard's `Ban` icon → `XCircle` (the corridor icon), PlacementRow's icon-only trigger gains a visible "בטל עם סיבה" label on `sm:`+ (aria-label unchanged on mobile).
11. **A11Y-101** — FocusCard cancel-reason `<select>` now labeled (`htmlFor`/`id`), mirroring PlacementRow.
12. **A11Y-102** — FocusCard cancel trigger now `aria-expanded`; opening the panel moves focus to the reason select.
13. **A11Y-103** — placement queue filter now announces the match count via an `sr-only` `role="status" aria-live="polite"` region (mirrors ActionList A11Y-005 wording).
14. **A11Y-104** — `--fg-subtle` (3.09:1 light) removed from real data in FocusCard: thead + recommended-qty cells → `text-fg-muted`. (Token itself untouched — ladder rebalance stays deferred.)

Declared micro-extra (same lines as INT-P0-1's button): **A11Y-201** — the refresh spinner gains `motion-reduce:animate-none`, matching PlacementRow's Loader2.

## Files

- `src/app/(planning)/planning/procurement/page.tsx` (pass `refreshConfirming`)
- `src/app/(planning)/planning/procurement/_components/IntegrityStrip.tsx` (P0 wiring, mobile hint, capability-gated chip href, motion-reduce)
- `src/app/(planning)/planning/procurement/_components/FocusCard.tsx` (Escape handling, dirty-on-cancel, label/id, aria-expanded, focus move, XCircle, text-fg-muted)
- `src/app/(planning)/planning/procurement/_components/FocusMode.tsx` (vocabulary)
- `src/app/(planning)/planning/procurement/_components/ActionList.tsx` ("~" on wait-until caption)
- `src/app/(planning)/planning/procurement/_lib/decision.ts` ("~" in can-wait whyNow)
- `src/app/(planning)/planning/procurement/_lib/decision.test.ts` (assertion update)
- `src/app/(planning)/planning/procurement/_components/IntegrityStrip.test.tsx` (new: armed-confirm disable; admin-degrade)
- `src/app/(po)/purchase-orders/placement-queue/page.tsx` (banner link, touch target, live region)
- `src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx` (panel exclusion, visible label)
- `src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx` (new: mutual exclusion)
- `docs/portal-os/registry.md` (+1 line), `docs/portal-os/tranches/_active.txt`, this manifest

## Evidence

- `npx tsc --noEmit` → clean (exit 0).
- `npx vitest run` (full suite, post-rebase on #174) → **935/935 pass** — 3 new tests: IntegrityStrip S7 (armed-confirm disables refresh — the P0 regression test), S8 (admin-target chip degrades for non-admin), PlacementRow panel mutual exclusion. Note: this tranche originally carried its own fix for the recipe-health fixture time bomb (7 tests red repo-wide from 2026-07-19); tranche 134 (#174) landed the same repair first, so the duplicate commit was dropped in rebase.
- `npx playwright test --grep @mocked` (dev-shim auth, sandbox Chromium via `PW_CHROME_PATH`): procurement-focus + placement-queue + procurement → **9/9 pass**; meeting → **5/5 pass**.
- `decision.test.ts` assertion updated for the "~" contract (V3 can-wait string).

## Deliberately NOT in this tranche (→ 136)

FLOW-102 (skip_reason DTO + render), FLOW-103 (recount prefill + return link — touches `/stock/physical-count`, outside this corridor scope), INT-104 (URL-param filter state), COPY-102 (shared cancel-reason catalogue — needs Tom's preset decision), FLOW-9, VISUAL-12, A11Y-2/003/004/010, and all P2s except the declared A11Y-201 micro-fix.

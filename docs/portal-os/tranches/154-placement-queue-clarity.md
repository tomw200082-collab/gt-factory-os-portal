# Tranche 154 — placement queue clarity + visual rebuild (הזמנות לביצוע)

**Status:** in progress
**Origin:** Tom, 2026-07-30: "חייבים לשפר את דף ביצוע הרכש שדורין עובדת עליו… הוא לא מובן ולא מספיק ברור לשימוש. חייבים לשפר בו גם את העיצוב וגם את חוויית המשתמש." Approved as tranche 154 after the full `/ux-release-gate` run.
sizing: M
scorecard_target_category: ops_surface
expected_delta: the office manager can scan the queue and know — without training — which supplier to call first, what each row's state is, and what the next action on it is. Placement itself already worked; this makes it legible.

## Source of truth for this tranche

Gate report: `PRODUCTION/docs/phase8/dry-runs/2026-07-30-ux-release-gate-placement-queue.md`
(verdict HOLD — 1 P0, 32 P1, 12 P2; evidence in `assets/uxg-2026-07-30/`).
This tranche executes **ranked actions #1–#21** (all S-effort) plus the three M-effort items Tom
approved with them (#22 grouping decision, #23 order-document order, #27 radiogroup semantics),
and opportunistically closes the P2s that are one-liners inside the same code.

## The case (Tom's words, translated)

The procurement *timing* logic is good. The *page* is not understandable. Both the visual design and
the UX must improve.

## What was actually wrong

The P0 is a hierarchy collapse: the supplier name printed twice per row — once as the group heading,
once as the row's own primary label, at the same size and weight, 8–12px apart. Every row read as a
duplicate of its own container, so the eye had no anchor and the supplier→order structure was
invisible. Around it, urgency ("באיחור") was buried mid-way through a six-part dot-separated metadata
string; a row needing scheduling looked identical to one ready to place; dates rendered as ISO
`YYYY-MM-DD` and native date pickers rendered `mm/dd/yyyy` inside a Hebrew RTL page; and the schedule
panel spoke planner-system Hebrew ("מידע נעול מהשרת", "סיבת סיכון") at exactly the moment the order
is already late.

## Design decisions (recorded — some deviate from the literal gate proposal)

1. **The organizing unit is the phone call.** A supplier group = one call. Groups are therefore kept
   (not flattened) and **ordered by their most urgent member**, with the group's worst state shown as
   a chip on the group header. This resolves FLOW-110's tension in the direction Tom approved: the
   flow auditor was right that urgency must drive order; the interaction auditor was right that
   grouping enables one call per supplier. Ordering the groups by urgency gives both.
2. **Hierarchy ladder built by promotion, not demotion.** The gate proposed shrinking the group
   heading to `.eyebrow`. Deviation: since the supplier name now appears exactly **once**, it is the
   call target and stays prominent (`text-base font-semibold text-fg-strong`); the *row* is demoted
   instead — it leads with a status chip plus mono PO number, which is visually lighter than the old
   bold supplier name. Same three-step ladder, correct direction: supplier → order → metadata.
3. **Status is a chip at the RTL start edge, plus a tone rail on the row.** Urgency is readable before
   any text is parsed. Colour is never the only signal — every chip carries an icon and a word.
4. **No auto-expanding panels in a list.** The schedule panel no longer springs open on mount (it
   pushed rows below the fold on mobile). The row advertises "נדרש תזמון" instead, and after a
   schedule is saved the row auto-advances into the pricing panel — the step that was previously a
   dead end.
5. **Frozen design system respected.** No token, `globals.css`, or `tailwind.config.ts` change. Every
   new visual uses existing primitives (`.chip*`, `.segmented`, `.eyebrow*`, `.btn*`, tone tokens).
   Hebrew chips compose `normal-case tracking-normal` over `.chip` since the base class is
   English-oriented (`uppercase tracking-sops`).
6. **Native semantics over ARIA emulation.** The supply-outcome trio becomes real radio inputs in a
   fieldset (sr-only inputs + styled labels) rather than `role="radio"` buttons with a roving
   tabindex — native keyboard and native announcement, less code.
7. **VIS-102's proposed fix does not work; the finding is still real.** The gate proposed adding
   `lang="he"` to the RTL root so `<input type="date">` renders DD/MM/YYYY. Verified against a
   render: it does not. Chromium formats date inputs from the **browser's** locale and ignores the
   document language, so on an en-US browser the widget still showed `08/09/2026` for the 9th of
   August — the exact ambiguity the finding was about. `lang="he"` is correct for other reasons and
   stays, but the guarantee now comes from a `DateEcho` that prints the selected date in Israeli
   format beside every date input. Unambiguous on any browser locale; `aria-hidden`, since the input
   already announces its own value.

## Manifest (files that may be touched)
manifest:
- src/app/(po)/purchase-orders/placement-queue/page.tsx
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx
- src/lib/utils/format-date.ts
- src/lib/utils/format-quantity.ts
- src/lib/utils/format-date.test.ts
- tests/e2e/placement-queue.spec.ts
- docs/portal-os/tranches/154-placement-queue-clarity.md
- docs/portal-os/tranches/_active.txt

## Out-of-scope
- `globals.css` / `tailwind.config.ts` / design tokens (frozen).
- Backend contracts, schema, migrations. In particular `split_po_number` (gate P2) is **not** added —
  the portal instead guards defensively against a non-friendly identifier.
- `COPY-110` (shared cancel-reason catalogue across PlacementRow and FocusCard) — still blocked on
  Tom picking the per-role subset. Not touched here.
- The `/planning/procurement` corridor and its open P0 from the 2026-07-21 gate.

## Language
`/purchase-orders/placement-queue` is on the authorized Hebrew-operator-label list (CLAUDE.md, Tom
2026-06-20) — Hebrew + `dir="rtl"` throughout, including all new and rewritten copy.

## Findings closed by this tranche

P0: VIS-101.
P1: FLOW-111, FLOW-112, FLOW-116, INTER-101, INTER-102, INTER-103, INTER-104, INTER-105, INTER-106,
VIS-102, VIS-103, VIS-104, VIS-105, VIS-106, VIS-108 (with FLOW-114/INTER-109/USBL-104/COPY-113),
VIS-109, COPY-102, COPY-103, COPY-104, COPY-105, COPY-106, COPY-107, COPY-108, COPY-109, A11Y-101,
A11Y-102, A11Y-103, A11Y-104, A11Y-105, USBL-101, USBL-102, USBL-103. FLOW-110 resolved per decision 1.
P2: COPY-101 (defensive guard), COPY-111, COPY-114, FLOW-115, VIS-107, VIS-110, A11Y-107, A11Y-108,
A11Y-109.
Not closed: COPY-110 (Tom decision pending), INTER-108 (`<form>` wrapper — deferred, interacts with
the confirm-dialog flow), A11Y-106 (`--fg-subtle` contrast — token-level, frozen).

## Tests / verification
- `npx tsc --noEmit` → 0 errors.
- `npx eslint .` → 0 errors.
- `npx vitest run` → green, incl. new `PlacementRow.test.tsx` cases: collapsed row renders the
  supplier name zero times; status chip precedes the PO number; needs-schedule rows do not auto-open
  the schedule panel; schedule submit stays disabled while a required late-reason is empty; header
  toggles lock during placement; supply radios are a native radiogroup; `formatIsraeliDate` unit tests.
- `npx playwright test --grep @mocked` → green.
- Re-render both viewports through `tests/e2e/ux-shot.spec.ts` and attach before/after evidence.

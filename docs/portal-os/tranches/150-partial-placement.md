# Tranche 150 — partial placement of a purchase order (ביצוע חלקי)

**Status:** verified — all gates green
**Origin:** Tom, 2026-07-26 (`/ck:grill` session). Backend companion **merged + live in prod**: `gt-factory-os` PR #187, migration `0298_partial_placement_split`.
sizing: M
scorecard_target_category: ops_surface
expected_delta: the office manager can place only what the supplier actually confirmed; the unplaced remainder splits onto a sibling PO with a reason instead of being placed as phantom supply or discarded wholesale.

## The case (Tom's words)

Two components ordered from one supplier. He has one, not the other. Order what he has; the rest gets ordered from a different supplier — **with a reason**.

Today placement is all-or-nothing: `בצע הזמנה` flips the whole PO to `OPEN`. So Dorin either places lines the supplier never confirmed, or discards the entire order.

## Why it matters beyond convenience

Placing the whole PO flips **every** line to `OPEN`, and the netting `po_supply` CTE counts an `OPEN` line on an `OPEN`/`PARTIAL` PO as **incoming supply**. A line the supplier never had becomes **phantom supply masking a real shortage** — the class of failure the guardian caught on `PKG-BOTTLE-1L`. The sibling PO sits in `APPROVED_TO_ORDER`, which is *not* counted, so the remainder correctly reads as still-needed.

## Backend contract (already live — this tranche only consumes it)

`POST /api/purchase-orders/:po_id/place` accepts two new optional fields:

| Field | Meaning |
|---|---|
| `unplaced_lines: [{ po_line_id, unplaced_qty }]` | what the supplier could **not** supply. `unplaced_qty` equal to the line's `ordered_qty` moves the whole line. |
| `split_reason: string` | required whenever `unplaced_lines` is non-empty (422 otherwise). |

Response gains `split_po_id: string | null` — the sibling PO created for the remainder.

Backend guards: `NOTHING_PLACED` (nothing left to place is a *cancellation*, use the existing discard path), `SPLIT_REASON_REQUIRED`, `INVALID_QTY`.

## Design decisions (Tom delegated these — recorded here)

1. **Three states per line**, not a separate mode: `✅ הוזמן במלואו` (default) / `➗ הוזמן חלקית` + qty / `❌ לא הוזמן`. The qty input appears **only** on the middle state.
   *Why:* the common path ("supplier had everything") stays exactly one tap on `בצע הזמנה` with zero new work. Friction appears only when reality is messy.
2. **One reason per split**, not per line — a split is one supplier conversation. Preset chips + free text, required.
3. **MOQ / order-multiple violations warn, never block** — when the supplier says "40 is all I have", that *is* physical truth (same doctrine as the picking flow).
4. **Confirm dialog must itemise** what is placed vs what splits off. This is DR-019's exact P0 ("confirm dialog doesn't disclose quantity overrides") — the previous attempt at this UI (PR #164) shipped that bug and never landed.
5. **No new supplier-picking UI** — the sibling lands back in this same queue, where the existing `SwitchSupplierControl` (tranche 140) retargets it.

## Manifest (files that may be touched)
manifest:
- src/app/(po)/purchase-orders/placement-queue/_lib/api.ts
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx
- src/app/(po)/purchase-orders/placement-queue/page.tsx
- tests/e2e/placement-queue.spec.ts

## Out-of-scope
- globals.css / tailwind.config.ts / design tokens (frozen).
- Backend contracts, schema, migrations (already shipped in gt-factory-os#187).
- Changing the discard-with-reason path (tranche 130) or switch-supplier (tranche 140).

## Language
`/purchase-orders/placement-queue` is on the **authorized Hebrew-operator-label list** (CLAUDE.md, Tom 2026-06-20) — Hebrew + `dir="rtl"` throughout, including all new copy.

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint .` → 0 errors.
- `npx vitest run` → green, with new `PlacementRow.test.tsx` cases: default all-full sends no `unplaced_lines`; partial state requires a reason before `בצע הזמנה` enables; whole-line-❌ on every line is refused client-side and points at discard.
- `npx playwright test --grep @mocked` → green.

## Rollback
Revert the commit. Component + data-layer only; the backend fields are optional, so reverting restores exactly today's all-or-nothing behaviour.

## Operator approval
- [x] Tom, 2026-07-26: "תבנה את המסך כך שהכל יעבוד בפרודקשן ב100%".

## Actual evidence (build run 2026-07-26)
- `npx tsc --noEmit` → **0**.
- `npx eslint .` → **0 errors**; scoped lint of the changed directory leaves only one pre-existing warning (`page.tsx:49`, untouched by this tranche). One unnecessary `eslint-disable` I had added was removed rather than left dangling.
- `npx vitest run` → **130 files / 1094 tests green**, incl. 5 new `PlacementRow.test.tsx` cases:
  1. default = every line fully supplied → no split panel, action reads `בצע הזמנה`
  2. partial qty opens the split panel and blocks placing until a reason is chosen; action renames to `בצע חלקית`
  3. a partial qty equal to (or above) the ordered amount is rejected inline and disables the action
  4. all-lines-not-supplied is refused, points at `בטל הזמנה`, and **never reaches `/place`**
  5. payload contract: sends `unplaced_lines` + `split_reason`, omits both on a full placement
- `npx playwright test tests/e2e/placement-queue.spec.ts` → **6/6**, incl. one new end-to-end journey that drives the real UI: 6-of-10 on one line + none of a second, asserts the **itemised confirm** (`מבוצע כעת` / `לא סופק` / the reason), the exact request body (`unplaced_lines: [{L1,4},{L2,4}]`), and the success banner naming the sibling PO.
- `npx playwright test --grep @mocked` → **56/56 green** — no regression anywhere, including the `/production` corridor from tranches 145–149.

### One regression this caught in my own work
Replacing the disabled-button `title` with a per-cause message broke the **DR-018 INTER-003** test, which pins a tooltip naming *both* price and payment terms. Rather than weaken that contract I kept the original wording for the price/term cases and gave only the new tranche-150 gates their own specific messages.

## Verdict
The office manager can now place exactly what the supplier confirmed. The remainder becomes its own order in the queue with a reason attached, retargetable to another supplier via the existing control — and because it sits in `APPROVED_TO_ORDER` it is never counted as incoming supply, so it cannot mask a real shortage.

# Tranche 156 — supplier-confirmed quantity above the approved amount (+15%), and one cancel vocabulary

**Status:** built — tsc 0, eslint 0, vitest 1137/1137, playwright @mocked 56/56
**Origin:** Tom, 2026-07-30, in writing: *"צריך להיות אפשרות ביטול והזנה של הזמנה של יותר ממה שנקבע
בעד 15% יותר ממה שנקבע בדף הרכש"* — plus a standing instruction for how to decide the open items:
*"תחשוב על כל החלטה מנקודת מבט של — איך יהיה הכי פשוט למשתמש לעבוד בצורה דינמית שתעצור את העבודה
כמה שפחות ותהיה כמה שיותר בהירות ומיקוד."*
sizing: M
scorecard_target_category: ops_surface
expected_delta: the office manager records what the supplier actually confirmed — less, exactly, or up
to 15% more — without leaving the row, and one shared cancel vocabulary makes the audit trail line up
across the corridor.

## 1. Over-supply up to +15% (the new requirement)

**The problem it fixes.** The row asked "did he supply it all, part of it, or none?" — a question with
no truthful answer when the supplier sends *more* than approved (pack sizes, MOQ rounding, a
substitution). The office manager either placed a quantity she knew was wrong, or stopped and phoned
the planner. Work stopped for a case that is completely ordinary.

**The design.** The middle state stops meaning "less" and starts meaning **"כמות אחרת"** — one input,
one number, valid anywhere in `(0, approved × 1.15]`:

| She types | What happens |
|---|---|
| below approved | remainder splits onto a sibling PO — unchanged tranche-150 behaviour |
| exactly approved | placed as approved; no split, no override |
| above approved, ≤ +15% | line quantity raised via the existing `line_qty_overrides` contract (0261); **no split** |
| above +15% | refused inline, naming the ceiling in real units, and pointed at the planner |

One control, no new mode to learn, and the common path (he sent exactly what we approved) still costs
zero extra taps.

**Why the ceiling exists, and why it is refused rather than warned.** Below +15% this is a placement
detail. Above it, the money and the stock projection move enough that it is a planning decision, not
a placement one — so it stops here instead of quietly becoming supply nobody planned for. The message
names the limit, the approved amount, and who to talk to.

**Disclosure.** DR-019's rule — a confirm dialog must never hide a quantity change — now covers
over-supply too: the dialog itemises each raised line, the new quantity, the percentage over, and
says the cost rises accordingly. This is the exact bug that sank PR #164; it does not get to come
back through the other door.

**Cancel.** The discard-with-reason path (tranche 130) is unchanged and still the answer for "don't
place this at all" — including from the over-supply state. `nothingPlaced` still routes there rather
than 409'ing.

**No backend change.** `line_qty_overrides` has existed since migration 0261 and its Zod schema caps
nothing (`ordered_qty` positive). The +15% rule is the portal's, deliberately: it is a business
policy, and policy that might change belongs where it can change in one line.

## 2. COPY-110 — one cancel vocabulary, two subsets (decided, not deferred)

Open since the 2026-07-16 gate, waiting on "Tom picks a per-role subset". Decided under his standing
instruction above.

**Not one flat list.** Merging the two would make every cancel a scan through options that cannot
apply at that moment — slower, and less clear. **Not two unrelated lists either** — that is what
broke the audit trail.

**Shipped:** one module (`src/lib/purchase/cancel-reasons.ts`), two named subsets, and every reason
that means the same thing in both places spelled identically:

- `SESSION_CANCEL_REASONS` — planner dropping a *recommendation* ("why am I not ordering this at all?")
- `PLACEMENT_CANCEL_REASONS` — office manager discarding an *approved PO* ("why am I not placing an
  order we already approved?")
- shared, identical in both: `כבר לא נדרש`, `כפילות`; plus `אחר` free text on both, so nobody is
  stuck without a truthful answer.

## Manifest
manifest:
- src/lib/purchase/cancel-reasons.ts
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx
- src/app/(planning)/planning/procurement/_components/FocusCard.tsx
- docs/portal-os/tranches/156-over-supply-and-cancel-vocabulary.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- Backend contracts / migrations — none needed (0261 already carries the field).
- Tokens / `globals.css` / `tailwind.config.ts` (frozen).
- The cadence ripple into the brain-side ops skills (`daily-ops-guardian`'s Thursday 15:50
  queue-guard, `plan-production-14d`'s Sunday-placement assumptions, the `session_day_of_week=0`
  fence). Those are live automation, not prose — handled in the PRODUCTION lane, not here.

## Language
`/purchase-orders/placement-queue` and `/planning/procurement` are Hebrew+RTL (authorized).

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint` → 0 errors.
- `npx vitest run` → 1137/1137, with new cases: exactly +15% is accepted and sent as
  `line_qty_overrides` with no split and no reason required; +20% is refused with the ceiling and the
  planner named; a quantity equal to the approved amount sends neither override nor split; under-supply
  still splits; zero is refused with the error associated to the field.
- `npx playwright test --grep @mocked` → 56/56.

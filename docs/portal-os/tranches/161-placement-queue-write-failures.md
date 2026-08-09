# Tranche 161 — the placement queue could not write, and never said why

**Status:** built — tsc 0, vitest green
**Origin:** Tom, 2026-08-09, three screenshots in one sitting while trying to place the raw-material
orders for the 18,400-bottle 300ML run:
*"למה עדיין כתוב לי שיש פה חוסר תאריך לביצוע?"* · *"שינוי מועד ההזמנה נכשל"* ·
*"זה לא נותן לי לבצע את זה!!!"* · *"תתקן את זה שאוכל לפתוח הזמנת רכש ידנית וזה יעבוד."*
sizing: S
scorecard_target_category: ops_surface
expected_delta: the office manager can place a partial order at all, and every write failure on this
surface names itself instead of degrading to a generic sentence.

## The defects

Three, all on `/purchase-orders/placement-queue` and `/purchase-orders/new`. Two are portal-side and
fixed here; the third was the DB allocator and shipped as `gt-factory-os` migration `0317` on the
same branch.

### 1 · Partial placement was impossible (portal)

`line_prices` was built from **every** line, and `canPlace` required a positive price on **every**
line — including a line the operator had just marked `לא יסופק`. The backend cancels the unplaced
line inside `fn_place_purchase_order` and then walks `line_prices`, so pricing a line that the same
call cancels raises:

```
PO_LINE_NOT_OPEN: po_line_id=… is in status CANCELLED
```

Reproduced live against `fn_place_purchase_order` (rolled back): identical payload with the unplaced
line omitted from `line_prices` succeeds; with it present it always raises. A fully-unplaced line is
not being placed, so it takes no price — in the payload or in the gate.

### 2 · Nine of eleven write failures showed the same generic sentence (portal)

`REASON_TEXT` mapped `PO_CHANGED_REVIEW_REQUIRED` and `PO_NOT_FOUND`. The schedule and place
endpoints emit nine more, and every one of them fell through to `"שינוי מועד ההזמנה נכשל."` —
`SAFE_DATE_OVERRIDE_REQUIRED`, `SAFE_DATE_OVERRIDE_NOTE_REQUIRED`, `INVALID_SCHEDULE_DATE_PAST`,
`INVALID_SCHEDULE_DATE_BLOCKED`, `INVALID_SCHEDULE_SOURCE`, `SCHEDULE_DATE_REQUIRED`,
`SCHEDULE_PO_FAILED`, `IDEMPOTENCY_KEY_REUSED`, `PLACE_ORDER_FAILED`, plus the place-side
`PO_LINE_NOT_OPEN` / `PO_LINE_FOREIGN` / `PO_LINE_NOT_FOUND` / `INVALID_PO_LINE_ID` /
`INVALID_EXPECTED_DATE` / `EXPECTED_RECEIVE_DATE_REQUIRED`.

`SCHEDULE_DATE_IN_PAST` was in the map and is not a code the backend sends — the real one is
`INVALID_SCHEDULE_DATE_PAST`. A dead key, so the one case it was written for never matched either.

This is the same defect the file's own comment records being fixed once
(*"Tom, 2026-07-30, with a screenshot"*) — fixed for a single code while its siblings kept falling
through.

### 3 · Every new PO id collided (backend — `gt-factory-os` 0317, listed for the trail)

`fn_allocate_po_number` trusted `po_number_seq_per_year` absolutely, so rows inserted out of band
left it behind and every allocation returned a taken id → `23505` → unmapped → 503 → *"Could not
submit"* / *"הכתיבה מושהית כעת"*. Live: `next_seq = 301` while `PO-2026-00301..00306` existed. Killed
manual PO creation and partial placement (which allocates a PO for the remainder). Fixed in the
allocator, which is where all callers route through.

## Manifest
manifest:
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
- src/app/(po)/purchase-orders/placement-queue/_lib/api.ts
- docs/portal-os/tranches/161-placement-queue-write-failures.md
- docs/portal-os/tranches/_active.txt
- docs/portal-os/registry.md

## Out-of-scope
- The DB allocator itself — `gt-factory-os` migration `0317` + pgTAP `0317_*.test.sql`, backend lane,
  same branch.
- `fn_place_purchase_order` cancelling before pricing. The portal is the side that knows a line is
  unplaced, and not pricing it is both smaller and the honest payload. Reordering the function would
  make the wrong payload silently pass instead.
- The generic `"Could not submit. Check your connection and try again."` on `/purchase-orders/new`
  for 5xx. With 0317 in place the 503 it was masking is gone; giving that surface the same reason
  map is its own tranche and touches a second page.

## Language
`/purchase-orders/placement-queue` is Hebrew + RTL per CLAUDE.md (office-manager order placement).

## Tests / verification
- `npx tsc --noEmit` → 0.
- `npx vitest run src/app/(po)/purchase-orders/placement-queue/` → green.
- Backend reproduction against the live function, both directions, rolled back:
  `line_prices` without the unplaced line → OK · with it → `PO_LINE_NOT_OPEN`.

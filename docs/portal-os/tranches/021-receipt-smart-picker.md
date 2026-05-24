# Tranche 021: receipt smart-picker + PO ledger
# (Originally drafted as Tranche 020; renumbered to 021 because
#  PR #38 "economics-page-ux-polish" landed Tranche 020 on main while
#  this PR was open. Same scope, same manifest, just the file
#  number changed.)

status: in-progress
created: 2026-05-24
scorecard_target_category: ops_surface + flow_continuity
expected_delta: +1 ops_surface (clearer PO linkage UX); flow_continuity unchanged (already 8)
sizing: M (4 files + 1 page edit)

## Why this tranche

Tranche 013 (`013-receipt-po-linkage.md`, 2026-04-22) closed the PO-chain break by
making `po_id` + `po_line_id` settable from the operator side. It explicitly
deferred the UX polish: "Filtering receivable items to only those in the
selected PO's lines (deferred to a UX-polish tranche)."

Eleven months later the operator-facing reality is:

1. **The PO picker is buried.** It lives inside the header section as a
   muted "Reference PO (optional)" combobox. Operators report not realizing
   they can link a receipt to a PO at all — they fill the form blind.
2. **Per-line PO match is a native `<select>`** with the unreadable label
   `#1 · Almond flour · 30 EA open / 100 EA ordered EA [PARTIAL]`. No
   visual progress, no over-receipt callout beyond a single line of grey
   text, no suggestion when the picked item is open on a PO.
3. **No "expected today" surface.** Operator must scroll through up to
   200 OPEN/PARTIAL POs in a flat dropdown to find the one whose truck
   just backed up to the dock.
4. **No discovery from supply.** When the supplier truck shows up
   unannounced (mixed PO/no-PO flow that Tom confirmed is half the
   day-to-day), there is no way for the operator to find the matching PO
   from the item / SKU they hold in their hand.

This tranche surfaces the linkage as a first-class step, gives operators
three discovery paths (today's expected, free search, manual), and
replaces the per-line `<select>` with a progress-aware match card that
shows ordered / received / receiving-now / remaining at a glance.

## Scope

### New components (under `src/app/(ops)/stock/receipts/_components/`)
- **`ReceiptLandingPicker.tsx`** — gating chooser shown on entry when no
  `?po_id=` URL param is present and the operator has not yet picked a
  track. Three stacked cards (mobile-first):
  1. **Expected today / this week** — filters the existing OPEN/PARTIAL
     PO query client-side by `expected_receive_date`. Tap a card to
     enter PO track.
  2. **Find a PO** — combobox searching across po_number, supplier name,
     and item/component name. Same query, broader filtering.
  3. **Receive without PO** — primary CTA into manual track.
- **`POLedgerHeader.tsx`** — sticky strip rendered above the form when
  the operator is in the PO track. Shows PO number, supplier, expected
  date, an aggregate progress bar (received / ordered across all lines),
  a "View PO" link, and a "Switch PO" affordance.
- **`POLineMatchCard.tsx`** — replaces the inline `<select>` for
  per-line PO matching. Renders four progress pills
  (Ordered / Received before / Receiving now / Remaining) plus a
  proportional progress bar. Bold visual warning when "now" pushes the
  total past ordered (over-receipt) — backend still allows the post; the
  warning is informational.
- **`types.ts`** — shared types between the three components above
  (`PoOption`, `PoLineOption`, `PoLineProgress`).

### Modifications
- **`src/app/(ops)/stock/receipts/page.tsx`** — introduce a `track`
  state machine (`undecided | po | manual`), wire the landing picker,
  embed the ledger header in PO track, swap the per-line `<select>` for
  `POLineMatchCard`, and add a client-side "open on a PO" suggestion in
  manual track when the operator picks an item whose component_id /
  item_id matches an open PO line of the same supplier.

## Manifest (files that may be touched)
manifest:
  - src/app/(ops)/stock/receipts/page.tsx
  - src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx
  - src/app/(ops)/stock/receipts/_components/POLedgerHeader.tsx
  - src/app/(ops)/stock/receipts/_components/POLineMatchCard.tsx
  - src/app/(ops)/stock/receipts/_components/types.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Backend schema or API changes. The existing
  `/api/purchase-orders?status=OPEN&status=PARTIAL&limit=200` envelope
  carries everything we need; filtering by expected_date / supplier /
  item is client-side.
- Multi-PO bundle support. One receipt still attaches to at most one
  PO; the rare "delivery spans two POs" case keeps the existing
  workaround (post one receipt per PO).
- Over-receipt blocking. Per Tom: warn loudly, log exception, but allow
  the submit.
- Hebrew localization. Goods Receipt stays English-first per the durable
  contract (CLAUDE.md). The Recipe-Health Hebrew exception does not apply.
- Restructuring `goods-receipt-submit.ts` or the contract layer. The
  envelope shape is unchanged.

## Tests / verification
- `tsc --noEmit` clean.
- Manual trace:
  1. Open `/stock/receipts` with no URL param → Landing picker visible,
     form hidden.
  2. Tap an "Expected today" PO → PO Ledger Header replaces the picker,
     lines prefilled, per-line match cards show pills with correct
     ordered/received/remaining numbers.
  3. Reset → back to Landing.
  4. Choose "Receive without PO" → manual track; type a supplier; pick
     an item that exists on an open PO line of that supplier → 💡
     suggestion pill appears.
  5. Open `/stock/receipts?po_id=<uuid>` → bypasses Landing (URL-driven
     prefill preserved verbatim from Cycle 16).
  6. Submit a line with quantity > open_qty → red over-receipt callout;
     submit still succeeds.

## Rollback
Revert. The new components are additive and self-contained; page.tsx
revert restores the Cycle 16 / Tranche 013 behavior verbatim.

## Operator approval
- [x] Tom approves this plan (session directive 2026-05-24 — "תשפר את
      הקישורים של ה-goods receipt להזמנות רכש הפתוחות... תחליט בשבילי מה
      שהכי חכם וטוב ופשוט"; design decisions locked via AskUserQuestion
      flow on the same date: mixed flow, supplier+SKU discovery, 1:1
      multi-PO, over-receipt allowed with bold warning, mobile-first).

## Actual evidence
Filled in post-land.

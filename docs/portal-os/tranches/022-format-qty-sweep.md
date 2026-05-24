# Tranche 022: format-qty sweep — strip 8-dp noise from UX

status: in-progress
created: 2026-05-24
scorecard_target_category: ux_polish (cross-cutting)
expected_delta: minor (no scorecard category move; quality-of-life)
sizing: M (12 files, ~30 call sites)

## Why this tranche

Backend `qty_8dp` columns return decimal strings with eight fractional
digits ("10.00000000", "1.50000000"). Multiple surfaces render them
verbatim, polluting the UX with meaningless trailing zeros — Tom
flagged this on the freshly-shipped Smart Picker the moment Tranche 021
landed.

The portal already has `fmtNumStr()` (`src/lib/utils/format-quantity.ts`)
which trims those zeros safely for string-or-number inputs. Several
surfaces already use it (BomLineRow, production-actual, UsedInRecipes,
purchase-session, ShortageContext via a local fmtQty); the rest were
missed in earlier passes. This tranche closes the gap in one sweep so
no future surface ships raw `qty_8dp` strings again.

## Scope

For every site below, swap the raw render for `fmtNumStr(value)`. No
behavior change, no schema change, no contract change — pure display
hygiene.

### Sites (from portal-wide Explore audit)

**Recently-shipped (Tranche 021) — same-day regression fix:**
- `src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx`
  — line ~528 ("Show items ↓" expander pill)
- `src/app/(ops)/stock/receipts/_components/POLineMatchCard.tsx`
  — lines ~95, 403, 422, 427, 538 (suggestion pill, picker rows,
    progress pills, over-receipt callout)

**Purchase Orders:**
- `src/app/(po)/purchase-orders/[po_id]/page.tsx`
  — lines ~772, 776 (PO line ordered/received/open qty)

**BOMs:**
- `src/components/bom/BomNetRequirements.tsx`
  — lines ~243, 316, 402, 506 (demand qty, target qty, export header)
- `src/app/(planning)/planning/boms/page.tsx`
  — lines ~1559, 3139, 3325, 3346, 3353 (demand chip, output qty)
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/page.tsx`
  — lines ~493, 566, 578 (final_bom_output_qty in template strings)
- `src/app/(admin)/admin/boms/[head_id]/versions/[version_id]/page.tsx`
  — lines ~937, 946, 1006 (final_bom_output_qty)
- `src/app/(admin)/admin/masters/items/[item_id]/page.tsx`
  — line ~1610 (BOM summary value in template string)

**Production:**
- `src/app/(ops)/stock/production-actual/page.tsx`
  — line ~996 (component-shortage toast — other render sites in this
    file already use fmtNumStr)

**Approvals inbox:**
- `src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx`
  — lines ~240, 272, 275 (counted_quantity, snapshot_quantity)

## Manifest (files that may be touched)
manifest:
  - docs/portal-os/tranches/022-format-qty-sweep.md
  - src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx
  - src/app/(ops)/stock/receipts/_components/POLineMatchCard.tsx
  - src/app/(ops)/stock/receipts/page.tsx
  - src/app/(po)/purchase-orders/[po_id]/page.tsx
  - src/components/bom/BomNetRequirements.tsx
  - src/app/(planning)/planning/boms/page.tsx
  - src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/page.tsx
  - src/app/(admin)/admin/masters/boms/[bom_head_id]/page.tsx
  - src/app/(admin)/admin/masters/boms/page.tsx
  - src/app/(admin)/admin/boms/[head_id]/versions/[version_id]/page.tsx
  - src/app/(admin)/admin/boms/[head_id]/page.tsx
  - src/app/(admin)/admin/products/[item_id]/page.tsx
  - src/app/(admin)/admin/masters/items/[item_id]/page.tsx
  - src/app/(ops)/stock/production-actual/page.tsx
  - src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx
  - src/features/inbox/approval-inline-card.tsx

## Revive directives (if any)
revive: []

## Out-of-scope

- New formatter API. `fmtNumStr` already does the right thing.
- UOM-aware rounding (`formatQty(value, uom)`) — that helper exists
  but is overkill here; we want minimal display change. Sites that
  already use `formatQty` (e.g., BomLineRow) keep using it.
- Dashboards using integer-only `.toLocaleString()` — already correct.
- Audit/debug surfaces that intentionally show full 8-dp precision —
  none found by the audit; if any surface is added later that needs
  the raw string, leave fmtNumStr off there explicitly.

## Tests / verification
- `tsc --noEmit` clean (no API changes, just call-site swaps).
- Visual: open `/stock/receipts` Landing Picker → Show items → no
  trailing-zero strings ("10 / 10 KG" not "10.00000000 / 10.00000000 KG").
- Visual: open a PO with received_qty > 0 → ordered/received numbers
  read cleanly.

## Rollback
Revert. Each edit is a localized call-site swap; nothing chains.

## Operator approval
- [x] Tom approves this plan (session directive 2026-05-24 — "אני לא
      רוצה שזה יהיה עם מלא אפסים עשרוניים סתם ככה בלי סיבה. תשנה את
      זה וגם תעשה סקירה מקיפה בכל המערכת").

## Actual evidence
Filled in post-land.

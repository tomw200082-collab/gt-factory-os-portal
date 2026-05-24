# Tranche 023: UX/UI professional polish — replace emoji decorations with Lucide icons

status: in-progress
created: 2026-05-24
scorecard_target_category: ux_polish
expected_delta: minor (visual quality; no behavior change)
sizing: S (5 files)

## Why this tranche

Tom feedback after Tranche 022 landed: "the flow is right and comfortable
but the emojis bring down the professional feel." The portal otherwise
uses Lucide icon glyphs consistently across admin and ops surfaces;
the receipts Smart Picker and per-line Match Card (shipped in Tranche
021) were the only surface introducing emoji decorations into a
production-grade UI. Replace them.

## Scope

Swap every decorative emoji for a Lucide icon of equivalent intent.
Sizes follow the existing portal convention: 14–16 px next to body
text, 18–20 px in card headers. Stroke width inherits Lucide default.

Emoji → icon mapping:
- 🚚 (Expected today header)        → `Truck`
- 🔍 (Find a PO header)             → `Search`
- ➕ (Receive without PO header)    → `Plus`
- 💡 (suggestion / hint pills)      → `Lightbulb`
- 👇 (empty-state nudge)            → `ArrowDown`
- 📝 (manual-track context strip)   → `FilePen` / `ClipboardList`
- ⚠ (over-receipt major callout)   → `AlertTriangle`
- ⇥ (quick-fill button)             → drop glyph; rely on copy

Also tighten the playful tone:
- "What's arriving?" stays (it reads cleanly to operators) but icon
  decoration on the headline is dropped.
- Hint copy moves to single-line where possible.

No copy is removed. No flow change. No data fetching change.

## Manifest (files that may be touched)
manifest:
  - docs/portal-os/tranches/023-ux-pro-polish.md
  - src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx
  - src/app/(ops)/stock/receipts/_components/POLineMatchCard.tsx
  - src/app/(ops)/stock/receipts/_components/POLedgerHeader.tsx
  - src/app/(ops)/stock/receipts/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope

- Other Hebrew-corridor surfaces that use emoji intentionally (none in
  receipts).
- Lucide version pinning or icon system changes.
- Re-theming buttons, spacing tokens, or shadows. The card chrome and
  spacing stays as it is.

## Tests / verification
- `tsc --noEmit` clean.
- Visual: every header that previously led with an emoji now leads with
  a Lucide glyph at consistent baseline. No emoji left in the receipts
  corridor.

## Rollback
Revert. Each swap is a localized JSX edit.

## Operator approval
- [x] Tom approves this plan (session directive 2026-05-24 — "האימוג'ים
      מורידים את ההרגשה המקצועית").

## Actual evidence
Filled in post-land.

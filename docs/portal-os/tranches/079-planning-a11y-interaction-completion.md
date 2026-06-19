# Tranche 079 — planning a11y + interaction completion (re-audit iteration)

status: in progress (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: fresh re-audit (2026-06-15) by the accessibility + interaction lenses of
the post-072–078 planning surface. Completes the UX hardening: tranche 075 fixed
only 1 of 6 production-plan dialogs, and the re-audit found the rest plus several
interaction gaps. Portal-only; no authority/backend files; no Hebrew RTL copy
changes (procurement untouched).

## Changes — accessibility
- **A11Y-R03** — new reusable `src/components/a11y/useFocusTrap.ts`; Tab/Shift+Tab
  now cycle within `ManualAddModal` and the five other dialogs (no escape to the
  page behind the overlay).
- **A11Y-R02 / R10** — `AddFromRecommendationsModal`, `EditModal`, `AddNoteModal`,
  `EditNoteModal`, `CancelModal` gain the ManualAddModal treatment: initial focus,
  focus return to trigger on close, Escape-to-close, and `aria-labelledby` to a
  titled `<h2 id>`.
- **A11Y-R04** — `InventoryFlowTabs` tablist moved off `<nav>` (implicit
  navigation landmark) onto a `<div role="tablist">`.
- **A11Y-R08** — inventory-flow + supply clients wrap their content in
  `role="tabpanel"` `aria-labelledby` the active tab (tab `id`s added).
- **A11Y-R09** — `MonthlyGrid` aggregate cells (ROW TOTAL, footer totals) change
  `role="rowheader"` → `role="gridcell"` (only the item-name cell is a rowheader).
- **A11Y-R01** — forecast status filter active tab gains `font-semibold` (not
  color-only).
- **A11Y-R11** — production-plan `Toast` uses `role="alert"`/`aria-live=assertive`
  for errors, `role="status"`/`polite` for success.
- **A11Y-R05 / R06 / R07** — `required`/`aria-required` on ManualAdd date/product/
  UoM + CancelModal reason; field errors linked via `aria-describedby`;
  AddFromRecommendations close button gets `aria-label="Close"`.

## Changes — interaction
- **INTER-002** — `EditModal` UoM free-text `<input>` → `<select>` over the same
  `uomOptions` ManualAdd uses (stops arbitrary UoM → 422).
- **INTER-003** — production board patches are tracked by in-flight `plan_id`:
  the patching card shows its own busy state, and the other cards now carry an
  explanatory "another plan is updating — please wait" tooltip instead of a
  silent whole-table freeze. (Board writes stay serialized — a deliberate,
  safe choice for a factory tool; full concurrent per-card writes were not
  pursued.)
- **INTER-010** — `RecommendationsToConvert` error state gains a "Try again"
  button (`refetch`).
- **INTER-001** — AddNote submit button shows a spinner while saving.
- **INTER-009** — RecipeOverridePanel "Reset to standard" gains an inline confirm.
- **INTER-006** — forecast item-remove surfaces a brief "removed — Discard to undo"
  message.
- **INTER-008** — forecast "Back" prompts when there are unsaved edits.
- **INTER-011** — procurement session loading state → skeleton blocks.

## Changes — copy (safe)
- "Draft — not firmed" → "Draft — not yet confirmed" (ProductionJobCard).

## Out of scope (held for Tom)
INTER-004 / INTER-005 — Hebrew procurement Skip/Place confirmations (need Hebrew
copy approval). FLOW-D — cross-run approved recs (backend endpoint). Shared
`StatusBadge` term renames (frozen, app-wide). The INTER-010 retry button on the
Hebrew `RecommendationsToConvert` card was added in **English** ("Try again") to
avoid unilaterally authoring Hebrew on the locked RTL surface — Tom may want it
Hebraized to "נסה שוב" for consistency.

## File manifest
- `docs/portal-os/tranches/079-planning-a11y-interaction-completion.md` · `_active.txt` · `registry.md`.
- `src/components/a11y/useFocusTrap.ts` — new.
- `src/app/(planning)/planning/production-plan/page.tsx` — 5 dialogs + focus trap + UoM select + per-card lock + AddNote spinner + Toast role.
- `src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx` — reset confirm.
- `src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx` — copy.
- `src/app/(planning)/planning/inventory-flow/_components/InventoryFlowTabs.tsx` — nav→div.
- `src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx` · `supply/SupplyFlowClient.tsx` — tabpanels.
- `src/app/(planning)/planning/forecast/[version_id]/_components/MonthlyGrid.tsx` — rowheader→gridcell.
- `src/app/(planning)/planning/forecast/page.tsx` — active-tab weight.
- `src/app/(planning)/planning/forecast/[version_id]/page.tsx` — remove feedback + Back guard.
- `src/app/(planning)/planning/procurement/_components/RecommendationsToConvert.tsx` — retry.
- `src/app/(planning)/planning/procurement/page.tsx` — loading skeleton.

## Verification
tsc --noEmit clean · vitest 677/677 (84/84 files) · next build OK · eslint 0
errors (276 pre-existing warnings). Implemented by portal-production-executor;
independently re-verified — scope confined to `src/app/(planning)/**` + new
`src/components/a11y/useFocusTrap.ts`; no authority/backend files; no new Hebrew
on the procurement surface (the one Hebrew line in the diff is the pre-existing
error fallback, preserved). `useFocusTrap`, the per-card lock, and the Back
guard spot-checked.

# Tranche 078 — planning data & cache correctness (re-audit iteration)

status: in progress (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: fresh re-audit (2026-06-15) of the post-072–077 planning surface by the
flow + interaction auditors. Fixes confirmed data-integrity / cross-surface
staleness bugs. Portal-side; the one cross-feature touch (inbox rec card) is an
additive query-invalidation only.

## Changes
- **INTER-007 (data integrity, P0)** — forecast "Discard edits" cleared React
  state but left the `useAutoSave` 800ms debounce timer armed, so the discarded
  values were still POSTed to `/api/forecasts/save-lines`. `useAutoSave` now
  exposes `cancel()` (clears the pending buffer + timer, resets count); the
  discard handler calls it before clearing local cells. After discard, no save
  fires.
- **FLOW-B (P1)** — `usePatchPlan.onSuccess` invalidated only
  `["production-plan"]`; cancel/edit/move now also invalidate `["planning"]`
  (matching `useCreatePlan` from 077) so the planning overview can't lag.
- **FLOW-A / FLOW-E (P1)** — the Inbox `RecommendationInlineCard` approve/dismiss
  used a bare `fetch` + local state and invalidated nothing, leaving the
  Procurement convert-queue (`["procurement","approved-purchase-recs"]`), the
  rec-detail page (`["rec-detail", recId]`), `["inbox"]` and `["planning"]`
  stale. Now invalidates those on success.
- **FLOW-C (P2)** — purchase-session mutations (`useStartSession`/approve/skip)
  now also invalidate `["planning","overview"]` so demand coverage refreshes.

## Flagged, NOT changed (need your call)
- **INTER-004 / INTER-005 (P0)** — procurement FocusCard "Skip" and "Place PO"
  fire with no confirmation (Place creates a real PO). Fixing needs Hebrew
  confirm copy on the locked RTL surface → your approval of the wording.
- **FLOW-D** — approved recs from non-latest completed runs are invisible to
  Procurement (`limit=1`). The cross-run fix needs a backend endpoint decision.

## File manifest
- `docs/portal-os/tranches/078-planning-data-cache-correctness.md` — this plan.
- `docs/portal-os/tranches/_active.txt` · `docs/portal-os/registry.md`.
- `src/app/(planning)/planning/forecast/[version_id]/_lib/use-auto-save.ts` — `cancel()`.
- `src/app/(planning)/planning/forecast/[version_id]/page.tsx` — discard calls `cancel()`.
- `src/app/(planning)/planning/production-plan/_lib/usePlans.ts` — patch invalidation.
- `src/features/inbox/recommendation-inline-card.tsx` — approve/dismiss invalidation.
- `src/app/(planning)/planning/purchase-session/_lib/api.ts` — overview invalidation.

## Verification
tsc --noEmit clean · vitest 677/677 (84/84 files) · next build OK · eslint 0
errors. The forecast-confirm-flows test mock gained `cancel` and a new
assertion that discard calls `cancel()` once (locks INTER-007).

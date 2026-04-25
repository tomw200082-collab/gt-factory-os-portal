# Recipe-Edit Flow — Simplification & Hardening Plan

**Date:** 2026-04-25
**Trigger:** Tom's live walkthrough produced a route-level crash — `Cannot read properties of undefined (reading 'length')`. Plus the editor still feels brittle: too many queries, too many distinct loading states, too many places where a single missing field nukes the page.
**Direction (Tom's words):** *"You already understand how it should look — just simplify and fix."*
**Scope:** Tightening, not feature work. No backend / schema changes.

---

## 1. Audit — current state

The corridor is **14 files, ~2,900 lines**. Most of the volume is structural noise that accumulated under pressure. Concrete weaknesses:

### 1.1 Data flow has too many roundtrips and ad-hoc shapes

Per single product-page render of `/admin/masters/items/<id>` (MANUFACTURED):

| # | What | Where | Why it's noisy |
|---|---|---|---|
| 1 | `GET /api/items/:id` | item detail page | unavoidable |
| 2 | `GET /api/boms/versions?bom_head_id=<base>` | `useTrackData(base)` | base track |
| 3 | `GET /api/boms/lines?bom_version_id=<base_active>` | `useTrackData(base)` | base lines |
| 4 | `GET /api/boms/versions?bom_head_id=<pack>` | `useTrackData(pack)` | pack track |
| 5 | `GET /api/boms/lines?bom_version_id=<pack_active>` | `useTrackData(pack)` | pack lines |
| 6..N | `GET /api/supplier-items?component_id=<id>` × N unique components | `useComponentReadinessMap` | per-component fan-out |

Then if user clicks **Edit recipe**, the editor re-fetches **the same things again** under different query keys, plus:

| 7 | `POST /api/boms/versions` (clone) | `useEnterEditDraft` |
| 8 | `GET /api/boms/versions?bom_head_id=<head>` | re-fetched in editor (different cache key path) |
| 9 | `GET /api/boms/heads?bom_head_id=<head>` | head-only fetch added in editor |
| 10 | `GET /api/boms/lines?bom_version_id=<draft>` | draft lines |
| 11 | `GET /api/boms/lines?bom_version_id=<active>` | active lines for diff |
| 12..N | per-component supplier-items again | re-fan-out |

**Cost:** 8–15 queries to render the editor. Many race conditions. The current loading-gate logic depends on multiple of these resolving in the right order; one slow tail = ambiguous spinner. A single 422 anywhere kills downstream rendering unless every consumer guards against undefined.

### 1.2 Two parallel data-shape definitions

- `useTrackData.BomLineRow` (the right shape — `final_component_id` etc.)
- `BomDraftEditorPage.HeadRow` (`parent_ref_id`, `parent_name`)
- `useComponentReadinessMap.SupplierItemRow` (private)
- Various test fixtures that drifted multiple times

Every drift = a new `undefined.length` waiting to happen.

### 1.3 The error class that just hit Tom

`Cannot read properties of undefined (reading 'length')` — the most likely site is `PublishConfirmModal`:

```ts
preview.warnings.length === 0 &&
uiWarnings.length === 0
```

If the upstream `publish-preview` response is missing the `warnings` field (only returns `blocking_issues`), this throws. There's no schema validation on the preview response; we trust whatever Fastify returned.

Same class in:
- `BomLineDiff` (`diff.added.length` if `computeBomDiff` is given undefined)
- `RecipeHealthCard` `top.blockers.length` (safe today, but no schema guarantee)
- `useComponentReadinessMap` (`unique.length`)

There is no global error boundary at the corridor root that captures + describes errors usefully.

### 1.4 Three different "loading" idioms

- `useTrackData` returns `{ isReady, isError, errorMessage }`
- `useComponentReadinessMap` returns `{ map, isReady, isError, errorMessage }`
- `BomDraftEditorPage` rolls its own from `versionListQuery.isLoading || headQuery.isLoading || linesQuery.isLoading`
- `RecipeHealthCard` re-implements the gate

Every gate has its own error shape, its own retry button, its own copy. Inconsistency is a bug factory.

### 1.5 Test coverage is uneven

- **Pure-function tests:** 44/44 pass — solid.
- **Regression test (`bom-line-real-shape`):** 2/2 pass — solid; uses the literal upstream shape.
- **Component tests:** 28 fail today on Hebrew→English text drift. None of them exercises a malformed/partial backend response. None catches the `preview.warnings === undefined` class.

The component tests test what the UI says, not what the system does.

### 1.6 Multiple paths from product page → editor

`useEnterEditDraft` returns one shape internally (`{versionId, bomHeadId}`) and a different shape externally (just `versionId` via `enterEdit`). The card and the editor each have their own clone-or-resume confirm modal. Drift surface.

---

## 2. Root-cause taxonomy

The crash + brittleness reduce to **three** root issues. Everything else is a symptom.

### RC1 — No runtime schema validation at the corridor's external boundary
We `JSON.parse` whatever Fastify returns and assume it matches the TypeScript type. When it doesn't (a missing field, a stripped optional, an unexpected enum), we get `undefined.length` somewhere downstream of the divergence.

### RC2 — Data layer not consolidated
The product page and the editor each maintain their own copy of "what's the active version, the draft version, the lines, the readiness map." Cache invalidation has to bridge two boundaries. Component prop-drilling is partial; some props are passed, others re-fetched.

### RC3 — No corridor-level error boundary with a useful contract
A single `undefined.length` collapses the whole page into the generic error UI Tom screenshotted, with a message that doesn't tell anyone what to do. Every new bug looks identical.

---

## 3. Target shape — what "simplified" means

One thing-per-thing, with clear ownership. Less surface area, more guard rails.

### 3.1 ONE schema-validated boundary

Every `/api/...` response is parsed through a Zod schema at the proxy boundary. A response that doesn't fit the schema produces a labeled, surfaceable error — not an `undefined.length` 12 frames downstream.

```ts
// src/lib/api/schemas.ts (new, single file)
export const BomLineRowSchema = z.object({
  bom_line_id: z.string(),
  final_component_id: z.string(),
  final_component_name: z.string().nullable().optional(),
  final_component_qty: z.string(),
  component_uom: z.string().nullable().optional(),
  updated_at: z.string(),
});
// + BomVersionRowSchema, BomHeadRowSchema, SupplierItemRowSchema,
//   PublishPreviewSchema (with .default([]) on warnings + blocking_issues)
```

Every fetch in the corridor uses a `useApi(schema, url)` helper that:
- Surfaces upstream body verbatim on non-2xx.
- Validates the JSON against the schema; **`warnings` and `blocking_issues` get `.default([])`** so missing fields can never crash a `.length` read.
- Returns one consistent `{ data, isLoading, isError, errorMessage }` shape.

This single helper replaces the bespoke fetch+throw pattern in every hook and component.

### 3.2 ONE recipe data hook for both surfaces

`useRecipeData(itemId)` returns everything the card needs and everything the editor needs, derived from the same React Query cache:

```ts
{
  item: { item_id, item_name, base_bom_head_id, primary_bom_head_id },
  base: { headId, activeVersion, draftVersion, lines, isLoading, errorMessage },
  pack: { headId, activeVersion, draftVersion, lines, isLoading, errorMessage },
  readiness: Map<componentId, ComponentReadiness>,
  isReady, isError, errorMessage,
}
```

The card consumes all fields; the editor receives `recipeData.base | recipeData.pack` plus the just-cloned `versionId` and reads only what it needs.

Net effect: zero refetch on navigation (TanStack Query's cache hits because the keys are identical between the two surfaces).

### 3.3 ONE corridor-level error boundary

A React error boundary wraps the Recipe-Health card, the editor, and any descendant. On crash:
- Logs the actual error stack to `console` (so the dev tools show it).
- Renders a useful UI: **what happened, what the upstream API URL was if known, which component crashed, what the user can do.**
- Includes a "Copy diagnostic" button so Tom can paste a ready-to-debug bundle (URL + error + stack + last 5 fetch URLs) into the chat instead of screenshotting.

### 3.4 Defensive `.length` / `.map` / `.find` everywhere

Every array access on possibly-undefined data goes through a tiny `safeArr(x)` helper or uses `??[]`. No exceptions. Lint rule (manual today; CI later) catches `\.length` on values whose type allows undefined.

### 3.5 Consolidate clone-and-navigate

One hook (`useEnterEditDraft`) returns one shape (`{ versionId }`). The card calls it; the editor never calls it. The confirm-or-create modal lives only on the card.

### 3.6 Drop the unused / duplicative tasks

- `useTrackData` (replaced by `useRecipeData`)
- `useComponentReadinessMap` (folded into `useRecipeData`)
- The editor's per-page `versionListQuery + headQuery + linesQuery + activeLinesQuery` (all replaced by `useRecipeData(itemId)` + props)

Deletion is the simplification.

---

## 4. Implementation tranches

5 tranches, atomic commits per task per the project's TDD discipline. **No tranche is allowed to skip the gate of the previous one.** Each tranche must compile, typecheck, run the safety-net tests, and ship.

### Tranche A — Schema layer + `useApi` helper (FOUNDATIONAL, ~150 lines)

**Goal:** Stop trusting upstream JSON. Every fetch in the corridor passes through one helper that validates against a Zod schema; missing `warnings`/`blocking_issues` defaults to `[]` at the boundary.

**Files:**
- Create `src/lib/api/schemas.ts` — Zod schemas for: `BomLineRow`, `BomVersionRow`, `BomHeadRow`, `SupplierItemRow`, `PublishPreview`.
- Create `src/lib/api/use-api.ts` — `useApi(schema, url, opts)` helper. Returns `{ data, isLoading, isError, errorMessage, refetch }` consistently.
- Test `tests/unit/admin/use-api.test.tsx` — covers: 2xx + valid → data; 2xx + invalid shape → readable error message; non-2xx → upstream body in errorMessage; partial response missing optional fields → `.length` reads succeed via defaults.

**Critical schema decision:** `PublishPreviewSchema` wraps `warnings: z.array(z.string()).default([])` and `blocking_issues: z.array(z.string()).default([])`. **This single line prevents the class of crash Tom screenshotted.**

**Acceptance for Tranche A:**
1. `useApi` returns the shape contract above.
2. The 5 schemas reflect the actual upstream shapes verified against `src/lib/contracts/dto.ts` and the existing read-only BOM detail page.
3. Test file proves missing-warnings doesn't crash.
4. Zero existing files modified — A is purely additive.

---

### Tranche B — `useRecipeData` consolidated hook (CORE, ~220 lines, removes ~200 lines of duplication elsewhere)

**Goal:** One hook owns all recipe data. Card and editor both consume it.

**Files:**
- Create `src/components/admin/recipe-health/useRecipeData.ts` — composes `useApi` calls; returns the shape from §3.2.
- Test `tests/unit/admin/use-recipe-data.test.tsx` — covers: happy path; one BOM head missing (no base / no pack); upstream 422 on lines (returns `errorMessage` + empty `lines`, not crash); per-component supplier-items fan-out + dedup.

**Acceptance for Tranche B:**
1. Hook returns the typed shape; never throws.
2. Test file uses the literal upstream response shape (extends the `bom-line-real-shape` pattern).
3. `useTrackData.ts` and `useComponentReadinessMap.ts` are NOT yet deleted (those come in Tranche D after consumers migrate).

---

### Tranche C — Corridor error boundary + diagnostic copy button (~120 lines)

**Goal:** Replace the generic "Something went wrong on this screen" with a useful, actionable surface that captures `console`-grade detail and offers "Copy diagnostic to clipboard."

**Files:**
- Create `src/components/admin/RecipeCorridorBoundary.tsx` — class component with `getDerivedStateFromError` + `componentDidCatch`. Renders a panel with:
  - One-line summary
  - Error message + first 10 stack frames (in a monospaced block)
  - Copy-diagnostic button that writes the bundle to clipboard
  - Retry / Back-to-product buttons
- Wrap the RecipeHealthCard mount on `/admin/masters/items/[item_id]/page.tsx` with the boundary. Wrap the `BomDraftEditorPage` mount on `/edit/page.tsx` with the boundary.
- Test `tests/unit/admin/recipe-corridor-boundary.test.tsx` — covers: child throw → boundary renders + the message contains the thrown text + Retry resets state.

**Acceptance for Tranche C:**
1. Any thrown error in the corridor is captured by the boundary, with the message in plain text.
2. Boundary copy-diagnostic button works in jsdom (uses `navigator.clipboard.writeText` mocked).
3. The two route mount sites use the boundary.

---

### Tranche D — Migrate card + editor to `useRecipeData`; remove old hooks (~400-line net deletion)

**Goal:** Slim down the corridor by a third. Both surfaces share one cache. No more clone-and-renavigate cache invalidation race.

**Files (modified):**
- `src/components/admin/recipe-health/RecipeHealthCard.tsx` — replace internal `useTrackData` × 2 + `useComponentReadinessMap` with `useRecipeData(itemId)`. Delete the per-track in-component data plumbing.
- `src/components/bom-edit/BomDraftEditorPage.tsx` — accept `recipeData` and `versionId` as props from a parent route component. Delete the four ad-hoc useQueries inside the page. Render only what the editor needs (header, line table, readiness panel, publish flow).
- `src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/edit/page.tsx` — the route shell now resolves the parent `item_id` (from the head's `parent_ref_id`), calls `useRecipeData(itemId)`, picks the right track based on `head.bom_kind`, and passes the data to `BomDraftEditorPage`.

**Files (deleted):**
- `src/components/admin/recipe-health/useTrackData.ts`
- `src/components/admin/recipe-health/useComponentReadinessMap.ts`

**Acceptance for Tranche D:**
1. Typecheck clean.
2. The 7 safety-net tests (pure functions + clone hook + bom-line-real-shape) still pass; the regression test is updated to drive RecipeHealthCard via `useRecipeData`'s mocked context.
3. Editor renders against the same fixture shape as the card; navigation from card → editor reuses the cache (verified by mocking `fetch` and asserting the `/api/boms/lines?bom_version_id=<draft>` call happens at most once after a clone).

---

### Tranche E — Defensive `.length` / `.map` / `.find` audit + component test rewrite (~250 lines, mostly tests)

**Goal:** Prove the simplification holds. Update the 28 broken component tests to the new English UI + design tokens. Add explicit tests for the formerly-crashing patterns.

**Files (modified — 9 test files):**
- Each component test gets its assertions rewritten to the English copy + design-token class hooks (e.g., `data-tone="warning"` instead of color-class regex).
- Add to `bom-line-real-shape.test.tsx`: a case where upstream `publish-preview` returns `{ blocking_issues: ["EMPTY_VERSION"] }` with NO `warnings` field. The page must NOT crash; the modal renders Variant C with the blocker translated.

**Files (new):**
- `tests/unit/admin/recipe-corridor-undefined-guard.test.tsx` — exercises `BomLineDiff(undefined, [])`, `PublishConfirmModal({ blocking_issues: undefined, … })`, etc. None must throw.

**Acceptance for Tranche E:**
1. Full corridor test suite (~150 tests) green.
2. The new guard test file fails on pre-Tranche-A code and passes on post-Tranche-A code (run on the previous commit to verify it would have caught the crash).

---

## 5. What is OUT of scope

- **Backend / schema changes.** Anywhere a 422 is "the upstream rejected this," that stays a UI surfacing job — not a payload-shape negotiation.
- **Product Simulation rename** (Tom's earlier §4) — still deferred until the corridor stabilizes.
- **EntityPicker swap on BomLineAddDrawer** (FUP-1) — still backlog.
- **Live-data smoke test in CI** — needs a stable seed item; tracking as FUP-3 in the verification runbook.
- **Visual polish beyond the existing design tokens.** The Operational Precision system is already in place; no new tokens introduced.

## 6. What changes in the conversation flow Tom uses today

Walking through the 10-step runbook from `2026-04-25-recipe-readiness-live-verification.md` with the post-plan corridor:

| Step | Before plan | After plan |
|---|---|---|
| 1 — open product page | sometimes false-red, sometimes 500 boundary | always renders the card; if anything failed, the boundary shows a precise, copy-able error |
| 3 — Edit recipe | sometimes infinite "Loading…", sometimes 422 black box | within 1s either renders the editor (cache hit from card) OR renders the boundary with the upstream body |
| 4 — Edit qty | unchanged (already uses `patchEntity` correctly) | unchanged |
| 5–7 — Quick fix | unchanged in shape; minor copy refinement | unchanged |
| 8 — Publish | crashed if upstream omitted `warnings` | always renders one of the three variants; missing `warnings` defaults to `[]` per Tranche A |
| 9 — Yellow after publish-with-warnings | unchanged | unchanged |
| 10 — Green after clean publish | unchanged | unchanged |

The two CRITICAL acceptance rules (yellow vs green after publish) remain untouched. The plan tightens runtime safety around them; it does not relax them.

---

## 7. Acceptance criteria for the plan as a whole

1. Tom can re-walk steps 1, 3 of the runbook on `FG-CON-1L` without hitting an error boundary or a stuck loader. If the backend genuinely 422s, Tom sees the upstream body inline instead of `Cannot read properties of undefined`.
2. Total corridor LOC drops from ~2,900 to ~2,200 (–25 %).
3. Number of distinct fetch idioms in the corridor: 1 (`useApi`).
4. Number of "loading / error / empty" gate implementations: 1 per surface.
5. The full safety-net suite (now ~70 tests including new guard tests) passes; typecheck clean; URL lint clean.
6. The CRITICAL yellow-after-publish-with-warnings invariant is preserved. The CRITICAL green-after-clean-publish invariant is preserved.

---

## 8. Sequencing & rollback

Each tranche commits separately, pushes to `main`, and is independently revertable.

| Tranche | Reverts cleanly with | Why |
|---|---|---|
| A | `git revert <A>` | Purely additive — no consumers yet |
| B | `git revert <B>` | Purely additive — old hooks still in place |
| C | `git revert <C>` | Boundary mount sites are 1-line wraps |
| D | `git revert <D>` (consumers + deletions in one commit) | Old hooks come back, card/editor revert to prior fetches |
| E | `git revert <E>` | Tests-only |

Worst case path: revert D, keep A+B+C+E. We retain the schema validation and error boundary even if the consolidation doesn't land cleanly.

---

## 9. Risks

1. **Zod schema drift.** If the actual upstream shape differs from the project's `dto.ts` types, the schema validation throws on real data. Mitigation: schema starts permissive (`.passthrough()` on objects, optional fields with sensible defaults) and tightens incrementally.
2. **Cache key collision.** When two surfaces share the cache, a stale entry from one can mislead the other. Mitigation: query keys include the `?limit=` parameter and the version-id explicitly; invalidation happens on the same key from both surfaces.
3. **Editor route is now thin** — most of its logic moves to the route shell that resolves `item_id`. If `head.parent_ref_id` is null (orphan BOM), the editor needs an explicit "no item linked" state. Mitigation: add a fourth render state in the editor for this case.

---

## 10. What I'm asking Tom to approve

The plan has two yes/no decisions to lock before Tranche A starts:

**Q1. Schema posture: strict or permissive at the boundary?**
- **Strict** (recommended): every field listed; unexpected fields stripped; missing required fields = labeled error. Catches drift early.
- **Permissive** (safer first ship): `.passthrough()`; only validate the fields we read; unknown stays unknown. Less risk of breaking on a real Fastify quirk.
My recommendation: **permissive on first ship**, tighten in Tranche E once the safety net catches false-positives on real data.

**Q2. Error boundary scope:**
- **Per-route** (recommended): wraps the RecipeHealthCard mount and the editor mount separately. Failure in one doesn't take down the other.
- **Global**: one boundary for the entire `/admin/masters/items/...` shell. Simpler, but a card crash also takes down the rest of the page.
My recommendation: **per-route** for blast-radius minimization.

If both go my way: green light Tranche A.
If you want different on either: say so and I'll adjust before any code is written.

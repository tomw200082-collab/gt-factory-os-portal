# Tranche 075 — planning accessibility pack

status: in progress (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: planning UX/UI audit (2026-06-14) THEME P-G (A11Y-007/009/015/016/019/
021/026) + cross-cutting (scope=col, skip-link, tiny text). The remaining P1
accessibility backlog after 072–074 cleared all P0s. Portal-only; no authority
files (`globals.css`, `tailwind.config.ts`) and no backend.

## Changes
- A11Y-009 — `role="tablist"` widgets gain roving-tabindex + arrow-key (Left/
  Right + Home/End) navigation via a new shared hook `useRovingTabList`:
  forecast filter tabs, runs list tabs, run-detail tabs, InventoryFlowTabs.
- A11Y-015 — `MonthlyGrid` orphan `role="gridcell"` cells get a proper
  `role="grid"` / `role="row"` / `role="columnheader"` ancestry (or roles are
  removed if a real grid is impractical).
- A11Y-007/016 — `ManualAddModal` (inline in production-plan) gains dialog
  semantics: `role="dialog"` + `aria-modal` + `aria-labelledby` to its title +
  Escape-to-close + initial focus + focus return.
- A11Y-019/026 — forecast publish outcome announced via an `aria-live` region;
  any remaining error feedback uses `role="alert"` (assertive) not `role=status`.
- A11Y-021 — inventory-flow tab active state is not color-only (adds weight/
  underline alongside `aria-selected`); confirms tab semantics.
- scope="col" added to planning data-table headers.
- Skip-to-content link added to the planning shell (`(planning)/layout.tsx`),
  with a matching `id`/`tabIndex=-1` target on the main content region.
- Tiny `text-[9px]` PublishGate label bumped to the type scale; sub-44px tap
  targets on the touched controls raised where trivial.

## Out of scope (held)
New design tokens (`--overlay-backdrop`, `.chip-toggle`) — authority files.
Blockers due-date persistence — needs a backend table.

## File manifest
- `docs/portal-os/tranches/075-planning-a11y-pack.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — 075 while active; cleared at close.
- `docs/portal-os/registry.md` — register this tranche.
- `src/components/a11y/useRovingTabList.ts` — new shared roving-tablist hook.
- `src/app/(planning)/layout.tsx` — skip link + main target.
- `src/app/(planning)/planning/forecast/page.tsx` — tablist roving.
- `src/app/(planning)/planning/forecast/[version_id]/_components/MonthlyGrid.tsx` — grid roles.
- `src/app/(planning)/planning/forecast/[version_id]/_components/PublishGate.tsx` — live region + label size.
- `src/app/(planning)/planning/runs/page.tsx` — tablist roving.
- `src/app/(planning)/planning/runs/[run_id]/page.tsx` — tablist roving.
- `src/app/(planning)/planning/inventory-flow/_components/InventoryFlowTabs.tsx` — arrow keys + active state.
- `src/app/(planning)/planning/production-plan/page.tsx` — ManualAddModal dialog semantics.
- planning data-table files — `scope="col"` on `<th>` (enumerated in the diff).

## Verification
tsc --noEmit clean · vitest 677/677 (84/84 files) · next build OK · eslint 0
errors / 276 warnings (one fewer than baseline 277 — an unused eslint-disable
was removed). Implemented by portal-production-executor; independently
re-verified (scope confined to `src/app/(planning)/**` + new
`src/components/a11y/useRovingTabList.ts`; no authority/backend/procurement
files touched; skip-link, MonthlyGrid role=grid, ManualAddModal dialog
semantics, and run-detail tabpanel linkage spot-checked).

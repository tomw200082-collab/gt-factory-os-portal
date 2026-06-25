# Tranche 093: deepen — shared fetchJson (stock forms)

status: in-progress
created: 2026-06-25
scorecard_target_category: technical_substrate
expected_delta: 0 (pure structure — behavior held; removes 3 identical copies)
sizing: XS (1 new lib module + 1 test + 3 caller migrations; no backend)
source: /deepen design pass (2026-06-25, continuation of 091)

## Why (the shallow it deepens)
The authed JSON GET helper `async function fetchJson<T>(url)` — fetch with
`Accept: application/json`, throw an operator-facing error on non-2xx, return the
typed body — is hand-defined **33 times** across the codebase. The same decision
(how the portal reads a JSON endpoint + what an operator sees on a read failure)
is duplicated per page. One shared module hides that decision in one place.

## Scope discipline (surgical, not a sweep)
The `/deepen` boundary forbids a codebase sweep, and the copies are not all
byte-identical (e.g. `production-actual` uses "try again" not "try refreshing";
`dashboard` returns `T | null` with an AbortSignal). So this pass migrates ONLY
the **3 byte-identical** stock-form callers (`waste-adjustments`,
`physical-count`, `receipts`) — behavior is provably held because their bodies
were character-for-character the canonical form. `production-actual` (divergent
copy) and the other ~29 sites are a tracked follow-up, NOT done here.

## The deepening (§I)
New `src/lib/http/fetchJson.ts` exporting `fetchJson<T>(url): Promise<T>` — the
canonical helper. Callers `import { fetchJson }` and delete their local copy; the
call sites (TanStack `queryFn`s) are unchanged.

## §V (invariant)
The 3 migrated stock forms have no local `fetchJson` definition — they consume
the shared one. (No dedicated guard test added; the suite + tsc enforce the
import resolves and behavior is unchanged. The broader 30-site migration, when
done, is the place for a no-local-copy guard.)

## Scope (manifest)
manifest:
  - src/lib/http/fetchJson.ts
  - src/lib/http/fetchJson.test.ts
  - src/app/(ops)/stock/waste-adjustments/page.tsx
  - src/app/(ops)/stock/physical-count/page.tsx
  - src/app/(ops)/stock/receipts/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/093-deepen-fetchjson-stock-forms.md
  - docs/portal-os/tranches/_active.txt

## Landed
- **fetchJson.ts** — the canonical authed-JSON-GET helper.
- **fetchJson.test.ts** — 3 cases: 2xx→parsed, Accept header sent, non-2xx→throws
  with status + "try refreshing".
- **waste-adjustments / physical-count / receipts** — local `fetchJson` deleted,
  shared one imported; call sites identical.

## Follow-up (tracked, not done)
~29 remaining `fetchJson` copies (admin pages, planning, PO, components, etc.)
plus the divergent `production-actual` ("try again") and `dashboard`
(`T | null` + AbortSignal) variants. A future tranche can migrate the identical
ones and decide whether to unify the two divergent copies (a deliberate
copy/behavior change, out of /deepen scope).

## Verification (behavior held)
- Before: vitest 784/784. After: **tsc 0 · eslint 0 · vitest 787/787** (784 held
  + 3 new). The 3 migrated bodies were byte-identical to the canonical helper, so
  behavior is unchanged; the page tests still pass.

## Checklist
- [x] shared module + tests · 3 identical callers migrated · behavior held
- [ ] Tom review / merge (follow-up: remaining fetchJson sites)

# Tranche 096: fetchJson migration — admin pages (dedup continuation)

status: in-progress
created: 2026-06-26
scorecard_target_category: technical_substrate
expected_delta: 0 (pure dedup — behavior held; removes 11 identical copies)
sizing: S (11 admin pages, mechanical; no backend, no test churn)
source: tranche 093 follow-up (the shared src/lib/http/fetchJson.ts)

## Why
Tranche 093 extracted the canonical authed-JSON-GET helper and migrated the 3
stock forms. The same helper was hand-copied across ~30 more pages. This tranche
migrates the **11 admin pages whose `fetchJson` is BYTE-IDENTICAL** to the
canonical helper, so behavior is provably unchanged (the removed body == the
imported body, verified by exact string match before editing).

## Scope (manifest)
manifest:
  - src/app/(admin)/admin/components/page.tsx
  - src/app/(admin)/admin/sku-aliases/page.tsx
  - src/app/(admin)/admin/sku-map/page.tsx
  - src/app/(admin)/admin/items/page.tsx
  - src/app/(admin)/admin/masters/components/[component_id]/page.tsx
  - src/app/(admin)/admin/masters/items/[item_id]/page.tsx
  - src/app/(admin)/admin/masters/suppliers/[supplier_id]/page.tsx
  - src/app/(admin)/admin/masters/boms/[bom_head_id]/page.tsx
  - src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/page.tsx
  - src/app/(admin)/admin/products/new/page.tsx
  - src/app/(admin)/admin/suppliers/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/096-fetchjson-admin-migration.md
  - docs/portal-os/tranches/_active.txt

## Landed
Each of the 11 pages: local `async function fetchJson<T>` deleted, replaced with
`import { fetchJson } from "@/lib/http/fetchJson"`. Call sites unchanged.

## Selection rule (why these 11 and not the rest)
Only files whose `fetchJson` body matched the canonical helper character-for-
character were migrated (verified by exact-string containment). Divergent copies
(`production-actual` "try again", `dashboard` `T | null` + AbortSignal, and any
others with different error copy) are intentionally NOT touched — migrating them
would change behavior, which is out of scope for a dedup tranche.

## Remaining follow-up
~15 `fetchJson` copies remain (other planning/PO/component files + the divergent
variants). Migrate the identical ones in a later batch; the two divergent copies
need a deliberate copy decision.

## Verification (behavior held)
- tsc 0 · eslint 0 errors (pre-existing exhaustive-deps warnings in suppliers/
  page.tsx unrelated) · vitest 790/790.
- Behavior held by construction: every removed body was byte-identical to the
  imported helper.

## Checklist
- [x] 11 byte-identical admin fetchJson copies migrated to the shared helper
- [ ] Tom review / merge (follow-up: remaining identical copies)

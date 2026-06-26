# Tranche 089: deepen — extract useFlowItems (kill flow-client duplication)

status: in-progress
created: 2026-06-25
scorecard_target_category: design / maintainability
expected_delta: +1 (one hidden decision, change-amplification removed on a core surface)
sizing: XS (1 new hook; 2 call-site swaps; pure structural — behavior held)
source: /deepen pass after tranche 088

## Why
The `data → {filteredItems, families}` derivation was byte-identical in
`InventoryFlowClient.tsx:98-122` and `SupplyFlowClient.tsx:167-191` — change
amplification: the tranche-088 `data.items` null-guard had to be applied to both,
and a future filter change would drift. Shallow: the "how flow items are filtered
+ null-handled" decision leaked into every client.

## Deepening
New deep module `_lib/useFlowItems.ts` hides the filtering + family + null-safety
behind a 3-arg interface. Both clients call it; neither re-implements `data.items`
filtering. The two components otherwise legitimately differ (supply has group
filters, error-describe, no planned-overlay) — only the shared pipeline moves.

- §I: `useFlowItems(data, q, atRiskOnly) → { filteredItems, families }`
- §V: flow item filtering + `data.items` null-safety live ONLY in `useFlowItems`;
  no client re-implements `data.items` filtering. (Locks against 088 re-divergence.)

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/inventory-flow/_lib/useFlowItems.ts
  - src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx
  - src/app/(planning)/planning/inventory-flow/supply/SupplyFlowClient.tsx
  - docs/portal-os/registry.md

## Verification (behavior held — deepen invariant)
- vitest inventory-flow suite green BEFORE (59) and AFTER.
- tsc 0 · eslint 0.
- Playwright @uxshot re-render of /planning/inventory-flow + /supply unchanged.

## Checklist
- [x] hook + both call sites swapped; isAtRisk/FlowItem imports dropped from clients
- [ ] green-after + Tom review

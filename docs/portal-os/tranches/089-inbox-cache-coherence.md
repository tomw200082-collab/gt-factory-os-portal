# Tranche 089: inbox cache-coherence on stock approval-holds

status: in-progress
created: 2026-06-25
scorecard_target_category: flow_continuity / ops_surface
expected_delta: 0 (correctness fix, no new surface) — removes a stale-UI latency
sizing: XS (2 source files, additive invalidation only; no backend)
source: /portal-audit flow-continuity auditor (2026-06-25), P2 broken-invalidation cluster

## Why
The flow-continuity audit walked all ten operator/planner journeys (all PASS, no
dead-ends). The only findings were two symmetric cache-coherence omissions: when a
stock submit is **held for planner approval**, the submitting page creates an inbox
approval but never invalidates the `["inbox", ...]` query keys. The new approval
therefore appears in `/inbox` only after its 30s staleTime or the next navigation —
a stale-count latency on the approval queue. The established pattern already exists
at `RecommendationsToConvert.tsx:56` (`invalidateQueries({ queryKey: ["inbox"] })`);
these two pages simply predate it.

All inbox source keys are prefixed `["inbox", ...]` (QK_WASTE / QK_PC / QK_IM /
QK_REC / QK_EXC, inbox/page.tsx:251-256), so a single `["inbox"]` prefix
invalidation refreshes every source — exactly what the rec-convert path does.

## Scope (manifest)
manifest:
  - src/app/(ops)/stock/waste-adjustments/page.tsx
  - src/app/(ops)/stock/physical-count/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/089-inbox-cache-coherence.md
  - docs/portal-os/tranches/_active.txt

## Landed
- **waste-adjustments/page.tsx** — import `useQueryClient`; `const queryClient =
  useQueryClient()`; in the `status === "pending"` branch (was :325) call
  `void queryClient.invalidateQueries({ queryKey: ["inbox"] })` before `setDone`.
- **physical-count/page.tsx** — same three-part change; invalidation added in the
  large-variance `status === "pending"` branch (was :542).

## Corrected vs agent claims
The auditor cited the omission lines as :325 / :542. Both pages had **no**
`queryClient` at all (waste imported only `useQuery`; physical-count likewise), so
the fix is import + hook + invalidation, not a one-liner into an existing client.

## Verification
- tsc 0 (`npx tsc --noEmit`)
- vitest 775/775 green (101 files)
- Change mirrors the established `RecommendationsToConvert.tsx:56` invalidation idiom

## Checklist
- [x] waste-adjustments inbox invalidation · physical-count inbox invalidation
- [x] tsc 0 · vitest 775/775
- [ ] Tom review / ship to prod

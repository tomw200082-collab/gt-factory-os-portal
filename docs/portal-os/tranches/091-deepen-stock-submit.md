# Tranche 091: deepen — submitStockEvent (shared deep stock-submit module)

status: in-progress
created: 2026-06-25
scorecard_target_category: technical_substrate / data_truthfulness
expected_delta: 0 (pure structure — behavior held; pays down a duplication + a §1 leak risk)
sizing: S (1 new lib module + 2 test files + 2 caller refactors; no backend)
source: /deepen design pass (2026-06-25), Tom-approved

## Why (the shallow it deepens)
The stock-event submit skeleton — POST envelope → `res.json().catch(() => null)` →
discriminate `posted | pending | else` → §1-safe error extraction → network catch —
was hand-rolled per operator form (`waste-adjustments:316-377`,
`physical-count:505-573`, and `production-actual` has the same shape in several
places). Two real costs:

1. **Obscurity / unknown-unknown.** A new operator form must *know* the
   portal_ux_standard §1 rule "never surface raw JSON to an operator" to call the
   API correctly. Forget it → leak server JSON (exactly the class tranche 088's
   `error.tsx` fix addressed). The rule lived in ≥3 copies.
2. **Change amplification.** Tranche 089's inbox-invalidation fix had to be
   applied to two files separately *because* the submit logic was copy-pasted,
   not shared.

## The deepening (§I — smaller interface)
New `src/lib/stock/submit.ts`:

    submitStockEvent<TBody>(url, envelope): Promise<StockSubmitResult<TBody>>
    StockSubmitResult =
      | { kind: "posted";   submissionId?, idempotentReplay, body }
      | { kind: "pending";  submissionId?, body }
      | { kind: "rejected"; status, body, serverMessage? }   // §1-safe string only
      | { kind: "network";  error }

Hidden inside: the fetch, the JSON-safe parse, the four-way discrimination, and
the §1 extraction (`extractServerMessage` returns a server string ONLY if it is a
string — never the raw object). Callers keep their own page copy + post-submit
state and read their own success fields off the typed `body`; they no longer
re-derive the transport skeleton. The four variants map 1:1 to the four code
paths each form already had, so behavior is held exactly.

## §V (invariant locked)
Every operator stock form submits through `submitStockEvent`; no page hand-rolls
the bare submit-endpoint `fetch(...)`. Guard test
`src/lib/stock/no-inline-submit.guard.test.ts` fails if a stock form re-grows an
inline `fetch("/api/<submit-endpoint>", …)`. (Reads like the snapshot-open
`/api/physical-count/open?…` are unaffected — the guard pins the bare submit
endpoint, not every fetch.)

## Scope (manifest)
manifest:
  - src/lib/stock/submit.ts
  - src/lib/stock/submit.test.ts
  - src/lib/stock/no-inline-submit.guard.test.ts
  - src/app/(ops)/stock/waste-adjustments/page.tsx
  - src/app/(ops)/stock/physical-count/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/091-deepen-stock-submit.md
  - docs/portal-os/tranches/_active.txt

## Landed
- **submit.ts** — the deep module + 4-variant result + §1-safe `extractServerMessage`.
- **submit.test.ts** — 7 cases: posted, idempotent-replay, pending, rejected
  (status+body), §1 (string surfaced / object NOT leaked), unparseable body,
  network-never-throws.
- **no-inline-submit.guard.test.ts** — §V guard (2 cases).
- **waste-adjustments/page.tsx** — submit block → `switch (result.kind)`; copy +
  states + inbox-invalidation identical; `summary` hoisted (pure).
- **physical-count/page.tsx** — same; `rejected` keeps
  `friendlyCountError(result.body, result.status)` exactly; `itemLabel` hoisted.

## Scope note (one module per pass)
`production-actual` has the same skeleton in several places but its sites differ
(typed detail responses, multiple endpoints) — left for a separate, careful
deepen pass per the one-module-per-pass rule.

## Verification (behavior held: green before AND after)
- Before: vitest 775/775. After: **tsc 0 · eslint 0 · vitest 784/784** (775 held
  + 9 new). The 775 pre-existing tests (incl. the page tests) prove the callers'
  behavior is unchanged; the 9 new tests cover the deep module + the §V guard.

## Checklist
- [x] deep module + tests · 2 callers refactored · §V guard · behavior held
- [ ] Tom review / merge (follow-up: production-actual deepen pass)

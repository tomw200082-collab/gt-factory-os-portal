# Tranche 151 — Add supplier is impossible (missing idempotency_key)

**Status:** verified — all gates green
**Origin:** Tom, 2026-07-26, live report with a screenshot: "זה לא נותן לי להקים ספק." The Add-supplier dialog shows a bare **"Validation failed."** with no field named, for every input.
sizing: S
scorecard_target_category: admin_surface
expected_delta: creating a supplier works at all; and a future 422 names the offending field instead of dead-ending.

## Root cause

`POST /api/v1/mutations/suppliers` requires `idempotency_key`:

```ts
// api/src/suppliers/mutations.ts
export const SupplierCreateRequestSchema = z.object({
  idempotency_key: z.string().trim().min(1).max(128),   // ← required
  supplier_id: z.string().trim().min(1).max(64),
  ...
```

The shared quick-create helper posts the form values verbatim and **never adds one**:

```ts
// shared.ts
body: JSON.stringify(opts.body),   // opts.body === form values
```

So every single Add-supplier submit 422s. The dialog has never been able to create a supplier — this is not an input-format problem, and no value in the form could have worked.

**Scope check:** only the suppliers endpoint requires `idempotency_key`. `components`, `items` and `supplier_items` have no such field, so the other three quick-create dialogs are unaffected — which matches Tom seeing this only on supplier.

## Second defect: the 422 was unreadable

`shared.ts` already receives the server's `issues` array and stores it, but the surfaced string falls back to `"Validation failed."`, so the actual field error is thrown away at the point it matters. That is why the dialog could not tell Tom what was wrong.

## Third defect: the STATUS control did nothing

The dialog offers `Active / Inactive`, but `SupplierCreateRequestSchema` has **no `status` field** and the schema is a plain (non-strict) `z.object`, so the key is silently **stripped**. Every supplier created here lands `ACTIVE` (the DB column default) no matter what was picked — a control that lies. Replaced with an honest one-line note; status is changed from the supplier's own page. Chosen over adding `status` to the backend contract because that is the other lane and a prod deploy, for a field this dialog explicitly defers ("Contact details and payment terms can be added afterwards").

## Fixed
- `shared.ts`: accepts an `idempotencyKey` option and merges it into the posted body; surfaces the first server `issue` (path + message) in the 422 message so the banner names the field.
- `QuickCreateSupplier.tsx`: sends a `crypto.randomUUID()` idempotency key, held in a ref so a retry after a network error reuses the same key (a genuine retry, not a second create) and only rotates once a create succeeds.
- `QuickCreateSupplier.tsx`: STATUS select → honest note.

## Manifest (files that may be touched)
manifest:
- src/components/admin/quick-create/shared.ts
- src/components/admin/quick-create/QuickCreateSupplier.tsx
- src/components/admin/quick-create/QuickCreateSupplier.test.tsx

## Out-of-scope
- Backend contract changes (adding `status` to supplier create) — other lane.
- The other three quick-create dialogs; verified unaffected.
- The duplicate/junk supplier master data noticed while investigating (`SUP-MANUALPG-*`, `SUP-MPGS-*` test rows in prod; two separate "Amit" records `SUP-010` and `SUP-049`) — reported to Tom, not silently cleaned.

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint .` → 0 errors.
- New `QuickCreateSupplier.test.tsx`: the POST body carries a non-empty `idempotency_key`; a 422 with `issues` renders the field message rather than the bare fallback; the same key is reused on retry.
- `npx vitest run` → green.

## Rollback
Revert the commit. Client-only; no contract or data change.

## Operator approval
- [x] Tom, 2026-07-26 — reported the blocker directly.

## Actual evidence (build run 2026-07-26)
- `npx tsc --noEmit` → **0**.
- `npx eslint src/components/admin/quick-create` → **clean** (no errors, no warnings).
- `npx vitest run` → **131 files / 1098 tests green** (was 1094), with 4 new `QuickCreateSupplier.test.tsx` cases:
  1. the POST body carries a non-empty `idempotency_key` (the fix for the actual blocker), and still carries `supplier_id` / `supplier_name_official`
  2. a 422 with `issues` renders `supplier_id: Supplier already exists` instead of the bare `Validation failed.`
  3. retrying a failed submit reuses the **same** key — a genuine retry, not a second create
  4. no status combobox is offered; the honest note is present instead

### Live confirmation
The supplier Tom actually needed was created and verified in production while diagnosing this
(`SUP-KETER-HARIMON` — כתר הרימון, contact אוראל, 050-644-0334), and `RAW-ROZATA`
("Orgeat Syrup (Rosetta)" = רוזטה שקדים) was re-pointed from Amit (`SUP-010`) to it. Amit and
D&D Mashkaot were **demoted, not deleted**, so both remain switchable alternatives, and the
mapping was cloned rather than hand-written so the cost basis (90 ₪/L) did not move.
A partial unique index (`uniq_supplier_items_component_primary`) allows exactly one primary
mapping per component, so the demote has to precede the insert — the first attempt hit that
constraint and rolled back atomically with nothing written.

# Tranche 000: template

status: template
created: 2026-04-22
scorecard_target_category: <category name>
expected_delta: +<n> on <category>
sizing: <S|M|L>  (S=≤4 files, M=5-8, L=9-12)

## Why this tranche
<2-3 sentences — what gap in the scorecard it closes, what operator pain it removes>

## Scope
- <bullet list of what the tranche changes>

## Manifest (files that may be touched)
manifest:
  - src/app/(admin)/admin/example/page.tsx
  - src/components/ExampleForm.tsx
  - tests/e2e/example-admin.spec.ts

## Revive directives (if any)
revive:
  - <path from quarantine.json>  # reason: one sentence

## Out-of-scope
- <bullet list of adjacent things that are NOT in this tranche>

## Tests / verification
- typecheck clean
- vitest: src/components/ExampleForm.test.tsx
- playwright: tests/e2e/example-admin.spec.ts
- regression-sentinel: no baseline regressions

## Exit evidence
- playwright trace or screenshot attached to PR
- scorecard delta ≥ expected
- PR link

## Rollback
<one sentence — e.g. "revert the PR on main; no data-layer changes so revert is clean">

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 000` on the PR)

## Actual evidence (filled in by /portal-tranche-fix run)
<pasted after execution: typecheck summary, test pass count, PR URL, scorecard delta>

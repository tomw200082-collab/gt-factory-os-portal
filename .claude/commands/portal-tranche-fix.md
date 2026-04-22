---
description: Execute tranche NNN as one bounded commit set on a feature branch. Refuses to edit files outside the manifest. Runs full verification before pushing.
argument-hint: "<NNN>  (required — tranche number, e.g. 042)"
---

You are running `/portal-tranche-fix` on the GT Factory OS portal. Tranche number: `$ARGUMENTS`.

## Hard preconditions — check before any write
1. `$ARGUMENTS` matches `^[0-9]{3}$`. If not, halt with an error.
2. `docs/portal-os/tranches/$ARGUMENTS-*.md` exists and readable.
3. That file contains a `manifest:` block with at least one path, and each path resolves to a file (or a reasonable new-file path inside an existing directory).
4. That file's `## Operator approval` section contains at least one completed checkbox `- [x] Tom approves`. If not, halt.
5. `docs/portal-os/tranches/_active.txt` is empty OR contains exactly the same `NNN`. If it contains a different tranche, halt with `ownership_conflict`.
6. Read `docs/portal-os/runtime_ready.snapshot.json`. For every manifest file path that matches a canonical form route (`src/app/(ops)/**/page.tsx`, `src/app/(planner)/**/page.tsx`, `src/app/(planning)/**/page.tsx`), require a RUNTIME_READY entry for that form. Else halt with `assumption_failure` citing `EXECUTION_POLICY.md §W2 Mode B`.

If any precondition fails, write nothing. Emit a one-paragraph report of what failed and a clear `Next action:` for the operator.

## Required steps (happy path)

1. **Set the active tranche**:
   ```bash
   echo "$ARGUMENTS" > docs/portal-os/tranches/_active.txt
   ```
   (PreToolUse hook now binds edits to the manifest of this tranche.)

2. **Create the feature branch**:
   ```bash
   git checkout -b portal-os/tranche-$ARGUMENTS
   ```

3. **Implement the tranche** by editing only files listed in `manifest:`. For each file:
   - Read the file (or the directory context if creating new).
   - Apply the changes described in the tranche plan.
   - Re-run typecheck locally: `npx tsc --noEmit`. Fix any new errors before continuing.

4. **Write or extend tests** (tests files listed in manifest):
   - Unit tests with Vitest if appropriate.
   - Playwright spec covering the tranche's critical path.
   - Run: `npm run test` and `npm run test:e2e`. Fix failures before continuing.

5. **Dispatch `portal-tranche-verifier`** as a subagent. Wait for PASS. If FAIL, either fix the cited issue and re-run the verifier, or halt with the failure.

6. **Compute scorecard delta** by dispatching `/portal-scorecard` logic inline (do not start a nested session; inline the scorecard recomputation from the latest state). Confirm the delta is ≥ the tranche's `expected_delta`. If not, note it in the PR body and let the operator decide.

7. **Clear the active tranche file**:
   ```bash
   > docs/portal-os/tranches/_active.txt
   ```

8. **Update the tranche plan file**:
   - Change `status: proposed` → `status: landed-pending-review`
   - Append an `## Actual evidence` section with typecheck/test outputs (excerpts, not full logs) and the PR link.

9. **Commit + push + open PR**:
   ```bash
   git add <manifest files> docs/portal-os/tranches/$ARGUMENTS-*.md docs/portal-os/scorecard.json docs/portal-os/scorecard.md docs/portal-os/tranches/_active.txt
   git commit -m "tranche $ARGUMENTS: <slug> — <one-line summary>"
   git push -u origin portal-os/tranche-$ARGUMENTS
   gh pr create --title "tranche $ARGUMENTS: <slug>" --body-file <tranche plan file>
   ```

## This command MUST NOT
- edit any file NOT in the manifest
- expand scope mid-run (the PreToolUse hook will block; don't try to work around it)
- skip verification
- merge the PR (human approval required)
- modify `baseline.json` or `quarantine.json`
- push to `main`

## Evidence requirement
Final message MUST include:
- `Evidence: <PR url>`
- scorecard delta: `<X>/100 → <Y>/100`
- `Next action: Tom reviews and merges the PR after CI green`.
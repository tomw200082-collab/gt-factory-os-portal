---
description: Propose the next tranche from highest-severity scorecard gaps. Writes docs/portal-os/tranches/NNN-<slug>.md with a bounded file manifest.
argument-hint: "[focus text]  (optional — steers the planner toward a category)"
---

You are running `/portal-tranche-plan` on the GT Factory OS portal. Optional focus hint: `$ARGUMENTS`.

## Read first
1. `docs/portal-os/scorecard.json` (latest)
2. Newest file under `docs/portal-os/audit-reports/`
3. `docs/portal-os/tranches/000-template.md`
4. Existing files under `docs/portal-os/tranches/` to determine next number `NNN`
5. `CLAUDE.md` at repo root

## Required steps

1. **Determine next tranche number** `NNN` = highest existing numeric-prefixed file + 1, zero-padded to 3 digits.

2. **Select the scope**:
   - If `$ARGUMENTS` is non-empty, treat it as the focus category or theme.
   - Else pick the lowest-scoring category from the scorecard that isn't already being addressed by an open tranche.
   - Size the tranche to **≤1 working day of changes** — typically 4–12 files. If the scope is bigger, split it into multiple tranches and propose only the first.

3. **Write `docs/portal-os/tranches/<NNN>-<slug>.md`** using this exact structure (copy the template and fill it in):
   ```
   # Tranche <NNN>: <short slug>

   status: proposed
   created: <YYYY-MM-DD>
   scorecard_target_category: <category name>
   expected_delta: +<n> on <category>
   sizing: <S|M|L>  (S=≤4 files, M=5-8, L=9-12)

   ## Why this tranche
   <2-3 sentences — what gap in the scorecard it closes, what operator pain it removes>

   ## Scope
   <bullet list of what the tranche changes>

   ## Manifest (files that may be touched)
   manifest:
     - src/app/(admin)/admin/foo/page.tsx
     - src/components/FooForm.tsx
     - tests/e2e/foo-admin.spec.ts
   (Exact paths. No globs in this block. The PreToolUse hook compares literally.)

   ## Revive directives (if any)
   revive: []
   (List paths from quarantine.json that this tranche is explicitly un-quarantining, with one-sentence justification each. Empty array if none.)

   ## Out-of-scope
   <bullet list of adjacent things that are NOT in this tranche — prevents scope creep>

   ## Tests / verification
   - typecheck clean
   - vitest: <specific files>
   - playwright: <specific specs>
   - regression-sentinel: no baseline regressions

   ## Exit evidence
   - screenshot or playwright trace of the end-to-end flow
   - scorecard delta ≥ expected
   - PR link

   ## Rollback
   <one sentence — how to back out if something goes wrong>

   ## Operator approval
   - [ ] Tom approves this plan (comment `@claude /portal-tranche-fix <NNN>` on the PR)
   ```

4. **Do NOT set `_active.txt`.** A tranche becomes active only when `/portal-tranche-fix NNN` is invoked.

5. **Commit** on branch `portal-os/tranche-<NNN>-plan` and push.

## This command MUST NOT
- edit `src/`, `tests/`, `middleware.ts`
- activate a tranche (`_active.txt` stays untouched)
- size a tranche larger than 12 files
- modify `baseline.json` or `quarantine.json`
- begin implementation

## Evidence requirement
Final message MUST include `Evidence: docs/portal-os/tranches/<NNN>-<slug>.md` and `Next action: Tom reviews plan; if approved, comment /portal-tranche-fix <NNN>`.
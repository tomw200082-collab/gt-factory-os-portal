# Tranche 092: scorecard truth correction (admin re-credit + nav close)

status: in-progress
created: 2026-06-25
scorecard_target_category: admin_superuser_depth / nav_integrity
expected_delta: +3 (88 → 91) — truth correction, NOT new feature work
sizing: XS (3 OS docs; no source, no backend)
source: /portal-audit admin-surface auditor (2026-06-25), Tom-approved

## Why
The scorecard (last_reviewed 2026-04-22) carried two ratings that no longer match
shipped reality:

1. **admin_superuser_depth 5/10 "backend-blocked"** — the admin-surface auditor
   proved `/admin/users`, `/admin/jobs`, `/admin/integrations` are **live
   real-data surfaces** (verified: `QuarantinedPage` no longer exists anywhere in
   `src/app`; all three have real `/api/...` proxies). Backend-package deliverable
   #3 shipped; #4/#5 read-halves shipped. Only audit-log history (#1), four-eyes
   queue (#2), and the run-now/resync mutation halves remain genuinely
   backend-blocked. Re-credited **5 → 7**.
2. **nav_integrity 9/10, gap "baseline freeze ritual"** — Tranche 090 performed
   the `kind=baseline-update` ritual and closed the manifest-orphan gap; the
   regression-sentinel re-run reported 0 drift. The sole remaining gap is closed.
   Re-credited **9 → 10**.

Honest framing: this is a versioned-artifact correction (the work shipped; the
doc lagged), not a claim of new progress — `delta_notes` says so explicitly.

## Scope (manifest)
manifest:
  - docs/portal-os/scorecard.json
  - docs/portal-os/scorecard.md
  - docs/portal-os/backend-package-admin-superuser-depth.md
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/092-scorecard-truth-correction.md
  - docs/portal-os/tranches/_active.txt

## Landed
- **scorecard.json** — admin_superuser_depth 5→7 (evidence + gap rewritten),
  nav_integrity 9→10 (T090 evidence), total 88→91, previous_score 86→88, delta
  3, delta_notes + _notes re-credit entries, generated_at bumped. JSON validated;
  category sum (91) == total.
- **scorecard.md** — headline 88→91 with a truth-correction banner; category-table
  rows for the two categories; "Single category below 8" section rewritten (admin
  at 7, the three shells live, #1/#2/#4-#5 mutation halves remain);
  last_reviewed → 2026-06-25.
- **backend-package-admin-superuser-depth.md** — STATUS UPDATE banner: #3 shipped,
  #4/#5 read-done/mutation-pending, #1/#2 backend-blocked.

## Verification
- scorecard.json `json.load`-valid; sum of category scores (91) equals `total`.
- Every re-credit cites the auditor evidence (Evidence: the 2026-06-25
  admin-surface audit + `grep -r QuarantinedPage src/app` → 0 matches).
- Docs only — no source/backend; tsc + vitest unaffected.

## Checklist
- [x] admin 5→7 · nav 9→10 · json valid · md mirror · backend-package banner
- [ ] Tom review / merge

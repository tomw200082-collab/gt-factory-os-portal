# Tranche 185 — GT Pulse Unit A sales contact loop

**Status:** in progress on `feat/gt-pulse-a-sales-corridor`; not deployed.
**Origin:** Tom approved the two GT Pulse specs, Native plan, and the bounded §6-A corridor/auth amendment on 2026-09-29. Brain `RUNTIME_READY(SalesActivityTasks)` signal 36 permits development against backend branch `12fa6c3`; it is not a release signal.
**Plan:** Sales-Machine `docs/superpowers/plans/2026-09-29-gt-pulse-a-sales-task-loop.md` §§Global Constraints, File Map, Tasks 2, 7–9.
**Scope:** Hebrew RTL B2B internal sales only. Keep customer outreach frozen and derive all task/timeline claims from committed server facts. Scorecard remains unchanged: its ten categories describe the factory portal.

## Manifest (every path this tranche may touch)

manifest:
  - docs/portal-os/tranches/185-gt-pulse-a-sales-corridor.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/middleware.ts
  - src/lib/auth/safe-redirect.ts
  - src/app/(auth)/login/page.tsx
  - src/app/auth/callback/page.tsx
  - src/app/api/sales/tasks/route.ts
  - src/app/api/sales/tasks/[task_id]/complete/route.ts
  - src/app/api/sales/leads/[lead_id]/contact/route.ts
  - src/app/api/sales/leads/[lead_id]/activity/route.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/useQueueScope.ts
  - src/app/(sales)/_lib/useOutcomeCapture.ts
  - src/app/(sales)/_lib/activityDraft.ts
  - src/app/(sales)/_lib/leadMilestones.ts
  - src/app/(sales)/_components/TaskCard.tsx
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/_components/LeadJourneyRail.tsx
  - src/app/(sales)/_components/EventTimeline.tsx
  - src/app/(sales)/_components/TodayQueue.tsx
  - src/app/(sales)/_components/TodayCard.tsx
  - src/app/(sales)/_components/OutcomeSheet.tsx
  - src/app/(sales)/_components/LeadDrawer.tsx
  - src/app/(sales)/sales/today/page.tsx
  - src/app/(sales)/sales/leads/page.tsx
  - src/app/(sales)/sales/attention/page.tsx
  - src/app/(sales)/sales/settings/page.tsx
  - src/app/(sales)/sales-tokens.css
  - tests/unit/middleware.test.ts
  - tests/unit/sales/safe-redirect.test.ts
  - tests/unit/sales/api-stubs.test.ts
  - tests/unit/sales/today-queue.test.tsx
  - tests/unit/sales/outcome-sheet.test.tsx
  - tests/unit/sales/use-outcome-capture.test.tsx
  - tests/unit/sales/activity-draft.test.ts
  - tests/unit/sales/lead-milestones.test.ts
  - tests/unit/sales/lost-is-reversible.test.tsx
  - tests/unit/sales/sales-shell.test.tsx
  - tests/e2e/sales-leads.spec.ts
  - tests/e2e/sales-today.spec.ts
  - tests/e2e/sales-attention.spec.ts
  - tests/e2e/sales-outcome-integrity.spec.ts
  - tests/e2e/sales-visual-a11y.spec.ts
  - tests/e2e/mobile-sales-today.spec.ts
  - tests/e2e/sales-email-to-task.spec.ts

No other path is writable under this tranche. The merged catalogue tranche 184 left a stale active pointer; opening 185 clears that pointer without editing catalogue code.

## Proposed Hebrew copy register entry — awaiting Tom's exact-entry approval

Sales-only `src/app/(sales)/_lib/labels.ts`, Unit A; the action labels describe recorded work and never imply an automatic customer send. Exact proposed additions:

| Key | Text |
|---|---|
| queueUnassigned / scopeUnassigned | ללא שיוך |
| tasksTitle | משימות |
| taskWhy | למה עכשיו |
| taskSource | מקור |
| taskComplete | השלם משימה |
| taskDone | המשימה הושלמה |
| taskNote | מה בוצע? |
| taskContactGap | בירור פרטי קשר |
| taskContactSource | איך אומתו הפרטים? |
| taskContactSave | שמור פרטי קשר |
| taskOpenLead | פתח את הליד |
| settingsManagerOnly | הגדרות אלה מנוהלות בידי מנהל המכירות |
| activityNoteLabel | מה קרה? |
| activityActionLabel | מה הפעולה הבאה? |
| activityDateLabel | מתי לבצע? |
| activityWaitReview | ממתין ללקוח — בדיקה |
| activityOther | פעולה אחרת |
| activityChooseAction | בחר פעולה |
| railTitle | מסלול הליד |
| railCreated | פנייה נקלטה |
| railOutreach | ניסיון קשר תועד |
| railAnswered | קשר דו־כיווני תועד |
| railNextAction | פעולה הבאה נקבעה |
| railConverted | המרה אומתה |
| railSource | הצג מקור |

This table is a proposal, not a self-issued register approval. Production release remains held until the policy's Tom register entry is recorded.

## Gates and rollback

Tasks 2, 7–9 use RED→GREEN tests and separate commits. Before release: typecheck, build, lint, unit and sales browser tests, role matrix, fresh five-lens sales UX gate, simplification and whole-branch review. Backend schema/API deploy first; portal second; `activity_required` only after exact runtime proof. A portal rollback restores the previous deployment and disables the internal gate without deleting task history. Production backlog insertion needs a separate count-specific written go/no-go.

## Evidence

Pending. See Sales-Machine `evidence/2026-09-29-gt-pulse-a-execution-index.md` for the backend staging proof and open runtime gaps.

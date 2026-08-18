# Tranche 165 — every call ends captured, wherever it was placed from

**Status:** built — tsc 0, vitest green
**Origin:** the 2026-08-18 v2 audit, findings P0-4, P1-1, P1-4, P1-5, P1-6, P1-9, P1-10.
sizing: M
scorecard_target_category: ops_surface
expected_delta: the discipline mechanic holds off the Today screen too — an outcome is never
silently discarded, a scheduled date is visible before it is committed, and a mistaken "אבוד" is
one tap from undone.

## The defect

**A call placed from the leads table ended in silence.** `OutcomeSheet` mounts only on
`/sales/today`. The leads page arms the same intent from the drawer — same `record_outreach`, same
sessionStorage handoff — but renders no sheet, and `today/page.tsx` then *cleared* any pending intent
whose lead was not in today's rows. So calling a `working` lead with a future next-touch from the
table wrote the outreach event, asked nothing on return, and dropped the answer with no toast, no
log, nothing. "Every call ends with the next one already scheduled" held only for queue members.

**The busy guard had a hole.** Escape and the dismiss button both refuse to close the sheet mid-write
— the comment in the file explains exactly why — but the backdrop click did not, so a tap anywhere
outside the panel unmounted the sheet with the write in the air and the error with nowhere to land.

**The two fast outcomes committed a date nobody saw.** "לא ענה" and "וואטסאפ נשלח" submit straight
from the root step; the server picks tomorrow or +2 days. Correct, and invisible — and until
migration 0324 those defaults were a fixed 06:00 UTC that scheduled Friday and Shabbat calls.

**The drawer stored the word "אחר" as a lost reason.** The sheet has a free-text branch; the drawer's
`<select>` did not, so choosing "אחר" wrote the literal string — precisely the "a lost lead with no
reason teaches nothing" failure migration 0318's header says the schema exists to prevent.

**Escape discarded an unsaved note without asking**, and **mark-lost had no undo**: recovery meant
finding the lead, opening the drawer, and setting the status back by hand.

**Two error messages lied.** A network failure on any POST reported "לא הצלחנו לטעון את התור" — a
read error for a write — and an expired session surfaced the API's English "Not authenticated" in a
Hebrew UI.

## The fix

- **The sheet follows the intent.** Both pages mount it; each resolves its own row. The today page
  no longer clears an intent for a lead it cannot see — it falls back to the leads cache, and clears
  only on a captured outcome or an explicit dismissal. Dropping an answer is now a decision the user
  makes, never a side effect of which screen they happened to be on.
- **The backdrop honours `busy`**, like Escape and the dismiss button always did.
- **The scheduled date is shown before it is committed.** `nextBusinessTouchPreview` mirrors 0324's
  rule client-side — 09:00 Israel time, never Friday or Saturday — and the body still omits the date
  unless the user changed it, so the server stays the source of truth and the preview is a faithful
  echo rather than a second opinion. A test pins the two to the same answer.
- **The drawer's lost path is the sheet's**: same radio group, same free-text branch, and the submit
  stays disabled until "אחר" has actual text behind it.
- **Moving a lead to בטיפול asks for the date** in the same action, which is what 0324 now requires.
- **Escape with unsaved text asks first. Mark-lost offers `בטל` for eight seconds.**
- **Write failures say the write failed**, and an expired session says so in Hebrew.

## Manifest

```
src/app/(sales)/_lib/api.ts
src/app/(sales)/_lib/labels.ts
src/app/(sales)/_lib/useOutcomeCapture.ts
src/app/(sales)/_components/OutcomeSheet.tsx
src/app/(sales)/_components/LeadDrawer.tsx
src/app/(sales)/_components/Toast.tsx
src/app/(sales)/sales/leads/page.tsx
src/app/(sales)/sales/today/page.tsx
src/lib/api-proxy.ts
tests/unit/sales/outcome-preview.test.ts
tests/unit/sales/leads.test.tsx
tests/e2e/sales-outcome-integrity.spec.ts
tests/e2e/sales-leads.spec.ts
docs/portal-os/tranches/165-outcome-loop-integrity.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

## Checklist

- [x] A call armed on `/sales/leads` raises the sheet on `/sales/leads`
- [x] An off-queue outcome is never silently discarded
- [x] The backdrop cannot dismiss the sheet mid-write
- [x] "לא ענה" / "וואטסאפ נשלח" show the date they are about to schedule
- [x] The preview agrees with the server rule, including the weekend roll
- [x] The drawer's lost path requires real text behind "אחר"
- [x] בטיפול from the drawer collects the next touch in the same action
- [x] Escape with an unsaved note asks before discarding
- [x] Mark-lost is undoable for eight seconds
- [x] A failed write says the write failed; an expired session says so in Hebrew
- [x] Registered in `docs/portal-os/registry.md` in the same commit
- [x] tsc 0 · vitest green

`useOutcomeCapture.ts` is listed in the plan's manifest and turned out not to need changing: the
hook's contract was already right — an intent is cleared only by `clear()`, and `dismiss()` leaves
it owed. What was wrong was the today page calling `clear()` on its behalf. Two existing test files
are here because this tranche changes the contracts they assert: the drawer's lost path became a
radio group, and moving a lead to `working` now collects a date.

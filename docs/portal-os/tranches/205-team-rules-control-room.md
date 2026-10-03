# Tranche 205 — Team and rules, and a control room for Tom (settings phase 3)

**Status:** in progress on `claude/settings-p3-team-control`.
**Origin:** Tom, 2026-10-02, approved the settings proposal (artifact 5Vygj5m5aqCSVX38W6Ek1i, areas C and D). Sales-Machine D-045. Backend: gt-factory-os `claude/settings-p3-team-control` (0378).

## Before

The signer of the automatic follow-ups was looked up by display name (`lead_journey_signers`, "Avi" → "אבי"), so renaming somebody silently stopped their follow-ups. The menu files per line (`lead_menus`) had no screen at all, and nobody could see whether a file was reachable. The queue and the lost reasons shared one save. No settings area showed its history. The health of the intake, the WhatsApp line, the follow-up runs, the mirror, the report and the radar was only visible through SQL.

## Change

- Settings, section "צוות וכללים":
  - **Signers by account:** each roster person, their Hebrew signer linked to their email, where it is read from today (account, or display name in the old map), and a plain warning when there is none (their leads get no automatic follow-up). One save; only changes are sent; an emptied field removes the signer. The roster stays read-only (D6), with the link to /admin/users.
  - **Menu file per line:** label, file name and "תקין / חסר קובץ" from the server's HEAD check (cached 10 minutes), why it is missing, and the warning that without a file the general reply goes out instead. Each line edits its label, file name and link, validated as the server does (https on cdn.shopify.com, a .pdf name).
  - **Today queue** and **lost reasons** stay as they were, each with its own save now.
  - Every area (also the quick messages and the response time) has its own save, a "שונה ע״י … לפני …" line, and "היסטוריית שינויים": the last 20 changes of its key, in words.
- **Control room `/sales/control`**, Tom only: the server checks the session email and answers 404 to everyone else; the page then shows only "הדף לא נמצא". The entry (desktop rail, phone header) is shown only to Tom's session. Tiles for intake, the WhatsApp line, follow-up runs, the Shopify mirror, the sales report, the sleeping radar and the settings log, each with its state in a word and an icon, its last success and one action. Meta's template approval is not stored and says so. Technical settings: the test phones (editable) and the intake mode (read-only).
- Fold-ins from earlier gates: (a) `workHours` from 3 hours up is whole hours, rounded down; (b) an invalid response-time save moves focus to the first invalid field; (c) a fresh Today card reads "חדש מהיום"; (d) a variable pill glued to the comma after it; (e) the "הודעה אחרת" picker marks the current choice with aria-pressed and a visible check.

## Manifest

manifest:
  - docs/portal-os/tranches/205-team-rules-control-room.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/settingHistory.ts
  - src/app/(sales)/_components/SettingsForm.tsx
  - src/app/(sales)/_components/SignersArea.tsx
  - src/app/(sales)/_components/MenuFilesArea.tsx
  - src/app/(sales)/_components/SettingHistory.tsx
  - src/app/(sales)/_components/ControlRoomView.tsx
  - src/app/(sales)/_components/QuickMessagesSection.tsx
  - src/app/(sales)/_components/ResponseTimeSection.tsx
  - src/app/(sales)/_components/JourneySection.tsx
  - src/app/(sales)/_components/WhatsAppQuick.tsx
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/sales/settings/page.tsx
  - src/app/(sales)/sales/control/page.tsx
  - src/app/(sales)/sales/control/layout.tsx
  - src/app/(sales)/sales-tokens.css
  - src/app/api/sales/menus/route.ts
  - src/app/api/sales/settings/history/route.ts
  - src/app/api/sales/control/route.ts
  - src/app/api/sales/control/test-phones/route.ts
  - tests/unit/sales/team-control.test.tsx
  - tests/unit/sales/gate-remediation.test.tsx
  - tests/unit/sales/response-time.test.tsx
  - tests/e2e/sales-team-control.spec.ts
  - tests/e2e/sales-attention.spec.ts
  - tests/e2e/sales-assignment.spec.ts

## Gates

- Unit: signers (sources, only-changes save, removal, too-long focus), menu files (validation, states, editor focus), split saves, history wording, control tiles and test phones, the nav entry hidden from a non-Tom admin, and each fold-in.
- e2e `@mocked`: team and rules, the control room for Tom, and a non-Tom admin (no entry, "not found" on the server's 404); the existing sales specs.
- vitest (all), typecheck, axe on the new screens (light and dark). Screenshots at 320, 390 and 1280, light and dark.

## Rollback

Revert the merge commit. The backend keeps the old signer map as a fallback and the old settings keys readable, so an older portal still renders.

# Tranche 203 — The lead conversation (settings phase 1)

**Status:** in progress on `claude/settings-p1-conversation`.
**Origin:** Tom, 2026-10-02, "מאשר המלצות" on the settings proposal (artifact 5Vygj5m5aqCSVX38W6Ek1i, area A). Sales-Machine D-042 (quick messages by situation) and D-044 (the automatic messages are read-only in settings). Backend: gt-factory-os `claude/settings-p1-conversation` (0376).

## Before

Settings held three fixed WhatsApp templates (new lead, reminder, returning customer), each opening "כאן תום" whoever sent it. Nobody could see what the lead line had already sent a lead automatically, or whether the line was live. The WhatsApp button opened even for a lead who wrote «הסר».

## Change

- Settings, section "שיחה עם ליד": the automatic sequence as a read-only timeline, with the exact texts, footers and buttons, when each goes out (first message, a button tap, wake 1–4 with the slots and rules), and whether the line is live, in test mode or off. One line says a change goes through Tom (the playbook, then Meta). Data: `GET /api/sales/journey` → `/api/v1/queries/sales/journey` (managers).
- Settings, section "הודעות מהירות": the six situations, each with a textarea, a variable chip bar that inserts at the cursor, a live preview on a synthetic lead, its own save, and "שונה ע״י … לפני …". The three old templates are no longer edited here (the key stays readable for old clients).
- Lead drawer: a compact line of what the line sent automatically ("נשלח אוטומטית: …"), with read status where the server links it by wamid and the button the lead tapped; it expands to the list. Dry runs never appear.
- Lead drawer and Today card: the WhatsApp button opens `wa.me` with the suggested situation's message (server-side `suggested_situation`), variables filled, signed by the sender. "הודעה אחרת" picks another situation. Outreach arming and `useOutcomeCapture` are unchanged.
- Opt-out: a lead whose phone opted out gets a disabled button with the visible text "הליד ביקש לא לקבל הודעות («הסר»)". Calls stay allowed.

## Manifest

manifest:
  - docs/portal-os/tranches/203-lead-conversation.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/api/sales/journey/route.ts
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/quickMessages.ts
  - src/app/(sales)/_components/WhatsAppQuick.tsx
  - src/app/(sales)/_components/AutoSentLine.tsx
  - src/app/(sales)/_components/JourneySection.tsx
  - src/app/(sales)/_components/QuickMessagesSection.tsx
  - src/app/(sales)/_components/SettingsForm.tsx
  - src/app/(sales)/_components/TodayCard.tsx
  - src/app/(sales)/_components/TodayQueue.tsx
  - src/app/(sales)/_components/LeadDrawer.tsx
  - src/app/(sales)/sales/settings/page.tsx
  - src/app/(sales)/sales/today/page.tsx
  - src/app/(sales)/sales/leads/page.tsx
  - src/app/(sales)/sales/attention/page.tsx
  - src/app/(sales)/sales-tokens.css
  - tests/unit/sales/quick-messages.test.ts
  - tests/unit/sales/whatsapp-quick.test.tsx
  - tests/unit/sales/settings-conversation.test.tsx
  - tests/e2e/sales-conversation.spec.ts
  - tests/e2e/_fixtures/salesJourney.ts

## Gates

- Red-first unit tests: variable filling, the situation fallback, the signer, the compact auto line, the button (suggested text, another situation, opted-out disabled, arming), the chip bar inserting at the cursor, the per-situation save and its validation, the journey timeline.
- e2e `@mocked`: settings section, lead drawer, Today card (sales-today, sales-leads, sales-orgs, settings).
- vitest (all), typecheck, eslint. Screenshots of the settings section and the lead drawer at 390 and 1280, light and dark.

## Rollback

Revert the merge commit. The backend keeps `whatsapp_templates` readable, so an older portal still works.

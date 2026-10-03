# Tranche 204 — Response time in working hours (settings phase 2)

**Status:** in progress on `claude/settings-p2-response-time`.
**Origin:** Tom, 2026-10-02, "מאשר המלצות" on the settings proposal (artifact 5Vygj5m5aqCSVX38W6Ek1i, area B). Sales-Machine D-043. Backend: gt-factory-os `claude/settings-p2-response-time` (0377).

## Before

One 24-hour wall-clock SLA counted Friday, Saturday and holidays. A lead that wrote on Thursday at 16:30 showed "עבר זמן" on Friday afternoon. The badge had one state, overdue. The settings field "זמן תגובה (SLA)" took a single number of hours.

## Change

- Lead card, Today card and lead drawer: a pill only for "עומד לעבור" (amber, the last quarter) and "עבר הזמן"; on time is quiet muted text ("עוד 5 שעות עבודה"), and the working time left sits in the meta line, not in the pill (`sla_state`, `sla_minutes_left` from the server). Business name and phone wrap, never truncate. A legacy `within` from an older backend still shows nothing.
- Today queue (UX gate P0-1): inside each section only a lead about to pass jumps ahead, soonest deadline first; overdue and on-time leads keep the stored queue direction. The server orders it the same way; the portal keeps it before the daily cap.
- Settings, section "זמני תגובה": working days, start and end, and the hot and normal targets in working hours, validated as the server validates them, with its own save and "שונה ע״י … לפני …". Managers only. It replaces the old SLA-hours field (the key stays readable on the server).
- Attention screen: "זמני תגובה · 7 ימים אחרונים", per rep: ענו בזמן, ענו באיחור, עוד לא ענו (and how many of those are about to pass), and the share that met the target.

## Manifest

manifest:
  - docs/portal-os/tranches/204-response-time.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/queue.ts
  - src/app/(sales)/_lib/responseTime.ts
  - src/app/(sales)/_components/SlaBadge.tsx
  - src/app/(sales)/_components/TodayCard.tsx
  - src/app/(sales)/_components/TodayQueue.tsx
  - src/app/(sales)/_components/LeadDrawer.tsx
  - src/app/(sales)/_components/LeadsTable.tsx
  - src/app/(sales)/_components/ResponseTimeSection.tsx
  - src/app/(sales)/_components/ResponseWeek.tsx
  - src/app/(sales)/_components/SettingsForm.tsx
  - src/app/(sales)/sales/settings/page.tsx
  - src/app/(sales)/sales/attention/page.tsx
  - src/app/(sales)/sales-tokens.css
  - tests/unit/sales/response-time.test.tsx
  - tests/unit/sales/gate-remediation.test.tsx
  - tests/e2e/sales-response-time.spec.ts

## Gates

- Red-first unit tests: the working-time wording, the validation (the server's rules), the three badge states and the legacy value, the queue order inside a section and before the cap, the settings section (days, times, targets, its own save, the attribution), the weekly metric per rep.
- e2e `@mocked`: Today, the lead drawer, settings and attention, plus the existing sales specs that cover them.
- vitest (all), typecheck, axe on the changed screens. Screenshots at 320, 390 and 1280, light and dark.

## Rollback

Revert the merge commit. The backend keeps `sla_hours` readable and `sla_state` keeps its column, so an older portal still renders (it shows the overdue badge only).

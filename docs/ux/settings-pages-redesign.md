# Settings pages redesign — Admin: Planning Policy, Users, Holidays

**Owner:** Tom asked for 20 polished iterations across the three admin settings/management pages.
**Goal:** Settings pages that read as structured configuration, not flat data dumps. Every field has context; every action has confirmation; every mutation has visible feedback.

---

## Pages covered

| Page | File | Lines before | Lines after |
|---|---|---|---|
| Planning policy | `src/app/(admin)/admin/planning-policy/page.tsx` | 251 | ~300 |
| Users | `src/app/(admin)/admin/users/page.tsx` | 247 | ~340 |
| Holidays | `src/app/(admin)/admin/holidays/page.tsx` | 1829 | ~1150 |

---

## Iteration roadmap

### Planning Policy (iters 1–6)

| # | Status | Outcome |
|---|---|---|
| 1 | done | Audit: 14 KV rows; inline value edit; no key creation (v1 locked). Self-explanatory: `planning_horizon_days`, `lead_time_buffer_days`, `min_order_qty`, `order_multiple`. Confusing without context: `demand_uncertainty_pct`, `confidence_interval`, `safety_stock_days`, `reorder_point` — users need downstream explanation. |
| 2 | done | Added "What planning policy controls" info SectionCard at top. One paragraph explains how values affect purchase recommendations, safety stock, and demand planning. Also clarifies per-item overrides and that changes affect next run only. |
| 3 | done | Per-row `FieldHelp` popover (HelpCircle icon, click-to-open tooltip). Help copy covers all known keys: `reorder_point`, `safety_stock_days`, `min_order_qty`, `order_multiple`, `planning_horizon_days`, `lead_time_buffer_days`, `demand_uncertainty_pct`, `confidence_interval`. Unknown keys show no popover gracefully. |
| 4 | done | Rows grouped into sections: "Reorder & safety" (reorder_point, safety_stock_days), "Ordering" (min_order_qty, order_multiple), "Horizon" (planning_horizon_days, lead_time_buffer_days), "Uncertainty" (demand_uncertainty_pct, confidence_interval), "Additional keys" (dynamic overflow). |
| 5 | done | Each section uses a `SectionCard` with eyebrow, title, and description. Page reads as structured configuration. Search still available; activating search collapses to a flat filtered view, clears section headers. |
| 6 | done | `FeedbackBanner` component with `role="status" aria-live="polite" aria-atomic`. Shows "Saving key…" while mutation pending (row highlights info-softer), success flash after, error with detail. Dismiss button on non-saving states. |

---

### Users (iters 7–11)

| # | Status | Outcome |
|---|---|---|
| 7 | done | Audit: users table with email, display_name, role (inline select), status (column + action button). Self-demotion protection: API returns 409 CANNOT_SELF_DEMOTE. Own row identified by `session.user_id`. |
| 8 | done | `RoleBadge` component: `admin`=danger (rare, high-trust — red draws attention to power), `planner`=info, `operator`=neutral, `viewer`=neutral. Role legend card added above table explaining each role's permission scope. |
| 9 | done | `StatusBadgeDot` component: `active`=success dotted, anything else=neutral. Replaces plain text `u.status`. |
| 10 | done | "You" chip (accent-soft border, accent text) next to own display name. Own role select replaced with "(locked)" label — prevents accidental self-demotion without API roundtrip. Own row has subtle accent/5 background to stand out. |
| 11 | done | Empty state: icon (Users lucide), headline "No users yet", explanation of magic-link sign-in flow, link to Supabase dashboard. Replaces bare "No users yet." text. |

---

### Holidays (iters 12–19)

| # | Status | Outcome |
|---|---|---|
| 12 | done | Audit: 1829 lines. Five major sections: header/filters (lines 1–470), list table (lines 473–590), add modal (933–1135), edit modal (1142–1313), archive modal (1320–1411), bulk import modal (1419–1751), field component (1811–1829). Complexity is warranted by full CRUD surface. Key UX gaps: raw ISO date strings, no relative dates, no type badges in table, no "next upcoming" summary card, no year-tab navigation. |
| 13 | done | Page header description expanded: "Holidays affect production planning schedules. Days marked here are excluded from working-day calculations used by purchase recommendations, demand bucketing, and lead-time projections." |
| 14 | done | `formatDateHuman(isoDate)` converts "2026-09-22" → "22 Sep 2026". `relativeDays(isoDate)` returns "in 5d", "yesterday", "today", "3d ago". Past rows rendered at 60% opacity in table (hover restores). Relative shown in table under human date; shown inline on mobile card. |
| 15 | done | `TYPE_TONE` map added: `full_holiday`=danger, `erev_chag`=warning, `chol_hamoed`=info. Type column now renders a `Badge` with tone instead of plain text. Desktop table and mobile cards both updated. |
| 16 | done | Archive action was already routed through `ArchiveHolidayModal` (confirmation drawer with required reason field). No structural change needed — existing UX is correct (not inline, requires explicit reason input). |
| 17 | done | Bulk import preview section redesigned. Summary card above commit button shows "X valid / Y errors". Rejected rows rendered as individual highlighted rows with row number + specific reason text, not a bare `<li>` list. Commit button label shows row count and rejected count. |
| 18 | done | Year filter replaced from `<select>` to a tab strip of pill buttons (All + one button per year). Current year labelled "(current)". Active year highlighted with `accent-soft` background. Works alongside type filter and archived toggle. |
| 19 | done | `UpcomingHolidaysCard` SectionCard inserted after the Tom-Tax warning. Shows next 3 upcoming active holidays (sorted by date, today or future). Each card shows name, Hebrew name, type badge, human date, and relative "in Xd". Hidden when no upcoming holidays. |

---

## Design patterns established

### FieldHelp popover
`HelpCircle` icon (3.5×3.5, strokeWidth 1.75) inline with key label. Click-to-toggle tooltip positioned to the right. Tooltip has dismiss X button. Used on planning policy; reusable for any settings page.

### FeedbackBanner
`role="status" aria-live="polite" aria-atomic` wrapper. Three states: `saving` (info tone, no dismiss), `success` (success tone, dismiss), `error` (danger tone, dismiss). Centralizes mutation feedback. Used on planning policy and users.

### Year tab strip (Holidays)
Pill buttons derived from loaded data + current year. `accent-soft` for active, `bg-subtle` with hover for inactive. "All" option always first. Label current year with `(current)` suffix at reduced opacity.

### Relative date display (Holidays)
Pair of helpers: `formatDateHuman` (Intl-formatted, e.g. "22 Sep 2026") and `relativeDays` ("in 5d", "today", "3d ago"). Past rows in list rendered at opacity-60 to signal historical context.

### Type badges (Holidays)
Three-tone system: full_holiday=danger (hard stop), erev_chag=warning (restricted), chol_hamoed=info (partial day). Mirrors operational severity of the restriction.

### Bulk import summary card (Holidays)
Before commit: summary bar shows valid/error split. Error rows highlighted individually with row number and specific rejection reason. Commit button echoes count. Summary bar tone: success if zero errors, warning if any errors.

---

## TypeScript status

TypeCheck as of final pass: 0 errors in all three target files.
Pre-existing errors: 3 lines in `sku-aliases/page.tsx` (unrelated, pre-existing baseline).

---

## Files touched

- `src/app/(admin)/admin/planning-policy/page.tsx`
- `src/app/(admin)/admin/users/page.tsx`
- `src/app/(admin)/admin/holidays/page.tsx`
- `docs/ux/settings-pages-redesign.md` (this file)

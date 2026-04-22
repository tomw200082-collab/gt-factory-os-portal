# Backend Package — Admin Superuser Depth

**Purpose:** enumerate the exact backend (W1 API lane) + contract (W4) work needed to move `admin_superuser_depth` from 5/10 to ≥ 8/10. This is the only category still below 8 in the portal scorecard as of 2026-04-22 (84/100 total, 9 of 10 categories at ≥ 8).

**Lane boundary reminder (from CLAUDE.md):** the portal lane (this repo) does NOT author backend contracts. W1 owns the Fastify API + queries/mutations; W4 owns the canonical contracts. This document describes what those lanes need to ship; once they land, portal-side completion is M-or-smaller per shell.

**Lane naming note:** PRODUCTION lanes are W1 (API) and W4 (contracts) per the multi-lane harness. This portal repo is W2 (portal-only) and may only consume already-authored contracts.

---

## Package contents (5 deliverables, any order)

### 1. `GET /api/v1/queries/audit-log`

Unblocks: History tab placeholders on 6 admin detail pages (products, components, suppliers, supplier-items, planning-policy, sku-aliases). The underlying `change_log` table already persists every master-data edit, but has no query endpoint exposed to the portal today.

**Shape (suggested):**
```
GET /api/v1/queries/audit-log?entity_type=item&entity_id=<uuid>&limit=50
→ 200 { rows: AuditRow[], count: int }

AuditRow {
  change_id: uuid
  entity_type: "item" | "component" | "supplier" | "supplier_item" | "planning_policy" | "sku_alias" | "bom_version"
  entity_id: string (uuid or composite key)
  change_kind: "create" | "update" | "delete" | "status_change"
  changed_fields: Record<string, { from: unknown; to: unknown }>
  changed_by_user_id: uuid
  changed_by_display_name: string
  changed_at: iso8601
  reason?: string | null                 // optional operator note
  source: "portal" | "api" | "job" | "migration"
}
```

**Portal-side completion (ready to ship post-W1):**
- New proxy `src/app/api/audit-log/route.ts` (GET transport-only).
- New component `<AuditTrail entityType entityId />` reading via `useQuery`.
- Replace placeholder on `src/app/(admin)/admin/products/[item_id]/page.tsx:1408-1419` with `<AuditTrail>`.
- Mount the same component on components / suppliers / supplier-items / planning-policy / sku-aliases detail pages.
- Sizing: M.

---

### 2. Master-data change-request / approval queue

Unblocks: four-eyes review on sensitive master-data fields (pack_size, case_pack, moq, lead_time_days, primary_supplier_id, price — anything that retroactively breaks in-flight planning runs). Today any admin PATCH commits immediately; there is no pre-commit gate.

**Shape (suggested):**
```
POST /api/v1/mutations/master-change-requests
Body: {
  idempotency_key: uuid
  entity_type: "item" | "component" | "supplier" | "supplier_item"
  entity_id: string
  proposed_changes: Record<string, unknown>   // field → new-value
  if_match_updated_at: iso8601                // optimistic-concurrency
  reason: string                              // required justification
}
→ 201 { change_request_id, status: "pending" }

GET /api/v1/queries/master-change-requests?status=pending&entity_type=&limit=
→ 200 { rows: ChangeRequest[], count: int }

POST /api/v1/mutations/master-change-requests/:id/approve
Body: { idempotency_key: uuid, approver_notes?: string }
→ 200 { change_request_id, status: "approved", committed_at, resulting_entity_updated_at }

POST /api/v1/mutations/master-change-requests/:id/reject
Body: { idempotency_key: uuid, rejection_reason: string }
→ 200 { change_request_id, status: "rejected" }
```

**W4 (contracts) owns:** field-classification table `field_risk_level: "low" | "high"` per entity. Low-risk fields (notes, display_name) keep the current direct-PATCH path; high-risk fields must route through change-requests.

**Portal-side completion:**
- Augment `src/lib/admin/mutations.ts:patchEntity` to accept `mode: "direct" | "propose"`.
- `<InlineEditCell>` reads the field's risk level (new prop) and sets `mode` accordingly; high-risk edits show "Pending review" visual state after submit.
- New list surface `src/app/(inbox)/inbox/approvals/master-data/page.tsx` (mirrors existing `/admin/sku-aliases` approve/reject pattern).
- Extend the T014 inbox federation to include pending change-requests alongside exception rows.
- Sizing: L (one-day tranche).

---

### 3. `GET /api/v1/queries/admin/users` + lifecycle mutations

Unblocks: `/admin/users` QuarantinedPage. Today a factory rollout cannot onboard operators, change roles, or deactivate leavers — someone has to open the Supabase console. This is a production blocker.

**Shape (suggested):**
```
GET /api/v1/queries/admin/users?status=active&limit=
→ 200 { rows: AdminUser[], count: int }

AdminUser {
  user_id: uuid
  email: string
  display_name: string
  role: "operator" | "planner" | "admin" | "viewer"
  status: "active" | "invited" | "deactivated"
  last_sign_in_at: iso8601 | null
  created_at: iso8601
}

POST /api/v1/mutations/admin/users          (invite)
Body: { idempotency_key, email, role, display_name }
→ 201 { user_id, email, role, invitation_sent: true }

PATCH /api/v1/mutations/admin/users/:id/role
Body: { idempotency_key, role, if_match_updated_at, reason }
→ 200 { user_id, role, updated_at }

POST /api/v1/mutations/admin/users/:id/deactivate
Body: { idempotency_key, reason }
→ 200 { user_id, status: "deactivated", deactivated_at }
```

**Portal-side completion:**
- New proxies under `src/app/api/admin/users/`.
- Replace `src/app/(admin)/admin/users/page.tsx` QuarantinedPage with list + role-change drawer (clone the `<QuickCreateItem>` / `patchEntity` patterns).
- Flip manifest row `/admin/users` from `quarantined` to `live`.
- Sizing: M.

---

### 4. `GET /api/v1/queries/admin/jobs` + run-now/pause

Unblocks: `/admin/jobs` QuarantinedPage. Today a failed integration sync or stuck cron is invisible until orders silently stop flowing.

**Shape (suggested):**
```
GET /api/v1/queries/admin/jobs?limit=
→ 200 { rows: JobDescriptor[], count: int }

JobDescriptor {
  job_name: string                // "sync_lionwheel_orders" | ...
  schedule: string                // cron expression or "on-demand"
  last_started_at: iso8601 | null
  last_finished_at: iso8601 | null
  last_status: "success" | "failed" | "running" | "never_run"
  last_error: string | null
  last_duration_ms: int | null
  freshness_seconds: int | null
  next_scheduled_at: iso8601 | null
  enabled: boolean
}

POST /api/v1/mutations/admin/jobs/:job_name/run-now
Body: { idempotency_key, reason? }
→ 202 { run_id, started_at }

POST /api/v1/mutations/admin/jobs/:job_name/pause
Body: { idempotency_key, reason }
→ 200 { job_name, enabled: false }

POST /api/v1/mutations/admin/jobs/:job_name/resume
Body: { idempotency_key, reason }
→ 200 { job_name, enabled: true }
```

**Portal-side completion:**
- Proxies under `src/app/api/admin/jobs/`.
- Replace `src/app/(admin)/admin/jobs/page.tsx` QuarantinedPage with list + Run-now confirmation + freshness chips (reuse `<FreshnessBadge>`).
- Flip manifest row to `live`.
- Sizing: S.

---

### 5. `GET /api/v1/queries/integrations/health`

Unblocks: `/admin/integrations` QuarantinedPage. LionWheel / Shopify / Green Invoice are the canonical boundary systems; a stale token or outage needs to be visible, not invisible.

**Shape (suggested):**
```
GET /api/v1/queries/integrations/health
→ 200 { channels: IntegrationChannel[] }

IntegrationChannel {
  channel: "lionwheel" | "shopify" | "green_invoice"
  display_name: string
  role: string                       // "Open orders + shipment mirror" etc.
  healthy: boolean
  last_poll_at: iso8601 | null
  last_success_at: iso8601 | null
  lag_seconds: int | null
  error_count_24h: int
  token_expires_at: iso8601 | null
  last_error?: { kind: string; message: string; at: iso8601 }
}

POST /api/v1/mutations/integrations/:channel/resync
Body: { idempotency_key, reason? }
→ 202 { run_id, started_at }
```

**Portal-side completion:**
- Proxy `src/app/api/integrations/health/route.ts` + per-channel resync.
- Replace `src/app/(admin)/admin/integrations/page.tsx` QuarantinedPage with 3 SectionCards mirroring the `<FreshnessBadge>` pattern (NOT the fabrication that T001 removed — real data this time).
- Flip manifest row to `live`.
- Sizing: S.

---

## Expected scorecard impact

Once all five land in W1 + W4 and the portal-side work follows:

| Deliverable | admin_superuser_depth delta | other |
|---|---|---|
| 1. audit-log GET | +1 (audit-trail tabs) | data_truthfulness +1 (history is verifiable) |
| 2. approval queue | +2 (four-eyes review on sensitive fields) | — |
| 3. /admin/users | +1 (un-quarantine; real role mgmt) | nav_integrity +1 (one less quarantined nav row) |
| 4. /admin/jobs | +0.5 (operational visibility) | data_truthfulness +1 (real last_run state) |
| 5. /admin/integrations | +0.5 (boundary-system visibility) | nav_integrity +1 |

Rough landing: `admin_superuser_depth 5 → 10`, portal total `84 → 90+`.

---

## Interfaces already defined elsewhere (reuse, don't re-author)

- `AdminMutationError` envelope: `src/lib/admin/mutations.ts:86-102` (STALE_ROW, UNIQUE_VIOLATION, FORBIDDEN, VALIDATION_ERROR).
- `ListEnvelope<T> = { rows: T[]; count: number }` — standard across every GET list endpoint.
- Idempotency-key pattern: every mutation takes `idempotency_key: uuid` (client-generated) + `if_match_updated_at: iso8601` for optimistic concurrency.
- Role enum: `"operator" | "planner" | "admin" | "viewer"` (portal + API agree).
- Authorization: `Authorization: Bearer <supabase_access_token>` on every upstream call; dev-shim bypass at both ends.

---

## Dependencies between the 5 deliverables

- **1 (audit-log)** and **2 (approval queue)** are independent — can land in parallel.
- **2 (approval queue)** should land before or alongside **1** (audit-log) because the History tab is where approved/rejected change-requests surface most naturally.
- **3 / 4 / 5** are independent of each other and of **1-2**. Any order is fine; each immediately un-quarantines one admin shell.

---

## Not in this package (out of W1 scope, defer to W4 / infra)

- LionWheel / Shopify / Green Invoice ingestion runtime wiring (W4 / data-platform lane).
- Backup / rollback / rebuild_verifier nightly (infra lane).
- Path-specific role claim in Supabase JWT app_metadata (needed to activate middleware defense-in-depth layer 3 from Tranche 016; a W4 schema addition).

---

last_reviewed: 2026-04-22

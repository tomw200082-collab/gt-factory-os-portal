#!/usr/bin/env bash
# Seed deterministic open exceptions for the Exceptions Inbox E2E.
#
# Strategy:
#   1. Revive any rows previously seeded by this script and transitioned
#      (resolved/acknowledged) back to 'open', so the E2E is re-runnable.
#   2. Insert canonical open rows only if their dedupe_key is not already
#      present anywhere (uses NOT EXISTS — avoids the partial-index quirk
#      with ON CONFLICT).
#
# Usage (from Windows PowerShell):
#   powershell.exe -Command "wsl -- bash /mnt/c/.../wsl-seed-exc.sh"
set -euo pipefail
PSQL="$HOME/pg-local/root/usr/lib/postgresql/16/bin/psql"
URL="postgresql://postgres@127.0.0.1:54322/gtfo"

"$PSQL" "$URL" <<'SQL'
begin;

-- Step 1: revive prior-run rows the E2E transitioned.
update private_core.exceptions
set status = 'open',
    acknowledged_by = null,
    acknowledged_at = null,
    resolved_by = null,
    resolved_at = null,
    resolution_notes = null,
    updated_at = now()
where category = 'e2e_smoke'
  and source = 'test.e2e_seed'
  and status <> 'open';

-- Step 2: insert canonical rows only if missing (keyed on dedupe_key).
insert into private_core.exceptions
  (exception_id, category, severity, source, title, detail, status,
   recommended_action, related_entity_type, related_entity_id, dedupe_key)
select gen_random_uuid(), 'e2e_smoke', v.severity, 'test.e2e_seed',
       v.title, 'Seeded for exceptions-inbox-real E2E.', 'open',
       'Acknowledge or resolve during the E2E run.',
       'smoke', v.short, v.dedupe
from (values
  ('warning', 'E2E seed open row A', 'A', 'e2e_smoke:open:A'),
  ('critical', 'E2E seed open row B', 'B', 'e2e_smoke:open:B'),
  ('info',    'E2E seed open row C', 'C', 'e2e_smoke:open:C')
) as v(severity, title, short, dedupe)
where not exists (
  select 1 from private_core.exceptions e
  where e.dedupe_key = v.dedupe
);

commit;

select status, count(*)
from private_core.exceptions
where category = 'e2e_smoke'
group by status
order by 1;
SQL

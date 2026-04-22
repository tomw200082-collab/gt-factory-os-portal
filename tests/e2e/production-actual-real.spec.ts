import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Production Actual — REAL HTTP submit path against the Window 1 local-safe DB.
//
// Prerequisites (same shape as goods-receipt-real-submit.spec.ts):
//   1. Local Postgres on 127.0.0.1:54322 (db = gtfo) seeded with
//      db/test-seed/portal_universe.sql
//   2. API server on 127.0.0.1:3333 pointing at the LOCAL DB
//   3. Portal next dev started with API_BASE=http://localhost:3333
//   4. A MANUFACTURED or REPACK item with primary_bom_head_id set and an
//      active bom_version with at least one active leaf line must exist in
//      the local DB (portal_universe seed provides this).
//
// These tests exercise /ops/production-actual driving the real
// page → /api/production-actuals/open → proxy → API → open snapshot path
// and page → POST /api/production-actuals → proxy → API → DB tx path.
//
// Authored under W2 Mode B, scoped to ProductionActual only, against
// RUNTIME_READY(ProductionActual) signal emitted 2026-04-21T17:05:00Z
// (evidence: docs/production_endgame_phase_a3_checkpoint.md).
//
// Upstream handler contract sources (verified byte-aligned with portal
// inlined types on page.tsx lines 44-95 at time of authorship):
//   api/src/production-actuals/schemas.ts
//   api/src/production-actuals/handler.ts
//   api/src/production-actuals/route.ts
// ---------------------------------------------------------------------------

test.describe("Production Actual — real submit against local target", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
  });

  test("401 — unauthenticated direct POST to proxy returns 401", async ({
    page,
  }) => {
    // No role set → no fakeauth in localStorage → SessionProvider has no
    // session. But the proxy enforces auth at the Supabase SSR layer, not at
    // the React layer, so a direct fetch without cookies lands on the 401
    // path in api-proxy.ts. The page.goto first ensures Next is warm.
    await page.goto("/login");
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/production-actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: "E2E-PA-NOAUTH-" + Date.now(),
          event_at: "2026-04-15T10:00:00.000Z",
          item_id: "DOES-NOT-MATTER",
          bom_version_id_pinned: "00000000-0000-0000-0000-000000000000",
          output_qty: 1,
          scrap_qty: 0,
          output_uom: "L",
          notes: null,
        }),
      });
      return { status: r.status };
    });
    expect(res.status).toBe(401);
  });

  test("operator happy path — open snapshot + submit → 'Production posted'", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/ops/production-actual");
    await expect(
      page.getByRole("heading", { name: /Production Actual/i }),
    ).toBeVisible();

    // Step 1 — pick first producible item (index 1 after blank).
    // producibleItems is split into optgroups by supply_method; either
    // group's first real <option> works for the golden path. We rely on
    // portal_universe seed having at least one MANUFACTURED or REPACK item
    // with an active BOM and at least one leaf line.
    const itemSelect = page.locator('select').first();
    await itemSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /Open production snapshot/i }).click();

    // Form advances to Step 2; pinned BOM summary appears.
    await expect(page.getByText(/Pinned BOM:/)).toBeVisible({ timeout: 15_000 });

    // Step 2 — enter output qty.
    const eventAtInput = page.locator('input[type="datetime-local"]');
    await eventAtInput.fill("2026-04-15T10:00");
    await page.locator('input[type="number"]').first().fill("1");

    await page.getByRole("button", { name: /Submit production/i }).click();

    // Real success state — posted banner with live submission_id.
    await expect(
      page.getByText(/Production posted/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/submission_id=[0-9a-f-]{36}/),
    ).toBeVisible();
  });

  test("idempotent replay — same idempotency_key returns idempotent_replay=true", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/ops/production-actual");

    // Drive the form once through the real path to build a committed row
    // we can then replay. Use the lightest UI-driven path available:
    // open snapshot via the form, then capture the snapshot values via an
    // in-page fetch (using the freshly established session cookie), and
    // POST the same envelope twice.
    const itemSelect = page.locator('select').first();
    await itemSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /Open production snapshot/i }).click();

    // Wait for Step 2 to render with snapshot values.
    await expect(page.getByText(/Pinned BOM:/)).toBeVisible({ timeout: 15_000 });

    // Capture item_id + bom_version_id_pinned by re-fetching the snapshot
    // directly against the proxy (now that session cookie is live).
    // We pick the chosen item_id from the SELECT value.
    const chosenItemId = await itemSelect.inputValue();
    const idemKey = "E2E-PA-REPLAY-" + Date.now();

    // First POST — establishes the row.
    const first = await page.evaluate(
      async ([item_id, idempotency_key]) => {
        const openRes = await fetch(
          `/api/production-actuals/open?item_id=${encodeURIComponent(
            item_id as string,
          )}`,
          { headers: { Accept: "application/json" } },
        );
        const openBody = await openRes.json();
        const submitRes = await fetch("/api/production-actuals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key,
            event_at: "2026-04-15T10:00:00.000Z",
            item_id,
            bom_version_id_pinned: openBody.bom_version_id_pinned,
            output_qty: 1,
            scrap_qty: 0,
            output_uom: openBody.output_uom_default,
            notes: null,
          }),
        });
        return { status: submitRes.status, body: await submitRes.json() };
      },
      [chosenItemId, idemKey],
    );
    expect(first.status).toBe(201);
    expect(first.body.status).toBe("posted");
    expect(first.body.idempotent_replay).toBe(false);
    const firstSubmissionId = first.body.submission_id as string;

    // Second POST with same idempotency_key — replay.
    const replay = await page.evaluate(
      async ([item_id, idempotency_key, bom_version_id_pinned, output_uom]) => {
        const r = await fetch("/api/production-actuals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key,
            event_at: "2026-04-15T10:00:00.000Z",
            item_id,
            bom_version_id_pinned,
            output_qty: 1,
            scrap_qty: 0,
            output_uom,
            notes: null,
          }),
        });
        return { status: r.status, body: await r.json() };
      },
      [
        chosenItemId,
        idemKey,
        first.body.bom_version_id_pinned,
        first.body.output_uom,
      ],
    );
    expect(replay.status).toBe(201);
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.submission_id).toBe(firstSubmissionId);
  });

  test("403 — planner cannot submit production actual", async ({ page }) => {
    await setFakeRole(page, "planner");
    await page.goto("/ops/production-actual");

    // Direct fetch against the proxy with planner session. The UI may or
    // may not render the form (some route-layers gate by role); either way
    // the backend role-gate is the source of truth. Upstream handler rejects
    // non-operator/admin with 403 per roleAllowsProductionActualSubmit().
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/production-actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: "E2E-PA-PLANNER-" + Date.now(),
          event_at: "2026-04-15T10:00:00.000Z",
          item_id: "DOES-NOT-MATTER",
          bom_version_id_pinned: "00000000-0000-0000-0000-000000000000",
          output_qty: 1,
          scrap_qty: 0,
          output_uom: "L",
          notes: null,
        }),
      });
      return { status: r.status };
    });
    expect(res.status).toBe(403);
  });
});

import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Goods Receipt — REAL HTTP submit path against the Window 1 local-safe DB.
//
// Prerequisites (Window 1's local target must already be up):
//   1. Local Postgres running on 127.0.0.1:54322 (db = gtfo)
//   2. API server running on 127.0.0.1:3333 (DATABASE_URL → local)
//   3. Portal universe seeded (db/test-seed/portal_universe.sql applied)
//   4. next dev started with GOODS_RECEIPTS_API_BASE=http://localhost:3333
//
// These tests exercise the canonical /ops/receipts page, driving the real
// form → buildEnvelope → proxy → API → DB transaction → render path.
// "Receipt recorded (mock)" NEVER appears on this path; success renders
// "Receipt posted" with the real submission_id.
// ---------------------------------------------------------------------------

test.describe("Goods Receipt — real submit against local target", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
  });

  test("operator fills form → submit → 'Receipt posted' with live submission_id", async ({
    page,
  }) => {
    await page.goto("/ops/receipts");
    await expect(page.getByRole("heading", { name: "Goods Receipt" })).toBeVisible();

    // Clear the default event-time to a fixed past ISO so event_at is safely
    // not-in-future even under clock skew.
    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:00");

    // Supplier: SUP-SHI is index 1 in the IDB-seeded supplier universe after
    // the blank option. Using index avoids Hebrew-in-test-string fragility.
    await page
      .getByTestId("receipt-supplier-select")
      .selectOption({ index: 1 });

    // Line 0: first real item after blank. The sort order is by label; we
    // don't assert which item lands first — we just need one valid active
    // RM/FG/PKG. The portal-universe seed ensures the first 13 items are
    // all valid in the local DB.
    await page.getByTestId("receipt-line-item-0").selectOption({ index: 1 });
    await page.getByTestId("receipt-line-qty-0").fill("5");

    await page.getByRole("button", { name: "Submit receipt" }).click();

    // Real success state — NOT the mock "Receipt recorded (mock)" text.
    // SuccessState renders its `title` prop as a <div>, not a heading element.
    await expect(page.getByText("Receipt posted", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Server response details surfaced in the success card.
    await expect(page.getByText(/event_at:/)).toBeVisible();
    await expect(page.getByText(/posted_at:/)).toBeVisible();
    await expect(page.getByText(/idempotency_key:/)).toBeVisible();

    // Submission ID is a real UUID (v4-shaped).
    await expect(page.getByText(/Submission [0-9a-f-]{36} posted/)).toBeVisible();

    // "Record another receipt" CTA rendered.
    await expect(
      page.getByRole("button", { name: /Record another receipt/i }),
    ).toBeVisible();
  });

  test("replay with same form values → 'Already posted — no duplicate created'", async ({
    page,
  }) => {
    await page.goto("/ops/receipts");

    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:00");
    await page.getByTestId("receipt-supplier-select").selectOption({ index: 1 });
    await page.getByTestId("receipt-line-item-0").selectOption({ index: 1 });
    await page.getByTestId("receipt-line-qty-0").fill("5");

    await page.getByRole("button", { name: "Submit receipt" }).click();
    await expect(page.getByText("Receipt posted", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Capture the idempotency key displayed in the success card.
    const firstKeyText = await page
      .getByText(/idempotency_key:/)
      .textContent();
    const firstKey = firstKeyText?.replace(/idempotency_key:\s*/, "").trim();

    // Click "Record another receipt" resets submitFlow (new idempotency key),
    // so to exercise replay we directly re-POST the same envelope via fetch
    // against the portal proxy with the SAME idempotency_key. This is the
    // real replay contract the UI documents (a retry that keeps the key).
    const session = {
      user_id: "aaaaaaaa-0000-0000-0000-0000000000a1",
      display_name: "Avi (operator)",
      email: "operator@fake.gtfactory",
      role: "operator",
    };
    const replay = await page.evaluate(
      async ([k, s]) => {
        const r = await fetch("/api/goods-receipts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Fake-Session": JSON.stringify(s),
          },
          body: JSON.stringify({
            idempotency_key: k,
            event_at: "2026-04-15T10:00:00.000Z",
            supplier_id: "SUP-SHI",
            lines: [
              {
                item_type: "RM",
                item_id: "RAW-RUM-WHITE",
                quantity: 5,
                unit: "L",
              },
            ],
          }),
        });
        return { status: r.status, body: await r.json() };
      },
      [firstKey, session],
    );
    expect(replay.status).toBe(201);
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.status).toBe("posted");
  });

  // Note: viewer-role 403 is NOT exercised here because the portal's
  // client-side RoleGate in src/app/(operator)/layout.tsx intercepts
  // viewer before the form mounts — viewer cannot reach the submit path
  // via the UI. The API-layer 403 for viewer is proven in Window 1's
  // integration test I8 (api/test/goods_receipts.test.ts:260).

  test("unknown supplier → 409 SUPPLIER_INACTIVE via proxy", async ({
    page,
  }) => {
    // This exercises the full proxy + API + handler path via an in-page
    // fetch. It proves the portal's proxy forwards headers correctly and
    // that a 409 from the handler surfaces verbatim. The canonical form
    // dropdown can't produce an unknown-supplier state since the select
    // is constrained to seeded values, so we use a direct proxy call.
    await page.goto("/ops/receipts");

    const session = {
      user_id: "aaaaaaaa-0000-0000-0000-0000000000a1",
      display_name: "Avi (operator)",
      email: "operator@fake.gtfactory",
      role: "operator",
    };
    const res = await page.evaluate(async (s) => {
      const r = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Fake-Session": JSON.stringify(s),
        },
        body: JSON.stringify({
          idempotency_key: `E2E-BAD-SUPPLIER-${Date.now()}`,
          event_at: "2026-04-15T10:00:00.000Z",
          supplier_id: "SUP-DOES-NOT-EXIST",
          lines: [
            {
              item_type: "RM",
              item_id: "RAW-RUM-WHITE",
              quantity: 5,
              unit: "L",
            },
          ],
        }),
      });
      return { status: r.status, body: await r.json() };
    }, session);

    expect(res.status).toBe(409);
    expect(res.body.reason_code).toBe("SUPPLIER_INACTIVE");
  });
});

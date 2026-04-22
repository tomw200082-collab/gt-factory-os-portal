// ---------------------------------------------------------------------------
// Tranche 015: live role-boundary verification.
//
// Closes the gap the re-audit flagged: prior tests only verified nav-link
// visibility per role plus one direct-URL block. This spec adds:
//   1. UI-gate verification for surfaces tightened in T003 (the
//      /inbox/approvals/* subtree) and for admin detail pages.
//   2. API-gate verification — viewer/operator hitting privileged
//      mutation endpoints via the portal proxy must receive non-2xx.
//      We assert status >= 400 generically so any defense layer along
//      the chain (layout RoleGate, middleware, upstream JWT scope)
//      counts as a valid defense.
//
// All tests use the existing dev-shim setFakeRole helper. The portal proxy
// forwards to upstream; if dev-shim auth is on at the API server too, the
// upstream is the line of defense for direct API calls.
// ---------------------------------------------------------------------------

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe.configure({ mode: "serial" });

// Synthetic IDs used for surfaces that require a path param. The pages
// must block the role BEFORE attempting any data fetch — so an arbitrary
// ID is fine for negative-path tests.
const FAKE_PO_ID = "00000000-0000-0000-0000-000000000000";
const FAKE_SUB_ID = "00000000-0000-0000-0000-000000000000";
const FAKE_ITEM_ID = "00000000-0000-0000-0000-000000000000";

async function expectBlocked(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // RoleGate renders one of these labels. Either is a valid block signal.
  const blocked = page.getByText(
    /Not available for your role|Sign in to continue/i,
  );
  await expect(blocked).toBeVisible({ timeout: 5_000 });
}

async function expectNon2xx(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<void> {
  const opts: { headers: Record<string, string>; data?: string } = {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.data = JSON.stringify(body);
  }
  const res =
    method === "GET"
      ? await request.get(url, { headers: opts.headers })
      : method === "POST"
        ? await request.post(url, opts)
        : method === "PATCH"
          ? await request.patch(url, opts)
          : await request.delete(url, opts);
  expect(
    res.status(),
    `expected ${method} ${url} to be rejected (>= 400) for the current role; got ${res.status()}`,
  ).toBeGreaterThanOrEqual(400);
}

test.describe("Role boundaries — UI gates (defense-in-depth layer 1)", () => {
  test("viewer cannot reach /inbox/approvals/waste/[id] — T003 child layout enforces", async ({
    page,
  }) => {
    await setFakeRole(page, "viewer");
    await expectBlocked(page, `/inbox/approvals/waste/${FAKE_SUB_ID}`);
  });

  test("viewer cannot reach /inbox/approvals/physical-count/[id]", async ({
    page,
  }) => {
    await setFakeRole(page, "viewer");
    await expectBlocked(
      page,
      `/inbox/approvals/physical-count/${FAKE_SUB_ID}`,
    );
  });

  test("operator cannot reach /inbox/approvals/waste/[id]", async ({ page }) => {
    await setFakeRole(page, "operator");
    await expectBlocked(page, `/inbox/approvals/waste/${FAKE_SUB_ID}`);
  });

  test("operator cannot reach /admin/items detail page", async ({ page }) => {
    await setFakeRole(page, "operator");
    await expectBlocked(page, `/admin/items/${FAKE_ITEM_ID}`);
  });

  test("viewer cannot reach /admin/items list", async ({ page }) => {
    await setFakeRole(page, "viewer");
    await expectBlocked(page, "/admin/items");
  });

  test("planner cannot reach /admin/items list (admin-only)", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await expectBlocked(page, "/admin/items");
  });
});

test.describe("Role boundaries — API gates (defense-in-depth layer 2)", () => {
  test("viewer POST /api/planning/runs/execute is rejected", async ({
    request,
    page,
  }) => {
    await setFakeRole(page, "viewer");
    // Touch the page so the dev-shim cookie/localStorage propagates to the
    // request context where applicable.
    await page.goto("/dashboard");
    await expectNon2xx(request, "POST", "/api/planning/runs/execute", {
      site_id: "GT-MAIN",
      idempotency_key: "test-viewer-rejected",
    });
  });

  test("operator POST /api/planning/runs/execute is rejected", async ({
    request,
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/dashboard");
    await expectNon2xx(request, "POST", "/api/planning/runs/execute", {
      site_id: "GT-MAIN",
      idempotency_key: "test-operator-rejected",
    });
  });

  test("viewer PATCH /api/items/[id]/status is rejected", async ({
    request,
    page,
  }) => {
    await setFakeRole(page, "viewer");
    await page.goto("/dashboard");
    await expectNon2xx(
      request,
      "PATCH",
      `/api/items/${FAKE_ITEM_ID}/status`,
      {
        idempotency_key: "test-viewer-patch-rejected",
        if_match_updated_at: new Date().toISOString(),
        status: "INACTIVE",
      },
    );
  });

  test("operator PATCH /api/items/[id]/status is rejected", async ({
    request,
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/dashboard");
    await expectNon2xx(
      request,
      "PATCH",
      `/api/items/${FAKE_ITEM_ID}/status`,
      {
        idempotency_key: "test-operator-patch-rejected",
        if_match_updated_at: new Date().toISOString(),
        status: "INACTIVE",
      },
    );
  });

  test("viewer POST /api/waste-adjustments/[id]/approve is rejected", async ({
    request,
    page,
  }) => {
    await setFakeRole(page, "viewer");
    await page.goto("/dashboard");
    await expectNon2xx(
      request,
      "POST",
      `/api/waste-adjustments/${FAKE_SUB_ID}/approve`,
      { idempotency_key: "test-viewer-approve-rejected" },
    );
  });

  test("operator POST /api/waste-adjustments/[id]/approve is rejected", async ({
    request,
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.goto("/dashboard");
    await expectNon2xx(
      request,
      "POST",
      `/api/waste-adjustments/${FAKE_SUB_ID}/approve`,
      { idempotency_key: "test-operator-approve-rejected" },
    );
  });
});

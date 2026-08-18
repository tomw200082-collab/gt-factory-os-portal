import { test, expect } from "@playwright/test";
import { setFakeRole } from "./helpers";

// Mobile-only spec — runs under the mobile-safari Playwright project
// (playwright.config.ts), iPhone 14 device (390x844, WebKit). The workspace is
// phone-first; this is the shape that actually gets used.
//
// Deliberately NOT tagged @mocked, matching the mobile-home-today-board /
// mobile-receipts-door-mode / mobile-input-zoom precedent: portal-pr-guard
// installs chromium only, so the `--grep @mocked` gate must not select a spec
// that needs WebKit. Tagging these cost one red CI run before the convention
// was found. Run locally with webkit installed:
//     npx playwright install webkit && npx playwright test mobile-sales-today
//
// This leaves the phone-first product's phone spec outside CI, which is worth
// closing — see the deferred-item list in tranche 162: one small follow-up can
// add `webkit` to the guard's install step (and wire `npm run lint:urls`, which
// the regression sentinel found was never added to the workflow either).

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}", reminder: "ה", returning_customer: "ל" },
};

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/week-stats**", (r) =>
    r.fulfill({ json: { stats: { week_new_leads: 0, working_now: 0, week_converted: 0 } } }),
  );
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
});

test("the phone gets a bottom tab bar and a quick-add within thumb reach", async ({
  page,
}) => {
  await page.goto("/sales/today");

  for (const href of ["/sales/today", "/sales/leads", "/sales/orgs"]) {
    await expect(page.getByTestId(`sales-tab-${href}`)).toBeVisible();
  }
  // The desktop rail stays out of the way on a phone.
  await expect(page.getByTestId("sales-rail-/sales/today")).toBeHidden();

  const quickAdd = page.getByTestId("sales-quick-add");
  await expect(quickAdd).toBeVisible();

  // Tab targets are thumb-sized.
  const box = await page.getByTestId("sales-tab-/sales/leads").boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("the tab bar navigates", async ({ page }) => {
  await page.goto("/sales/today");
  await page.getByTestId("sales-tab-/sales/leads").click();
  await expect(page).toHaveURL(/\/sales\/leads/);
  await expect(page.getByRole("heading", { name: "לידים", level: 1 })).toBeVisible();
});

test("quick-add captures a lead in three fields", async ({ page }) => {
  const posted: unknown[] = [];
  await page.route("**/api/sales/quick-add", (r) => {
    posted.push(r.request().postDataJSON());
    return r.fulfill({ json: { lead_id: "N1", org_id: "N1", was_new: true } });
  });

  await page.goto("/sales/today");
  await page.getByTestId("sales-quick-add").click();

  const sheet = page.getByTestId("quick-add-sheet");
  await expect(sheet).toBeVisible();

  // The name is the one thing required.
  await page.getByTestId("quick-add-save").click();
  await expect(sheet).toBeVisible();

  await page.getByTestId("quick-add-name").fill("דנה");
  await page.getByTestId("quick-add-phone").fill("052-1234567");
  await page.getByTestId("quick-add-business").fill("קפה חדש");
  await page.getByTestId("quick-add-save").click();

  await expect.poll(() => posted.length).toBe(1);
  expect((posted[0] as { contact_name: string }).contact_name).toBe("דנה");
  await expect(sheet).toBeHidden();
});

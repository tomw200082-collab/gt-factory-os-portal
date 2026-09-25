// ---------------------------------------------------------------------------
// Tranche 179 — /admin/portal-registrations, the customer-portal staff screen.
//
// Tagged @mocked: stubs the six /api/portal/* proxies at the browser
// (page.route), so the screen is exercised with no backend. Covered: the
// pending list renders; the customer search is scoped to the registration and
// shows whether its phone matches; search, pick and approve sends the picked
// Shopify id and offers the WhatsApp link; a registration someone else already
// decided (409) is explained on the row; the login-link tab creates a link by
// access_id and shows it; revoking access asks first, posts, and refreshes the
// list.
// ---------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

const REG_OLD_ID = "5f0c2a1e-7d3b-4c7a-9e21-3a6f8b1d0c01";
const REG_NEW_ID = "9a41d7c2-0b6e-4f3d-8c15-7e2a9b4f6d02";

const REG_OLD = {
  id: REG_OLD_ID,
  wa_phone: "972501234567",
  business_name: "קפה השכונה",
  branch_city: "תל אביב",
  contact_name: "דנה",
  suggested_customer_id: "gid://shopify/Customer/1001",
  status: "pending",
  created_at: "2026-09-20T08:00:00Z",
};

const REG_NEW = {
  id: REG_NEW_ID,
  wa_phone: "972529876543",
  business_name: "Bar Lev",
  branch_city: "Haifa",
  contact_name: "Avi",
  suggested_customer_id: null,
  status: "pending",
  created_at: "2026-09-23T12:00:00Z",
};

const CUSTOMERS = [
  {
    id: "gid://shopify/Customer/1001",
    name: "קפה השכונה דיזנגוף",
    city: "תל אביב",
    orders_count: 14,
    phone_matches: true,
  },
  {
    id: "gid://shopify/Customer/1002",
    name: "קפה השכונה רמת גן",
    city: null,
    orders_count: 1,
    phone_matches: false,
  },
];

const WA_APPROVAL = "https://wa.me/972501234567?text=approved";

const ACCESS_ID = "c3e8b1f4-2a7d-4e9b-b6c0-1d5f8a3e7b03";

const APPROVED = {
  access_id: ACCESS_ID,
  wa_phone: "972529876543",
  display_name: "Bar Lev",
  branch: "Haifa",
  shopify_customer_id: "gid://shopify/Customer/2002",
  approved_at: "2026-09-21T09:00:00Z",
  source: "registration",
};

const LOGIN_URL = "https://order.example.test/login/one-time-token";
const WA_LOGIN = "https://wa.me/972529876543?text=login";

const LIST = /\/api\/portal\/registrations\?/;
const DECIDE = /\/api\/portal\/registrations\/[^/?]+\/decide$/;
const SEARCH = /\/api\/portal\/customer-search\?/;
const APPROVED_LIST = /\/api\/portal\/approved\?/;
const LOGIN_LINK = /\/api\/portal\/login-link$/;
const REVOKE = /\/api\/portal\/access\/[^/?]+\/revoke$/;

/** Opens the page on these pending rows. The returned params are those of the
 *  latest customer search, kept up to date by the search stub. */
async function openPending(
  page: Page,
  rows: unknown[],
): Promise<URLSearchParams> {
  const searched = new URLSearchParams();
  await setFakeRole(page, "admin");
  await page.route(LIST, (route) => route.fulfill({ json: { rows } }));
  await page.route(SEARCH, (route) => {
    new URL(route.request().url()).searchParams.forEach((value, key) =>
      searched.set(key, value),
    );
    return route.fulfill({ json: { rows: CUSTOMERS } });
  });
  await page.goto("/admin/portal-registrations");
  return searched;
}

async function openLoginTab(page: Page, query: string): Promise<void> {
  await page.getByTestId("portal-tab-login").click();
  await expect(page.getByTestId("portal-tab-login")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByTestId("portal-approved-search").fill(query);
}

test.describe("@mocked portal registrations", () => {
  test("the pending list renders every request, oldest first", async ({
    page,
  }) => {
    await openPending(page, [REG_NEW, REG_OLD]);

    const items = page
      .getByTestId("portal-registrations-list")
      .locator(":scope > li");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute(
      "data-testid",
      `portal-registration-${REG_OLD_ID}`,
    );

    const row = page.getByTestId(`portal-registration-${REG_OLD_ID}`);
    await expect(row).toContainText("קפה השכונה");
    await expect(row).toContainText("תל אביב");
    await expect(row).toContainText("972501234567");
    await expect(row).toContainText("דנה");
    await expect(row).toContainText("#1001");
    await expect(
      page.getByTestId(`portal-registration-${REG_NEW_ID}`),
    ).toContainText("None");

    // Nothing picked yet, so nothing to approve.
    await expect(page.getByTestId(`portal-approve-${REG_OLD_ID}`)).toBeDisabled();
  });

  test("search, pick and approve sends the picked id and offers the WhatsApp link", async ({
    page,
  }) => {
    let decideUrl = "";
    let decideBody: unknown = null;
    await page.route(DECIDE, (route) => {
      decideUrl = route.request().url();
      decideBody = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, wa_link: WA_APPROVAL } });
    });
    const searched = await openPending(page, [REG_OLD, REG_NEW]);

    await page
      .getByTestId(`portal-customer-search-${REG_OLD_ID}`)
      .fill("קפה השכונה");
    const option = page.getByTestId(`portal-customer-option-${REG_OLD_ID}-1001`);
    await expect(option).toContainText("קפה השכונה דיזנגוף");
    await expect(option).toContainText("תל אביב");
    await expect(option).toContainText("14 orders");
    await expect(option).toContainText("Phone matches");
    await expect(option).toContainText("Suggested");
    const other = page.getByTestId(`portal-customer-option-${REG_OLD_ID}-1002`);
    await expect(other).toContainText("1 order");
    await expect(other).toContainText("Phone does not match");
    // The search is scoped to this registration, so phone_matches is about its phone.
    expect(searched.get("q")).toBe("קפה השכונה");
    expect(searched.get("registration_id")).toBe(REG_OLD_ID);

    await option.click();
    const picked = page.getByTestId(`portal-picked-${REG_OLD_ID}`);
    await expect(picked).toContainText("#1001");
    await expect(picked).toContainText("Phone matches");
    await expect(page.getByTestId(`portal-approve-${REG_OLD_ID}`)).toBeEnabled();

    await page.getByTestId(`portal-approve-${REG_OLD_ID}`).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("#1001");
    await expect(dialog).toContainText(
      "The phone is on that customer's Shopify record.",
    );
    await dialog.getByRole("button", { name: "Approve registration" }).click();

    const send = page.getByTestId(`portal-send-approval-${REG_OLD_ID}`);
    await expect(send).toHaveText(/Send approval on WhatsApp/);
    await expect(send).toHaveAttribute("href", WA_APPROVAL);
    await expect(send).toHaveAttribute("target", "_blank");
    expect(decideUrl).toContain(`/api/portal/registrations/${REG_OLD_ID}/decide`);
    expect(decideBody).toEqual({
      decision: "approve",
      shopify_customer_id: "gid://shopify/Customer/1001",
    });

    // The other request is untouched and still waiting.
    await expect(page.getByTestId(`portal-approve-${REG_NEW_ID}`)).toBeVisible();
  });

  test("a registration someone else already decided is explained on the row", async ({
    page,
  }) => {
    await page.route(DECIDE, (route) =>
      route.fulfill({
        status: 409,
        json: { error: "registration already decided" },
      }),
    );
    await openPending(page, [REG_OLD]);
    await page
      .getByTestId(`portal-customer-search-${REG_OLD_ID}`)
      .fill("קפה השכונה");
    await page.getByTestId(`portal-customer-option-${REG_OLD_ID}-1001`).click();
    await page.getByTestId(`portal-approve-${REG_OLD_ID}`).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Approve this registration?");
    await dialog.getByRole("button", { name: "Approve registration" }).click();

    const error = page.getByTestId(`portal-decide-error-${REG_OLD_ID}`);
    await expect(error).toContainText("already approved or rejected");
    await expect(
      error.getByRole("button", { name: "Refresh list" }),
    ).toBeVisible();
    await expect(
      page.getByTestId(`portal-approved-note-${REG_OLD_ID}`),
    ).toHaveCount(0);
  });

  test("the login-link tab creates a link by access_id and shows the URL", async ({
    page,
  }) => {
    let approvedQuery: string | null = null;
    let linkBody: unknown = null;
    await page.route(APPROVED_LIST, (route) => {
      approvedQuery = new URL(route.request().url()).searchParams.get("q");
      return route.fulfill({ json: { rows: [APPROVED] } });
    });
    await page.route(LOGIN_LINK, (route) => {
      linkBody = route.request().postDataJSON();
      return route.fulfill({ json: { url: LOGIN_URL, wa_link: WA_LOGIN } });
    });
    await openPending(page, []);
    await expect(page.getByTestId("portal-registrations-empty")).toBeVisible();

    await openLoginTab(page, "Bar");
    const row = page.getByTestId(`portal-approved-row-${ACCESS_ID}`);
    await expect(row).toContainText("Bar Lev");
    await expect(row).toContainText("Haifa");
    expect(approvedQuery).toBe("Bar");

    const create = page.getByTestId(`portal-create-link-${ACCESS_ID}`);
    await expect(create).toHaveText(/Create login link/);
    await create.click();
    await expect(page.getByTestId(`portal-login-url-${ACCESS_ID}`)).toHaveValue(
      LOGIN_URL,
    );
    expect(linkBody).toEqual({ access_id: ACCESS_ID });
    // A new link does not cancel the last one, so the page says how links live.
    await expect(create).toHaveText(/Create another link/);
    await expect(
      page.getByTestId(`portal-login-link-${ACCESS_ID}`),
    ).toContainText("Each link works once and stays valid 24 hours.");

    await expect(page.getByTestId(`portal-copy-link-${ACCESS_ID}`)).toHaveText(
      /Copy/,
    );
    const whatsapp = page.getByTestId(`portal-open-whatsapp-${ACCESS_ID}`);
    await expect(whatsapp).toHaveText(/Open WhatsApp/);
    await expect(whatsapp).toHaveAttribute("href", WA_LOGIN);
    await expect(whatsapp).toHaveAttribute("target", "_blank");
  });

  test("revoking access asks first, posts, and refreshes the list", async ({
    page,
  }) => {
    let revoked = false;
    let listCalls = 0;
    let revokeUrl = "";
    let revokeBody: string | null = null;
    let revokeContentType = "";
    await page.route(APPROVED_LIST, (route) => {
      listCalls += 1;
      return route.fulfill({ json: { rows: revoked ? [] : [APPROVED] } });
    });
    await page.route(REVOKE, (route) => {
      revokeUrl = route.request().url();
      revokeBody = route.request().postData();
      revokeContentType = route.request().headers()["content-type"] ?? "";
      revoked = true;
      return route.fulfill({ json: { ok: true } });
    });
    await openPending(page, []);
    await openLoginTab(page, "Bar");
    await expect(page.getByTestId(`portal-approved-row-${ACCESS_ID}`)).toBeVisible();
    const callsBefore = listCalls;

    // Cancelling the confirm sends nothing.
    await page.getByTestId(`portal-revoke-${ACCESS_ID}`).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Revoke portal access?");
    await expect(dialog).toContainText("Bar Lev");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(revokeUrl).toBe("");

    await page.getByTestId(`portal-revoke-${ACCESS_ID}`).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revoke access" })
      .click();

    await expect(page.getByTestId("portal-revoke-notice")).toContainText(
      "Access revoked for Bar Lev.",
    );
    await expect(page.getByTestId(`portal-approved-row-${ACCESS_ID}`)).toHaveCount(0);
    await expect(page.getByTestId("portal-approved-empty")).toBeVisible();
    expect(revokeUrl).toContain(`/api/portal/access/${ACCESS_ID}/revoke`);
    expect(revokeBody).toBe("{}");
    expect(revokeContentType).toContain("application/json");
    expect(listCalls).toBeGreaterThan(callsBefore);
  });
});

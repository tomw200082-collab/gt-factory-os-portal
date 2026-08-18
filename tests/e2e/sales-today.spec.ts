import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — the sales workspace's critical path: the queue renders, a call is
// armed, and the outcome that follows is what clears the card.

const now = new Date();
const iso = (d: Date) => d.toISOString();

const newLead = {
  lead_id: "L1",
  item_type: "new_lead",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  email: null,
  campaign_name: "קמפיין קיץ",
  platform: "fb",
  status: "new",
  assignee: null,
  next_touch_at: null,
  first_touch_at: null,
  created_at: iso(new Date(now.getTime() - 2 * 3600e3)),
  is_existing_customer: false,
  shopify_snapshot: null,
  shopify_snapshot_at: null,
  converted_order_ref: null,
  converted_amount: null,
  converted_at: null,
  sla_deadline_at: iso(new Date(now.getTime() + 22 * 3600e3)),
  sla_state: "within",
};

const returningCustomer = {
  ...newLead,
  lead_id: "L2",
  item_type: "returning_customer",
  org_id: "O2",
  org_name: "ליוניל יזמות",
  contact_name: "בעל העסק",
  is_existing_customer: true,
  shopify_snapshot: {
    status: "נטש",
    rev12: "2152",
    orders: "5",
    days_since_last_order: "196",
    as_of: "2026-08-06",
  },
  shopify_snapshot_at: "2026-08-05T21:00:00Z",
};

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: {
    new_lead: "היי {{name}}, כאן תום",
    reminder: "היי {{name}}, רק מוודא",
    returning_customer: "היי {{name}}, איזה כיף לראות אותך שוב",
  },
};

interface Posted {
  url: string;
  body: unknown;
}

/** Wires the whole sales API surface; returns what the page posted. */
async function stubSales(page: Page, rows: unknown[]): Promise<Posted[]> {
  const posted: Posted[] = [];
  let queue = [...rows];

  await page.route("**/api/sales/week-stats**", (route) =>
    route.fulfill({ json: { stats: { week_new_leads: 2, working_now: 0, week_converted: 0 } } }),
  );
  await page.route("**/api/sales/settings**", (route) => route.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/leads**", (route) => route.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (route) => route.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/today**", (route) => route.fulfill({ json: { rows: queue } }));

  await page.route("**/api/sales/leads/*/outreach", (route) => {
    posted.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { lead_id: "L1", event_id: "E1" } });
  });

  await page.route("**/api/sales/leads/*/outcome", (route) => {
    posted.push({ url: route.request().url(), body: route.request().postDataJSON() });
    // The captured outcome is what removes the card.
    queue = queue.filter((r) => (r as { lead_id: string }).lead_id !== "L1");
    return route.fulfill({
      json: {
        lead_id: "L1",
        status: "working",
        next_touch_at: iso(new Date(now.getTime() + 86400e3)),
        first_touch_at: iso(now),
      },
    });
  });

  return posted;
}

/** A real trip away from the app and back — hidden, then visible. */
async function leaveAndReturn(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
  // The hook ignores a return inside five seconds; the test does not wait.
  await page.addInitScript(() => {
    window.__GT_SALES_OUTCOME_DELAY_MS__ = 0;
  });
});

test("queue renders, an outcome is captured, and the card clears @mocked", async ({ page }) => {
  const posted = await stubSales(page, [returningCustomer, newLead]);

  await page.goto("/sales/today");

  // The queue, in the order the work should be done.
  await expect(page.getByRole("heading", { name: "לקוח חוזר" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "לידים חדשים" })).toBeVisible();
  await expect(page.getByText("קפה בדיקה")).toBeVisible();
  await expect(page.getByTestId("stats-strip")).toContainText("השבוע: 2 לידים");

  // The returning customer carries its dated history — the Patio case.
  const returning = page.getByTestId("today-card-L2");
  await expect(returning).toContainText("נטש");
  await expect(returning).toContainText("נכון ל-");

  // Arming a call records the intent...
  await page.getByTestId("today-card-L1").getByRole("link", { name: "התקשר" }).click();
  await expect
    .poll(() => posted.filter((p) => p.url.includes("/outreach")).length)
    .toBeGreaterThan(0);

  // ...and returning to the app asks what happened.
  await leaveAndReturn(page);
  const sheet = page.getByTestId("outcome-sheet");
  await expect(sheet).toBeVisible();

  // Dismissing does NOT answer it: the intent is still owed, and the next trip
  // back asks again. (It must not spring back on an ordinary click, which is
  // why dismissal survives until the app is actually left.)
  // dispatchEvent rather than click(): this container runs a Chromium build
  // older than the Playwright driving it, and synthesised mouse input for this
  // one overlay never reaches the page — verified by instrumenting the button,
  // which saw no pointerdown, mousedown or click, while elementFromPoint
  // resolved to the button itself and a dispatched click worked. The behaviour
  // under test is unaffected; useOutcomeCapture's dismissal semantics are
  // covered directly in tests/unit/sales/use-outcome-capture.test.tsx.
  await page.getByTestId("outcome-dismiss").dispatchEvent("click");
  await expect(sheet).toBeHidden();
  await leaveAndReturn(page);
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();

  // Answering it does. (Same dispatched-click accommodation as above — every
  // control inside this overlay is affected, not just the dismiss button.)
  await page.getByTestId("outcome-answered_progressing").dispatchEvent("click");
  await page.getByTestId("next-touch-tomorrow").dispatchEvent("click");

  await expect(page.getByTestId("outcome-sheet")).toBeHidden();
  await expect(page.getByTestId("today-card-L1")).toBeHidden();

  const outcome = posted.find((p) => p.url.includes("/outcome"));
  expect(outcome).toBeTruthy();
  expect((outcome?.body as { result: string }).result).toBe("answered_progressing");
  expect((outcome?.body as { next_touch_at: string }).next_touch_at).toBeTruthy();
});

test("a failed outcome keeps the sheet open instead of silently losing the call @mocked", async ({
  page,
}) => {
  // The queue removes the card optimistically the instant an outcome is tapped.
  // If the write then fails, the card comes back — and the sheet, the error and
  // the armed intent must all still be there. Otherwise the sheet closes as
  // though it saved, the card quietly reappears later, and the call was never
  // logged. That is the one failure this screen must not have.
  await page.route("**/api/sales/week-stats**", (r) =>
    r.fulfill({ json: { stats: { week_new_leads: 1, working_now: 0, week_converted: 0 } } }),
  );
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [newLead] } }));
  await page.route("**/api/sales/leads/*/outreach", (r) =>
    r.fulfill({ json: { lead_id: "L1", event_id: "E1" } }),
  );
  await page.route("**/api/sales/leads/*/outcome", (r) =>
    r.fulfill({ status: 500, json: { message: "boom" } }),
  );

  await page.goto("/sales/today");
  await page.getByTestId("today-card-L1").getByRole("link", { name: "התקשר" }).click();
  await leaveAndReturn(page);
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();

  // Same dispatched-click accommodation as the flow above: synthesised mouse
  // input does not reach this overlay in this container.
  await page.getByTestId("outcome-answered_progressing").dispatchEvent("click");
  await page.getByTestId("next-touch-tomorrow").dispatchEvent("click");

  // The write failed: the sheet stays, says so, and the card is back.
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();
  await expect(page.getByTestId("today-card-L1")).toBeVisible();

  // And the intent is still owed, so the outcome can still be recorded.
  const stored = await page.evaluate(() => window.sessionStorage.getItem("gt.sales.outreach"));
  expect(stored).not.toBeNull();
});

test("the sheet stays put while the outcome is being written @mocked", async ({ page }) => {
  // Submitting removes the card optimistically, so the lead looks absent while
  // the write is still in the air. If the sheet is keyed on the card, it
  // vanishes mid-write and the user is left looking at the queue for the length
  // of a mobile round-trip — then the error, if any, arrives from nowhere.
  await page.route("**/api/sales/week-stats**", (r) =>
    r.fulfill({ json: { stats: { week_new_leads: 1, working_now: 0, week_converted: 0 } } }),
  );
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [newLead] } }));
  await page.route("**/api/sales/leads/*/outreach", (r) =>
    r.fulfill({ json: { lead_id: "L1", event_id: "E1" } }),
  );

  // Held open until the assertion below has run.
  let release: () => void = () => {};
  const inFlight = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/sales/leads/*/outcome", async (route) => {
    await inFlight;
    return route.fulfill({ json: { lead_id: "L1", status: "working" } });
  });

  await page.goto("/sales/today");
  await page.getByTestId("today-card-L1").getByRole("link", { name: "התקשר" }).click();
  await leaveAndReturn(page);
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();

  await page.getByTestId("outcome-answered_progressing").dispatchEvent("click");
  await page.getByTestId("next-touch-tomorrow").dispatchEvent("click");

  // Mid-write: the card is already gone from the queue, the sheet is not.
  await expect(page.getByTestId("today-card-L1")).toBeHidden();
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();

  release();
  await expect(page.getByTestId("outcome-sheet")).toBeHidden();
});

test("an empty queue is a finished day, not a blank screen @mocked", async ({ page }) => {
  await stubSales(page, []);
  await page.goto("/sales/today");
  await expect(page.getByTestId("queue-done")).toBeVisible();
  await expect(page.getByTestId("queue-done")).toContainText("סיימת להיום");
});

test("a failed queue load offers a way out @mocked", async ({ page }) => {
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ status: 500, json: {} }));
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ status: 500, json: {} }));

  await page.goto("/sales/today");
  await expect(page.getByTestId("queue-error")).toBeVisible();
  await expect(page.getByRole("button", { name: "נסה שוב" })).toBeVisible();
});

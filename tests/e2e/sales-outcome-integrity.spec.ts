import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — tranche 165: the loop closes wherever the call was placed from,
// nothing is committed unseen, and a mistake is one tap from undone.

const now = new Date();
const iso = (d: Date) => d.toISOString();

const QUEUE = { daily_cap: 15, order: "newest_first" as const };

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}", reminder: "היי", returning_customer: "היי" },
  lost_reasons: ["לא רלוונטי", "אין תקציב", "אחר"],
  queue: QUEUE,
  assignees: [{ email: "tom@gteveryday.com", name: "תום", active: true }],
  last_changes: [],
};

const STATS = {
  week_new_leads: 1,
  working_now: 1,
  week_converted: 0,
  queue_today: 1,
  overdue_count: 0,
  unassigned_open_count: 1,
  never_contacted_count: 1,
  uncontactable_count: 0,
};

/** A lead that is being worked and is not due today — so it is in the table
 *  and deliberately not in the queue. This is the case whose outcome used to
 *  be discarded in silence. */
const offQueueLead = {
  id: "OFFQ",
  org_id: "O9",
  org_name: "מסעדת בדיקה",
  contact_name: "יעל",
  phone_e164: "+972521234567",
  email: null,
  source: "import",
  campaign_name: null,
  ad_name: null,
  platform: null,
  is_organic: null,
  status: "working",
  lost_reason: null,
  assignee: null,
  next_touch_at: iso(new Date(now.getTime() + 3 * 86400e3)),
  first_touch_at: iso(new Date(now.getTime() - 86400e3)),
  possible_duplicate_of: null,
  converted_order_ref: null,
  converted_amount: null,
  created_at: iso(new Date(now.getTime() - 5 * 86400e3)),
  is_existing_customer: false,
  shopify_customer_id: null,
  shopify_snapshot: null,
  shopify_snapshot_at: null,
  age_days: 5,
  sla_deadline_at: iso(now),
  sla_state: null,
  next_touch_overdue: false,
  uncontactable: false,
};

const queueLead = {
  lead_id: "Q1",
  item_type: "new_lead",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  email: null,
  campaign_name: null,
  platform: "fb",
  status: "new",
  assignee: null,
  next_touch_at: null,
  first_touch_at: null,
  created_at: iso(new Date(now.getTime() - 3 * 86400e3)),
  is_existing_customer: false,
  shopify_snapshot: null,
  shopify_snapshot_at: null,
  converted_order_ref: null,
  converted_amount: null,
  converted_at: null,
  sla_deadline_at: iso(new Date(now.getTime() - 2 * 86400e3)),
  sla_state: "overdue",
  age_days: 3,
  uncontactable: false,
};

interface Posted {
  url: string;
  body: unknown;
}

async function stub(
  page: Page,
  opts: { queueRows?: unknown[]; leadRows?: unknown[]; outcomeStatus?: number } = {},
): Promise<Posted[]> {
  const posted: Posted[] = [];
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: STATS } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads**", (r) =>
    r.fulfill({ json: { rows: opts.leadRows ?? [] } }),
  );
  await page.route("**/api/sales/today**", (r) =>
    r.fulfill({ json: { rows: opts.queueRows ?? [], queue: QUEUE } }),
  );
  await page.route("**/api/sales/leads/*/events**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads/*/outreach", (r) => {
    posted.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { lead_id: "X", event_id: "E" } });
  });
  await page.route("**/api/sales/leads/*/status", (r) => {
    posted.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { lead_id: "X", status: "working" } });
  });
  await page.route("**/api/sales/leads/*/outcome", (r) => {
    posted.push({ url: r.request().url(), body: r.request().postDataJSON() });
    if (opts.outcomeStatus && opts.outcomeStatus >= 400) {
      return r.fulfill({ status: opts.outcomeStatus, json: { error: "nope" } });
    }
    return r.fulfill({
      json: { lead_id: "X", status: "lost", next_touch_at: null, first_touch_at: iso(now) },
    });
  });
  return posted;
}

/** A real trip away from the app and back. */
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
  await page.addInitScript(() => {
    window.__GT_SALES_OUTCOME_DELAY_MS__ = 0;
  });
});

test("a call armed on the leads page is answered for on the leads page @mocked", async ({
  page,
}) => {
  await stub(page, { leadRows: [offQueueLead] });
  await page.goto("/sales/leads");

  // This lead is not in the queue: it is being worked, due in three days.
  await page.getByTestId("leads-tab-working").click();
  await page.getByTestId("lead-row-OFFQ").click();
  await page.getByTestId("drawer-call").click();
  await leaveAndReturn(page);

  // The sheet used to live only on Today, so this asked nothing and the
  // answer was thrown away without a word (audit P0-4).
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();
});

test("the two quick outcomes show the date they are about to schedule @mocked", async ({
  page,
}) => {
  await stub(page, { queueRows: [queueLead] });
  await page.goto("/sales/today");
  await page.getByTestId("today-card-Q1").getByText("התקשר").click();
  await leaveAndReturn(page);

  await expect(page.getByTestId("outcome-preview-no_answer")).toContainText("המגע הבא");
  await expect(page.getByTestId("outcome-preview-whatsapp_sent")).toContainText("המגע הבא");
  // And a way to disagree with it.
  await expect(page.getByTestId("outcome-pick-date")).toBeVisible();
});

test("the backdrop cannot dismiss the sheet while the write is in the air @mocked", async ({
  page,
}) => {
  await stub(page, { queueRows: [queueLead] });
  // Hold the outcome open so the sheet is genuinely busy.
  await page.route("**/api/sales/leads/*/outcome", async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.fulfill({ json: { lead_id: "Q1", status: "working" } });
  });
  await page.goto("/sales/today");
  await page.getByTestId("today-card-Q1").getByText("התקשר").click();
  await leaveAndReturn(page);

  await page.getByTestId("outcome-no_answer").click();
  // Tap the scrim, hard, mid-write.
  await page.getByTestId("outcome-sheet").click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("outcome-sheet")).toBeVisible();
});

test("marking a lead lost offers a way back @mocked", async ({ page }) => {
  await stub(page, { queueRows: [queueLead] });
  await page.goto("/sales/today");

  await page.getByTestId("today-card-Q1").getByText("אבוד").click();
  await page.getByTestId("lost-reason-לא רלוונטי").click();
  await page.getByTestId("lost-confirm").click();

  await expect(page.getByTestId("sales-toast-action")).toHaveText("בטל");
  await page.getByTestId("sales-toast-action").click();
  await expect(page.getByTestId("sales-toast")).toContainText("שוחזר");
});

test("the drawer's last lost reason opens a free-text field @mocked", async ({ page }) => {
  await stub(page, { leadRows: [offQueueLead] });
  await page.goto("/sales/leads");
  await page.getByTestId("leads-tab-working").click();
  await page.getByTestId("lead-row-OFFQ").click();

  await page.getByTestId("drawer-set-lost").click();
  await page.getByTestId("drawer-lost-reason-אחר").click();
  // Nothing can be saved until there is a real reason behind the word.
  await expect(page.getByTestId("drawer-lost-confirm")).toBeDisabled();
  await page.getByLabel("סיבה אחרת").fill("עבר לספק אחר");
  await expect(page.getByTestId("drawer-lost-confirm")).toBeEnabled();
});

test("moving a lead to בטיפול collects the next touch in the same action @mocked", async ({
  page,
}) => {
  const undated = { ...offQueueLead, id: "UNDATED", status: "new", next_touch_at: null };
  const posted = await stub(page, { leadRows: [undated] });
  await page.goto("/sales/leads");
  await page.getByTestId("lead-row-UNDATED").click();

  await page.getByTestId("drawer-set-working").click();
  await expect(page.getByTestId("drawer-working-confirm")).toBeVisible();
  await page.getByTestId("drawer-working-confirm").click();

  await expect
    .poll(() => posted.filter((p) => p.url.includes("/status")).length)
    .toBeGreaterThan(0);
  const body = posted.find((p) => p.url.includes("/status"))?.body as Record<string, unknown>;
  expect(body.status).toBe("working");
  expect(body.next_touch_at).toBeTruthy();
});

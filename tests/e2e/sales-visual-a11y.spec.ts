import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — tranche 168: the floors that a redesign is most likely to quietly
// break. Every one of these was below its floor before this tranche.

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
  week_new_leads: 0,
  working_now: 0,
  week_converted: 0,
  queue_today: 1,
  overdue_count: 0,
  unassigned_open_count: 1,
  never_contacted_count: 1,
  uncontactable_count: 0,
};

const lead = {
  lead_id: "V1",
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

async function stub(page: Page) {
  await page.route("**/api/sales/settings**", (r) => r.fulfill({ json: SETTINGS }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: STATS } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/attention**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/activity**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/today**", (r) =>
    r.fulfill({ json: { rows: [lead], queue: QUEUE } }),
  );
  await page.route("**/api/sales/leads/*/outreach", (r) =>
    r.fulfill({ json: { lead_id: "V1", event_id: "E" } }),
  );
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
  await page.addInitScript(() => {
    window.__GT_SALES_OUTCOME_DELAY_MS__ = 0;
  });
});

test("every header control clears the 44px touch floor @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");

  for (const id of ["sales-search-open", "sales-switch-factory"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.height, id).toBeGreaterThanOrEqual(44);
    expect(box!.width, id).toBeGreaterThanOrEqual(44);
  }
});

test("the status filters clear it too @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/leads");
  const box = await page.getByTestId("leads-tab-new").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("the active filter is bold, not only tinted @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/leads");
  // WCAG 1.4.1: which filter is active has to survive greyscale.
  const weight = await page
    .getByTestId("leads-tab-new")
    .evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
});

test("the quick-add button sits in the right-hand thumb arc @mocked", async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sales/today");

  const box = await page.getByTestId("sales-quick-add").boundingBox();
  // RTL: insetInlineStart is the physical right. Anything on the left half is
  // across the screen from the thumb that has to reach it.
  expect(box!.x).toBeGreaterThan(195);
});

test("no user-readable text renders below 12px @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");

  const tooSmall = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[data-app='sales'] *"))) {
      const text = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? "")
        .join("");
      if (!text) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) offenders.push(`${el.tagName}:${size}px:${text.slice(0, 20)}`);
    }
    return offenders;
  });
  expect(tooSmall).toEqual([]);
});

test("the lost-reason radios move with the arrow keys @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");

  await page.getByTestId("card-lost").click();
  await page.getByTestId("lost-reason-לא רלוונטי").focus();
  await page.keyboard.press("ArrowDown");
  // The ARIA radio pattern promises this; tabbing through five options does not.
  await expect(page.getByTestId("lost-reason-אין תקציב")).toHaveAttribute("aria-checked", "true");
});

test("the exits sit below the call, not beside it @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");

  const call = await page.getByTestId("today-card-V1").getByText("התקשר").boundingBox();
  const lost = await page.getByTestId("card-lost").boundingBox();
  // Same card, and the way out is underneath the way forward.
  expect(lost!.y).toBeGreaterThan(call!.y);
});

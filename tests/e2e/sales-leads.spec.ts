import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — the list's critical path: tabs filter, search finds a lead by a
// locally-typed phone number, the drawer opens, and a status change is written.

const lead = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  email: "dana@cafe.co.il",
  source: "import_meta_export",
  campaign_name: "קמפיין קיץ",
  ad_name: null,
  platform: "fb",
  is_organic: false,
  status: "new",
  lost_reason: null,
  assignee: null,
  next_touch_at: null,
  first_touch_at: null,
  possible_duplicate_of: null,
  converted_order_ref: null,
  converted_amount: null,
  created_at: "2026-08-10T09:00:00Z",
  is_existing_customer: false,
  shopify_customer_id: null,
  shopify_snapshot: null,
  shopify_snapshot_at: null,
  age_days: 7,
  sla_deadline_at: "2026-08-11T09:00:00Z",
  sla_state: "overdue",
  next_touch_overdue: false,
  ...over,
});

const ROWS = [
  lead(),
  lead({ id: "L2", org_name: "מסעדת בדיקה", contact_name: "יוסי", status: "working", sla_state: null }),
  lead({
    id: "L3",
    org_name: "בר בדיקה",
    status: "won",
    converted_order_ref: "#1042",
    sla_state: null,
  }),
];

interface Posted {
  url: string;
  body: unknown;
}

async function stub(page: Page): Promise<Posted[]> {
  const posted: Posted[] = [];
  await page.route("**/api/sales/settings**", (r) =>
    r.fulfill({
      json: {
        sla_hours: 24,
        whatsapp_templates: { new_lead: "היי {{name}}", reminder: "ה", returning_customer: "ל" },
      },
    }),
  );
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/week-stats**", (r) =>
    r.fulfill({ json: { stats: { week_new_leads: 0, working_now: 1, week_converted: 1 } } }),
  );
  // Playwright gives later-registered routes precedence, so the list catch-all
  // goes first — otherwise it also answers /leads/:id/status.
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: ROWS } }));
  await page.route("**/api/sales/leads/*/events", (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            id: "E1",
            lead_id: "L1",
            event_type: "created",
            payload: {},
            actor: "system",
            created_at: "2026-08-10T09:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/sales/leads/*/status", (r) => {
    posted.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { lead_id: "L1", status: "working" } });
  });
  return posted;
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
});

test("tabs, search, drawer, and a status change that is written @mocked", async ({ page }) => {
  const posted = await stub(page);
  await page.goto("/sales/leads");

  // The new tab is where the work starts, and the counts are real.
  await expect(page.getByTestId("leads-tab-new")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("leads-tab-new")).toContainText("1");
  await expect(page.getByTestId("leads-tab-won")).toContainText("1");

  // A phone typed the way people type it finds the lead stored as E.164.
  await page.getByTestId("leads-search").fill("052-1234567");
  await expect(page.getByTestId("lead-row-L1")).toBeVisible();
  await page.getByTestId("leads-search").fill("0529999999");
  await expect(page.getByTestId("lead-row-L1")).toBeHidden();
  await page.getByTestId("leads-search").fill("");

  // The drawer opens over the list and carries the timeline.
  await page.getByTestId("lead-row-L1").click();
  const drawer = page.getByTestId("lead-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("event-timeline")).toBeVisible();

  // A status change is a write.
  await page.getByTestId("drawer-set-working").click();
  await expect.poll(() => posted.length).toBeGreaterThan(0);
  expect((posted[0].body as { status: string }).status).toBe("working");

  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("a won lead is evidence, never an editable status @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/leads");

  await page.getByTestId("leads-tab-won").click();
  await page.getByTestId("lead-row-L3").click();

  const drawer = page.getByTestId("lead-drawer");
  await expect(drawer.getByTestId("won-banner")).toContainText("#1042");
  await expect(drawer.getByTestId("drawer-set-working")).toBeHidden();
  await expect(drawer.getByTestId("drawer-set-lost")).toBeHidden();
});

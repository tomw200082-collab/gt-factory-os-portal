import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

/** The queue shape the admin owns (0326). Stubbed here so the payload matches
 *  what the API actually answers with — rows plus the shape they came in. */
const QUEUE = { daily_cap: 15, order: "newest_first" as const };

/** The stats strip reads the triage counts first; a stub that carries only the
 *  three weekly counts renders "undefined" where a number belongs. */
const STATS = {
  week_new_leads: 0,
  working_now: 0,
  week_converted: 0,
  queue_today: 2,
  overdue_count: 0,
  unassigned_open_count: 2,
  never_contacted_count: 2,
  uncontactable_count: 0,
};


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
        // The bulk bar's assign button stays inert without a roster to pick
        // from, so the two bulk tests below need one.
        assignees: [{ name: "דנה", email: "dana@gt.co.il", active: true }],
        lost_reasons: ["אין תקציב", "אחר"],
        queue: QUEUE,
        last_changes: [],
      },
    }),
  );
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [], queue: QUEUE } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [], queue: QUEUE } }));
  await page.route("**/api/sales/week-stats**", (r) =>
    r.fulfill({ json: { stats: { ...STATS, working_now: 1, week_converted: 1 } } }),
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
  await page.route("**/api/sales/bulk-assign", (r) => {
    posted.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { assigned: 1, rows: [] } });
  });
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

  // A status change is a write — and since 0324 it carries the next touch,
  // because a working lead with no date leaves every queue silently.
  await page.getByTestId("drawer-set-working").click();
  await page.getByTestId("drawer-working-confirm").click();
  await expect.poll(() => posted.length).toBeGreaterThan(0);
  const statusBody = posted[0].body as { status: string; next_touch_at?: string };
  expect(statusBody.status).toBe("working");
  expect(statusBody.next_touch_at).toBeTruthy();

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

test("a selection never outlives the rows it was made on @mocked", async ({ page }) => {
  // Gate P0 (INTER-001). Select on חדש, switch tab, and the bulk bar used to
  // stay — still holding a lead that is no longer on screen, one press away
  // from assigning it. The screen said "1 selected" about nothing visible.
  await stub(page);
  await page.goto("/sales/leads");

  await page.getByTestId("lead-select-L1").check();
  await expect(page.getByTestId("bulk-bar")).toBeVisible();

  await page.getByTestId("leads-tab-won").click();
  await expect(page.getByTestId("lead-row-L1")).toBeHidden();
  await expect(page.getByTestId("bulk-bar")).toBeHidden();

  // The rule is "the selection is what is on screen", not "any filter wipes
  // it". L1 is itself unowned, so the unowned chip does not hide it — and a
  // selection the person is still building survives a filter that keeps its
  // rows. A blunt clear-on-any-change would throw that away for nothing.
  await page.getByTestId("leads-tab-new").click();
  await page.getByTestId("lead-select-L1").check();
  const unowned = page.getByTestId("leads-chip-unowned");
  await unowned.click();
  await expect(page.getByTestId("lead-row-L1")).toBeVisible();
  await expect(page.getByTestId("bulk-bar")).toBeVisible();
});

test("a search that hides a selected lead un-selects it @mocked", async ({ page }) => {
  // Gate iteration 2 re-opened INTER-001 as P0: clearing on the tab and the two
  // chips left the search open. Select rows, type a query that narrows the list,
  // and the bar still offered to assign leads that had scrolled out of
  // existence. The invariant is "the selection is what is on screen", so the
  // effect prunes rather than clears — which also means refining a search no
  // longer throws away a selection still being built.
  await stub(page);
  await page.goto("/sales/leads");

  await page.getByTestId("lead-select-L1").check();
  await expect(page.getByTestId("bulk-live")).toHaveText(/1/);

  // L1 is "קפה בדיקה"; this query matches nothing it contains.
  await page.getByTestId("leads-search").fill("0529999999");
  await expect(page.getByTestId("lead-row-L1")).toBeHidden();
  await expect(page.getByTestId("bulk-bar")).toBeHidden();
  await expect(page.getByTestId("bulk-live")).toHaveText("");

  // Clearing the search does not resurrect it: it left the screen, so it left
  // the selection.
  await page.getByTestId("leads-search").fill("");
  await expect(page.getByTestId("lead-row-L1")).toBeVisible();
  await expect(page.getByTestId("bulk-bar")).toBeHidden();
});

test("the bulk bar announces itself, and says when a batch fails @mocked", async ({ page }) => {
  // Gate P0 ×2. role="region" does not announce on mount, so selecting rows
  // gave a screen-reader user no signal that bulk actions existed (A11Y-001);
  // and a failed write went spinner → idle with nothing said (INTER-002).
  await stub(page);
  await page.route("**/api/sales/bulk-assign", (r) =>
    r.fulfill({ status: 422, json: { error: "SALES_UNKNOWN_ASSIGNEE" } }),
  );
  await page.goto("/sales/leads");

  // The live region is mounted before there is anything to say, or the message
  // arrives with the element and is never announced.
  const live = page.getByTestId("bulk-live");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("");

  await page.getByTestId("lead-select-L1").check();
  await expect(live).toHaveText(/1/);

  await page.getByTestId("bulk-bar").getByTestId("assignee-picker").selectOption("dana@gt.co.il");
  await page.getByTestId("bulk-assign-confirm").click();
  await expect(page.getByTestId("bulk-error")).toBeVisible();
  // The selection survives the failure: retrying is the point.
  await expect(page.getByTestId("bulk-bar")).toBeVisible();
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OrgList } from "@/app/(sales)/_components/OrgList";
import { OrgCard } from "@/app/(sales)/_components/OrgCard";
import { matchesOrgQuery } from "@/app/(sales)/_lib/format";
import { UI } from "@/app/(sales)/_lib/labels";
import type { OrgRow, SalesLeadRow } from "@/app/(sales)/_lib/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sales/orgs",
}));

const org: OrgRow = {
  id: "O1",
  display_name: "ליוניל יזמות",
  phone_e164: "+972521234567",
  email: "patio@example.co.il",
  email_domain: "example.co.il",
  city: null,
  shopify_customer_id: null,
  is_existing_customer: true,
  shopify_snapshot: {
    status: "נטש",
    rev12: "2152",
    orders: "5",
    days_since_last_order: "196",
    as_of: "2026-08-06",
  },
  shopify_snapshot_at: "2026-08-05T21:00:00Z",
  created_at: "2026-06-09T09:00:00Z",
  lead_count: 1,
  last_activity_at: "2026-08-09T09:00:00Z",
};

const lead: SalesLeadRow = {
  id: "L1",
  org_id: "O1",
  org_name: org.display_name,
  contact_name: "בעל העסק",
  phone_e164: org.phone_e164,
  email: org.email,
  source: "import_meta_export",
  campaign_name: null,
  ad_name: null,
  platform: null,
  is_organic: null,
  status: "new",
  lost_reason: null,
  assignee: null,
  next_touch_at: null,
  first_touch_at: null,
  possible_duplicate_of: null,
  converted_order_ref: null,
  converted_amount: null,
  created_at: "2026-06-09T09:00:00Z",
  is_existing_customer: true,
  shopify_customer_id: null,
  shopify_snapshot: org.shopify_snapshot,
  shopify_snapshot_at: org.shopify_snapshot_at,
  age_days: 69,
  sla_deadline_at: "2026-06-10T09:00:00Z",
  sla_state: "overdue",
  next_touch_overdue: false,
};

afterEach(cleanup);

describe("org search", () => {
  it("matches a business name or a phone typed locally", () => {
    expect(matchesOrgQuery(org, "ליוניל")).toBe(true);
    expect(matchesOrgQuery(org, "052-1234567")).toBe(true);
    expect(matchesOrgQuery(org, "מאפייה")).toBe(false);
  });
});

describe("org list", () => {
  it("shows the customer badge, lead count and last activity", () => {
    render(<OrgList rows={[org]} onOpen={() => {}} />);
    expect(screen.getByText(org.display_name)).toBeTruthy();
    expect(screen.getByTestId("customer-badge")).toBeTruthy();
    expect(screen.getByText(UI.orgLeads(1))).toBeTruthy();
  });

  it("says so plainly when a business has no activity", () => {
    render(<OrgList rows={[{ ...org, last_activity_at: null }]} onOpen={() => {}} />);
    expect(screen.getByText(UI.orgNoActivity)).toBeTruthy();
  });

  it("opens a business", () => {
    const opened: string[] = [];
    render(<OrgList rows={[org]} onOpen={(o) => opened.push(o.id)} />);
    fireEvent.click(screen.getByTestId("org-row-O1"));
    expect(opened).toEqual(["O1"]);
  });
});

describe("org card", () => {
  it("carries the dated customer history", () => {
    render(
      <OrgCard org={org} leads={[lead]} events={[]} eventsLoading={false} onClose={() => {}} />,
    );
    const card = screen.getByTestId("org-card");
    expect(card.textContent).toContain("נטש");
    expect(card.textContent).toMatch(/נכון ל-/);
  });

  it("links each lead into the leads drawer", () => {
    render(
      <OrgCard org={org} leads={[lead]} events={[]} eventsLoading={false} onClose={() => {}} />,
    );
    const link = screen.getByTestId("org-lead-L1");
    expect(link.getAttribute("href")).toBe("/sales/leads?lead=L1");
  });

  it("is a labelled modal dialog that closes on Escape", () => {
    const closes: number[] = [];
    render(
      <OrgCard org={org} leads={[lead]} events={[]} eventsLoading={false} onClose={() => closes.push(1)} />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("dir")).toBe("rtl");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closes).toEqual([1]);
  });

  it("names the lead when the timeline cannot cover the whole business", () => {
    render(
      <OrgCard
        org={{ ...org, lead_count: 2 }}
        leads={[lead, { ...lead, id: "L2" }]}
        events={[]}
        eventsLoading={false}
        timelineLeadName="בעל העסק"
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-scope").textContent).toContain("בעל העסק");
  });

  it("does not qualify the timeline when the business has a single lead", () => {
    render(
      <OrgCard org={org} leads={[lead]} events={[]} eventsLoading={false} onClose={() => {}} />,
    );
    expect(screen.queryByTestId("timeline-scope")).toBeNull();
  });

  it("shows no customer history for a business we have never sold to", () => {
    render(
      <OrgCard
        org={{ ...org, is_existing_customer: false, shopify_snapshot: null, shopify_snapshot_at: null }}
        leads={[lead]}
        events={[]}
        eventsLoading={false}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("customer-context")).toBeNull();
  });
});

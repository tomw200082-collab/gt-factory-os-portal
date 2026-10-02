// GT Pulse Unit B, tranche 189: the business list.
//
// Replaces the snapshot-era org tests (OrgCard, matchesOrgQuery and the word
// "נטש"): the build plan's Task 24 carve-out. Every fixture here is synthetic.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const role = vi.hoisted(() => ({ value: "admin" as string }));
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({ session: { role: role.value, email: "manager@synthetic.invalid" } }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sales/orgs",
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), back: vi.fn() }),
}));

import OrgsPage from "@/app/(sales)/sales/orgs/page";
import { OrgList } from "@/app/(sales)/_components/OrgList";
import { ORG_STATE_LABELS, UI } from "@/app/(sales)/_lib/labels";
import type { OrgListRow } from "@/app/(sales)/_lib/types";

function row(over: Partial<OrgListRow> = {}): OrgListRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "קפה הדגמה רמת השרון",
    link_status: "verified",
    owner_email: null,
    last_activity_at: null,
    has_open_lead: false,
    is_active_customer: true,
    last_order_at: "2026-09-20T08:00:00.000000Z",
    orders_12m: 14,
    ex_vat_12m_agorot: 1234500,
    chain_name: null,
    ...over,
  };
}

const calls: string[] = [];
let respond: (url: string) => unknown = () => ({ rows: [], next: null, total: 0 });

beforeEach(() => {
  calls.length = 0;
  replace.mockReset();
  role.value = "admin";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify(respond(url)), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function withQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("business list: server paging", () => {
  it("asks the server for the first page of active businesses, sorted by last order", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    expect(calls[0]).toBe("/api/sales/orgs/page?filter=active&sort=last_order&limit=50");
    expect(calls.some((u) => u === "/api/sales/orgs" || u.startsWith("/api/sales/orgs?"))).toBe(false);
  });

  it("offers more when the server has a next page, and sends its cursor", async () => {
    respond = (url) => url.includes("cursor=")
      ? { rows: [row({ id: "00000000-0000-4000-8000-000000000002", name: "מאפיית בדיקה" })], next: null, total: 2 }
      : { rows: [row()], next: "CURSOR1", total: 2 };
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    expect(screen.getByTestId("orgs-showing").textContent).toBe(UI.orgsShowing(1, 2));
    fireEvent.click(screen.getByRole("button", { name: UI.showMoreOrgs }));
    await screen.findByText("מאפיית בדיקה");
    expect(calls).toContain("/api/sales/orgs/page?filter=active&sort=last_order&limit=50&cursor=CURSOR1");
    expect(screen.queryByRole("button", { name: UI.showMoreOrgs })).toBeNull();
  });

  it("changes filter and sort on the server, not in the browser", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    fireEvent.click(screen.getByRole("button", { name: "טרם לקוח" }));
    await waitFor(() => expect(calls).toContain("/api/sales/orgs/page?filter=prospect&sort=last_order&limit=50"));
    fireEvent.change(screen.getByLabelText(UI.sortLabel), { target: { value: "name" } });
    await waitFor(() => expect(calls).toContain("/api/sales/orgs/page?filter=prospect&sort=name&limit=50"));
    expect(replace).toHaveBeenCalled();
  });

  it("offers the identity-review filter to a manager only", async () => {
    respond = () => ({ rows: [], next: null, total: 0 });
    render(withQuery(<OrgsPage />));
    await screen.findByTestId("orgs-empty");
    expect(screen.getByRole("button", { name: "בבדיקת זהות" })).toBeTruthy();
    cleanup();
    role.value = "sales_rep";
    render(withQuery(<OrgsPage />));
    await screen.findByTestId("orgs-empty");
    expect(screen.queryByRole("button", { name: "בבדיקת זהות" })).toBeNull();
  });
});

describe("business list: the address", () => {
  it("does not rewrite the address it already shows, so it can never pull a person back from a business they opened", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    await new Promise((r) => setTimeout(r, 300));
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("business list: three different kinds of nothing", () => {
  it("an empty system says there are no businesses yet", async () => {
    respond = () => ({ rows: [], next: null, total: 0 });
    render(withQuery(<OrgsPage />));
    // the default filter is not "all", so it first says the filter is empty
    expect((await screen.findByTestId("orgs-empty")).textContent).toContain(UI.orgsFilterEmpty);
    fireEvent.click(screen.getByRole("button", { name: "הכל" }));
    await waitFor(() => expect(screen.getByTestId("orgs-empty").textContent).toContain(UI.orgsEmpty));
  });

  it("an empty filter offers the whole list", async () => {
    respond = (url) => url.includes("filter=all")
      ? { rows: [row()], next: null, total: 1 }
      : { rows: [], next: null, total: 0 };
    render(withQuery(<OrgsPage />));
    const empty = await screen.findByTestId("orgs-empty");
    fireEvent.click(within(empty).getByRole("button", { name: UI.orgsShowAll }));
    await screen.findByText("קפה הדגמה רמת השרון");
  });

  it("a search with no match says no results, from the server's search", async () => {
    respond = (url) => url.startsWith("/api/sales/orgs/search") ? [] : { rows: [row()], next: null, total: 1 };
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    fireEvent.change(screen.getByTestId("orgs-search"), { target: { value: "אין כזה" } });
    await waitFor(() => expect(calls.some((u) => u.startsWith("/api/sales/orgs/search?q="))).toBe(true));
    expect((await screen.findByTestId("orgs-empty")).textContent).toContain(UI.searchEmpty);
  });
});

describe("business list: what a screen reader hears", () => {
  it("announces how many businesses the filter holds, and how many a search found", async () => {
    respond = (url) => url.startsWith("/api/sales/orgs/search") ? [{ id: "x", name: "קפה", phone: null }] : { rows: [row()], next: null, total: 31 };
    render(withQuery(<OrgsPage />));
    const live = screen.getByTestId("orgs-live");
    expect(live.getAttribute("role")).toBe("status");
    await waitFor(() => expect(live.textContent).toBe(UI.orgsCount(31)));
    fireEvent.change(screen.getByTestId("orgs-search"), { target: { value: "קפה" } });
    await waitFor(() => expect(live.textContent).toBe(UI.searchResults(1)));
  });

  it("says a single letter is not yet a search", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    fireEvent.change(screen.getByTestId("orgs-search"), { target: { value: "ק" } });
    expect((await screen.findByTestId("orgs-search-hint")).textContent).toBe(UI.searchMinHint);
  });

  it("names the select toggle by what it does, without a second pressed state", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    const toggle = screen.getByRole("button", { name: UI.orgsSelect });
    expect(toggle.hasAttribute("aria-pressed")).toBe(false);
  });
});

describe("business list rows", () => {
  it("links each business to its workspace", () => {
    render(<OrgList rows={[row()]} manager={false} />);
    const link = screen.getByRole("link", { name: /קפה הדגמה רמת השרון/ });
    expect(link.getAttribute("href")).toBe("/sales/orgs/00000000-0000-4000-8000-000000000001");
  });

  it("names the state in words, never by colour alone", () => {
    render(
      <OrgList
        manager={false}
        rows={[
          row({ id: "a", name: "א" }),
          row({ id: "b", name: "ב", is_active_customer: false }),
          row({ id: "c", name: "ג", link_status: null, is_active_customer: null, last_order_at: null, orders_12m: null, ex_vat_12m_agorot: null }),
          row({ id: "d", name: "ד", link_status: "review", is_active_customer: null, last_order_at: null, orders_12m: null, ex_vat_12m_agorot: null }),
        ]}
      />,
    );
    expect(screen.getByTestId("org-row-a").textContent).toContain(ORG_STATE_LABELS.active);
    expect(screen.getByTestId("org-row-b").textContent).toContain(ORG_STATE_LABELS.inactive);
    expect(screen.getByTestId("org-row-c").textContent).toContain(ORG_STATE_LABELS.prospect);
    expect(screen.getByTestId("org-row-d").textContent).toContain(ORG_STATE_LABELS.review);
  });

  it("states money before VAT and never prints a value the server withheld", () => {
    render(
      <OrgList
        manager={false}
        rows={[row({ id: "a" }), row({ id: "r", link_status: "review", is_active_customer: null, last_order_at: null, orders_12m: null, ex_vat_12m_agorot: null })]}
      />,
    );
    expect(screen.getByTestId("org-row-a").textContent).toContain(UI.exVat);
    expect(screen.getByTestId("org-row-a").textContent).toContain("12,345");
    expect(screen.getByTestId("org-row-r").textContent).not.toMatch(/₪|0 הזמנות/);
  });

  it("shows the owner to a manager", () => {
    render(<OrgList rows={[row({ owner_email: "rep@synthetic.invalid" })]} manager owners={{ "rep@synthetic.invalid": "נציגה" }} />);
    expect(screen.getByTestId(`org-row-${row().id}`).textContent).toContain("נציגה");
  });
});

describe("bulk owner assignment", () => {
  it("assigns the selected businesses to one person in one call", async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ updated: 1 }), { status: 200 });
      }
      if (url.startsWith("/api/sales/settings")) {
        return new Response(JSON.stringify({
          sla_hours: 24, whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" },
          lost_reasons: [], queue: { daily_cap: 15, order: "newest_first" },
          assignees: [{ email: "rep@synthetic.invalid", name: "נציגה", active: true }], last_changes: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [row()], next: null, total: 1 }), { status: 200 });
    }));
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    fireEvent.click(screen.getByRole("button", { name: UI.orgsSelect }));
    fireEvent.click(screen.getByRole("checkbox", { name: UI.selectOrgNamed("קפה הדגמה רמת השרון") }));
    const bar = screen.getByTestId("bulk-owner-bar");
    await waitFor(() => expect(within(bar).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(within(bar).getByLabelText(UI.ownerPick), { target: { value: "rep@synthetic.invalid" } });
    fireEvent.click(within(bar).getByRole("button", { name: UI.ownerAssign }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/api/sales/orgs/owner",
      body: { org_ids: ["00000000-0000-4000-8000-000000000001"], owner_email: "rep@synthetic.invalid" },
    });
  });

  it("says why assigning is not possible yet, and steps aside while searching", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    fireEvent.click(screen.getByRole("button", { name: UI.orgsSelect }));
    fireEvent.click(screen.getByRole("checkbox", { name: UI.selectOrgNamed("קפה הדגמה רמת השרון") }));
    const assign = within(screen.getByTestId("bulk-owner-bar")).getByRole("button", { name: UI.ownerAssign }) as HTMLButtonElement;
    expect(assign.disabled).toBe(true);
    expect(assign.getAttribute("title")).toBe(UI.ownerAssignNeedsOwner);
    expect(assign.hasAttribute("aria-busy")).toBe(false);
    fireEvent.change(screen.getByTestId("orgs-search"), { target: { value: "קפה" } });
    await waitFor(() => expect(screen.queryByTestId("bulk-owner-bar")).toBeNull());
  });

  it("keeps the selection open while an assignment is still saving", async () => {
    let release: () => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        await new Promise<void>((r) => { release = r; });
        return new Response(JSON.stringify({ updated: 1 }), { status: 200 });
      }
      if (url.startsWith("/api/sales/settings")) {
        return new Response(JSON.stringify({
          sla_hours: 24, whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" },
          lost_reasons: [], queue: { daily_cap: 15, order: "newest_first" },
          assignees: [{ email: "rep@synthetic.invalid", name: "נציגה", active: true }], last_changes: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [row()], next: null, total: 1 }), { status: 200 });
    }));
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    fireEvent.click(screen.getByRole("button", { name: UI.orgsSelect }));
    fireEvent.click(screen.getByRole("checkbox", { name: UI.selectOrgNamed("קפה הדגמה רמת השרון") }));
    const bar = screen.getByTestId("bulk-owner-bar");
    await waitFor(() => expect(within(bar).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(within(bar).getByLabelText(UI.ownerPick), { target: { value: "rep@synthetic.invalid" } });
    fireEvent.click(within(bar).getByRole("button", { name: UI.ownerAssign }));
    const done = screen.getByRole("button", { name: UI.orgsSelectDone }) as HTMLButtonElement;
    await waitFor(() => expect(done.disabled).toBe(true));
    expect(done.getAttribute("title")).toBe(UI.ownerSavingWait);
    release();
    expect(await screen.findByTestId("sales-toast")).toBeTruthy();
  });

  it("lets go of the selection when the order changes", async () => {
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    fireEvent.click(screen.getByRole("button", { name: UI.orgsSelect }));
    fireEvent.click(screen.getByRole("checkbox", { name: UI.selectOrgNamed("קפה הדגמה רמת השרון") }));
    expect(screen.getByTestId("bulk-owner-bar")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(UI.sortLabel), { target: { value: "name" } });
    expect(screen.queryByTestId("bulk-owner-bar")).toBeNull();
  });

  it("is not offered to a rep", async () => {
    role.value = "sales_rep";
    respond = () => ({ rows: [row()], next: null, total: 1 });
    render(withQuery(<OrgsPage />));
    await screen.findByText("קפה הדגמה רמת השרון");
    expect(screen.queryByRole("button", { name: UI.orgsSelect })).toBeNull();
  });
});

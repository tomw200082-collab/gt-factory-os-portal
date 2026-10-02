import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const pathname = { current: "/sales/today" };
const currentRole = vi.hoisted(() => ({ value: "planner" }));
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({ session: { role: currentRole.value } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

// The shell holds the palette and quick-add, so it reads the cached lists.
function withQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => [] } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

import { SalesShell } from "@/app/(sales)/_components/SalesShell";
import { NAV_LABELS, UI } from "@/app/(sales)/_lib/labels";

afterEach(() => {
  cleanup();
  pathname.current = "/sales/today";
  currentRole.value = "planner";
});

describe("sales shell", () => {
  it("marks the surface as Hebrew RTL and scopes the token layer", () => {
    const { container } = render(
      withQuery(
        <SalesShell>
          <p>תוכן</p>
        </SalesShell>,
      ),
    );
    const root = container.querySelector('[data-app="sales"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("dir")).toBe("rtl");
    expect(root?.getAttribute("lang")).toBe("he");
  });

  it("offers the three destinations on both the rail and the tab bar", () => {
    render(
      withQuery(
        <SalesShell>
          <p>תוכן</p>
        </SalesShell>,
      ),
    );
    for (const label of [NAV_LABELS.today, NAV_LABELS.leads, NAV_LABELS.orgs]) {
      // once in the desktop rail, once in the phone tab bar
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
    expect(screen.getByTestId("sales-tab-/sales/today")).toBeTruthy();
    expect(screen.getByTestId("sales-rail-/sales/leads")).toBeTruthy();
  });

  it("marks the active destination for assistive technology", () => {
    pathname.current = "/sales/leads";
    render(
      withQuery(
        <SalesShell>
          <p>תוכן</p>
        </SalesShell>,
      ),
    );
    expect(screen.getByTestId("sales-tab-/sales/leads").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("sales-tab-/sales/today").getAttribute("aria-current")).toBeNull();
  });

  it("treats a nested route as inside its section", () => {
    pathname.current = "/sales/leads/abc";
    render(
      withQuery(
        <SalesShell>
          <p>תוכן</p>
        </SalesShell>,
      ),
    );
    expect(screen.getByTestId("sales-rail-/sales/leads").getAttribute("aria-current")).toBe("page");
  });

  it("keeps a way back to the factory and into settings", () => {
    render(
      withQuery(
        <SalesShell>
          <p>תוכן</p>
        </SalesShell>,
      ),
    );
    expect(screen.getByText(UI.switchToFactory)).toBeTruthy();
    expect(screen.getAllByText(NAV_LABELS.settings).length).toBeGreaterThan(0);
  });

  it("does not send a sales rep to a factory they cannot use (D11)", () => {
    currentRole.value = "sales_rep";
    render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
    expect(screen.queryByTestId("sales-switch-factory")).toBeNull();
  });

  it("does not offer team settings to a sales rep", () => {
    currentRole.value = "sales_rep";
    render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
    expect(screen.queryByRole("link", { name: NAV_LABELS.settings })).toBeNull();
  });

  it("keeps quick-add and search reachable from every screen", () => {
    render(
      withQuery(
        <SalesShell>
          <p>תוכן</p>
        </SalesShell>,
      ),
    );
    expect(screen.getByTestId("sales-quick-add")).toBeTruthy();
    expect(screen.getByTestId("sales-search-open")).toBeTruthy();
  });

  it("keeps the floating quick-add off a business page, where it covered the contact buttons", () => {
    pathname.current = "/sales/orgs/00000000-0000-4000-8000-000000000001";
    render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
    expect(screen.queryByTestId("sales-quick-add")).toBeNull();
    expect(screen.getByTestId("sales-search-open")).toBeTruthy();
    cleanup();
    pathname.current = "/sales/orgs";
    render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
    expect(screen.getByTestId("sales-quick-add")).toBeTruthy();
  });

  it("renders its children in the main landmark", () => {
    render(
      withQuery(
        <SalesShell>
          <p>תוכן הבדיקה</p>
        </SalesShell>,
      ),
    );
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("תוכן הבדיקה");
  });

  it("gives a manager the report as a fifth destination, on the rail and on the phone bar", () => {
    for (const role of ["admin", "planner"]) {
      currentRole.value = role;
      render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
      expect(screen.getByTestId("sales-rail-/sales/report").textContent).toBe(NAV_LABELS.reportFull);
      expect(screen.getByTestId("sales-tab-/sales/report").textContent).toBe(NAV_LABELS.report);
      expect(screen.getByTestId("sales-tab-/sales/report").getAttribute("href")).toBe("/sales/report");
      cleanup();
    }
  });

  it("keeps the report off a sales rep's navigation", () => {
    currentRole.value = "sales_rep";
    render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
    expect(screen.queryByTestId("sales-rail-/sales/report")).toBeNull();
    expect(screen.queryByTestId("sales-tab-/sales/report")).toBeNull();
    expect(screen.getAllByRole("link", { name: /היום|לידים|עסקים|מצב/ }).length).toBeGreaterThan(0);
  });

  it("marks the report active on its own route, and keeps the floating quick-add off it", () => {
    pathname.current = "/sales/report";
    render(withQuery(<SalesShell><p>תוכן</p></SalesShell>));
    expect(screen.getByTestId("sales-tab-/sales/report").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByTestId("sales-quick-add")).toBeNull();
  });
});

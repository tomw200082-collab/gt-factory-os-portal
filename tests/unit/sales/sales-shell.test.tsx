import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const pathname = { current: "/sales/today" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { SalesShell } from "@/app/(sales)/_components/SalesShell";
import { NAV_LABELS, UI } from "@/app/(sales)/_lib/labels";

afterEach(() => {
  cleanup();
  pathname.current = "/sales/today";
});

describe("sales shell", () => {
  it("marks the surface as Hebrew RTL and scopes the token layer", () => {
    const { container } = render(
      <SalesShell>
        <p>תוכן</p>
      </SalesShell>,
    );
    const root = container.querySelector('[data-app="sales"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("dir")).toBe("rtl");
    expect(root?.getAttribute("lang")).toBe("he");
  });

  it("offers the three destinations on both the rail and the tab bar", () => {
    render(
      <SalesShell>
        <p>תוכן</p>
      </SalesShell>,
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
      <SalesShell>
        <p>תוכן</p>
      </SalesShell>,
    );
    expect(screen.getByTestId("sales-tab-/sales/leads").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("sales-tab-/sales/today").getAttribute("aria-current")).toBeNull();
  });

  it("treats a nested route as inside its section", () => {
    pathname.current = "/sales/leads/abc";
    render(
      <SalesShell>
        <p>תוכן</p>
      </SalesShell>,
    );
    expect(screen.getByTestId("sales-rail-/sales/leads").getAttribute("aria-current")).toBe("page");
  });

  it("keeps a way back to the factory and into settings", () => {
    render(
      <SalesShell>
        <p>תוכן</p>
      </SalesShell>,
    );
    expect(screen.getByText(UI.switchToFactory)).toBeTruthy();
    expect(screen.getAllByText(NAV_LABELS.settings).length).toBeGreaterThan(0);
  });

  it("renders its children in the main landmark", () => {
    render(
      <SalesShell>
        <p>תוכן הבדיקה</p>
      </SalesShell>,
    );
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("תוכן הבדיקה");
  });
});

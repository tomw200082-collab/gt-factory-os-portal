// Back goes where the person came from (UX gate FLOW-B-002/004), and the sales
// pages say they are Hebrew to assistive technology (A11Y-B-003).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ back: vi.fn(), path: "/sales/orgs" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: nav.back }),
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
}));

import { BackLink } from "@/app/(sales)/_components/BackLink";
import { noteSalesPath, resetSalesPathsForTest } from "@/app/(sales)/_lib/salesHistory";
import { useSalesDocumentLang } from "@/app/(sales)/_components/SalesShell";
import { UI } from "@/app/(sales)/_lib/labels";

beforeEach(() => {
  nav.back.mockClear();
  nav.path = "/sales/orgs/abc";
  resetSalesPathsForTest();
});
afterEach(cleanup);

describe("back link", () => {
  it("opened directly, it leads to the businesses list by its address", () => {
    noteSalesPath("/sales/orgs/abc");
    render(<BackLink fallbackHref="/sales/orgs" fallbackLabel={UI.backToOrgs} />);
    const link = screen.getByRole("link", { name: UI.backToOrgs });
    expect(link.getAttribute("href")).toBe("/sales/orgs");
    fireEvent.click(link);
    expect(nav.back).not.toHaveBeenCalled();
  });

  it("reached from another sales screen, it goes back there", () => {
    noteSalesPath("/sales/today");
    noteSalesPath("/sales/orgs/abc");
    render(<BackLink fallbackHref="/sales/orgs" fallbackLabel={UI.backToOrgs} />);
    const link = screen.getByRole("link", { name: UI.back });
    fireEvent.click(link);
    expect(nav.back).toHaveBeenCalledTimes(1);
  });

  it("knows where it came from before the shell has noted the new screen", () => {
    noteSalesPath("/sales/orgs");
    render(<BackLink fallbackHref="/sales/orgs" fallbackLabel={UI.backToOrgs} />);
    expect(screen.getByRole("link", { name: UI.back })).toBeTruthy();
  });

  it("does not count a repeat of the same address as a step", () => {
    noteSalesPath("/sales/orgs/abc");
    noteSalesPath("/sales/orgs/abc");
    render(<BackLink fallbackHref="/sales/orgs" fallbackLabel={UI.backToOrgs} />);
    expect(screen.getByRole("link", { name: UI.backToOrgs })).toBeTruthy();
  });
});

describe("page language", () => {
  function Probe() {
    useSalesDocumentLang();
    return null;
  }
  it("marks the document Hebrew while a sales page is open, and restores it after", () => {
    document.documentElement.lang = "en";
    const { unmount } = render(<Probe />);
    expect(document.documentElement.lang).toBe("he");
    unmount();
    expect(document.documentElement.lang).toBe("en");
  });
});

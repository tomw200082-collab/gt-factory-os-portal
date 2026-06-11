// ---------------------------------------------------------------------------
// planning-subnav-mobile.test.tsx — locks Tranche 053 FLOW-005 on the
// PlanningSubNav tab strip:
//   • On mount the ACTIVE tab is scrolled into view (inline: "nearest") so a
//     deep tab (e.g. Blockers) isn't invisible at phone widths.
//   • The scroll row is wrapped in the shared <ScrollFade> affordance — the
//     right-edge gradient overlay exists in the DOM.
//   • aria-current="page" still lands on exactly one tab.
//
// Codebase idiom: queryByX / getByX with toBeTruthy() — no jest-dom matchers.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const pathnameState = { current: "/planning/procurement" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { PlanningSubNav } from "@/components/layout/PlanningSubNav";

const scrollSpy = vi.fn();

function renderSubNav() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PlanningSubNav />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scrollSpy.mockReset();
  // happy-dom may not implement scrollIntoView — install a spy either way.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollSpy,
    configurable: true,
    writable: true,
  });
  // The blockers-badge query fetches; fail it silently (badge renders 0).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false }) as Response),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlanningSubNav — FLOW-005 active-tab visibility", () => {
  it("marks exactly one tab as aria-current=page", () => {
    renderSubNav();
    const nav = screen.getByRole("navigation", { name: /planning sections/i });
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0]!.getAttribute("href")).toBe("/planning/procurement");
  });

  it("scrolls the active tab into view on mount with inline:nearest", () => {
    renderSubNav();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      inline: "nearest",
      block: "nearest",
    });
  });

  it("renders the ScrollFade right-edge affordance overlay", () => {
    const { container } = renderSubNav();
    const fade = container.querySelector('[class*="bg-gradient-to-l"]');
    expect(fade).toBeTruthy();
    expect(fade!.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps every tab link in the scroll row (none dropped by the rewrap)", () => {
    renderSubNav();
    const nav = screen.getByRole("navigation", { name: /planning sections/i });
    const links = nav.querySelectorAll("a");
    expect(links.length).toBe(8);
  });
});

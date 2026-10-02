import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import { NavigationLoader } from "@/components/ui/NavigationLoader";

// Mirrors of the CSS timings in globals.css (.gt-loader). The entrance is
// invisible for ENTRANCE_MS, the exit fade lasts EXIT_MS, and the safety valve
// gives up on a navigation that never commits.
const ENTRANCE_MS = 120;
const EXIT_MS = 180;
const SAFETY_MS = 6000;

const anchors: HTMLAnchorElement[] = [];
function link(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "go";
  document.body.appendChild(a);
  anchors.push(a);
  return a;
}

const loader = () => screen.queryByRole("status");
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const swallowNavigation = (e: Event) => e.preventDefault();

beforeEach(() => {
  vi.useFakeTimers();
  nav.pathname = "/home";
  // The loader listens in the capture phase; this bubble-phase listener only
  // stops happy-dom from actually navigating after the loader has seen the click.
  document.addEventListener("click", swallowNavigation);
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation);
  cleanup();
  for (const a of anchors.splice(0)) a.remove();
  vi.useRealTimers();
});

describe("NavigationLoader: which world", () => {
  it("shows the sales loader when a factory page links into /sales", () => {
    nav.pathname = "/home";
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    const el = loader();
    expect(el).not.toBeNull();
    expect(el!.getAttribute("data-variant")).toBe("sales");
    expect(screen.getByRole("status", { name: "טוען" })).toBe(el);
    expect(el!.getAttribute("lang")).toBe("he");
  });

  it("shows the factory loader when a sales page links out to /home", () => {
    nav.pathname = "/sales/today";
    render(<NavigationLoader />);
    fireEvent.click(link("/home"));
    const el = loader();
    expect(el!.getAttribute("data-variant")).toBe("factory");
    expect(screen.getByRole("status", { name: "Loading GT Factory OS" })).toBe(el);
  });

  it("picks the world from the destination pathname, not its query or hash", () => {
    nav.pathname = "/home";
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/leads?x=/home#/home"));
    expect(loader()!.getAttribute("data-variant")).toBe("sales");
  });

  it("treats /apps as factory and /salesy as factory", () => {
    nav.pathname = "/sales/today";
    render(<NavigationLoader />);
    fireEvent.click(link("/apps"));
    expect(loader()!.getAttribute("data-variant")).toBe("factory");
    cleanup();
    render(<NavigationLoader />);
    fireEvent.click(link("/salesy"));
    expect(loader()!.getAttribute("data-variant")).toBe("factory");
  });

  it("works when the click lands on an element inside the link", () => {
    render(<NavigationLoader />);
    const a = link("/sales/today");
    const inner = document.createElement("span");
    a.appendChild(inner);
    fireEvent.click(inner);
    expect(loader()!.getAttribute("data-variant")).toBe("sales");
  });
});

describe("NavigationLoader: clicks that do not navigate this tab", () => {
  it.each([
    ["meta", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
  ])("ignores a %s-click", (_name, init) => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"), init);
    advance(1000);
    expect(loader()).toBeNull();
  });

  it.each([
    ["middle", 1],
    ["right", 2],
  ])("ignores a %s-button click", (_name, button) => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"), { button });
    advance(1000);
    expect(loader()).toBeNull();
  });

  it("ignores target=_blank, other targets and download links", () => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today", { target: "_blank" }));
    fireEvent.click(link("/sales/today", { target: "somewhere" }));
    fireEvent.click(link("/sales/today", { download: "" }));
    expect(loader()).toBeNull();
  });

  it("shows for an explicit target=_self", () => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today", { target: "_self" }));
    expect(loader()).not.toBeNull();
  });

  it.each([
    ["an external URL", "https://example.com/x"],
    ["a protocol-relative URL", "//example.com/x"],
    ["a mailto link", "mailto:a@b.co"],
    ["a hash-only link", "#section"],
    ["a relative path", "today"],
    ["a missing href", ""],
  ])("ignores %s", (_name, href) => {
    render(<NavigationLoader />);
    fireEvent.click(link(href));
    expect(loader()).toBeNull();
  });

  it("ignores a link with no href attribute at all", () => {
    render(<NavigationLoader />);
    const a = document.createElement("a");
    a.textContent = "go";
    document.body.appendChild(a);
    anchors.push(a);
    fireEvent.click(a);
    expect(loader()).toBeNull();
  });
});

describe("NavigationLoader: links that do not change the pathname", () => {
  it.each([
    ["the same path", "/home"],
    ["the same path with a query", "/home?tab=2"],
    ["the same path with a hash", "/home#top"],
    ["the same path with a trailing slash", "/home/"],
  ])("shows nothing for %s", (_name, href) => {
    nav.pathname = "/home";
    render(<NavigationLoader />);
    fireEvent.click(link(href));
    advance(SAFETY_MS);
    expect(loader()).toBeNull();
  });

  it("shows nothing for a query-only change under /sales", () => {
    nav.pathname = "/sales/leads";
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/leads?status=new"));
    expect(loader()).toBeNull();
  });

  it("does treat the root as its own page", () => {
    nav.pathname = "/home";
    render(<NavigationLoader />);
    fireEvent.click(link("/"));
    expect(loader()).not.toBeNull();
  });
});

describe("NavigationLoader: lifecycle", () => {
  it("fades out and unmounts after the pathname commits", () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 100);
    expect(loader()).not.toBeNull();
    expect(loader()!.getAttribute("data-leaving")).toBeNull();

    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");

    advance(EXIT_MS - 1);
    expect(loader()).not.toBeNull();
    advance(1);
    expect(loader()).toBeNull();
  });

  it("never flashes when the page commits before the entrance delay", () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS - 40);
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    // Still invisible by CSS, so it is removed at once rather than faded in
    // for a moment while it fades out.
    expect(loader()).toBeNull();
  });

  it("gives up after the safety timeout, fading out", () => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(SAFETY_MS - 1);
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
    advance(1);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
    advance(EXIT_MS);
    expect(loader()).toBeNull();
  });

  it("re-targets the world when a second link is clicked while it is up", () => {
    nav.pathname = "/home";
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    const first = loader()!;
    expect(first.getAttribute("data-variant")).toBe("sales");
    advance(ENTRANCE_MS + 100);

    fireEvent.click(link("/stock/receipts"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(loader()!.getAttribute("data-variant")).toBe("factory");
    // Same element: the overlay did not restart its entrance.
    expect(loader()).toBe(first);

    fireEvent.click(link("/sales/leads"));
    expect(loader()!.getAttribute("data-variant")).toBe("sales");
  });

  it("restarts the safety timer on a second click", () => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(5000);
    fireEvent.click(link("/sales/leads"));
    advance(5000);
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
    advance(1000);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
  });

  it("starts a fresh overlay when clicked again while it is fading out", () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 100);
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    advance(EXIT_MS / 2);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");

    fireEvent.click(link("/home"));
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
    expect(loader()!.getAttribute("data-variant")).toBe("factory");
    // The old fade-out timer must not unmount the new overlay.
    advance(EXIT_MS);
    expect(loader()).not.toBeNull();
  });

  it("repeated navigations keep working", () => {
    const { rerender } = render(<NavigationLoader />);
    for (const dest of ["/sales/today", "/home", "/sales/leads", "/apps"]) {
      fireEvent.click(link(dest));
      advance(ENTRANCE_MS + 50);
      expect(loader()).not.toBeNull();
      nav.pathname = dest;
      rerender(<NavigationLoader />);
      advance(EXIT_MS);
      expect(loader()).toBeNull();
    }
  });

  it("clears its timers on unmount", () => {
    const { unmount } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes its click listener on unmount", () => {
    const { unmount } = render(<NavigationLoader />);
    unmount();
    fireEvent.click(link("/sales/today"));
    expect(loader()).toBeNull();
  });
});

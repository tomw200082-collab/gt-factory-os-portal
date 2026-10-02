import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import { NavigationLoader } from "@/components/ui/NavigationLoader";

// Mirrors of the CSS timings in globals.css (.gt-loader). The entrance is
// invisible for ENTRANCE_MS, the exit fade ends by EXIT_MS, and the safety valve
// gives up on a navigation that never commits.
const ENTRANCE_MS = 120;
// The exit fade is 180 ms; the node is removed a little later (100 ms of slack),
// because the transition starts a frame or two after the state change and
// removing on the dot would cut it short while it is still visibly fading.
const EXIT_MS = 280;
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

// happy-dom delivers MutationObserver records on a real timer, so the fake clock
// cannot flush them: keep a handle on the real setTimeout for that.
const realSetTimeout = globalThis.setTimeout;
const loader = () => screen.queryByRole("status");
// Let the boundary watcher notice a change: a real tick for the MutationObserver
// (happy-dom delivers records on a real timer) and one poll interval of fake time
// for its backup poll (happy-dom's observer is not reliable enough to be the only
// route in a test; the browser's is).
async function flushObservers() {
  await act(async () => {
    await new Promise<void>((r) => realSetTimeout(r, 15));
    vi.advanceTimersByTime(60);
  });
}
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
    expect(screen.getByRole("status", { name: "טוען את GT CRM" })).toBe(el);
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

// ── L1: one continuous loader across the route boundary ─────────────────────
// Root loading.tsx and the RoleGate fallback mount their own GTLoader, tagged
// data-gt-loader-boundary. The navigation overlay must stay up (opaque) until
// none of them remain, and only then run its exit, so the user sees one surface.
describe("NavigationLoader: one continuous surface", () => {
  const boundaries: HTMLElement[] = [];
  function boundary(attrs: Record<string, string> = {}) {
    const el = document.createElement("div");
    el.className = "gt-loader";
    el.setAttribute("data-gt-loader-boundary", "");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    boundaries.push(el);
    return el;
  }
  const flush = flushObservers;
  afterEach(() => {
    for (const b of boundaries.splice(0)) b.remove();
  });

  it("stamps the overlay so a boundary can join its timeline", () => {
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    const el = loader()!;
    expect(el.hasAttribute("data-gt-loader-nav")).toBe(true);
    expect(Number(el.getAttribute("data-t0"))).toBeGreaterThan(0);
  });

  it("does not start its exit while a boundary loader is still up", async () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 200);
    const b = boundary();
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    await flush();
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
    advance(1500);
    expect(loader()!.getAttribute("data-leaving")).toBeNull();

    b.remove();
    await flush();
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
    advance(EXIT_MS);
    expect(loader()).toBeNull();
  });

  it("waits for every boundary, not just the first", async () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 200);
    const a = boundary();
    const b = boundary();
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    a.remove();
    await flush();
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
    b.remove();
    await flush();
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
  });

  it("a boundary that is itself fading out does not hold the overlay", async () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 200);
    boundary({ "data-leaving": "true" });
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
  });

  it("still gives up at the safety valve with a boundary stuck on screen", async () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 200);
    boundary();
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    advance(SAFETY_MS - ENTRANCE_MS - 200 - 1);
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
    advance(1);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
    advance(EXIT_MS);
    expect(loader()).toBeNull();
  });

  it("removes at once when the boundary clears before anything was visible", async () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(10);
    const b = boundary();
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    advance(10);
    b.remove();
    await flush();
    expect(loader()).toBeNull();
  });

  it("a new click while waiting on a boundary starts over cleanly", async () => {
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 200);
    const b = boundary();
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    fireEvent.click(link("/home"));
    expect(loader()!.getAttribute("data-variant")).toBe("factory");
    b.remove();
    await flush();
    // The old wait must not fade the overlay of the navigation that replaced it.
    expect(loader()!.getAttribute("data-leaving")).toBeNull();
  });

  it("stops watching on unmount", async () => {
    const { rerender, unmount } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 200);
    const b = boundary();
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    unmount();
    b.remove();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ── L3: a click on the page you are already on ───────────────────────────────
describe("NavigationLoader: a click on the current page while an overlay is up", () => {
  it("fades the overlay out instead of leaving it for the 6 s valve", () => {
    nav.pathname = "/sales/leads";
    render(<NavigationLoader />);
    fireEvent.click(link("/home"));
    advance(ENTRANCE_MS + 100);
    expect(loader()).not.toBeNull();
    fireEvent.click(link("/sales/leads?status=new"));
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
    advance(EXIT_MS);
    expect(loader()).toBeNull();
  });

  it("removes it at once if it was never visible", () => {
    nav.pathname = "/sales/leads";
    render(<NavigationLoader />);
    fireEvent.click(link("/home"));
    advance(40);
    fireEvent.click(link("/sales/leads"));
    expect(loader()).toBeNull();
  });

  it("does nothing when no overlay is up", () => {
    nav.pathname = "/sales/leads";
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/leads?status=new"));
    expect(loader()).toBeNull();
  });
});

// ── L4: the page behind a visible overlay cannot be reached ──────────────────
describe("NavigationLoader: inert page behind the overlay", () => {
  const extras: HTMLElement[] = [];
  function content(tag = "main") {
    const el = document.createElement(tag);
    el.textContent = "page";
    document.body.appendChild(el);
    extras.push(el);
    return el;
  }
  afterEach(() => {
    for (const e of extras.splice(0)) e.remove();
  });

  it("inerts the rest of the page once the overlay is visible, not before", () => {
    const main = content();
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS - 1);
    expect(main.hasAttribute("inert")).toBe(false);
    advance(1);
    expect(main.hasAttribute("inert")).toBe(true);
    // The overlay itself stays reachable (its own subtree is never inert).
    expect(loader()!.closest("[inert]")).toBeNull();
  });

  it("lifts it as the exit starts", () => {
    const main = content();
    const { rerender } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 100);
    expect(main.hasAttribute("inert")).toBe(true);
    nav.pathname = "/sales/today";
    rerender(<NavigationLoader />);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
    expect(main.hasAttribute("inert")).toBe(false);
  });

  it("lifts it on unmount and when the overlay is removed outright", () => {
    const main = content();
    const { unmount } = render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 100);
    expect(main.hasAttribute("inert")).toBe(true);
    unmount();
    expect(main.hasAttribute("inert")).toBe(false);
  });

  it("leaves alone what was already inert", () => {
    const main = content();
    const modal = content("aside");
    modal.setAttribute("inert", "");
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 100);
    expect(main.hasAttribute("inert")).toBe(true);
    cleanup();
    expect(main.hasAttribute("inert")).toBe(false);
    expect(modal.hasAttribute("inert")).toBe(true);
  });

  it("does not take the route announcer out of the accessibility tree", () => {
    const announcer = content("next-route-announcer");
    render(<NavigationLoader />);
    fireEvent.click(link("/sales/today"));
    advance(ENTRANCE_MS + 100);
    expect(announcer.hasAttribute("inert")).toBe(false);
  });
});

// ── L1: a hard load that arrives with a boundary loader already in the HTML ──
// On /sales/* the server HTML carries the RoleGate fallback. React then
// suspends and swaps boundary loaders (hiding the server one, mounting the
// root loading.tsx one), each restarting its invisible phase, and finally
// removes them in one commit. The overlay takes over at hydration so the user
// sees one surface, and it supplies the exit fade.
describe("NavigationLoader: hard load with a server-rendered loader", () => {
  const server: HTMLElement[] = [];
  function serverLoader(variant = "sales") {
    const el = document.createElement("div");
    el.className = "gt-loader";
    el.setAttribute("data-variant", variant);
    el.setAttribute("data-gt-loader-boundary", "");
    document.body.appendChild(el);
    server.push(el);
    return el;
  }
  const flush = flushObservers;
  afterEach(() => {
    for (const e of server.splice(0)) e.remove();
  });

  it("does nothing on an ordinary load", () => {
    render(<NavigationLoader />);
    expect(loader()).toBeNull();
  });

  it("takes over at once, in the same world, before the first paint", () => {
    serverLoader("sales");
    render(<NavigationLoader />);
    const el = screen.getAllByRole("status").find((n) => n.hasAttribute("data-gt-loader-nav"))!;
    expect(el).toBeTruthy();
    expect(el.getAttribute("data-variant")).toBe("sales");
    // Its clock started when the page did, so it joins already-run animations.
    expect(Number(el.getAttribute("data-t0"))).toBeLessThanOrEqual(Date.now());
  });

  it("leaves with the fade once the last boundary is gone, not before", async () => {
    const s = serverLoader("sales");
    render(<NavigationLoader />);
    const overlay = () =>
      screen.queryAllByRole("status").find((n) => n.hasAttribute("data-gt-loader-nav")) ?? null;
    advance(ENTRANCE_MS + 500);
    expect(overlay()!.getAttribute("data-leaving")).toBeNull();
    s.remove();
    await flush();
    expect(overlay()!.getAttribute("data-leaving")).toBe("true");
    advance(EXIT_MS);
    expect(overlay()).toBeNull();
  });

  it("covers a factory hard load the same way", () => {
    serverLoader("factory");
    render(<NavigationLoader />);
    expect(loader()!.getAttribute("data-variant")).toBe("factory");
  });

  it("still gives up at the safety valve", () => {
    serverLoader("sales");
    render(<NavigationLoader />);
    advance(SAFETY_MS);
    expect(loader()!.getAttribute("data-leaving")).toBe("true");
    advance(EXIT_MS);
    expect(loader()).toBeNull();
  });
});

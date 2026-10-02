import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import { GTLoader } from "@/components/ui/GTLoader";

afterEach(() => {
  cleanup();
  nav.pathname = "/home";
});

describe("GTLoader", () => {
  it("derives its world from the pathname when no variant is given", () => {
    nav.pathname = "/sales/today";
    const { unmount } = render(<GTLoader />);
    expect(screen.getByRole("status").getAttribute("data-variant")).toBe("sales");
    unmount();
    nav.pathname = "/stock/receipts";
    render(<GTLoader />);
    expect(screen.getByRole("status").getAttribute("data-variant")).toBe("factory");
  });

  it("lets an explicit variant win over the pathname", () => {
    nav.pathname = "/home";
    render(<GTLoader variant="sales" />);
    expect(screen.getByRole("status").getAttribute("data-variant")).toBe("sales");
  });

  it("names itself for assistive tech, in the language of its world", () => {
    const { unmount } = render(<GTLoader variant="factory" />);
    const factory = screen.getByRole("status", { name: "Loading GT Factory OS" });
    expect(factory.getAttribute("aria-live")).toBe("polite");
    expect(factory.getAttribute("lang")).toBeNull();
    unmount();
    render(<GTLoader variant="sales" />);
    const sales = screen.getByRole("status", { name: "טוען את GT CRM" });
    expect(sales.getAttribute("aria-live")).toBe("polite");
    expect(sales.getAttribute("lang")).toBe("he");
  });

  it("labels each world: GT FACTORY OS and GT CRM, never Initializing", () => {
    const label = (c: HTMLElement) => c.querySelector(".gt-loader__label")?.textContent;
    const { container, unmount } = render(<GTLoader variant="factory" />);
    expect(label(container)).toBe("GT FACTORY OS");
    unmount();
    const sales = render(<GTLoader variant="sales" />);
    expect(label(sales.container)).toBe("GT CRM");
    sales.unmount();
    const custom = render(<GTLoader variant="sales" message="LOADING LEADS" />);
    expect(label(custom.container)).toBe("LOADING LEADS");
  });

  it("uses the cropped mark, hidden from assistive tech and not draggable", () => {
    const { container } = render(<GTLoader variant="factory" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/brand/logo-mark.png");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.getAttribute("draggable")).toBe("false");
  });

  it("has nothing focusable and hides all decoration", () => {
    const { container } = render(<GTLoader variant="sales" />);
    const root = screen.getByRole("status");
    expect(
      container.querySelectorAll(
        "a, button, input, select, textarea, [tabindex], [contenteditable]",
      ),
    ).toHaveLength(0);
    // Every direct child of the status root is decoration, bar the one
    // visually hidden text node that carries the announcement.
    for (const child of Array.from(root.children)) {
      if (child.classList.contains("sr-only")) continue;
      expect(child.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("carries a visually hidden announcement inside the status, in its own language", () => {
    const { unmount } = render(<GTLoader variant="factory" />);
    let hidden = screen.getByRole("status").querySelector(".sr-only")!;
    expect(hidden.textContent).toBe("Loading GT Factory OS");
    expect(hidden.getAttribute("lang")).toBeNull();
    expect(screen.getByRole("status").querySelector(".gt-loader__stage")!.getAttribute("aria-hidden")).toBe("true");
    unmount();
    render(<GTLoader variant="sales" />);
    hidden = screen.getByRole("status").querySelector(".sr-only")!;
    expect(hidden.textContent).toBe("טוען את GT CRM");
    expect(hidden.getAttribute("lang")).toBe("he");
  });

  it("marks the exit with data-leaving", () => {
    const { rerender } = render(<GTLoader variant="factory" />);
    expect(screen.getByRole("status").getAttribute("data-leaving")).toBeNull();
    rerender(<GTLoader variant="factory" leaving />);
    expect(screen.getByRole("status").getAttribute("data-leaving")).toBe("true");
  });
});


describe("GTLoader: continuity between instances", () => {
  afterEach(() => {
    document.querySelectorAll("[data-fake-nav]").forEach((n) => n.remove());
  });

  function fakeNavOverlay(t0: number, extra: Record<string, string> = {}) {
    const el = document.createElement("div");
    el.className = "gt-loader";
    el.setAttribute("data-gt-loader-nav", "");
    el.setAttribute("data-t0", String(t0));
    el.setAttribute("data-fake-nav", "");
    for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
  }

  it("marks a route-boundary loader, and only that one", () => {
    const { container, unmount } = render(<GTLoader variant="factory" boundary />);
    expect(container.querySelector(".gt-loader")!.hasAttribute("data-gt-loader-boundary")).toBe(true);
    unmount();
    const plain = render(<GTLoader variant="factory" />);
    expect(plain.container.querySelector(".gt-loader")!.hasAttribute("data-gt-loader-boundary")).toBe(false);
  });

  it("marks a navigation overlay and stamps when it started", () => {
    const { container } = render(<GTLoader variant="sales" nav startedAt={1234} />);
    const el = container.querySelector(".gt-loader")!;
    expect(el.hasAttribute("data-gt-loader-nav")).toBe(true);
    expect(el.getAttribute("data-t0")).toBe("1234");
  });

  it("an overlay that takes over from a loader already running starts on that loader's clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { container, rerender } = render(<GTLoader variant="sales" nav startedAt={10_000 - 900} />);
    const root = container.querySelector(".gt-loader") as HTMLElement;
    expect(root.style.getPropertyValue("--gt-elapsed")).toBe("900ms");
    // Frozen at mount: a re-render later must not shift the running animations.
    vi.setSystemTime(12_000);
    rerender(<GTLoader variant="sales" nav startedAt={10_000 - 900} leaving />);
    expect(root.style.getPropertyValue("--gt-elapsed")).toBe("900ms");
    vi.useRealTimers();
  });

  it("an ordinary overlay (started just now) carries no offset", () => {
    const { container } = render(<GTLoader variant="sales" nav startedAt={Date.now()} />);
    expect((container.querySelector(".gt-loader") as HTMLElement).style.getPropertyValue("--gt-elapsed")).toBe("");
  });

  it("a boundary that mounts under a running navigation overlay joins its timeline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    fakeNavOverlay(10_000 - 300);
    const { container } = render(<GTLoader variant="sales" boundary />);
    const root = container.querySelector(".gt-loader") as HTMLElement;
    expect(root.style.getPropertyValue("--gt-elapsed")).toBe("300ms");
    vi.useRealTimers();
  });

  it("a boundary with no navigation overlay starts its own entrance", () => {
    const { container } = render(<GTLoader variant="sales" boundary />);
    const root = container.querySelector(".gt-loader") as HTMLElement;
    expect(root.style.getPropertyValue("--gt-elapsed")).toBe("");
  });

  it("ignores a navigation overlay that is already leaving", () => {
    fakeNavOverlay(Date.now() - 300, { "data-leaving": "true" });
    const { container } = render(<GTLoader variant="sales" boundary />);
    expect((container.querySelector(".gt-loader") as HTMLElement).style.getPropertyValue("--gt-elapsed")).toBe("");
  });
});

describe("GTLoader: a way out of a stuck load", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows nothing extra until slowAfterMs", () => {
    render(<GTLoader variant="sales" boundary slowAfterMs={8000} />);
    act(() => void vi.advanceTimersByTime(7999));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a Hebrew line and a reload button on sales after 8 s", () => {
    const reload = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...orig, reload } });
    render(<GTLoader variant="sales" boundary slowAfterMs={8000} />);
    act(() => void vi.advanceTimersByTime(8000));
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("לוקח יותר זמן מהרגיל");
    const btn = screen.getByRole("button", { name: "טעינה מחדש" });
    expect(status.contains(btn)).toBe(true);
    // The stage stays hidden from assistive tech; the button is not inside it.
    expect(status.querySelector(".gt-loader__stage")!.contains(btn)).toBe(false);
    fireEvent.click(btn);
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", { configurable: true, value: orig });
  });

  it("speaks English on the factory loader", () => {
    render(<GTLoader variant="factory" boundary slowAfterMs={8000} />);
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByRole("status").textContent).toContain("Taking longer than usual");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("never offers it unless asked (navigation overlays have their own 6 s valve)", () => {
    render(<GTLoader variant="sales" nav startedAt={0} />);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// The visual contract lives in globals.css, where jsdom cannot compute it, so
// the parts that matter are pinned as text.
describe("globals.css: .gt-loader", () => {
  const css = readFileSync(
    resolve(__dirname, "..", "..", "src", "app", "globals.css"),
    "utf8",
  );
  const loaderKeyframes = [...css.matchAll(/@keyframes (gt-loader-[\w-]+)\s*\{/g)].map(
    (m) => m[1],
  );

  /** Body of a `{ ... }` block that starts at the given index (balanced braces). */
  function bodyAt(open: number): string {
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
    }
    throw new Error("unbalanced braces");
  }

  it("declares both worlds with the same set of custom properties", () => {
    const props = (variant: string) => {
      const at = css.indexOf(`.gt-loader[data-variant="${variant}"]`);
      expect(at, `expected a ${variant} block`).toBeGreaterThan(-1);
      const body = bodyAt(css.indexOf("{", at));
      return [...body.matchAll(/(--gt-[\w-]+)\s*:/g)].map((m) => m[1]).sort();
    };
    const factory = props("factory");
    expect(factory).toEqual(props("sales"));
    for (const p of [
      "--gt-bg-inner",
      "--gt-bg-outer",
      "--gt-accent",
      "--gt-accent-2",
      "--gt-glow",
      "--gt-ink",
      "--gt-ink-muted",
    ]) {
      expect(factory).toContain(p);
    }
  });

  it("copies the GT Pulse opening tokens for the sales world", () => {
    const at = css.indexOf('.gt-loader[data-variant="sales"]');
    const body = bodyAt(css.indexOf("{", at));
    expect(body).toContain("189 62% 19%"); // --s-opening-glow
    expect(body).toContain("175 78% 44%"); // --s-action
    expect(body).toContain("40 20% 97%"); // --s-opening-fg
    expect(body).toContain("186 22% 78%"); // --s-opening-fg-muted
  });

  it("animates only transform, opacity and visibility", () => {
    expect(loaderKeyframes.length).toBeGreaterThan(0);
    const allowed = new Set(["transform", "opacity", "visibility"]);
    for (const name of loaderKeyframes) {
      const at = css.indexOf(`@keyframes ${name}`);
      const body = bodyAt(css.indexOf("{", at));
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) {
        expect(allowed.has(p), `${name} animates ${p}`).toBe(true);
      }
    }
  });

  it("holds a reduced-motion block that stops the rotation, sweep and travel", () => {
    const at = css.search(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.gt-loader/);
    expect(at).toBeGreaterThan(-1);
    const body = bodyAt(css.indexOf("{", at));
    expect(body).toMatch(/\.gt-loader__arc[\s\S]*animation:\s*none/);
    expect(body).toMatch(/\.gt-loader__sweep/);
    expect(body).toMatch(/\.gt-loader__glow[\s\S]*animation:\s*none/);
    expect(body).toMatch(/\.gt-loader__progress/);
  });

  it("keeps the entrance invisible and inert for 120 ms, then fades in over 200 ms", () => {
    expect(css).toMatch(/animation:\s*gt-loader-in\s+200ms[^;]*\sboth/);
    // The delay is relative to a shared clock, so a loader that joins a running
    // one lands on the same frame instead of restarting its invisible phase.
    expect(css).toMatch(/animation-delay:\s*calc\(120ms - var\(--gt-elapsed\)\)/);
    const at = css.indexOf("@keyframes gt-loader-in");
    const body = bodyAt(css.indexOf("{", at));
    expect(body).toMatch(/visibility:\s*hidden/);
    expect(body).toMatch(/opacity:\s*0/);
  });

  it("no longer carries the retired loader keyframes", () => {
    for (const name of [
      "gt-spin",
      "gt-spin-r",
      "gt-pulse-glow",
      "gt-logo-in",
      "gt-fade-up",
      "gt-bounce",
      "gt-progress",
    ]) {
      expect(css).not.toContain(`@keyframes ${name} `);
      expect(css).not.toContain(`@keyframes ${name}{`);
    }
  });

  it("freezes the entrance on exit and fades only the stage", () => {
    const at = css.indexOf('.gt-loader[data-leaving="true"] {');
    expect(at).toBeGreaterThan(-1);
    const body = bodyAt(css.indexOf("{", at));
    expect(body).toMatch(/animation-play-state:\s*paused/);
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(css).toMatch(/\.gt-loader\[data-leaving="true"\] \.gt-loader__stage\s*\{[^}]*opacity:\s*0/);
  });

  it("styles the stuck-load notice", () => {
    expect(css).toMatch(/\.gt-loader__slow\s*\{/);
    expect(css).toMatch(/\.gt-loader__slow button\s*\{[^}]*min-height:\s*44px/);
  });

  it("keeps gt-shimmer, which the skeletons still use", () => {
    expect(css).toMatch(/@keyframes gt-shimmer\b/);
  });
});

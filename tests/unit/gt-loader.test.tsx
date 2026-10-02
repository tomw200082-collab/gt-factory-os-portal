import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
    const sales = screen.getByRole("status", { name: "טוען" });
    expect(sales.getAttribute("aria-live")).toBe("polite");
    expect(sales.getAttribute("lang")).toBe("he");
  });

  it("labels each world: GT FACTORY OS and GT PULSE, never Initializing", () => {
    const { container, unmount } = render(<GTLoader variant="factory" />);
    expect(container.textContent).toBe("GT FACTORY OS");
    unmount();
    const sales = render(<GTLoader variant="sales" />);
    expect(sales.container.textContent).toBe("GT PULSE");
    sales.unmount();
    const custom = render(<GTLoader variant="sales" message="LOADING LEADS" />);
    expect(custom.container.textContent).toBe("LOADING LEADS");
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
    // Every direct child of the status root is decoration.
    for (const child of Array.from(root.children)) {
      expect(child.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("marks the exit with data-leaving", () => {
    const { rerender } = render(<GTLoader variant="factory" />);
    expect(screen.getByRole("status").getAttribute("data-leaving")).toBeNull();
    rerender(<GTLoader variant="factory" leaving />);
    expect(screen.getByRole("status").getAttribute("data-leaving")).toBe("true");
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
    expect(css).toMatch(/animation:\s*gt-loader-in\s+200ms[^;]*\s120ms\s+both/);
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

  it("keeps gt-shimmer, which the skeletons still use", () => {
    expect(css).toMatch(/@keyframes gt-shimmer\b/);
  });
});

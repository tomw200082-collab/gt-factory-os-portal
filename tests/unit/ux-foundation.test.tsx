import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import { useRouteReveal } from "@/components/layout/useRouteReveal";

beforeEach(() => {
  nav.pathname = "/home";
});
afterEach(cleanup);

function Page({ extra }: { extra?: string }) {
  const ref = useRouteReveal<HTMLElement>();
  return (
    <main ref={ref} className="gt-reveal" data-extra={extra}>
      content
    </main>
  );
}

describe("useRouteReveal", () => {
  it("leaves the first mount alone: the CSS animation runs by itself", () => {
    render(<Page />);
    const main = screen.getByRole("main");
    expect(main.classList.contains("gt-reveal")).toBe(true);
  });

  it("does not restart on a rerender with the same pathname (a refetch)", () => {
    const { rerender } = render(<Page />);
    const main = screen.getByRole("main");
    const remove = vi.spyOn(main.classList, "remove");
    rerender(<Page extra="refetched" />);
    expect(remove).not.toHaveBeenCalled();
    expect(main.classList.contains("gt-reveal")).toBe(true);
  });

  it("restarts once when the pathname changes, without remounting", () => {
    const { rerender } = render(<Page />);
    const main = screen.getByRole("main");
    const remove = vi.spyOn(main.classList, "remove");
    const add = vi.spyOn(main.classList, "add");
    nav.pathname = "/stock/receipts";
    rerender(<Page />);
    expect(remove).toHaveBeenCalledWith("gt-reveal");
    expect(add).toHaveBeenCalledWith("gt-reveal");
    expect(screen.getByRole("main")).toBe(main);
    expect(main.classList.contains("gt-reveal")).toBe(true);
  });
});

describe("globals.css contract", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const sales = readFileSync(path.join(process.cwd(), "src/app/(sales)/sales-tokens.css"), "utf8");

  it("defines the seven motion tokens on :root", () => {
    for (const [name, value] of [
      ["--motion-instant", "80ms"],
      ["--motion-fast", "140ms"],
      ["--motion-base", "200ms"],
      ["--motion-slow", "320ms"],
      ["--ease-out", "cubic-bezier(0.16, 1, 0.3, 1)"],
      ["--ease-in", "cubic-bezier(0.4, 0, 1, 1)"],
      ["--ease-spring", "cubic-bezier(0.34, 1.56, 0.64, 1)"],
    ] as const) {
      expect(css).toContain(`${name}: ${value}`);
    }
  });

  it("aliases the sales tokens to them", () => {
    expect(sales).toContain("--s-motion: var(--motion-fast)");
    expect(sales).toContain("--s-ease: var(--ease-out)");
    expect(sales).toContain("--s-spring: var(--ease-spring)");
    expect(sales).toContain("--s-settle: var(--ease-out)");
  });

  it("has one global prefers-reduced-motion rule that spares the GT loader", () => {
    expect(css).toMatch(/animation-duration: 0\.01ms !important/);
    expect(css).toMatch(/transition-duration: 0\.01ms !important/);
    expect(css).toContain(":not(.gt-loader)");
  });

  it("styles the sales busy button and the factory spinner", () => {
    expect(sales).toContain('.s-btn[aria-busy="true"]');
    expect(css).toContain('.btn[aria-busy="true"]');
  });

  it("derives the skeleton sweep and base from the ink, and has a sales card override", () => {
    expect(css).toContain("hsl(var(--fg) / var(--skel-sweep))");
    expect(css).toContain("hsl(var(--fg) / var(--skel-base))");
    expect(css).not.toContain("hsl(var(--bg-raised) / 0.8), transparent)");
    expect(sales).toContain('.s-card.animate-pulse::after');
  });

  it("keeps one pending ring on sales buttons: the ::after ring, no SBtnSpinner", () => {
    expect(sales).toContain('.s-btn[aria-busy="true"]::after');
    expect(sales).not.toContain("s-btn-spinner");
    expect(css).not.toContain("s-btn-spinner");
  });

  it("holds the spinners as a slow pulse under reduced motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".animate-spin");
    expect(reduced).toContain('.s-btn[aria-busy="true"]::after');
    expect(reduced).toContain("gt-spinner-hold");
  });

  it("hides a leading icon behind the spinner in any busy control", () => {
    expect(css).toContain('[aria-busy="true"] > .btn-spinner + svg');
  });

  it("has real overlay keyframes wired to the Radix data-state attributes", () => {
    for (const k of ["gt-drawer-in", "gt-drawer-out", "gt-dialog-in", "gt-dialog-out", "gt-menu-in", "gt-menu-out"]) {
      expect(css).toContain(`@keyframes ${k}`);
    }
    expect(css).toContain('.gt-drawer-panel[data-state="open"]');
    expect(css).toContain("animation: gt-drawer-in var(--motion-base)");
    expect(css).toContain("animation: gt-drawer-out var(--motion-fast)");
    expect(css).toContain("animation: gt-menu-in var(--motion-fast)");
    expect(css).toContain("scale(0.97)");
  });
});

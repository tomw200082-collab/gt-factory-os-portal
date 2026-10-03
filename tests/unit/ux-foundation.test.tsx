import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import { SBtnSpinner } from "@/app/(sales)/_components/SBtnSpinner";
import { useRouteReveal } from "@/components/layout/useRouteReveal";

beforeEach(() => {
  nav.pathname = "/home";
});
afterEach(cleanup);

describe("SBtnSpinner", () => {
  it("is a decorative 14px spinner span with the sales class", () => {
    const { container } = render(<SBtnSpinner />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.classList.contains("s-btn-spinner")).toBe(true);
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});

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
});

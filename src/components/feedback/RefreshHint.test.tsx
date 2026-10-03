import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RefreshHint } from "./RefreshHint";

afterEach(cleanup);

describe("RefreshHint", () => {
  it("is a polite live region that is always mounted (so a change is announced)", () => {
    const { container } = render(<RefreshHint active={false} />);
    const region = container.firstElementChild as HTMLElement;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("data-active")).toBe("false");
  });

  it("says nothing while inactive, but keeps its reserved box", () => {
    const { container } = render(<RefreshHint active={false} />);
    const region = container.firstElementChild as HTMLElement;
    expect(region.textContent).toBe("");
    expect(region.classList.contains("gt-refresh-hint")).toBe(true);
  });

  it("shows the English label by default when active", () => {
    render(<RefreshHint active />);
    expect(screen.getByRole("status").textContent).toBe("Updating…");
    expect(screen.getByRole("status").getAttribute("data-active")).toBe("true");
  });

  it("uses the Hebrew default for locale he", () => {
    render(<RefreshHint active locale="he" />);
    expect(screen.getByRole("status").textContent).toBe("מתעדכן…");
  });

  it("an explicit label wins over the locale default", () => {
    render(<RefreshHint active locale="he" label="Syncing…" />);
    expect(screen.getByRole("status").textContent).toBe("Syncing…");
  });

  it("removes the text again when the refresh ends", () => {
    const { rerender } = render(<RefreshHint active />);
    rerender(<RefreshHint active={false} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("merges a className and keeps the decorative dot out of the accessibility tree", () => {
    const { container } = render(<RefreshHint active className="ml-auto" />);
    const region = container.firstElementChild as HTMLElement;
    expect(region.classList.contains("ml-auto")).toBe(true);
    expect(container.querySelector(".gt-refresh-hint__dot")!.getAttribute("aria-hidden")).toBe("true");
  });
});

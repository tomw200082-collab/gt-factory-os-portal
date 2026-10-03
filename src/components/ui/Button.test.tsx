import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Button", () => {
  it("renders a .btn with the default (non-submitting) type", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.classList.contains("btn")).toBe(true);
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("maps variant + size to the matching .btn classes", () => {
    render(
      <Button variant="danger" size="sm">
        Delete
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.classList.contains("btn")).toBe(true);
    expect(btn.classList.contains("btn-danger")).toBe(true);
    expect(btn.classList.contains("btn-sm")).toBe(true);
  });

  it("adds no variant/size class for default/md", () => {
    render(<Button>Plain</Button>);
    const btn = screen.getByRole("button", { name: "Plain" });
    expect(btn.className).toContain("btn");
    expect(btn.className).not.toMatch(
      /btn-(primary|danger|ghost|outline|sm|xs|lg)/,
    );
  });

  it("forwards className and click handler", async () => {
    const onClick = vi.fn();
    render(
      <Button className="w-full" onClick={onClick}>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.classList.contains("w-full")).toBe(true);
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe("pending", () => {
    it("is off by default: no aria-busy, no spinner, still enabled", () => {
      render(<Button>Save</Button>);
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.hasAttribute("aria-busy")).toBe(false);
      expect(btn.hasAttribute("disabled")).toBe(false);
      expect(btn.querySelector(".btn-spinner")).toBeNull();
    });

    it("sets disabled and aria-busy and shows a 14px spinner before the label", () => {
      render(<Button pending>Save</Button>);
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.hasAttribute("disabled")).toBe(true);
      expect(btn.getAttribute("aria-busy")).toBe("true");
      const spinner = btn.querySelector(".btn-spinner");
      expect(spinner).not.toBeNull();
      expect(spinner!.getAttribute("aria-hidden")).toBe("true");
      expect(btn.firstElementChild).toBe(spinner);
      // The label stays: no generic "Loading...".
      expect(btn.textContent).toBe("Save");
    });

    it("keeps the spinner right before a leading icon so CSS can replace it", () => {
      render(
        <Button pending>
          <svg data-testid="icon" />
          Save
        </Button>,
      );
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.firstElementChild!.classList.contains("btn-spinner")).toBe(true);
      expect(btn.firstElementChild!.nextElementSibling).toBe(screen.getByTestId("icon"));
    });

    it("does not fire onClick while pending", async () => {
      const onClick = vi.fn();
      render(
        <Button pending onClick={onClick}>
          Save
        </Button>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("stays disabled when pending is false but disabled is true", () => {
      render(<Button disabled>Save</Button>);
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.hasAttribute("disabled")).toBe(true);
      expect(btn.hasAttribute("aria-busy")).toBe(false);
    });

    it("an explicit aria-busy from the caller is not overridden when not pending", () => {
      render(<Button aria-busy="true">Save</Button>);
      expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBe("true");
    });

    it("locks min-width at the width it had when pending starts, and releases it", () => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width: 96,
        height: 36,
        top: 0,
        left: 0,
        right: 96,
        bottom: 36,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const { rerender } = render(<Button>Save</Button>);
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.style.minWidth).toBe("");
      rerender(<Button pending>Save</Button>);
      expect(btn.style.minWidth).toBe("96px");
      rerender(<Button>Save</Button>);
      expect(btn.style.minWidth).toBe("");
    });

    it("restores a min-width the caller set once pending ends", () => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width: 120,
        height: 36,
        top: 0,
        left: 0,
        right: 120,
        bottom: 36,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const { rerender } = render(<Button style={{ minWidth: "80px" }}>Go</Button>);
      const btn = screen.getByRole("button", { name: "Go" });
      rerender(
        <Button pending style={{ minWidth: "80px" }}>
          Go
        </Button>,
      );
      expect(btn.style.minWidth).toBe("120px");
      rerender(<Button style={{ minWidth: "80px" }}>Go</Button>);
      expect(btn.style.minWidth).toBe("80px");
    });

    it("still forwards the ref", () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(
        <Button ref={ref} pending>
          Save
        </Button>,
      );
      expect(ref.current).toBe(screen.getByRole("button", { name: "Save" }));
    });
  });
});

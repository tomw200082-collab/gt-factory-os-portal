import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

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
});

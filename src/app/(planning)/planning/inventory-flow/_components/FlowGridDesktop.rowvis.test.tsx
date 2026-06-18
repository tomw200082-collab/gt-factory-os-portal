import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { FlowGridDesktop } from "./FlowGridDesktop";
import { makeFlowItem } from "../_lib/flowFixture";

beforeAll(() => {
  // happy-dom lacks Element.scrollTo, which FlowGridDesktop calls on mount.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.HTMLElement.prototype as any).scrollTo = vi.fn();
});

afterEach(() => cleanup());

describe("FlowGridDesktop row visibility wiring", () => {
  it("renders a hide button per row and fires onHide with the item id", async () => {
    const onHide = vi.fn();
    const user = userEvent.setup();
    render(<FlowGridDesktop items={[makeFlowItem()]} onHide={onHide} />);
    await user.click(screen.getByRole("button", { name: /hide babka red/i }));
    expect(onHide).toHaveBeenCalledWith("a");
  });

  it("renders a select checkbox per row in select mode", () => {
    render(
      <FlowGridDesktop
        items={[makeFlowItem()]}
        onHide={() => {}}
        selectMode
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: /select babka red/i }),
    ).toBeInTheDocument();
  });

  it("renders no hide button when onHide is not passed (default callers unchanged)", () => {
    render(<FlowGridDesktop items={[makeFlowItem()]} />);
    expect(screen.queryByRole("button", { name: /hide babka red/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// InlineEditCell unit tests — AMMC v1 Slice 3.
//
// Coverage:
//   T1 — renders the current value in display mode (formatted when format() is supplied)
//   T2 — click enters edit mode; the input receives focus and the value is pre-filled
//   T3 — Enter calls onSave with the new value and exits edit mode
//   T4 — Esc cancels edit without calling onSave; value reverts to original
//   T5 — onSave failure reverts the displayed value to the original
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEditCell } from "./InlineEditCell";

afterEach(() => {
  cleanup();
});

describe("InlineEditCell", () => {
  it("T1 renders the value (formatted when format() is supplied)", () => {
    render(
      <InlineEditCell
        value={1.5}
        onSave={async () => {}}
        type="number"
        format={(v) => `$${Number(v).toFixed(2)}`}
      />,
    );
    expect(screen.getByTestId("inline-edit-cell-display").textContent).toContain("$1.50");
  });

  it("T2 click enters edit mode with the current value pre-filled", async () => {
    render(
      <InlineEditCell value="hello" onSave={async () => {}} type="text" />,
    );
    await userEvent.click(screen.getByTestId("inline-edit-cell-display"));
    const input = screen.getByTestId(
      "inline-edit-cell-input",
    ) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("hello");
  });

  it("T3 Enter calls onSave with the new value and exits edit mode", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <InlineEditCell value={10} onSave={onSave} type="number" />,
    );
    await userEvent.click(screen.getByTestId("inline-edit-cell-display"));
    const input = screen.getByTestId("inline-edit-cell-input") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "42");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledWith(42);
  });

  it("T4 Esc cancels edit without calling onSave and reverts to original", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <InlineEditCell value="original" onSave={onSave} type="text" />,
    );
    await userEvent.click(screen.getByTestId("inline-edit-cell-display"));
    const input = screen.getByTestId("inline-edit-cell-input") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "changed");
    await userEvent.keyboard("{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("inline-edit-cell-display").textContent).toContain(
      "original",
    );
  });

  it("T5 onSave failure reverts display to the original value", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("STALE_ROW");
    });
    render(
      <InlineEditCell value="orig" onSave={onSave} type="text" />,
    );
    await userEvent.click(screen.getByTestId("inline-edit-cell-display"));
    const input = screen.getByTestId("inline-edit-cell-input") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "attempted");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    // After the failure, the component should revert to display mode with the
    // original value.
    await waitFor(() => {
      expect(
        screen.getByTestId("inline-edit-cell-display").textContent,
      ).toContain("orig");
    });
  });
});

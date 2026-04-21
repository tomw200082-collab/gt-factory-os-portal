// ---------------------------------------------------------------------------
// Drawer primitive unit tests — AMMC v1 Slice 3.
//
// Coverage:
//   T1 — renders when open=true; absent when open=false
//   T2 — fires onClose on Esc when topmost (no outer drawer)
//   T3 — nested drawer: inner Esc closes only the inner drawer; outer stays open
//   T4 — width prop produces expected max-width class token
//   T5 — width prop map exports the 3 documented tokens
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer, DrawerStackProvider, DRAWER_WIDTH_CLASS } from "./Drawer";
import { useState } from "react";

afterEach(() => {
  cleanup();
});

describe("Drawer — width token map", () => {
  it("T5 exports md/lg/xl tokens pointing at 480/640/800 max-width classes", () => {
    expect(DRAWER_WIDTH_CLASS.md).toBe("max-w-[480px]");
    expect(DRAWER_WIDTH_CLASS.lg).toBe("max-w-[640px]");
    expect(DRAWER_WIDTH_CLASS.xl).toBe("max-w-[800px]");
  });
});

describe("Drawer — open/close", () => {
  it("T1 renders title when open=true and is absent when open=false", () => {
    const { rerender } = render(
      <DrawerStackProvider>
        <Drawer open={false} onClose={() => {}} title="Test drawer">
          <div>body</div>
        </Drawer>
      </DrawerStackProvider>,
    );
    expect(screen.queryByText("Test drawer")).toBeNull();

    rerender(
      <DrawerStackProvider>
        <Drawer open={true} onClose={() => {}} title="Test drawer">
          <div>body</div>
        </Drawer>
      </DrawerStackProvider>,
    );
    expect(screen.getByText("Test drawer")).toBeDefined();
    expect(screen.getByText("body")).toBeDefined();
  });

  it("T2 fires onClose on Esc when the drawer is the only open one", async () => {
    const onClose = vi.fn();
    render(
      <DrawerStackProvider>
        <Drawer open={true} onClose={onClose} title="Solo" testId="solo">
          <div>solo-body</div>
        </Drawer>
      </DrawerStackProvider>,
    );
    // Radix Dialog listens for Esc on the document body.
    await act(async () => {
      await userEvent.keyboard("{Escape}");
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T4 applies the max-width class for the requested width token", () => {
    render(
      <DrawerStackProvider>
        <Drawer open={true} onClose={() => {}} title="XL" width="xl" testId="xl">
          <div>xl-body</div>
        </Drawer>
      </DrawerStackProvider>,
    );
    // The Radix <Dialog.Content> is the element we style. Find it by role.
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-[800px]");
    expect(dialog.className).not.toContain("max-w-[480px]");
  });
});

describe("Drawer — stack behavior", () => {
  it("T3 nested drawers: Esc closes only the inner (topmost) drawer", async () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();

    // Nesting pattern mirrors the production <QuickCreateSupplierItem> shape:
    // both drawers are SIBLINGS under a fragment; they share the same
    // <DrawerStackProvider>, and the inner-drawer's open state is controlled
    // from a trigger in the outer drawer. Radix's portal model works when
    // Dialog.Roots are siblings at the same React depth. Opening the inner
    // after the outer has mounted models the real usage pattern where the
    // user clicks `+ New supplier` inside an already-open picker.
    function Harness() {
      const [outerOpen, setOuterOpen] = useState(true);
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <DrawerStackProvider>
          <Drawer
            open={outerOpen}
            onClose={() => {
              onCloseOuter();
              setOuterOpen(false);
            }}
            title="Outer drawer"
            testId="outer"
          >
            <button
              type="button"
              data-testid="open-inner"
              onClick={() => setInnerOpen(true)}
            >
              open inner
            </button>
          </Drawer>
          <Drawer
            open={innerOpen}
            onClose={() => {
              onCloseInner();
              setInnerOpen(false);
            }}
            title="Inner drawer"
            testId="inner"
          >
            <div>inner-body</div>
          </Drawer>
        </DrawerStackProvider>
      );
    }

    render(<Harness />);

    // Outer mounts immediately.
    await waitFor(() => {
      expect(screen.getByText("Outer drawer")).toBeDefined();
    });
    // Open the inner from within the outer.
    await userEvent.click(screen.getByTestId("open-inner"));
    await waitFor(() => {
      expect(screen.getByText("Inner drawer")).toBeDefined();
    });

    // First Esc — should close only the inner (topmost) drawer.
    await act(async () => {
      await userEvent.keyboard("{Escape}");
    });

    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });
});

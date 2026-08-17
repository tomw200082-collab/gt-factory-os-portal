import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useOutcomeCapture } from "@/app/(sales)/_lib/useOutcomeCapture";

function Probe() {
  const { pending, arm, clear, dismiss } = useOutcomeCapture();
  return (
    <div>
      <span data-testid="pending">{pending ? `${pending.leadId}:${pending.channel}` : "none"}</span>
      <button onClick={() => arm("L1", "call")}>arm</button>
      <button onClick={() => clear()}>clear</button>
      <button onClick={() => dismiss()}>dismiss</button>
    </div>
  );
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

/** A real trip away and back. */
function returnToApp() {
  act(() => {
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("outcome capture", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    // The real guard ignores a return inside five seconds; tests do not wait.
    window.__GT_SALES_OUTCOME_DELAY_MS__ = 0;
  });

  afterEach(() => {
    cleanup();
    delete window.__GT_SALES_OUTCOME_DELAY_MS__;
  });

  it("owes an outcome once the user comes back from the dialler", () => {
    render(<Probe />);
    expect(screen.getByTestId("pending").textContent).toBe("none");

    act(() => screen.getByText("arm").click());
    returnToApp();

    expect(screen.getByTestId("pending").textContent).toBe("L1:call");
  });

  it("clears only when an outcome is captured", () => {
    render(<Probe />);
    act(() => screen.getByText("arm").click());
    returnToApp();
    expect(screen.getByTestId("pending").textContent).toBe("L1:call");

    act(() => screen.getByText("clear").click());
    expect(screen.getByTestId("pending").textContent).toBe("none");
    expect(window.sessionStorage.getItem("gt.sales.outreach")).toBeNull();
  });

  it("survives a reload — the intent is still owed on mount", () => {
    window.sessionStorage.setItem(
      "gt.sales.outreach",
      JSON.stringify({ leadId: "L9", channel: "whatsapp", at: Date.now() - 10_000 }),
    );
    render(<Probe />);
    expect(screen.getByTestId("pending").textContent).toBe("L9:whatsapp");
  });

  it("ignores a bounce off the user's own screen", () => {
    window.__GT_SALES_OUTCOME_DELAY_MS__ = 5_000;
    render(<Probe />);
    act(() => screen.getByText("arm").click());
    returnToApp();
    expect(screen.getByTestId("pending").textContent).toBe("none");
  });

  it("asks again on the next trip back after a dismissal", () => {
    render(<Probe />);
    act(() => screen.getByText("arm").click());
    returnToApp();
    expect(screen.getByTestId("pending").textContent).toBe("L1:call");

    act(() => screen.getByText("dismiss").click());
    expect(screen.getByTestId("pending").textContent).toBe("none");
    // Still owed — the intent stays in storage.
    expect(window.sessionStorage.getItem("gt.sales.outreach")).not.toBeNull();

    returnToApp();
    expect(screen.getByTestId("pending").textContent).toBe("L1:call");
  });

  it("does not spring back on an ordinary focus after being dismissed", () => {
    render(<Probe />);
    act(() => screen.getByText("arm").click());
    returnToApp();
    act(() => screen.getByText("dismiss").click());

    // A click anywhere in the page can raise a window focus event; that is not
    // a return to the app and must not re-open the sheet.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("pending").textContent).toBe("none");
  });

  it("ignores a corrupt stored intent instead of throwing", () => {
    window.sessionStorage.setItem("gt.sales.outreach", "{not json");
    render(<Probe />);
    expect(screen.getByTestId("pending").textContent).toBe("none");
  });
});

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRowVisibility } from "./useRowVisibility";

describe("useRowVisibility", () => {
  it("hide adds, restore removes, showAll clears", () => {
    const { result } = renderHook(() => useRowVisibility());
    act(() => result.current.hide("a"));
    act(() => result.current.hide("b"));
    expect(result.current.hiddenCount).toBe(2);
    expect(result.current.isHidden("a")).toBe(true);

    act(() => result.current.restore("a"));
    expect(result.current.isHidden("a")).toBe(false);
    expect(result.current.hiddenCount).toBe(1);

    act(() => result.current.showAll());
    expect(result.current.hiddenCount).toBe(0);
  });

  it("focus flow: enter, select keepers, confirm hides the rest and exits", () => {
    const { result } = renderHook(() => useRowVisibility());
    act(() => result.current.enterFocus());
    expect(result.current.focusMode).toBe(true);

    act(() => result.current.toggleSelect("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    act(() => result.current.confirmFocus(["a", "b", "c"]));
    expect(result.current.focusMode).toBe(false);
    expect(result.current.isHidden("a")).toBe(false); // kept
    expect(result.current.isHidden("b")).toBe(true); // hidden
    expect(result.current.isHidden("c")).toBe(true);
    expect(result.current.selectedCount).toBe(0); // cleared
  });

  it("cancelFocus exits without hiding anything", () => {
    const { result } = renderHook(() => useRowVisibility());
    act(() => result.current.enterFocus());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.cancelFocus());
    expect(result.current.focusMode).toBe(false);
    expect(result.current.hiddenCount).toBe(0);
    expect(result.current.selectedCount).toBe(0);
  });

  it("toggleSelect is idempotent off-on-off", () => {
    const { result } = renderHook(() => useRowVisibility());
    act(() => result.current.enterFocus());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.toggleSelect("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });
});

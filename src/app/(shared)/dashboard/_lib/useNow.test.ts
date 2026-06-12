// Tranche 059 (DASH-T1) — useNow shared ticker.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import { useNow, NOW_TICK_MS } from "./useNow";

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("returns the current time on first render", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current.toISOString()).toBe("2026-06-12T08:00:00.000Z");
  });

  it("advances on each tick", () => {
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(NOW_TICK_MS);
    });
    expect(result.current.getTime()).toBe(
      new Date("2026-06-12T08:00:00.000Z").getTime() + NOW_TICK_MS,
    );
  });

  it("shares one interval across multiple subscribers", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    expect(spy).toHaveBeenCalledTimes(1);
    a.unmount();
    b.unmount();
    spy.mockRestore();
  });

  it("clears the interval when the last subscriber unmounts", () => {
    const spy = vi.spyOn(globalThis, "clearInterval");
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    a.unmount();
    expect(spy).not.toHaveBeenCalled();
    b.unmount();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("skips beats while the tab is hidden and catches up on return", () => {
    const { result } = renderHook(() => useNow());
    const t0 = result.current.getTime();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    act(() => {
      vi.advanceTimersByTime(NOW_TICK_MS * 3);
    });
    // Hidden: no beats delivered.
    expect(result.current.getTime()).toBe(t0);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Catch-up tick delivers the real elapsed time immediately.
    expect(result.current.getTime()).toBe(t0 + NOW_TICK_MS * 3);
  });
});

"use client";

// Tap tooltips for the report's charts. The Artifact's tooltips opened on hover only, which a
// phone does not have. Here a touch or a click chooses a point, a drag along the chart scrubs
// through points, the arrow keys step through them, and the tip closes on a tap outside the chart
// or on Escape. A mouse passing over lights a point without choosing it.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";

export interface ChartTipBind {
  tabIndex: 0;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/** `ref` is the chart's wrapper (the caller measures it too); `locate` turns an x within it into a point index. */
export function useChartTip(ref: RefObject<HTMLDivElement>, count: number, locate: (x: number) => number) {
  const [active, setActive] = useState<number | null>(null);
  const pressed = useRef(false);

  // an outside tap or Escape closes it
  useEffect(() => {
    if (active === null) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, ref]);

  // a finger lifted ends the scrub; the tip stays until an outside tap
  useEffect(() => {
    const up = () => {
      pressed.current = false;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    return Math.min(count - 1, Math.max(0, locate(e.clientX - box.left)));
  };

  const bind: ChartTipBind = {
    tabIndex: 0,
    onPointerDown: (e) => {
      pressed.current = true;
      const i = at(e);
      if (i !== null) setActive(i);
    },
    onPointerMove: (e) => {
      // a mouse lights what it passes over; a finger only scrubs while it is down
      if (e.pointerType === "mouse" || pressed.current) {
        const i = at(e);
        if (i !== null) setActive(i);
      }
    },
    onPointerLeave: (e) => {
      pressed.current = false;
      if (e.pointerType === "mouse") setActive(null);
    },
    onKeyDown: (e) => {
      if (e.key === "Escape") return setActive(null);
      const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (step) {
        e.preventDefault();
        setActive((cur) => Math.min(count - 1, Math.max(0, (cur ?? (step > 0 ? -1 : count)) + step)));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActive(count - 1);
      }
    },
  };

  return { active, setActive, bind };
}

/** The tooltip card: centred on `x` and kept inside the chart's width. */
export function ChartTip({ x, width, top = 4, children }: { x: number; width: number; top?: number; children: ReactNode }) {
  const half = 90;
  const left = Math.min(Math.max(x, half), Math.max(half, width - half));
  return (
    <div className="s-rp-tip" role="status" aria-live="polite" data-testid="report-tip" style={{ left, top, transform: "translateX(-50%)" }}>
      {children}
    </div>
  );
}

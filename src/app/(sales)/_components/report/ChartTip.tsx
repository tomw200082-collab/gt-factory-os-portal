"use client";

// Tap tooltips for the report's charts. The Artifact's tooltips opened on hover only, which a phone does
// not have. Here a click or a still tap chooses a point, a drag along the chart scrubs through points, the
// arrow keys step through them, and the tip closes on a tap outside the chart, on Escape, or when focus
// leaves the chart. A page swipe that happens to start on the chart (the browser takes the gesture and
// cancels the pointer) opens nothing. A mouse passing over lights a point without choosing it.
//
// The tip text lives in a live region that is always mounted: a region added together with its text is
// often not announced.

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";

export interface ChartTipBind {
  tabIndex: 0;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onPointerLeave: (e: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onBlur: (e: FocusEvent<HTMLDivElement>) => void;
}

const MOVE_SLOP = 8;

/** `ref` is the chart's wrapper (the caller measures it too); `locate` turns an x within it into a point index; `resetKey` closes the tip when what the chart shows changes. */
export function useChartTip(ref: RefObject<HTMLDivElement>, count: number, locate: (x: number) => number, resetKey?: unknown) {
  const [active, setActive] = useState<number | null>(null);
  const press = useRef<{ x: number; y: number; scrubbing: boolean } | null>(null);

  useEffect(() => setActive(null), [count, resetKey]);

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

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    return Math.min(count - 1, Math.max(0, locate(e.clientX - box.left)));
  };

  const bind: ChartTipBind = {
    tabIndex: 0,
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") {
        const i = at(e);
        if (i !== null) setActive(i);
        return;
      }
      press.current = { x: e.clientX, y: e.clientY, scrubbing: false };
    },
    onPointerMove: (e) => {
      if (e.pointerType === "mouse") {
        const i = at(e);
        if (i !== null) setActive(i);
        return;
      }
      const p = press.current;
      if (!p) return;
      if (!p.scrubbing && Math.abs(e.clientX - p.x) > MOVE_SLOP && Math.abs(e.clientX - p.x) > Math.abs(e.clientY - p.y)) p.scrubbing = true;
      if (p.scrubbing) {
        const i = at(e);
        if (i !== null) setActive(i);
      }
    },
    onPointerUp: (e) => {
      const p = press.current;
      press.current = null;
      if (e.pointerType === "mouse" || !p || p.scrubbing) return;
      // a still tap chooses a point; a finger that travelled was a swipe
      if (Math.abs(e.clientX - p.x) <= MOVE_SLOP && Math.abs(e.clientY - p.y) <= MOVE_SLOP) {
        const i = at(e);
        if (i !== null) setActive(i);
      }
    },
    onPointerCancel: () => {
      press.current = null;
    },
    onPointerLeave: (e) => {
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
    onBlur: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
    },
  };

  return { active, setActive, bind };
}

/**
 * The tooltip card: centred on `x` and kept inside the chart's width. Always mounted, empty and invisible
 * until `show`, so a screen reader hears the text arrive.
 */
export function ChartTip({ show, x, width, top = 4, children }: { show: boolean; x: number; width: number; top?: number; children?: ReactNode }) {
  const half = 90;
  const left = Math.min(Math.max(x, half), Math.max(half, width - half));
  return (
    <div
      className={show ? "s-rp-tip" : "sr-only"}
      role="status"
      aria-live="polite"
      data-testid={show ? "report-tip" : undefined}
      style={show ? { left, top, transform: "translateX(-50%)" } : undefined}
    >
      {show ? children : null}
    </div>
  );
}

/** What a screen reader hears when the chart takes focus. */
export function ChartKeysHint({ id, text }: { id: string; text: string }) {
  return (
    <span id={id} className="sr-only">
      {text}
    </span>
  );
}

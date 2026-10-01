"use client";

// GT Pulse D1 hero: where the open leads stand now, as one lit path that ends
// in the business circle (program spec §8). Counts come from the lead rows the
// screen already holds. Motion plays on load and when a count really moves;
// under reduced motion the same picture stands still.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { UI } from "../_lib/labels";
import { MILESTONE_NAMES, flowCounts, type FlowRow, type RailKind } from "../_lib/leadMilestones";

const STAGES: RailKind[] = ["created", "outreach", "next_action", "converted"];
/** Height of the orb row; the river runs through the orbs' centres. */
const RIVER_H = 56;

/** One wave through four orb centres, first stage at the inline start (RTL: right). */
function riverPath(width: number): string {
  const step = width / 4;
  const cy = RIVER_H / 2;
  const lift = RIVER_H * 0.34;
  const xs = [0, 1, 2, 3].map((i) => width - (i + 0.5) * step);
  let d = `M${xs[0]} ${cy}`;
  for (let i = 1; i < xs.length; i++) {
    const y = cy + (i % 2 ? -lift : lift);
    d += ` C${xs[i - 1] - step / 2} ${y} ${xs[i] + step / 2} ${y} ${xs[i]} ${cy}`;
  }
  return d;
}

function animates(): boolean {
  return typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" &&
    window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches === true;
}

/** The number counts up to its value; React does not own this text node. */
function Count({ value }: { value: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === null) {
      el.textContent = "";
      return;
    }
    const from = shown.current;
    shown.current = value;
    if (from === value || !animates()) {
      el.textContent = String(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 760);
      el.textContent = String(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(value);
    };
  }, [value]);
  // The rolling digits are for the eye; assistive technology reads the final
  // value only, never an intermediate frame (UX gate COPY-001).
  return (
    <>
      <span ref={ref} className="s-flow-count s-nums" aria-hidden="true" />
      <span className="sr-only">{value ?? ""}</span>
    </>
  );
}

function Stage({ kind, name, count, index }: { kind: RailKind; name: string; count: number | null; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const previous = useRef<number | null>(null);
  // A pulse means a lead really arrived here since the last read; the first
  // load is not news.
  useEffect(() => {
    const before = previous.current;
    previous.current = count;
    const el = ref.current;
    if (!el || before === null || count === null || count <= before) return;
    el.setAttribute("data-bump", "");
    const timer = setTimeout(() => el.removeAttribute("data-bump"), 1200);
    return () => {
      clearTimeout(timer);
      el.removeAttribute("data-bump");
    };
  }, [count]);
  return (
    <li ref={ref} data-testid={`flow-${kind}`} className={`s-flow-stage s-flow-${kind}`}
      style={{ "--i": index } as CSSProperties}>
      <span className="s-flow-orb"><Count value={count} /></span>
      <span className="s-flow-label">{name}</span>
    </li>
  );
}

export function JourneyFlow({ rows }: { rows: FlowRow[] | undefined }) {
  const counts = useMemo(() => (rows ? flowCounts(rows) : null), [rows]);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(200, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const d = useMemo(() => riverPath(width), [width]);

  return (
    <div ref={wrap} className="s-flow" data-testid="journey-flow" data-ready={counts ? "true" : "false"}>
      <p className="s-flow-caption">{UI.flowScope}</p>
      <div className="s-flow-body">
      <svg className="s-flow-river" width={width} height={RIVER_H} viewBox={`0 0 ${width} ${RIVER_H}`}
        aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="s-flow-ink" gradientUnits="userSpaceOnUse" x1={width} y1="0" x2="0" y2="0">
            <stop offset="0" style={{ stopColor: "hsl(var(--s-flow-created))" }} />
            <stop offset="0.62" style={{ stopColor: "hsl(var(--s-action))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--s-flow-converted))" }} />
          </linearGradient>
        </defs>
        <path className="s-flow-track" d={d} pathLength={100} />
        <path className="s-flow-lit" d={d} pathLength={100} stroke="url(#s-flow-ink)" />
        <path className="s-flow-comet" d={d} pathLength={100} />
        <path className="s-flow-comet s-flow-comet-late" d={d} pathLength={100} />
      </svg>
      <ol className="s-flow-stages" aria-label={UI.railTitle}>
        {STAGES.map((kind, index) => (
          <Stage key={kind} kind={kind} name={MILESTONE_NAMES[kind]} count={counts ? counts[kind] : null} index={index} />
        ))}
      </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CountUp — animated counter for KPI tile values. Rolls from 0 to the
// target on FIRST paint only ("instrument cluster waking up"). Subsequent
// value changes tween from the previously displayed number to the new one
// (Tranche 059, DASH-T2) — with 60s auto-refresh, restarting from 0 made
// every change look like the data crashed and recovered.
//
// Why a wrapper around a string? KPI values come pre-formatted from the
// page (e.g. "₪ 145,250") because formatting is locale-aware and currency-
// aware. We parse the leading number out of the string, animate it, and
// re-emit the value using the same prefix/suffix scheme so the visual
// matches the final state exactly.
//
// Honest about missing data: if the input is null or "—", we render the
// dash as-is — never invent a fake "0" count-up.
//
// Reduced-motion safe: if the user prefers reduced motion, we render the
// final value directly with no animation.
// ---------------------------------------------------------------------------
"use client";

import { useEffect, useRef, useState } from "react";

export interface CountUpProps {
  /** The fully formatted target value (e.g. "₪ 145,250", "12", "—"). */
  value: string | null;
  /** First-paint animation duration in milliseconds (0 → value). */
  durationMs?: number;
  /** Optional className passed through to the wrapper span. */
  className?: string;
}

// Subsequent changes (previous → new) use a shorter tween: the number is
// already on screen, so the motion only needs to signal "this updated".
const CHANGE_DURATION_MS = 300;

function parseFormatted(value: string): {
  prefix: string;
  number: number | null;
  suffix: string;
  /** True if the original string contained any digits — when false we
   *  treat the whole string as static text (e.g. "—"). */
  hasNumber: boolean;
  /** Decimal places preserved so the animation re-formats consistently. */
  decimals: number;
  /** Whether the number uses thousands separators. */
  useThousands: boolean;
  /** Detected locale used for re-formatting during the tween. */
  locale: string;
} {
  // Find the first run of digits-and-separators in the string. Anything
  // before is the prefix (e.g. "₪ "), anything after is the suffix
  // (e.g. " late" — rare in our use, but supported).
  const m = value.match(/-?[\d.,]+/);
  if (!m || m.index === undefined) {
    return {
      prefix: value,
      number: null,
      suffix: "",
      hasNumber: false,
      decimals: 0,
      useThousands: false,
      locale: "en-US",
    };
  }
  const raw = m[0];
  const prefix = value.slice(0, m.index);
  const suffix = value.slice(m.index + raw.length);

  // Try parsing as Hebrew locale (he-IL uses , for grouping like en-US
  // — Intl.NumberFormat normalises this so a simple strip is fine).
  const stripped = raw.replace(/,/g, "");
  const parsed = Number(stripped);
  if (!Number.isFinite(parsed)) {
    return {
      prefix: value,
      number: null,
      suffix: "",
      hasNumber: false,
      decimals: 0,
      useThousands: false,
      locale: "en-US",
    };
  }
  const dotIdx = stripped.indexOf(".");
  const decimals = dotIdx >= 0 ? stripped.length - dotIdx - 1 : 0;
  return {
    prefix,
    number: parsed,
    suffix,
    hasNumber: true,
    decimals,
    useThousands: raw.includes(","),
    locale: "he-IL",
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUp({ value, durationMs = 800, className }: CountUpProps) {
  // Honest fallback for null / dash values — render unchanged.
  const passthrough = value == null || value === "—" || value === "";
  const target = value ?? "—";

  const parsed = passthrough ? null : parseFormatted(target);
  const finalNumber = parsed?.hasNumber ? parsed.number : null;

  const reducedMotion = useRef(false);
  const [displayed, setDisplayed] = useState<string>(
    finalNumber !== null ? formatPart(parsed!, 0) : target,
  );

  // Track the last target so we don't restart the animation on every
  // unrelated re-render — only when the value itself changes.
  const lastTargetRef = useRef<string | null>(null);

  // The number currently visible on screen (updated every animation frame).
  // null until the first numeric value has been shown — that distinction is
  // what separates the first-paint 0→value roll from the prev→new tween.
  const shownNumberRef = useRef<number | null>(null);

  useEffect(() => {
    // Detect reduced motion once on mount.
    if (typeof window !== "undefined" && window.matchMedia) {
      reducedMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
  }, []);

  useEffect(() => {
    // Re-parse inside the effect so the dependency list stays primitive.
    // (Depending on the render-scope `parsed` object — a fresh identity every
    // render — made this effect re-run on every render, and its cleanup
    // cancelled the in-flight animation frame chain.)
    const p = passthrough ? null : parseFormatted(target);
    const endValue = p?.hasNumber ? p.number : null;

    // No-op when there's no numeric value or when target hasn't changed.
    if (passthrough || endValue === null || !p) {
      setDisplayed(target);
      lastTargetRef.current = target;
      shownNumberRef.current = null;
      return;
    }
    if (lastTargetRef.current === target) return;
    lastTargetRef.current = target;

    if (reducedMotion.current) {
      setDisplayed(target);
      shownNumberRef.current = endValue;
      return;
    }

    // DASH-T2: first paint rolls 0 → value; later changes tween from the
    // number currently on screen so an updated KPI never "crashes to 0".
    const isFirstPaint = shownNumberRef.current === null;
    const startValue = isFirstPaint ? 0 : shownNumberRef.current!;
    const tweenMs = isFirstPaint ? durationMs : CHANGE_DURATION_MS;
    const end: number = endValue;

    let raf = 0;
    const startTs = performance.now();

    function tick(ts: number) {
      const elapsed = ts - startTs;
      const t = Math.min(1, elapsed / tweenMs);
      const eased = easeOutCubic(t);
      const current = startValue + (end - startValue) * eased;
      shownNumberRef.current = current;
      setDisplayed(formatPart(p!, current));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // Snap exactly to the final formatted string for pixel-perfect
        // visual continuity with subsequent renders.
        shownNumberRef.current = end;
        setDisplayed(target);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // StrictMode-safe: dev double-invokes effects (mount → cleanup →
      // mount). If this cleanup interrupted an unfinished tween, clear the
      // target guard so the re-run restarts the animation instead of
      // early-returning and freezing the value at its first frame.
      if (shownNumberRef.current !== end) lastTargetRef.current = null;
    };
  }, [target, passthrough, durationMs]);

  return <span className={className}>{displayed}</span>;
}

function formatPart(
  parsed: NonNullable<ReturnType<typeof parseFormatted>>,
  n: number,
): string {
  const rounded =
    parsed.decimals > 0
      ? n.toFixed(parsed.decimals)
      : String(Math.round(n));
  const formatted = parsed.useThousands
    ? Number(rounded).toLocaleString(parsed.locale, {
        maximumFractionDigits: parsed.decimals,
        minimumFractionDigits: parsed.decimals,
      })
    : rounded;
  return `${parsed.prefix}${formatted}${parsed.suffix}`;
}

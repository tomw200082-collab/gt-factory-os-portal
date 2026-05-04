"use client";

// ---------------------------------------------------------------------------
// HeroBar — DEPRECATED. Replaced by InsightsHero (Operational Clarity
// redesign 2026-05-04). Kept as a thin shim that forwards to InsightsHero
// with an empty items[] (so callers still see banners disabled but don't
// hard-crash).
//
// Prefer importing { InsightsHero } from "./InsightsHero" directly.
// ---------------------------------------------------------------------------

import { InsightsHero } from "./InsightsHero";
import type { FlowSummary } from "../_lib/types";

interface HeroBarProps {
  summary: FlowSummary | null;
  isLoading: boolean;
}

export function HeroBar({ summary, isLoading }: HeroBarProps) {
  return <InsightsHero items={[]} summary={summary} isLoading={isLoading} />;
}

// Contract test for the sales token layer.
//
// The sales workspace carries its own visual identity without touching the
// factory portal's. That only holds if every rule stays scoped to
// [data-app="sales"], so this reads the stylesheet as text and enforces the
// boundary — the same idiom tests/unit/globals-css-mobile-zoom.test.ts uses for
// the iOS zoom floor.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CSS_PATH = path.join(process.cwd(), "src/app/(sales)/sales-tokens.css");
const css = fs.readFileSync(CSS_PATH, "utf8");

/** Drop @keyframes bodies: `from`/`to`/`50%` are steps, not selectors. */
function withoutKeyframes(source: string): string {
  return source.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
}

/** Selector lines, i.e. everything before an opening brace. */
function selectors(source: string): string[] {
  return [...withoutKeyframes(source).matchAll(/(^|\})\s*([^{}@/]+)\{/g)]
    .map((m) => m[2].trim())
    .filter((s) => s.length > 0 && !s.startsWith("*"));
}

describe("sales tokens", () => {
  it("scopes every selector to the sales app", () => {
    const escapees = selectors(css).filter((s) => !s.includes('[data-app="sales"]'));
    expect(escapees).toEqual([]);
  });

  it("never redefines a portal-wide token", () => {
    // The factory portal's variables are bare names (--bg, --fg, --accent…).
    // Sales variables are prefixed --s-* so the two can never collide.
    const declared = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]);
    const unprefixed = declared.filter((name) => !name.startsWith("--s-"));
    expect(unprefixed).toEqual([]);
  });

  it("uses logical properties only — the workspace is RTL", () => {
    const physical = [
      /(^|[\s;{])left\s*:/i,
      /(^|[\s;{])right\s*:/i,
      /margin-left\s*:/i,
      /margin-right\s*:/i,
      /padding-left\s*:/i,
      /padding-right\s*:/i,
      /border-left\s*:/i,
      /border-right\s*:/i,
    ];
    const found = physical.filter((re) => re.test(css)).map((re) => re.source);
    expect(found).toEqual([]);
  });

  it("defines the status and SLA colours that carry the meaning", () => {
    for (const token of [
      "--s-status-new",
      "--s-status-working",
      "--s-status-won",
      "--s-status-lost",
      "--s-sla-ok",
      "--s-sla-overdue",
      "--s-accent",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("sets tabular numerals for the number and date columns", () => {
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("keeps a dark-theme block so the portal's toggle cannot break the surface", () => {
    expect(css).toMatch(/:root\.dark\s*\[data-app="sales"\]/);
  });

  it("declares colours as bare HSL triplets, matching the portal's convention", () => {
    const accent = css.match(/--s-accent:\s*([^;]+);/);
    expect(accent).not.toBeNull();
    expect(accent?.[1].trim()).toMatch(/^\d+ \d+% \d+%$/);
  });
});

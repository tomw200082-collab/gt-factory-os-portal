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

  it("remaps both halves of every colour pair in dark mode", () => {
    // Re-tinting the -soft fills while leaving foregrounds tuned for a
    // near-white background is what makes a dark theme unreadable. If a fill
    // is overridden, its ink must be overridden with it.
    const missing = Object.keys(DARK)
      .filter((token) => token.endsWith("-soft"))
      .map((token) => token.replace(/-soft$/, ""))
      .filter((ink) => LIGHT[ink] !== undefined && DARK[ink] === undefined);
    expect(missing).toEqual([]);
  });
});

// --- contrast ---------------------------------------------------------------
//
// Colour is the only channel carrying status and SLA meaning here, so a pill
// that fails contrast is a pill that has stopped communicating. These pairs are
// solved values, not eyeballed ones; the thresholds are WCAG 2.1 AA (1.4.3 for
// text, 1.4.11 for the boundary of anything you can type in or press).

/** One `{ --token: value }` block, by its opening selector. */
function tokenBlock(pattern: RegExp): Record<string, string> {
  const body = css.match(pattern)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/(--s-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const LIGHT = tokenBlock(/\[data-app="sales"\]\s*\{([\s\S]*?)\n\}/);
const DARK = { ...LIGHT, ...tokenBlock(/:root\.dark \[data-app="sales"\]\s*\{([\s\S]*?)\n\}/) };

function relativeLuminance(hsl: string): number {
  const [h, s, l] = hsl.split(/\s+/).map(parseFloat);
  const [S, L] = [s / 100, l / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const channel = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [channel(0), channel(8), channel(4)]
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(fg: string, bg: string): number {
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** [label, ink token, ground token, minimum ratio] */
const PAIRS: Array<[string, string, string, number]> = [
  ["body text on a card", "--s-fg", "--s-surface", 4.5],
  ["body text on the page", "--s-fg", "--s-bg", 4.5],
  ["muted text on a card", "--s-fg-muted", "--s-surface", 4.5],
  ["muted text on the page", "--s-fg-muted", "--s-bg", 4.5],
  ["customer badge", "--s-fg-muted", "--s-surface-sunken", 4.5],
  // The returning-customer card is tinted, so its text sits on accent-soft.
  ["returning card: body", "--s-fg", "--s-accent-soft", 4.5],
  ["returning card: meta", "--s-fg-muted", "--s-accent-soft", 4.5],
  ["faint text and placeholders", "--s-fg-faint", "--s-surface", 4.5],
  // Faint ink is used at 12px on all three grounds; testing only the white one
  // let it ship at 4.28:1 on the sunken surface.
  ["faint text on the page", "--s-fg-faint", "--s-bg", 4.5],
  ["faint text on sunken", "--s-fg-faint", "--s-surface-sunken", 4.5],
  ["status pill: new", "--s-status-new", "--s-status-new-soft", 4.5],
  ["status pill: working", "--s-status-working", "--s-status-working-soft", 4.5],
  ["status pill: won", "--s-status-won", "--s-status-won-soft", 4.5],
  ["status pill: lost", "--s-status-lost", "--s-status-lost-soft", 4.5],
  ["SLA badge: within", "--s-sla-ok", "--s-sla-ok-soft", 4.5],
  // Its own red, so a clock and a decision stop looking like the same thing.
  // Held to the same 4.5:1 as everything else that carries meaning.
  ["quiet danger button", "--s-danger-quiet", "--s-surface", 4.5],
  ["quiet danger button on the page", "--s-danger-quiet", "--s-bg", 4.5],
  ["SLA badge: overdue", "--s-sla-overdue", "--s-sla-overdue-soft", 4.5],
  ["primary action label", "--s-accent-fg", "--s-accent", 4.5],
  ["ghost button label", "--s-fg", "--s-surface", 4.5],
  // 1.4.11: non-text contrast for controls and focus indication.
  ["focus ring against a card", "--s-accent", "--s-surface", 3],
  ["focus ring against the page", "--s-accent", "--s-bg", 3],
  ["field boundary against its fill", "--s-border-field", "--s-surface", 3],
  ["field boundary against the page", "--s-border-field", "--s-bg", 3],
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme meets WCAG AA", (_theme, tokens) => {
  it.each(PAIRS)("%s", (_label, ink, ground, minimum) => {
    expect(tokens[ink], ink).toBeDefined();
    expect(tokens[ground], ground).toBeDefined();
    expect(contrast(tokens[ink], tokens[ground])).toBeGreaterThanOrEqual(minimum);
  });
});

// The audit found muted and faint three percentage points of lightness apart,
// which is invisible at 13px on a phone: the three-tier hierarchy collapsed to
// two. Widening it by lightening `faint` would have dropped that tier under
// 4.5:1, so the gap opens upward instead — and this pins both halves of that
// decision, because the tempting fix is the one that spends contrast.
describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme keeps three legible ink tiers", (_theme, tokens) => {
  it("separates muted from faint by enough to see", () => {
    const muted = contrast(tokens["--s-fg-muted"], tokens["--s-surface"]);
    const faint = contrast(tokens["--s-fg-faint"], tokens["--s-surface"]);
    expect(muted / faint).toBeGreaterThanOrEqual(1.3);
  });

  it("never buys that separation by dropping a tier below AA", () => {
    for (const token of ["--s-fg", "--s-fg-muted", "--s-fg-faint"]) {
      expect(contrast(tokens[token], tokens["--s-surface"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

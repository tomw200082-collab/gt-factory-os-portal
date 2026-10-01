import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Every text/background pair the D1 palette introduces must clear WCAG AA (4.5:1),
// in light and dark. Values are read from the stylesheet so the test cannot drift.
const css = readFileSync("src/app/(sales)/sales-tokens.css", "utf8");
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}
function token(scope: string, name: string): [number, number, number] {
  const m = block(scope).match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!m) throw new Error(`missing --${name} in ${scope}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function luminance([h, s, l]: [number, number, number]): number {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

function rgb([h, s, l]: [number, number, number]): [number, number, number] {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
/** `top` at `alpha` over `base`, returned as HSL so ratio() can take it. */
function blend(base: [number, number, number], top: [number, number, number], alpha: number): [number, number, number] {
  const [r, g, b] = rgb(base).map((c, i) => c * (1 - alpha) + rgb(top)[i] * alpha);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const hue = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(hue + 360) % 360, sat * 100, l * 100];
}

describe("D1 palette contrast", () => {
  for (const scope of ['[data-app="sales"]', ':root.dark [data-app="sales"]']) {
    it(`action label on action fill, ${scope}`, () => {
      expect(ratio(token(scope, "s-action-fg"), token(scope, "s-action"))).toBeGreaterThanOrEqual(4.5);
    });
    it(`opening band text on petrol, ${scope}`, () => {
      expect(ratio(token(scope, "s-opening-fg"), token(scope, "s-petrol"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(scope, "s-opening-fg-muted"), token(scope, "s-petrol"))).toBeGreaterThanOrEqual(4.5);
    });
    it(`band text where the aurora is brightest, ${scope}`, () => {
      // Worst case the band can paint behind text: its lit corner with both
      // aurora inks at full strength over it. Read from the stylesheet.
      const band = block('[data-app="sales"] .s-opening');
      const aurora = block('[data-app="sales"] .s-opening::before');
      const c = band.match(/hsl\((\d+) (\d+)% (\d+)%\) 0%/)!;
      const corner: [number, number, number] = [Number(c[1]), Number(c[2]), Number(c[3])];
      const turquoise = Number(aurora.match(/--s-action\) \/ ([\d.]+)/)![1]);
      const blue = Number(aurora.match(/--s-flow-created\) \/ ([\d.]+)/)![1]);
      const peak = blend(blend(corner, token(scope, "s-action"), turquoise), token('[data-app="sales"]', "s-flow-created"), blue);
      expect(ratio(token(scope, "s-opening-fg"), peak)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(scope, "s-opening-fg-muted"), peak)).toBeGreaterThanOrEqual(4.5);
    });
    it(`lead blue and order green text on surface, ${scope}`, () => {
      expect(ratio(token(scope, "s-status-new"), token(scope, "s-surface"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(scope, "s-status-won"), token(scope, "s-surface"))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

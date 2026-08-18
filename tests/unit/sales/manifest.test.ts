import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public/sales-manifest.webmanifest"), "utf8"),
) as {
  name: string;
  start_url: string;
  scope: string;
  display: string;
  dir: string;
  lang: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
};

describe("sales PWA manifest", () => {
  it("installs as GT Sales and opens on the work queue", () => {
    expect(manifest.name).toBe("GT Sales");
    expect(manifest.start_url).toBe("/sales/today");
    expect(manifest.display).toBe("standalone");
  });

  it("scopes itself to /sales/ so the factory portal is unaffected", () => {
    expect(manifest.scope).toBe("/sales/");
  });

  it("declares Hebrew RTL", () => {
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("he");
  });

  it("ships every icon it references, at the size it claims", () => {
    for (const icon of manifest.icons) {
      const file = path.join(ROOT, "public", icon.src);
      expect(fs.existsSync(file), icon.src).toBe(true);
      const buf = fs.readFileSync(file);
      // PNG IHDR: width at byte 16, height at byte 20.
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });

  it("includes a maskable icon so Android does not letterbox it", () => {
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("ships the apple touch icon the layout points at", () => {
    const file = path.join(ROOT, "public/sales-icons/apple-touch-icon.png");
    expect(fs.existsSync(file)).toBe(true);
    const buf = fs.readFileSync(file);
    expect(buf.readUInt32BE(16)).toBe(180);
  });

  it("is linked from the sales layout only", () => {
    const layout = fs.readFileSync(path.join(ROOT, "src/app/(sales)/layout.tsx"), "utf8");
    expect(layout).toContain("/sales-manifest.webmanifest");
    const rootLayout = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
    expect(rootLayout).not.toContain("manifest");
  });
});

describe("per-route document titles", () => {
  // All four sales routes shipped one shared title, so a screen reader
  // announced no change on navigation (WCAG 2.4.2). The pages are client
  // components and cannot export metadata, so each segment carries a
  // title-only server layout — which is easy to delete by accident.
  const SEGMENTS = ["today", "leads", "orgs", "settings"] as const;

  it("gives every sales route its own title", () => {
    const titles = SEGMENTS.map((seg) => {
      const src = fs.readFileSync(
        path.join(process.cwd(), `src/app/(sales)/sales/${seg}/layout.tsx`),
        "utf8",
      );
      return src.match(/title:\s*"([^"]+)"/)?.[1];
    });

    expect(titles.every(Boolean), `missing title: ${titles}`).toBe(true);
    expect(new Set(titles).size).toBe(SEGMENTS.length);
  });
});

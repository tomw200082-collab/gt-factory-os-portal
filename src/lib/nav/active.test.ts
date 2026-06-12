import { describe, expect, it } from "vitest";

import { activeNavLabel, findActiveNavEntry } from "./active";

describe("findActiveNavEntry", () => {
  it("returns null for null pathname", () => {
    expect(findActiveNavEntry(null)).toBeNull();
  });

  it("returns null for pathnames outside the manifest", () => {
    expect(findActiveNavEntry("/login")).toBeNull();
    expect(findActiveNavEntry("/auth/signout")).toBeNull();
  });

  it("matches an exact href", () => {
    const entry = findActiveNavEntry("/dashboard");
    expect(entry?.item.href).toBe("/dashboard");
    expect(entry?.group.title).toBe("Overview");
  });

  it("matches a path-segment child", () => {
    const entry = findActiveNavEntry("/inventory/ITEM-1");
    expect(entry?.item.href).toBe("/inventory");
  });

  it("does NOT match a sibling that merely shares a string prefix", () => {
    // /inventory must not claim /inventory-flow-style siblings; the planning
    // flow page lives under /planning/inventory-flow and owns itself.
    const entry = findActiveNavEntry("/planning/inventory-flow");
    expect(entry?.item.href).toBe("/planning/inventory-flow");
  });

  it("prefers the longest matching href when entries nest", () => {
    expect(findActiveNavEntry("/planning")?.item.href).toBe("/planning");
    expect(findActiveNavEntry("/planning/production-plan")?.item.href).toBe(
      "/planning/production-plan",
    );
    expect(
      findActiveNavEntry("/planning/production-plan/some-child")?.item.href,
    ).toBe("/planning/production-plan");
  });
});

describe("activeNavLabel", () => {
  it("returns the manifest label for owned pathnames", () => {
    expect(activeNavLabel("/dashboard")).toBe("Dashboard");
    expect(activeNavLabel("/planning/procurement")).toBe("Procurement");
  });

  it("returns null when nothing owns the pathname", () => {
    expect(activeNavLabel("/definitely-not-a-route")).toBeNull();
  });
});

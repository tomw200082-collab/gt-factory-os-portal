// One GT loading system, two environments. The Sales workspace (GT Pulse) lives
// under /sales/*; everything else is the factory portal. A pure path rule, so
// the loader can pick its world from a destination before it is rendered.

export type LoaderVariant = "factory" | "sales";

export function loaderVariantFor(path: string): LoaderVariant {
  const bare = path.split(/[?#]/, 1)[0];
  return bare === "/sales" || bare.startsWith("/sales/") ? "sales" : "factory";
}

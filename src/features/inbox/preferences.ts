// ---------------------------------------------------------------------------
// Inbox preferences — small localStorage helper for view/sort/density.
//
// Per-user UI preferences that survive page reloads. URL params still win on
// first mount (deep links remain shareable); localStorage is the fallback
// when no URL param is present.
// ---------------------------------------------------------------------------

import type { InboxSort, InboxView } from "./types";

const KEY = "inbox.prefs.v1";

export type InboxDensity = "comfortable" | "cozy" | "compact";

export interface InboxPrefs {
  view?: InboxView;
  sort?: InboxSort;
  density: InboxDensity;
  showZeroCounts: boolean;
  /** Whether the collapsed "System & diagnostics" section is expanded. */
  systemSectionOpen: boolean;
}

const DEFAULTS: InboxPrefs = {
  density: "cozy",
  showZeroCounts: false,
  systemSectionOpen: false,
};

export function readPrefs(): InboxPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<InboxPrefs>;
    return {
      view: parsed.view,
      sort: parsed.sort,
      density:
        parsed.density === "comfortable" ||
        parsed.density === "cozy" ||
        parsed.density === "compact"
          ? parsed.density
          : DEFAULTS.density,
      showZeroCounts: parsed.showZeroCounts === true,
      systemSectionOpen: parsed.systemSectionOpen === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writePrefs(patch: Partial<InboxPrefs>): void {
  if (typeof window === "undefined") return;
  try {
    const cur = readPrefs();
    const next: InboxPrefs = { ...cur, ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode etc.) — silently no-op.
  }
}

export function clearPrefs(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export const DENSITY_LABELS: Record<InboxDensity, string> = {
  comfortable: "Comfortable",
  cozy: "Cozy",
  compact: "Compact",
};

export function densityRowPaddingClass(d: InboxDensity): string {
  switch (d) {
    case "comfortable":
      return "px-5 py-5";
    case "compact":
      return "px-5 py-2.5";
    case "cozy":
    default:
      return "px-5 py-4";
  }
}

export function densityChipGapClass(d: InboxDensity): string {
  switch (d) {
    case "comfortable":
      return "gap-3";
    case "compact":
      return "gap-1.5";
    case "cozy":
    default:
      return "gap-2";
  }
}

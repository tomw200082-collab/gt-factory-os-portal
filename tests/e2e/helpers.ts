import type { Page } from "@playwright/test";

/**
 * Set the fake-session role in localStorage before the app reads it.
 *
 * The app's `SessionProvider` hydrates from `localStorage['gt.fakeauth.v1']`
 * on mount. Setting the key via `page.addInitScript` ensures the value is
 * present before React's first render, so we don't have to race the
 * top-bar role switcher.
 */
export async function setFakeRole(
  page: Page,
  role: "operator" | "planner" | "admin" | "viewer"
): Promise<void> {
  const sessions: Record<typeof role, unknown> = {
    operator: {
      user_id: "u_op_01",
      display_name: "Avi (operator)",
      email: "operator@fake.gtfactory",
      role: "operator",
    },
    planner: {
      user_id: "u_pl_01",
      display_name: "Tom (planner)",
      email: "planner@fake.gtfactory",
      role: "planner",
    },
    admin: {
      user_id: "u_ad_01",
      display_name: "Alex (admin)",
      email: "admin@fake.gtfactory",
      role: "admin",
    },
    viewer: {
      user_id: "u_vw_01",
      display_name: "Guest (viewer)",
      email: "viewer@fake.gtfactory",
      role: "viewer",
    },
  };
  const payload = JSON.stringify(sessions[role]);
  await page.addInitScript((value: string) => {
    window.localStorage.setItem("gt.fakeauth.v1", value);
  }, payload);
}

/**
 * Set the review-mode forced screen state via localStorage before the app
 * boots, so the app's ReviewModeProvider picks it up on first render.
 */
export async function setReviewForcedState(
  page: Page,
  state:
    | "empty"
    | "loading"
    | "validation_error"
    | "submission_pending"
    | "success"
    | "approval_required"
    | "stale_conflict"
    | null
): Promise<void> {
  const payload = JSON.stringify({
    open: false,
    forcedScreenState: state,
    fixtureSet: "default",
  });
  await page.addInitScript((value: string) => {
    window.localStorage.setItem("gt.reviewmode.v1", value);
  }, payload);
}

/** Wipe IndexedDB so each test starts against a freshly seeded store. */
export async function resetIdb(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // This runs early on the next navigation.
    try {
      const req = indexedDB.deleteDatabase("gt-factory-os-portal");
      req.onerror = () => undefined;
    } catch {
      // ignore — first-ever load has no DB.
    }
  });
}

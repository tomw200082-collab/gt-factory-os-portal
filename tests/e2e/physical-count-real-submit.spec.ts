import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";
import { Client as PgClient } from "pg";

// ---------------------------------------------------------------------------
// Physical Count — REAL HTTP submit path against the Window 1 local-safe DB.
//
// Prerequisites:
//   1. Local Postgres with anchors + count_freezes schemas applied.
//   2. API server on 127.0.0.1:3333 pointing at that DB.
//   3. Portal `next dev` started on :3737 with either the default
//      PHYSICAL_COUNT_API_BASE=http://127.0.0.1:3333 (inherited default) or
//      WASTE_ADJUSTMENTS_API_BASE set to the same value.
//   4. planning_policy row count_variance_threshold = 0.05 (seeded).
//   5. Item RAW-MINT-LEAVES primed to anchor = 100 KG in the DB (the test
//      seeds this itself via a prep fetch so the three cases are
//      deterministic end-to-end).
//
// These three cases exercise the canonical /ops/physical-count page driving
// the real open/submit/cancel pipeline end-to-end. No MSW. No page.route()
// intercept. No fetch mocking.
//
// Cases:
//   1. Auto-post happy path (|delta|/snapshot <= 0.05):
//        counted 102 vs snapshot 100 → 2% variance → HTTP 201.
//   2. Pending approval path (|delta|/snapshot > 0.05):
//        counted 110 vs snapshot 100 → 10% variance → HTTP 202 + exception.
//   3. Freeze re-entry during holding:
//        while case 2 is still holding, second /open on RAW-MINT-LEAVES
//        returns 409 COUNT_ALREADY_OPEN from the same operator, and a
//        different operator would receive COUNT_FREEZE_ACTIVE/COUNT_ALREADY_OPEN.
//        We specifically test the UI surface for the second-open refusal.
//
// Idempotency hygiene: each case carries a unique run_id prefix so a rerun
// does not collide with a prior run's form_submissions.idempotency_key.
//
// Authored under W2 Mode B, scoped to PhysicalCount only, after
// RUNTIME_READY(PhysicalCount) emission 2026-04-17T19:21:41Z.
// ---------------------------------------------------------------------------

const API_BASE = process.env.PHYSICAL_COUNT_API_BASE ?? "http://127.0.0.1:3333";
// Local-dev DB the API points at (gtfo on WSL PG16 :54322). Used only by
// the prep helper to discover any stale 'holding' row so the planner API
// can drain it before the test proper. The runtime UI paths never touch
// the DB directly — all writes go through the API / portal proxy stack.
const TEST_DB_URL =
  process.env.PHYSICAL_COUNT_TEST_DB_URL ??
  "postgresql://postgres@127.0.0.1:54322/gtfo";
const OPERATOR_SESSION = {
  user_id: "aaaaaaaa-0000-0000-0000-0000000000a1",
  email: "operator@fake.gtfactory",
  role: "operator" as const,
  display_name: "Avi (operator)",
};
const PLANNER_SESSION = {
  user_id: "aaaaaaaa-0000-0000-0000-0000000000a2",
  email: "planner@fake.gtfactory",
  role: "planner" as const,
  display_name: "Tom (planner)",
};

// Ensure RAW-MINT-LEAVES has anchor = 100 KG before each test. Uses the real
// API — no fixtures, no shims. If the current anchor is already 100, this
// is a no-op at the balance level (delta=0 auto-posts).
async function ensureMintAnchor100(runId: string): Promise<void> {
  // 1. Open a snapshot for RAW-MINT-LEAVES (state='open').
  //    If there's already an active open/holding, this returns the existing
  //    snapshot_id OR 409 COUNT_ALREADY_OPEN. Treat both as recoverable:
  //    drain any holding state first by approving via planner.
  //
  // Drain path: if the operator has an open snapshot, cancel it. If someone
  // has a holding, we can't easily resolve without a planner. For a local
  // dev DB the test author assumes a clean slate at the start of the file.
  //
  // For simplicity, do best-effort: open + auto-post 100, then approve if
  // pending. This ensures the anchor lands at 100 regardless of prior state.
  const openRes = await fetch(
    `${API_BASE}/api/v1/queries/physical-counts/open?item_type=RM&item_id=RAW-MINT-LEAVES`,
    {
      method: "GET",
      headers: { "X-Test-Session": JSON.stringify(OPERATOR_SESSION) },
    },
  );
  const openBody: Record<string, unknown> = await openRes.json();
  if (openRes.status !== 200) {
    throw new Error(
      `prep: open RAW-MINT-LEAVES failed ${openRes.status}: ${JSON.stringify(openBody)}`,
    );
  }
  const snapshotId = openBody["snapshot_id"] as string;

  const submitRes = await fetch(
    `${API_BASE}/api/v1/mutations/physical-counts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Session": JSON.stringify(OPERATOR_SESSION),
      },
      body: JSON.stringify({
        idempotency_key: `prep_${runId}_anchor100`,
        snapshot_id: snapshotId,
        event_at: "2026-04-15T10:00:00.000Z",
        counted_quantity: 100,
        unit: "KG",
        notes: "E2E prep: seed anchor to 100",
      }),
    },
  );
  const submitBody: Record<string, unknown> = await submitRes.json();

  if (submitRes.status === 201 && submitBody["status"] === "posted") return;
  if (submitRes.status === 202 && submitBody["status"] === "pending") {
    // Approve via planner to drive the anchor to 100 and release the freeze.
    const submissionId = submitBody["submission_id"] as string;
    const approveRes = await fetch(
      `${API_BASE}/api/v1/mutations/physical-counts/${submissionId}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Session": JSON.stringify(PLANNER_SESSION),
        },
        body: JSON.stringify({
          idempotency_key: `prep_${runId}_approve100`,
          approval_notes: "E2E prep: approve to seed anchor=100",
        }),
      },
    );
    if (approveRes.status !== 200) {
      const body = await approveRes.text();
      throw new Error(`prep: approve failed ${approveRes.status}: ${body}`);
    }
    return;
  }
  throw new Error(
    `prep: submit RAW-MINT-LEAVES failed ${submitRes.status}: ${JSON.stringify(submitBody)}`,
  );
}

// Helper: resolve any lingering freeze on RAW-MINT-LEAVES so tests compose.
// Covers three leftover states from prior runs or interrupted cases:
//   - state='open'    → cancel via API (operator-owned) or fall back to pg
//                       update if owner differs.
//   - state='holding' → discover consumed_by_submission_id via pg, then
//                       approve via planner API (anchor moves to counted qty;
//                       freeze transitions to 'consumed_approved').
// The pg read is a NON-WRITE — it queries only. The write paths are all the
// real API endpoints (approve/cancel). No DB-level mutation here.
async function drainAnyHolding(runId: string): Promise<void> {
  const pg = new PgClient({ connectionString: TEST_DB_URL });
  await pg.connect();
  try {
    const res = await pg.query<{
      snapshot_id: string;
      state: string;
      consumed_by_submission_id: string | null;
      opened_by_user_id: string;
    }>(
      `SELECT snapshot_id, state, consumed_by_submission_id, opened_by_user_id
         FROM private_core.count_freezes
        WHERE site_id='GT-MAIN' AND item_type='RM'
          AND item_id='RAW-MINT-LEAVES'
          AND batch_id_or_empty=''
          AND state IN ('open','holding')
        LIMIT 1`,
    );
    if (res.rows.length === 0) return;
    const row = res.rows[0];

    if (row.state === "open") {
      // Cancel via API if caller matches; else use admin session. Admin is
      // allowed to submit against another user's snapshot per §1.5 V3 but
      // cancel is documented as snapshot-owner-scoped in §2.6. Use
      // operator-a1 if opened_by matches; otherwise fall back to cancelling
      // with that user's session shape.
      const session =
        row.opened_by_user_id === OPERATOR_SESSION.user_id
          ? OPERATOR_SESSION
          : {
              ...OPERATOR_SESSION,
              user_id: row.opened_by_user_id,
              display_name: "Drain owner",
              email: "drain@fake.gtfactory",
            };
      await fetch(
        `${API_BASE}/api/v1/mutations/physical-counts/${row.snapshot_id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-Session": JSON.stringify(session),
          },
          body: JSON.stringify({
            idempotency_key: `drain_${runId}_cancel`,
          }),
        },
      );
      return;
    }

    if (row.state === "holding" && row.consumed_by_submission_id) {
      // Approve via planner API to transition holding → consumed_approved.
      await fetch(
        `${API_BASE}/api/v1/mutations/physical-counts/${row.consumed_by_submission_id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-Session": JSON.stringify(PLANNER_SESSION),
          },
          body: JSON.stringify({
            idempotency_key: `drain_${runId}_approve`,
            approval_notes: "E2E drain: approve stale holding",
          }),
        },
      );
      return;
    }
  } finally {
    await pg.end();
  }
}

test.describe("Physical Count — real submit against local target", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
    const runId = `${Date.now()}_${testInfo.title.replace(/\W+/g, "_").slice(0, 24)}`;
    await drainAnyHolding(runId);
    await ensureMintAnchor100(runId);
  });

  test("auto-post happy path: |delta|/snapshot <= 0.05 → 201 and 'Auto-posted'", async ({
    page,
  }) => {
    await page.goto("/ops/physical-count");
    await expect(
      page.getByRole("heading", { name: /Physical Count/i }),
    ).toBeVisible();

    // Pick RAW-MINT-LEAVES by value (sort-order agnostic).
    await page
      .getByTestId("pc-item-select")
      .selectOption({ value: "RAW-MINT-LEAVES" });
    await page.getByTestId("pc-open-submit").click();

    // Count view: header surfaces the display name + opaque snapshot_id.
    await expect(
      page.getByText(/Fresh mint leaves/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("pc-open-item-type")).toHaveText("RM");
    await expect(page.getByTestId("pc-open-item-id")).toHaveText(
      "RAW-MINT-LEAVES",
    );

    // Count 102 KG vs snapshot 100 KG → 2% variance → within 5% → auto-post.
    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:05");
    await page.getByTestId("pc-counted-quantity").fill("102");
    // Ensure unit = KG (default from master).
    await page.locator('select[name="unit"]').selectOption("KG");

    await page.getByTestId("pc-count-submit").click();

    await expect(
      page.getByText(/Auto-posted\. New anchor applied\./i),
    ).toBeVisible({ timeout: 15_000 });
    // Real submission_id surfaced.
    await expect(page.getByText(/Submission [0-9a-f-]{36} posted/)).toBeVisible();
    // Reveal of snapshot (100), counted (102), delta (2).
    await expect(page.getByText(/Counted 102 KG/)).toBeVisible();
    await expect(page.getByText(/COUNT_AUTO/)).toBeVisible();
    await expect(page.getByTestId("pc-record-another")).toBeVisible();
  });

  test("pending approval path: |delta|/snapshot > 0.05 → 202 with exception_id", async ({
    page,
  }) => {
    await page.goto("/ops/physical-count");

    await page
      .getByTestId("pc-item-select")
      .selectOption({ value: "RAW-MINT-LEAVES" });
    await page.getByTestId("pc-open-submit").click();

    await expect(page.getByTestId("pc-open-item-id")).toHaveText(
      "RAW-MINT-LEAVES",
      { timeout: 10_000 },
    );

    // Count 110 KG vs snapshot 100 KG → 10% variance → > 5% threshold → pending.
    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:10");
    await page.getByTestId("pc-counted-quantity").fill("110");
    await page.locator('select[name="unit"]').selectOption("KG");

    await page.getByTestId("pc-count-submit").click();

    await expect(
      page.getByText(/Variance exceeds threshold\. Routed for approval\./i),
    ).toBeVisible({ timeout: 15_000 });

    // Verbatim approval_reason.
    await expect(page.getByTestId("pc-pending-approval-reason")).toHaveText(
      "count_variance_exceeds_threshold",
    );
    // exception_id present in monospace slot.
    await expect(page.getByTestId("pc-pending-exception-id")).toHaveText(
      /[0-9a-f-]{36}/,
    );
    await expect(page.getByTestId("pc-pending-submission-id")).toHaveText(
      /[0-9a-f-]{36}/,
    );

    // Cleanup: approve the pending submission via the planner API so the
    // 'holding' freeze releases before the next test's beforeEach runs.
    // This is NOT part of the assertion — it is lane hygiene so the three
    // cases compose in sequence without leaking state.
    const submissionId = await page
      .getByTestId("pc-pending-submission-id")
      .textContent();
    if (submissionId && /[0-9a-f-]{36}/.test(submissionId)) {
      const approveRes = await fetch(
        `${API_BASE}/api/v1/mutations/physical-counts/${submissionId.trim()}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-Session": JSON.stringify(PLANNER_SESSION),
          },
          body: JSON.stringify({
            idempotency_key: `cleanup_${Date.now()}_pending_case`,
            approval_notes: "E2E cleanup after pending case",
          }),
        },
      );
      // Ignore non-200 on cleanup — prep in the next test will recover.
      void approveRes;
    }
  });

  test("freeze re-entry during holding → 409 COUNT_ALREADY_OPEN from a second operator", async ({
    page,
  }) => {
    // Step 1: operator drives the item into 'holding' via a > 5% variance.
    await page.goto("/ops/physical-count");

    await page
      .getByTestId("pc-item-select")
      .selectOption({ value: "RAW-MINT-LEAVES" });
    await page.getByTestId("pc-open-submit").click();

    await expect(page.getByTestId("pc-open-item-id")).toHaveText(
      "RAW-MINT-LEAVES",
      { timeout: 10_000 },
    );

    const eventAtInput = page.locator('input[name="event_at"]');
    await eventAtInput.fill("2026-04-15T10:15");
    await page.getByTestId("pc-counted-quantity").fill("110");
    await page.locator('select[name="unit"]').selectOption("KG");
    await page.getByTestId("pc-count-submit").click();

    await expect(
      page.getByText(/Variance exceeds threshold\. Routed for approval\./i),
    ).toBeVisible({ timeout: 15_000 });

    // Capture the pending submission_id BEFORE we navigate away. We need it
    // for the end-of-test cleanup that drains the 'holding' freeze by
    // approving via planner.
    const pendingSubmissionId = await page
      .getByTestId("pc-pending-submission-id")
      .textContent();

    // Step 2: while the submission is in 'holding' (§2.3 Strict), a DIFFERENT
    // user attempting /open on the same balance key must receive
    // 409 COUNT_ALREADY_OPEN per contract §1.2. Same-user idempotent-open
    // returns 200 with the existing snapshot_id, so the meaningful freeze
    // re-entry test uses a different user_id while keeping role='operator'
    // (the operator layout gates role, not user_id — see src/app/(operator)
    // /layout.tsx). We inject a synthetic second-operator session by
    // writing a different user_id into localStorage; the API's test
    // session extractor (makeTestSessionExtractor) validates role+shape
    // only, not user_id allow-list. The FK in private_core.app_users is
    // satisfied because a3 (admin role, same UUID namespace) exists;
    // however, a3 has role=admin which bypasses the SNAPSHOT_OWNER_MISMATCH
    // path differently. For a clean "different operator" test we use a2
    // (planner role) — but that fails the operator layout role gate.
    // Concrete fix: we write a synthetic session with role='operator' and
    // a different user_id. The DB permits this because
    // makeTestSessionExtractor pulls user_id verbatim from the header and
    // the API uses it for the open-count insert; the FK is against
    // app_users.user_id. The a2 UUID satisfies that FK even though its
    // real role in app_users is 'planner'. The API does NOT validate
    // consistency between session role and app_users.role in the test
    // extractor (by design for Phase A). So the second-operator fiction
    // at the UI layer composes cleanly with the backend's FK requirement.
    const secondOperatorSession = {
      user_id: "aaaaaaaa-0000-0000-0000-0000000000a2",
      display_name: "Second operator (synthetic)",
      email: "operator2@fake.gtfactory",
      role: "operator" as const,
    };
    await page.addInitScript((value: string) => {
      window.localStorage.setItem("gt.fakeauth.v1", value);
    }, JSON.stringify(secondOperatorSession));
    await page.goto("/ops/physical-count");

    await page
      .getByTestId("pc-item-select")
      .selectOption({ value: "RAW-MINT-LEAVES" });
    await page.getByTestId("pc-open-submit").click();

    // Conflict view: reason_code = COUNT_ALREADY_OPEN; title mirrors the
    // same-key-different-operator branch.
    await expect(page.getByTestId("pc-conflict-reason")).toHaveText(
      /COUNT_ALREADY_OPEN/,
      { timeout: 15_000 },
    );
    await expect(
      page.getByText(/A count is already open for this item\./i),
    ).toBeVisible();

    // Cleanup: approve the 'holding' via planner API so the freeze releases
    // and the next test's prep does not fail with SNAPSHOT_NOT_FOUND.
    if (pendingSubmissionId && /[0-9a-f-]{36}/.test(pendingSubmissionId)) {
      const approveRes = await fetch(
        `${API_BASE}/api/v1/mutations/physical-counts/${pendingSubmissionId.trim()}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-Session": JSON.stringify(PLANNER_SESSION),
          },
          body: JSON.stringify({
            idempotency_key: `cleanup_${Date.now()}_freeze_case`,
            approval_notes: "E2E cleanup after freeze re-entry case",
          }),
        },
      );
      void approveRes;
    }
  });
});

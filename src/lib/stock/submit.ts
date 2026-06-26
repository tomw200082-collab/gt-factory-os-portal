// ---------------------------------------------------------------------------
// Stock-event submission — the one deep entry point every operator stock form
// posts through (goods receipt / waste-adjustment / physical-count / production
// actual share this skeleton).
//
// It hides the obscure, easy-to-get-wrong parts each form used to re-implement:
//   - the fetch + JSON-safe parse (`res.json().catch(() => null)`),
//   - the {posted | pending | rejected | network} status discrimination,
//   - the portal_ux_standard.md §1 rule: never surface raw JSON to an operator —
//     only a server-provided *string* message may reach the UI.
//
// Callers keep their own page-specific copy and post-submit state; they no
// longer re-derive the transport skeleton or the §1 extraction. The §1 rule for
// error text now lives in exactly one place (`extractServerMessage`).
// ---------------------------------------------------------------------------

/** Minimum shape every stock-submit endpoint returns on a 2xx envelope. */
export interface StockSubmitBody {
  status?: string;
  submission_id?: string;
  idempotent_replay?: boolean;
}

/**
 * Discriminated result of a stock-event POST. The four variants map 1:1 to the
 * four code paths every operator form used to hand-write (posted / pending /
 * non-2xx-or-unparseable / fetch-threw), so callers switch instead of branching
 * on raw response internals.
 *
 * `TBody` lets a caller read its own success fields (e.g. `computed_delta`) off
 * `body` with full typing on the posted/pending variants.
 */
export type StockSubmitResult<TBody extends StockSubmitBody = StockSubmitBody> =
  | {
      kind: "posted";
      submissionId: string | undefined;
      idempotentReplay: boolean;
      body: TBody;
    }
  | { kind: "pending"; submissionId: string | undefined; body: TBody }
  | {
      // Server responded, but the envelope was neither posted nor pending
      // (validation reject, non-2xx, or unparseable body). `body` + `status`
      // are exposed for callers with richer error copy (e.g. friendlyCountError);
      // `serverMessage` is the §1-safe string for callers that want a plain one.
      kind: "rejected";
      status: number;
      body: unknown;
      serverMessage: string | undefined;
    }
  | { kind: "network"; error: unknown };

/**
 * §1-safe extraction: return a server-provided message ONLY if it is a plain
 * string. Never returns the raw object — that is the rule this module exists to
 * make impossible to forget.
 */
function extractServerMessage(body: unknown): string | undefined {
  const message =
    body && typeof body === "object"
      ? ((body as { message?: unknown; error?: unknown }).message ??
        (body as { error?: unknown }).error)
      : null;
  return typeof message === "string" ? message : undefined;
}

/**
 * POST a stock-event envelope and classify the outcome. Never throws — a
 * network/parse failure comes back as `{ kind: "network" }`, never an exception
 * the caller must wrap.
 */
export async function submitStockEvent<TBody extends StockSubmitBody = StockSubmitBody>(
  url: string,
  envelope: unknown,
): Promise<StockSubmitResult<TBody>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
  } catch (error) {
    return { kind: "network", error };
  }

  const body = (await res.json().catch(() => null)) as TBody | null;

  if (body && body.status === "posted") {
    return {
      kind: "posted",
      submissionId: body.submission_id,
      idempotentReplay: body.idempotent_replay === true,
      body,
    };
  }
  if (body && body.status === "pending") {
    return { kind: "pending", submissionId: body.submission_id, body };
  }
  return {
    kind: "rejected",
    status: res.status,
    body,
    serverMessage: extractServerMessage(body),
  };
}

// What the Users page knows about passwords on its own: the validation rules
// it mirrors from the API, and how it words a failure the API sends back.
//
// ---------------------------------------------------------------------------
// Part 1 — validation, mirrored from AdminSetPasswordSchema on the API
// (gt-factory-os/api/src/users/schemas.ts).
//
// This exists so an admin typing a password in the Users page gets the answer
// while typing instead of after a round-trip. The API remains the authority —
// these rules only save a request that was going to be refused anyway, and
// they must not be loosened independently of the schema they mirror.
//
// Bounds rationale (kept in sync with the API): 6 is Supabase Auth's own
// default minimum; 72 is bcrypt's input ceiling, past which extra bytes are
// ignored and the stored display value would stop matching what actually
// authenticates. Surrounding whitespace is refused rather than trimmed —
// silently altering a credential is how "the password I set doesn't work"
// bugs happen.

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 72;

/** null when the value is acceptable; otherwise the message to show. */
export function localPasswordError(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `At least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `At most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (value !== value.trim()) return "Cannot start or end with a space.";
  return null;
}

// ---------------------------------------------------------------------------
// Part 2 — wording a failure the API sends back.
//
// The API's `detail` is written for whoever is reading a log: on
// NOT_CONFIGURED it names the environment variables that are absent. That
// string reached this page verbatim and an admin was shown
// "(SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD_DISPLAY_KEY missing)" while
// trying to give a warehouse operator a password — a sentence that is both
// unactionable for them and, because they cannot tell a missing variable from
// a stale deployment, actively misleading about what to do next.
//
// So: reason codes the admin can act on get operator wording here. Everything
// else keeps the server's own text, which for REJECTED_BY_AUTH is exactly
// right ("Password is known to be weak", "Password is too short") and for
// anything unforeseen is better than a shrug.
// ---------------------------------------------------------------------------

export interface PasswordOpFailure {
  reason_code?: string;
  detail?: string;
  error?: string;
  validation_errors?: { message: string }[];
}

export function passwordOpErrorMessage(
  data: PasswordOpFailure | null | undefined,
  fallback: string,
): string {
  if (data?.reason_code === "NOT_CONFIGURED") {
    // Deliberately says nothing about which secret: from here the two causes
    // are indistinguishable, and "ask for a redeploy" is the right next step
    // for both. The precise diagnosis stays in the server log where it helps.
    return "Passwords can't be set right now — the server needs its API redeployed. Nothing to fix on this page; ask for a deploy and try again.";
  }
  return (
    data?.validation_errors?.[0]?.message ??
    data?.detail ??
    data?.error ??
    fallback
  );
}

// Client-side mirror of AdminSetPasswordSchema on the API
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

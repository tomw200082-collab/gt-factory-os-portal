/** Keep post-login destinations on this origin, including the lead query. */
export function safeRedirectTarget(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") ||
      raw.includes("\\") || /[\x00-\x1f\x7f]/.test(raw) ||
      /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) {
    return "/apps";
  }
  return raw;
}

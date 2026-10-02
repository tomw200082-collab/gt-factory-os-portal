// The sales screens a person has walked through in this tab, so "back" can go
// where they came from rather than to a fixed list (UX gate FLOW-B-002/004).
// Module state on purpose: it lives exactly as long as the client-side app.

let current: string | null = null;
let previous: string | null = null;

export function noteSalesPath(path: string): void {
  if (path === current) return;
  previous = current;
  current = path;
}

/** True when `path` was reached from another sales screen in this tab. A child's
 *  effect runs before the shell notes the new path, so both orders are read. */
export function cameFromSalesScreen(path: string): boolean {
  return current === path ? previous !== null : current !== null;
}

export function resetSalesPathsForTest(): void {
  current = null;
  previous = null;
}

// ---------------------------------------------------------------------------
// Shared authed JSON GET. One place decides how the portal reads a JSON
// endpoint and what an operator sees when a read fails — replacing the
// per-page copies of this exact helper.
//
// Throws an operator-facing Error on a non-2xx response (TanStack Query surfaces
// `error.message` directly), and returns the parsed body typed as T on success.
// ---------------------------------------------------------------------------

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

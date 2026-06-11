// ---------------------------------------------------------------------------
// /exceptions — legacy route, rehomed in Tranche B of
// portal-full-production-refactor (plan §D). The live triage surface is now
// /inbox; this file redirects to preserve the /exceptions bookmark.
//
// Server-component redirect — renders nothing client-side.
//
// Tranche 041 — forward a deep-linked ?id= so /exceptions?id=<exception_id>
// bookmarks land on the right inbox row instead of dropping the param.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default async function ExceptionsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}): Promise<never> {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : undefined;
  redirect(
    id
      ? `/inbox?view=exceptions&id=${encodeURIComponent(id)}`
      : "/inbox?view=exceptions",
  );
}
